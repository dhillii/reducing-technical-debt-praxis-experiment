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
        root = path.substring(0, colon + 1) + sep;
        path = path.substring(colon + 1);
        // remove the initial separator; the root has it.
        if (path.length() > 0 && path.charAt(0) == sep) {
            path = path.substring(1);
        }
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
    return new String[] {root, path};
}