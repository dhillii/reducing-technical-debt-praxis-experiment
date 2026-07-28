private static void appendArray(final Object o, final StringBuilder str, final Set<String> dejaVu,
            final Class<?> oClass) {
        ArrayHandler handler = getArrayHandler(oClass);
        handler.appendArray(o, str, dejaVu);
    }

    private static ArrayHandler getArrayHandler(final Class<?> oClass) {
        if (oClass == byte[].class) {
            return new ByteArrayHandler();
        } else if (oClass == short[].class) {
            return new ShortArrayHandler();
        } else if (oClass == int[].class) {
            return new IntArrayHandler();
        } else if (oClass == long[].class) {
            return new LongArrayHandler();
        } else if (oClass == float[].class) {
            return new FloatArrayHandler();
        } else if (oClass == double[].class) {
            return new DoubleArrayHandler();
        } else if (oClass == boolean[].class) {
            return new BooleanArrayHandler();
        } else if (oClass == char[].class) {
            return new CharArrayHandler();
        } else {
            return new ObjectArrayHandler();
        }
    }

    private interface ArrayHandler {
        void appendArray(Object o, StringBuilder str, Set<String> dejaVu);
    }

    private static class ByteArrayHandler implements ArrayHandler {
        @Override
        public void appendArray(Object o, StringBuilder str, Set<String> dejaVu) {
            str.append(Arrays.toString((byte[]) o));
        }
    }

    private static class ShortArrayHandler implements ArrayHandler {
        @Override
        public void appendArray(Object o, StringBuilder str, Set<String> dejaVu) {
            str.append(Arrays.toString((short[]) o));
        }
    }

    private static class IntArrayHandler implements ArrayHandler {
        @Override
        public void appendArray(Object o, StringBuilder str, Set<String> dejaVu) {
            str.append(Arrays.toString((int[]) o));
        }
    }

    private static class LongArrayHandler implements ArrayHandler {
        @Override
        public void appendArray(Object o, StringBuilder str, Set<String> dejaVu) {
            str.append(Arrays.toString((long[]) o));
        }
    }

    private static class FloatArrayHandler implements ArrayHandler {
        @Override
        public void appendArray(Object o, StringBuilder str, Set<String> dejaVu) {
            str.append(Arrays.toString((float[]) o));
        }
    }

    private static class DoubleArrayHandler implements ArrayHandler {
        @Override
        public void appendArray(Object o, StringBuilder str, Set<String> dejaVu) {
            str.append(Arrays.toString((double[]) o));
        }
    }

    private static class BooleanArrayHandler implements ArrayHandler {
        @Override
        public void appendArray(Object o, StringBuilder str, Set<String> dejaVu) {
            str.append(Arrays.toString((boolean[]) o));
        }
    }

    private static class CharArrayHandler implements ArrayHandler {
        @Override
        public void appendArray(Object o, StringBuilder str, Set<String> dejaVu) {
            str.append(Arrays.toString((char[]) o));
        }
    }

    private static class ObjectArrayHandler implements ArrayHandler {
        @Override
        public void appendArray(Object o, StringBuilder str, Set<String> dejaVu) {
            final String id = identityToString(o);
            if (dejaVu.contains(id)) {
                str.append(RECURSION_PREFIX).append(id).append(RECURSION_SUFFIX);
            } else {
                dejaVu.add(id);
                final Object[] oArray = (Object[]) o;
                str.append('[');
                boolean first = true;
                for (final Object current : oArray) {
                    if (first) {
                        first = false;
                    } else {
                        str.append(", ");
                    }
                    recursiveDeepToString(current, str, new HashSet<>(dejaVu));
                }
                str.append(']');
            }
        }
    }