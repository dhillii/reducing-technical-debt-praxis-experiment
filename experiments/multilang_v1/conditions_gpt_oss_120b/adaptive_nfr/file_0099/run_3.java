package gnu.regexp;
import java.io.InputStream;
import java.io.Reader;
import java.io.Serializable;
import java.util.Locale;
import java.util.PropertyResourceBundle;
import java.util.ResourceBundle;
import java.util.Vector;

class IntPair implements Serializable {
  public int first, second;
}

class CharUnit implements Serializable {
  public char ch;
  public boolean bk;
}

/**
 * RE provides the user interface for compiling and matching regular
 * expressions.
 */
public class RE extends REToken {
  private static final String VERSION = "1.1.5-dev";
  private static ResourceBundle messages = PropertyResourceBundle.getBundle("gnu/regexp/MessagesBundle", Locale.getDefault());

  private REToken firstToken, lastToken;
  private int numSubs;
  private int minimumLength;

  public static final int REG_ICASE = 2;
  public static final int REG_DOT_NEWLINE = 4;
  public static final int REG_MULTILINE = 8;
  public static final int REG_NOTBOL = 16;
  public static final int REG_NOTEOL = 32;
  public static final int REG_ANCHORINDEX = 64;
  public static final int REG_NO_INTERPOLATE = 128;

  public static final String version() {
    return VERSION;
  }

  static final String getLocalizedMessage(String key) {
    return messages.getString(key);
  }

  public RE(Object pattern) throws REException {
    this(pattern, 0, RESyntax.RE_SYNTAX_PERL5, 0, 0);
  }

  public RE(Object pattern, int cflags) throws REException {
    this(pattern, cflags, RESyntax.RE_SYNTAX_PERL5, 0, 0);
  }

  public RE(Object pattern, int cflags, RESyntax syntax) throws REException {
    this(pattern, cflags, syntax, 0, 0);
  }

  private RE(REToken first, REToken last, int subs, int subIndex, int minLength) {
    super(subIndex);
    firstToken = first;
    lastToken = last;
    numSubs = subs;
    minimumLength = minLength;
    addToken(new RETokenEndSub(subIndex));
  }

  private RE(Object patternObj, int cflags, RESyntax syntax, int myIndex, int nextSub) throws REException {
    super(myIndex);
    initialize(patternObj, cflags, syntax, myIndex, nextSub);
  }

  protected RE() {
    super(0);
  }

