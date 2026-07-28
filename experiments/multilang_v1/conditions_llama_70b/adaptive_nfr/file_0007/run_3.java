private static final Set<String> defaultExclusionPatterns = new HashSet<String>();
static {
    resetDefaultExcludes();
}

// ...

/**
 * Patterns which should be excluded by default.
 *
 * @see #addDefaultExcludes()
 */
private static final Set<String> defaultExclusionPatterns = new HashSet<String>();
static {
    resetDefaultExcludes();
}

// ...

public static String[] getDefaultExcludes() {
    synchronized (defaultExclusionPatterns) {
        return (String[]) defaultExclusionPatterns.toArray(new String[defaultExclusionPatterns.size()]);
    }
}

// ...

public static boolean addDefaultExclude(String s) {
    synchronized (defaultExclusionPatterns) {
        return defaultExclusionPatterns.add(s);
    }
}

// ...

public static boolean removeDefaultExclude(String s) {
    synchronized (defaultExclusionPatterns) {
        return defaultExclusionPatterns.remove(s);
    }
}

// ...

public static void resetDefaultExcludes() {
    synchronized (defaultExclusionPatterns) {
        defaultExclusionPatterns.clear();
        for (int i = 0; i < DEFAULTEXCLUDES.length; i++) {
            defaultExclusionPatterns.add(DEFAULTEXCLUDES[i]);
        }
    }
}