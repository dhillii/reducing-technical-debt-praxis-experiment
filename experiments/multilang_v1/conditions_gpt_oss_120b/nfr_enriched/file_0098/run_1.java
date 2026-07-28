package bsh;

import java.io.Serializable;

/**
 * Wrapper for primitive types in Bsh.  This is package public because it 
 * is used in the implementation of some bsh commands.
 *
 * See the note in LHS.java about wrapping objects.
 */
public class Primitive implements ParserConstants, Serializable {
    // stored internally in java.lang wrappers
    private transient Object value;

    private static class Special implements Serializable {
        private Special() { }

        public static final Special NULL_VALUE = new Special();
        public static final Special VOID_TYPE = new Special();
    }

    /*
     * NULL means "no value".
     * This is a placeholder for primitive null value.
     */
    public static final Primitive NULL = new Primitive(Special.NULL_VALUE);

    /**
     * VOID means "no type".
     * Strictly speaking, this makes no sense here.  But for practical
     * reasons we'll consider the lack of a type to be a special value.
     */
    public static final Primitive VOID = new Primitive(Special.VOID_TYPE);

    // private to prevent invocation with param that isn't a primitive-wrapper
    private Primitive(Object value) {
        if (value == null)
            throw new InterpreterError("Use Primitive.NULL instead of Primitive(null)");
        this.value = value;
    }

    public Primitive(Number number) { this((Object) number); }

    public Primitive(Boolean value) { this((Object) value); }
    public Primitive(Byte value) { this((Object) value); }
    public Primitive(Short value) { this((Object) value); }
    public Primitive(Character value) { this((Object) value); }
    public Primitive(Integer value) { this((Object) value); }
    public Primitive(Long value) { this((Object) value); }
    public Primitive(Float value) { this((Object) value); }
    public Primitive(Double value) { this((Object) value); }

    public Primitive(boolean value) { this(Boolean.valueOf(value)); }
    public Primitive(byte value) { this(Byte.valueOf(value)); }
    public Primitive(short value) { this(Short.valueOf(value)); }
    public Primitive(char value) { this(Character.valueOf(value)); }
    public Primitive(int value) { this(Integer.valueOf(value)); }
    public Primitive(long value) { this(Long.valueOf(value)); }
    public Primitive(float value) { this(Float.valueOf(value)); }
    public Primitive(double value) { this(Double.valueOf(value)); }

    public Object getValue() {
        if (value == Special.NULL_VALUE)
            return null;
        if (value == Special.VOID_TYPE)
            throw new InterpreterError("attempt to unwrap void type");
        return value;
    }

    @Override
    public String toString() {
        if (value == Special.NULL_VALUE)
            return "null";
        if (value == Special.VOID_TYPE)
            return "void";
        return value.toString();
    }

    public Class getType() {
        return getType(value);
    }

    private Class getType(Object o) {
        if (o instanceof Boolean) return Boolean.TYPE;
        if (o instanceof Byte) return Byte.TYPE;
        if (o instanceof Short) return Short.TYPE;
        if (o instanceof Character) return Character.TYPE;
        if (o instanceof Integer) return Integer.TYPE;
        if (o instanceof Long) return Long.TYPE;
        if (o instanceof Float) return Float.TYPE;
        if (o instanceof Double) return Double.TYPE;
        return null;
    }

    /**
     * Allow primitive operations on wrapper types such as Integer and Boolean.
     * This is static so that it can be reached from wherever...
     */
    public static Object binaryOperation(Object obj1, Object obj2, int kind) throws EvalError {
        validateBinaryOperands(obj1, obj2);
        Class lhsOriginal = obj1.getClass();
        Class rhsOriginal = obj2.getClass();

        Object lhs = unwrapIfPrimitive(obj1);
        Object rhs = unwrapIfPrimitive(obj2);

        Object[] promoted = promotePrimitives(lhs, rhs);
        Object result = computeBinaryResult(promoted[0], promoted[1], kind);
        return wrapResultIfBothPrimitives(lhsOriginal, rhsOriginal, result);
    }

