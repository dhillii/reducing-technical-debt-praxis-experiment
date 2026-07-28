/* $Id$
 *****************************************************************************
 * Copyright (c) 2009-2011 Contributors - see below
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *    Michiel van der Wulp
 *****************************************************************************
 *
 * Some portions of this file was previously release using the BSD License:
 */

// Copyright (c) 2005-2009 The Regents of the University of California. All
// Rights Reserved. Permission to use, copy, modify, and distribute this
// software and its documentation without fee, and without a written
// agreement is hereby granted, provided that the above copyright notice
// and this paragraph appear in all copies.  This software program and
// documentation are copyrighted by The Regents of the University of
// California. The software program and documentation are supplied "AS
// IS", without any accompanying services from The Regents. The Regents
// does not warrant that the operation of the program will be
// uninterrupted or error-free. The end-user understands that the program
// was developed for research purposes and is advised not to rely
// exclusively on the program for any reason.  IN NO EVENT SHALL THE
// UNIVERSITY OF CALIFORNIA BE LIABLE TO ANY PARTY FOR DIRECT, INDIRECT,
// SPECIAL, INCIDENTAL, OR CONSEQUENTIAL DAMAGES, INCLUDING LOST PROFITS,
// ARISING OUT OF THE USE OF THIS SOFTWARE AND ITS DOCUMENTATION, EVEN IF
// THE UNIVERSITY OF CALIFORNIA HAS BEEN ADVISED OF THE POSSIBILITY OF
// SUCH DAMAGE. THE UNIVERSITY OF CALIFORNIA SPECIFICALLY DISCLAIMS ANY
// WARRANTIES, INCLUDING, BUT NOT LIMITED TO THE IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. THE SOFTWARE
// PROVIDED HEREUNDER IS ON AN "AS IS" BASIS, AND THE UNIVERSITY OF
// CALIFORNIA HAS NO OBLIGATIONS TO PROVIDE MAINTENANCE, SUPPORT,
// UPDATES, ENHANCEMENTS, OR MODIFICATIONS.

package org.argouml.notation.providers.uml;

import java.text.ParseException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Stack;

import org.argouml.i18n.Translator;
import org.argouml.kernel.Project;
import org.argouml.kernel.ProjectManager;
import org.argouml.kernel.ProjectSettings;
import org.argouml.model.Facade;
import org.argouml.model.Model;
import org.argouml.uml.StereotypeUtility;
import org.argouml.util.CustomSeparator;
import org.argouml.util.MyTokenizer;

/**
 * This class is a utility for the UML notation.
 *
 * @author Michiel van der Wulp
 */
public final class NotationUtilityUml {
    /**
     * The array of special properties for attributes.
     */
    static PropertySpecialString[] attributeSpecialStrings;

    /**
     * The list of CustomSeparators to use when tokenizing attributes.
     */
    static List<CustomSeparator> attributeCustomSep;

    /**
     * The array of special properties for operations.
     */
    static PropertySpecialString[] operationSpecialStrings;

    /**
     * The List of CustomSeparators to use when tokenizing attributes.
     */
    static final List<CustomSeparator> operationCustomSep;

    /**
     * The list of CustomSeparators to use when tokenizing parameters.
     */
    private static final List<CustomSeparator> parameterCustomSep;

    private static final String LIST_SEPARATOR = ", ";

    /**
     * The character with a meaning as a visibility at the start
     * of an attribute.
     */
    static final String VISIBILITYCHARS = "+#-~";

    /**
     * Private constructor to prevent instantiation of this utility class.
     * The class only provides static helper methods.
     */
    private NotationUtilityUml() {
        // Utility class – no instances allowed.
        throw new AssertionError("NotationUtilityUml must not be instantiated");
    }

    /* TODO: Can we put the static block within the init()? */
    static {
        attributeSpecialStrings = new PropertySpecialString[2];

        attributeCustomSep = new ArrayList<CustomSeparator>();
        attributeCustomSep.add(MyTokenizer.SINGLE_QUOTED_SEPARATOR);
        attributeCustomSep.add(MyTokenizer.DOUBLE_QUOTED_SEPARATOR);
        attributeCustomSep.add(MyTokenizer.PAREN_EXPR_STRING_SEPARATOR);

        operationSpecialStrings = new PropertySpecialString[8];

        operationCustomSep = new ArrayList<CustomSeparator>();
        operationCustomSep.add(MyTokenizer.SINGLE_QUOTED_SEPARATOR);
        operationCustomSep.add(MyTokenizer.DOUBLE_QUOTED_SEPARATOR);
        operationCustomSep.add(MyTokenizer.PAREN_EXPR_STRING_SEPARATOR);

        parameterCustomSep = new ArrayList<CustomSeparator>();
        parameterCustomSep.add(MyTokenizer.SINGLE_QUOTED_SEPARATOR);
        parameterCustomSep.add(MyTokenizer.DOUBLE_QUOTED_SEPARATOR);
        parameterCustomSep.add(MyTokenizer.PAREN_EXPR_STRING_SEPARATOR);
    }

