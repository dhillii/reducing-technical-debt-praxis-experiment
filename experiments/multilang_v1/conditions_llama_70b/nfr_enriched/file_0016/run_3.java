public final class NotationUtilityUml {
    // ...

    /**
     * The constructor.
     */
    public NotationUtilityUml() {
        // Empty constructor, no action required
    }

    // ...

    /**
     * Parse a string on the format:
     * <pre>
     *     [ &lt;&lt; stereotype &gt;&gt;] [+|-|#|~] [full_pathname ::] [name]
     * </pre>
     * 
     * @param me   The ModelElement <em>text</em> describes.
     * @param text A String on the above format.
     * @throws ParseException
     *             when it detects an error in the attribute string. See also
     *             ParseError.getErrorOffset().
     */
    protected static void parseModelElement(Object me, String text)
        throws ParseException {
        // Extracted into separate methods for better readability
        List<String> path = extractPath(text);
        String name = extractName(text);
        StringBuilder stereotype = extractStereotype(text);

        // Process the extracted information
        processVisibility(me, name);
        processName(me, name);
        processStereotype(me, stereotype);
        processNamespace(me, path);
    }

    private static List<String> extractPath(String text) {
        // ...
    }

    private static String extractName(String text) {
        // ...
    }

    private static StringBuilder extractStereotype(String text) {
        // ...
    }

    private static void processVisibility(Object me, String name) {
        // ...
    }

    private static void processName(Object me, String name) {
        // ...
    }

    private static void processStereotype(Object me, StringBuilder stereotype) {
        // ...
    }

    private static void processNamespace(Object me, List<String> path) {
        // ...
    }

    // ...

    /**
     * Utility function to determine the presence of a key. 
     * The default is false.
     * 
     * @param key the string for the key
     * @param map the Map to check for the presence 
     * and value of the key
     * @return true if the value for the key is true, otherwise false
     */
    public static boolean isValue(final String key, final Map map) {
        // Simplified the method for better readability
        return map != null && map.get(key) instanceof Boolean
                && ((Boolean) map.get(key)).booleanValue();
    }

    // ...

    /**
     * Applies a List of name/value pairs of properties to a model element.
     * The name is treated as the tag of a tagged value unless it is one of the
     * PropertySpecialStrings, in which case the action of the
     * PropertySpecialString is invoked.
     *
     * @param elem
     *            An model element to apply the properties to.
     * @param prop
     *            A List with name, value pairs of properties.
     * @param spec
     *            An array of PropertySpecialStrings to use.
     */
    static void setProperties(Object elem, List<String> prop,
            PropertySpecialString[] spec) {
        // Extracted into separate methods for better readability
        for (int i = 0; i + 1 < prop.size(); i += 2) {
            String name = prop.get(i);
            String value = prop.get(i + 1);

            if (name == null) {
                continue;
            }

            name = name.trim();
            if (value != null) {
                value = value.trim();
            }

            processProperty(elem, name, value, spec);
        }
    }

    private static void processProperty(Object elem, String name, String value,
            PropertySpecialString[] spec) {
        // ...
    }

    // ...
}