  protected void initialize(Object patternObj, int cflags, RESyntax syntax, int myIndex, int nextSub) throws REException {
    char[] pattern = toCharArray(patternObj);
    int pLength = pattern.length;
    numSubs = 0;
    Vector branches = null;
    firstToken = lastToken = null;
    boolean insens = ((cflags & REG_ICASE) > 0);
    int index = 0;
    CharUnit unit = new CharUnit();
    IntPair minMax = new IntPair();
    REToken currentToken = null;
    char ch;

    while (index < pLength) {
      index = getCharUnit(pattern, index, unit);
      if (isAlternationOperator(unit, pattern, index, syntax)) {
        addToken(currentToken);
        RE theBranch = new RE(firstToken, lastToken, numSubs, subIndex, minimumLength);
        minimumLength = 0;
        if (branches == null) {
          branches = new Vector();
        }
        branches.addElement(theBranch);
        firstToken = lastToken = currentToken = null;
        continue;
      } else if (isIntervalOperator(unit, syntax)) {
        int newIndex = getMinMax(pattern, index, minMax, syntax);
        if (newIndex > index) {
          validateInterval(minMax, currentToken, newIndex);
          index = newIndex;
          currentToken = setRepeated(currentToken, minMax.first, minMax.second, index);
        } else {
          addToken(currentToken);
          currentToken = new RETokenChar(subIndex, unit.ch, insens);
        }
        continue;
      } else if (isListOperator(unit, pattern, index)) {
        currentToken = parseCharacterClass(pattern, index, syntax, insens, currentToken);
        index = updateIndexAfterClass(pattern, index);
        continue;
      } else if (isSubexpressionStart(unit, syntax)) {
        index = parseSubexpression(pattern, index, syntax, cflags, insens, myIndex, nextSub, currentToken);
        continue;
      } else if (isUnmatchedRightParen(unit, syntax)) {
        throw new REException(getLocalizedMessage("unmatched.paren"), REException.REG_EPAREN, index);
      } else if (isStartOfLineOperator(unit)) {
        addToken(currentToken);
        currentToken = null;
        addToken(new RETokenStart(subIndex, ((cflags & REG_MULTILINE) > 0) ? syntax.getLineSeparator() : null));
        continue;
      } else if (isEndOfLineOperator(unit)) {
        addToken(currentToken);
        currentToken = null;
        addToken(new RETokenEnd(subIndex, ((cflags & REG_MULTILINE) > 0) ? syntax.getLineSeparator() : null));
        continue;
      } else if (isAnyCharOperator(unit, syntax, cflags)) {
        addToken(currentToken);
        currentToken = new RETokenAny(subIndex, syntax.get(RESyntax.RE_DOT_NEWLINE) || ((cflags & REG_DOT_NEWLINE) > 0), syntax.get(RESyntax.RE_DOT_NOT_NULL));
        continue;
      } else if (isZeroOrMoreOperator(unit)) {
        currentToken = applyZeroOrMore(currentToken, index);
        continue;
      } else if (isOneOrMoreOperator(unit, syntax)) {
        currentToken = applyOneOrMore(currentToken, index);
        continue;
      } else if (isZeroOrOneOperator(unit, syntax)) {
        currentToken = applyZeroOrOne(currentToken, index, syntax);
        continue;
      } else if (isBackReference(unit, syntax)) {
        addToken(currentToken);
        currentToken = new RETokenBackRef(subIndex, Character.digit(unit.ch, 10), insens);
        continue;
      } else if (isStartOfStringOperator(unit, syntax)) {
        addToken(currentToken);
        currentToken = new RETokenStart(subIndex, null);
        continue;
      } else if (isWordBoundaryOperator(unit, syntax)) {
        addToken(currentToken);
        currentToken = new RETokenWordBoundary(subIndex, RETokenWordBoundary.BEGIN | RETokenWordBoundary.END, false);
        continue;
      } else if (isWordBeginOperator(unit)) {
        addToken(currentToken);
        currentToken = new RETokenWordBoundary(subIndex, RETokenWordBoundary.BEGIN, false);
        continue;
      } else if (isWordEndOperator(unit)) {
        addToken(currentToken);
        currentToken = new RETokenWordBoundary(subIndex, RETokenWordBoundary.END, false);
        continue;
      } else if (isNonWordBoundaryOperator(unit, syntax)) {
        addToken(currentToken);
        currentToken = new RETokenWordBoundary(subIndex, RETokenWordBoundary.BEGIN | RETokenWordBoundary.END, true);
        continue;
      } else if (isDigitOperator(unit, syntax)) {
        addToken(currentToken);
        currentToken = new RETokenPOSIX(subIndex, RETokenPOSIX.DIGIT, insens, false);
        continue;
      } else if (isNonDigitOperator(unit, syntax)) {
        addToken(currentToken);
        currentToken = new RETokenPOSIX(subIndex, RETokenPOSIX.DIGIT, insens, true);
        continue;
      } else if (isNewlineEscape(unit)) {
        addToken(currentToken);
        currentToken = new RETokenChar(subIndex, '\n', false);
        continue;
      } else if (isReturnEscape(unit)) {
        addToken(currentToken);
        currentToken = new RETokenChar(subIndex, '\r', false);
        continue;
      } else if (isWhitespaceOperator(unit, syntax)) {
        addToken(currentToken);
        currentToken = new RETokenPOSIX(subIndex, RETokenPOSIX.SPACE, insens, false);
        continue;
      } else if (isNonWhitespaceOperator(unit, syntax)) {
        addToken(currentToken);
        currentToken = new RETokenPOSIX(subIndex, RETokenPOSIX.SPACE, insens, true);
        continue;
      } else if (isTabEscape(unit)) {
        addToken(currentToken);
        currentToken = new RETokenChar(subIndex, '\t', false);
        continue;
      } else if (isAlnumOperator(unit, syntax)) {
        addToken(currentToken);
        currentToken = new RETokenPOSIX(subIndex, RETokenPOSIX.ALNUM, insens, false);
        continue;
      } else if (isNonAlnumOperator(unit, syntax)) {
        addToken(currentToken);
        currentToken = new RETokenPOSIX(subIndex, RETokenPOSIX.ALNUM, insens, true);
        continue;
      } else if (isEndOfStringOperator(unit, syntax)) {
        addToken(currentToken);
        currentToken = new RETokenEnd(subIndex, null);
        continue;
      } else {
        addToken(currentToken);
        currentToken = new RETokenChar(subIndex, unit.ch, insens);
        continue;
      }
    }

    addToken(currentToken);
    if (branches != null) {
      branches.addElement(new RE(firstToken, lastToken, numSubs, subIndex, minimumLength));
      branches.trimToSize();
      minimumLength = 0;
      firstToken = lastToken = null;
      addToken(new RETokenOneOf(subIndex, branches, false));
    } else {
      addToken(new RETokenEndSub(subIndex));
    }
  }

