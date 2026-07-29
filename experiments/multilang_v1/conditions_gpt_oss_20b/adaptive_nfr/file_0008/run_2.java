public final class IntrospectionHelper {

    // ... existing fields and methods ...

    private IntrospectionHelper(final Class<?> bean) {
        this.bean = bean;
        Method[] methods = bean.getMethods();
        Method addTextMethod = null;
        for (Method m : methods) {
            if (isAddTypeMethod(m)) {
                insertAddTypeMethod(m);
                continue;
            }
            if (isHiddenSetMethod(m)) {
                continue;
            }
            if (isAddTaskMethod(m)) {
                continue;
            }
            if (isAddTextMethod(m)) {
                addTextMethod = m;
                continue;
            }
            if (isSetMethod(m)) {
                processSetMethod(m);
                continue;
            }
            if (isCreateMethod(m)) {
                processCreateMethod(m);
                continue;
            }
            if (isAddConfiguredMethod(m)) {
                processAddConfiguredMethod(m);
                continue;
            }
            if (isAddMethod(m)) {
                processAddMethod(m);
                continue;
            }
        }
        addText = addTextMethod;
    }

    private boolean isAddTypeMethod(Method m) {
        Class<?>[] args = m.getParameterTypes();
        Class<?> returnType = m.getReturnType();
        String name = m.getName();
        return args.length == 1 && java.lang.Void.TYPE.equals(returnType)
                && ("add".equals(name) || "addConfigured".equals(name));
    }

    private boolean isHiddenSetMethod(Method m) {
        String name = m.getName();
        Class<?>[] args = m.getParameterTypes();
        if (args.length != 1) {
            return false;
        }
        return isHiddenSetMethod(name, args[0]);
    }

    private boolean isAddTaskMethod(Method m) {
        if (!isContainer()) {
            return false;
        }
        Class<?>[] args = m.getParameterTypes();
        if (args.length != 1) {
            return false;
        }
        String name = m.getName();
        return "addTask".equals(name) && org.apache.tools.ant.Task.class.equals(args[0]);
    }

    private boolean isAddTextMethod(Method m) {
        String name = m.getName();
        Class<?> returnType = m.getReturnType();
        Class<?>[] args = m.getParameterTypes();
        return "addText".equals(name) && java.lang.Void.TYPE.equals(returnType)
                && args.length == 1 && java.lang.String.class.equals(args[0]);
    }

    private boolean isSetMethod(Method m) {
        String name = m.getName();
        Class<?> returnType = m.getReturnType();
        Class<?>[] args = m.getParameterTypes();
        return name.startsWith("set") && java.lang.Void.TYPE.equals(returnType)
                && args.length == 1 && !args[0].isArray();
    }

    private boolean isCreateMethod(Method m) {
        String name = m.getName();
        Class<?> returnType = m.getReturnType();
        Class<?>[] args = m.getParameterTypes();
        return name.startsWith("create") && !returnType.isArray()
                && !returnType.isPrimitive() && args.length == 0;
    }

    private boolean isAddConfiguredMethod(Method m) {
        String name = m.getName();
        Class<?> returnType = m.getReturnType();
        Class<?>[] args = m.getParameterTypes();
        return name.startsWith("addConfigured") && java.lang.Void.TYPE.equals(returnType)
                && args.length == 1 && !java.lang.String.class.equals(args[0])
                && !args[0].isArray() && !args[0].isPrimitive();
    }

    private boolean isAddMethod(Method m) {
        String name = m.getName();
        Class<?> returnType = m.getReturnType();
        Class<?>[] args = m.getParameterTypes();
        return name.startsWith("add") && java.lang.Void.TYPE.equals(returnType)
                && args.length == 1 && !java.lang.String.class.equals(args[0])
                && !args[0].isArray() && !args[0].isPrimitive();
    }

    private void processSetMethod(Method m) {
        String name = m.getName();
        Class<?>[] args = m.getParameterTypes();
        String propName = getPropertyName(name, "set");
        AttributeSetter as = (AttributeSetter) attributeSetters.get(propName);
        if (as != null) {
            if (java.lang.String.class.equals(args[0])) {
                return;
            }
            if (java.io.File.class.equals(args[0])) {
                if (Resource.class.equals(as.type) || FileProvider.class.equals(as.type)) {
                    return;
                }
            }
        }
        as = createAttributeSetter(m, args[0], propName);
        if (as != null) {
            attributeTypes.put(propName, args[0]);
            attributeSetters.put(propName, as);
        }
    }

    private void processCreateMethod(Method m) {
        String name = m.getName();
        Class<?> returnType = m.getReturnType();
        String propName = getPropertyName(name, "create");
        if (nestedCreators.get(propName) == null) {
            nestedTypes.put(propName, returnType);
            nestedCreators.put(propName, new CreateNestedCreator(m));
        }
    }

    private void processAddConfiguredMethod(Method m) {
        Class<?>[] args = m.getParameterTypes();
        try {
            Constructor<?> constructor = null;
            try {
                constructor = args[0].getConstructor();
            } catch (NoSuchMethodException ex) {
                constructor = args[0].getConstructor(Project.class);
            }
            String propName = getPropertyName(m.getName(), "addConfigured");
            nestedTypes.put(propName, args[0]);
            nestedCreators.put(propName, new AddNestedCreator(m,
                    constructor, AddNestedCreator.ADD_CONFIGURED));
        } catch (NoSuchMethodException nse) {
            // ignore
        }
    }

    private void processAddMethod(Method m) {
        Class<?>[] args = m.getParameterTypes();
        try {
            Constructor<?> constructor = null;
            try {
                constructor = args[0].getConstructor();
            } catch (NoSuchMethodException ex) {
                constructor = args[0].getConstructor(Project.class);
            }
            String propName = getPropertyName(m.getName(), "add");
            if (nestedTypes.get(propName) != null) {
                return;
            }
            nestedTypes.put(propName, args[0]);
            nestedCreators.put(propName, new AddNestedCreator(m,
                    constructor, AddNestedCreator.ADD));
        } catch (NoSuchMethodException nse) {
            // ignore
        }
    }

    // ... rest of the class unchanged ...
}