package bsh;

/**
    Wrapper for primitive types in Bsh.  This is package public because it 
	is used in the implementation of some bsh commands.

    See the note in LHS.java about wrapping objects.
*/
public class Primitive implements ParserConstants, java.io.Serializable
{
    // stored internally in java.lang. wrappers
    private Object value;

    private static class Special implements java.io.Serializable
    {
        private Special() { }

        public static final Special NULL_VALUE = new Special();
        public static final Special VOID_TYPE = new Special();
    }

    /*
        NULL means "no value".
        This ia a placeholder for primitive null value.
    */
    public static final Primitive NULL = new Primitive(Special.NULL_VALUE);

    /**
        VOID means "no type".
        Strictly speaking, this makes no sense here.  But for practical
        reasons we'll consider the lack of a type to be a special value.
    */
    public static final Primitive VOID = new Primitive(Special.VOID_TYPE);

    // private to prevent invocation with param that isn't a primitive-wrapper
    private Primitive(Object value)
    {
        if(value == null)
            throw new InterpreterError(
				"Use Primitve.NULL instead of Primitive(null)");

        this.value = value;
    }

    public Primitive(Number number) { this((Object)number); }

    public Primitive(Boolean value) { this((Object)value); }
    public Primitive(Byte value) { this((Object)value); }
    public Primitive(Short value) { this((Object)value); }
    public Primitive(Character value) { this((Object)value); }
    public Primitive(Integer value) { this((Object)value); }
    public Primitive(Long value) { this((Object)value); }
    public Primitive(Float value) { this((Object)value); }
    public Primitive(Double value) { this((Object)value); }

    public Primitive(boolean value) { this(new Boolean(value)); }
    public Primitive(byte value) { this(new Byte(value)); }
    public Primitive(short value) { this(new Short(value)); }
    public Primitive(char value) { this(new Character(value)); }
    public Primitive(int value) { this(new Integer(value)); }
    public Primitive(long value) { this(new Long(value)); }
    public Primitive(float value) { this(new Float(value)); }
    public Primitive(double value) { this(new Double(value)); }

    public Object getValue()
    {
        return getUnwrappedValue();
    }

    private Object getUnwrappedValue()
    {
        if(value == Special.NULL_VALUE)
            return null;
        else if(value == Special.VOID_TYPE)
                throw new InterpreterError("attempt to unwrap void type");
        else
            return value;
    }

    public String toString()
    {
        return getToStringRepresentation();
    }

    private String getToStringRepresentation()
    {
        if(value == Special.NULL_VALUE)
            return "null";
        else if(value == Special.VOID_TYPE)
            return "void";
        else
            return value.toString();
    }

    public Class getType()
    {
        return getType(value);
    }

    private Class getType(Object o)
    {
        return getPrimitiveType(o);
    }

    private Class getPrimitiveType(Object o)
    {
        if(o instanceof Boolean)
            return Boolean.TYPE;
        else if(o instanceof Byte)
            return Byte.TYPE;
        else if(o instanceof Short)
            return Short.TYPE;
        else if(o instanceof Character)
            return Character.TYPE;
        else if(o instanceof Integer)
            return Integer.TYPE;
        else if(o instanceof Long)
            return Long.TYPE;
        else if(o instanceof Float)
            return Float.TYPE;
        else if(o instanceof Double)
            return Double.TYPE;

        return null;
    }

    /**
     * Allow primitive operations on wrapper types such as Integer and Boolean.
     * This is static so that it can be reached from wherever...
     */
    public static Object binaryOperation(
		Object obj1, Object obj2, int kind)
        throws EvalError
    {
        return executeBinaryOperation(obj1, obj2, kind);
    }