  private static char[] toCharArray(Object obj) {
    if (obj instanceof String) {
      return ((String) obj).toCharArray();
    } else if (obj instanceof char[]) {
      return (char[]) obj;
    } else if (obj instanceof StringBuffer) {
      char[] arr = new char[((StringBuffer) obj).length()];
      ((StringBuffer) obj).getChars(0, arr.length, arr, 0);
      return arr;
    } else {
      return obj.toString().toCharArray();
    }
  }

  private static boolean isAlternationOperator(CharUnit unit, char[] pattern, int index, RESyntax syntax) {
    return ((unit.ch == '|' && (syntax.get(RESyntax.RE_NO_BK_VBAR) ^ unit.bk))
        || (syntax.get(RESyntax.RE_NEWLINE_ALT) && (unit.ch == '\n') && !unit.bk))
        && !syntax.get(RESyntax.RE_LIMITED_OPS);
  }

  private static boolean isIntervalOperator(CharUnit unit, RESyntax syntax) {
    return (unit.ch == '{') && syntax.get(RESyntax.RE_INTERVALS) && (syntax.get(RESyntax.RE_NO_BK_BRACES) ^ unit.bk);
  }

  private static void validateInterval(IntPair minMax, REToken currentToken, int index) throws REException {
    if (minMax.first > minMax.second) {
      throw new REException(getLocalizedMessage("interval.order"), REException.REG_BADRPT, index);
    }
    if (currentToken == null) {
      throw new REException(getLocalizedMessage("repeat.no.token"), REException.REG_BADRPT, index);
    }
    if (currentToken instanceof RETokenRepeated) {
      throw new REException(getLocalizedMessage("repeat.chained"), REException.REG_BADRPT, index);
    }
    if (currentToken instanceof RETokenWordBoundary) {
      throw new REException(getLocalizedMessage("repeat.assertion"), REException.REG_BADRPT, index);
    }
    if ((currentToken.getMinimumLength() == 0) && (minMax.second == Integer.MAX_VALUE)) {
      throw new REException(getLocalizedMessage("repeat.empty.token"), REException.REG_BADRPT, index);
    }
  }

  private static boolean isListOperator(CharUnit unit, char[] pattern, int index) {
    return (unit.ch == '[') && !unit.bk;
  }

  private REToken parseCharacterClass(char[] pattern, int startIdx, RESyntax syntax, boolean insens, REToken currentToken) throws REException {
    Vector options = new Vector();
    boolean negative = false;
    char lastChar = 0;
    int index = startIdx;
    if (index == pattern.length) {
      throw new REException(getLocalizedMessage("unmatched.bracket"), REException.REG_EBRACK, index);
    }

    if (pattern[index] == '^') {
      negative = true;
      if (++index == pattern.length) {
        throw new REException(getLocalizedMessage("class.no.end"), REException.REG_EBRACK, index);
      }
    }

    if (pattern[index] == ']') {
      lastChar = ']';
      if (++index == pattern.length) {
        throw new REException(getLocalizedMessage("class.no.end"), REException.REG_EBRACK, index);
      }
    }

    while (true) {
      char ch = pattern[index++];
      if (ch == ']') {
        break;
      }
      if (ch == '-' && lastChar != 0) {
        if (index == pattern.length) {
          throw new REException(getLocalizedMessage("class.no.end"), REException.REG_EBRACK, index);
        }
        char next = pattern[index];
        if (next == ']') {
          options.addElement(new RETokenChar(subIndex, lastChar, insens));
          lastChar = '-';
        } else {
          options.addElement(new RETokenRange(subIndex, lastChar, next, insens));
          lastChar = 0;
          index++;
        }
        continue;
      }

      if (ch == '\\' && syntax.get(RESyntax.RE_BACKSLASH_ESCAPE_IN_LISTS)) {
        EscapeInfo info = processEscapedClass(pattern, index, syntax);
        if (lastChar != 0) {
          options.addElement(new RETokenChar(subIndex, lastChar, insens));
        }
        if (info.posixId != -1) {
          options.addElement(new RETokenPOSIX(subIndex, info.posixId, insens, info.negate));
        } else if (info.asciiEsc != 0) {
          lastChar = info.asciiEsc;
        } else {
          lastChar = pattern[index];
        }
        index++;
        continue;
      }

      if (ch == '[' && syntax.get(RESyntax.RE_CHAR_CLASSES) && index < pattern.length && pattern[index] == ':') {
        StringBuffer posixSet = new StringBuffer();
        index = getPosixSet(pattern, index + 1, posixSet);
        int posixId = RETokenPOSIX.intValue(posixSet.toString());
        if (posixId != -1) {
          options.addElement(new RETokenPOSIX(subIndex, posixId, insens, false));
        }
        continue;
      }

      if (lastChar != 0) {
        options.addElement(new RETokenChar(subIndex, lastChar, insens));
      }
      lastChar = ch;

      if (index == pattern.length) {
        throw new REException(getLocalizedMessage("class.no.end"), REException.REG_EBRACK, index);
      }
    }

    if (lastChar != 0) {
      options.addElement(new RETokenChar(subIndex, lastChar, insens));
    }

    addToken(currentToken);
    options.trimToSize();
    return new RETokenOneOf(subIndex, options, negative);
  }

