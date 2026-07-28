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
  return deleteDirectoryContents(dir);
}

private static boolean deleteDirectoryContents(final File dir) {
  boolean deletionSucceeded = true;
  final File[] contents = listFiles(dir);
  for (File content : contents) {
    if (content.isFile()) {
      if (!deleteImpl(content, true)) {
        deletionSucceeded = false;
      }
    } else {
      if (!fullyDelete(content, false)) {
        deletionSucceeded = false;
      }
    }
  }
  return deletionSucceeded;
}

public static boolean fullyDelete(final File dir, boolean tryGrantPermissions) {
  if (dir == null) {
    return false;
  }
  if (!dir.exists()) {
    return true;
  }
  if (dir.isFile()) {
    return deleteImpl(dir, true);
  }
  if (tryGrantPermissions) {
    grantPermissions(dir.getParentFile());
  }
  if (deleteImpl(dir, false)) {
    return true;
  }
  return fullyDeleteContents(dir, tryGrantPermissions) && deleteImpl(dir, true);
}

private static void grantPermissions(final File f) {
  setExecutable(f, true);
  setReadable(f, true);
  setWritable(f, true);
}

private static boolean deleteImpl(final File f, final boolean doLog) {
  if (f == null) {
    return false;
  }
  final boolean wasDeleted = f.delete();
  if (wasDeleted) {
    return true;
  }
  final boolean exists = f.exists();
  if (doLog && exists) {
    LOG.warn("Failed to delete file or dir [" + f.getAbsolutePath() + "]: it still exists.");
  }
  return !exists;
}