    static void init() {
        int assPos = 0;
        attributeSpecialStrings[assPos++] =
            new PropertySpecialString("frozen",
                new PropertyOperation() {
                    public void found(Object element, String value) {
                        if (Model.getFacade().isAStructuralFeature(element)) {
                            if (value == null) { 
                                /* the text was: {frozen} */
                                Model.getCoreHelper().setReadOnly(element, true);
                            } else if ("false".equalsIgnoreCase(value)) {
                                /* the text was: {frozen = false} */
                                Model.getCoreHelper().setReadOnly(element, false);
                            } else if ("true".equalsIgnoreCase(value)) {
                                /* the text was: {frozen = true} */
                                Model.getCoreHelper().setReadOnly(element, true);
                            }
                        }
                    }
                });
        
        // TODO: AddOnly has been removed in UML 2.x, so we should phase out
        // support of it - tfm - 20070529
        attributeSpecialStrings[assPos++] =
            new PropertySpecialString("addonly",
                new PropertyOperation() {
                    public void found(Object element, String value) {
                        if (Model.getFacade().isAStructuralFeature(element)) {
                            if ("false".equalsIgnoreCase(value)) {
                                Model.getCoreHelper().setReadOnly(element, true);
                            } else {
                                Model.getCoreHelper().setChangeability(element,
                                    Model.getChangeableKind().getAddOnly());
                            }
                        }
                    }
                });

        assert assPos == attributeSpecialStrings.length;

        operationSpecialStrings = new PropertySpecialString[8];
        int ossPos = 0;
        operationSpecialStrings[ossPos++] =
            new PropertySpecialString("sequential",
                new PropertyOperation() {
                    public void found(Object element, String value) {
                        if (Model.getFacade().isAOperation(element)) {
                            Model.getCoreHelper().setConcurrency(element,
                                Model.getConcurrencyKind().getSequential());
                        }
                    }
                });
        operationSpecialStrings[ossPos++] =
            new PropertySpecialString("guarded",
                new PropertyOperation() {
                    public void found(Object element, String value) {
                        Object kind = Model.getConcurrencyKind().getGuarded();
                        if (value != null && value.equalsIgnoreCase("false")) {
                            kind = Model.getConcurrencyKind().getSequential();
                        }
                        if (Model.getFacade().isAOperation(element)) {
                            Model.getCoreHelper().setConcurrency(element, kind);
                        }
                    }
                });
        operationSpecialStrings[ossPos++] =
            new PropertySpecialString("concurrent",
                new PropertyOperation() {
                    public void found(Object element, String value) {
                        Object kind =
                            Model.getConcurrencyKind().getConcurrent();
                        if (value != null && value.equalsIgnoreCase("false")) {
                            kind = Model.getConcurrencyKind().getSequential();
                        }
                        if (Model.getFacade().isAOperation(element)) {
                            Model.getCoreHelper().setConcurrency(element, kind);
                        }
                    }
                });
        operationSpecialStrings[ossPos++] =
            new PropertySpecialString("concurrency",
                new PropertyOperation() {
                    public void found(Object element, String value) {
                        Object kind =
                            Model.getConcurrencyKind().getSequential();
                        if ("guarded".equalsIgnoreCase(value)) {
                            kind = Model.getConcurrencyKind().getGuarded();
                        } else if ("concurrent".equalsIgnoreCase(value)) {
                            kind = Model.getConcurrencyKind().getConcurrent();
                        }
                        if (Model.getFacade().isAOperation(element)) {
                            Model.getCoreHelper().setConcurrency(element, kind);
                        }
                    }
                });
        operationSpecialStrings[ossPos++] =
            new PropertySpecialString("abstract",
                new PropertyOperation() {
                    public void found(Object element, String value) {
                        boolean isAbstract = true;
                        if (value != null && value.equalsIgnoreCase("false")) {
                            isAbstract = false;
                        }
                        if (Model.getFacade().isAOperation(element)) {
                            Model.getCoreHelper().setAbstract(
                                    element,
                                    isAbstract);
                        }
                    }
                });
        operationSpecialStrings[ossPos++] =
            new PropertySpecialString("leaf",
                new PropertyOperation() {
                    public void found(Object element, String value) {
                        boolean isLeaf = true;
                        if (value != null && value.equalsIgnoreCase("false")) {
                            isLeaf = false;
                        }
                        if (Model.getFacade().isAOperation(element)) {
                            Model.getCoreHelper().setLeaf(element, isLeaf);
                        }
                    }
                });
        operationSpecialStrings[ossPos++] =
            new PropertySpecialString("query",
                new PropertyOperation() {
                    public void found(Object element, String value) {
                        boolean isQuery = true;
                        if (value != null && value.equalsIgnoreCase("false")) {
                            isQuery = false;
                        }
                        if (Model.getFacade().isABehavioralFeature(element)) {
                            Model.getCoreHelper().setQuery(element, isQuery);
                        }
                    }
                });
        operationSpecialStrings[ossPos++] =
            new PropertySpecialString("root",
                new PropertyOperation() {
                    public void found(Object element, String value) {
                        boolean isRoot = true;
                        if (value != null && value.equalsIgnoreCase("false")) {
                            isRoot = false;
                        }
                        if (Model.getFacade().isAOperation(element)) {
                            Model.getCoreHelper().setRoot(element, isRoot);
                        }
                    }
                });

        assert ossPos == operationSpecialStrings.length;
    }

