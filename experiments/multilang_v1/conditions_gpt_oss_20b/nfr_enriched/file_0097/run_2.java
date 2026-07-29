public void	setTypedVariable(
		String	name, Class type, Object value,	boolean	isFinal) 
		throws EvalError 
	{
		if (variables == null)
			variables =	new Hashtable();

		if (value == null)
			value = initializeDefaultValue(type);

		if (variables.containsKey(name))
		{
			if (!handleExistingTypedVariable(name, type, value, isFinal))
				// Existing variable was not typed or had different type
				// fall through to install new typed variable
				addNewTypedVariable(name, type, value, isFinal);
		}
		else
		{
			addNewTypedVariable(name, type, value, isFinal);
		}
	}

	/**
	 * Initialize a default value for a primitive type or {@code Primitive.NULL}
	 * for reference types.
	 */
	private Object initializeDefaultValue(Class type)
	{
		if (type.isPrimitive())
		{
			if (type == Boolean.TYPE)
				return new Primitive(Boolean.FALSE);
			if (type == Byte.TYPE)
				return new Primitive((byte)0);
			if (type == Short.TYPE)
				return new Primitive((short)0);
			if (type == Character.TYPE)
				return new Primitive((char)0);
			if (type == Integer.TYPE)
				return new Primitive((int)0);
			if (type == Long.TYPE)
				return new Primitive(0L);
			if (type == Float.TYPE)
				return new Primitive(0.0f);
			if (type == Double.TYPE)
				return new Primitive(0.0d);
		}
		return Primitive.NULL;
	}

	/**
	 * Handle the case where a variable with the given name already exists.
	 * @return {@code true} if the existing variable was typed and updated,
	 *         {@code false} otherwise.
	 */
	private boolean handleExistingTypedVariable(
		String name, Class type, Object value, boolean isFinal)
		throws EvalError
	{
		Object existing = getVariableImpl(name, false);
		if (existing instanceof TypedVariable)
		{
			TypedVariable tv = (TypedVariable) existing;
			if (tv.getType() != type)
				throw new EvalError(
					"Typed variable: " + name
					+ " was previously declared with type: "
					+ tv.getType());
			tv.setValue(value);
			return true;
		}
		return false;
	}

	/**
	 * Install a new typed variable into the namespace.
	 */
	private void addNewTypedVariable(
		String name, Class type, Object value, boolean isFinal)
	{
		variables.put(name, new TypedVariable(type, value, isFinal));
	}