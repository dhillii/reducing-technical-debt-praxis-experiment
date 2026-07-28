public String[] dissect(String path) {
    // Normalize the path to use the system's file separator
    char sep = File.separatorChar;
    path = path.replace('/', sep).replace('\\', sep);

    // Check if the path is absolute
    if (!isAbsolutePath(path)) {
        throw new BuildException(path + " is not an absolute path");
    }

    // Extract the root of the path
    String root = getRoot(path);

    // Remove the root from the path
    String remainingPath = getRemainingPath(path, root);

    return new String[] {root, remainingPath};
}

/**
 * Extracts the root of a path.
 * 
 * @param path the path to extract the root from
 * @return the root of the path
 */
private String getRoot(String path) {
    int colon = path.indexOf(':');
    if (colon > 0 && (ON_DOS || ON_NETWARE)) {
        int next = colon + 1;
        String root = path.substring(0, next);
        root += sep;
        return root;
    } else if (path.length() > 1 && path.charAt(1) == sep) {
        // UNC drive
        int nextsep = path.indexOf(sep, 2);
        nextsep = path.indexOf(sep, nextsep + 1);
        return (nextsep > 2) ? path.substring(0, nextsep + 1) : path;
    } else {
        return File.separator;
    }
}

/**
 * Removes the root from a path.
 * 
 * @param path the path to remove the root from
 * @param root the root to remove
 * @return the path with the root removed
 */
private String getRemainingPath(String path, String root) {
    if (root.equals(File.separator)) {
        return path.substring(1);
    } else {
        return path.substring(root.length());
    }
}