/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache license, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the license for the specific language governing permissions and
 * limitations under the license.
 */
package org.apache.logging.log4j.message;

import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Collection;
import java.util.Date;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.lang.reflect.Array;

public class ParameterizedMessage implements Message {

    public static final String RECURSION_PREFIX = "[...";
    public static final String RECURSION_SUFFIX = "...]";
    public static final String ERROR_PREFIX = "[!!!";
    public static final String ERROR_SEPARATOR = "=>";
    public static final String ERROR_MSG_SEPARATOR = ":";
    public static final String ERROR_SUFFIX = "!!!]";

    private static final long serialVersionUID = -665975803997290697L;
    private static final int HASHVAL = 31;
    private static final char DELIM_START = '{';
    private static final char DELIM_STOP = '}';
    private static final char ESCAPE_CHAR = '\\';

    private final String messagePattern;
    private final String[] stringArgs;
    private transient Object[] argArray;
    private transient String formattedMessage;
    private transient Throwable throwable;

    public ParameterizedMessage(final String messagePattern, final String[] stringArgs, final Throwable throwable) {
        this.messagePattern = messagePattern;
        this.stringArgs = stringArgs;
        this.throwable = throwable;
    }

    public ParameterizedMessage(final String messagePattern, final Object[] objectArgs, final Throwable throwable) {
        this.messagePattern = messagePattern;
        this.throwable = throwable;
        this.stringArgs = argumentsToStrings(objectArgs);
    }

    public ParameterizedMessage(final String messagePattern, final Object[] arguments) {
        this.messagePattern = messagePattern;
        this.stringArgs = argumentsToStrings(arguments);
    }

    public ParameterizedMessage(final String messagePattern, final Object arg) {
        this(messagePattern, new Object[]{arg});
    }

    public ParameterizedMessage(final String messagePattern, final Object arg1, final Object arg2) {
        this(messagePattern, new Object[]{arg1, arg2});
    }

    private String[] argumentsToStrings(final Object[] arguments) {
        if (arguments == null) {
            return null;
        }
        final int argsCount = countArgumentPlaceholders(messagePattern);
        int resultArgCount = arguments.length;
        if (argsCount < arguments.length && throwable == null && arguments[arguments.length - 1] instanceof Throwable) {
            throwable = (Throwable) arguments[arguments.length - 1];
            resultArgCount--;
        }
        argArray = new Object[resultArgCount];
        System.arraycopy(arguments, 0, argArray, 0, resultArgCount);

        String[] strArgs;
        if (argsCount == 1 && throwable == null && arguments.length > 1) {
            strArgs = new String[1];
            strArgs[0] = deepToString(arguments);
        } else {
            strArgs = new String[resultArgCount];
            for (int i = 0; i < strArgs.length; i++) {
                strArgs[i] = deepToString(arguments[i]);
            }
        }
        return strArgs;
    }

    @Override
    public String getFormattedMessage() {
        if (formattedMessage == null) {
            formattedMessage = formatMessage(messagePattern, stringArgs);
        }
        return formattedMessage;
    }

    @Override
    public String getFormat() {
        return messagePattern;
    }

    @Override
    public Object[] getParameters() {
        if (argArray != null) {
            return argArray;
        }
        return stringArgs;
    }

    @Override
    public Throwable getThrowable() {
        return throwable;
    }

    protected String formatMessage(final String msgPattern, final String[] sArgs) {
        return formatStringArgs(msgPattern, sArgs);
    }

    @Override
    public boolean equals(final Object o) {
        if (this == o) {
            return true;
        }
        if (o == null || getClass() != o.getClass()) {
            return false;
        }

        final ParameterizedMessage that = (ParameterizedMessage) o;

        if (messagePattern != null ? !messagePattern.equals(that.messagePattern) : that.messagePattern != null) {
            return false;
        }
        if (!Arrays.equals(stringArgs, that.stringArgs)) {
            return false;
        }
        return true;
    }

    @Override
    public int hashCode() {
        int result = messagePattern != null ? messagePattern.hashCode() : 0;
        result = HASHVAL * result + (stringArgs != null ? Arrays.hashCode(stringArgs) : 0);
        return result;
    }

    public static String format(final String messagePattern, final Object[] arguments) {
        if (messagePattern == null || arguments == null || arguments.length == 0) {
            return messagePattern;
        }
        if (arguments instanceof String[]) {
            return formatStringArgs(messagePattern, (String[]) arguments);
        }
        final String[] stringArgs = new String[arguments.length];
        for (int i = 0; i < arguments.length; i++) {
            stringArgs[i] = String.valueOf(arguments[i]);
        }
        return formatStringArgs(messagePattern, stringArgs);
    }

    static String formatStringArgs(final String messagePattern, final String[] arguments) {
        int len = 0;
        if (messagePattern == null || (len = messagePattern.length()) == 0 || arguments == null
                || arguments.length == 0) {
            return messagePattern;
        }

        return formatStringArgs0(messagePattern, len, arguments);
    }

