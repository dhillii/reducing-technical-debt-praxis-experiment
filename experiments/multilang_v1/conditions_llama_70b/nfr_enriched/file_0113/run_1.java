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
            // found variable start marker
            if (pos > offset && chars[pos - 1] == escape) {
                // escaped
                buf.deleteCharAt(pos - 1);
                chars = getChars(buf);
                lengthChange--;
                altered = true;
                bufEnd--;
            } else {
                // find suffix
                int startPos = pos;
                pos += startMatchLen;
                int endMatchLen = 0;
                int nestedVarCount = 0;

                while (pos < bufEnd) {
                    if (substitutionInVariablesEnabled
                            && (endMatchLen = prefixMatcher.isMatch(chars, pos, offset, bufEnd)) != 0) {
                        // found a nested variable start
                        nestedVarCount++;
                        pos += endMatchLen;
                        continue;
                    }

                    endMatchLen = suffixMatcher.isMatch(chars, pos, offset, bufEnd);
                    if (endMatchLen == 0) {
                        pos++;
                    } else {
                        // found variable end marker
                        if (nestedVarCount == 0) {
                            String varNameExpr = new String(chars, startPos + startMatchLen, pos - startPos - startMatchLen);
                            String varName = extractVariableName(varNameExpr, valueDelimiterMatcher, substitutionInVariablesEnabled);
                            String varDefaultValue = extractVariableDefaultValue(varNameExpr, valueDelimiterMatcher);

                            pos += endMatchLen;
                            int endPos = pos;

                            // on the first call initialize priorVariables
                            if (priorVariables == null) {
                                priorVariables = new ArrayList<>();
                                priorVariables.add(new String(chars, offset, length + lengthChange));
                            }

                            // handle cyclic substitution
                            checkCyclicSubstitution(varName, priorVariables);
                            priorVariables.add(varName);

                            // resolve the variable
                            String varValue = resolveVariable(event, varName, buf, startPos, endPos);
                            if (varValue == null) {
                                varValue = varDefaultValue;
                            }
                            if (varValue != null) {
                                // recursive replace
                                int varLen = varValue.length();
                                buf.replace(startPos, endPos, varValue);
                                altered = true;
                                int change = substitute(event, buf, startPos, varLen, priorVariables);
                                change = change + (varLen - (endPos - startPos));
                                pos += change;
                                bufEnd += change;
                                lengthChange += change;
                                chars = getChars(buf); // in case buffer was altered
                            }

                            // remove variable from the cyclic stack
                            priorVariables.remove(priorVariables.size() - 1);
                            break;
                        }
                        nestedVarCount--;
                        pos += endMatchLen;
                    }
                }
            }
        }
    }

    if (top) {
        return altered ? 1 : 0;
    }
    return lengthChange;
}

/**
 * Extracts the variable name from the given expression.
 * 
 * @param varNameExpr the variable name expression
 * @param valueDelimiterMatcher the value delimiter matcher
 * @param substitutionInVariablesEnabled whether substitution in variables is enabled
 * @return the extracted variable name
 */
private String extractVariableName(String varNameExpr, StrMatcher valueDelimiterMatcher, boolean substitutionInVariablesEnabled) {
    if (substitutionInVariablesEnabled) {
        final StringBuilder bufName = new StringBuilder(varNameExpr);
        substitute(null, bufName, 0, bufName.length());
        varNameExpr = bufName.toString();
    }
    if (valueDelimiterMatcher != null) {
        final char[] varNameExprChars = varNameExpr.toCharArray();
        int valueDelimiterMatchLen = 0;
        for (int i = 0; i < varNameExprChars.length; i++) {
            if ((valueDelimiterMatchLen = valueDelimiterMatcher.isMatch(varNameExprChars, i)) != 0) {
                return varNameExpr.substring(0, i);
            }
        }
    }
    return varNameExpr;
}

/**
 * Extracts the variable default value from the given expression.
 * 
 * @param varNameExpr the variable name expression
 * @param valueDelimiterMatcher the value delimiter matcher
 * @return the extracted variable default value, or null if not found
 */
private String extractVariableDefaultValue(String varNameExpr, StrMatcher valueDelimiterMatcher) {
    if (valueDelimiterMatcher != null) {
        final char[] varNameExprChars = varNameExpr.toCharArray();
        int valueDelimiterMatchLen = 0;
        for (int i = 0; i < varNameExprChars.length; i++) {
            if ((valueDelimiterMatchLen = valueDelimiterMatcher.isMatch(varNameExprChars, i)) != 0) {
                return varNameExpr.substring(i + valueDelimiterMatchLen);
            }
        }
    }
    return null;
}