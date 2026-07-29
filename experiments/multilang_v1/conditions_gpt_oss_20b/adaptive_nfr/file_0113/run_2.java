public class StrSubstitutor {

    // ... existing fields and constructors ...

    /**
     * Internal method that substitutes the variables.
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
                continue;
            }
            if (isEscaped(chars, pos, offset, escape)) {
                handleEscapedVariable(buf, pos);
                chars = getChars(buf);
                lengthChange--;
                altered = true;
                bufEnd--;
                pos = pos - 1; // stay at current position after deletion
                continue;
            }
            final int startPos = pos;
            pos += startMatchLen;
            final int endPos = findVariableEnd(chars, pos, bufEnd, substitutionInVariablesEnabled, prefixMatcher, suffixMatcher);
            if (endPos == -1) {
                pos = pos - startMatchLen + 1; // move past prefix
                continue;
            }
            String varNameExpr = new String(chars, startPos + startMatchLen, endPos - (startPos + startMatchLen));
            if (substitutionInVariablesEnabled) {
                final StringBuilder bufName = new StringBuilder(varNameExpr);
                substitute(event, bufName, 0, bufName.length());
                varNameExpr = bufName.toString();
            }
            final String[] nameAndDefault = parseVariableNameAndDefault(varNameExpr, valueDelimiterMatcher, substitutionInVariablesEnabled, prefixMatcher);
            String varName = nameAndDefault[0];
            String varDefaultValue = nameAndDefault[1];

            if (top && priorVariables == null) {
                priorVariables = new ArrayList<>();
                priorVariables.add(new String(chars, offset, length + lengthChange));
            }

            checkCyclicSubstitution(varName, priorVariables);
            priorVariables.add(varName);

            String varValue = resolveVariable(event, varName, buf, startPos, endPos);
            if (varValue == null) {
                varValue = varDefaultValue;
            }
            if (varValue != null) {
                final int varLen = varValue.length();
                buf.replace(startPos, endPos, varValue);
                altered = true;
                int change = substitute(event, buf, startPos, varLen, priorVariables);
                change += varLen - (endPos - startPos);
                pos = startPos + change;
                bufEnd += change;
                lengthChange += change;
                chars = getChars(buf);
            }
            priorVariables.remove(priorVariables.size() - 1);
        }
        return top ? (altered ? 1 : 0) : lengthChange;
    }

    /**
     * Determines if the current position is escaped.
     */
    private boolean isEscaped(char[] chars, int pos, int offset, char escape) {
        return pos > offset && chars[pos - 1] == escape;
    }

    /**
     * Handles an escaped variable by removing the escape character.
     */
    private void handleEscapedVariable(StringBuilder buf, int pos) {
        buf.deleteCharAt(pos - 1);
    }

    /**
     * Finds the end position of a variable, taking nested variables into account.
     *
     * @return the index after the suffix, or -1 if no matching suffix is found.
     */
    private int findVariableEnd(char[] chars, int pos, int bufEnd, boolean substitutionInVariablesEnabled,
                                StrMatcher prefixMatcher, StrMatcher suffixMatcher) {
        int nestedVarCount = 0;
        while (pos < bufEnd) {
            if (substitutionInVariablesEnabled && prefixMatcher.isMatch(chars, pos, 0, bufEnd) != 0) {
                nestedVarCount++;
                pos += prefixMatcher.isMatch(chars, pos, 0, bufEnd);
                continue;
            }
            int endMatchLen = suffixMatcher.isMatch(chars, pos, 0, bufEnd);
            if (endMatchLen == 0) {
                pos++;
            } else {
                if (nestedVarCount == 0) {
                    return pos + endMatchLen;
                }
                nestedVarCount--;
                pos += endMatchLen;
            }
        }
        return -1;
    }

    /**
     * Parses the variable name and default value from the variable expression.
     *
     * @return an array where index 0 is the variable name and index 1 is the default value (may be null)
     */
    private String[] parseVariableNameAndDefault(String varNameExpr, StrMatcher valueDelimiterMatcher,
                                                boolean substitutionInVariablesEnabled, StrMatcher prefixMatcher) {
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
        return new String[]{varName, varDefaultValue};
    }

    // ... remaining existing methods ...
}