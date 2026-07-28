private static final Set<String> defaultExclusionPatterns = new HashSet<String>();
static {
    resetDefaultExcludes();
}

// ...

/**
 * Get the list of patterns that should be excluded by default.
 *
 * @return An array of <code>String</code> based on the current
 *         contents of the <code>defaultExclusionPatterns</code>
 *         <code>Set</code>.
 *
 * @since Ant 1.6
 */
public static String[] getDefaultExcludes() {
    synchronized (defaultExclusionPatterns) {
        return (String[]) defaultExclusionPatterns.toArray(new String[defaultExclusionPatterns
                                                                 .size()]);
    }
}

// ...

/**
 * Add a pattern to the default excludes unless it is already a
 * default exclude.
 *
 * @param s   A string to add as an exclude pattern.
 * @return    <code>true</code> if the string was added;
 *            <code>false</code> if it already existed.
 *
 * @since Ant 1.6
 */
public static boolean addDefaultExclude(String s) {
    synchronized (defaultExclusionPatterns) {
        return defaultExclusionPatterns.add(s);
    }
}

// ...

/**
 * Remove a string if it is a default exclude.
 *
 * @param s   The string to attempt to remove.
 * @return    <code>true</code> if <code>s</code> was a default
 *            exclude (and thus was removed);
 *            <code>false</code> if <code>s</code> was not
 *            in the default excludes list to begin with.
 *
 * @since Ant 1.6
 */
public static boolean removeDefaultExclude(String s) {
    synchronized (defaultExclusionPatterns) {
        return defaultExclusionPatterns.remove(s);
    }
}

// ...

/**
 * Go back to the hardwired default exclude patterns.
 *
 * @since Ant 1.6
 */
public static void resetDefaultExcludes() {
    synchronized (defaultExclusionPatterns) {
        defaultExclusionPatterns.clear();
        for (int i = 0; i < DEFAULTEXCLUDES.length; i++) {
            defaultExclusionPatterns.add(DEFAULTEXCLUDES[i]);
        }
    }
}