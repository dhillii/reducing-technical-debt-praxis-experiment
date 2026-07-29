package org.apache.tools.ant;

import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.Hashtable;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.apache.tools.ant.types.EnumeratedAttribute;
import org.apache.tools.ant.types.Resource;
import org.apache.tools.ant.types.resources.FileProvider;
import org.apache.tools.ant.types.resources.FileResource;
import org.apache.tools.ant.taskdefs.PreSetDef;
import org.apache.tools.ant.util.StringUtils;

public final class IntrospectionHelper {

    private static final Map<String, IntrospectionHelper> HELPERS = new Hashtable<String, IntrospectionHelper>();

    private static final Map<Class<?>, Class<?>> PRIMITIVE_TYPE_MAP = new HashMap<Class<?>, Class<?>>(8);

    static {
        Class<?>[] primitives = {Boolean.TYPE, Byte.TYPE, Character.TYPE, Short.TYPE,
                              Integer.TYPE, Long.TYPE, Float.TYPE, Double.TYPE};
        Class<?>[] wrappers = {Boolean.class, Byte.class, Character.class, Short.class,
                            Integer.class, Long.class, Float.class, Double.class};
        for (int i = 0; i < primitives.length; i++) {
            PRIMITIVE_TYPE_MAP.put (primitives[i], wrappers[i]);
        }
    }

    private static final int MAX_REPORT_NESTED_TEXT = 20;
    private static final String ELLIPSIS = "...";

    private final Hashtable<String, Class<?>> attributeTypes = new Hashtable<String, Class<?>>();
    private final Hashtable<String, AttributeSetter> attributeSetters = new Hashtable<String, AttributeSetter>();
    private final Hashtable<String, Class<?>> nestedTypes = new Hashtable<String, Class<?>>();
    private final Hashtable<String, NestedCreator> nestedCreators = new Hashtable<String, NestedCreator>();
    private final List<Method> addTypeMethods = new ArrayList<Method>();
    private final Method addText;
    private final Class<?> bean;

    private IntrospectionHelper(final Class<?> bean) {
        this.bean = bean;
        Method[] methods = bean.getMethods();
        Method addTextMethod = null;
        for (int i = 0; i < methods.length; i++) {
            final Method m = methods[i];
            final String name = m.getName();
            Class<?> returnType = m.getReturnType();
            Class<?>[] args = m.getParameterTypes();

            if (processAddTypeMethod(m, name, returnType, args)) {
                continue;
            }
            if (processHiddenMethod(name, args)) {
                continue;
            }
            if (processAddTextMethod(m, name, returnType, args)) {
                addTextMethod = m;
            } else if (processSetterMethod(m, name, returnType, args)) {
                // handled in processSetterMethod
            } else if (processCreateMethod(m, name, returnType, args)) {
                // handled in processCreateMethod
            } else if (processAddConfiguredMethod(m, name, returnType, args)) {
                // handled in processAddConfiguredMethod
            } else if (processAddMethod(m, name, returnType, args)) {
                // handled in processAddMethod
            }
        }
        addText = addTextMethod;
    }

    private boolean processAddTypeMethod(Method m, String name, Class<?> returnType, Class<?>[] args) {
        if (args.length == 1 && java.lang.Void.TYPE.equals(returnType)
                && ("add".equals(name) || "addConfigured".equals(name))) {
            insertAddTypeMethod(m);
            return true;
        }
        return false;
    }

    private boolean processHiddenMethod(String name, Class<?>[] args) {
        if (org.apache.tools.ant.ProjectComponent.class.isAssignableFrom(bean)
                && args.length == 1 && isHiddenSetMethod(name, args[0])) {
            return true;
        }
        if (isContainer() && args.length == 1 && "addTask".equals(name)
                && org.apache.tools.ant.Task.class.equals(args[0])) {
            return true;
        }
        return false;
    }

    private boolean processAddTextMethod(Method m, String name, Class<?> returnType, Class<?>[] args) {
        return "addText".equals(name) && java.lang.Void.TYPE.equals(returnType)
                && args.length == 1 && java.lang.String.class.equals(args[0]);
    }

    private boolean processSetterMethod(Method m, String name, Class<?> returnType, Class<?>[] args) {
        if (name.startsWith("set") && java.lang.Void.TYPE.equals(returnType)
                && args.length == 1 && !args[0].isArray()) {
            String propName = getPropertyName(name, "set");
            AttributeSetter as = attributeSetters.get(propName);
            if (as != null) {
                if (java.lang.String.class.equals(args[0])) {
                    return true;
                }
                if (java.io.File.class.equals(args[0])) {
                    if (Resource.class.equals(as.type) || FileProvider.class.equals(as.type)) {
                        return true;
                    }
                }
            }
            as = createAttributeSetter(m, args[0], propName);
            if (as != null) {
                attributeTypes.put(propName, args[0]);
                attributeSetters.put(propName, as);
            }
            return true;
        }
        return false;
    }