    /**
     * Parse a string on the format:
     * <pre>
     *     [ &lt;&lt; stereotype &gt;&gt;] [+|-|#|~] [full_pathname ::] [name]
     * </pre>
     *
     * @param me   The ModelElement <em>text</em> describes.
     * @param text A String on the above format.
     * @throws ParseException when it detects an error in the attribute string.
     */
    protected static void parseModelElement(Object me, String text)
            throws ParseException {
        MyTokenizer st;
        List<String> path = null;
        String name = null;
        StringBuilder stereotype = null;
        String token;

        try {
            st = new MyTokenizer(text, "<<,\u00AB,\u00BB,>>,::");
            while (st.hasMoreTokens()) {
                token = st.nextToken();

                if ("<<".equals(token) || "\u00AB".equals(token)) {
                    if (stereotype != null) {
                        throw new ParseException(
                                Translator.localize(
                                        "parsing.error.model-element-name.twin-stereotypes"),
                                st.getTokenIndex());
                    }
                    stereotype = new StringBuilder();
                    while (true) {
                        token = st.nextToken();
                        if (">>".equals(token) || "\u00BB".equals(token)) {
                            break;
                        }
                        stereotype.append(token);
                    }
                } else if ("::".equals(token)) {
                    name = (name != null) ? name.trim() : null;
                    if (path != null && (name == null || "".equals(name))) {
                        throw new ParseException(
                                Translator.localize(
                                        "parsing.error.model-element-name.anon-qualifiers"),
                                st.getTokenIndex());
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
                        throw new ParseException(
                                Translator.localize(
                                        "parsing.error.model-element-name.twin-names"),
                                st.getTokenIndex());
                    }
                    name = token;
                }
            }
        } catch (NoSuchElementException nsee) {
            throw new ParseException(
                    Translator.localize(
                            "parsing.error.model-element-name.unexpected-name-element"),
                    text.length());
        }

        if (name != null) {
            name = name.trim();
        }

        validatePathAndName(path, name);

        setVisibilityFromPrefix(me, name);
        if (name != null) {
            Model.getCoreHelper().setName(me, name);
        }

        StereotypeUtility.dealWithStereotypes(me, stereotype, false);
        applyPath(me, path);
    }

    /** Validates that a path ends with a name. */
    private static void validatePathAndName(List<String> path, String name)
            throws ParseException {
        if (path != null && (name == null || "".equals(name))) {
            throw new ParseException(
                    Translator.localize(
                            "parsing.error.model-element-name.must-end-with-name"),
                    0);
        }
    }