    /** Validates that neither operand is NULL or VOID. */
    private static void validateBinaryOperands(Object lhs, Object rhs) throws EvalError {
        if (lhs == NULL || rhs == NULL)
            throw new EvalError("Null value or 'null' literal in binary operation");
        if (lhs == VOID || rhs == VOID)
            throw new EvalError("Undefined variable, class, or 'void' literal in binary operation");
    }

    /** Unwraps a Primitive to its underlying value; otherwise returns the object unchanged. */
    private static Object unwrapIfPrimitive(Object obj) {
        return (obj instanceof Primitive) ? ((Primitive) obj).getValue() : obj;
    }

    /** Computes the binary operation after promotion. */
    private static Object computeBinaryResult(Object lhs, Object rhs, int kind) throws EvalError {
        try {
            return binaryOperationImpl(lhs, rhs, kind);
        } catch (ArithmeticException e) {
            throw new TargetError("Arithmetic Exception in binary op", e);
        }
    }

    /** Wraps the result in a Primitive if both original operands were Primitives. */
    private static Object wrapResultIfBothPrimitives(Class lhsClass, Class rhsClass, Object result) {
        if (lhsClass == Primitive.class && rhsClass == Primitive.class) {
            return new Primitive(result);
        }
        return result;
    }

    static Object binaryOperationImpl(Object lhs, Object rhs, int kind) throws EvalError {
        if (lhs instanceof Boolean) return booleanBinaryOperation((Boolean) lhs, (Boolean) rhs, kind);
        if (lhs instanceof Integer) return intBinaryOperation((Integer) lhs, (Integer) rhs, kind);
        if (lhs instanceof Long) return longBinaryOperation((Long) lhs, (Long) rhs, kind);
        if (lhs instanceof Float) return floatBinaryOperation((Float) lhs, (Float) rhs, kind);
        if (lhs instanceof Double) return doubleBinaryOperation((Double) lhs, (Double) rhs, kind);
        throw new EvalError("Invalid types in binary operator");
    }

    static Boolean booleanBinaryOperation(Boolean B1, Boolean B2, int kind) throws EvalError {
        boolean lhs = B1.booleanValue();
        boolean rhs = B2.booleanValue();

        switch (kind) {
            case EQ:
                return lhs == rhs;
            case NE:
                return lhs != rhs;
            case BOOL_OR:
            case BOOL_ORX:
                return lhs || rhs;
            case BOOL_AND:
            case BOOL_ANDX:
                return lhs && rhs;
            default:
                throw new InterpreterError("unimplemented binary operator");
        }
    }

    static Object longBinaryOperation(Long L1, Long L2, int kind) {
        long lhs = L1.longValue();
        long rhs = L2.longValue();

        switch (kind) {
            case LT:
            case LTX:
                return lhs < rhs;
            case GT:
            case GTX:
                return lhs > rhs;
            case EQ:
                return lhs == rhs;
            case LE:
            case LEX:
                return lhs <= rhs;
            case GE:
            case GEX:
                return lhs >= rhs;
            case NE:
                return lhs != rhs;
            case PLUS:
                return lhs + rhs;
            case MINUS:
                return lhs - rhs;
            case STAR:
                return lhs * rhs;
            case SLASH:
                return lhs / rhs;
            case MOD:
                return lhs % rhs;
            case LSHIFT:
            case LSHIFTX:
                return lhs << rhs;
            case RSIGNEDSHIFT:
            case RSIGNEDSHIFTX:
                return lhs >> rhs;
            case RUNSIGNEDSHIFT:
            case RUNSIGNEDSHIFTX:
                return lhs >>> rhs;
            case BIT_AND:
            case BIT_ANDX:
                return lhs & rhs;
            case BIT_OR:
            case BIT_ORX:
                return lhs | rhs;
            case XOR:
                return lhs ^ rhs;
            default:
                throw new InterpreterError("Unimplemented binary long operator");
        }
    }