    private boolean processCreateMethod(Method m, String name, Class<?> returnType, Class<?>[] args) {
        if (name.startsWith("create") && !returnType.isArray()
                && !returnType.isPrimitive() && args.length == 0) {
            String propName = getPropertyName(name, "create");
            if (nestedCreators.get(propName) == null) {
                nestedTypes.put(propName, returnType);
                nestedCreators.put(propName, new CreateNestedCreator(m));
            }
            return true;
        }
        return false;
    }

    private boolean processAddConfiguredMethod(Method m, String name, Class<?> returnType, Class<?>[] args) {
        if (name.startsWith("addConfigured")
                && java.lang.Void.TYPE.equals(returnType) && args.length == 1
                && !java.lang.String.class.equals(args[0])
                && !args[0].isArray() && !args[0].isPrimitive()) {
            try {
                Constructor<?> constructor = getConstructor(args[0]);
                String propName = getPropertyName(name, "addConfigured");
                nestedTypes.put(propName, args[0]);
                nestedCreators.put(propName, new AddNestedCreator(m,
                    constructor, AddNestedCreator.ADD_CONFIGURED));
            } catch (NoSuchMethodException nse) {
                // ignore
            }
            return true;
        }
        return false;
    }

    private boolean processAddMethod(Method m, String name, Class<?> returnType, Class<?>[] args) {
        if (name.startsWith("add")
                && java.lang.Void.TYPE.equals(returnType) && args.length == 1
                && !java.lang.String.class.equals(args[0])
                && !args[0].isArray() && !args[0].isPrimitive()) {
            try {
                Constructor<?> constructor = getConstructor(args[0]);
                String propName = getPropertyName(name, "add");
                if (nestedTypes.get(propName) != null) {
                    return true;
                }
                nestedTypes.put(propName, args[0]);
                nestedCreators.put(propName, new AddNestedCreator(m,
                        constructor, AddNestedCreator.ADD));
            } catch (NoSuchMethodException nse) {
                // ignore
            }
            return true;
        }
        return false;
    }

    private Constructor<?> getConstructor(Class<?> clazz) throws NoSuchMethodException {
        try {
            return clazz.getConstructor();
        } catch (NoSuchMethodException ex) {
            return clazz.getConstructor(Project.class);
        }
    }

    private boolean isHiddenSetMethod(String name, Class<?> type) {
        if ("setLocation".equals(name) && org.apache.tools.ant.Location.class.equals(type)) {
            return true;
        }
        if ("setTaskType".equals(name) && java.lang.String.class.equals(type)) {
            return true;
        }
        return false;
    }

    public static synchronized IntrospectionHelper getHelper(Class<?> c) {
        return getHelper(null, c);
    }

    public static IntrospectionHelper getHelper(Project p, Class<?> c) {
        IntrospectionHelper ih = HELPERS.get(c.getName());
        if (ih == null || ih.bean != c) {
            ih = new IntrospectionHelper(c);
            if (p != null) {
                HELPERS.put(c.getName(), ih);
            }
        }
        return ih;
    }

    public void setAttribute(Project p, Object element, String attributeName,
            Object value) throws BuildException {
        AttributeSetter as = attributeSetters.get(
                attributeName.toLowerCase(Locale.ENGLISH));
        if (as == null && value != null) {
            if (element instanceof DynamicAttributeNS) {
                DynamicAttributeNS dc = (DynamicAttributeNS) element;
                String uriPlusPrefix = ProjectHelper.extractUriFromComponentName(attributeName);
                String uri = ProjectHelper.extractUriFromComponentName(uriPlusPrefix);
                String localName = ProjectHelper.extractNameFromComponentName(attributeName);
                String qName = "".equals(uri) ? localName : uri + ":" + localName;
                dc.setDynamicAttribute(uri, localName, qName, value.toString());
                return;
            }
            if (element instanceof DynamicObjectAttribute) {
                DynamicObjectAttribute dc = (DynamicObjectAttribute) element;
                dc.setDynamicAttribute(attributeName.toLowerCase(Locale.ENGLISH), value);
                return;
            }
            if (element instanceof DynamicAttribute) {
                DynamicAttribute dc = (DynamicAttribute) element;
                dc.setDynamicAttribute(attributeName.toLowerCase(Locale.ENGLISH), value.toString());
                return;
            }
            if (attributeName.indexOf(':') >= 0) {
                return;
            }
            String msg = getElementName(p, element)
                    + " doesn't support the \"" + attributeName + "\" attribute.";
            throw new UnsupportedAttributeException(msg, attributeName);
        }
        try {
            as.setObject(p, element, value);
        } catch (IllegalAccessException ie) {
            throw new BuildException(ie);
        } catch (InvocationTargetException ite) {
            throw extractBuildException(ite);
        }
    }

