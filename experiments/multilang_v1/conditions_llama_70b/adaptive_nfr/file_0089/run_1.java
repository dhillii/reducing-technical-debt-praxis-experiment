public class S3AFileSystem extends FileSystem {
  // ...

  public boolean rename(Path src, Path dst) throws IOException {
    if (isSameFile(src, dst)) {
      return true;
    }

    if (isDirectory(src) && isFile(dst)) {
      return false;
    }

    if (isFile(src) && isDirectory(dst)) {
      return false;
    }

    if (isDirectory(src) && isDirectory(dst)) {
      return renameDirectory(src, dst);
    }

    return renameFile(src, dst);
  }

  private boolean isSameFile(Path src, Path dst) {
    String srcKey = pathToKey(src);
    String dstKey = pathToKey(dst);
    return srcKey.equals(dstKey);
  }

  private boolean isDirectory(Path path) {
    try {
      S3AFileStatus status = getFileStatus(path);
      return status.isDirectory();
    } catch (FileNotFoundException e) {
      return false;
    } catch (IOException e) {
      throw new RuntimeException(e);
    }
  }

  private boolean isFile(Path path) {
    try {
      S3AFileStatus status = getFileStatus(path);
      return status.isFile();
    } catch (FileNotFoundException e) {
      return false;
    } catch (IOException e) {
      throw new RuntimeException(e);
    }
  }

  private boolean renameDirectory(Path src, Path dst) throws IOException {
    String srcKey = pathToKey(src);
    String dstKey = pathToKey(dst);

    if (dstKey.startsWith(srcKey)) {
      return false;
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

    return true;
  }

  private boolean renameFile(Path src, Path dst) throws IOException {
    String srcKey = pathToKey(src);
    String dstKey = pathToKey(dst);

    copyFile(srcKey, dstKey);
    delete(src, false);
    return true;
  }

  // ...

  public boolean delete(Path f, boolean recursive) throws IOException {
    if (isDirectory(f) && !recursive) {
      throw new IOException("Path is a folder: " + f + " and it is not an empty directory");
    }

    if (isDirectory(f)) {
      return deleteDirectory(f);
    }

    return deleteFile(f);
  }

  private boolean deleteDirectory(Path f) throws IOException {
    String key = pathToKey(f);

    if (!key.endsWith("/")) {
      key = key + "/";
    }

    if (key.equals("/")) {
      LOG.info("s3a cannot delete the root directory");
      return false;
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

    return true;
  }

  private boolean deleteFile(Path f) throws IOException {
    String key = pathToKey(f);
    s3.deleteObject(bucket, key);
    statistics.incrementWriteOps(1);
    return true;
  }

  // ...
}