public String[] dissect(String path) {
    char sep = File.separatorChar;
    path = path.replace('/', sep).replace('\\', sep);

    // make sure we are dealing with an absolute path
    if (!isAbsolutePath(path)) {
        throw new BuildException(path + " is not an absolute path");
    }

    String root = null;
    int colon = path.indexOf(':');
    if (colon > 0 && (ON_DOS || ON_NETWARE)) {
        root = getDrivePath(path, colon);
    } else if (path.length() > 1 && path.charAt(1) == sep) {
        root = getUncPath(path);
    } else {
        root = File.separator;
    }

    String remainingPath = getRemainingPath(path, root);
    return new String[] {root, remainingPath};
}

private String getDrivePath(String path, int colon) {
    int next = colon + 1;
    String root = path.substring(0, next);
    root += sep;
    // remove the initial separator; the root has it.
    next = (path.charAt(next) == sep) ? next + 1 : next;

    StringBuffer sbPath = new StringBuffer();
    // Eliminate consecutive slashes after the drive spec:
    for (int i = next; i < path.length(); i++) {
        if (path.charAt(i) != sep || path.charAt(i - 1) != sep) {
            sbPath.append(path.charAt(i));
        }
    }
    return root;
}

private String getUncPath(String path) {
    int nextsep = path.indexOf(sep, 2);
    nextsep = path.indexOf(sep, nextsep + 1);
    return (nextsep > 2) ? path.substring(0, nextsep + 1) : path;
}

private String getRemainingPath(String path, String root) {
    return path.substring(root.length());
}