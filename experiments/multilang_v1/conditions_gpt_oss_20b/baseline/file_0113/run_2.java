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
                buf.deleteCharAt(pos - 1);
                chars = getChars(buf);
                lengthChange--;
                altered = true;
                bufEnd--;
                pos--;
                continue;
            }
            final int startPos = pos;
            pos += startMatchLen;
            int endMatchLen = 0;
            int nestedVarCount = 0;
            while (pos < bufEnd) {
                if (substitutionInVariablesEnabled
                        && (endMatchLen = prefixMatcher.isMatch(chars, pos, offset, bufEnd)) != 0) {
                    nestedVarCount++;
                    pos += endMatchLen;
                    continue;
                }
                endMatchLen = suffixMatcher.isMatch(chars, pos, offset, bufEnd);
                if (endMatchLen == 0) {
                    pos++;
                    continue;
                }
                if (nestedVarCount == 0) {
                    String varNameExpr = new String(chars, startPos + startMatchLen, pos - startPos - startMatchLen);
                    if (substitutionInVariablesEnabled) {
                        final StringBuilder bufName = new StringBuilder(varNameExpr);
                        substitute(event, bufName, 0, bufName.length());
                        varNameExpr = bufName.toString();
                    }
                    pos += endMatchLen;
                    final int endPos = pos;

                    String varName;
                    String varDefaultValue = null;
                    if (valueDelimiterMatcher != null) {
                        int delimPos = findDelimiter(varNameExpr, prefixMatcher, valueDelimiterMatcher, substitutionInVariablesEnabled);
                        if (delimPos >= 0) {
                            int delimLen = valueDelimiterMatcher.isMatch(varNameExpr.toCharArray(), delimPos);
                            varName = varNameExpr.substring(0, delimPos);
                            varDefaultValue = varNameExpr.substring(delimPos + delimLen);
                        } else {
                            varName = varNameExpr;
                        }
                    } else {
                        varName = varNameExpr;
                    }

                    if (priorVariables == null) {
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
                        pos += change;
                        bufEnd += change;
                        lengthChange += change;
                        chars = getChars(buf);
                    }

                    priorVariables.remove(priorVariables.size() - 1);
                    break;
                }
                nestedVarCount--;
                pos += endMatchLen;
            }
        }
        if (top) {
            return altered ? 1 : 0;
        }
        return lengthChange;
    }

    private boolean isEscaped(char[] chars, int pos, int offset, char escape) {
        return pos > offset && chars[pos - 1] == escape;
    }

    private int findDelimiter(String varNameExpr, StrMatcher prefixMatcher, StrMatcher valueDelimiterMatcher,
                              boolean substitutionInVariablesEnabled) {
        char[] arr = varNameExpr.toCharArray();
        for (int i = 0; i < arr.length; i++) {
            if (!substitutionInVariablesEnabled
                    && prefixMatcher.isMatch(arr, i, i, arr.length) != 0) {
                break;
            }
            int delimLen = valueDelimiterMatcher.isMatch(arr, i);
            if (delimLen > 0) {
                return i;
            }
        }
        return -1;
    }