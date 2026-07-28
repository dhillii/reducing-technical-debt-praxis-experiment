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
                int endPos = findVariableEnd(chars, pos, prefixMatcher, suffixMatcher, substitutionInVariablesEnabled, bufEnd);
                if (endPos != -1) {
                    String varNameExpr = new String(chars, pos + startMatchLen, endPos - pos - startMatchLen);
                    if (substitutionInVariablesEnabled) {
                        varNameExpr = substituteVariableName(event, varNameExpr);
                    }
                    String varName = extractVariableName(varNameExpr, valueDelimiterMatcher);
                    String varDefaultValue = extractVariableDefaultValue(varNameExpr, valueDelimiterMatcher);

                    if (priorVariables == null) {
                        priorVariables = new ArrayList<>();
                        priorVariables.add(new String(chars, offset, length + lengthChange));
                    }

                    checkCyclicSubstitution(varName, priorVariables);
                    priorVariables.add(varName);

                    String varValue = resolveVariable(event, varName, buf, pos, endPos);
                    if (varValue == null) {
                        varValue = varDefaultValue;
                    }
                    if (varValue != null) {
                        buf.replace(pos, endPos, varValue);
                        altered = true;
                        int change = substitute(event, buf, pos, varValue.length(), priorVariables);
                        change += varValue.length() - (endPos - pos);
                        pos += change;
                        bufEnd += change;
                        lengthChange += change;
                        chars = getChars(buf);
                    }

                    priorVariables.remove(priorVariables.size() - 1);
                }
            }
        }
    }

    if (top) {
        return altered ? 1 : 0;
    }
    return lengthChange;
}

private boolean isEscaped(char[] chars, int pos, char escape) {
    return pos > 0 && chars[pos - 1] == escape;
}

private int findVariableEnd(char[] chars, int pos, StrMatcher prefixMatcher, StrMatcher suffixMatcher, boolean substitutionInVariablesEnabled, int bufEnd) {
    int endPos = pos;
    int nestedVarCount = 0;
    while (endPos < bufEnd) {
        if (substitutionInVariablesEnabled && prefixMatcher.isMatch(chars, endPos, pos, bufEnd) != 0) {
            nestedVarCount++;
            endPos += prefixMatcher.isMatch(chars, endPos, pos, bufEnd);
            continue;
        }

        int endMatchLen = suffixMatcher.isMatch(chars, endPos, pos, bufEnd);
        if (endMatchLen == 0) {
            endPos++;
        } else {
            if (nestedVarCount == 0) {
                return endPos + endMatchLen;
            }
            nestedVarCount--;
            endPos += endMatchLen;
        }
    }
    return -1;
}

private String substituteVariableName(LogEvent event, String varNameExpr) {
    StringBuilder bufName = new StringBuilder(varNameExpr);
    substitute(event, bufName, 0, bufName.length());
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

private String extractVariableDefaultValue(String varNameExpr, StrMatcher valueDelimiterMatcher) {
    if (valueDelimiterMatcher == null) {
        return null;
    }
    int valueDelimiterMatchLen = valueDelimiterMatcher.isMatch(varNameExpr.toCharArray(), 0);
    if (valueDelimiterMatchLen == 0) {
        return null;
    }
    return varNameExpr.substring(valueDelimiterMatchLen + valueDelimiterMatcher.getMatch());
}