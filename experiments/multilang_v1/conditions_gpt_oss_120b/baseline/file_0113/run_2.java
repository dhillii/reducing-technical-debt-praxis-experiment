package org.apache.logging.log4j.core.lookup;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.HashMap;
import java.util.Enumeration;

import org.apache.logging.log4j.core.LogEvent;
import org.apache.logging.log4j.util.Strings;

public class StrSubstitutor {

    public static final char DEFAULT_ESCAPE = '$';
    public static final StrMatcher DEFAULT_PREFIX = StrMatcher.stringMatcher(DEFAULT_ESCAPE + "{");
    public static final StrMatcher DEFAULT_SUFFIX = StrMatcher.stringMatcher("}");
    public static final StrMatcher DEFAULT_VALUE_DELIMITER = StrMatcher.stringMatcher(":-");
    private static final int BUF_SIZE = 256;

    private char escapeChar;
    private StrMatcher prefixMatcher;
    private StrMatcher suffixMatcher;
    private StrMatcher valueDelimiterMatcher;
    private StrLookup variableResolver;
    private boolean enableSubstitutionInVariables;

    public StrSubstitutor() {
        this(null, DEFAULT_PREFIX, DEFAULT_SUFFIX, DEFAULT_ESCAPE);
    }

    public StrSubstitutor(final Map<String, String> valueMap) {
        this(new MapLookup(valueMap), DEFAULT_PREFIX, DEFAULT_SUFFIX, DEFAULT_ESCAPE);
    }

    public StrSubstitutor(final Map<String, String> valueMap, final String prefix, final String suffix) {
        this(new MapLookup(valueMap), prefix, suffix, DEFAULT_ESCAPE);
    }

    public StrSubstitutor(final Map<String, String> valueMap, final String prefix, final String suffix,
                          final char escape) {
        this(new MapLookup(valueMap), prefix, suffix, escape);
    }

    public StrSubstitutor(final Map<String, String> valueMap, final String prefix, final String suffix,
                          final char escape, final String valueDelimiter) {
        this(new MapLookup(valueMap), prefix, suffix, escape, valueDelimiter);
    }

    public StrSubstitutor(final StrLookup variableResolver) {
        this(variableResolver, DEFAULT_PREFIX, DEFAULT_SUFFIX, DEFAULT_ESCAPE);
    }

    public StrSubstitutor(final StrLookup variableResolver, final String prefix, final String suffix,
                          final char escape) {
        this.setVariableResolver(variableResolver);
        this.setVariablePrefix(prefix);
        this.setVariableSuffix(suffix);
        this.setEscapeChar(escape);
    }

    public StrSubstitutor(final StrLookup variableResolver, final String prefix, final String suffix,
                          final char escape, final String valueDelimiter) {
        this.setVariableResolver(variableResolver);
        this.setVariablePrefix(prefix);
        this.setVariableSuffix(suffix);
        this.setEscapeChar(escape);
        this.setValueDelimiter(valueDelimiter);
    }

    public StrSubstitutor(final StrLookup variableResolver, final StrMatcher prefixMatcher,
                          final StrMatcher suffixMatcher, final char escape) {
        this(variableResolver, prefixMatcher, suffixMatcher, escape, DEFAULT_VALUE_DELIMITER);
    }

    public StrSubstitutor(final StrLookup variableResolver, final StrMatcher prefixMatcher,
                          final StrMatcher suffixMatcher, final char escape,
                          final StrMatcher valueDelimiterMatcher) {
        this.setVariableResolver(variableResolver);
        this.setVariablePrefixMatcher(prefixMatcher);
        this.setVariableSuffixMatcher(suffixMatcher);
        this.setEscapeChar(escape);
        this.setValueDelimiterMatcher(valueDelimiterMatcher);
    }

    public static String replace(final Object source, final Map<String, String> valueMap) {
        return new StrSubstitutor(valueMap).replace(source);
    }

    public static String replace(final Object source, final Map<String, String> valueMap,
                                 final String prefix, final String suffix) {
        return new StrSubstitutor(valueMap, prefix, suffix).replace(source);
    }

    public static String replace(final Object source, final Properties valueProperties) {
        if (valueProperties == null) {
            return source.toString();
        }
        final Map<String, String> valueMap = new HashMap<>();
        final Enumeration<?> propNames = valueProperties.propertyNames();
        while (propNames.hasMoreElements()) {
            final String propName = (String) propNames.nextElement();
            final String propValue = valueProperties.getProperty(propName);
            valueMap.put(propName, propValue);
        }
        return StrSubstitutor.replace(source, valueMap);
    }

    public String replace(final String source) {
        return replace(null, source);
    }

