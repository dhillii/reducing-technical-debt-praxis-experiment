public String[] dissect(String path) {
    if (path == null) {
        throw new NullPointerException("Path is null");
    }
    char sep = File.separatorChar;
    path = path.replace('/', sep).replace('\\', sep);

    if (!isAbsolutePath(path)) {
        throw new BuildException(path + " is not an absolute path");
    }

    String root = null;
    int colon = path.indexOf(':');
    if (colon > 0 && (ON_DOS || ON_NETWARE)) {
        int next = colon + 1;
        root = path.substring(0, next);
        char[] ca = path.toCharArray();
        root += sep;
        next = (ca[next] == sep) ? next + 1 : next;

        StringBuffer sbPath = new StringBuffer();
        for (int i = next; i < ca.length; i++) {
            if (ca[i] != sep || ca[i - 1] != sep) {
                sbPath.append(ca[i]);
            }
        }
        path = sbPath.toString();
    } else if (path.length() > 1 && path.charAt(1) == sep) {
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