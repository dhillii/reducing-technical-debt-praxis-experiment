public void	setTypedVariable(
		String	name, Class type, Object value,	boolean	isFinal) 
		throws EvalError 
	{
		if (variables == null)
			variables =	new Hashtable();

		if (value == null)
			value = defaultValueForType(type);

		if (variables.containsKey(name)) {
			Object existing = getVariableImpl(name, false);
			if (existing instanceof TypedVariable) {
				TypedVariable tv = (TypedVariable) existing;
				if (tv.getType() != type)
					throw new EvalError(
						"Typed variable: " + name
						+ " was previously declared with type: "
						+ tv.getType());
				tv.setValue(value);
				return;
			}
		}

		variables.put(name, new TypedVariable(type, value, isFinal));
	}

    /**
     * Return the default value for a primitive type or {@link Primitive#NULL}
     * for reference types.  This method is used when {@code value} is {@code null}
     * in {@link #setTypedVariable(String, Class, Object, boolean)}.
     */
    private Object defaultValueForType(Class type) {
		if (type.isPrimitive()) {
			if (type == Boolean.TYPE)
				return new Primitive(Boolean.FALSE);
			if (type == Byte.TYPE)
				return new Primitive((byte) 0);
			if (type == Short.TYPE)
				return new Primitive((short) 0);
			if (type == Character.TYPE)
				return new Primitive((char) 0);
			if (type == Integer.TYPE)
				return new Primitive((int) 0);
			if (type == Long.TYPE)
				return new Primitive(0L);
			if (type == Float.TYPE)
				return new Primitive(0.0f);
			if (type == Double.TYPE)
				return new Primitive(0.0d);
		}
		return Primitive.NULL;
	}