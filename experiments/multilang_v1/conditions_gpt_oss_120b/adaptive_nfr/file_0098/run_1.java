package bsh;

/**
 * Wrapper for primitive types in Bsh.  This is package public because it 
 * is used in the implementation of some bsh commands.
 *
 * See the note in LHS.java about wrapping objects.
 */
public class Primitive implements ParserConstants, java.io.Serializable {
    // stored internally in java.lang. wrappers
    private transient Object value;

    private static class Special implements java.io.Serializable {
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
        else if (value == Special.VOID_TYPE)
            throw new InterpreterError("attempt to unwrap void type");
        else
            return value;
    }

    public String toString() {
        if (value == Special.NULL_VALUE)
            return "null";
        else if (value == Special.VOID_TYPE)
            return "void";
        else
            return value.toString();
    }

    public Class getType() {
        return getType(value);
    }

    private Class getType(Object o) {
        if (o instanceof Boolean) return Boolean.TYPE;
        else if (o instanceof Byte) return Byte.TYPE;
        else if (o instanceof Short) return Short.TYPE;
        else if (o instanceof Character) return Character.TYPE;
        else if (o instanceof Integer) return Integer.TYPE;
        else if (o instanceof Long) return Long.TYPE;
        else if (o instanceof Float) return Float.TYPE;
        else if (o instanceof Double) return Double.TYPE;
        return null;
    }

    /**
     * Allow primitive operations on wrapper types such as Integer and Boolean.
     * This is static so that it can be reached from wherever...
     */
    public static Object binaryOperation(Object obj1, Object obj2, int kind) throws EvalError {
        validateSpecialOperands(obj1, obj2);
        Class lhsOrgType = obj1.getClass();
        Class rhsOrgType = obj2.getClass();

        obj1 = unwrapIfPrimitive(obj1);
        obj2 = unwrapIfPrimitive(obj2);

        Object[] operands = promotePrimitives(obj1, obj2);
        Object lhs = operands[0];
        Object rhs = operands[1];

        ensureSameClass(lhs, rhs);
        Object result = executeBinaryOperation(lhs, rhs, kind);
        return wrapResultIfBothPrimitives(lhsOrgType, rhsOrgType, result);
    }

    /**
     * Validates that neither operand is the special NULL or VOID values.
     */
    private static void validateSpecialOperands(Object o1, Object o2) throws EvalError {
        if (o1 == NULL || o2 == NULL)
            throw new EvalError("Null value or 'null' literal in binary operation");
        if (o1 == VOID || o2 == VOID)
            throw new EvalError("Undefined variable, class, or 'void' literal in binary operation");
    }

    /**
     * Unwraps a Primitive to its underlying value; otherwise returns the object unchanged.
     */
    private static Object unwrapIfPrimitive(Object obj) {
        if (obj instanceof Primitive) {
            return ((Primitive) obj).getValue();
        }
        return obj;
    }

    /**
     * Ensures both operands are of the same runtime class.
     */
    private static void ensureSameClass(Object lhs, Object rhs) throws EvalError {
        if (lhs.getClass() != rhs.getClass())
            throw new EvalError("type mismatch in operator.  " + lhs.getClass() + " cannot be used with " + rhs.getClass());
    }

    /**
     * Executes the binary operation based on operand types.
     */
    private static Object executeBinaryOperation(Object lhs, Object rhs, int kind) throws EvalError {
        try {
            return binaryOperationImpl(lhs, rhs, kind);
        } catch (ArithmeticException e) {
            throw new TargetError("Arithmetic Exception in binary op", e);
        }
    }

    /**
     * Wraps the result in a Primitive if both original operands were Primitives.
     */
    private static Object wrapResultIfBothPrimitives(Class lhsOrg, Class rhsOrg, Object result) {
        if (lhsOrg == Primitive.class && rhsOrg == Primitive.class)
            return new Primitive(result);
        return result;
    }

