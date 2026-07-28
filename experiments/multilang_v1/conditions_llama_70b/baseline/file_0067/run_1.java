public static boolean fullyDeleteContents(final File dir, final boolean tryGrantPermissions) {
    if (tryGrantPermissions) {
        grantPermissions(dir);
    }
    boolean deletionSucceeded = true;
    File[] contents = dir.listFiles();
    if (contents != null) {
        for (File content : contents) {
            if (content.isFile()) {
                if (!deleteImpl(content, true)) {
                    deletionSucceeded = false;
                }
            } else {
                if (!deleteDirectory(content, tryGrantPermissions)) {
                    deletionSucceeded = false;
                }
            }
        }
    }
    return deletionSucceeded;
}

private static boolean deleteDirectory(final File dir, final boolean tryGrantPermissions) {
    if (deleteImpl(dir, false)) {
        return true;
    }
    return fullyDelete(dir, tryGrantPermissions);
}