public void setTypedVariable(String name, Class type, Object value, boolean isFinal) throws EvalError {
    if (variables == null) {
        variables = new Hashtable();
    }

    if (value == null) {
        value = getDefaultValueForType(type);
    }

    Object existing = getVariableImpl(name, false);

    if (existing instanceof TypedVariable) {
        if (((TypedVariable) existing).getType() != type) {
            throw new EvalError("Typed variable: " + name + " was previously declared with type: " + ((TypedVariable) existing).getType());
        } else {
            ((TypedVariable) existing).setValue(value);
            return;
        }
    }

    variables.put(name, new TypedVariable(type, value, isFinal));
}

private Object getDefaultValueForType(Class type) {
    if (type.isPrimitive()) {
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
    } else {
        return Primitive.NULL;
    }
    return null;
}