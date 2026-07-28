private static void appendArray(final Object o, final StringBuilder str, final Set<String> dejaVu,
            final Class<?> oClass) {
        if (isPrimitiveArray(oClass)) {
            appendPrimitiveArray(o, str);
        } else {
            appendObjectArray(o, str, dejaVu);
        }
    }

    private static boolean isPrimitiveArray(final Class<?> oClass) {
        return oClass == byte[].class || oClass == short[].class || oClass == int[].class
                || oClass == long[].class || oClass == float[].class || oClass == double[].class
                || oClass == boolean[].class || oClass == char[].class;
    }

    private static void appendPrimitiveArray(final Object o, final StringBuilder str) {
        str.append(Arrays.toString((Object[]) o));
    }

    private static void appendObjectArray(final Object o, final StringBuilder str, final Set<String> dejaVu) {
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