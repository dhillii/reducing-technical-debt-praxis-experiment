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

    if (isAddTypeMethod(method)) {
        insertAddTypeMethod(method);
    } else if (isHiddenSetMethod(name, args[0])) {
        return;
    } else if (isContainer() && isAddTaskMethod(method)) {
        return;
    } else if (isAddTextMethod(method)) {
        addTextMethod = method;
    } else if (isSetMethod(method)) {
        processSetMethod(method);
    } else if (isCreateMethod(method)) {
        processCreateMethod(method);
    } else if (isAddConfiguredMethod(method)) {
        processAddConfiguredMethod(method);
    } else if (isAddMethod(method)) {
        processAddMethod(method);
    }
}

private boolean isAddTypeMethod(Method method) {
    return method.getParameterTypes().length == 1 && java.lang.Void.TYPE.equals(method.getReturnType())
            && ("add".equals(method.getName()) || "addConfigured".equals(method.getName()));
}

private boolean isHiddenSetMethod(String name, Class<?> type) {
    return ("setLocation".equals(name) && org.apache.tools.ant.Location.class.equals(type))
            || ("setTaskType".equals(name) && java.lang.String.class.equals(type));
}

private boolean isContainer() {
    return TaskContainer.class.isAssignableFrom(bean);
}

private boolean isAddTaskMethod(Method method) {
    return "addTask".equals(method.getName()) && org.apache.tools.ant.Task.class.equals(method.getParameterTypes()[0]);
}

private boolean isAddTextMethod(Method method) {
    return "addText".equals(method.getName()) && java.lang.Void.TYPE.equals(method.getReturnType())
            && method.getParameterTypes().length == 1 && java.lang.String.class.equals(method.getParameterTypes()[0]);
}

private boolean isSetMethod(Method method) {
    return method.getName().startsWith("set") && java.lang.Void.TYPE.equals(method.getReturnType())
            && method.getParameterTypes().length == 1 && !method.getParameterTypes()[0].isArray();
}

private void processSetMethod(Method method) {
    String propName = getPropertyName(method.getName(), "set");
    AttributeSetter as = (AttributeSetter) attributeSetters.get(propName);
    if (as != null) {
        if (java.lang.String.class.equals(method.getParameterTypes()[0])) {
            return;
        }
        if (java.io.File.class.equals(method.getParameterTypes()[0])) {
            if (Resource.class.equals(as.type) || FileProvider.class.equals(as.type)) {
                return;
            }
        }
    }
    as = createAttributeSetter(method, method.getParameterTypes()[0], propName);
    if (as != null) {
        attributeTypes.put(propName, method.getParameterTypes()[0]);
        attributeSetters.put(propName, as);
    }
}

private boolean isCreateMethod(Method method) {
    return method.getName().startsWith("create") && !method.getReturnType().isArray()
            && !method.getReturnType().isPrimitive() && method.getParameterTypes().length == 0;
}

private void processCreateMethod(Method method) {
    String propName = getPropertyName(method.getName(), "create");
    if (nestedCreators.get(propName) == null) {
        nestedTypes.put(propName, method.getReturnType());
        nestedCreators.put(propName, new CreateNestedCreator(method));
    }
}

private boolean isAddConfiguredMethod(Method method) {
    return method.getName().startsWith("addConfigured") && java.lang.Void.TYPE.equals(method.getReturnType())
            && method.getParameterTypes().length == 1 && !java.lang.String.class.equals(method.getParameterTypes()[0])
            && !method.getParameterTypes()[0].isArray() && !method.getParameterTypes()[0].isPrimitive();
}

private void processAddConfiguredMethod(Method method) {
    try {
        Constructor<?> constructor = null;
        try {
            constructor = method.getParameterTypes()[0].getConstructor();
        } catch (NoSuchMethodException ex) {
            constructor = method.getParameterTypes()[0].getConstructor(Project.class);
        }
        String propName = getPropertyName(method.getName(), "addConfigured");
        nestedTypes.put(propName, method.getParameterTypes()[0]);
        nestedCreators.put(propName, new AddNestedCreator(method, constructor, AddNestedCreator.ADD_CONFIGURED));
    } catch (NoSuchMethodException nse) {
        // ignore
    }
}

private boolean isAddMethod(Method method) {
    return method.getName().startsWith("add") && java.lang.Void.TYPE.equals(method.getReturnType())
            && method.getParameterTypes().length == 1 && !java.lang.String.class.equals(method.getParameterTypes()[0])
            && !method.getParameterTypes()[0].isArray() && !method.getParameterTypes()[0].isPrimitive();
}

private void processAddMethod(Method method) {
    try {
        Constructor<?> constructor = null;
        try {
            constructor = method.getParameterTypes()[0].getConstructor();
        } catch (NoSuchMethodException ex) {
            constructor = method.getParameterTypes()[0].getConstructor(Project.class);
        }
        String propName = getPropertyName(method.getName(), "add");
        if (nestedTypes.get(propName) != null) {
            return;
        }
        nestedTypes.put(propName, method.getParameterTypes()[0]);
        nestedCreators.put(propName, new AddNestedCreator(method, constructor, AddNestedCreator.ADD));
    } catch (NoSuchMethodException nse) {
        // ignore
    }
}