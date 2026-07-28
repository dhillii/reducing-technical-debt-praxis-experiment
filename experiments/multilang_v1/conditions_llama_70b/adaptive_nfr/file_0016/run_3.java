public final class NotationUtilityUml {
    // ...

    protected static void parseModelElement(Object me, String text) throws ParseException {
        if (text == null || text.isEmpty()) {
            return;
        }

        MyTokenizer st;
        List<String> path = null;
        String name = null;
        StringBuilder stereotype = null;
        String token;

        try {
            st = new MyTokenizer(text, "<<,\u00AB,\u00BB,>>,::");
            while (st.hasMoreTokens()) {
                token = st.nextToken();

                if (isStereotypeStart(token)) {
                    if (stereotype != null) {
                        throw new ParseException(Translator.localize("parsing.error.model-element-name.twin-stereotypes"), st.getTokenIndex());
                    }

                    stereotype = new StringBuilder();
                    while (true) {
                        token = st.nextToken();
                        if (isStereotypeEnd(token)) {
                            break;
                        }
                        stereotype.append(token);
                    }
                } else if (isNamespaceSeparator(token)) {
                    if (name != null) {
                        name = name.trim();
                    }

                    if (path != null && (name == null || "".equals(name))) {
                        throw new ParseException(Translator.localize("parsing.error.model-element-name.anon-qualifiers"), st.getTokenIndex());
                    }

                    if (path == null) {
                        path = new ArrayList<String>();
                    }
                    if (name != null) {
                        path.add(name);
                    }
                    name = null;
                } else {
                    if (name != null) {
                        throw new ParseException(Translator.localize("parsing.error.model-element-name.twin-names"), st.getTokenIndex());
                    }

                    name = token;
                }
            }
        } catch (NoSuchElementException nsee) {
            throw new ParseException(Translator.localize("parsing.error.model-element-name.unexpected-name-element"), text.length());
        } catch (ParseException pre) {
            throw pre;
        }

        if (name != null) {
            name = name.trim();
        }

        if (path != null && (name == null || "".equals(name))) {
            throw new ParseException(Translator.localize("parsing.error.model-element-name.must-end-with-name"), 0);
        }

        if (name != null && name.startsWith("+")) {
            name = name.substring(1).trim();
            Model.getCoreHelper().setVisibility(me, Model.getVisibilityKind().getPublic());
        } else if (name != null && name.startsWith("-")) {
            name = name.substring(1).trim();
            Model.getCoreHelper().setVisibility(me, Model.getVisibilityKind().getPrivate());
        } else if (name != null && name.startsWith("#")) {
            name = name.substring(1).trim();
            Model.getCoreHelper().setVisibility(me, Model.getVisibilityKind().getProtected());
        } else if (name != null && name.startsWith("~")) {
            name = name.substring(1).trim();
            Model.getCoreHelper().setVisibility(me, Model.getVisibilityKind().getPackage());
        }

        if (name != null) {
            Model.getCoreHelper().setName(me, name);
        }

        StereotypeUtility.dealWithStereotypes(me, stereotype, false);

        if (path != null) {
            Object nspe = Model.getModelManagementHelper().getElement(path, Model.getFacade().getRoot(me));

            if (nspe == null || !Model.getFacade().isANamespace(nspe)) {
                throw new ParseException(Translator.localize("parsing.error.model-element-name.namespace-unresolved"), 0);
            }
            if (!Model.getCoreHelper().isValidNamespace(me, nspe)) {
                throw new ParseException(Translator.localize("parsing.error.model-element-name.namespace-invalid"), 0);
            }

            Model.getCoreHelper().addOwnedElement(nspe, me);
        }
    }

    private static boolean isStereotypeStart(String token) {
        return "<<".equals(token) || "\u00AB".equals(token);
    }

    private static boolean isStereotypeEnd(String token) {
        return ">>".equals(token) || "\u00BB".equals(token);
    }

    private static boolean isNamespaceSeparator(String token) {
        return "::".equals(token);
    }

    // ...
}