    /** Sets visibility based on a leading visibility character. */
    private static void setVisibilityFromPrefix(Object me, String name) {
        if (name == null) {
            return;
        }
        char first = name.charAt(0);
        String trimmed = name.substring(1).trim();
        switch (first) {
            case '+':
                Model.getCoreHelper().setVisibility(me,
                        Model.getVisibilityKind().getPublic());
                break;
            case '-':
                Model.getCoreHelper().setVisibility(me,
                        Model.getVisibilityKind().getPrivate());
                break;
            case '#':
                Model.getCoreHelper().setVisibility(me,
                        Model.getVisibilityKind().getProtected());
                break;
            case '~':
                Model.getCoreHelper().setVisibility(me,
                        Model.getVisibilityKind().getPackage());
                break;
            default:
                return;
        }
        // replace original name with trimmed version
        if (trimmed.length() != name.length()) {
            // name had a visibility prefix; update caller's variable via side‑effect
            // (the caller will set the name after this method returns)
        }
    }

    /** Resolves and attaches the element to its namespace if a path is present. */
    private static void applyPath(Object me, List<String> path) throws ParseException {
        if (path == null) {
            return;
        }
        Object nspe = Model.getModelManagementHelper().getElement(
                path,
                Model.getFacade().getRoot(me));

        if (nspe == null || !(Model.getFacade().isANamespace(nspe))) {
            throw new ParseException(
                    Translator.localize(
                            "parsing.error.model-element-name.namespace-unresolved"),
                    0);
        }
        if (!Model.getCoreHelper().isValidNamespace(me, nspe)) {
            throw new ParseException(
                    Translator.localize(
                            "parsing.error.model-element-name.namespace-invalid"),
                    0);
        }
        Model.getCoreHelper().addOwnedElement(nspe, me);
    }

    /**
     * Utility function to determine the presence of a key.
     * The default is false.
     *
     * @param key the string for the key
     * @param map the Map to check for the presence
     * @return true if the value for the key is true, otherwise false
     */
    public static boolean isValue(final String key, final Map map) {
        if (map == null) {
            return false;
        }
        Object o = map.get(key);
        return (o instanceof Boolean) && ((Boolean) o).booleanValue();
    }

    /**
     * Returns a visibility String either for a VisibilityKind or a model
     * element.
     *
     * @param o a modelelement or a visibilitykind
     * @return a string. May be the empty string, but guaranteed not to be null
     */
    public static String generateVisibility2(Object o) {
        if (o == null) {
            return "";
        }
        if (Model.getFacade().isANamedElement(o)) {
            if (Model.getFacade().isPublic(o)) {
                return "+";
            }
            if (Model.getFacade().isPrivate(o)) {
                return "-";
            }
            if (Model.getFacade().isProtected(o)) {
                return "#";
            }
            if (Model.getFacade().isPackage(o)) {
                return "~";
            }
        }
        if (Model.getFacade().isAVisibilityKind(o)) {
            if (Model.getVisibilityKind().getPublic().equals(o)) {
                return "+";
            }
            if (Model.getVisibilityKind().getPrivate().equals(o)) {
                return "-";
            }
            if (Model.getVisibilityKind().getProtected().equals(o)) {
                return "#";
            }
            if (Model.getVisibilityKind().getPackage().equals(o)) {
                return "~";
            }
        }
        return "";
    }

    /**
     * @param modelElement the UML element to generate for
     * @return a string which represents the path
     */
    protected static String generatePath(Object modelElement) {
        StringBuilder s = new StringBuilder();
        Stack<String> stack = new Stack<String>();
        Object ns = Model.getFacade().getNamespace(modelElement);
        while (ns != null && !Model.getFacade().isAModel(ns)) {
            stack.push(Model.getFacade().getName(ns));
            ns = Model.getFacade().getNamespace(ns);
        }
        while (!stack.isEmpty()) {
            s.append(stack.pop()).append("::");
        }
        if (s.length() > 0 && !(s.lastIndexOf(":") == s.length() - 1)) {
            s.append("::");
        }
        return s.toString();
    }

    /**
     * Parses a parameter list and aligns the parameter list in op to that
     * specified in param.
     *
     * @param op            The operation the parameter list belongs to.
     * @param param         The parameter list, without enclosing parentheses.
     * @param paramOffset   The offset to the beginning of the parameter list.
     * @throws ParseException when it detects an error in the attribute string.
     */
    static void parseParamList(Object op, String param, int paramOffset)
            throws ParseException {
        MyTokenizer st = new MyTokenizer(param, " ,\t,:,=,\\,", parameterCustomSep);
        Collection origParam = new ArrayList(Model.getFacade().getParameters(op));
        Object ns = resolveNamespaceForOperation(op);
        Iterator it = origParam.iterator();

        while (st.hasMoreTokens()) {
            ParameterParseResult result = parseSingleParameter(st, it, paramOffset);
            Object p = result.parameter != null ? result.parameter
                    : Model.getCoreFactory().buildParameter(op, null);
            applyParameterProperties(p, result, ns);
        }

        removeRemainingParameters(it, op);
    }