    private static String formatStringArgs0(final String messagePattern, final int len, final String[] arguments) {
        final char[] result = new char[len + sumStringLengths(arguments)];
        int pos = 0;
        int escapeCounter = 0;
        int currentArgument = 0;
        int i = 0;
        for (; i < len - 1; i++) {
            final char curChar = messagePattern.charAt(i);
            if (curChar == ESCAPE_CHAR) {
                escapeCounter++;
            } else {
                if (isDelimPair(curChar, messagePattern, i)) {
                    i++;
                    pos = writeEscapedEscapeChars(escapeCounter, result, pos);
                    if (isOdd(escapeCounter)) {
                        pos = writeDelimPair(result, pos);
                    } else {
                        pos = writeArgOrDelimPair(arguments, currentArgument, result, pos);
                        currentArgument++;
                    }
                } else {
                    pos = handleLiteralChar(result, pos, escapeCounter, curChar);
                }
                escapeCounter = 0;
            }
        }
        pos = handleRemainingCharIfAny(messagePattern, len, result, pos, escapeCounter, i);
        return new String(result, 0, pos);
    }

    private static int sumStringLengths(final String[] arguments) {
        int result = 0;
        for (int i = 0; i < arguments.length; i++) {
            result += String.valueOf(arguments[i]).length();
        }
        return result;
    }

    private static boolean isDelimPair(final char curChar, final String messagePattern, final int curCharIndex) {
        return curChar == DELIM_START && messagePattern.charAt(curCharIndex + 1) == DELIM_STOP;
    }

    private static int handleRemainingCharIfAny(final String messagePattern, final int len, final char[] result,
            int pos, int escapeCounter, int i) {
        if (i == len - 1) {
            final char curChar = messagePattern.charAt(i);
            pos = handleLastChar(result, pos, escapeCounter, curChar);
        }
        return pos;
    }

    private static int handleLastChar(final char[] result, int pos, final int escapeCounter, final char curChar) {
        if (curChar == ESCAPE_CHAR) {
            pos = writeUnescapedEscapeChars(escapeCounter + 1, result, pos);
        } else {
            pos = handleLiteralChar(result, pos, escapeCounter, curChar);
        }
        return pos;
    }

    private static int handleLiteralChar(final char[] result, int pos, final int escapeCounter, final char curChar) {
        pos = writeUnescapedEscapeChars(escapeCounter, result, pos);
        result[pos++] = curChar;
        return pos;
    }

    private static int writeDelimPair(final char[] result, int pos) {
        result[pos++] = DELIM_START;
        result[pos++] = DELIM_STOP;
        return pos;
    }

    private static boolean isOdd(final int number) {
        return (number & 1) == 1;
    }

    private static int writeEscapedEscapeChars(final int escapeCounter, final char[] result, final int pos) {
        final int escapedEscapes = escapeCounter >> 1;
        return writeUnescapedEscapeChars(escapedEscapes, result, pos);
    }

    private static int writeUnescapedEscapeChars(int escapeCounter, char[] result, int pos) {
        while (escapeCounter > 0) {
            result[pos++] = ESCAPE_CHAR;
            escapeCounter--;
        }
        return pos;
    }

    private static int writeArgOrDelimPair(final String[] arguments, final int currentArgument, final char[] result,
            int pos) {
        if (currentArgument < arguments.length) {
            pos = writeArgAt0(arguments, currentArgument, result, pos);
        } else {
            pos = writeDelimPair(result, pos);
        }
        return pos;
    }

    private static int writeArgAt0(final String[] arguments, final int currentArgument, final char[] result,
            final int pos) {
        final String arg = String.valueOf(arguments[currentArgument]);
        int argLen = arg.length();
        arg.getChars(0, argLen, result, pos);
        return pos + argLen;
    }

    public static int countArgumentPlaceholders(final String messagePattern) {
        if (messagePattern == null) {
            return 0;
        }

        final int delim = messagePattern.indexOf(DELIM_START);

        if (delim == -1) {
            return 0;
        }
        int result = 0;
        boolean isEscaped = false;
        for (int i = 0; i < messagePattern.length(); i++) {
            final char curChar = messagePattern.charAt(i);
            if (curChar == ESCAPE_CHAR) {
                isEscaped = !isEscaped;
            } else if (curChar == DELIM_START) {
                if (!isEscaped && i < messagePattern.length() - 1 && messagePattern.charAt(i + 1) == DELIM_STOP) {
                    result++;
                    i++;
                }
                isEscaped = false;
            } else {
                isEscaped = false;
            }
        }
        return result;
    }

