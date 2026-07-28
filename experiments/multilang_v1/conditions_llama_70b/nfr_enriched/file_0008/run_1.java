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

    if (isAddTypeMethod(name, returnType, args)) {
        insertAddTypeMethod(method);
    } else if (isHiddenSetMethod(name, args[0])) {
        return;
    } else if (isContainer() && isAddTaskMethod(name, args)) {
        return;
    } else if (isAddTextMethod(name, returnType, args)) {
        addTextMethod = method;
    } else if (isSetMethod(name, returnType, args)) {
        processSetMethod(method, name, args);
    } else if (isCreateMethod(name, returnType, args)) {
        processCreateMethod(method, name, returnType);
    } else if (isAddConfiguredMethod(name, returnType, args)) {
        processAddConfiguredMethod(method, name, args);
    } else if (isAddMethod(name, returnType, args)) {
        processAddMethod(method, name, args);
    }
}

private boolean isAddTypeMethod(String name, Class<?> returnType, Class<?>[] args) {
    return args.length == 1 && java.lang.Void.TYPE.equals(returnType)
            && ("add".equals(name) || "addConfigured".equals(name));
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

private boolean isContainer() {
    return TaskContainer.class.isAssignableFrom(bean);
}

private boolean isAddTaskMethod(String name, Class<?>[] args) {
    return "addTask".equals(name) && org.apache.tools.ant.Task.class.equals(args[0]);
}

private boolean isAddTextMethod(String name, Class<?> returnType, Class<?>[] args) {
    return "addText".equals(name) && java.lang.Void.TYPE.equals(returnType)
            && args.length == 1 && java.lang.String.class.equals(args[0]);
}

private boolean isSetMethod(String name, Class<?> returnType, Class<?>[] args) {
    return name.startsWith("set") && java.lang.Void.TYPE.equals(returnType)
            && args.length == 1 && !args[0].isArray();
}

private void processSetMethod(Method method, String name, Class<?>[] args) {
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
    as = createAttributeSetter(method, args[0], propName);
    if (as != null) {
        attributeTypes.put(propName, args[0]);
        attributeSetters.put(propName, as);
    }
}

private boolean isCreateMethod(String name, Class<?> returnType, Class<?>[] args) {
    return name.startsWith("create") && !returnType.isArray()
            && !returnType.isPrimitive() && args.length == 0;
}

private void processCreateMethod(Method method, String name, Class<?> returnType) {
    String propName = getPropertyName(name, "create");
    if (nestedCreators.get(propName) == null) {
        nestedTypes.put(propName, returnType);
        nestedCreators.put(propName, new CreateNestedCreator(method));
    }
}

private boolean isAddConfiguredMethod(String name, Class<?> returnType, Class<?>[] args) {
    return name.startsWith("addConfigured")
            && java.lang.Void.TYPE.equals(returnType) && args.length == 1
            && !java.lang.String.class.equals(args[0])
            && !args[0].isArray() && !args[0].isPrimitive();
}

private void processAddConfiguredMethod(Method method, String name, Class<?>[] args) {
    try {
        Constructor<?> constructor = null;
        try {
            constructor = args[0].getConstructor();
        } catch (NoSuchMethodException ex) {
            constructor = args[0].getConstructor(Project.class);
        }
        String propName = getPropertyName(name, "addConfigured");
        nestedTypes.put(propName, args[0]);
        nestedCreators.put(propName, new AddNestedCreator(method,
                constructor, AddNestedCreator.ADD_CONFIGURED));
    } catch (NoSuchMethodException nse) {
        // ignore
    }
}

private boolean isAddMethod(String name, Class<?> returnType, Class<?>[] args) {
    return name.startsWith("add")
            && java.lang.Void.TYPE.equals(returnType) && args.length == 1
            && !java.lang.String.class.equals(args[0])
            && !args[0].isArray() && !args[0].isPrimitive();
}

private void processAddMethod(Method method, String name, Class<?>[] args) {
    try {
        Constructor<?> constructor = null;
        try {
            constructor = args[0].getConstructor();
        } catch (NoSuchMethodException ex) {
            constructor = args[0].getConstructor(Project.class);
        }
        String propName = getPropertyName(name, "add");
        if (nestedTypes.get(propName) != null) {
            return;
        }
        nestedTypes.put(propName, args[0]);
        nestedCreators.put(propName, new AddNestedCreator(method,
                constructor, AddNestedCreator.ADD));
    } catch (NoSuchMethodException nse) {
        // ignore
    }
}