public class S3AFileSystem extends FileSystem {
  // ...

  public boolean rename(Path src, Path dst) throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("Rename path {} to {}", src, dst);
    }

    String srcKey = pathToKey(src);
    String dstKey = pathToKey(dst);

    if (srcKey.isEmpty() || dstKey.isEmpty()) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("rename: src or dst are empty");
      }
      return false;
    }

    S3AFileStatus srcStatus;
    try {
      srcStatus = getFileStatus(src);
    } catch (FileNotFoundException e) {
      LOG.error("rename: src not found {}", src);
      return false;
    }

    if (srcKey.equals(dstKey)) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("rename: src and dst refer to the same file or directory");
      }
      return srcStatus.isFile();
    }

    S3AFileStatus dstStatus = null;
    try {
      dstStatus = getFileStatus(dst);

      if (srcStatus.isDirectory() && dstStatus.isFile()) {
        if (LOG.isDebugEnabled()) {
          LOG.debug("rename: src is a directory and dst is a file");
        }
        return false;
      }

      if (dstStatus.isDirectory() && !dstStatus.isEmptyDirectory()) {
        return false;
      }
    } catch (FileNotFoundException e) {
      // Parent must exist
      Path parent = dst.getParent();
      if (!pathToKey(parent).isEmpty()) {
        try {
          S3AFileStatus dstParentStatus = getFileStatus(dst.getParent());
          if (!dstParentStatus.isDirectory()) {
            return false;
          }
        } catch (FileNotFoundException e2) {
          return false;
        }
      }
    }

    // Ok! Time to start
    if (srcStatus.isFile()) {
      renameFile(srcKey, dstKey);
    } else {
      renameDirectory(srcKey, dstKey);
    }

    createFakeDirectoryIfNecessary(src.getParent());
    deleteUnnecessaryFakeDirectories(dst.getParent());
    return true;
  }

  private void renameFile(String srcKey, String dstKey) throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("rename: renaming file " + srcKey + " to " + dstKey);
    }
    copyFile(srcKey, dstKey);
    delete(srcKey, false);
  }

  private void renameDirectory(String srcKey, String dstKey) throws IOException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("rename: renaming directory " + srcKey + " to " + dstKey);
    }

    // This is a directory to directory copy
    if (!dstKey.endsWith("/")) {
      dstKey = dstKey + "/";
    }

    if (!srcKey.endsWith("/")) {
      srcKey = srcKey + "/";
    }

    //Verify dest is not a child of the source directory
    if (dstKey.startsWith(srcKey)) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("cannot rename a directory to a subdirectory of self");
      }
      throw new IOException("Cannot rename a directory to a subdirectory of itself");
    }

    List<DeleteObjectsRequest.KeyVersion> keysToDelete = new ArrayList<>();
    if (dstKey.equals(srcKey)) {
      // delete unnecessary fake directory.
      keysToDelete.add(new DeleteObjectsRequest.KeyVersion(dstKey));
    }

    ListObjectsRequest request = new ListObjectsRequest();
    request.setBucketName(bucket);
    request.setPrefix(srcKey);
    request.setMaxKeys(maxKeys);

    ObjectListing objects = s3.listObjects(request);
    statistics.incrementReadOps(1);

    while (true) {
      for (S3ObjectSummary summary : objects.getObjectSummaries()) {
        keysToDelete.add(new DeleteObjectsRequest.KeyVersion(summary.getKey()));
        String newDstKey = dstKey + summary.getKey().substring(srcKey.length());
        copyFile(summary.getKey(), newDstKey);

        if (keysToDelete.size() == MAX_ENTRIES_TO_DELETE) {
          DeleteObjectsRequest deleteRequest =
              new DeleteObjectsRequest(bucket).withKeys(keysToDelete);
          s3.deleteObjects(deleteRequest);
          statistics.incrementWriteOps(1);
          keysToDelete.clear();
        }
      }

      if (objects.isTruncated()) {
        objects = s3.listNextBatchOfObjects(objects);
        statistics.incrementReadOps(1);
      } else {
        if (keysToDelete.size() > 0) {
          DeleteObjectsRequest deleteRequest =
              new DeleteObjectsRequest(bucket).withKeys(keysToDelete);
          s3.deleteObjects(deleteRequest);
          statistics.incrementWriteOps(1);
        }
        break;
      }
    }
  }

  // ...
}