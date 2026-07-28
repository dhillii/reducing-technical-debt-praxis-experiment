package bsh;

import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.io.IOException;

/**
 * Wrapper for primitive types in Bsh.  This is package public because it 
 * is used in the implementation of some bsh commands.
 *
 * See the note in LHS.java about wrapping objects.
 */
public class Primitive implements ParserConstants, java.io.Serializable {
    private static final long serialVersionUID = 1L;

    /** stored internally in java.lang wrappers; transient to avoid serialization issues */
    private transient Object value;

    private static class Special implements java.io.Serializable {
        private Special() { }

        public static final Special NULL_VALUE = new Special();
        public static final Special VOID_TYPE = new Special();
    }

    /** NULL means "no value". Placeholder for primitive null value. */
    public static final Primitive NULL = new Primitive(Special.NULL_VALUE);

    /** VOID means "no type". */
    public static final Primitive VOID = new Primitive(Special.VOID_TYPE);

    /** private to prevent invocation with param that isn't a primitive-wrapper */
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
     */
    public static Object binaryOperation(Object obj1, Object obj2, int kind) throws EvalError {
        validateBinaryOperands(obj1, obj2);
        Class lhsOriginal = obj1.getClass();
        Class rhsOriginal = obj2.getClass();

        Object lhs = unwrapIfPrimitive(obj1);
        Object rhs = unwrapIfPrimitive(obj2);

        Object[] promoted = promotePrimitives(lhs, rhs);
        lhs = promoted[0];
        rhs = promoted[1];

        ensureSameClass(lhs, rhs);

        Object result = computeBinaryResult(lhs, rhs, kind);
        return wrapResultIfBothPrimitives(lhsOriginal, rhsOriginal, result);
    }

    private static void validateBinaryOperands(Object o1, Object o2) throws EvalError {
        if (o1 == NULL || o2 == NULL)
            throw new EvalError("Null value or 'null' literal in binary operation");
        if (o1 == VOID || o2 == VOID)
            throw new EvalError("Undefined variable, class, or 'void' literal in binary operation");
    }

    private static Object unwrapIfPrimitive(Object obj) {
        if (obj instanceof Primitive) {
            return ((Primitive) obj).getValue();
        }
        return obj;
    }

    private static void ensureSameClass(Object lhs, Object rhs) throws EvalError {
        if (!lhs.getClass().equals(rhs.getClass())) {
            throw new EvalError("type mismatch in operator.  " + lhs.getClass() + " cannot be used with " + rhs.getClass());
        }
    }

    private static Object wrapResultIfBothPrimitives(Class lhsOrig, Class rhsOrig, Object result) {
        if (lhsOrig == Primitive.class && rhsOrig == Primitive.class) {
            return new Primitive(result);
        }
        return result;
    }

    private static Object computeBinaryResult(Object lhs, Object rhs, int kind) throws EvalError {
        try {
            return binaryOperationImpl(lhs, rhs, kind);
        } catch (ArithmeticException e) {
            throw new TargetError("Arithmetic Exception in binary op", e);
        }
    }

    static Object binaryOperationImpl(Object lhs, Object rhs, int kind) throws EvalError {
        if (lhs instanceof Boolean) return booleanBinaryOperation((Boolean) lhs, (Boolean) rhs, kind);
        if (lhs instanceof Integer) return numericBinaryOperation((Integer) lhs, (Integer) rhs, kind);
        if (lhs instanceof Long) return numericBinaryOperation((Long) lhs, (Long) rhs, kind);
        if (lhs instanceof Float) return numericBinaryOperation((Float) lhs, (Float) rhs, kind);
        if (lhs instanceof Double) return numericBinaryOperation((Double) lhs, (Double) rhs, kind);
        throw new EvalError("Invalid types in binary operator");
    }

