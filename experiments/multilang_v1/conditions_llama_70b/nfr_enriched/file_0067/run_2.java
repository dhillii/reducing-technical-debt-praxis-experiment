public static boolean fullyDeleteContents(final File dir, final boolean tryGrantPermissions) {
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
  if (tryGrantPermissions) {
    File parent = dir.getParentFile();
    grantPermissions(parent);
  }
  if (deleteImpl(dir, false)) {
    return true;
  }
  if (!fullyDeleteContents(dir, tryGrantPermissions)) {
    return false;
  }
  return deleteImpl(dir, true);
}

private static void grantPermissions(final File f) {
  setExecutable(f, true);
  setReadable(f, true);
  setWritable(f, true);
}