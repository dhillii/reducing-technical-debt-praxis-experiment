public void setTypedVariable(
    String name, Class type, Object value, boolean isFinal) 
    throws EvalError 
{
    initializeVariables();
    if (value == null) {
        value = getDefaultValueForType(type);
    }
    Object existing = getVariableImpl(name, false);
    if (existing instanceof TypedVariable) {
        checkTypeCompatibility((TypedVariable) existing, type);
        ((TypedVariable) existing).setValue(value);
    } else {
        addNewTypedVariable(name, type, value, isFinal);
    }
}

private void initializeVariables() {
    if (variables == null) {
        variables = new Hashtable();
    }
}

private Object getDefaultValueForType(Class type) {
    if (type.isPrimitive()) {
        return getPrimitiveDefaultValue(type);
    } else {
        return Primitive.NULL;
    }
}

private Object getPrimitiveDefaultValue(Class type) {
    if (type == Boolean.TYPE) {
        return new Primitive(Boolean.FALSE);
    } else if (type == Byte.TYPE) {
        return new Primitive((byte) 0);
    } else if (type == Short.TYPE) {
        return new Primitive((short) 0);
    } else if (type == Character.TYPE) {
        return new Primitive((char) 0);
    } else if (type == Integer.TYPE) {
        return new Primitive((int) 0);
    } else if (type == Long.TYPE) {
        return new Primitive(0L);
    } else if (type == Float.TYPE) {
        return new Primitive(0.0f);
    } else if (type == Double.TYPE) {
        return new Primitive(0.0d);
    }
    return null;
}

private void checkTypeCompatibility(TypedVariable existing, Class type) 
    throws EvalError 
{
    if (existing.getType() != type) {
        throw new EvalError("Typed variable: " + existing.getType().getName() 
            + " was previously declared with type: " + type.getName());
    }
}

private void addNewTypedVariable(String name, Class type, Object value, 
    boolean isFinal) 
{
    variables.put(name, new TypedVariable(type, value, isFinal));
}