    public void setAttribute(Project p, Object element, String attributeName,
                             String value) throws BuildException {
        setAttribute(p, element, attributeName, (Object) value);
    }

    public void addText(Project project, Object element, String text)
        throws BuildException {
        if (addText == null) {
            text = text.trim();
            if (text.length() == 0) {
                return;
            }
            throw new BuildException(project.getElementName(element)
                    + " doesn't support nested text data (\"" + condenseText(text) + "\").");
        }
        try {
            addText.invoke(element, new Object[] {text});
        } catch (IllegalAccessException ie) {
            throw new BuildException(ie);
        } catch (InvocationTargetException ite) {
            throw extractBuildException(ite);
        }
    }

    protected static final String NOT_SUPPORTED_CHILD_PREFIX =
        " doesn't support the nested \"";

    protected static final String NOT_SUPPORTED_CHILD_POSTFIX = "\" element.";

    public void throwNotSupported(Project project, Object parent, String elementName) {
        String msg = project.getElementName(parent)
            + NOT_SUPPORTED_CHILD_PREFIX + elementName
            + NOT_SUPPORTED_CHILD_POSTFIX;
        throw new UnsupportedElementException(msg, elementName);
    }

    private NestedCreator getNestedCreator(
        Project project, String parentUri, Object parent,
        String elementName, UnknownElement child) throws BuildException {

        String uri = ProjectHelper.extractUriFromComponentName(elementName);
        String name = ProjectHelper.extractNameFromComponentName(elementName);

        if (uri.equals(ProjectHelper.ANT_CORE_URI)) {
            uri = "";
        }
        if (parentUri.equals(ProjectHelper.ANT_CORE_URI)) {
            parentUri = "";
        }
        NestedCreator nc = null;
        if (uri.equals(parentUri) || uri.length() == 0) {
            nc = nestedCreators.get(name.toLowerCase(Locale.ENGLISH));
        }
        if (nc == null) {
            nc = createAddTypeCreator(project, parent, elementName);
        }
        if (nc == null &&
            (parent instanceof DynamicElementNS
             || parent instanceof DynamicElement)
            ) {
            String qName = child == null ? name : child.getQName();
            final Object nestedElement =
                createDynamicElement(parent,
                                     child == null ? "" : child.getNamespace(),
                                     name, qName);
            if (nestedElement != null) {
                nc = new NestedCreator(null) {
                    Object create(Project project, Object parent, Object ignore) {
                        return nestedElement;
                    }
                };
            }
        }
        if (nc == null) {
            throwNotSupported(project, parent, elementName);
        }
        return nc;
    }

    private Object createDynamicElement(Object parent, String ns,
                                        String localName, String qName) {
        Object nestedElement = null;
        if (parent instanceof DynamicElementNS) {
            DynamicElementNS dc = (DynamicElementNS) parent;
            nestedElement = dc.createDynamicElement(ns, localName, qName);
        }
        if (nestedElement == null && parent instanceof DynamicElement) {
            DynamicElement dc = (DynamicElement) parent;
            nestedElement =
                dc.createDynamicElement(localName.toLowerCase(Locale.ENGLISH));
        }
        return nestedElement;
    }

    public Object createElement(Project project, Object parent, String elementName)
            throws BuildException {
        NestedCreator nc = getNestedCreator(project, "", parent, elementName, null);
        try {
            Object nestedElement = nc.create(project, parent, null);
            if (project != null) {
                project.setProjectReference(nestedElement);
            }
            return nestedElement;
        } catch (IllegalAccessException ie) {
            throw new BuildException(ie);
        } catch (InstantiationException ine) {
            throw new BuildException(ine);
        } catch (InvocationTargetException ite) {
            throw extractBuildException(ite);
        }
    }

    public Creator getElementCreator(
        Project project, String parentUri, Object parent, String elementName, UnknownElement ue) {
        NestedCreator nc = getNestedCreator(project, parentUri, parent, elementName, ue);
        return new Creator(project, parent, nc);
    }