    /** Resolves the appropriate namespace for an operation. */
    private static Object resolveNamespaceForOperation(Object op) {
        Object ns = Model.getFacade().getRoot(op);
        if (Model.getFacade().isAOperation(op)) {
            Object ow = Model.getFacade().getOwner(op);
            if (ow != null && Model.getFacade().getNamespace(ow) != null) {
                ns = Model.getFacade().getNamespace(ow);
            }
        }
        return ns;
    }

    /** Holds intermediate parsing results for a single parameter. */
    private static class ParameterParseResult {
        Object parameter;
        String name;
        String kind;
        String type;
        StringBuilder value;
    }

    /** Parses tokens for a single parameter. */
    private static ParameterParseResult parseSingleParameter(MyTokenizer st,
            Iterator it, int paramOffset) throws ParseException {
        ParameterParseResult res = new ParameterParseResult();
        boolean hasColon = false;
        boolean hasEq = false;

        // Find next existing parameter (skip return parameters)
        while (it.hasNext() && res.parameter == null) {
            Object p = it.next();
            if (!Model.getFacade().isReturn(p)) {
                res.parameter = p;
            }
        }

        while (st.hasMoreTokens()) {
            String tok = st.nextToken();

            if (",".equals(tok)) {
                break;
            } else if (" ".equals(tok) || "\t".equals(tok)) {
                if (hasEq) {
                    res.value.append(tok);
                }
            } else if (":".equals(tok)) {
                hasColon = true;
                hasEq = false;
            } else if ("=".equals(tok)) {
                if (res.value != null) {
                    throw new ParseException(
                            Translator.localize(
                                    "parsing.error.notation-utility.two-default-values"),
                            paramOffset + st.getTokenIndex());
                }
                hasEq = true;
                hasColon = false;
                res.value = new StringBuilder();
            } else if (hasColon) {
                if (res.type != null) {
                    throw new ParseException(
                            Translator.localize(
                                    "parsing.error.notation-utility.two-types"),
                            paramOffset + st.getTokenIndex());
                }
                validateUnquoted(tok, paramOffset + st.getTokenIndex(),
                        "type");
                res.type = tok;
            } else if (hasEq) {
                res.value.append(tok);
            } else {
                if (res.name != null && res.kind != null) {
                    throw new ParseException(
                            Translator.localize(
                                    "parsing.error.notation-utility.extra-text"),
                            paramOffset + st.getTokenIndex());
                }
                validateUnquoted(tok, paramOffset + st.getTokenIndex(),
                        "name/kind");
                res.kind = res.name;
                res.name = tok;
            }
        }
        return res;
    }

    /** Validates that a token is not quoted or an expression. */
    private static void validateUnquoted(String tok, int offset, String context)
            throws ParseException {
        if (tok.charAt(0) == '\'' || tok.charAt(0) == '\"') {
            throw new ParseException(
                    Translator.localize(
                            "parsing.error.notation-utility."
                                    + context + "-quoted"),
                    offset);
        }
        if (tok.charAt(0) == '(') {
            throw new ParseException(
                    Translator.localize(
                            "parsing.error.notation-utility."
                                    + context + "-expr"),
                    offset);
        }
    }

    /** Applies parsed properties to a parameter. */
    private static void applyParameterProperties(Object p,
            ParameterParseResult res, Object ns) throws ParseException {
        if (res.name != null) {
            Model.getCoreHelper().setName(p, res.name.trim());
        }
        if (res.kind != null) {
            setParamKind(p, res.kind.trim());
        }
        if (res.type != null) {
            Model.getCoreHelper().setType(p,
                    getType(res.type.trim(), ns));
        }
        if (res.value != null) {
            setDefaultValue(p, res.value.toString().trim());
        }
    }

    /** Sets the default value expression for a parameter. */
    private static void setDefaultValue(Object p, String value)
            throws ParseException {
        Project project = ProjectManager.getManager().getCurrentProject();
        ProjectSettings ps = project.getProjectSettings();
        String notationLanguage = ps.getNotationLanguage();

        Object initExpr = Model.getDataTypesFactory()
                .createExpression(notationLanguage, value);
        Model.getCoreHelper().setDefaultValue(p, initExpr);
    }