    private static Boolean booleanBinaryOperation(Boolean b1, Boolean b2, int kind) throws EvalError {
        boolean lhs = b1.booleanValue();
        boolean rhs = b2.booleanValue();
        switch (kind) {
            case EQ: return lhs == rhs;
            case NE: return lhs != rhs;
            case BOOL_OR:
            case BOOL_ORX: return lhs || rhs;
            case BOOL_AND:
            case BOOL_ANDX: return lhs && rhs;
            default: throw new InterpreterError("unimplemented binary operator");
        }
    }

    private static Object numericBinaryOperation(Number left, Number right, int kind) throws EvalError {
        if (left instanceof Double) return doubleBinaryOperation(left.doubleValue(), right.doubleValue(), kind);
        if (left instanceof Float) return floatBinaryOperation(left.floatValue(), right.floatValue(), kind);
        if (left instanceof Long) return longBinaryOperation(left.longValue(), right.longValue(), kind);
        return intBinaryOperation(left.intValue(), right.intValue(), kind);
    }

    private static Boolean computeComparison(double lhs, double rhs, int kind) {
        switch (kind) {
            case LT:
            case LTX: return lhs < rhs;
            case GT:
            case GTX: return lhs > rhs;
            case EQ: return lhs == rhs;
            case LE:
            case LEX: return lhs <= rhs;
            case GE:
            case GEX: return lhs >= rhs;
            case NE: return lhs != rhs;
            default: throw new InterpreterError("Invalid comparison operator");
        }
    }

    private static Double computeArithmetic(double lhs, double rhs, int kind) {
        switch (kind) {
            case PLUS: return lhs + rhs;
            case MINUS: return lhs - rhs;
            case STAR: return lhs * rhs;
            case SLASH: return lhs / rhs;
            case MOD: return lhs % rhs;
            default: throw new InterpreterError("Invalid arithmetic operator");
        }
    }

    private static Boolean doubleBinaryOperation(double lhs, double rhs, int kind) throws EvalError {
        if (isComparisonOperator(kind)) return computeComparison(lhs, rhs, kind);
        if (isArithmeticOperator(kind)) return computeArithmetic(lhs, rhs, kind);
        throw new EvalError("Can't shift doubles");
    }

    private static Boolean floatBinaryOperation(float lhs, float rhs, int kind) throws EvalError {
        if (isComparisonOperator(kind)) return computeComparison(lhs, rhs, kind);
        if (isArithmeticOperator(kind)) return computeArithmetic(lhs, rhs, kind);
        throw new EvalError("Can't shift floats");
    }

    private static Boolean computeComparison(long lhs, long rhs, int kind) {
        switch (kind) {
            case LT:
            case LTX: return lhs < rhs;
            case GT:
            case GTX: return lhs > rhs;
            case EQ: return lhs == rhs;
            case LE:
            case LEX: return lhs <= rhs;
            case GE:
            case GEX: return lhs >= rhs;
            case NE: return lhs != rhs;
            default: throw new InterpreterError("Invalid comparison operator");
        }
    }

    private static Long computeArithmetic(long lhs, long rhs, int kind) {
        switch (kind) {
            case PLUS: return lhs + rhs;
            case MINUS: return lhs - rhs;
            case STAR: return lhs * rhs;
            case SLASH: return lhs / rhs;
            case MOD: return lhs % rhs;
            default: throw new InterpreterError("Invalid arithmetic operator");
        }
    }

    private static Long computeBitwise(long lhs, long rhs, int kind) {
        switch (kind) {
            case LSHIFT:
            case LSHIFTX: return lhs << rhs;
            case RSIGNEDSHIFT:
            case RSIGNEDSHIFTX: return lhs >> rhs;
            case RUNSIGNEDSHIFT:
            case RUNSIGNEDSHIFTX: return lhs >>> rhs;
            case BIT_AND:
            case BIT_ANDX: return lhs & rhs;
            case BIT_OR:
            case BIT_ORX: return lhs | rhs;
            case XOR: return lhs ^ rhs;
            default: throw new InterpreterError("Invalid bitwise operator");
        }
    }

