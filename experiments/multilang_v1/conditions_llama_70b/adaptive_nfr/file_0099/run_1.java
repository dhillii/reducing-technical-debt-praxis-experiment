private void handleListOperator(char[] pattern, int index, Vector options, boolean negative, char lastChar, int subIndex, boolean insens, RESyntax syntax) throws REException {
    char ch;
    while ((ch = pattern[index++]) != ']') {
        if ((ch == '-') && (lastChar != 0)) {
            if (index == pattern.length) throw new REException(getLocalizedMessage("class.no.end"), REException.REG_EBRACK, index);
            if ((ch = pattern[index]) == ']') {
                options.addElement(new RETokenChar(subIndex, lastChar, insens));
                lastChar = '-';
            } else {
                options.addElement(new RETokenRange(subIndex, lastChar, ch, insens));
                lastChar = 0;
                index++;
            }
        } else if ((ch == '\\') && syntax.get(RESyntax.RE_BACKSLASH_ESCAPE_IN_LISTS)) {
            if (index == pattern.length) throw new REException(getLocalizedMessage("class.no.end"), REException.REG_EBRACK, index);
            int posixID = -1;
            boolean negate = false;
            char asciiEsc = 0;
            if (("dswDSW".indexOf(pattern[index]) != -1) && syntax.get(RESyntax.RE_CHAR_CLASS_ESC_IN_LISTS)) {
                posixID = getPosixId(pattern[index], negate);
            } else if ("nrt".indexOf(pattern[index]) != -1) {
                asciiEsc = getAsciiEsc(pattern[index]);
            }
            if (lastChar != 0) options.addElement(new RETokenChar(subIndex, lastChar, insens));
            if (posixID != -1) {
                options.addElement(new RETokenPOSIX(subIndex, posixID, insens, negate));
            } else if (asciiEsc != 0) {
                lastChar = asciiEsc;
            } else {
                lastChar = pattern[index];
            }
            ++index;
        } else if ((ch == '[') && (syntax.get(RESyntax.RE_CHAR_CLASSES)) && (index < pattern.length) && (pattern[index] == ':')) {
            StringBuffer posixSet = new StringBuffer();
            index = getPosixSet(pattern, index + 1, posixSet);
            int posixId = RETokenPOSIX.intValue(posixSet.toString());
            if (posixId != -1)
                options.addElement(new RETokenPOSIX(subIndex, posixId, insens, false));
        } else {
            if (lastChar != 0) options.addElement(new RETokenChar(subIndex, lastChar, insens));
            lastChar = ch;
        }
        if (index == pattern.length) throw new REException(getLocalizedMessage("class.no.end"), REException.REG_EBRACK, index);
    }
    if (lastChar != 0) options.addElement(new RETokenChar(subIndex, lastChar, insens));
    addToken(currentToken);
    options.trimToSize();
    currentToken = new RETokenOneOf(subIndex, options, negative);
}

private int getPosixId(char ch, boolean negate) {
    switch (ch) {
        case 'D':
            negate = true;
        case 'd':
            return RETokenPOSIX.DIGIT;
        case 'S':
            negate = true;
        case 's':
            return RETokenPOSIX.SPACE;
        case 'W':
            negate = true;
        case 'w':
            return RETokenPOSIX.ALNUM;
        default:
            return -1;
    }
}

private char getAsciiEsc(char ch) {
    switch (ch) {
        case 'n':
            return '\n';
        case 't':
            return '\t';
        case 'r':
            return '\r';
        default:
            return 0;
    }
}