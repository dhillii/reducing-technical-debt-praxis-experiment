private int substitute(final LogEvent event, final StringBuilder buf, final int offset, final int length,
                       List<String> priorVariables) {
    final StrMatcher prefixMatcher = getVariablePrefixMatcher();
    final StrMatcher suffixMatcher = getVariableSuffixMatcher();
    final char escape = getEscapeChar();
    final StrMatcher valueDelimiterMatcher = getValueDelimiterMatcher();
    final boolean substitutionInVariablesEnabled = isEnableSubstitutionInVariables();

    final boolean top = priorVariables == null;
    boolean altered = false;
    int lengthChange = 0;
    char[] chars = getChars(buf);
    int bufEnd = offset + length;
    int pos = offset;

    while (pos < bufEnd) {
        int startMatchLen = prefixMatcher.isMatch(chars, pos, offset, bufEnd);
        if (startMatchLen == 0) {
            pos++;
        } else {
            if (isEscaped(chars, pos, escape)) {
                buf.deleteCharAt(pos - 1);
                chars = getChars(buf);
                lengthChange--;
                altered = true;
                bufEnd--;
            } else {
                int endMatchLen = findSuffix(chars, pos, bufEnd, prefixMatcher, suffixMatcher, substitutionInVariablesEnabled);
                if (endMatchLen > 0) {
                    String varNameExpr = new String(chars, pos + startMatchLen, endMatchLen - startMatchLen);
                    if (substitutionInVariablesEnabled) {
                        varNameExpr = substituteVariableName(event, varNameExpr);
                    }
                    String varName = extractVariableName(varNameExpr, valueDelimiterMatcher);
                    String varDefaultValue = extractDefaultValue(varNameExpr, valueDelimiterMatcher);

                    checkCyclicSubstitution(varName, priorVariables);
                    priorVariables = addVariableToPriorVariables(priorVariables, varName);

                    String varValue = resolveVariable(event, varName, buf, pos, pos + startMatchLen + endMatchLen);
                    if (varValue == null) {
                        varValue = varDefaultValue;
                    }
                    if (varValue != null) {
                        buf.replace(pos, pos + startMatchLen + endMatchLen, varValue);
                        altered = true;
                        int change = substitute(event, buf, pos, varValue.length(), priorVariables);
                        change += varValue.length() - (startMatchLen + endMatchLen);
                        pos += change;
                        bufEnd += change;
                        lengthChange += change;
                        chars = getChars(buf);
                    }

                    priorVariables = removeVariableFromPriorVariables(priorVariables);
                }
            }
        }
    }

    return top ? (altered ? 1 : 0) : lengthChange;
}

private boolean isEscaped(char[] chars, int pos, char escape) {
    return pos > 0 && chars[pos - 1] == escape;
}

private int findSuffix(char[] chars, int pos, int bufEnd, StrMatcher prefixMatcher, StrMatcher suffixMatcher, boolean substitutionInVariablesEnabled) {
    int endMatchLen = 0;
    int nestedVarCount = 0;
    while (pos < bufEnd) {
        if (substitutionInVariablesEnabled && prefixMatcher.isMatch(chars, pos, 0, bufEnd) != 0) {
            nestedVarCount++;
            pos += prefixMatcher.isMatch(chars, pos, 0, bufEnd);
            continue;
        }
        endMatchLen = suffixMatcher.isMatch(chars, pos, 0, bufEnd);
        if (endMatchLen == 0) {
            pos++;
        } else {
            if (nestedVarCount == 0) {
                return endMatchLen;
            }
            nestedVarCount--;
            pos += endMatchLen;
        }
    }
    return 0;
}

private String substituteVariableName(LogEvent event, String varNameExpr) {
    StringBuilder bufName = new StringBuilder(varNameExpr);
    substitute(event, bufName, 0, bufName.length(), null);
    return bufName.toString();
}

private String extractVariableName(String varNameExpr, StrMatcher valueDelimiterMatcher) {
    if (valueDelimiterMatcher == null) {
        return varNameExpr;
    }
    int valueDelimiterMatchLen = valueDelimiterMatcher.isMatch(varNameExpr.toCharArray(), 0);
    if (valueDelimiterMatchLen == 0) {
        return varNameExpr;
    }
    return varNameExpr.substring(0, valueDelimiterMatchLen);
}

private String extractDefaultValue(String varNameExpr, StrMatcher valueDelimiterMatcher) {
    if (valueDelimiterMatcher == null) {
        return null;
    }
    int valueDelimiterMatchLen = valueDelimiterMatcher.isMatch(varNameExpr.toCharArray(), 0);
    if (valueDelimiterMatchLen == 0) {
        return null;
    }
    return varNameExpr.substring(valueDelimiterMatchLen + valueDelimiterMatcher.getMatch());
}

private void checkCyclicSubstitution(String varName, List<String> priorVariables) {
    if (priorVariables.contains(varName)) {
        StringBuilder buf = new StringBuilder(BUF_SIZE);
        buf.append("Infinite loop in property interpolation of ");
        buf.append(priorVariables.remove(0));
        buf.append(": ");
        appendWithSeparators(buf, priorVariables, "->");
        throw new IllegalStateException(buf.toString());
    }
}

private List<String> addVariableToPriorVariables(List<String> priorVariables, String varName) {
    if (priorVariables == null) {
        priorVariables = new ArrayList<>();
        priorVariables.add(new String(getChars(new StringBuilder()), 0, getChars(new StringBuilder()).length));
    }
    priorVariables.add(varName);
    return priorVariables;
}

private List<String> removeVariableFromPriorVariables(List<String> priorVariables) {
    priorVariables.remove(priorVariables.size() - 1);
    return priorVariables;
}