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
            handleVariable(event, buf, chars, pos, startMatchLen, prefixMatcher, suffixMatcher, escape, valueDelimiterMatcher, substitutionInVariablesEnabled, priorVariables, altered, lengthChange, bufEnd);
        }
    }

    if (top) {
        return altered ? 1 : 0;
    }
    return lengthChange;
}

private void handleVariable(final LogEvent event, final StringBuilder buf, char[] chars, int pos, int startMatchLen, 
                            final StrMatcher prefixMatcher, final StrMatcher suffixMatcher, final char escape, 
                            final StrMatcher valueDelimiterMatcher, final boolean substitutionInVariablesEnabled, 
                            List<String> priorVariables, boolean altered, int lengthChange, int bufEnd) {
    if (pos > 0 && chars[pos - 1] == escape) {
        buf.deleteCharAt(pos - 1);
        chars = getChars(buf);
        lengthChange--;
        altered = true;
        bufEnd--;
    } else {
        int endMatchLen = 0;
        int nestedVarCount = 0;
        int startPos = pos;
        pos += startMatchLen;

        while (pos < bufEnd) {
            if (substitutionInVariablesEnabled && (endMatchLen = prefixMatcher.isMatch(chars, pos, 0, chars.length)) != 0) {
                nestedVarCount++;
                pos += endMatchLen;
            } else {
                endMatchLen = suffixMatcher.isMatch(chars, pos, 0, chars.length);
                if (endMatchLen == 0) {
                    pos++;
                } else {
                    if (nestedVarCount == 0) {
                        String varNameExpr = new String(chars, startPos + startMatchLen, pos - startPos - startMatchLen);
                        if (substitutionInVariablesEnabled) {
                            final StringBuilder bufName = new StringBuilder(varNameExpr);
                            substitute(event, bufName, 0, bufName.length(), priorVariables);
                            varNameExpr = bufName.toString();
                        }
                        pos += endMatchLen;
                        int endPos = pos;

                        String varName = varNameExpr;
                        String varDefaultValue = null;

                        if (valueDelimiterMatcher != null) {
                            char[] varNameExprChars = varNameExpr.toCharArray();
                            int valueDelimiterMatchLen = 0;
                            for (int i = 0; i < varNameExprChars.length; i++) {
                                if (!substitutionInVariablesEnabled && prefixMatcher.isMatch(varNameExprChars, i, i, varNameExprChars.length) != 0) {
                                    break;
                                }
                                if ((valueDelimiterMatchLen = valueDelimiterMatcher.isMatch(varNameExprChars, i)) != 0) {
                                    varName = varNameExpr.substring(0, i);
                                    varDefaultValue = varNameExpr.substring(i + valueDelimiterMatchLen);
                                    break;
                                }
                            }
                        }

                        if (priorVariables == null) {
                            priorVariables = new ArrayList<>();
                            priorVariables.add(new String(chars, 0, chars.length));
                        }

                        checkCyclicSubstitution(varName, priorVariables);
                        priorVariables.add(varName);

                        String varValue = resolveVariable(event, varName, buf, startPos, endPos);
                        if (varValue == null) {
                            varValue = varDefaultValue;
                        }
                        if (varValue != null) {
                            buf.replace(startPos, endPos, varValue);
                            altered = true;
                            int change = substitute(event, buf, startPos, varValue.length(), priorVariables);
                            change += varValue.length() - (endPos - startPos);
                            pos += change;
                            bufEnd += change;
                            lengthChange += change;
                            chars = getChars(buf);
                        }

                        priorVariables.remove(priorVariables.size() - 1);
                    }
                    nestedVarCount--;
                    pos += endMatchLen;
                }
            }
        }
    }
}