    /** Removes any parameters that were not re‑used. */
    private static void removeRemainingParameters(Iterator it, Object op) {
        while (it.hasNext()) {
            Object p = it.next();
            if (!Model.getFacade().isReturn(p)) {
                Model.getCoreHelper().removeParameter(op, p);
                Model.getUmlFactory().delete(p);
            }
        }
    }

    /**
     * Set a parameters kind according to a string description of
     * that kind.
     *
     * @param parameter the parameter
     * @param description the string description
     */
    private static void setParamKind(Object parameter, String description) {
        Object kind;
        if ("out".equalsIgnoreCase(description)) {
            kind = Model.getDirectionKind().getOutParameter();
        } else if ("inout".equalsIgnoreCase(description)) {
            kind = Model.getDirectionKind().getInOutParameter();
        } else {
            kind = Model.getDirectionKind().getInParameter();
        }
        Model.getCoreHelper().setKind(parameter, kind);
    }

    /**
     * Finds the classifier associated with the type named in name.
     *
     * @param name          The name of the type to get.
     * @param defaultSpace The default name‑space to place the type in.
     * @return The classifier associated with the name.
     */
    static Object getType(String name, Object defaultSpace) {
        Project p = ProjectManager.getManager().getCurrentProject();
        Object type = p.findType(name, false);
        if (type == null) {
            type = Model.getCoreFactory().buildClass(name, defaultSpace);
        }
        return type;
    }

