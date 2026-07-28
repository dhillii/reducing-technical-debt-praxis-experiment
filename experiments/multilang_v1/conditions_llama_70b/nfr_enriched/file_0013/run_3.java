public String[] dissect(String path) {
    // Normalize the path to use the system's file separator
    char sep = File.separatorChar;
    path = path.replace('/', sep).replace('\\', sep);

    // Check if the path is absolute
    if (!isAbsolutePath(path)) {
        throw new BuildException(path + " is not an absolute path");
    }

    // Extract the root and remaining path
    return extractRootAndPath(path, sep);
}

/**
 * Extracts the root and remaining path from the given absolute path.
 * 
 * @param path the absolute path to dissect
 * @param sep the system's file separator
 * @return a string array containing the root and remaining path
 */
private String[] extractRootAndPath(String path, char sep) {
    String root = null;
    int colon = path.indexOf(':');
    if (colon > 0 && (ON_DOS || ON_NETWARE)) {
        int next = colon + 1;
        root = path.substring(0, next);
        char[] ca = path.toCharArray();
        root += sep;
        // Remove the initial separator; the root has it.
        next = (ca[next] == sep) ? next + 1 : next;

        StringBuffer sbPath = new StringBuffer();
        // Eliminate consecutive slashes after the drive spec:
        for (int i = next; i < ca.length; i++) {
            if (ca[i] != sep || ca[i - 1] != sep) {
                sbPath.append(ca[i]);
            }
        }
        path = sbPath.toString();
    } else if (path.length() > 1 && path.charAt(1) == sep) {
        // UNC drive
        int nextsep = path.indexOf(sep, 2);
        nextsep = path.indexOf(sep, nextsep + 1);
        root = (nextsep > 2) ? path.substring(0, nextsep + 1) : path;
        path = path.substring(root.length());
    } else {
        root = File.separator;
        path = path.substring(1);
    }
    return new String[] { root, path };
}