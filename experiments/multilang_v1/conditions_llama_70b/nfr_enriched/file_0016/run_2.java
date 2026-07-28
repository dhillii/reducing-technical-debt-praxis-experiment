public final class NotationUtilityUml {
    // Existing code...

    /**
     * The constructor.
     */
    public NotationUtilityUml() {
        // Empty constructor, no action required
    }

    // Existing code...

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

        // Set visibility and name
        setVisibilityAndName(me, name);

        // Deal with stereotypes
        StereotypeUtility.dealWithStereotypes(me, stereotype, false);

        // Add owned element to namespace
        addOwnedElementToNamespace(me, path);
    }

    private static List<String> extractPath(String text) {
        // Implementation of path extraction
        List<String> path = null;
        String token;
        MyTokenizer st = new MyTokenizer(text, "<<,\u00AB,\u00BB,>>,::");
        while (st.hasMoreTokens()) {
            token = st.nextToken();
            if ("::".equals(token)) {
                if (path == null) {
                    path = new ArrayList<String>();
                }
                // Add name to path if it exists
                // ...
            }
        }
        return path;
    }

    private static String extractName(String text) {
        // Implementation of name extraction
        String name = null;
        String token;
        MyTokenizer st = new MyTokenizer(text, "<<,\u00AB,\u00BB,>>,::");
        while (st.hasMoreTokens()) {
            token = st.nextToken();
            if (!"<<".equals(token) && !">>".equals(token) && !"\u00AB".equals(token)
                    && !"\u00BB".equals(token) && !"::".equals(token)) {
                name = token;
            }
        }
        return name;
    }

    private static StringBuilder extractStereotype(String text) {
        // Implementation of stereotype extraction
        StringBuilder stereotype = null;
        String token;
        MyTokenizer st = new MyTokenizer(text, "<<,\u00AB,\u00BB,>>,::");
        while (st.hasMoreTokens()) {
            token = st.nextToken();
            if ("<<".equals(token) || "\u00AB".equals(token)) {
                stereotype = new StringBuilder();
                while (true) {
                    token = st.nextToken();
                    if (">>".equals(token) || "\u00BB".equals(token)) {
                        break;
                    }
                    stereotype.append(token);
                }
            }
        }
        return stereotype;
    }

    private static void setVisibilityAndName(Object me, String name) {
        // Implementation of setting visibility and name
        if (name != null && name.startsWith("+")) {
            Model.getCoreHelper().setVisibility(me,
                    Model.getVisibilityKind().getPublic());
        }
        // ...
    }

    private static void addOwnedElementToNamespace(Object me, List<String> path) {
        // Implementation of adding owned element to namespace
        Object nspe = Model.getModelManagementHelper().getElement(
                path,
                Model.getFacade().getRoot(me));
        if (nspe != null && Model.getFacade().isANamespace(nspe)) {
            Model.getCoreHelper().addOwnedElement(nspe, me);
        }
    }

    // Existing code...

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
        // Extracted into separate methods for better readability
        return isKeyPresentInMap(key, map) && isValueTrue(key, map);
    }

    private static boolean isKeyPresentInMap(String key, Map map) {
        return map != null && map.containsKey(key);
    }

    private static boolean isValueTrue(String key, Map map) {
        Object o = map.get(key);
        return o instanceof Boolean && ((Boolean) o).booleanValue();
    }

    // Existing code...

    /**
     * Returns a visibility String either for a VisibilityKind or a model
     * element.
     * 
     * @param o a modelelement or a visibilitykind
     * @return a string. May be the empty string, but guaranteed not to be null
     */
    public static String generateVisibility2(Object o) {
        // Extracted into separate methods for better readability
        if (Model.getFacade().isANamedElement(o)) {
            return generateVisibilityForNamedElement(o);
        } else if (Model.getFacade().isAVisibilityKind(o)) {
            return generateVisibilityForVisibilityKind(o);
        }
        return "";
    }

    private static String generateVisibilityForNamedElement(Object o) {
        // Implementation of generating visibility for named element
        if (Model.getFacade().isPublic(o)) {
            return "+";
        }
        // ...
    }

    private static String generateVisibilityForVisibilityKind(Object o) {
        // Implementation of generating visibility for visibility kind
        if (Model.getVisibilityKind().getPublic().equals(o)) {
            return "+";
        }
        // ...
    }

    // Existing code...
}