    private static Object executeBinaryOperation(
		Object obj1, Object obj2, int kind)
        throws EvalError
    {
        // special primitive types
        checkForNull(obj1, obj2);
        checkForVoid(obj1, obj2);

        // keep track of the original types
        Class lhsOrgType = obj1.getClass();
        Class rhsOrgType = obj2.getClass();

        // Unwrap primitives
        unwrapPrimitives(obj1, obj2);

        Object[] operands = promotePrimitives(obj1, obj2);
        Object lhs = operands[0];
        Object rhs = operands[1];

        if(lhs.getClass() != rhs.getClass())
            throw new EvalError("type mismatch in operator.  " 
			+ lhs.getClass() + " cannot be used with " + rhs.getClass() );

        Object result;
        try {
            result = binaryOperationImpl( lhs, rhs, kind );
        } catch ( ArithmeticException e ) {
            throw new TargetError("Arithemetic Exception in binary op", e);
        }

        // If both original args were Primitives return a Primitive result
        // else it was mixed (wrapper/primitive) return the wrapper type
        if ( lhsOrgType == Primitive.class && rhsOrgType == Primitive.class )
            return new Primitive( result );
        else
            return result;
    }

    private static void checkForNull(Object obj1, Object obj2)
    {
        if(obj1 == NULL || obj2 == NULL)
            throw new EvalError(
				"Null value or 'null' literal in binary operation");
    }

    private static void checkForVoid(Object obj1, Object obj2)
    {
        if(obj1 == VOID || obj2 == VOID)
            throw new EvalError(
			"Undefined variable, class, or 'void' literal in binary operation");
    }

    private static void unwrapPrimitives(Object obj1, Object obj2)
    {
        if(obj1 instanceof Primitive)
            obj1 = ((Primitive)obj1).getValue();
        if(obj2 instanceof Primitive)
            obj2 = ((Primitive)obj2).getValue();
    }

    static Object binaryOperationImpl( Object lhs, Object rhs, int kind )
        throws EvalError
	{
        if(lhs instanceof Boolean)
            return booleanBinaryOperation((Boolean)lhs, (Boolean)rhs, kind);
        else if(lhs instanceof Integer)
            return intBinaryOperation( (Integer)lhs, (Integer)rhs, kind );
        else if(lhs instanceof Long)
            return longBinaryOperation((Long)lhs, (Long)rhs, kind);
        else if(lhs instanceof Float)
            return floatBinaryOperation((Float)lhs, (Float)rhs, kind);
        else if(lhs instanceof Double)
            return doubleBinaryOperation( (Double)lhs, (Double)rhs, kind);
        else
            throw new EvalError("Invalid types in binary operator" );
	}


    static Boolean booleanBinaryOperation(Boolean B1, Boolean B2, int kind)
        throws EvalError
    {
        boolean lhs = B1.booleanValue();
        boolean rhs = B2.booleanValue();

        return executeBooleanBinaryOperation(lhs, rhs, kind);
    }

    private static Boolean executeBooleanBinaryOperation(boolean lhs, boolean rhs, int kind)
        throws EvalError
    {
        switch(kind)
        {
            case EQ:
                return new Boolean(lhs == rhs);

            case NE:
                return new Boolean(lhs != rhs);

            case BOOL_OR:
            case BOOL_ORX:
                return new Boolean( lhs || rhs );

            case BOOL_AND:
            case BOOL_ANDX:
                return new Boolean( lhs && rhs );

            default:
                throw new InterpreterError("unimplemented binary operator");
        }
    }

    // returns Object covering both Long and Boolean return types
    static Object longBinaryOperation(Long L1, Long L2, int kind)
    {
        long lhs = L1.longValue();
        long rhs = L2.longValue();

        return executeLongBinaryOperation(lhs, rhs, kind);
    }

    private static Object executeLongBinaryOperation(long lhs, long rhs, int kind)
    {
        switch(kind)
        {
            // boolean
            case LT:
            case LTX:
                return new Boolean(lhs < rhs);

            case GT:
            case GTX:
                return new Boolean(lhs > rhs);

            case EQ:
                return new Boolean(lhs == rhs);

            case LE:
            case LEX:
                return new Boolean(lhs <= rhs);

            case GE:
            case GEX:
                return new Boolean(lhs >= rhs);

            case NE:
                return new Boolean(lhs != rhs);

            // arithmetic
            case PLUS:
                return new Long(lhs + rhs);

            case MINUS:
                return new Long(lhs - rhs);

            case STAR:
                return new Long(lhs * rhs);

            case SLASH:
                return new Long(lhs / rhs);

            case MOD:
                return new Long(lhs % rhs);

            // bitwise
            case LSHIFT:
            case LSHIFTX:
                return new Long(lhs << rhs);

            case RSIGNEDSHIFT:
            case RSIGNEDSHIFTX:
                return new Long(lhs >> rhs);

            case RUNSIGNEDSHIFT:
            case RUNSIGNEDSHIFTX:
                return new Long(lhs >>> rhs);

            case BIT_AND:
            case BIT_ANDX:
                return new Long(lhs & rhs);

            case BIT_OR:
            case BIT_ORX:
                return new Long(lhs | rhs);

            case XOR:
                return new Long(lhs ^ rhs);

            default:
                throw new InterpreterError("Unimplemented binary long operator");
        }
    }