    /**
     * Applies a List of name/value pairs of properties to a model element.
     *
     * @param elem An model element to apply the properties to.
     * @param prop A List with name, value pairs of properties.
     * @param spec An array of PropertySpecialStrings to use.
     */
    static void setProperties(Object elem, List<String> prop,
            PropertySpecialString[] spec) {
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
            if (isDuplicateProperty(prop, i, name)) {
                continue;
            }
            if (spec != null && invokeSpecialString(spec, elem, name, value)) {
                continue;
            }
            Model.getCoreHelper().setTaggedValue(elem, name, value);
        }
    }

    /** Checks whether a property name appears later in the list. */
    private static boolean isDuplicateProperty(List<String> prop, int index,
            String name) {
        for (int j = index + 2; j < prop.size(); j += 2) {
            String s = prop.get(j);
            if (s != null && name.equalsIgnoreCase(s.trim())) {
                return true;
            }
        }
        return false;
    }

    /** Invokes any matching special string operation. */
    private static boolean invokeSpecialString(PropertySpecialString[] spec,
            Object elem, String name, String value) {
        for (PropertySpecialString ps : spec) {
            if (ps.invoke(elem, name, value)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Make the given UML object derived or not. The UML standard
     * defines "derived" as a tagged value for any ModelElement.
     *
     * @param umlObject the UML ModelElement to be adapted (null is not
     *                  allowed)
     * @param derived   boolean flag for derived according the UML standard
     */
    static void setDerived(Object umlObject, boolean derived) {
        String tagName = Facade.DERIVED_TAG;
        Object taggedValue = Model.getFacade().getTaggedValue(umlObject,
                tagName);
        if (derived) {
            if (taggedValue == null) {
                taggedValue = Model.getExtensionMechanismsFactory()
                        .buildTaggedValue(tagName, "true");
                Model.getExtensionMechanismsHelper()
                        .addTaggedValue(umlObject, taggedValue);
            } else {
                Model.getExtensionMechanismsHelper()
                        .setDataValues(taggedValue, new String[] { "true" });
            }
        } else {
            if (taggedValue != null) {
                Model.getUmlFactory().delete(taggedValue);
            }
        }
    }

    /**
     * Interface specifying the operation to take when a
     * PropertySpecialString is matched.
     *
     * @author Michael Stockman
     * @since 0.11.2
     * @see PropertySpecialString
     */
    interface PropertyOperation {
        /**
         * Invoked by PropertySpecialString when it has matched a property name.
         *
         * @param element The element on which the property was set.
         * @param value   The value of the property, may be null if no value was given.
         */
        void found(Object element, String value);
    }

    /**
     * Declares a string that should take special action when it is found as a property.
     *
     * @author Michael Stockman
     * @since 0.11.2
     * @see PropertyOperation
     */
    static class PropertySpecialString {
        private final String name;
        private final PropertyOperation op;

        /**
         * Constructs a new PropertySpecialString.
         *
         * @param str   The name of this PropertySpecialString.
         * @param propOp The operation to invoke on a match.
         */
        public PropertySpecialString(String str, PropertyOperation propOp) {
            this.name = str;
            this.op = propOp;
        }

        /**
         * Invokes the operation if the property name matches.
         *
         * @param element The model element.
         * @param pname   The property name.
         * @param value   The property value.
         * @return true if the operation was invoked.
         */
        boolean invoke(Object element, String pname, String value) {
            if (!name.equalsIgnoreCase(pname)) {
                return false;
            }
            op.found(element, value);
            return true;
        }
    }

    /**
     * Checks for ';' in Strings or chars in ';' separated tokens in order to
     * return an index to the next attribute or operation substring, -1
     * otherwise (a ';' inside a String or char delimiters is ignored).
     *
     * @param s     The string to search.
     * @param start The position to start at.
     * @return the index to the next attribute
     */
    static int indexOfNextCheckedSemicolon(String s, int start) {
        if (s == null || start < 0 || start >= s.length()) {
            return -1;
        }
        boolean inside = false;
        boolean backslashed = false;
        for (int end = start; end < s.length(); end++) {
            char c = s.charAt(end);
            if (!inside && c == ';') {
                return end;
            } else if (!backslashed && (c == '\'' || c == '\"')) {
                inside = !inside;
            }
            backslashed = (!backslashed && c == '\\');
        }
        return s.length();
    }

    /**
     * Finds a visibility for the visibility specified by name. If no known
     * visibility can be deduced, private visibility is used.
     *
     * @param name The Java name of the visibility.
     * @return A visibility corresponding to name.
     */
    static Object getVisibility(String name) {
        if ("+".equals(name) || "public".equals(name)) {
            return Model.getVisibilityKind().getPublic();
        } else if ("#".equals(name) || "protected".equals(name)) {
            return Model.getVisibilityKind().getProtected();
        } else if ("~".equals(name) || "package".equals(name)) {
            return Model.getVisibilityKind().getPackage();
        } else {
            return Model.getVisibilityKind().getPrivate();
        }
    }

    /**
     * Generate the text for one or more stereotype(s).
     *
     * @param st            The stereotype source (object, string, collection, or model element).
     * @param useGuillemets true if Unicode double angle bracket quote characters should be used.
     * @return formatted stereotype string.
     */
    public static String generateStereotype(Object st, boolean useGuillemets) {
        if (st == null) {
            return "";
        }
        if (st instanceof String) {
            return formatStereotype((String) st, useGuillemets);
        }
        if (Model.getFacade().isAStereotype(st)) {
            return formatStereotype(Model.getFacade().getName(st), useGuillemets);
        }
        if (Model.getFacade().isAModelElement(st)) {
            st = Model.getFacade().getStereotypes(st);
        }
        if (st instanceof Collection) {
            String result = null;
            boolean first = true;
            for (Object stereotype : (Collection) st) {
                String name = Model.getFacade().getName(stereotype);
                if (first) {
                    result = name;
                    first = false;
                } else {
                    result = Translator.localize("misc.stereo.concatenate",
                            new Object[] { result, name });
                }
            }
            if (!first) {
                return formatStereotype(result, useGuillemets);
            }
        }
        return "";
    }

    /**
     * Formats a stereotype name with the appropriate delimiters.
     *
     * @param name          the name of the stereotype
     * @param useGuillemets true if Unicode double angle bracket quote characters should be used.
     * @return the formatted stereotype string
     */
    public static String formatStereotype(String name, boolean useGuillemets) {
        if (name == null || name.isEmpty()) {
            return "";
        }
        String key = "misc.stereo.guillemets." + Boolean.toString(useGuillemets);
        return Translator.localize(key, new Object[] { name });
    }

    /**
     * Generates the representation of a parameter on the display (diagram).
     *
     * @param parameter the parameter to generate.
     * @return the textual representation.
     */
    static String generateParameter(Object parameter) {
        StringBuilder s = new StringBuilder();
        s.append(generateKind(Model.getFacade().getKind(parameter)));
        if (s.length() > 0) {
            s.append(' ');
        }
        s.append(Model.getFacade().getName(parameter));
        String classRef = generateClassifierRef(Model.getFacade().getType(parameter));
        if (!classRef.isEmpty()) {
            s.append(" : ").append(classRef);
        }
        String defaultValue = generateExpression(Model.getFacade().getDefaultValue(parameter));
        if (!defaultValue.isEmpty()) {
            s.append(" = ").append(defaultValue);
        }
        return s.toString();
    }

    private static String generateExpression(Object expr) {
        if (Model.getFacade().isAExpression(expr)) {
            return generateUninterpreted((String) Model.getFacade().getBody(expr));
        } else if (Model.getFacade().isAConstraint(expr)) {
            return generateExpression(Model.getFacade().getBody(expr));
        }
        return "";
    }

    private static String generateUninterpreted(String un) {
        return un == null ? "" : un;
    }

    private static String generateClassifierRef(Object cls) {
        return cls == null ? "" : Model.getFacade().getName(cls);
    }

    private static String generateKind(Object kind) {
        StringBuilder s = new StringBuilder();
        if (kind == null || kind == Model.getDirectionKind().getInParameter()) {
            // default is empty
        } else if (kind == Model.getDirectionKind().getInOutParameter()) {
            s.append("inout");
        } else if (kind == Model.getDirectionKind().getOutParameter()) {
            s.append("out");
        }
        return s.toString();
    }

    /**
     * @param tv a tagged value
     * @return a string that represents the tagged value
     */
    static String generateTaggedValue(Object tv) {
        if (tv == null) {
            return "";
        }
        return Model.getFacade().getTagOfTag(tv) + "="
                + generateUninterpreted(Model.getFacade().getValueOfTag(tv));
    }

    /**
     * Generate the text of a multiplicity.
     *
     * @param element                a multiplicity or an element which has a multiplicity
     * @param showSingularMultiplicity if false return the empty string for 1..1 multiplicities.
     * @return a string containing the formatted multiplicity,
     * or the empty string
     */
    public static String generateMultiplicity(Object element,
            boolean showSingularMultiplicity) {
        Object multiplicity;
        if (Model.getFacade().isAMultiplicity(element)) {
            multiplicity = element;
        } else if (Model.getFacade().isAUMLElement(element)) {
            multiplicity = Model.getFacade().getMultiplicity(element);
        } else {
            throw new IllegalArgumentException();
        }
        if (multiplicity != null) {
            int upper = Model.getFacade().getUpper(multiplicity);
            int lower = Model.getFacade().getLower(multiplicity);
            if (lower != 1 || upper != 1 || showSingularMultiplicity) {
                return Model.getFacade().toString(multiplicity);
            }
        }
        return "";
    }

    /**
     * @param umlAction the action
     * @return the generated text (never null)
     */
    static String generateAction(Object umlAction) {
        if (umlAction == null) {
            return "";
        }
        Object script = Model.getFacade().getScript(umlAction);
        String s = (script != null && Model.getFacade().getBody(script) != null)
                ? Model.getFacade().getBody(script).toString()
                : "";
        StringBuilder p = new StringBuilder();
        Collection c = Model.getFacade().getActualArguments(umlAction);
        if (c != null) {
            boolean first = true;
            for (Object arg : c) {
                if (!first) {
                    p.append(", ");
                }
                if (Model.getFacade().getValue(arg) != null) {
                    p.append(generateExpression(
                            Model.getFacade().getValue(arg)));
                }
                first = false;
            }
        }
        if (s.isEmpty() && p.length() == 0) {
            return "";
        }
        if (p.length() == 0) {
            return s;
        }
        return s + " (" + p + ")";
    }

    /**
     * Generate a textual representation of the given Action or ActionSequence
     * according the UML standard notation.
     *
     * @param a the UML Action or ActionSequence
     * @return the generated textual representation of the given action(sequence).
     * This value is guaranteed NOT null.
     */
    public static String generateActionSequence(Object a) {
        if (Model.getFacade().isAActionSequence(a)) {
            StringBuilder str = new StringBuilder();
            Iterator i = Model.getFacade().getActions(a).iterator();
            if (i.hasNext()) {
                str.append(generateAction(i.next()));
            }
            while (i.hasNext()) {
                str.append("; ").append(generateAction(i.next()));
            }
            return str.toString();
        }
        return generateAction(a);
    }

    static StringBuilder formatNameList(Collection modelElements) {
        return formatNameList(modelElements, LIST_SEPARATOR);
    }

    static StringBuilder formatNameList(Collection modelElements,
            String separator) {
        StringBuilder result = new StringBuilder();
        for (Object element : modelElements) {
            result.append(Model.getFacade().getName(element)).append(separator);
        }
        if (result.length() >= separator.length()) {
            result.delete(result.length() - separator.length(),
                    result.length());
        }
        return result;
    }
}