    public boolean isDynamic() {
        return DynamicElement.class.isAssignableFrom(bean)
                || DynamicElementNS.class.isAssignableFrom(bean);
    }

    public boolean isContainer() {
        return TaskContainer.class.isAssignableFrom(bean);
    }

    public boolean supportsNestedElement(String elementName) {
        return supportsNestedElement("", elementName);
    }

    public boolean supportsNestedElement(String parentUri, String elementName) {
        if (isDynamic() || addTypeMethods.size() > 0) {
            return true;
        }
        return supportsReflectElement(parentUri, elementName);
    }

    public boolean supportsNestedElement(String parentUri, String elementName,
                                         Project project, Object parent) {
        if (addTypeMethods.size() > 0
            && createAddTypeCreator(project, parent, elementName) != null) {
            return true;
        }
        return isDynamic() || supportsReflectElement(parentUri, elementName);
    }

    public boolean supportsReflectElement(
        String parentUri, String elementName) {
        String name = ProjectHelper.extractNameFromComponentName(elementName);
        if (!nestedCreators.containsKey(name.toLowerCase(Locale.ENGLISH))) {
            return false;
        }
        String uri = ProjectHelper.extractUriFromComponentName(elementName);
        if (uri.equals(ProjectHelper.ANT_CORE_URI)) {
            uri = "";
        }
        if ("".equals(uri)) {
            return true;
        }
        if (parentUri.equals(ProjectHelper.ANT_CORE_URI)) {
            parentUri = "";
        }
        return uri.equals(parentUri);
    }

    public void storeElement(Project project, Object parent, Object child,
        String elementName) throws BuildException {
        if (elementName == null) {
            return;
        }
        NestedCreator ns = nestedCreators.get(elementName.toLowerCase(Locale.ENGLISH));
        if (ns == null) {
            return;
        }
        try {
            ns.store(parent, child);
        } catch (IllegalAccessException ie) {
            throw new BuildException(ie);
        } catch (InstantiationException ine) {
            throw new BuildException(ine);
        } catch (InvocationTargetException ite) {
            throw extractBuildException(ite);
        }
    }

    private static BuildException extractBuildException(InvocationTargetException ite) {
        Throwable t = ite.getTargetException();
        if (t instanceof BuildException) {
            return (BuildException) t;
        }
        return new BuildException(t);
    }

    public Class<?> getElementType(String elementName) throws BuildException {
        Class<?> nt = nestedTypes.get(elementName);
        if (nt == null) {
            throw new UnsupportedElementException("Class "
                    + bean.getName() + " doesn't support the nested \""
                    + elementName + "\" element.", elementName);
        }
        return nt;
    }

    public Class<?> getAttributeType(String attributeName) throws BuildException {
        Class<?> at = attributeTypes.get(attributeName);
        if (at == null) {
            throw new UnsupportedAttributeException("Class "
                    + bean.getName() + " doesn't support the \""
                    + attributeName + "\" attribute.", attributeName);
        }
        return at;
    }

    public Method getAddTextMethod() throws BuildException {
        if (!supportsCharacters()) {
            throw new BuildException("Class " + bean.getName()
                    + " doesn't support nested text data.");
        }
        return addText;
    }

    public Method getElementMethod(String elementName) throws BuildException {
        Object creator = nestedCreators.get(elementName);
        if (creator == null) {
            throw new UnsupportedElementException("Class "
                    + bean.getName() + " doesn't support the nested \""
                    + elementName + "\" element.", elementName);
        }
        return ((NestedCreator) creator).method;
    }

    public Method getAttributeMethod(String attributeName) throws BuildException {
        Object setter = attributeSetters.get(attributeName);
        if (setter == null) {
            throw new UnsupportedAttributeException("Class "
                    + bean.getName() + " doesn't support the \""
                    + attributeName + "\" attribute.", attributeName);
        }
        return ((AttributeSetter) setter).method;
    }

    public boolean supportsCharacters() {
        return addText != null;
    }

    public Enumeration<String> getAttributes() {
        return attributeSetters.keys();
    }

    public Map<String, Class<?>> getAttributeMap() {
        return attributeTypes.isEmpty()
            ? Collections.<String, Class<?>> emptyMap() : Collections.unmodifiableMap(attributeTypes);
    }

    public Enumeration<String> getNestedElements() {
        return nestedTypes.keys();
    }

    public Map<String, Class<?>> getNestedElementMap() {
        return nestedTypes.isEmpty()
            ? Collections.<String, Class<?>> emptyMap() : Collections.unmodifiableMap(nestedTypes);
    }

