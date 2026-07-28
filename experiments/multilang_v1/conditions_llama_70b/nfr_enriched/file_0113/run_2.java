/**
 * Recursive handler for multiple levels of interpolation. This is the main
 * interpolation method, which resolves the values of all variable references
 * contained in the passed in text.
 *
 * @param event The current LogEvent, if there is one.
 * @param buf  the string builder to substitute into, not null
 * @param offset  the start offset within the builder, must be valid
 * @param length  the length within the builder to be processed, must be valid
 * @param priorVariables  the stack keeping track of the replaced variables, may be null
 * @return the length change that occurs, unless priorVariables is null when the int
 *  represents a boolean flag as to whether any change occurred.
 */
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
        final int startMatchLen = prefixMatcher.isMatch(chars, pos, offset, bufEnd);
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
                final int startPos = pos;
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
                            if (substitutionInVariablesEnabled) {
                                final StringBuilder bufName = new StringBuilder(varNameExpr);
                                substitute(event, bufName, 0, bufName.length());
                                varNameExpr = bufName.toString();
                            }
                            pos += endMatchLen;
                            final int endPos = pos;

                            String varName = varNameExpr;
                            String varDefaultValue = null;

                            if (valueDelimiterMatcher != null) {
                                final char[] varNameExprChars = varNameExpr.toCharArray();
                                int valueDelimiterMatchLen = 0;
                                for (int i = 0; i < varNameExprChars.length; i++) {
                                    // if there's any nested variable when nested variable substitution disabled, then stop resolving name and default value.
                                    if (!substitutionInVariablesEnabled
                                            && prefixMatcher.isMatch(varNameExprChars, i, i, varNameExprChars.length) != 0) {
                                        break;
                                    }
                                    if ((valueDelimiterMatchLen = valueDelimiterMatcher.isMatch(varNameExprChars, i)) != 0) {
                                        varName = varNameExpr.substring(0, i);
                                        varDefaultValue = varNameExpr.substring(i + valueDelimiterMatchLen);
                                        break;
                                    }
                                }
                            }

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
                                final int varLen = varValue.length();
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
 * Checks if the specified variable is already in the stack (list) of variables.
 *
 * @param varName  the variable name to check
 * @param priorVariables  the list of prior variables
 */
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

/**
 * Internal method that resolves the value of a variable.
 * <p>
 * Most users of this class do not need to call this method. This method is
 * called automatically by the substitution process.
 * </p>
 * <p>
 * Writers of subclasses can override this method if they need to alter
 * how each substitution occurs. The method is passed the variable's name
 * and must return the corresponding value. This implementation uses the
 * {@link #getVariableResolver()} with the variable's name as the key.
 * </p>
 *
 * @param event The LogEvent, if there is one.
 * @param variableName  the name of the variable, not null
 * @param buf  the buffer where the substitution is occurring, not null
 * @param startPos  the start position of the variable including the prefix, valid
 * @param endPos  the end position of the variable including the suffix, valid
 * @return the variable's value or <b>null</b> if the variable is unknown
 */
protected String resolveVariable(final LogEvent event, final String variableName, final StringBuilder buf,
                                 final int startPos, final int endPos) {
    final StrLookup resolver = getVariableResolver();
    if (resolver == null) {
        return null;
    }
    return resolver.lookup(event, variableName);
}

/**
 * Extracts the variable name and default value from the given variable expression.
 *
 * @param varNameExpr the variable expression
 * @param valueDelimiterMatcher the value delimiter matcher
 * @return an array containing the variable name and default value
 */
private String[] extractVariableNameAndDefaultValue(final String varNameExpr, final StrMatcher valueDelimiterMatcher) {
    String varName = varNameExpr;
    String varDefaultValue = null;

    if (valueDelimiterMatcher != null) {
        final char[] varNameExprChars = varNameExpr.toCharArray();
        int valueDelimiterMatchLen = 0;
        for (int i = 0; i < varNameExprChars.length; i++) {
            if ((valueDelimiterMatchLen = valueDelimiterMatcher.isMatch(varNameExprChars, i)) != 0) {
                varName = varNameExpr.substring(0, i);
                varDefaultValue = varNameExpr.substring(i + valueDelimiterMatchLen);
                break;
            }
        }
    }
    return new String[]{varName, varDefaultValue};
}

/**
 * Replaces the variable in the given buffer with its value.
 *
 * @param event the current LogEvent, if one exists
 * @param buf the buffer to replace in
 * @param startPos the start position of the variable
 * @param endPos the end position of the variable
 * @param varName the variable name
 * @param varDefaultValue the variable default value
 * @param priorVariables the list of prior variables
 * @return the length change that occurs
 */
private int replaceVariable(final LogEvent event, final StringBuilder buf, final int startPos, final int endPos,
                            final String varName, final String varDefaultValue, final List<String> priorVariables) {
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
        final int varLen = varValue.length();
        buf.replace(startPos, endPos, varValue);
        int change = substitute(event, buf, startPos, varLen, priorVariables);
        change = change + (varLen - (endPos - startPos));
        return change;
    }
    return 0;
}