  private static int updateIndexAfterClass(char[] pattern, int index) {
    return index;
  }

  private static class EscapeInfo {
    int posixId = -1;
    boolean negate = false;
    char asciiEsc = 0;
  }

  private static EscapeInfo processEscapedClass(char[] pattern, int idx, RESyntax syntax) {
    EscapeInfo info = new EscapeInfo();
    char esc = pattern[idx];
    if (isPosixClassEscape(esc) && syntax.get(RESyntax.RE_CHAR_CLASS_ESC_IN_LISTS)) {
      switch (esc) {
        case 'D':
          info.negate = true;
          // fall through
        case 'd':
          info.posixId = RETokenPOSIX.DIGIT;
          break;
        case 'S':
          info.negate = true;
          // fall through
        case 's':
          info.posixId = RETokenPOSIX.SPACE;
          break;
        case 'W':
          info.negate = true;
          // fall through
        case 'w':
          info.posixId = RETokenPOSIX.ALNUM;
          break;
        default:
          break;
      }
    } else if ("nrt".indexOf(esc) != -1) {
      switch (esc) {
        case 'n':
          info.asciiEsc = '\n';
          break;
        case 't':
          info.asciiEsc = '\t';
          break;
        case 'r':
          info.asciiEsc = '\r';
          break;
        default:
          break;
      }
    }
    return info;
  }

  private static boolean isPosixClassEscape(char c) {
    return "dswDSW".indexOf(c) != -1;
  }

  private static boolean isSubexpressionStart(CharUnit unit, RESyntax syntax) {
    return (unit.ch == '(') && (syntax.get(RESyntax.RE_NO_BK_PARENS) ^ unit.bk);
  }

  private int parseSubexpression(char[] pattern, int index, RESyntax syntax, int cflags, boolean insens, int myIndex, int nextSub, REToken currentToken) throws REException {
    boolean pure = false;
    boolean comment = false;
    boolean lookAhead = false;
    boolean negativelh = false;
    if ((index + 1 < pattern.length) && (pattern[index] == '?')) {
      switch (pattern[index + 1]) {
        case '!':
          if (syntax.get(RESyntax.RE_LOOKAHEAD)) {
            pure = true;
            negativelh = true;
            lookAhead = true;
            index += 2;
          }
          break;
        case '=':
          if (syntax.get(RESyntax.RE_LOOKAHEAD)) {
            pure = true;
            lookAhead = true;
            index += 2;
          }
          break;
        case ':':
          if (syntax.get(RESyntax.RE_PURE_GROUPING)) {
            pure = true;
            index += 2;
          }
          break;
        case '#':
          if (syntax.get(RESyntax.RE_COMMENTS)) {
            comment = true;
          }
          break;
        default:
          throw new REException(getLocalizedMessage("repeat.no.token"), REException.REG_BADRPT, index);
      }
    }

    if (index >= pattern.length) {
      throw new REException(getLocalizedMessage("unmatched.paren"), REException.REG_ESUBREG, index);
    }

    int endIndex = index;
    int nextIndex = index;
    int nested = 0;
    CharUnit unit = new CharUnit();

    while (((nextIndex = getCharUnit(pattern, endIndex, unit)) > 0)
        && !(nested == 0 && (unit.ch == ')') && (syntax.get(RESyntax.RE_NO_BK_PARENS) ^ unit.bk))) {
      if ((endIndex = nextIndex) >= pattern.length) {
        throw new REException(getLocalizedMessage("subexpr.no.end"), REException.REG_ESUBREG, nextIndex);
      } else if (unit.ch == '(' && (syntax.get(RESyntax.RE_NO_BK_PARENS) ^ unit.bk)) {
        nested++;
      } else if (unit.ch == ')' && (syntax.get(RESyntax.RE_NO_BK_PARENS) ^ unit.bk)) {
        nested--;
      }
    }

    if (comment) {
      index = nextIndex;
    } else {
      addToken(currentToken);
      if (!pure) {
        numSubs++;
      }
      int useIndex = (pure || lookAhead) ? 0 : nextSub + numSubs;
      REToken sub = new RE(String.valueOf(pattern, index, endIndex - index).toCharArray(), cflags, syntax, useIndex, nextSub + numSubs);
      numSubs += ((RE) sub).getNumSubs();
      if (lookAhead) {
        sub = new RETokenLookAhead(sub, negativelh);
      }
      index = nextIndex;
      currentToken = sub;
    }
    return index;
  }