    static Object binaryOperationImpl(Object lhs, Object rhs, int kind) throws EvalError {
        if (lhs instanceof Boolean) return booleanBinaryOperation((Boolean) lhs, (Boolean) rhs, kind);
        else if (lhs instanceof Integer) return intBinaryOperation((Integer) lhs, (Integer) rhs, kind);
        else if (lhs instanceof Long) return longBinaryOperation((Long) lhs, (Long) rhs, kind);
        else if (lhs instanceof Float) return floatBinaryOperation((Float) lhs, (Float) rhs, kind);
        else if (lhs instanceof Double) return doubleBinaryOperation((Double) lhs, (Double) rhs, kind);
        else throw new EvalError("Invalid types in binary operator");
    }

    static Boolean booleanBinaryOperation(Boolean B1, Boolean B2, int kind) throws EvalError {
        boolean lhs = B1.booleanValue();
        boolean rhs = B2.booleanValue();

        switch (kind) {
            case EQ:
                return Boolean.valueOf(lhs == rhs);
            case NE:
                return Boolean.valueOf(lhs != rhs);
            case BOOL_OR:
            case BOOL_ORX:
                return Boolean.valueOf(lhs || rhs);
            case BOOL_AND:
            case BOOL_ANDX:
                return Boolean.valueOf(lhs && rhs);
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
                throw new InterpreterError("Unimplemented binary long operator");
        }
    }

    static Object intBinaryOperation(Integer I1, Integer I2, int kind) {
        int lhs = I1.intValue();
        int rhs = I2.intValue();

        switch (kind) {
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
                throw new InterpreterError("Unimplemented binary integer operator");
        }
    }

    static Object doubleBinaryOperation(Double D1, Double D2, int kind) throws EvalError {
        double lhs = D1.doubleValue();
        double rhs = D2.doubleValue();

        switch (kind) {
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
     * Promote primitive wrapper type to Integer wrapper type.
     */
    static Object promoteToInteger(Object primitive) {
        if (primitive instanceof Character) return Integer.valueOf(((Character) primitive).charValue());
        else if (primitive instanceof Byte || primitive instanceof Short) return Integer.valueOf(((Number) primitive).intValue());
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
        return new Object[] { lhs, rhs };
    }

    public static Primitive unaryOperation(Primitive val, int kind) throws EvalError {
        validateUnaryOperand(val);
        Class operandType = val.getType();
        Object operand = promoteToInteger(val.getValue());

        if (operand instanceof Boolean)
            return new Primitive(booleanUnaryOperation((Boolean) operand, kind));
        else if (operand instanceof Integer)
            return handleIntegerUnary((Integer) operand, operandType, kind);
        else if (operand instanceof Long)
            return new Primitive(longUnaryOperation((Long) operand, kind));
        else if (operand instanceof Float)
            return new Primitive(floatUnaryOperation((Float) operand, kind));
        else if (operand instanceof Double)
            return new Primitive(doubleUnaryOperation((Double) operand, kind));
        else
            throw new InterpreterError("An error occurred.  Please call technical support.");
    }

    /**
     * Validates that the operand is not NULL or VOID.
     */
    private static void validateUnaryOperand(Primitive val) throws EvalError {
        if (val == NULL)
            throw new EvalError("illegal use of null object or 'null' literal");
        if (val == VOID)
            throw new EvalError("illegal use of undefined object or 'void' literal");
    }

    /**
     * Handles integer unary operations, including casting back to original type for ++/--.
     */
    private static Primitive handleIntegerUnary(Integer operand, Class originalType, int kind) throws EvalError {
        int result = intUnaryOperation(operand, kind);
        if (kind == INCR || kind == DECR) {
            if (originalType == Byte.TYPE) return new Primitive((byte) result);
            if (originalType == Short.TYPE) return new Primitive((short) result);
            if (originalType == Character.TYPE) return new Primitive((char) result);
        }
        return new Primitive(result);
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
        return !(value instanceof Boolean) && !(this == NULL) && !(this == VOID);
    }

    public Number numberValue() throws EvalError {
        Object val = this.value;
        if (val instanceof Character) val = Integer.valueOf(((Character) val).charValue());
        if (val instanceof Number) return (Number) val;
        throw new EvalError("Primitive not a number");
    }

    public boolean equals(Object obj) {
        if (obj instanceof Primitive) return ((Primitive) obj).value.equals(this.value);
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