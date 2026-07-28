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
}