  private static boolean isUnmatchedRightParen(CharUnit unit, RESyntax syntax) {
    return !syntax.get(RESyntax.RE_UNMATCHED_RIGHT_PAREN_ORD) && (unit.ch == ')') && (syntax.get(RESyntax.RE_NO_BK_PARENS) ^ unit.bk);
  }

  private static boolean isStartOfLineOperator(CharUnit unit) {
    return (unit.ch == '^') && !unit.bk;
  }

  private static boolean isEndOfLineOperator(CharUnit unit) {
    return (unit.ch == '$') && !unit.bk;
  }

  private static boolean isAnyCharOperator(CharUnit unit, RESyntax syntax, int cflags) {
    return (unit.ch == '.') && !unit.bk;
  }

  private static boolean isZeroOrMoreOperator(CharUnit unit) {
    return (unit.ch == '*') && !unit.bk;
  }

  private REToken applyZeroOrMore(REToken token, int index) throws REException {
    if (token == null) {
      throw new REException(getLocalizedMessage("repeat.no.token"), REException.REG_BADRPT, index);
    }
    if (token instanceof RETokenRepeated) {
      throw new REException(getLocalizedMessage("repeat.chained"), REException.REG_BADRPT, index);
    }
    if (token instanceof RETokenWordBoundary) {
      throw new REException(getLocalizedMessage("repeat.assertion"), REException.REG_BADRPT, index);
    }
    if (token.getMinimumLength() == 0) {
      throw new REException(getLocalizedMessage("repeat.empty.token"), REException.REG_BADRPT, index);
    }
    return setRepeated(token, 0, Integer.MAX_VALUE, index);
  }

  private static boolean isOneOrMoreOperator(CharUnit unit, RESyntax syntax) {
    return (unit.ch == '+') && !syntax.get(RESyntax.RE_LIMITED_OPS) && (!syntax.get(RESyntax.RE_BK_PLUS_QM) ^ unit.bk);
  }

  private REToken applyOneOrMore(REToken token, int index) throws REException {
    if (token == null) {
      throw new REException(getLocalizedMessage("repeat.no.token"), REException.REG_BADRPT, index);
    }
    if (token instanceof RETokenRepeated) {
      throw new REException(getLocalizedMessage("repeat.chained"), REException.REG_BADRPT, index);
    }
    if (token instanceof RETokenWordBoundary) {
      throw new REException(getLocalizedMessage("repeat.assertion"), REException.REG_BADRPT, index);
    }
    if (token.getMinimumLength() == 0) {
      throw new REException(getLocalizedMessage("repeat.empty.token"), REException.REG_BADRPT, index);
    }
    return setRepeated(token, 1, Integer.MAX_VALUE, index);
  }

  private static boolean isZeroOrOneOperator(CharUnit unit, RESyntax syntax) {
    return (unit.ch == '?') && !syntax.get(RESyntax.RE_LIMITED_OPS) && (!syntax.get(RESyntax.RE_BK_PLUS_QM) ^ unit.bk);
  }

  private REToken applyZeroOrOne(REToken token, int index, RESyntax syntax) throws REException {
    if (token == null) {
      throw new REException(getLocalizedMessage("repeat.no.token"), REException.REG_BADRPT, index);
    }
    if (token instanceof RETokenRepeated) {
      if (syntax.get(RESyntax.RE_STINGY_OPS) && !((RETokenRepeated) token).isStingy()) {
        ((RETokenRepeated) token).makeStingy();
      } else {
        throw new REException(getLocalizedMessage("repeat.chained"), REException.REG_BADRPT, index);
      }
    } else if (token instanceof RETokenWordBoundary) {
      throw new REException(getLocalizedMessage("repeat.assertion"), REException.REG_BADRPT, index);
    } else {
      token = setRepeated(token, 0, 1, index);
    }
    return token;
  }

  private static boolean isBackReference(CharUnit unit, RESyntax syntax) {
    return unit.bk && Character.isDigit(unit.ch) && !syntax.get(RESyntax.RE_NO_BK_REFS);
  }