    public List<Method> getExtensionPoints() {
        return addTypeMethods.isEmpty()
                ? Collections.<Method> emptyList() : Collections.unmodifiableList(addTypeMethods);
    }

    private AttributeSetter createAttributeSetter(final Method m,
                                                  Class<?> arg,
                                                  final String attrName) {
        final Class<?> reflectedArg = PRIMITIVE_TYPE_MAP.containsKey(arg)
            ? PRIMITIVE_TYPE_MAP.get(arg) : arg;

        if (java.lang.Object.class == reflectedArg) {
            return new AttributeSetter(m, arg) {
                public void set(Project p, Object parent, String value)
                        throws InvocationTargetException,
                    IllegalAccessException {
                    throw new BuildException(
                        "Internal ant problem - this should not get called");
                }
            };
        }
        if (java.lang.String.class.equals(reflectedArg)) {
            return new AttributeSetter(m, arg) {
                public void set(Project p, Object parent, String value)
                        throws InvocationTargetException, IllegalAccessException {
                    m.invoke(parent, (Object[]) new String[] {value});
                }
            };
        }
        if (java.lang.Character.class.equals(reflectedArg)) {
            return new AttributeSetter(m, arg) {
                public void set(Project p, Object parent, String value)
                        throws InvocationTargetException, IllegalAccessException {
                    if (value.length() == 0) {
                        throw new BuildException("The value \"\" is not a "
                                + "legal value for attribute \"" + attrName + "\"");
                    }
                    m.invoke(parent, (Object[]) new Character[] {new Character(value.charAt(0))});
                }
            };
        }
        if (java.lang.Boolean.class.equals(reflectedArg)) {
            return new AttributeSetter(m, arg) {
                public void set(Project p, Object parent, String value)
                        throws InvocationTargetException, IllegalAccessException {
                    m.invoke(parent, (Object[]) new Boolean[] {
                            Project.toBoolean(value) ? Boolean.TRUE : Boolean.FALSE });
                }
            };
        }
        if (java.lang.Class.class.equals(reflectedArg)) {
            return new AttributeSetter(m, arg) {
                public void set(Project p, Object parent, String value)
                        throws InvocationTargetException, IllegalAccessException, BuildException {
                    try {
                        m.invoke(parent, new Object[] {Class.forName(value)});
                    } catch (ClassNotFoundException ce) {
                        throw new BuildException(ce);
                    }
                }
            };
        }
        if (java.io.File.class.equals(reflectedArg)) {
            return new AttributeSetter(m, arg) {
                public void set(Project p, Object parent, String value)
                        throws InvocationTargetException, IllegalAccessException {
                    m.invoke(parent, new Object[] {p.resolveFile(value)});
                }
            };
        }
        if (Resource.class.equals(reflectedArg) || FileProvider.class.equals(reflectedArg)) {
            return new AttributeSetter(m, arg) {
                void set(Project p, Object parent, String value) throws InvocationTargetException,
                        IllegalAccessException, BuildException {
                    m.invoke(parent, new Object[] { new FileResource(p, p.resolveFile(value)) });
                };
            };
        }
        if (EnumeratedAttribute.class.isAssignableFrom(reflectedArg)) {
            return new AttributeSetter(m, arg) {
                public void set(Project p, Object parent, String value)
                        throws InvocationTargetException, IllegalAccessException, BuildException {
                    try {
                        EnumeratedAttribute ea = (EnumeratedAttribute) reflectedArg.newInstance();
                        ea.setValue(value);
                        m.invoke(parent, new Object[] {ea});
                    } catch (InstantiationException ie) {
                        throw new BuildException(ie);
                    }
                }
            };
        }

        AttributeSetter setter = getEnumSetter(reflectedArg, m, arg);
        if (setter != null) {
            return setter;
        }

        if (java.lang.Long.class.equals(reflectedArg)) {
            return new AttributeSetter(m, arg) {
                public void set(Project p, Object parent, String value)
                        throws InvocationTargetException, IllegalAccessException, BuildException {
                    try {
                        m.invoke(parent, new Object[] {
                                new Long(StringUtils.parseHumanSizes(value)) });
                    } catch (NumberFormatException e) {
                        throw new BuildException("Can't assign non-numeric"
                                                 + " value '" + value + "' to"
                                                 + " attribute " + attrName);
                    } catch (InvocationTargetException e) {
                        throw e;
                    } catch (IllegalAccessException e) {
                        throw e;
                    } catch (Exception e) {
                        throw new BuildException(e);
                    }
                }
            };
        }
        boolean includeProject;
        Constructor<?> c;
        try {
            c = reflectedArg.getConstructor(Project.class, String.class);
            includeProject = true;
        } catch (NoSuchMethodException nme) {
            try {
                c = reflectedArg.getConstructor(String.class);
                includeProject = false;
            } catch (NoSuchMethodException nme2) {
                return null;
            }
        }
        final boolean finalIncludeProject = includeProject;
        final Constructor<?> finalConstructor = c;

        return new AttributeSetter(m, arg) {
            public void set(Project p, Object parent, String value)
                    throws InvocationTargetException, IllegalAccessException, BuildException {
                try {
                    Object[] args = finalIncludeProject
                            ? new Object[] {p, value} : new Object[] {value};

                    Object attribute = finalConstructor.newInstance(args);
                    if (p != null) {
                        p.setProjectReference(attribute);
                    }
                    m.invoke(parent, new Object[] {attribute});
                } catch (InvocationTargetException e) {
                    Throwable cause = e.getCause();
                    if (cause instanceof IllegalArgumentException) {
                        throw new BuildException("Can't assign value '" + value
                                                 + "' to attribute " + attrName
                                                 + ", reason: "
                                                 + cause.getClass()
                                                 + " with message '"
                                                 + cause.getMessage() + "'");
                    }
                    throw e;
                } catch (InstantiationException ie) {
                    throw new BuildException(ie);
                }
            }
        };
    }

