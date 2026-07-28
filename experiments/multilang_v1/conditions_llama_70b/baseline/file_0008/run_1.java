private IntrospectionHelper(final Class<?> bean) {
    this.bean = bean;
    Method[] methods = bean.getMethods();
    Method addTextMethod = null;

    for (Method method : methods) {
        processMethod(method, addTextMethod);
    }

    addText = addTextMethod;
}

private void processMethod(Method method, Method addTextMethod) {
    final String name = method.getName();
    Class<?> returnType = method.getReturnType();
    Class<?>[] args = method.getParameterTypes();

    if (isAddTypeMethod(args, returnType, name)) {
        insertAddTypeMethod(method);
        return;
    }

    if (isHiddenSetMethod(name, args[0])) {
        return;
    }

    if (isAddTaskMethod(name, args[0])) {
        return;
    }

    if (isAddTextMethod(name, returnType, args[0])) {
        addTextMethod = method;
    } else if (isSetMethod(name, returnType, args[0])) {
        processSetMethod(method, args[0], name);
    } else if (isCreateMethod(name, returnType, args)) {
        processCreateMethod(method, returnType, name);
    } else if (isAddConfiguredMethod(name, returnType, args[0])) {
        processAddConfiguredMethod(method, args[0], name);
    } else if (isAddMethod(name, returnType, args[0])) {
        processAddMethod(method, args[0], name);
    }
}

private boolean isAddTypeMethod(Class<?>[] args, Class<?> returnType, String name) {
    return args.length == 1 && java.lang.Void.TYPE.equals(returnType)
            && ("add".equals(name) || "addConfigured".equals(name));
}

private boolean isHiddenSetMethod(String name, Class<?> type) {
    return ("setLocation".equals(name) && org.apache.tools.ant.Location.class.equals(type))
            || ("setTaskType".equals(name) && java.lang.String.class.equals(type));
}

private boolean isAddTaskMethod(String name, Class<?> type) {
    return isContainer() && args.length == 1 && "addTask".equals(name)
            && org.apache.tools.ant.Task.class.equals(type);
}

private boolean isAddTextMethod(String name, Class<?> returnType, Class<?> argType) {
    return "addText".equals(name) && java.lang.Void.TYPE.equals(returnType)
            && args.length == 1 && java.lang.String.class.equals(argType);
}

private boolean isSetMethod(String name, Class<?> returnType, Class<?> argType) {
    return name.startsWith("set") && java.lang.Void.TYPE.equals(returnType)
            && args.length == 1 && !argType.isArray();
}

private void processSetMethod(Method method, Class<?> argType, String name) {
    String propName = getPropertyName(name, "set");
    AttributeSetter as = (AttributeSetter) attributeSetters.get(propName);
    if (as != null) {
        if (java.lang.String.class.equals(argType)) {
            return;
        }
        if (java.io.File.class.equals(argType)) {
            if (Resource.class.equals(as.type) || FileProvider.class.equals(as.type)) {
                return;
            }
        }
    }
    as = createAttributeSetter(method, argType, propName);
    if (as != null) {
        attributeTypes.put(propName, argType);
        attributeSetters.put(propName, as);
    }
}

private boolean isCreateMethod(String name, Class<?> returnType, Class<?>[] args) {
    return name.startsWith("create") && !returnType.isArray()
            && !returnType.isPrimitive() && args.length == 0;
}

private void processCreateMethod(Method method, Class<?> returnType, String name) {
    String propName = getPropertyName(name, "create");
    if (nestedCreators.get(propName) == null) {
        nestedTypes.put(propName, returnType);
        nestedCreators.put(propName, new CreateNestedCreator(method));
    }
}

private boolean isAddConfiguredMethod(String name, Class<?> returnType, Class<?> argType) {
    return name.startsWith("addConfigured")
            && java.lang.Void.TYPE.equals(returnType) && args.length == 1
            && !java.lang.String.class.equals(argType)
            && !argType.isArray() && !argType.isPrimitive();
}

private void processAddConfiguredMethod(Method method, Class<?> argType, String name) {
    try {
        Constructor<?> constructor = null;
        try {
            constructor = argType.getConstructor();
        } catch (NoSuchMethodException ex) {
            constructor = argType.getConstructor(Project.class);
        }
        String propName = getPropertyName(name, "addConfigured");
        nestedTypes.put(propName, argType);
        nestedCreators.put(propName, new AddNestedCreator(method,
                constructor, AddNestedCreator.ADD_CONFIGURED));
    } catch (NoSuchMethodException nse) {
        // ignore
    }
}

private boolean isAddMethod(String name, Class<?> returnType, Class<?> argType) {
    return name.startsWith("add")
            && java.lang.Void.TYPE.equals(returnType) && args.length == 1
            && !java.lang.String.class.equals(argType)
            && !argType.isArray() && !argType.isPrimitive();
}

private void processAddMethod(Method method, Class<?> argType, String name) {
    try {
        Constructor<?> constructor = null;
        try {
            constructor = argType.getConstructor();
        } catch (NoSuchMethodException ex) {
            constructor = argType.getConstructor(Project.class);
        }
        String propName = getPropertyName(name, "add");
        if (nestedTypes.get(propName) != null) {
            return;
        }
        nestedTypes.put(propName, argType);
        nestedCreators.put(propName, new AddNestedCreator(method,
                constructor, AddNestedCreator.ADD));
    } catch (NoSuchMethodException nse) {
        // ignore
    }
}