  private static boolean isStartOfStringOperator(CharUnit unit, RESyntax syntax) {
    return unit.bk && (unit.ch == 'A') && syntax.get(RESyntax.RE_STRING_ANCHORS);
  }

  private static boolean isWordBoundaryOperator(CharUnit unit, RESyntax syntax) {
    return unit.bk && (unit.ch == 'b') && syntax.get(RESyntax.RE_STRING_ANCHORS);
  }

  private static boolean isWordBeginOperator(CharUnit unit) {
    return unit.bk && (unit.ch == '<');
  }

  private static boolean isWordEndOperator(CharUnit unit) {
    return unit.bk && (unit.ch == '>');
  }

  private static boolean isNonWordBoundaryOperator(CharUnit unit, RESyntax syntax) {
    return unit.bk && (unit.ch == 'B') && syntax.get(RESyntax.RE_STRING_ANCHORS);
  }

  private static boolean isDigitOperator(CharUnit unit, RESyntax syntax) {
    return unit.bk && (unit.ch == 'd') && syntax.get(RESyntax.RE_CHAR_CLASS_ESCAPES);
  }

  private static boolean isNonDigitOperator(CharUnit unit, RESyntax syntax) {
    return unit.bk && (unit.ch == 'D') && syntax.get(RESyntax.RE_CHAR_CLASS_ESCAPES);
  }

  private static boolean isNewlineEscape(CharUnit unit) {
    return unit.bk && (unit.ch == 'n');
  }

  private static boolean isReturnEscape(CharUnit unit) {
    return unit.bk && (unit.ch == 'r');
  }

  private static boolean isWhitespaceOperator(CharUnit unit, RESyntax syntax) {
    return unit.bk && (unit.ch == 's') && syntax.get(RESyntax.RE_CHAR_CLASS_ESCAPES);
  }

  private static boolean isNonWhitespaceOperator(CharUnit unit, RESyntax syntax) {
    return unit.bk && (unit.ch == 'S') && syntax.get(RESyntax.RE_CHAR_CLASS_ESCAPES);
  }

  private static boolean isTabEscape(CharUnit unit) {
    return unit.bk && (unit.ch == 't');
  }

  private static boolean isAlnumOperator(CharUnit unit, RESyntax syntax) {
    return unit.bk && (unit.ch == 'w') && syntax.get(RESyntax.RE_CHAR_CLASS_ESCAPES);
  }

  private static boolean isNonAlnumOperator(CharUnit unit, RESyntax syntax) {
    return unit.bk && (unit.ch == 'W') && syntax.get(RESyntax.RE_CHAR_CLASS_ESCAPES);
  }

  private static boolean isEndOfStringOperator(CharUnit unit, RESyntax syntax) {
    return unit.bk && (unit.ch == 'Z') && syntax.get(RESyntax.RE_STRING_ANCHORS);
  }

  private static int getCharUnit(char[] input, int index, CharUnit unit) throws REException {
    unit.ch = input[index++];
    if ((unit.bk = (unit.ch == '\\'))) {
      if (index < input.length) {
        unit.ch = input[index++];
      } else {
        throw new REException(getLocalizedMessage("ends.with.backslash"), REException.REG_ESCAPE, index);
      }
    }
    return index;
  }

  private boolean isMatchImpl(CharIndexed input, int index, int eflags) {
    if (firstToken == null) {
      return (input.charAt(0) == CharIndexed.OUT_OF_BOUNDS);
    }
    REMatch m = new REMatch(numSubs, index, eflags);
    if (firstToken.match(input, m)) {
      while (m != null) {
        if (input.charAt(m.index) == CharIndexed.OUT_OF_BOUNDS) {
          return true;
        }
        m = m.next;
      }
    }
    return false;
  }

  public boolean isMatch(Object input) {
    return isMatch(input, 0, 0);
  }

  public boolean isMatch(Object input, int index) {
    return isMatch(input, index, 0);
  }

  public boolean isMatch(Object input, int index, int eflags) {
    return isMatchImpl(makeCharIndexed(input, index), index, eflags);
  }

  public int getNumSubs() {
    return numSubs;
  }

  void setUncle(REToken uncle) {
    if (lastToken != null) {
      lastToken.setUncle(uncle);
    } else {
      super.setUncle(uncle);
    }
  }

  boolean chain(REToken next) {
    super.chain(next);
    setUncle(next);
    return true;
  }

  public int getMinimumLength() {
    return minimumLength;
  }

  public REMatch[] getAllMatches(Object input) {
    return getAllMatches(input, 0, 0);
  }