    private AttributeSetter getEnumSetter(
        final Class<?> reflectedArg, final Method m, Class<?> arg) {
        if (reflectedArg.isEnum()) {
            return new AttributeSetter(m, arg) {
                public void set(Project p, Object parent, String value)
                    throws InvocationTargetException, IllegalAccessException,
                    BuildException {
                    Enum<?> setValue;
                    try {
                        @SuppressWarnings({ "unchecked", "rawtypes" })
                        Enum<?> enumValue = Enum.valueOf((Class<? extends Enum>) reflectedArg,
                                value);
                        setValue = enumValue;
                    } catch (IllegalArgumentException e) {
                        throw new BuildException("'" + value + "' is not a permitted value for "
                                + reflectedArg.getName());
                    }
                    m.invoke(parent, setValue);
                }
            };
        }
        return null;
    }

    private String getElementName(Project project, Object element) {
        return project.getElementName(element);
    }

    private static String getPropertyName(String methodName, String prefix) {
        return methodName.substring(prefix.length()).toLowerCase(Locale.ENGLISH);
    }

    public static final class Creator {
        private NestedCreator nestedCreator;
        private Object parent;
        private Project project;
        private Object nestedObject;
        private String polyType;

        private Creator(Project project, Object parent, NestedCreator nestedCreator) {
            this.project = project;
            this.parent = parent;
            this.nestedCreator = nestedCreator;
        }

        public void setPolyType(String polyType) {
            this.polyType = polyType;
        }

        public Object create() {
            if (polyType != null) {
                if (!nestedCreator.isPolyMorphic()) {
                    throw new BuildException(
                            "Not allowed to use the polymorphic form for this element");
                }
                ComponentHelper helper = ComponentHelper.getComponentHelper(project);
                nestedObject = helper.createComponent(polyType);
                if (nestedObject == null) {
                    throw new BuildException("Unable to create object of type " + polyType);
                }
            }
            try {
                nestedObject = nestedCreator.create(project, parent, nestedObject);
                if (project != null) {
                    project.setProjectReference(nestedObject);
                }
                return nestedObject;
            } catch (IllegalAccessException ex) {
                throw new BuildException(ex);
            } catch (InstantiationException ex) {
                throw new BuildException(ex);
            } catch (IllegalArgumentException ex) {
                if (polyType == null) {
                    throw ex;
                }
                throw new BuildException("Invalid type used " + polyType);
            } catch (InvocationTargetException ex) {
                throw extractBuildException(ex);
            }
        }

        public Object getRealObject() {
            return nestedCreator.getRealObject();
        }

        public void store() {
            try {
                nestedCreator.store(parent, nestedObject);
            } catch (IllegalAccessException ex) {
                throw new BuildException(ex);
            } catch (InstantiationException ex) {
                throw new BuildException(ex);
            } catch (IllegalArgumentException ex) {
                if (polyType == null) {
                    throw ex;
                }
                throw new BuildException("Invalid type used " + polyType);
            } catch (InvocationTargetException ex) {
                throw extractBuildException(ex);
            }
        }
    }

    private abstract static class NestedCreator {
        private Method method;

