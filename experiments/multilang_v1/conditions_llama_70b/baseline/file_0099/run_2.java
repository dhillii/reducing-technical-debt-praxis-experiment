else if ((unit.ch == '\\') && syntax.get(RESyntax.RE_BACKSLASH_ESCAPE_IN_LISTS)) {
    int posixID = -1;
    boolean negate = false;
    char asciiEsc = 0;
    if (("dswDSW".indexOf(pattern[index]) != -1) && syntax.get(RESyntax.RE_CHAR_CLASS_ESC_IN_LISTS)) {
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
                break;
        }
    } else if ("nrt".indexOf(pattern[index]) != -1) {
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
            default:
                break;
        }
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
}