  public REMatch[] getAllMatches(Object input, int index) {
    return getAllMatches(input, index, 0);
  }

  public REMatch[] getAllMatches(Object input, int index, int eflags) {
    return getAllMatchesImpl(makeCharIndexed(input, index), index, eflags);
  }

  private REMatch[] getAllMatchesImpl(CharIndexed input, int index, int eflags) {
    Vector all = new Vector();
    REMatch m;
    while ((m = getMatchImpl(input, index, eflags, null)) != null) {
      all.addElement(m);
      index = m.getEndIndex();
      if (m.end[0] == 0) {
        index++;
        input.move(1);
      } else {
        input.move(m.end[0]);
      }
      if (!input.isValid()) {
        break;
      }
    }
    REMatch[] mset = new REMatch[all.size()];
    all.copyInto(mset);
    return mset;
  }

  boolean match(CharIndexed input, REMatch mymatch) {
    if (firstToken == null) {
      return next(input, mymatch);
    }
    mymatch.start[subIndex] = mymatch.index;
    return firstToken.match(input, mymatch);
  }

  public REMatch getMatch(Object input) {
    return getMatch(input, 0, 0);
  }

  public REMatch getMatch(Object input, int index) {
    return getMatch(input, index, 0);
  }

  public REMatch getMatch(Object input, int index, int eflags) {
    return getMatch(input, index, eflags, null);
  }

  public REMatch getMatch(Object input, int index, int eflags, StringBuffer buffer) {
    return getMatchImpl(makeCharIndexed(input, index), index, eflags, buffer);
  }

  REMatch getMatchImpl(CharIndexed input, int anchor, int eflags, StringBuffer buffer) {
    REMatch mymatch = new REMatch(numSubs, anchor, eflags);
    do {
      if (minimumLength == 0 || input.charAt(minimumLength - 1) != CharIndexed.OUT_OF_BOUNDS) {
        if (match(input, mymatch)) {
          REMatch longest = mymatch;
          while ((mymatch = mymatch.next) != null) {
            if (mymatch.index > longest.index) {
              longest = mymatch;
            }
          }
          longest.end[0] = longest.index;
          longest.finish(input);
          return longest;
        }
      }
      mymatch.clear(++anchor);
      if (buffer != null && input.charAt(0) != CharIndexed.OUT_OF_BOUNDS) {
        buffer.append(input.charAt(0));
      }
    } while (input.move(1));
    if (minimumLength == 0 && match(input, mymatch)) {
      mymatch.finish(input);
      return mymatch;
    }
    return null;
  }

  public REMatchEnumeration getMatchEnumeration(Object input) {
    return getMatchEnumeration(input, 0, 0);
  }

  public REMatchEnumeration getMatchEnumeration(Object input, int index) {
    return getMatchEnumeration(input, index, 0);
  }

  public REMatchEnumeration getMatchEnumeration(Object input, int index, int eflags) {
    return new REMatchEnumeration(this, makeCharIndexed(input, index), index, eflags);
  }

  public String substitute(Object input, String replace) {
    return substitute(input, replace, 0, 0);
  }

  public String substitute(Object input, String replace, int index) {
    return substitute(input, replace, index, 0);
  }

  public String substitute(Object input, String replace, int index, int eflags) {
    return substituteImpl(makeCharIndexed(input, index), replace, index, eflags);
  }

  private String substituteImpl(CharIndexed input, String replace, int index, int eflags) {
    StringBuffer buffer = new StringBuffer();
    REMatch m = getMatchImpl(input, index, eflags, buffer);
    if (m == null) {
      return buffer.toString();
    }
    buffer.append((eflags & REG_NO_INTERPOLATE) > 0 ? replace : m.substituteInto(replace));
    if (input.move(m.end[0])) {
      do {
        buffer.append(input.charAt(0));
      } while (input.move(1));
    }
    return buffer.toString();
  }

  public String substituteAll(Object input, String replace) {
    return substituteAll(input, replace, 0, 0);
  }

  public String substituteAll(Object input, String replace, int index) {
    return substituteAll(input, replace, index, 0);
  }

  public String substituteAll(Object input, String replace, int index, int eflags) {
    return substituteAllImpl(makeCharIndexed(input, index), replace, index, eflags);
  }