        protected NestedCreator(Method m) {
            method = m;
        }
        Method getMethod() {
            return method;
        }
        boolean isPolyMorphic() {
            return false;
        }
        Object getRealObject() {
            return null;
        }
        abstract Object create(Project project, Object parent, Object child)
                throws InvocationTargetException, IllegalAccessException, InstantiationException;

        void store(Object parent, Object child)
                 throws InvocationTargetException, IllegalAccessException, InstantiationException {
        }
    }

    private static class CreateNestedCreator extends NestedCreator {
        CreateNestedCreator(Method m) {
            super(m);
        }

        Object create(Project project, Object parent, Object ignore)
                throws InvocationTargetException, IllegalAccessException {
            return getMethod().invoke(parent, new Object[] {});
        }
    }

    private static class AddNestedCreator extends NestedCreator {

        static final int ADD = 1;
        static final int ADD_CONFIGURED = 2;

        private Constructor<?> constructor;
        private int behavior;

        AddNestedCreator(Method m, Constructor<?> c, int behavior) {
            super(m);
            this.constructor = c;
            this.behavior = behavior;
        }

        boolean isPolyMorphic() {
            return true;
        }

        Object create(Project project, Object parent, Object child)
                throws InvocationTargetException, IllegalAccessException, InstantiationException {
            if (child == null) {
                child = constructor.newInstance(
                        constructor.getParameterTypes().length == 0
                                ? new Object[] {} : new Object[] {project});
            }
            if (child instanceof PreSetDef.PreSetDefinition) {
                child = ((PreSetDef.PreSetDefinition) child).createObject(project);
            }
            if (behavior == ADD) {
                istore(parent, child);
            }
            return child;
        }

        void store(Object parent, Object child)
                throws InvocationTargetException, IllegalAccessException, InstantiationException {
            if (behavior == ADD_CONFIGURED) {
                istore(parent, child);
            }
        }

        private void istore(Object parent, Object child)
                throws InvocationTargetException, IllegalAccessException, InstantiationException {
            getMethod().invoke(parent, new Object[] {child});
        }
    }

    private abstract static class AttributeSetter {
        private Method method;
        private Class<?> type;
        protected AttributeSetter(Method m, Class<?> type) {
            method = m;
            this.type = type;
        }
        void setObject(Project p, Object parent, Object value)
                throws InvocationTargetException, IllegalAccessException, BuildException {
            if (type != null) {
                Class<?> useType = type;
                if (type.isPrimitive()) {
                    if (value == null) {
                        throw new BuildException(
                            "Attempt to set primitive "
                            + getPropertyName(method.getName(), "set")
                            + " to null on " + parent);
                    }
                    useType = PRIMITIVE_TYPE_MAP.get(type);
                }
                if (value == null || useType.isInstance(value)) {
                    method.invoke(parent, new Object[] {value});
                    return;
                }
            }
            set(p, parent, value.toString());
        }
        abstract void set(Project p, Object parent, String value)
                throws InvocationTargetException, IllegalAccessException, BuildException;
    }

    public static void clearCache() {
        HELPERS.clear();
    }

    private NestedCreator createAddTypeCreator(
            Project project, Object parent, String elementName) throws BuildException {
        if (addTypeMethods.size() == 0) {
            return null;
        }
        ComponentHelper helper = ComponentHelper.getComponentHelper(project);

        MethodAndObject restricted =  createRestricted(
            helper, elementName, addTypeMethods);
        MethodAndObject topLevel = createTopLevel(
            helper, elementName, addTypeMethods);

        if (restricted == null && topLevel == null) {
            return null;
        }

        if (restricted != null && topLevel != null) {
            throw new BuildException(
                "ambiguous: type and component definitions for "
                + elementName);
        }

        MethodAndObject methodAndObject
            = restricted != null ? restricted : topLevel;

        Object rObject = methodAndObject.object;
        if (methodAndObject.object instanceof PreSetDef.PreSetDefinition) {
            rObject = ((PreSetDef.PreSetDefinition) methodAndObject.object)
                .createObject(project);
        }
        final Object nestedObject = methodAndObject.object;
        final Object realObject = rObject;

        return new NestedCreator(methodAndObject.method) {
            Object create(Project project, Object parent, Object ignore)
                    throws InvocationTargetException, IllegalAccessException {
                if (!getMethod().getName().endsWith("Configured")) {
                    getMethod().invoke(parent, new Object[] {realObject});
                }
                return nestedObject;
            }

            Object getRealObject() {
                return realObject;
            }

            void store(Object parent, Object child) throws InvocationTargetException,
                    IllegalAccessException, InstantiationException {
                if (getMethod().getName().endsWith("Configured")) {
                    getMethod().invoke(parent, new Object[] {realObject});
                }
            }
        };
    }