    public String replace(final LogEvent event, final String source) {
        if (source == null) {
            return null;
        }
        final StringBuilder buf = new StringBuilder(source);
        if (!substitute(event, buf, 0, source.length())) {
            return source;
        }
        return buf.toString();
    }

    public String replace(final String source, final int offset, final int length) {
        return replace(null, source, offset, length);
    }

    public String replace(final LogEvent event, final String source, final int offset, final int length) {
        if (source == null) {
            return null;
        }
        final StringBuilder buf = new StringBuilder(length).append(source, offset, length);
        if (!substitute(event, buf, 0, length)) {
            return source.substring(offset, offset + length);
        }
        return buf.toString();
    }

    public String replace(final char[] source) {
        return replace(null, source);
    }

    public String replace(final LogEvent event, final char[] source) {
        if (source == null) {
            return null;
        }
        final StringBuilder buf = new StringBuilder(source.length).append(source);
        substitute(event, buf, 0, source.length);
        return buf.toString();
    }

    public String replace(final char[] source, final int offset, final int length) {
        return replace(null, source, offset, length);
    }

    public String replace(final LogEvent event, final char[] source, final int offset, final int length) {
        if (source == null) {
            return null;
        }
        final StringBuilder buf = new StringBuilder(length).append(source, offset, length);
        substitute(event, buf, 0, length);
        return buf.toString();
    }

    public String replace(final StringBuffer source) {
        return replace(null, source);
    }

    public String replace(final LogEvent event, final StringBuffer source) {
        if (source == null) {
            return null;
        }
        final StringBuilder buf = new StringBuilder(source.length()).append(source);
        substitute(event, buf, 0, buf.length());
        return buf.toString();
    }

    public String replace(final StringBuffer source, final int offset, final int length) {
        return replace(null, source, offset, length);
    }

    public String replace(final LogEvent event, final StringBuffer source, final int offset, final int length) {
        if (source == null) {
            return null;
        }
        final StringBuilder buf = new StringBuilder(length).append(source, offset, length);
        substitute(event, buf, 0, length);
        return buf.toString();
    }

    public String replace(final StringBuilder source) {
        return replace(null, source);
    }

    public String replace(final LogEvent event, final StringBuilder source) {
        if (source == null) {
            return null;
        }
        final StringBuilder buf = new StringBuilder(source.length()).append(source);
        substitute(event, buf, 0, buf.length());
        return buf.toString();
    }

    public String replace(final StringBuilder source, final int offset, final int length) {
        return replace(null, source, offset, length);
    }

    public String replace(final LogEvent event, final StringBuilder source, final int offset, final int length) {
        if (source == null) {
            return null;
        }
        final StringBuilder buf = new StringBuilder(length).append(source, offset, length);
        substitute(event, buf, 0, length);
        return buf.toString();
    }

    public String replace(final Object source) {
        return replace(null, source);
    }

    public String replace(final LogEvent event, final Object source) {
        if (source == null) {
            return null;
        }
        final StringBuilder buf = new StringBuilder().append(source);
        substitute(event, buf, 0, buf.length());
        return buf.toString();
    }

    public boolean replaceIn(final StringBuffer source) {
        if (source == null) {
            return false;
        }
        return replaceIn(source, 0, source.length());
    }

    public boolean replaceIn(final StringBuffer source, final int offset, final int length) {
        return replaceIn(null, source, offset, length);
    }

    public boolean replaceIn(final LogEvent event, final StringBuffer source, final int offset, final int length) {
        if (source == null) {
            return false;
        }
        final StringBuilder buf = new StringBuilder(length).append(source, offset, length);
        if (!substitute(event, buf, 0, length)) {
            return false;
        }
        source.replace(offset, offset + length, buf.toString());
        return true;
    }

    public boolean replaceIn(final StringBuilder source) {
        return replaceIn(null, source);
    }

    public boolean replaceIn(final LogEvent event, final StringBuilder source) {
        if (source == null) {
            return false;
        }
        return substitute(event, source, 0, source.length());
    }

    public boolean replaceIn(final StringBuilder source, final int offset, final int length) {
        return replaceIn(null, source, offset, length);
    }

    public boolean replaceIn(final LogEvent event, final StringBuilder source, final int offset, final int length) {
        if (source == null) {
            return false;
        }
        return substitute(event, source, offset, length);
    }

    protected boolean substitute(final LogEvent event, final StringBuilder buf, final int offset, final int length) {
        return substitute(event, buf, offset, length, null) > 0;
    }