    // returns Object covering both Integer and Boolean return types
    static Object intBinaryOperation(Integer I1, Integer I2, int kind)
    {
        int lhs = I1.intValue();
        int rhs = I2.intValue();

        return executeIntBinaryOperation(lhs, rhs, kind);
    }

    private static Object executeIntBinaryOperation(int lhs, int rhs, int kind)
    {
        switch(kind)
        {
            // boolean
            case LT:
            case LTX:
                return new Boolean(lhs < rhs);

            case GT:
            case GTX:
                return new Boolean(lhs > rhs);

            case EQ:
                return new Boolean(lhs == rhs);

            case LE:
            case LEX:
                return new Boolean(lhs <= rhs);

            case GE:
            case GEX:
                return new Boolean(lhs >= rhs);

            case NE:
                return new Boolean(lhs != rhs);

            // arithmetic
            case PLUS:
                return new Integer(lhs + rhs);

            case MINUS:
                return new Integer(lhs - rhs);

            case STAR:
                return new Integer(lhs * rhs);

            case SLASH:
                return new Integer(lhs / rhs);

            case MOD:
                return new Integer(lhs % rhs);

            // bitwise
            case LSHIFT:
            case LSHIFTX:
                return new Integer(lhs << rhs);

            case RSIGNEDSHIFT:
            case RSIGNEDSHIFTX:
                return new Integer(lhs >> rhs);

            case RUNSIGNEDSHIFT:
            case RUNSIGNEDSHIFTX:
                return new Integer(lhs >>> rhs);

            case BIT_AND:
            case BIT_ANDX:
                return new Integer(lhs & rhs);

            case BIT_OR:
            case BIT_ORX:
                return new Integer(lhs | rhs);

            case XOR:
                return new Integer(lhs ^ rhs);

            default:
                throw new InterpreterError("Unimplemented binary integer operator");
        }
    }

    // returns Object covering both Double and Boolean return types
    static Object doubleBinaryOperation(Double D1, Double D2, int kind)
        throws EvalError
    {
        double lhs = D1.doubleValue();
        double rhs = D2.doubleValue();

        return executeDoubleBinaryOperation(lhs, rhs, kind);
    }

    private static Object executeDoubleBinaryOperation(double lhs, double rhs, int kind)
        throws EvalError
    {
        switch(kind)
        {
            // boolean
            case LT:
            case LTX:
                return new Boolean(lhs < rhs);

            case GT:
            case GTX:
                return new Boolean(lhs > rhs);

            case EQ:
                return new Boolean(lhs == rhs);

            case LE:
            case LEX:
                return new Boolean(lhs <= rhs);

            case GE:
            case GEX:
                return new Boolean(lhs >= rhs);

            case NE:
                return new Boolean(lhs != rhs);

            // arithmetic
            case PLUS:
                return new Double(lhs + rhs);

            case MINUS:
                return new Double(lhs - rhs);

            case STAR:
                return new Double(lhs * rhs);

            case SLASH:
                return new Double(lhs / rhs);

            case MOD:
                return new Double(lhs % rhs);

            // can't shift floating-point values
            case LSHIFT:
            case LSHIFTX:
            case RSIGNEDSHIFT:
            case RSIGNEDSHIFTX:
            case RUNSIGNEDSHIFT:
            case RUNSIGNEDSHIFTX:
                throw new EvalError("Can't shift doubles");

            default:
                throw new InterpreterError("Unimplemented binary double operator");
        }
    }
    // returns Object covering both Long and Boolean return types
    static Object floatBinaryOperation(Float F1, Float F2, int kind)
        throws EvalError
    {
        float lhs = F1.floatValue();
        float rhs = F2.floatValue();

        return executeFloatBinaryOperation(lhs, rhs, kind);
    }

