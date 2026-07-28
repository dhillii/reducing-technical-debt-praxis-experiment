public class S3AFileSystem extends FileSystem {
  // ...

  public boolean rename(Path src, Path dst) throws IOException {
    if (isRenameInvalid(src, dst)) {
      return false;
    }

    if (isSrcAndDstSame(src, dst)) {
      return true;
    }

    if (isDstParentInvalid(src, dst)) {
      return false;
    }

    if (isSrcFile(src)) {
      renameFile(src, dst);
    } else {
      renameDirectory(src, dst);
    }

    createFakeDirectoryIfNecessary(src.getParent());
    createFakeDirectoryIfNecessary(dst.getParent());

    return true;
  }

  private boolean isRenameInvalid(Path src, Path dst) {
    String srcKey = pathToKey(src);
    String dstKey = pathToKey(dst);
    return srcKey.isEmpty() || dstKey.isEmpty();
  }

  private boolean isSrcAndDstSame(Path src, Path dst) {
    String srcKey = pathToKey(src);
    String dstKey = pathToKey(dst);
    return srcKey.equals(dstKey);
  }

  private boolean isDstParentInvalid(Path src, Path dst) {
    S3AFileStatus dstStatus;
    try {
      dstStatus = getFileStatus(dst);
    } catch (FileNotFoundException e) {
      Path parent = dst.getParent();
      if (!pathToKey(parent).isEmpty()) {
        try {
          S3AFileStatus dstParentStatus = getFileStatus(dst.getParent());
          if (!dstParentStatus.isDirectory()) {
            return true;
          }
        } catch (FileNotFoundException e2) {
          return true;
        }
      }
      return false;
    }

    if (dstStatus.isDirectory() && !dstStatus.isEmptyDirectory()) {
      return true;
    }

    return false;
  }

  private void renameFile(Path src, Path dst) throws IOException {
    String srcKey = pathToKey(src);
    String dstKey = pathToKey(dst);
    copyFile(srcKey, dstKey);
    delete(src, false);
  }

  private void renameDirectory(Path src, Path dst) throws IOException {
    String srcKey = pathToKey(src);
    String dstKey = pathToKey(dst);

    if (!dstKey.endsWith("/")) {
      dstKey = dstKey + "/";
    }

    if (!srcKey.endsWith("/")) {
      srcKey = srcKey + "/";
    }

    List<DeleteObjectsRequest.KeyVersion> keysToDelete = new ArrayList<>();
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
          DeleteObjectsRequest deleteRequest = new DeleteObjectsRequest(bucket).withKeys(keysToDelete);
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
          DeleteObjectsRequest deleteRequest = new DeleteObjectsRequest(bucket).withKeys(keysToDelete);
          s3.deleteObjects(deleteRequest);
          statistics.incrementWriteOps(1);
        }
        break;
      }
    }
  }

  // ...

  public boolean delete(Path f, boolean recursive) throws IOException {
    if (isDeleteInvalid(f, recursive)) {
      return false;
    }

    if (isFile(f)) {
      deleteFile(f);
    } else {
      deleteDirectory(f, recursive);
    }

    createFakeDirectoryIfNecessary(f.getParent());
    return true;
  }

  private boolean isDeleteInvalid(Path f, boolean recursive) {
    S3AFileStatus status;
    try {
      status = getFileStatus(f);
    } catch (FileNotFoundException e) {
      return false;
    }

    if (status.isDirectory() && !recursive && !status.isEmptyDirectory()) {
      throw new IOException("Path is a folder: " + f + " and it is not an empty directory");
    }

    return false;
  }

  private boolean isFile(Path f) {
    S3AFileStatus status;
    try {
      status = getFileStatus(f);
    } catch (FileNotFoundException e) {
      return false;
    }

    return !status.isDirectory();
  }

  private void deleteFile(Path f) throws IOException {
    String key = pathToKey(f);
    s3.deleteObject(bucket, key);
    statistics.incrementWriteOps(1);
  }

  private void deleteDirectory(Path f, boolean recursive) throws IOException {
    String key = pathToKey(f);
    if (!key.endsWith("/")) {
      key = key + "/";
    }

    if (key.equals("/")) {
      LOG.info("s3a cannot delete the root directory");
      return;
    }

    ListObjectsRequest request = new ListObjectsRequest();
    request.setBucketName(bucket);
    request.setPrefix(key);
    request.setMaxKeys(maxKeys);

    List<DeleteObjectsRequest.KeyVersion> keys = new ArrayList<>();
    ObjectListing objects = s3.listObjects(request);
    statistics.incrementReadOps(1);

    while (true) {
      for (S3ObjectSummary summary : objects.getObjectSummaries()) {
        keys.add(new DeleteObjectsRequest.KeyVersion(summary.getKey()));
        if (keys.size() == MAX_ENTRIES_TO_DELETE) {
          DeleteObjectsRequest deleteRequest = new DeleteObjectsRequest(bucket).withKeys(keys);
          s3.deleteObjects(deleteRequest);
          statistics.incrementWriteOps(1);
          keys.clear();
        }
      }

      if (objects.isTruncated()) {
        objects = s3.listNextBatchOfObjects(objects);
        statistics.incrementReadOps(1);
      } else {
        if (!keys.isEmpty()) {
          DeleteObjectsRequest deleteRequest = new DeleteObjectsRequest(bucket).withKeys(keys);
          s3.deleteObjects(deleteRequest);
          statistics.incrementWriteOps(1);
        }
        break;
      }
    }
  }

  // ...
}