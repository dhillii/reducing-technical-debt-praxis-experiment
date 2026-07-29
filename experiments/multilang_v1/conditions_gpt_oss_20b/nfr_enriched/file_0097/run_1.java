/**
     * Set the typed variable with the value.  
     * An existing typed variable may only be set to the same type.
     * If an untyped variable exists it will be overridden with the new
     * typed var.
     * The set will perform a getAssignableForm() on the value if necessary.
     *
     * <p>
     * Note: this method is primarily intended for use internally.  If you use
     * this method outside of the bsh package and wish to set variables with
     * primitive values you will have to wrap them using bsh.Primitive.
     * @see bsh.Primitive
     *
     * @param value If value is null, you'll get the default value for the type
     */
    public void setTypedVariable(
            String name, Class type, Object value, boolean isFinal)
            throws EvalError
    {
        if (variables == null)
            variables = new Hashtable();

        if (value == null) {
            value = defaultValueForType(type);
        }

        Object existing = getVariableImpl(name, false);
        if (existing instanceof TypedVariable) {
            TypedVariable tv = (TypedVariable) existing;
            if (tv.getType() != type) {
                throw new EvalError("Typed variable: " + name
                        + " was previously declared with type: "
                        + tv.getType());
            }
            tv.setValue(value);
            return;
        }

        // Override any untyped variable or install new typed variable
        variables.put(name, new TypedVariable(type, value, isFinal));
    }

    /**
     * Return the default value for a primitive type wrapped in a Primitive.
     * For non‑primitive types, Primitive.NULL is returned.
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
                return new Primitive(0);
            if (type == Long.TYPE)
                return new Primitive(0L);
            if (type == Float.TYPE)
                return new Primitive(0.0f);
            if (type == Double.TYPE)
                return new Primitive(0.0d);
        }
        return Primitive.NULL;
    }