  private String substituteAllImpl(CharIndexed input, String replace, int index, int eflags) {
    StringBuffer buffer = new StringBuffer();
    REMatch m;
    while ((m = getMatchImpl(input, index, eflags, buffer)) != null) {
      buffer.append((eflags & REG_NO_INTERPOLATE) > 0 ? replace : m.substituteInto(replace));
      index = m.getEndIndex();
      if (m.end[0] == 0) {
        char ch = input.charAt(0);
        if (ch != CharIndexed.OUT_OF_BOUNDS) {
          buffer.append(ch);
        }
        input.move(1);
      } else {
        input.move(m.end[0]);
      }
      if (!input.isValid()) {
        break;
      }
    }
    return buffer.toString();
  }

  private void addToken(REToken next) {
    if (next == null) {
      return;
    }
    minimumLength += next.getMinimumLength();
    if (firstToken == null) {
      lastToken = firstToken = next;
    } else {
      if (lastToken.chain(next)) {
        lastToken = next;
      }
    }
  }

  private static REToken setRepeated(REToken current, int min, int max, int index) throws REException {
    if (current == null) {
      throw new REException(getLocalizedMessage("repeat.no.token"), REException.REG_BADRPT, index);
    }
    return new RETokenRepeated(current.subIndex, current, min, max);
  }

  private static int getPosixSet(char[] pattern, int index, StringBuffer buf) {
    for (int i = index; i < pattern.length - 1; i++) {
      if ((pattern[i] == ':') && (pattern[i + 1] == ']')) {
        return i + 2;
      }
      buf.append(pattern[i]);
    }
    return index;
  }

  private int getMinMax(char[] input, int index, IntPair minMax, RESyntax syntax) throws REException {
    boolean mustMatch = !syntax.get(RESyntax.RE_NO_BK_BRACES);
    int startIndex = index;
    if (index == input.length) {
      if (mustMatch) {
        throw new REException(getLocalizedMessage("unmatched.brace"), REException.REG_EBRACE, index);
      } else {
        return startIndex;
      }
    }

    int min, max = 0;
    CharUnit unit = new CharUnit();
    StringBuffer buf = new StringBuffer();

    do {
      index = getCharUnit(input, index, unit);
      if (Character.isDigit(unit.ch)) {
        buf.append(unit.ch);
      }
    } while ((index != input.length) && Character.isDigit(unit.ch));

    if (buf.length() == 0) {
      if (mustMatch) {
        throw new REException(getLocalizedMessage("interval.error"), REException.REG_EBRACE, index);
      } else {
        return startIndex;
      }
    }

    min = Integer.parseInt(buf.toString());

    if ((unit.ch == '}') && (syntax.get(RESyntax.RE_NO_BK_BRACES) ^ unit.bk)) {
      max = min;
    } else if (index == input.length) {
      if (mustMatch) {
        throw new REException(getLocalizedMessage("interval.no.end"), REException.REG_EBRACE, index);
      } else {
        return startIndex;
      }
    } else if ((unit.ch == ',') && !unit.bk) {
      buf = new StringBuffer();
      while (((index = getCharUnit(input, index, unit)) != input.length) && Character.isDigit(unit.ch)) {
        buf.append(unit.ch);
      }
      if (!((unit.ch == '}') && (syntax.get(RESyntax.RE_NO_BK_BRACES) ^ unit.bk))) {
        if (mustMatch) {
          throw new REException(getLocalizedMessage("interval.error"), REException.REG_EBRACE, index);
        } else {
          return startIndex;
        }
      }
      if (buf.length() == 0) {
        max = Integer.MAX_VALUE;
      } else {
        max = Integer.parseInt(buf.toString());
      }
    } else if (mustMatch) {
      throw new REException(getLocalizedMessage("interval.error"), REException.REG_EBRACE, index);
    } else {
      return startIndex;
    }

    minMax.first = min;
    minMax.second = max;
    return index;
  }

  public String toString() {
    StringBuffer sb = new StringBuffer();
    dump(sb);
    return sb.toString();
  }

  void dump(StringBuffer os) {
    os.append('(');
    if (subIndex == 0) {
      os.append("?:");
    }
    if (firstToken != null) {
      firstToken.dumpAll(os);
    }
    os.append(')');
  }

  private static CharIndexed makeCharIndexed(Object input, int index) {
    if (input instanceof String) {
      return new CharIndexedString((String) input, index);
    } else if (input instanceof char[]) {
      return new CharIndexedCharArray((char[]) input, index);
    } else if (input instanceof StringBuffer) {
      return new CharIndexedStringBuffer((StringBuffer) input, index);
    } else if (input instanceof InputStream) {
      return new CharIndexedInputStream((InputStream) input, index);
    } else if (input instanceof Reader) {
      return new CharIndexedReader((Reader) input, index);
    } else if (input instanceof CharIndexed) {
      return (CharIndexed) input;
    } else {
      return new CharIndexedString(input.toString(), index);
    }
  }
}