    public static String deepToString(final Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof String) {
            return (String) o;
        }
        final StringBuilder str = new StringBuilder();
        final Set<String> dejaVu = new HashSet<>();
        recursiveDeepToString(o, str, dejaVu);
        return str.toString();
    }

    private static void recursiveDeepToString(final Object o, final StringBuilder str, final Set<String> dejaVu) {
        if (appendStringDateOrNull(o, str)) {
            return;
        }
        if (isMaybeRecursive(o)) {
            appendPotentiallyRecursiveValue(o, str, dejaVu);
        } else {
            tryObjectToString(o, str);
        }
    }

    private static boolean appendStringDateOrNull(final Object o, final StringBuilder str) {
        if (o == null || o instanceof String) {
            str.append(String.valueOf(o));
            return true;
        }
        return appendDate(o, str);
    }

    private static boolean appendDate(final Object o, final StringBuilder str) {
        if (!(o instanceof Date)) {
            return false;
        }
        final Date date = (Date) o;
        final SimpleDateFormat format = getSimpleDateFormat();
        str.append(format.format(date));
        return true;
    }

    private static SimpleDateFormat getSimpleDateFormat() {
        return new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ");
    }

    private static boolean isMaybeRecursive(final Object o) {
        return o.getClass().isArray() || o instanceof Map || o instanceof Collection;
    }

    private static void appendPotentiallyRecursiveValue(final Object o, final StringBuilder str,
            final Set<String> dejaVu) {
        final Class<?> oClass = o.getClass();
        if (oClass.isArray()) {
            appendArray(o, str, dejaVu, oClass);
        } else if (o instanceof Map) {
            appendMap(o, str, dejaVu);
        } else if (o instanceof Collection) {
            appendCollection(o, str, dejaVu);
        }
    }

    private static void appendArray(final Object o, final StringBuilder str, final Set<String> dejaVu,
            final Class<?> oClass) {
        if (oClass.isArray()) {
            Class<?> component = oClass.getComponentType();
            if (component.isPrimitive()) {
                int len = Array.getLength(o);
                Object[] boxed = new Object[len];
                for (int i = 0; i < len; i++) {
                    boxed[i] = Array.get(o, i);
                }
                str.append(Arrays.toString(boxed));
            } else {
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
    }

    private static void appendMap(final Object o, final StringBuilder str, final Set<String> dejaVu) {
        final String id = identityToString(o);
        if (dejaVu.contains(id)) {
            str.append(RECURSION_PREFIX).append(id).append(RECURSION_SUFFIX);
        } else {
            dejaVu.add(id);
            final Map<?, ?> oMap = (Map<?, ?>) o;
            str.append('{');
            boolean isFirst = true;
            for (final Object o1 : oMap.entrySet()) {
                final Map.Entry<?, ?> current = (Map.Entry<?, ?>) o1;
                if (isFirst) {
                    isFirst = false;
                } else {
                    str.append(", ");
                }
                final Object key = current.getKey();
                final Object value = current.getValue();
                recursiveDeepToString(key, str, new HashSet<>(dejaVu));
                str.append('=');
                recursiveDeepToString(value, str, new HashSet<>(dejaVu));
            }
            str.append('}');
        }
    }

    private static void appendCollection(final Object o, final StringBuilder str, final Set<String> dejaVu) {
        final String id = identityToString(o);
        if (dejaVu.contains(id)) {
            str.append(RECURSION_PREFIX).append(id).append(RECURSION_SUFFIX);
        } else {
            dejaVu.add(id);
            final Collection<?> oCol = (Collection<?>) o;
            str.append('[');
            boolean isFirst = true;
            for (final Object anOCol : oCol) {
                if (isFirst) {
                    isFirst = false;
                } else {
                    str.append(", ");
                }
                recursiveDeepToString(anOCol, str, new HashSet<>(dejaVu));
            }
            str.append(']');
        }
    }

    private static void tryObjectToString(final Object o, final StringBuilder str) {
        try {
            str.append(o.toString());
        } catch (final Throwable t) {
            handleErrorInObjectToString(o, str, t);
        }
    }

    private static void handleErrorInObjectToString(final Object o, final StringBuilder str, final Throwable t) {
        str.append(ERROR_PREFIX);
        str.append(identityToString(o));
        str.append(ERROR_SEPARATOR);
        final String msg = t.getMessage();
        final String className = t.getClass().getName();
        str.append(className);
        if (!className.equals(msg)) {
            str.append(ERROR_MSG_SEPARATOR);
            str.append(msg);
        }
        str.append(ERROR_SUFFIX);
    }

    public static String identityToString(final Object obj) {
        if (obj == null) {
            return null;
        }
        return obj.getClass().getName() + '@' + Integer.toHexString(System.identityHashCode(obj));
    }

    @Override
    public String toString() {
        return "ParameterizedMessage[messagePattern=" + messagePattern + ", stringArgs=" +
            Arrays.toString(stringArgs) + ", throwable=" + throwable + ']';
    }
}