    static Object intBinaryOperation(Integer I1, Integer I2, int kind) {
        int lhs = I1.intValue();
        int rhs = I2.intValue();

        switch (kind) {
            case LT:
            case LTX:
                return lhs < rhs;
            case GT:
            case GTX:
                return lhs > rhs;
            case EQ:
                return lhs == rhs;
            case LE:
            case LEX:
                return lhs <= rhs;
            case GE:
            case GEX:
                return lhs >= rhs;
            case NE:
                return lhs != rhs;
            case PLUS:
                return lhs + rhs;
            case MINUS:
                return lhs - rhs;
            case STAR:
                return lhs * rhs;
            case SLASH:
                return lhs / rhs;
            case MOD:
                return lhs % rhs;
            case LSHIFT:
            case LSHIFTX:
                return lhs << rhs;
            case RSIGNEDSHIFT:
            case RSIGNEDSHIFTX:
                return lhs >> rhs;
            case RUNSIGNEDSHIFT:
            case RUNSIGNEDSHIFTX:
                return lhs >>> rhs;
            case BIT_AND:
            case BIT_ANDX:
                return lhs & rhs;
            case BIT_OR:
            case BIT_ORX:
                return lhs | rhs;
            case XOR:
                return lhs ^ rhs;
            default:
                throw new InterpreterError("Unimplemented binary integer operator");
        }
    }

