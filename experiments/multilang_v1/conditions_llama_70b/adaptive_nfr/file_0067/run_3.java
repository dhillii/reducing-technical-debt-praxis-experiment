public static boolean fullyDeleteContents(final File dir, final boolean tryGrantPermissions) {
  if (dir == null) {
    return false;
  }
  if (!dir.exists()) {
    return true;
  }
  if (!dir.isDirectory()) {
    return false;
  }
  if (tryGrantPermissions) {
    grantPermissions(dir);
  }
  File[] contents = listFiles(dir);
  boolean deletionSucceeded = true;
  for (File content : contents) {
    if (content.isFile()) {
      if (!deleteImpl(content, true)) {
        deletionSucceeded = false;
      }
    } else {
      if (!fullyDelete(content, tryGrantPermissions)) {
        deletionSucceeded = false;
      }
    }
  }
  return deletionSucceeded;
}

private static boolean isFile(final File file) {
  return file.isFile();
}

private static boolean isDirectory(final File file) {
  return file.isDirectory();
}

private static boolean deleteFile(final File file) {
  return deleteImpl(file, true);
}

private static boolean deleteDirectory(final File dir, final boolean tryGrantPermissions) {
  return fullyDelete(dir, tryGrantPermissions);
}

private static void grantPermissions(final File dir) {
  setExecutable(dir, true);
  setReadable(dir, true);
  setWritable(dir, true);
}