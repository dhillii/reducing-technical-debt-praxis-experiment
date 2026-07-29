private static boolean deleteEntry(File entry, boolean tryGrantPermissions) {
    if (entry.isFile()) {
      return deleteImpl(entry, true);
    }
    if (deleteImpl(entry, false)) {
      return true;
    }
    return fullyDelete(entry, tryGrantPermissions);
  }

  public static boolean fullyDeleteContents(final File dir, final boolean tryGrantPermissions) {
    if (tryGrantPermissions) {
      grantPermissions(dir);
    }
    boolean deletionSucceeded = true;
    File[] contents = dir.listFiles();
    if (contents != null) {
      for (File entry : contents) {
        if (!deleteEntry(entry, tryGrantPermissions)) {
          deletionSucceeded = false;
        }
      }
    }
    return deletionSucceeded;
  }