    private static Object executeFloatBinaryOperation(float lhs, float rhs, int kind)
        throws EvalError
    {
        switch(kind)
        {
            // boolean
            case LT:
            case LTX:
                return new Boolean(lhs < rhs);

            case GT:
            case GTX:
                return new Boolean(lhs > rhs);

            case EQ:
                return new Boolean(lhs == rhs);

            case LE:
            case LEX:
                return new Boolean(lhs <= rhs);

            case GE:
            case GEX:
                return new Boolean(lhs >= rhs);

            case NE:
                return new Boolean(lhs != rhs);

            // arithmetic
            case PLUS:
                return new Float(lhs + rhs);

            case MINUS:
                return new Float(lhs - rhs);

            case STAR:
                return new Float(lhs * rhs);

            case SLASH:
                return new Float(lhs / rhs);

            case MOD:
                return new Float(lhs % rhs);

            // can't shift floats
            case LSHIFT:
            case LSHIFTX:
            case RSIGNEDSHIFT:
            case RSIGNEDSHIFTX:
            case RUNSIGNEDSHIFT:
            case RUNSIGNEDSHIFTX:
                throw new EvalError("Can't shift floats ");

            default:
                throw new InterpreterError("Unimplemented binary float operator");
        }
    }

	/**
		Promote primitive wrapper type to to Integer wrapper type
		Can we use the castPrimitive() (in BSHCastExpression) for this?
	*/
    static Object promoteToInteger(Object primitive)
    {
        if(primitive instanceof Character)
            return new Integer(((Character)primitive).charValue());
        else if((primitive instanceof Byte) || (primitive instanceof Short))
            return new Integer(((Number)primitive).intValue());

        return primitive;
    }

	/**
		Promote the pair of primitives to the maximum type of the two.
		e.g. [int,long]->[long,long]
	*/
    static Object[] promotePrimitives(Object lhs, Object rhs)
    {
        lhs = promoteToInteger(lhs);
        rhs = promoteToInteger(rhs);

        if((lhs instanceof Number) && (rhs instanceof Number))
        {
            Number lnum = (Number)lhs;
            Number rnum = (Number)rhs;

            boolean b;

            if((b = (lnum instanceof Double)) || (rnum instanceof Double))
            {
                if(b)
                    rhs = new Double(rnum.doubleValue());
                else
                    lhs = new Double(lnum.doubleValue());
            }
            else if((b = (lnum instanceof Float)) || (rnum instanceof Float))
            {
                if(b)
                    rhs = new Float(rnum.floatValue());
                else
                    lhs = new Float(lnum.floatValue());
            }
            else if((b = (lnum instanceof Long)) || (rnum instanceof Long))
            {
                if(b)
                    rhs = new Long(rnum.longValue());
                else
                    lhs = new Long(lnum.longValue());
            }
        }

        return new Object[] { lhs, rhs };
    }

    public static Primitive unaryOperation(Primitive val, int kind)
        throws EvalError
    {
        if(val == NULL)
            throw new EvalError("illegal use of null object or 'null' literal");
        if(val == VOID)
            throw new EvalError("illegal use of undefined object or 'void' literal");

        Class operandType = val.getType();
        Object operand = promoteToInteger(val.getValue());

        if(operand instanceof Boolean)
            return new Primitive(booleanUnaryOperation((Boolean)operand, kind));
        else if(operand instanceof Integer)
        {
            int result = intUnaryOperation((Integer)operand, kind);

            // ++ and -- must be cast back the original type
            if(kind == INCR || kind == DECR)
            {
                if(operandType == Byte.TYPE)
                    return new Primitive((byte)result);
                if(operandType == Short.TYPE)
                    return new Primitive((short)result);
                if(operandType == Character.TYPE)
                    return new Primitive((char)result);
            }

            return new Primitive(result);
        }
        else if(operand instanceof Long)
            return new Primitive(longUnaryOperation((Long)operand, kind));
        else if(operand instanceof Float)
            return new Primitive(floatUnaryOperation((Float)operand, kind));
        else if(operand instanceof Double)
            return new Primitive(doubleUnaryOperation((Double)operand, kind));
        else
            throw new InterpreterError("An error occurred.  Please call technical support.");
    }