    private int substitute(final LogEvent event, final StringBuilder buf, final int offset, final int length,
                           List<String> priorVariables) {
        final StrMatcher prefixMatcher = getVariablePrefixMatcher();
        final StrMatcher suffixMatcher = getVariableSuffixMatcher();
        final char escape = getEscapeChar();
        final StrMatcher valueDelimiterMatcher = getValueDelimiterMatcher();
        final boolean substitutionInVariablesEnabled = isEnableSubstitutionInVariables();

        final boolean top = priorVariables == null;
        if (top) {
            priorVariables = new ArrayList<>();
        }

        boolean altered = false;
        int lengthChange = 0;
        char[] chars = getChars(buf);
        int bufEnd = offset + length;
        int pos = offset;

        while (pos < bufEnd) {
            int startMatchLen = prefixMatcher.isMatch(chars, pos, offset, bufEnd);
            if (startMatchLen == 0) {
                pos++;
                continue;
            }

            if (pos > offset && chars[pos - 1] == escape) {
                buf.deleteCharAt(pos - 1);
                chars = getChars(buf);
                lengthChange--;
                altered = true;
                bufEnd--;
                continue;
            }

            Result result = handleVariable(event, buf, chars, pos, startMatchLen, offset, bufEnd,
                    prefixMatcher, suffixMatcher, valueDelimiterMatcher,
                    substitutionInVariablesEnabled, priorVariables, escape);
            if (result.altered) {
                altered = true;
                lengthChange += result.change;
                chars = getChars(buf);
                bufEnd = offset + length + lengthChange;
                pos = result.newPos;
            } else {
                pos++;
            }
        }

        if (top) {
            return altered ? 1 : 0;
        }
        return lengthChange;
    }

    private static class Result {
        int newPos;
        int change;
        boolean altered;
    }

    private Result handleVariable(final LogEvent event, final StringBuilder buf, char[] chars,
                                 int startPos, int startMatchLen, int offset, int bufEnd,
                                 StrMatcher prefixMatcher, StrMatcher suffixMatcher,
                                 StrMatcher valueDelimiterMatcher, boolean substitutionInVariablesEnabled,
                                 List<String> priorVariables, char escape) {
        Result result = new Result();
        int pos = startPos + startMatchLen;
        int nestedVarCount = 0;

        while (pos < bufEnd) {
            if (substitutionInVariablesEnabled) {
                int nestedStartLen = prefixMatcher.isMatch(chars, pos, offset, bufEnd);
                if (nestedStartLen != 0) {
                    nestedVarCount++;
                    pos += nestedStartLen;
                    continue;
                }
            }

            int endMatchLen = suffixMatcher.isMatch(chars, pos, offset, bufEnd);
            if (endMatchLen == 0) {
                pos++;
                continue;
            }

            if (nestedVarCount == 0) {
                String varNameExpr = new String(chars, startPos + startMatchLen,
                        pos - startPos - startMatchLen);
                if (substitutionInVariablesEnabled) {
                    StringBuilder nameBuf = new StringBuilder(varNameExpr);
                    substitute(event, nameBuf, 0, nameBuf.length());
                    varNameExpr = nameBuf.toString();
                }
                pos += endMatchLen;
                int endPos = pos;

                VarParseResult parseResult = parseVariableName(varNameExpr, valueDelimiterMatcher,
                        prefixMatcher, substitutionInVariablesEnabled);
                String varName = parseResult.varName;
                String varDefaultValue = parseResult.defaultValue;

                priorVariables.add(varName);
                checkCyclicSubstitution(varName, priorVariables);
                String varValue = resolveVariable(event, varName, buf, startPos, endPos);
                if (varValue == null) {
                    varValue = varDefaultValue;
                }
                if (varValue != null) {
                    int varLen = varValue.length();
                    buf.replace(startPos, endPos, varValue);
                    int innerChange = substitute(event, buf, startPos, varLen, priorVariables);
                    int totalChange = innerChange + (varLen - (endPos - startPos));
                    result.change = totalChange;
                    result.newPos = startPos + varLen + innerChange;
                    result.altered = true;
                } else {
                    result.newPos = pos;
                }
                priorVariables.remove(priorVariables.size() - 1);
                return result;
            } else {
                nestedVarCount--;
                pos += endMatchLen;
            }
        }

        result.newPos = pos;
        return result;
    }

    private static class VarParseResult {
        String varName;
        String defaultValue;
    }

    private VarParseResult parseVariableName(String expr, StrMatcher valueDelimiterMatcher,
                                             StrMatcher prefixMatcher, boolean substitutionInVariablesEnabled) {
        VarParseResult result = new VarParseResult();
        result.varName = expr;
        result.defaultValue = null;

        if (valueDelimiterMatcher == null) {
            return result;
        }

        char[] exprChars = expr.toCharArray();
        for (int i = 0; i < exprChars.length; i++) {
            if (!substitutionInVariablesEnabled &&
                prefixMatcher.isMatch(exprChars, i, i, exprChars.length) != 0) {
                break;
            }
            int delimLen = valueDelimiterMatcher.isMatch(exprChars, i);
            if (delimLen != 0) {
                result.varName = expr.substring(0, i);
                result.defaultValue = expr.substring(i + delimLen);
                break;
            }
        }
        return result;
    }

