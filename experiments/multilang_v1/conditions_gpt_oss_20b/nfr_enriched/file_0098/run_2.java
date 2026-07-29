package bsh;

/**
 * Wrapper for primitive types in Bsh.  This is package public because it
 * is used in the implementation of some bsh commands.
 *
 * <p>All primitive values are stored internally as java.lang wrappers.
 * The {@code value} field is marked {@code transient} to avoid serialization
 * of non-serializable wrapper objects.</p>
 */
public class Primitive implements ParserConstants, java.io.Serializable
{
    // stored internally in java.lang. wrappers
    private transient Object value;

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
        if(value == Special.NULL_VALUE)
            return null;
        else if(value == Special.VOID_TYPE)
                throw new InterpreterError("attempt to unwrap void type");
        else
            return value;
    }

    public String toString()
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
        // special primitive types
        if(obj1 == NULL || obj2 == NULL)
            throw new EvalError(
                "Null value or 'null' literal in binary operation");
        if(obj1 == VOID || obj2 == VOID)
            throw new EvalError(
                "Undefined variable, class, or 'void' literal in binary operation");

        // keep track of the original types
        Class lhsOrgType = obj1.getClass();
        Class rhsOrgType = obj2.getClass();

        // Unwrap primitives
        if(obj1 instanceof Primitive)
            obj1 = ((Primitive)obj1).getValue();
        if(obj2 instanceof Primitive)
            obj2 = ((Primitive)obj2).getValue();

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

        switch(kind)
        {
            case EQ:
                return Boolean.valueOf(lhs == rhs);

            case NE:
                return Boolean.valueOf(lhs != rhs);

            case BOOL_OR:
            case BOOL_ORX:
                return Boolean.valueOf( lhs || rhs );

            case BOOL_AND:
            case BOOL_ANDX:
                return Boolean.valueOf( lhs && rhs );

            default:
                throw new InterpreterError("unimplemented binary operator");
        }
    }

    // --------------------------------------------------------------------
    // Long binary operations split into comparison, arithmetic, and bitwise
    // --------------------------------------------------------------------

    static Object longBinaryOperation(Long L1, Long L2, int kind)
    {
        long lhs = L1.longValue();
        long rhs = L2.longValue();

        switch(kind)
        {
            case LT:
            case LTX:
            case GT:
            case GTX:
            case EQ:
            case LE:
            case LEX:
            case GE:
            case GEX:
            case NE:
                return compareLong(lhs, rhs, kind);

            case PLUS:
            case MINUS:
            case STAR:
            case SLASH:
            case MOD:
                return arithmeticLong(lhs, rhs, kind);

            case LSHIFT:
            case LSHIFTX:
            case RSIGNEDSHIFT:
            case RSIGNEDSHIFTX:
            case RUNSIGNEDSHIFT:
            case RUNSIGNEDSHIFTX:
            case BIT_AND:
            case BIT_ANDX:
            case BIT_OR:
            case BIT_ORX:
            case XOR:
                return bitwiseLong(lhs, rhs, kind);

            default:
                throw new InterpreterError("Unimplemented binary long operator");
        }
    }

    /**
     * Compare two long values according to the operator kind.
     */
    private static Boolean compareLong(long lhs, long rhs, int kind)
    {
        switch(kind)
        {
            case LT:
            case LTX:
                return Boolean.valueOf(lhs < rhs);
            case GT:
            case GTX:
                return Boolean.valueOf(lhs > rhs);
            case EQ:
                return Boolean.valueOf(lhs == rhs);
            case LE:
            case LEX:
                return Boolean.valueOf(lhs <= rhs);
            case GE:
            case GEX:
                return Boolean.valueOf(lhs >= rhs);
            case NE:
                return Boolean.valueOf(lhs != rhs);
            default:
                throw new InterpreterError("Invalid comparison operator for long");
        }
    }

    /**
     * Perform arithmetic on two long values according to the operator kind.
     */
    private static Long arithmeticLong(long lhs, long rhs, int kind)
    {
        switch(kind)
        {
            case PLUS:
                return Long.valueOf(lhs + rhs);
            case MINUS:
                return Long.valueOf(lhs - rhs);
            case STAR:
                return Long.valueOf(lhs * rhs);
            case SLASH:
                return Long.valueOf(lhs / rhs);
            case MOD:
                return Long.valueOf(lhs % rhs);
            default:
                throw new InterpreterError("Invalid arithmetic operator for long");
        }
    }

    /**
     * Perform bitwise operations on two long values according to the operator kind.
     */
    private static Long bitwiseLong(long lhs, long rhs, int kind)
    {
        switch(kind)
        {
            case LSHIFT:
            case LSHIFTX:
                return Long.valueOf(lhs << rhs);
            case RSIGNEDSHIFT:
            case RSIGNEDSHIFTX:
                return Long.valueOf(lhs >> rhs);
            case RUNSIGNEDSHIFT:
            case RUNSIGNEDSHIFTX:
                return Long.valueOf(lhs >>> rhs);
            case BIT_AND:
            case BIT_ANDX:
                return Long.valueOf(lhs & rhs);
            case BIT_OR:
            case BIT_ORX:
                return Long.valueOf(lhs | rhs);
            case XOR:
                return Long.valueOf(lhs ^ rhs);
            default:
                throw new InterpreterError("Invalid bitwise operator for long");
        }
    }

    // --------------------------------------------------------------------
    // Integer binary operations split into comparison, arithmetic, and bitwise
    // --------------------------------------------------------------------

    static Object intBinaryOperation(Integer I1, Integer I2, int kind)
    {
        int lhs = I1.intValue();
        int rhs = I2.intValue();

        switch(kind)
        {
            case LT:
            case LTX:
            case GT:
            case GTX:
            case EQ:
            case LE:
            case LEX:
            case GE:
            case GEX:
            case NE:
                return compareInt(lhs, rhs, kind);

            case PLUS:
            case MINUS:
            case STAR:
            case SLASH:
            case MOD:
                return arithmeticInt(lhs, rhs, kind);

            case LSHIFT:
            case LSHIFTX:
            case RSIGNEDSHIFT:
            case RSIGNEDSHIFTX:
            case RUNSIGNEDSHIFT:
            case RUNSIGNEDSHIFTX:
            case BIT_AND:
            case BIT_ANDX:
            case BIT_OR:
            case BIT_ORX:
            case XOR:
                return bitwiseInt(lhs, rhs, kind);

            default:
                throw new InterpreterError("Unimplemented binary integer operator");
        }
    }

    private static Boolean compareInt(int lhs, int rhs, int kind)
    {
        switch(kind)
        {
            case LT:
            case LTX:
                return Boolean.valueOf(lhs < rhs);
            case GT:
            case GTX:
                return Boolean.valueOf(lhs > rhs);
            case EQ:
                return Boolean.valueOf(lhs == rhs);
            case LE:
            case LEX:
                return Boolean.valueOf(lhs <= rhs);
            case GE:
            case GEX:
                return Boolean.valueOf(lhs >= rhs);
            case NE:
                return Boolean.valueOf(lhs != rhs);
            default:
                throw new InterpreterError("Invalid comparison operator for int");
        }
    }

    private static Integer arithmeticInt(int lhs, int rhs, int kind)
    {
        switch(kind)
        {
            case PLUS:
                return Integer.valueOf(lhs + rhs);
            case MINUS:
                return Integer.valueOf(lhs - rhs);
            case STAR:
                return Integer.valueOf(lhs * rhs);
            case SLASH:
                return Integer.valueOf(lhs / rhs);
            case MOD:
                return Integer.valueOf(lhs % rhs);
            default:
                throw new InterpreterError("Invalid arithmetic operator for int");
        }
    }

    private static Integer bitwiseInt(int lhs, int rhs, int kind)
    {
        switch(kind)
        {
            case LSHIFT:
            case LSHIFTX:
                return Integer.valueOf(lhs << rhs);
            case RSIGNEDSHIFT:
            case RSIGNEDSHIFTX:
                return Integer.valueOf(lhs >> rhs);
            case RUNSIGNEDSHIFT:
            case RUNSIGNEDSHIFTX:
                return Integer.valueOf(lhs >>> rhs);
            case BIT_AND:
            case BIT_ANDX:
                return Integer.valueOf(lhs & rhs);
            case BIT_OR:
            case BIT_ORX:
                return Integer.valueOf(lhs | rhs);
            case XOR:
                return Integer.valueOf(lhs ^ rhs);
            default:
                throw new InterpreterError("Invalid bitwise operator for int");
        }
    }

    // --------------------------------------------------------------------
    // Double binary operations split into comparison, arithmetic, and shift error
    // --------------------------------------------------------------------

    static Object doubleBinaryOperation(Double D1, Double D2, int kind)
        throws EvalError
    {
        double lhs = D1.doubleValue();
        double rhs = D2.doubleValue();

        switch(kind)
        {
            case LT:
            case LTX:
            case GT:
            case GTX:
            case EQ:
            case LE:
            case LEX:
            case GE:
            case GEX:
            case NE:
                return compareDouble(lhs, rhs, kind);

            case PLUS:
            case MINUS:
            case STAR:
            case SLASH:
            case MOD:
                return arithmeticDouble(lhs, rhs, kind);

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

    private static Boolean compareDouble(double lhs, double rhs, int kind)
    {
        switch(kind)
        {
            case LT:
            case LTX:
                return Boolean.valueOf(lhs < rhs);
            case GT:
            case GTX:
                return Boolean.valueOf(lhs > rhs);
            case EQ:
                return Boolean.valueOf(lhs == rhs);
            case LE:
            case LEX:
                return Boolean.valueOf(lhs <= rhs);
            case GE:
            case GEX:
                return Boolean.valueOf(lhs >= rhs);
            case NE:
                return Boolean.valueOf(lhs != rhs);
            default:
                throw new InterpreterError("Invalid comparison operator for double");
        }
    }

    private static Double arithmeticDouble(double lhs, double rhs, int kind)
    {
        switch(kind)
        {
            case PLUS:
                return Double.valueOf(lhs + rhs);
            case MINUS:
                return Double.valueOf(lhs - rhs);
            case STAR:
                return Double.valueOf(lhs * rhs);
            case SLASH:
                return Double.valueOf(lhs / rhs);
            case MOD:
                return Double.valueOf(lhs % rhs);
            default:
                throw new InterpreterError("Invalid arithmetic operator for double");
        }
    }

    // --------------------------------------------------------------------
    // Float binary operations split into comparison, arithmetic, and shift error
    // --------------------------------------------------------------------

    static Object floatBinaryOperation(Float F1, Float F2, int kind)
        throws EvalError
    {
        float lhs = F1.floatValue();
        float rhs = F2.floatValue();

        switch(kind)
        {
            case LT:
            case LTX:
            case GT:
            case GTX:
            case EQ:
            case LE:
            case LEX:
            case GE:
            case GEX:
            case NE:
                return compareFloat(lhs, rhs, kind);

            case PLUS:
            case MINUS:
            case STAR:
            case SLASH:
            case MOD:
                return arithmeticFloat(lhs, rhs, kind);

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

    private static Boolean compareFloat(float lhs, float rhs, int kind)
    {
        switch(kind)
        {
            case LT:
            case LTX:
                return Boolean.valueOf(lhs < rhs);
            case GT:
            case GTX:
                return Boolean.valueOf(lhs > rhs);
            case EQ:
                return Boolean.valueOf(lhs == rhs);
            case LE:
            case LEX:
                return Boolean.valueOf(lhs <= rhs);
            case GE:
            case GEX:
                return Boolean.valueOf(lhs >= rhs);
            case NE:
                return Boolean.valueOf(lhs != rhs);
            default:
                throw new InterpreterError("Invalid comparison operator for float");
        }
    }

    private static Float arithmeticFloat(float lhs, float rhs, int kind)
    {
        switch(kind)
        {
            case PLUS:
                return Float.valueOf(lhs + rhs);
            case MINUS:
                return Float.valueOf(lhs - rhs);
            case STAR:
                return Float.valueOf(lhs * rhs);
            case SLASH:
                return Float.valueOf(lhs / rhs);
            case MOD:
                return Float.valueOf(lhs % rhs);
            default:
                throw new InterpreterError("Invalid arithmetic operator for float");
        }
    }

    /**
     * Promote primitive wrapper type to Integer wrapper type
     * Can we use the castPrimitive() (in BSHCastExpression) for this?
     */
    static Object promoteToInteger(Object primitive)
    {
        if(primitive instanceof Character)
            return Integer.valueOf(((Character)primitive).charValue());
        else if((primitive instanceof Byte) || (primitive instanceof Short))
            return Integer.valueOf(((Number)primitive).intValue());

        return primitive;
    }

    /**
     * Promote the pair of primitives to the maximum type of the two.
     * e.g. [int,long]->[long,long]
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
                    rhs = Double.valueOf(rnum.doubleValue());
                else
                    lhs = Double.valueOf(lnum.doubleValue());
            }
            else if((b = (lnum instanceof Float)) || (rnum instanceof Float))
            {
                if(b)
                    rhs = Float.valueOf(rnum.floatValue());
                else
                    lhs = Float.valueOf(lnum.floatValue());
            }
            else if((b = (lnum instanceof Long)) || (rnum instanceof Long))
            {
                if(b)
                    rhs = Long.valueOf(rnum.longValue());
                else
                    lhs = Long.valueOf(lnum.longValue());
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
     * Are we a numeric type:
     * i.e. not boolean, null, or void
     * (but including char)
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
            value = Integer.valueOf(((Character)value).charValue());

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
     * Unwrap primitive values and map voids to nulls.
     * Normal (non Primitive) types remain unchanged.
     * @param obj object type which may be bsh.Primitive
     * @return corresponding "normal" Java type, "unwrapping" 
     * any bsh.Primitive types to their wrapper types.
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