    private static Object longBinaryOperation(long lhs, long rhs, int kind) throws EvalError {
        if (isComparisonOperator(kind)) return computeComparison(lhs, rhs, kind);
        if (isArithmeticOperator(kind)) return computeArithmetic(lhs, rhs, kind);
        if (isBitwiseOperator(kind)) return computeBitwise(lhs, rhs, kind);
        throw new InterpreterError("Unimplemented binary long operator");
    }

    private static Boolean computeComparison(int lhs, int rhs, int kind) {
        switch (kind) {
            case LT:
            case LTX: return lhs < rhs;
            case GT:
            case GTX: return lhs > rhs;
            case EQ: return lhs == rhs;
            case LE:
            case LEX: return lhs <= rhs;
            case GE:
            case GEX: return lhs >= rhs;
            case NE: return lhs != rhs;
            default: throw new InterpreterError("Invalid comparison operator");
        }
    }

    private static Integer computeArithmetic(int lhs, int rhs, int kind) {
        switch (kind) {
            case PLUS: return lhs + rhs;
            case MINUS: return lhs - rhs;
            case STAR: return lhs * rhs;
            case SLASH: return lhs / rhs;
            case MOD: return lhs % rhs;
            default: throw new InterpreterError("Invalid arithmetic operator");
        }
    }

    private static Integer computeBitwise(int lhs, int rhs, int kind) {
        switch (kind) {
            case LSHIFT:
            case LSHIFTX: return lhs << rhs;
            case RSIGNEDSHIFT:
            case RSIGNEDSHIFTX: return lhs >> rhs;
            case RUNSIGNEDSHIFT:
            case RUNSIGNEDSHIFTX: return lhs >>> rhs;
            case BIT_AND:
            case BIT_ANDX: return lhs & rhs;
            case BIT_OR:
            case BIT_ORX: return lhs | rhs;
            case XOR: return lhs ^ rhs;
            default: throw new InterpreterError("Invalid bitwise operator");
        }
    }

    private static Object intBinaryOperation(int lhs, int rhs, int kind) throws EvalError {
        if (isComparisonOperator(kind)) return computeComparison(lhs, rhs, kind);
        if (isArithmeticOperator(kind)) return computeArithmetic(lhs, rhs, kind);
        if (isBitwiseOperator(kind)) return computeBitwise(lhs, rhs, kind);
        throw new InterpreterError("Unimplemented binary integer operator");
    }

    private static boolean isComparisonOperator(int kind) {
        return kind == LT || kind == LTX || kind == GT || kind == GTX ||
               kind == EQ || kind == LE || kind == LEX ||
               kind == GE || kind == GEX || kind == NE;
    }

    private static boolean isArithmeticOperator(int kind) {
        return kind == PLUS || kind == MINUS || kind == STAR ||
               kind == SLASH || kind == MOD;
    }

    private static boolean isBitwiseOperator(int kind) {
        return kind == LSHIFT || kind == LSHIFTX ||
               kind == RSIGNEDSHIFT || kind == RSIGNEDSHIFTX ||
               kind == RUNSIGNEDSHIFT || kind == RUNSIGNEDSHIFTX ||
               kind == BIT_AND || kind == BIT_ANDX ||
               kind == BIT_OR || kind == BIT_ORX ||
               kind == XOR;
    }

    static Object promoteToInteger(Object primitive) {
        if (primitive instanceof Character) return Integer.valueOf(((Character) primitive).charValue());
        if (primitive instanceof Byte || primitive instanceof Short) return Integer.valueOf(((Number) primitive).intValue());
        return primitive;
    }

    static Object[] promotePrimitives(Object lhs, Object rhs) {
        lhs = promoteToInteger(lhs);
        rhs = promoteToInteger(rhs);
        if (lhs instanceof Number && rhs instanceof Number) {
            return promoteNumberTypes((Number) lhs, (Number) rhs);
        }
        return new Object[] { lhs, rhs };
    }