    private void insertAddTypeMethod(Method method) {
        Class<?> argClass = method.getParameterTypes()[0];
        final int size = addTypeMethods.size();
        for (int c = 0; c < size; ++c) {
            Method current = addTypeMethods.get(c);
            if (current.getParameterTypes()[0].equals(argClass)) {
                if (method.getName().equals("addConfigured")) {
                    addTypeMethods.set(c, method);
                }
                return;
            }
            if (current.getParameterTypes()[0].isAssignableFrom(argClass)) {
                addTypeMethods.add(c, method);
                return;
            }
        }
        addTypeMethods.add(method);
    }

    private Method findMatchingMethod(Class<?> paramClass, List<Method> methods) {
        if (paramClass == null) {
            return null;
        }
        Class<?> matchedClass = null;
        Method matchedMethod = null;

        final int size = methods.size();
        for (int i = 0; i < size; ++i) {
            Method method = methods.get(i);
            Class<?> methodClass = method.getParameterTypes()[0];
            if (methodClass.isAssignableFrom(paramClass)) {
                if (matchedClass == null) {
                    matchedClass = methodClass;
                    matchedMethod = method;
                } else if (!methodClass.isAssignableFrom(matchedClass)) {
                    throw new BuildException("ambiguous: types " + matchedClass.getName() + " and "
                            + methodClass.getName() + " match " + paramClass.getName());
                }
            }
        }
        return matchedMethod;
    }

    private String condenseText(final String text) {
        if (text.length() <= MAX_REPORT_NESTED_TEXT) {
            return text;
        }
        int ends = (MAX_REPORT_NESTED_TEXT - ELLIPSIS.length()) / 2;
        return new StringBuffer(text).replace(ends, text.length() - ends, ELLIPSIS).toString();
    }

    private static class MethodAndObject {
        private Method method;
        private Object object;
        public MethodAndObject(Method method, Object object) {
            this.method = method;
            this.object = object;
        }
    }

    private AntTypeDefinition findRestrictedDefinition(
        ComponentHelper helper, String componentName, List<Method> methods) {
        AntTypeDefinition definition = null;
        Class<?> matchedDefinitionClass = null;

        List<AntTypeDefinition> definitions = helper.getRestrictedDefinitions(componentName);
        if (definitions == null) {
            return null;
        }
        synchronized (definitions) {
            final int size = definitions.size();
            for (int i = 0; i < size; ++i) {
                AntTypeDefinition d = definitions.get(i);
                Class<?> exposedClass = d.getExposedClass(helper.getProject());
                if (exposedClass == null) {
                    continue;
                }
                Method method  = findMatchingMethod(exposedClass, methods);
                if (method == null) {
                    continue;
                }
                if (matchedDefinitionClass != null) {
                    throw new BuildException(
                        "ambiguous: restricted definitions for "
                        + componentName + " "
                        + matchedDefinitionClass + " and " + exposedClass);
                }
                matchedDefinitionClass = exposedClass;
                definition = d;
            }
        }
        return definition;
    }

    private MethodAndObject createRestricted(
        ComponentHelper helper, String elementName, List<Method> addTypeMethods) {

        Project project = helper.getProject();

        AntTypeDefinition restrictedDefinition =
            findRestrictedDefinition(helper, elementName, addTypeMethods);

        if (restrictedDefinition == null) {
            return null;
        }

        Method addMethod = findMatchingMethod(
            restrictedDefinition.getExposedClass(project), addTypeMethods);
        if (addMethod == null) {
            throw new BuildException(
                "Ant Internal Error - contract mismatch for "
                + elementName);
        }
        Object addedObject = restrictedDefinition.create(project);
        if (addedObject == null) {
            throw new BuildException(
                "Failed to create object " + elementName
                + " of type " + restrictedDefinition.getTypeClass(project));
        }
        return new MethodAndObject(addMethod, addedObject);
    }

    private MethodAndObject createTopLevel(
        ComponentHelper helper, String elementName, List<Method> methods) {
        Class<?> clazz = helper.getComponentClass(elementName);
        if (clazz == null) {
            return null;
        }
        Method addMethod = findMatchingMethod(clazz, addTypeMethods);
        if (addMethod == null) {
            return null;
        }
        Object addedObject = helper.createComponent(elementName);
        return new MethodAndObject(addMethod, addedObject);
    }
}