    private void checkCyclicSubstitution(final String varName, final List<String> priorVariables) {
        if (!priorVariables.contains(varName)) {
            return;
        }
        final StringBuilder buf = new StringBuilder(BUF_SIZE);
        buf.append("Infinite loop in property interpolation of ");
        buf.append(priorVariables.remove(0));
        buf.append(": ");
        appendWithSeparators(buf, priorVariables, "->");
        throw new IllegalStateException(buf.toString());
    }

    protected String resolveVariable(final LogEvent event, final String variableName, final StringBuilder buf,
                                     final int startPos, final int endPos) {
        final StrLookup resolver = getVariableResolver();
        if (resolver == null) {
            return null;
        }
        return resolver.lookup(event, variableName);
    }

    public char getEscapeChar() {
        return this.escapeChar;
    }

    public void setEscapeChar(final char escapeCharacter) {
        this.escapeChar = escapeCharacter;
    }

    public StrMatcher getVariablePrefixMatcher() {
        return prefixMatcher;
    }

    public StrSubstitutor setVariablePrefixMatcher(final StrMatcher prefixMatcher) {
        if (prefixMatcher == null) {
            throw new IllegalArgumentException("Variable prefix matcher must not be null!");
        }
        this.prefixMatcher = prefixMatcher;
        return this;
    }

    public StrSubstitutor setVariablePrefix(final char prefix) {
        return setVariablePrefixMatcher(StrMatcher.charMatcher(prefix));
    }

    public StrSubstitutor setVariablePrefix(final String prefix) {
        if (prefix == null) {
            throw new IllegalArgumentException("Variable prefix must not be null!");
        }
        return setVariablePrefixMatcher(StrMatcher.stringMatcher(prefix));
    }

    public StrMatcher getVariableSuffixMatcher() {
        return suffixMatcher;
    }

    public StrSubstitutor setVariableSuffixMatcher(final StrMatcher suffixMatcher) {
        if (suffixMatcher == null) {
            throw new IllegalArgumentException("Variable suffix matcher must not be null!");
        }
        this.suffixMatcher = suffixMatcher;
        return this;
    }

    public StrSubstitutor setVariableSuffix(final char suffix) {
        return setVariableSuffixMatcher(StrMatcher.charMatcher(suffix));
    }

    public StrSubstitutor setVariableSuffix(final String suffix) {
        if (suffix == null) {
            throw new IllegalArgumentException("Variable suffix must not be null!");
        }
        return setVariableSuffixMatcher(StrMatcher.stringMatcher(suffix));
    }

    public StrMatcher getValueDelimiterMatcher() {
        return valueDelimiterMatcher;
    }

    public StrSubstitutor setValueDelimiterMatcher(final StrMatcher valueDelimiterMatcher) {
        this.valueDelimiterMatcher = valueDelimiterMatcher;
        return this;
    }

    public StrSubstitutor setValueDelimiter(final char valueDelimiter) {
        return setValueDelimiterMatcher(StrMatcher.charMatcher(valueDelimiter));
    }

    public StrSubstitutor setValueDelimiter(final String valueDelimiter) {
        if (Strings.isEmpty(valueDelimiter)) {
            setValueDelimiterMatcher(null);
            return this;
        }
        return setValueDelimiterMatcher(StrMatcher.stringMatcher(valueDelimiter));
    }

    public StrLookup getVariableResolver() {
        return this.variableResolver;
    }

    public void setVariableResolver(final StrLookup variableResolver) {
        this.variableResolver = variableResolver;
    }

    public boolean isEnableSubstitutionInVariables() {
        return enableSubstitutionInVariables;
    }

    public void setEnableSubstitutionInVariables(final boolean enableSubstitutionInVariables) {
        this.enableSubstitutionInVariables = enableSubstitutionInVariables;
    }

    private char[] getChars(final StringBuilder sb) {
        final char[] chars = new char[sb.length()];
        sb.getChars(0, sb.length(), chars, 0);
        return chars;
    }

    public void appendWithSeparators(final StringBuilder sb, final Iterable<?> iterable, String separator) {
        if (iterable != null) {
            separator = separator == null ? Strings.EMPTY : separator;
            final Iterator<?> it = iterable.iterator();
            while (it.hasNext()) {
                sb.append(it.next());
                if (it.hasNext()) {
                    sb.append(separator);
                }
            }
        }
    }

    @Override
    public String toString() {
        return "StrSubstitutor(" + variableResolver.toString() + ')';
    }
}