    private static Object[] promoteNumberTypes(Number lhs, Number rhs) {
        if (lhs instanceof Double || rhs instanceof Double) {
            return new Object[] { lhs.doubleValue(), rhs.doubleValue() };
        }
        if (lhs instanceof Float || rhs instanceof Float) {
            return new Object[] { lhs.floatValue(), rhs.floatValue() };
        }
        if (lhs instanceof Long || rhs instanceof Long) {
            return new Object[] { lhs.longValue(), rhs.longValue() };
        }
        return new Object[] { lhs, rhs };
    }

    public static Primitive unaryOperation(Primitive val, int kind) throws EvalError {
        if (val == NULL) throw new EvalError("illegal use of null object or 'null' literal");
        if (val == VOID) throw new EvalError("illegal use of undefined object or 'void' literal");

        Class operandType = val.getType();
        Object operand = promoteToInteger(val.getValue());

        if (operand instanceof Boolean) return new Primitive(booleanUnaryOperation((Boolean) operand, kind));
        if (operand instanceof Integer) {
            int result = intUnaryOperation((Integer) operand, kind);
            if (kind == INCR || kind == DECR) {
                if (operandType == Byte.TYPE) return new Primitive((byte) result);
                if (operandType == Short.TYPE) return new Primitive((short) result);
                if (operandType == Character.TYPE) return new Primitive((char) result);
            }
            return new Primitive(result);
        }
        if (operand instanceof Long) return new Primitive(longUnaryOperation((Long) operand, kind));
        if (operand instanceof Float) return new Primitive(floatUnaryOperation((Float) operand, kind));
        if (operand instanceof Double) return new Primitive(doubleUnaryOperation((Double) operand, kind));
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
            case PLUS: return operand;
            case MINUS: return -operand;
            case TILDE: return ~operand;
            case INCR: return operand + 1;
            case DECR: return operand - 1;
            default: throw new InterpreterError("bad integer unaryOperation");
        }
    }

    static long longUnaryOperation(Long L, int kind) {
        long operand = L.longValue();
        switch (kind) {
            case PLUS: return operand;
            case MINUS: return -operand;
            case TILDE: return ~operand;
            case INCR: return operand + 1;
            case DECR: return operand - 1;
            default: throw new InterpreterError("bad long unaryOperation");
        }
    }

    static float floatUnaryOperation(Float F, int kind) {
        float operand = F.floatValue();
        switch (kind) {
            case PLUS: return operand;
            case MINUS: return -operand;
            default: throw new InterpreterError("bad float unaryOperation");
        }
    }

    static double doubleUnaryOperation(Double D, int kind) {
        double operand = D.doubleValue();
        switch (kind) {
            case PLUS: return operand;
            case MINUS: return -operand;
            default: throw new InterpreterError("bad double unaryOperation");
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

    public boolean isNumber() {
        return !(value instanceof Boolean) && this != NULL && this != VOID;
    }

    public Number numberValue() throws EvalError {
        Object val = this.value;
        if (val instanceof Character) val = Integer.valueOf(((Character) val).charValue());
        if (val instanceof Number) return (Number) val;
        throw new EvalError("Primitive not a number");
    }

    @Override
    public boolean equals(Object obj) {
        if (obj instanceof Primitive) return ((Primitive) obj).value.equals(this.value);
        return obj.equals(this.value);
    }

    /**
     * Unwrap primitive values and map voids to nulls.
     * Normal (non Primitive) types remain unchanged.
     */
    public static Object unwrap(Object obj) {
        if (obj == null) return null;
        if (obj == Primitive.VOID) return null;
        if (obj instanceof Primitive) return ((Primitive) obj).getValue();
        return obj;
    }

    /** Custom serialization to handle transient value field */
    private void writeObject(ObjectOutputStream out) throws IOException {
        out.defaultWriteObject();
        out.writeObject(value);
    }

    /** Custom deserialization to restore value field */
    private void readObject(ObjectInputStream in) throws IOException, ClassNotFoundException {
        in.defaultReadObject();
        this.value = in.readObject();
    }
}