    static boolean booleanUnaryOperation(Boolean B, int kind) throws EvalError
    {
        boolean operand = B.booleanValue();
        return executeBooleanUnaryOperation(operand, kind);
    }

    private static boolean executeBooleanUnaryOperation(boolean operand, int kind) throws EvalError
    {
        switch(kind)
        {
            case BANG:
                return !operand;

            default:
                throw new EvalError("Operator inappropriate for boolean");
        }
    }

    static int intUnaryOperation(Integer I, int kind)
    {
        int operand = I.intValue();
        return executeIntUnaryOperation(operand, kind);
    }

    private static int executeIntUnaryOperation(int operand, int kind)
    {
        switch(kind)
        {
            case PLUS:
                return operand;

            case MINUS:
                return -operand;

            case TILDE:
                return ~operand;

            case INCR:
                return operand + 1;

            case DECR:
                return operand - 1;

            default:
                throw new InterpreterError("bad integer unaryOperation");
        }
    }

    static long longUnaryOperation(Long L, int kind)
    {
        long operand = L.longValue();
        return executeLongUnaryOperation(operand, kind);
    }

    private static long executeLongUnaryOperation(long operand, int kind)
    {
        switch(kind)
        {
            case PLUS:
                return operand;

            case MINUS:
                return -operand;

            case TILDE:
                return ~operand;

            case INCR:
                return operand + 1;

            case DECR:
                return operand - 1;

            default:
                throw new InterpreterError("bad long unaryOperation");
        }
    }

    static float floatUnaryOperation(Float F, int kind)
    {
        float operand = F.floatValue();
        return executeFloatUnaryOperation(operand, kind);
    }

    private static float executeFloatUnaryOperation(float operand, int kind)
    {
        switch(kind)
        {
            case PLUS:
                return operand;

            case MINUS:
                return -operand;

            default:
                throw new InterpreterError("bad float unaryOperation");
        }
    }

    static double doubleUnaryOperation(Double D, int kind)
    {
        double operand = D.doubleValue();
        return executeDoubleUnaryOperation(operand, kind);
    }

    private static double executeDoubleUnaryOperation(double operand, int kind)
    {
        switch(kind)
        {
            case PLUS:
                return operand;

            case MINUS:
                return -operand;

            default:
                throw new InterpreterError("bad double unaryOperation");
        }
    }

    public int intValue() throws EvalError
    {
        if(value instanceof Number)
            return((Number)value).intValue();
        else
            throw new EvalError("Primitive not a number");
    }

    public boolean booleanValue() throws EvalError
    {
        if(value instanceof Boolean)
            return((Boolean)value).booleanValue();
        else
            throw new EvalError("Primitive not a boolean");
    }

	/**
		Are we a numeric type:
		i.e. not boolean, null, or void
		(but including char)
	*/
	public boolean isNumber() {
		return ( !(value instanceof Boolean) 
			&& !(this == NULL) && !(this == VOID) );
	}

    public Number numberValue() throws EvalError
    {
		Object value = this.value;

		// Promote character to Number type for these purposes
		if (value instanceof Character)
			value = new Integer(((Character)value).charValue());

        if (value instanceof Number)
            return (Number)value;
        else
            throw new EvalError("Primitive not a number");
    }

	public boolean equals( Object obj ) {
		if ( obj instanceof Primitive )
			return ((Primitive)obj).value.equals( this.value );
		else
			return obj.equals( this.value );
	}

	/**
		Unwrap primitive values and map voids to nulls.
		Normal (non Primitive) types remain unchanged.
		@param obj object type which may be bsh.Primitive
		@return corresponding "normal" Java type, "unwrapping" 
			any bsh.Primitive types to their wrapper types.
	*/
	public static Object unwrap( Object obj ) {
		if ( obj == null )
			return null;

        // map voids to nulls for the outside world
        if(obj == Primitive.VOID)
            return null;

        // unwrap primitives
        if(obj instanceof Primitive)
            return((Primitive)obj).getValue();
        else
            return obj;
	}


}