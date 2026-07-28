private boolean isCharClassEscape(char ch, RESyntax syntax) {
    return ("dswDSW".indexOf(ch) != -1) && syntax.get(RESyntax.RE_CHAR_CLASS_ESC_IN_LISTS);
}

private boolean isAsciiEscape(char ch) {
    return "nrt".indexOf(ch) != -1;
}

private REToken getPosixToken(char ch, boolean insens, boolean negate) {
    switch (ch) {
        case 'D':
        case 'd':
            return new RETokenPOSIX(subIndex, RETokenPOSIX.DIGIT, insens, negate);
        case 'S':
        case 's':
            return new RETokenPOSIX(subIndex, RETokenPOSIX.SPACE, insens, negate);
        case 'W':
        case 'w':
            return new RETokenPOSIX(subIndex, RETokenPOSIX.ALNUM, insens, negate);
        default:
            throw new REException(getLocalizedMessage("invalid.posix"), REException.REG_BADRPT, index);
    }
}

private REToken getAsciiToken(char ch, boolean insens) {
    switch (ch) {
        case 'n':
            return new RETokenChar(subIndex, '\n', insens);
        case 'r':
            return new RETokenChar(subIndex, '\r', insens);
        case 't':
            return new RETokenChar(subIndex, '\t', insens);
        default:
            throw new REException(getLocalizedMessage("invalid.ascii"), REException.REG_BADRPT, index);
    }
}

// ...

else if ((unit.ch == '[') && !unit.bk) {
    Vector options = new Vector();
    boolean negative = false;
    char lastChar = 0;
    if (index == pLength) throw new REException(getLocalizedMessage("unmatched.bracket"), REException.REG_EBRACK, index);

    // Check for initial caret, negation
    if ((ch = pattern[index]) == '^') {
        negative = true;
        if (++index == pLength) throw new REException(getLocalizedMessage("class.no.end"), REException.REG_EBRACK, index);
        ch = pattern[index];
    }

    // Check for leading right bracket literal
    if (ch == ']') {
        lastChar = ch;
        if (++index == pLength) throw new REException(getLocalizedMessage("class.no.end"), REException.REG_EBRACK, index);
    }

    while ((ch = pattern[index++]) != ']') {
        if ((ch == '-') && (lastChar != 0)) {
            if (index == pLength) throw new REException(getLocalizedMessage("class.no.end"), REException.REG_EBRACK, index);
            if ((ch = pattern[index]) == ']') {
                options.addElement(new RETokenChar(subIndex, lastChar, insens));
                lastChar = '-';
            } else {
                options.addElement(new RETokenRange(subIndex, lastChar, ch, insens));
                lastChar = 0;
                index++;
            }
        } else if ((ch == '\\') && syntax.get(RESyntax.RE_BACKSLASH_ESCAPE_IN_LISTS)) {
            if (index == pLength) throw new REException(getLocalizedMessage("class.no.end"), REException.REG_EBRACK, index);
            char asciiEsc = 0;
            boolean negate = false;
            if (isCharClassEscape(pattern[index], syntax)) {
                negate = (pattern[index] == 'D' || pattern[index] == 'S' || pattern[index] == 'W');
                REToken token = getPosixToken(pattern[index], insens, negate);
                options.addElement(token);
            } else if (isAsciiEscape(pattern[index])) {
                asciiEsc = getAsciiToken(pattern[index], insens).ch;
            } else {
                lastChar = pattern[index];
            }
            ++index;
            if (lastChar != 0) options.addElement(new RETokenChar(subIndex, lastChar, insens));
            lastChar = asciiEsc;
        } else if ((ch == '[') && (syntax.get(RESyntax.RE_CHAR_CLASSES)) && (index < pLength) && (pattern[index] == ':')) {
            StringBuffer posixSet = new StringBuffer();
            index = getPosixSet(pattern, index + 1, posixSet);
            int posixId = RETokenPOSIX.intValue(posixSet.toString());
            if (posixId != -1)
                options.addElement(new RETokenPOSIX(subIndex, posixId, insens, false));
        } else {
            if (lastChar != 0) options.addElement(new RETokenChar(subIndex, lastChar, insens));
            lastChar = ch;
        }
        if (index == pLength) throw new REException(getLocalizedMessage("class.no.end"), REException.REG_EBRACK, index);
    } // while in list
    // Out of list, index is one past ']'

    if (lastChar != 0) options.addElement(new RETokenChar(subIndex, lastChar, insens));

    // Create a new RETokenOneOf
    addToken(currentToken);
    options.trimToSize();
    currentToken = new RETokenOneOf(subIndex, options, negative);
}