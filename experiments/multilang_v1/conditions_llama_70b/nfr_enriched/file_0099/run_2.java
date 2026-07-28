// ...

private void handleCharClassEscapes(char[] pattern, int index, CharUnit unit, RESyntax syntax, Vector options, boolean negative, boolean insens) {
    int posixID = -1;
    boolean negate = false;
    char asciiEsc = 0;
    switch (pattern[index]) {
        case 'D':
            negate = true;
        case 'd':
            posixID = RETokenPOSIX.DIGIT;
            break;
        case 'S':
            negate = true;
        case 's':
            posixID = RETokenPOSIX.SPACE;
            break;
        case 'W':
            negate = true;
        case 'w':
            posixID = RETokenPOSIX.ALNUM;
            break;
        default:
            if ("nrt".indexOf(pattern[index]) != -1) {
                switch (pattern[index]) {
                    case 'n':
                        asciiEsc = '\n';
                        break;
                    case 't':
                        asciiEsc = '\t';
                        break;
                    case 'r':
                        asciiEsc = '\r';
                        break;
                }
            }
    }
    if (posixID != -1) {
        options.addElement(new RETokenPOSIX(subIndex, posixID, insens, negate));
    } else if (asciiEsc != 0) {
        options.addElement(new RETokenChar(subIndex, asciiEsc, insens));
    } else {
        options.addElement(new RETokenChar(subIndex, pattern[index], insens));
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
            handleCharClassEscapes(pattern, index, unit, syntax, options, negative, insens);
            index++;
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

// ...