    static Object doubleBinaryOperation(Double D1, Double D2, int kind) throws EvalError {
        double lhs = D1.doubleValue();
        double rhs = D2.doubleValue();

        switch (kind) {
            case LT:
            case LTX:
                return lhs < rhs;
            case GT:
            case GTX:
                return lhs > rhs;
            case EQ:
                return lhs == rhs;
            case LE:
            case LEX:
                return lhs <= rhs;
            case GE:
            case GEX:
                return lhs >= rhs;
            case NE:
                return lhs != rhs;
            case PLUS:
                return lhs + rhs;
            case MINUS:
                return lhs - rhs;
            case STAR:
                return lhs * rhs;
            case SLASH:
                return lhs / rhs;
            case MOD:
                return lhs % rhs;
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

    static Object floatBinaryOperation(Float F1, Float F2, int kind) throws EvalError {
        float lhs = F1.floatValue();
        float rhs = F2.floatValue();

        switch (kind) {
            case LT:
            case LTX:
                return lhs < rhs;
            case GT:
            case GTX:
                return lhs > rhs;
            case EQ:
                return lhs == rhs;
            case LE:
            case LEX:
                return lhs <= rhs;
            case GE:
            case GEX:
                return lhs >= rhs;
            case NE:
                return lhs != rhs;
            case PLUS:
                return lhs + rhs;
            case MINUS:
                return lhs - rhs;
            case STAR:
                return lhs * rhs;
            case SLASH:
                return lhs / rhs;
            case MOD:
                return lhs % rhs;
            case LSHIFT:
            case LSHIFTX:
            case RSIGNEDSHIFT:
            case RSIGNEDSHIFTX:
            case RUNSIGNEDSHIFT:
            case RUNSIGNEDSHIFTX:
                throw new EvalError("Can't shift floats");
            default:
                throw new InterpreterError("Unimplemented binary float operator");
        }
    }

    /**
     * Promote primitive wrapper type to Integer wrapper type.
     */
    static Object promoteToInteger(Object primitive) {
        if (primitive instanceof Character)
            return Integer.valueOf(((Character) primitive).charValue());
        if (primitive instanceof Byte || primitive instanceof Short)
            return Integer.valueOf(((Number) primitive).intValue());
        return primitive;
    }

    /**
     * Promote the pair of primitives to the maximum type of the two.
     * e.g. [int,long] -> [long,long]
     */
    static Object[] promotePrimitives(Object lhs, Object rhs) {
        lhs = promoteToInteger(lhs);
        rhs = promoteToInteger(rhs);

        if (lhs instanceof Number && rhs instanceof Number) {
            Number lnum = (Number) lhs;
            Number rnum = (Number) rhs;

            if (lnum instanceof Double || rnum instanceof Double) {
                lhs = Double.valueOf(lnum.doubleValue());
                rhs = Double.valueOf(rnum.doubleValue());
            } else if (lnum instanceof Float || rnum instanceof Float) {
                lhs = Float.valueOf(lnum.floatValue());
                rhs = Float.valueOf(rnum.floatValue());
            } else if (lnum instanceof Long || rnum instanceof Long) {
                lhs = Long.valueOf(lnum.longValue());
                rhs = Long.valueOf(rnum.longValue());
            }
        }
        return new Object[]{lhs, rhs};
    }

    public static Primitive unaryOperation(Primitive val, int kind) throws EvalError {
        if (val == NULL)
            throw new EvalError("illegal use of null object or 'null' literal");
        if (val == VOID)
            throw new EvalError("illegal use of undefined object or 'void' literal");

        Class operandType = val.getType();
        Object operand = promoteToInteger(val.getValue());

        if (operand instanceof Boolean)
            return new Primitive(booleanUnaryOperation((Boolean) operand, kind));
        if (operand instanceof Integer) {
            int result = intUnaryOperation((Integer) operand, kind);
            if (kind == INCR || kind == DECR) {
                if (operandType == Byte.TYPE) return new Primitive((byte) result);
                if (operandType == Short.TYPE) return new Primitive((short) result);
                if (operandType == Character.TYPE) return new Primitive((char) result);
            }
            return new Primitive(result);
        }
        if (operand instanceof Long)
            return new Primitive(longUnaryOperation((Long) operand, kind));
        if (operand instanceof Float)
            return new Primitive(floatUnaryOperation((Float) operand, kind));
        if (operand instanceof Double)
            return new Primitive(doubleUnaryOperation((Double) operand, kind));
        throw new InterpreterError("An error occurred.  Please call technical support.");
    }

    static boolean booleanUnaryOperation(Boolean B, int kind) throws EvalError {
        boolean operand = B.booleanValue();
        if (kind == BANG) return !operand;
        throw new EvalError("Operator inappropriate for boolean");
    }

    static int intUnaryOperation(Integer I, int kind) {
        int operand = I.intValue();
        switch (kind) {
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

    static long longUnaryOperation(Long L, int kind) {
        long operand = L.longValue();
        switch (kind) {
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

    static float floatUnaryOperation(Float F, int kind) {
        float operand = F.floatValue();
        switch (kind) {
            case PLUS:
                return operand;
            case MINUS:
                return -operand;
            default:
                throw new InterpreterError("bad float unaryOperation");
        }
    }

    static double doubleUnaryOperation(Double D, int kind) {
        double operand = D.doubleValue();
        switch (kind) {
            case PLUS:
                return operand;
            case MINUS:
                return -operand;
            default:
                throw new InterpreterError("bad double unaryOperation");
        }
    }

    public int intValue() throws EvalError {
        if (value instanceof Number) return ((Number) value).intValue();
        throw new EvalError("Primitive not a number");
    }

    public boolean booleanValue() throws EvalError {
        if (value instanceof Boolean) return ((Boolean) value).booleanValue();
        throw new EvalError("Primitive not a boolean");
    }

    /**
     * Are we a numeric type: i.e. not boolean, null, or void (but including char)
     */
    public boolean isNumber() {
        return !(value instanceof Boolean) && this != NULL && this != VOID;
    }

    public Number numberValue() throws EvalError {
        Object val = this.value;
        if (val instanceof Character)
            val = Integer.valueOf(((Character) val).charValue());
        if (val instanceof Number) return (Number) val;
        throw new EvalError("Primitive not a number");
    }

    @Override
    public boolean equals(Object obj) {
        if (obj instanceof Primitive)
            return ((Primitive) obj).value.equals(this.value);
        return obj.equals(this.value);
    }

    /**
     * Unwrap primitive values and map voids to nulls.
     * Normal (non Primitive) types remain unchanged.
     *
     * @param obj object type which may be bsh.Primitive
     * @return corresponding "normal" Java type, "unwrapping"
     *         any bsh.Primitive types to their wrapper types.
     */
    public static Object unwrap(Object obj) {
        if (obj == null) return null;
        if (obj == Primitive.VOID) return null;
        if (obj instanceof Primitive) return ((Primitive) obj).getValue();
        return obj;
    }
}