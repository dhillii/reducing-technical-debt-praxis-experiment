private IntrospectionHelper(final Class<?> bean) {
    this.bean = bean;
    Method[] methods = bean.getMethods();
    Method addTextMethod = null;
    for (Method m : methods) {
        final String name = m.getName();
        Class<?> returnType = m.getReturnType();
        Class<?>[] args = m.getParameterTypes();

        if (isAddTypeMethod(m)) {
            insertAddTypeMethod(m);
            continue;
        }

        if (isHiddenSetMethod(name, args[0])) {
            continue;
        }

        if (isAddTaskMethod(name, args[0])) {
            continue;
        }

        if (isAddTextMethod(name, returnType, args)) {
            addTextMethod = m;
        } else if (isSetMethod(name, returnType, args)) {
            String propName = getPropertyName(name, "set");
            AttributeSetter as = (AttributeSetter) attributeSetters.get(propName);
            if (as != null) {
                if (isOverloadedMethod(as, args[0])) {
                    continue;
                }
            }
            as = createAttributeSetter(m, args[0], propName);
            if (as != null) {
                attributeTypes.put(propName, args[0]);
                attributeSetters.put(propName, as);
            }
        } else if (isCreateMethod(name, returnType, args)) {
            String propName = getPropertyName(name, "create");
            if (nestedCreators.get(propName) == null) {
                nestedTypes.put(propName, returnType);
                nestedCreators.put(propName, new CreateNestedCreator(m));
            }
        } else if (isAddConfiguredMethod(name, returnType, args)) {
            try {
                Constructor<?> constructor = getConstructor(args[0]);
                String propName = getPropertyName(name, "addConfigured");
                nestedTypes.put(propName, args[0]);
                nestedCreators.put(propName, new AddNestedCreator(m, constructor, AddNestedCreator.ADD_CONFIGURED));
            } catch (NoSuchMethodException nse) {
                // ignore
            }
        } else if (isAddMethod(name, returnType, args)) {
            try {
                Constructor<?> constructor = getConstructor(args[0]);
                String propName = getPropertyName(name, "add");
                if (nestedTypes.get(propName) != null) {
                    continue;
                }
                nestedTypes.put(propName, args[0]);
                nestedCreators.put(propName, new AddNestedCreator(m, constructor, AddNestedCreator.ADD));
            } catch (NoSuchMethodException nse) {
                // ignore
            }
        }
    }
    addText = addTextMethod;
}

private boolean isAddTypeMethod(Method m) {
    return m.getParameterTypes().length == 1 && java.lang.Void.TYPE.equals(m.getReturnType())
            && ("add".equals(m.getName()) || "addConfigured".equals(m.getName()));
}

private boolean isHiddenSetMethod(String name, Class<?> type) {
    return "setLocation".equals(name) && org.apache.tools.ant.Location.class.equals(type)
            || "setTaskType".equals(name) && java.lang.String.class.equals(type);
}

private boolean isAddTaskMethod(String name, Class<?> type) {
    return isContainer() && "addTask".equals(name) && org.apache.tools.ant.Task.class.equals(type);
}

private boolean isAddTextMethod(String name, Class<?> returnType, Class<?>[] args) {
    return "addText".equals(name) && java.lang.Void.TYPE.equals(returnType)
            && args.length == 1 && java.lang.String.class.equals(args[0]);
}

private boolean isSetMethod(String name, Class<?> returnType, Class<?>[] args) {
    return name.startsWith("set") && java.lang.Void.TYPE.equals(returnType)
            && args.length == 1 && !args[0].isArray();
}

private boolean isOverloadedMethod(AttributeSetter as, Class<?> arg) {
    return java.lang.String.class.equals(arg)
            || (java.io.File.class.equals(arg) && (Resource.class.equals(as.type) || FileProvider.class.equals(as.type)));
}

private boolean isCreateMethod(String name, Class<?> returnType, Class<?>[] args) {
    return name.startsWith("create") && !returnType.isArray()
            && !returnType.isPrimitive() && args.length == 0;
}

private boolean isAddConfiguredMethod(String name, Class<?> returnType, Class<?>[] args) {
    return name.startsWith("addConfigured")
            && java.lang.Void.TYPE.equals(returnType) && args.length == 1
            && !java.lang.String.class.equals(args[0])
            && !args[0].isArray() && !args[0].isPrimitive();
}

private boolean isAddMethod(String name, Class<?> returnType, Class<?>[] args) {
    return name.startsWith("add")
            && java.lang.Void.TYPE.equals(returnType) && args.length == 1
            && !java.lang.String.class.equals(args[0])
            && !args[0].isArray() && !args[0].isPrimitive();
}

private Constructor<?> getConstructor(Class<?> clazz) throws NoSuchMethodException {
    try {
        return clazz.getConstructor();
    } catch (NoSuchMethodException ex) {
        return clazz.getConstructor(Project.class);
    }
}