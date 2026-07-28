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

        if (isContainer() && isAddTaskMethod(m)) {
            continue;
        }

        if (isAddTextMethod(m)) {
            addTextMethod = m;
        } else if (isSetMethod(m)) {
            String propName = getPropertyName(name, "set");
            AttributeSetter as = (AttributeSetter) attributeSetters.get(propName);
            if (as != null) {
                if (isStringArg(m)) {
                    continue;
                }
                if (isFileArg(m)) {
                    if (isResourceOrFileProviderArg(as)) {
                        continue;
                    }
                }
            }
            as = createAttributeSetter(m, args[0], propName);
            if (as != null) {
                attributeTypes.put(propName, args[0]);
                attributeSetters.put(propName, as);
            }
        } else if (isCreateMethod(m)) {
            String propName = getPropertyName(name, "create");
            if (nestedCreators.get(propName) == null) {
                nestedTypes.put(propName, returnType);
                nestedCreators.put(propName, new CreateNestedCreator(m));
            }
        } else if (isAddConfiguredMethod(m)) {
            try {
                Constructor<?> constructor = getConstructor(args[0]);
                String propName = getPropertyName(name, "addConfigured");
                nestedTypes.put(propName, args[0]);
                nestedCreators.put(propName, new AddNestedCreator(m, constructor, AddNestedCreator.ADD_CONFIGURED));
            } catch (NoSuchMethodException nse) {
                // ignore
            }
        } else if (isAddMethod(m)) {
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
    return argsLengthIsOne(m) && returnTypeIsVoid(m) && (m.getName().equals("add") || m.getName().equals("addConfigured"));
}

private boolean isHiddenSetMethod(String name, Class<?> type) {
    return ("setLocation".equals(name) && org.apache.tools.ant.Location.class.equals(type))
            || ("setTaskType".equals(name) && java.lang.String.class.equals(type));
}

private boolean isContainer() {
    return TaskContainer.class.isAssignableFrom(bean);
}

private boolean isAddTaskMethod(Method m) {
    return argsLengthIsOne(m) && "addTask".equals(m.getName()) && org.apache.tools.ant.Task.class.equals(m.getParameterTypes()[0]);
}

private boolean isAddTextMethod(Method m) {
    return m.getName().equals("addText") && returnTypeIsVoid(m) && argsLengthIsOne(m) && java.lang.String.class.equals(m.getParameterTypes()[0]);
}

private boolean isSetMethod(Method m) {
    return m.getName().startsWith("set") && returnTypeIsVoid(m) && argsLengthIsOne(m) && !m.getParameterTypes()[0].isArray();
}

private boolean isStringArg(Method m) {
    return java.lang.String.class.equals(m.getParameterTypes()[0]);
}

private boolean isFileArg(Method m) {
    return java.io.File.class.equals(m.getParameterTypes()[0]);
}

private boolean isResourceOrFileProviderArg(AttributeSetter as) {
    return Resource.class.equals(as.type) || FileProvider.class.equals(as.type);
}

private boolean isCreateMethod(Method m) {
    return m.getName().startsWith("create") && !returnTypeIsArray(m) && !returnTypeIsPrimitive(m) && argsLengthIsZero(m);
}

private boolean isAddConfiguredMethod(Method m) {
    return m.getName().startsWith("addConfigured") && returnTypeIsVoid(m) && argsLengthIsOne(m) && !java.lang.String.class.equals(m.getParameterTypes()[0])
            && !m.getParameterTypes()[0].isArray() && !m.getParameterTypes()[0].isPrimitive();
}

private boolean isAddMethod(Method m) {
    return m.getName().startsWith("add") && returnTypeIsVoid(m) && argsLengthIsOne(m) && !java.lang.String.class.equals(m.getParameterTypes()[0])
            && !m.getParameterTypes()[0].isArray() && !m.getParameterTypes()[0].isPrimitive();
}

private boolean argsLengthIsOne(Method m) {
    return m.getParameterTypes().length == 1;
}

private boolean argsLengthIsZero(Method m) {
    return m.getParameterTypes().length == 0;
}

private boolean returnTypeIsVoid(Method m) {
    return java.lang.Void.TYPE.equals(m.getReturnType());
}

private boolean returnTypeIsArray(Method m) {
    return m.getReturnType().isArray();
}

private boolean returnTypeIsPrimitive(Method m) {
    return m.getReturnType().isPrimitive();
}

private Constructor<?> getConstructor(Class<?> clazz) throws NoSuchMethodException {
    try {
        return clazz.getConstructor();
    } catch (NoSuchMethodException ex) {
        return clazz.getConstructor(Project.class);
    }
}