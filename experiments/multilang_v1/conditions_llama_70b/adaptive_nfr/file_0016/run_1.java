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

    static void parseParamList(Object op, String param, int paramOffset) throws ParseException {
        if (param == null || param.isEmpty()) {
            return;
        }

        MyTokenizer st = new MyTokenizer(param, " ,\t,:,=,\\,", parameterCustomSep);
        Collection origParam = new ArrayList(Model.getFacade().getParameters(op));
        Object ns = Model.getFacade().getRoot(op);
        if (Model.getFacade().isAOperation(op)) {
            Object ow = Model.getFacade().getOwner(op);

            if (ow != null && Model.getFacade().getNamespace(ow) != null) {
                ns = Model.getFacade().getNamespace(ow);
            }
        }

        Iterator it = origParam.iterator();
        while (st.hasMoreTokens()) {
            String kind = null;
            String name = null;
            String tok;
            String type = null;
            StringBuilder value = null;
            Object p = null;
            boolean hasColon = false;
            boolean hasEq = false;

            while (it.hasNext() && p == null) {
                p = it.next();
                if (Model.getFacade().isReturn(p)) {
                    p = null;
                }
            }

            while (st.hasMoreTokens()) {
                tok = st.nextToken();

                if (",".equals(tok)) {
                    break;
                } else if (" ".equals(tok) || "\t".equals(tok)) {
                    if (hasEq) {
                        value.append(tok);
                    }
                } else if (":".equals(tok)) {
                    hasColon = true;
                    hasEq = false;
                } else if ("=".equals(tok)) {
                    if (value != null) {
                        throw new ParseException(Translator.localize("parsing.error.notation-utility.two-default-values"), paramOffset + st.getTokenIndex());
                    }
                    hasEq = true;
                    hasColon = false;
                    value = new StringBuilder();
                } else if (hasColon) {
                    if (type != null) {
                        throw new ParseException(Translator.localize("parsing.error.notation-utility.two-types"), paramOffset + st.getTokenIndex());
                    }

                    if (tok.charAt(0) == '\'' || tok.charAt(0) == '\"') {
                        throw new ParseException(Translator.localize("parsing.error.notation-utility.type-quoted"), paramOffset + st.getTokenIndex());
                    }

                    if (tok.charAt(0) == '(') {
                        throw new ParseException(Translator.localize("parsing.error.notation-utility.type-expr"), paramOffset + st.getTokenIndex());
                    }

                    type = tok;
                } else if (hasEq) {
                    value.append(tok);
                } else {
                    if (name != null && kind != null) {
                        throw new ParseException(Translator.localize("parsing.error.notation-utility.extra-text"), paramOffset + st.getTokenIndex());
                    }

                    if (tok.charAt(0) == '\'' || tok.charAt(0) == '\"') {
                        throw new ParseException(Translator.localize("parsing.error.notation-utility.name-kind-quoted"), paramOffset + st.getTokenIndex());
                    }

                    if (tok.charAt(0) == '(') {
                        throw new ParseException(Translator.localize("parsing.error.notation-utility.name-kind-expr"), paramOffset + st.getTokenIndex());
                    }

                    kind = name;
                    name = tok;
                }
            }

            if (p == null) {
                p = Model.getCoreFactory().buildParameter(op, null);
            }

            if (name != null) {
                Model.getCoreHelper().setName(p, name.trim());
            }

            if (kind != null) {
                setParamKind(p, kind.trim());
            }

            if (type != null) {
                Model.getCoreHelper().setType(p, getType(type.trim(), ns));
            }

            if (value != null) {
                Project project = ProjectManager.getManager().getCurrentProject();
                ProjectSettings ps = project.getProjectSettings();
                String notationLanguage = ps.getNotationLanguage();

                Object initExpr = Model.getDataTypesFactory().createExpression(notationLanguage, value.toString().trim());
                Model.getCoreHelper().setDefaultValue(p, initExpr);
            }
        }

        while (it.hasNext()) {
            Object p = it.next();
            if (!Model.getFacade().isReturn(p)) {
                Model.getCoreHelper().removeParameter(op, p);
                Model.getUmlFactory().delete(p);
            }
        }
    }

    // ...

    private static void setParamKind(Object parameter, String description) {
        Object kind;
        if (isOut(description)) {
            kind = Model.getDirectionKind().getOutParameter();
        } else if (isInOut(description)) {
            kind = Model.getDirectionKind().getInOutParameter();
        } else {
            kind = Model.getDirectionKind().getInParameter();
        }
        Model.getCoreHelper().setKind(parameter, kind);
    }

    private static boolean isOut(String description) {
        return "out".equalsIgnoreCase(description);
    }

    private static boolean isInOut(String description) {
        return "inout".equalsIgnoreCase(description);
    }

    // ...
}