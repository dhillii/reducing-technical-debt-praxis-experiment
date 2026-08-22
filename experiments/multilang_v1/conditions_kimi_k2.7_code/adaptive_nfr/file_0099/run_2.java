/*
 *  gnu/regexp/RE.java
 *  Copyright (C) 1998-2001 Wes Biggs
 *
 *  This library is free software; you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published
 *  by the Free Software Foundation; either version 2.1 of the License, or
 *  (at your option) any later version.
 *
 *  This library is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with this program; if not, write to the Free Software
 *  Foundation, Inc., 675 Mass Ave, Cambridge, MA 02139, USA.
 */

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
 * <P>
 * A regular expression object (class RE) is compiled by constructing it
 * from a String, StringBuffer or character array, with optional 
 *  compilation flags (below)
 * and an optional syntax specification (see RESyntax; if not specified,
 * <code>RESyntax.RE_SYNTAX_PERL5</code> is used).
 * <P>
 * Once compiled, a regular expression object is reusable as well as
 * threadsafe: multiple threads can use the RE instance simultaneously
 * to match against different input text.
 * <P>
 * Various methods attempt to match input text against a compiled
 * regular expression.  These methods are:
 * <LI><code>isMatch</code>: returns true if the input text in its
 * entirety matches the regular expression pattern.
 * <LI><code>getMatch</code>: returns the first match found in the
 * input text, or null if no match is found.
 * <LI><code>getAllMatches</code>: returns an array of all
 * non-overlapping matches found in the input text.  If no matches are
 * found, the array is zero-length.
 * <LI><code>substitute</code>: substitute the first occurence of the
 * pattern in the input text with a replacement string (which may
 * include metacharacters $0-$9, see REMatch.substituteInto).
 * <LI><code>substituteAll</code>: same as above, but repeat for each
 * match before returning.
 * <LI><code>getMatchEnumeration</code>: returns an REMatchEnumeration
 * object that allows iteration over the matches (see
 * REMatchEnumeration for some reasons why you may want to do this
 * instead of using <code>getAllMatches</code>.
 * <P>
 *
 * These methods all have similar argument lists.  The input can be a
 * String, a character array, a StringBuffer, a Reader or an
 * InputStream of some sort.  Note that when using a Reader or
 * InputStream, the stream read position cannot be guaranteed after
 * attempting a match (this is not a bug, but a consequence of the way
 * regular expressions work).  Using an REMatchEnumeration can
 * eliminate most positioning problems.
 *
 * <P>
 *
 * The optional index argument specifies the offset from the beginning
 * of the text at which the search should start (see the descriptions
 * of some of the execution flags for how this can affect positional
 * pattern operators).  For a Reader or InputStream, this means an
 * offset from the current read position, so subsequent calls with the
 * same index argument on a Reader or an InputStream will not
 * necessarily access the same position on the stream, whereas
 * repeated searches at a given index in a fixed string will return
 * consistent results.
 *
 * <P>
 * You can optionally affect the execution environment by using a
 * combination of execution flags (constants listed below).
 * 
 * <P>
 * All operations on a regular expression are performed in a
 * thread-safe manner.
 *
 * @author <A HREF="mailto:wes@cacas.org">Wes Biggs</A>
 * @version 1.1.5-dev, to be released
 */

public class RE extends REToken {
  // This String will be returned by getVersion()
  private static final String VERSION = "1.1.5-dev";

  // The localized strings are kept in a separate file
  private static ResourceBundle messages = PropertyResourceBundle.getBundle("gnu/regexp/MessagesBundle", Locale.getDefault());

  // These are, respectively, the first and last tokens in our linked list
  // If there is only one token, firstToken == lastToken
  private REToken firstToken, lastToken;

  // This is the number of subexpressions in this regular expression,
  // with a minimum value of zero.  Returned by getNumSubs()
  private int numSubs;

  /** Minimum length, in characters, of any possible match. */
  private int minimumLength;

  /**
   * Compilation flag. Do  not  differentiate  case.   Subsequent
   * searches  using  this  RE will be case insensitive.
   */
  public static final int REG_ICASE = 2;

  /**
   * Compilation flag. The match-any-character operator (dot)
   * will match a newline character.  When set this overrides the syntax
   * bit RE_DOT_NEWLINE (see RESyntax for details).  This is equivalent to
   * the "/s" operator in Perl.
   */
  public static final int REG_DOT_NEWLINE = 4;

  /**
   * Compilation flag. Use multiline mode.  In this mode, the ^ and $
   * anchors will match based on newlines within the input. This is
   * equivalent to the "/m" operator in Perl.
   */
  public static final int REG_MULTILINE = 8;

  /**
   * Execution flag.
   * The match-beginning operator (^) will not match at the beginning
   * of the input string. Useful for matching on a substring when you
   * know the context of the input is such that position zero of the
   * input to the match test is not actually position zero of the text.
   * <P>
   * This example demonstrates the results of various ways of matching on
   * a substring.
   * <P>
   * <CODE>
   * String s = "food bar fool";<BR>
   * RE exp = new RE("^foo.");<BR>
   * REMatch m0 = exp.getMatch(s);<BR>
   * REMatch m1 = exp.getMatch(s.substring(8));<BR>
   * REMatch m2 = exp.getMatch(s.substring(8),0,RE.REG_NOTBOL); <BR>
   * REMatch m3 = exp.getMatch(s,8);                            <BR>
   * REMatch m4 = exp.getMatch(s,8,RE.REG_ANCHORINDEX);         <BR>
   * <P>
   * // Results:<BR>
   * //  m0.toString(): "food"<BR>
   * //  m1.toString(): "fool"<BR>
   * //  m2.toString(): null<BR>
   * //  m3.toString(): null<BR>
   * //  m4.toString(): "fool"<BR>
   * </CODE>
   */
  public static final int REG_NOTBOL = 16;

  /**
   * Execution flag.
   * The match-end operator ($) does not match at the end
   * of the input string. Useful for matching on substrings.
   */
  public static final int REG_NOTEOL = 32;

  /**
   * Execution flag.
   * When a match method is invoked that starts matching at a non-zero
   * index into the input, treat the input as if it begins at the index
   * given.  The effect of this flag is that the engine does not "see"
   * any text in the input before the given index.  This is useful so
   * that the match-beginning operator (^) matches not at position 0
   * in the input string, but at the position the search started at
   * (based on the index input given to the getMatch function).  See
   * the example under REG_NOTBOL.  It also affects the use of the \&lt;
   * and \b operators.
   */
  public static final int REG_ANCHORINDEX = 64;

  /**
   * Execution flag.
   * The substitute and substituteAll methods will not attempt to
   * interpolate occurrences of $1-$9 in the replacement text with
   * the corresponding subexpressions.  For example, you may want to
   * replace all matches of "one dollar" with "$1".
   */
  public static final int REG_NO_INTERPOLATE = 128;

  /** Returns a string representing the version of the gnu.regexp package. */
  public static final String version() {
    return VERSION;
  }

  // Retrieves a message from the ResourceBundle
  static final String getLocalizedMessage(String key) {
    return messages.getString(key);
  }

  /**
   * Constructs a regular expression pattern buffer without any compilation
   * flags set, and using the default syntax (RESyntax.RE_SYNTAX_PERL5).
   *
   * @param pattern A regular expression pattern, in the form of a String,
   *   StringBuffer or char[].  Other input types will be converted to
   *   strings using the toString() method.
   * @exception REException The input pattern could not be parsed.
   * @exception NullPointerException The pattern was null.
   */
  public RE(Object pattern) throws REException {
    this(pattern,0,RESyntax.RE_SYNTAX_PERL5,0,0);
  }

  /**
   * Constructs a regular expression pattern buffer using the specified
   * compilation flags and the default syntax (RESyntax.RE_SYNTAX_PERL5).
   *
   * @param pattern A regular expression pattern, in the form of a String,
   *   StringBuffer, or char[].  Other input types will be converted to
   *   strings using the toString() method.
   * @param cflags The logical OR of any combination of the compilation flags listed above.
   * @exception REException The input pattern could not be parsed.
   * @exception NullPointerException The pattern was null.
   */
  public RE(Object pattern, int cflags) throws REException {
    this(pattern,cflags,RESyntax.RE_SYNTAX_PERL5,0,0);
  }

  /**
   * Constructs a regular expression pattern buffer using the specified
   * compilation flags and regular expression syntax.
   *
   * @param pattern A regular expression pattern, in the form of a String,
   *   StringBuffer, or char[].  Other input types will be converted to
   *   strings using the toString() method.
   * @param cflags The logical OR of any combination of the compilation flags listed above.
   * @param syntax The type of regular expression syntax to use.
   * @exception REException The input pattern could not be parsed.
   * @exception NullPointerException The pattern was null.
   */
  public RE(Object pattern, int cflags, RESyntax syntax) throws REException {
    this(pattern,cflags,syntax,0,0);
  }

  // internal constructor used for alternation
  private RE(REToken first, REToken last,int subs, int subIndex, int minLength) {
    super(subIndex);
    firstToken = first;
    lastToken = last;
    numSubs = subs;
    minimumLength = minLength;
    addToken(new RETokenEndSub(subIndex));
  }

  private RE(Object patternObj, int cflags, RESyntax syntax, int myIndex, int nextSub) throws REException {
    super(myIndex); // Subexpression index of this token.
    initialize(patternObj, cflags, syntax, myIndex, nextSub);
  }

  // For use by subclasses
  protected RE() { super(0); }

  /** Mutable state used while parsing a pattern. */
  private class ParseContext {
    final char[] pattern;
    final int pLength;
    final RESyntax syntax;
    final int cflags;
    final boolean insens;
    final int nextSub;
    final CharUnit unit;
    final IntPair minMax;
    int index;
    REToken currentToken;
    Vector branches;

    ParseContext(char[] pattern, int pLength, RESyntax syntax, int cflags, boolean insens, int nextSub) {
      this.pattern = pattern;
      this.pLength = pLength;
      this.syntax = syntax;
      this.cflags = cflags;
      this.insens = insens;
      this.nextSub = nextSub;
      this.unit = new CharUnit();
      this.minMax = new IntPair();
      this.index = 0;
      this.currentToken = null;
      this.branches = null;
    }
  }

  /** Mutable state used while parsing a character class list. */
  private static class ListContext {
    Vector options;
    char lastChar;
    boolean negative;
  }

  /** Group modifier parsed after an opening parenthesis. */
  private static class GroupModifier {
    boolean pure;
    boolean comment;
    boolean lookAhead;
    boolean negative;
    int newIndex;
  }

  /** Bounds locating the end of a parenthesised sub-expression. */
  private static class SubexpressionBounds {
    final int endIndex;
    final int nextIndex;

    SubexpressionBounds(int endIndex, int nextIndex) {
      this.endIndex = endIndex;
      this.nextIndex = nextIndex;
    }
  }

  // The meat of construction
  protected void initialize(Object patternObj, int cflags, RESyntax syntax, int myIndex, int nextSub) throws REException {
    char[] pattern = convertPattern(patternObj);
    int pLength = pattern.length;

    numSubs = 0;
    firstToken = lastToken = null;
    minimumLength = 0;

    ParseContext ctx = new ParseContext(pattern, pLength, syntax, cflags, isCaseInsensitive(cflags), nextSub);

    while (ctx.index < pLength) {
      ctx.index = getCharUnit(pattern, ctx.index, ctx.unit);
      parseUnit(ctx);
    }

    finalizeParse(ctx);
  }

  /** Converts the supplied pattern object into a character array. */
  private char[] convertPattern(Object patternObj) {
    if (patternObj instanceof String) {
      return ((String) patternObj).toCharArray();
    }
    if (patternObj instanceof char[]) {
      return (char[]) patternObj;
    }
    if (patternObj instanceof StringBuffer) {
      char[] pattern = new char[((StringBuffer) patternObj).length()];
      ((StringBuffer) patternObj).getChars(0, pattern.length, pattern, 0);
      return pattern;
    }
    return patternObj.toString().toCharArray();
  }

  /** Returns true when the case-insensitive flag is set. */
  private boolean isCaseInsensitive(int cflags) {
    return (cflags & REG_ICASE) > 0;
  }

  /** Dispatches the current character unit to the appropriate handler. */
  private void parseUnit(ParseContext ctx) throws REException {
    if (tryAlternation(ctx)) return;
    if (tryInterval(ctx)) return;
    if (tryList(ctx)) return;
    if (trySubexpression(ctx)) return;
    if (tryUnmatchedRightParen(ctx)) return;
    if (tryLineAnchor(ctx)) return;
    if (tryAnyChar(ctx)) return;
    if (tryRepeat(ctx)) return;
    if (tryBackreference(ctx)) return;
    if (tryAnchor(ctx)) return;
    if (tryCharClassEscape(ctx)) return;
    if (tryAsciiEscape(ctx)) return;
    tryLiteral(ctx);
  }

  /** Finalises token construction after the pattern has been scanned. */
  private void finalizeParse(ParseContext ctx) throws REException {
    addToken(ctx.currentToken);

    if (ctx.branches != null) {
      ctx.branches.addElement(new RE(firstToken, lastToken, numSubs, subIndex, minimumLength));
      ctx.branches.trimToSize();
      minimumLength = 0;
      firstToken = lastToken = null;
      addToken(new RETokenOneOf(subIndex, ctx.branches, false));
    } else {
      addToken(new RETokenEndSub(subIndex));
    }
  }

  /** Handles the alternation operator if the current unit matches. */
  private boolean tryAlternation(ParseContext ctx) throws REException {
    if (!isAlternation(ctx.unit, ctx.syntax)) return false;

    addToken(ctx.currentToken);
    RE theBranch = new RE(firstToken, lastToken, numSubs, subIndex, minimumLength);
    minimumLength = 0;

    if (ctx.branches == null) {
      ctx.branches = new Vector();
    }
    ctx.branches.addElement(theBranch);
    firstToken = lastToken = ctx.currentToken = null;
    return true;
  }

  /** Returns true when the current unit is an alternation operator. */
  private boolean isAlternation(CharUnit unit, RESyntax syntax) {
    return (((unit.ch == '|' && (syntax.get(RESyntax.RE_NO_BK_VBAR) ^ unit.bk))
        || (syntax.get(RESyntax.RE_NEWLINE_ALT) && (unit.ch == '\n') && !unit.bk))
        && !syntax.get(RESyntax.RE_LIMITED_OPS));
  }

  /** Handles interval ({x,y}) repetition if the current unit matches. */
  private boolean tryInterval(ParseContext ctx) throws REException {
    if (!isInterval(ctx.unit, ctx.syntax)) return false;

    int newIndex = getMinMax(ctx.pattern, ctx.index, ctx.minMax, ctx.syntax);

    if (newIndex <= ctx.index) {
      addToken(ctx.currentToken);
      ctx.currentToken = new RETokenChar(subIndex, ctx.unit.ch, ctx.insens);
      return true;
    }

    if (ctx.minMax.first > ctx.minMax.second) {
      throw parseError("interval.order", REException.REG_BADRPT, newIndex);
    }

    validateRepeatableToken(ctx.currentToken, ctx.minMax.second, newIndex);
    ctx.index = newIndex;
    ctx.currentToken = setRepeated(ctx.currentToken, ctx.minMax.first, ctx.minMax.second, newIndex);
    return true;
  }

  /** Returns true when the current unit starts an interval expression. */
  private boolean isInterval(CharUnit unit, RESyntax syntax) {
    return (unit.ch == '{') && syntax.get(RESyntax.RE_INTERVALS) && (syntax.get(RESyntax.RE_NO_BK_BRACES) ^ unit.bk);
  }

  /** Handles a character class list if the current unit starts one. */
  private boolean tryList(ParseContext ctx) throws REException {
    if (!isListStart(ctx.unit)) return false;

    ListContext list = new ListContext();
    list.options = new Vector();
    list.lastChar = 0;
    list.negative = readListNegation(ctx);
    readListLeadingBracket(ctx, list);

    while (ctx.index < ctx.pLength && ctx.pattern[ctx.index] != ']') {
      parseListElement(ctx, list);
    }

    if (ctx.index >= ctx.pLength) {
      throw parseError("class.no.end", REException.REG_EBRACK, ctx.index);
    }

    ctx.index++;
    finalizeList(ctx, list);
    return true;
  }

  /** Returns true when the current unit starts a character class list. */
  private boolean isListStart(CharUnit unit) {
    return (unit.ch == '[') && !unit.bk;
  }

  /** Reads an initial caret negation marker in a character class. */
  private boolean readListNegation(ParseContext ctx) throws REException {
    if (ctx.index < ctx.pLength && ctx.pattern[ctx.index] == '^') {
      if (++ctx.index == ctx.pLength) {
        throw parseError("class.no.end", REException.REG_EBRACK, ctx.index);
      }
      return true;
    }
    return false;
  }

  /** Reads a leading right-bracket literal in a character class. */
  private void readListLeadingBracket(ParseContext ctx, ListContext list) throws REException {
    if (ctx.index < ctx.pLength && ctx.pattern[ctx.index] == ']') {
      list.lastChar = ctx.pattern[ctx.index];
      if (++ctx.index == ctx.pLength) {
        throw parseError("class.no.end", REException.REG_EBRACK, ctx.index);
      }
    }
  }

  /** Parses the next element inside a character class list. */
  private void parseListElement(ParseContext ctx, ListContext list) throws REException {
    if (ctx.index >= ctx.pLength) {
      throw parseError("class.no.end", REException.REG_EBRACK, ctx.index);
    }

    char ch = ctx.pattern[ctx.index++];

    if (isListRangeDash(ch, list.lastChar)) {
      handleListRange(ctx, list);
      return;
    }
    if (isListEscape(ch, ctx.syntax)) {
      handleListEscape(ctx, list);
      return;
    }
    if (isListPosixStart(ch, ctx)) {
      handleListPosix(ctx, list);
      return;
    }
    handleListChar(list, ch, ctx.insens);
  }

  /** Returns true when the character introduces a range inside a list. */
  private boolean isListRangeDash(char ch, char lastChar) {
    return (ch == '-') && (lastChar != 0);
  }

  /** Returns true when the character introduces an escape inside a list. */
  private boolean isListEscape(char ch, RESyntax syntax) {
    return (ch == '\\') && syntax.get(RESyntax.RE_BACKSLASH_ESCAPE_IN_LISTS);
  }

  /** Returns true when the character introduces a POSIX character class. */
  private boolean isListPosixStart(char ch, ParseContext ctx) {
    return (ch == '[') && ctx.syntax.get(RESyntax.RE_CHAR_CLASSES)
        && (ctx.index < ctx.pLength) && (ctx.pattern[ctx.index] == ':');
  }

  /** Handles a character range inside a list. */
  private void handleListRange(ParseContext ctx, ListContext list) throws REException {
    if (ctx.index >= ctx.pLength) {
      throw parseError("class.no.end", REException.REG_EBRACK, ctx.index);
    }

    char next = ctx.pattern[ctx.index];
    if (next == ']') {
      list.options.addElement(new RETokenChar(subIndex, list.lastChar, ctx.insens));
      list.lastChar = '-';
    } else {
      list.options.addElement(new RETokenRange(subIndex, list.lastChar, next, ctx.insens));
      list.lastChar = 0;
      ctx.index++;
    }
  }

  /** Handles a backslash escape inside a character class list. */
  private void handleListEscape(ParseContext ctx, ListContext list) throws REException {
    if (ctx.index >= ctx.pLength) {
      throw parseError("class.no.end", REException.REG_EBRACK, ctx.index);
    }

    char esc = ctx.pattern[ctx.index];
    int posixId = determinePosixEscape(esc, ctx.syntax);

    if (posixId != -1) {
      boolean negate = isNegatedPosixEscape(esc);
      if (list.lastChar != 0) {
        list.options.addElement(new RETokenChar(subIndex, list.lastChar, ctx.insens));
      }
      list.options.addElement(new RETokenPOSIX(subIndex, posixId, ctx.insens, negate));
      ctx.index++;
      return;
    }

    char asciiEsc = determineAsciiEscape(esc);
    if (list.lastChar != 0) {
      list.options.addElement(new RETokenChar(subIndex, list.lastChar, ctx.insens));
    }
    if (asciiEsc != 0) {
      list.lastChar = asciiEsc;
    } else {
      list.lastChar = esc;
    }
    ctx.index++;
  }

  /** Determines the POSIX class identifier for a list escape, or -1 if none. */
  private int determinePosixEscape(char esc, RESyntax syntax) {
    if (!syntax.get(RESyntax.RE_CHAR_CLASS_ESC_IN_LISTS)) {
      return -1;
    }
    if (esc == 'd' || esc == 'D') return RETokenPOSIX.DIGIT;
    if (esc == 's' || esc == 'S') return RETokenPOSIX.SPACE;
    if (esc == 'w' || esc == 'W') return RETokenPOSIX.ALNUM;
    return -1;
  }

  /** Returns true when the POSIX list escape is negated. */
  private boolean isNegatedPosixEscape(char esc) {
    return esc == 'D' || esc == 'S' || esc == 'W';
  }

  /** Determines the ASCII character represented by a list escape, or 0 if none. */
  private char determineAsciiEscape(char esc) {
    if (esc == 'n') return '\n';
    if (esc == 't') return '\t';
    if (esc == 'r') return '\r';
    return 0;
  }

  /** Handles a POSIX character class inside a list. */
  private void handleListPosix(ParseContext ctx, ListContext list) throws REException {
    StringBuffer posixSet = new StringBuffer();
    ctx.index = getPosixSet(ctx.pattern, ctx.index + 1, posixSet);
    int posixId = RETokenPOSIX.intValue(posixSet.toString());
    if (posixId != -1) {
      list.options.addElement(new RETokenPOSIX(subIndex, posixId, ctx.insens, false));
    }
  }

  /** Handles a plain character inside a list. */
  private void handleListChar(ListContext list, char ch, boolean insens) {
    if (list.lastChar != 0) {
      list.options.addElement(new RETokenChar(subIndex, list.lastChar, insens));
    }
    list.lastChar = ch;
  }

  /** Finalises a character class list and stores it as the current token. */
  private void finalizeList(ParseContext ctx, ListContext list) {
    if (list.lastChar != 0) {
      list.options.addElement(new RETokenChar(subIndex, list.lastChar, ctx.insens));
    }
    addToken(ctx.currentToken);
    list.options.trimToSize();
    ctx.currentToken = new RETokenOneOf(subIndex, list.options, list.negative);
  }

  /** Handles a parenthesised sub-expression if the current unit starts one. */
  private boolean trySubexpression(ParseContext ctx) throws REException {
    if (!isSubexpressionStart(ctx.unit, ctx.syntax)) return false;

    GroupModifier mod = readGroupModifier(ctx);

    if (ctx.index >= ctx.pLength) {
      throw parseError("unmatched.paren", REException.REG_ESUBREG, ctx.index);
    }

    SubexpressionBounds bounds = findSubexpressionEnd(ctx);

    if (mod.comment) {
      ctx.index = bounds.nextIndex;
      return true;
    }

    createSubexpressionToken(ctx, mod, bounds);
    return true;
  }

  /** Returns true when the current unit starts a sub-expression. */
  private boolean isSubexpressionStart(CharUnit unit, RESyntax syntax) {
    return (unit.ch == '(') && (syntax.get(RESyntax.RE_NO_BK_PARENS) ^ unit.bk);
  }

  /** Reads the modifier (?...) following an opening parenthesis. */
  private GroupModifier readGroupModifier(ParseContext ctx) throws REException {
    GroupModifier mod = new GroupModifier();
    mod.newIndex = ctx.index;

    if (ctx.index + 1 < ctx.pLength && ctx.pattern[ctx.index] == '?') {
      char next = ctx.pattern[ctx.index + 1];
      if (next == '!' && ctx.syntax.get(RESyntax.RE_LOOKAHEAD)) {
        mod.pure = true;
        mod.negative = true;
        mod.lookAhead = true;
        mod.newIndex = ctx.index + 2;
      } else if (next == '=' && ctx.syntax.get(RESyntax.RE_LOOKAHEAD)) {
        mod.pure = true;
        mod.lookAhead = true;
        mod.newIndex = ctx.index + 2;
      } else if (next == ':' && ctx.syntax.get(RESyntax.RE_PURE_GROUPING)) {
        mod.pure = true;
        mod.newIndex = ctx.index + 2;
      } else if (next == '#' && ctx.syntax.get(RESyntax.RE_COMMENTS)) {
        mod.comment = true;
      } else {
        throw parseError("repeat.no.token", REException.REG_BADRPT, ctx.index);
      }
    }

    ctx.index = mod.newIndex;
    return mod;
  }

  /** Locates the matching closing parenthesis for a sub-expression. */
  private SubexpressionBounds findSubexpressionEnd(ParseContext ctx) throws REException {
    int endIndex = ctx.index;
    int nextIndex = ctx.index;
    int nested = 0;

    while (true) {
      if (endIndex >= ctx.pLength) {
        throw parseError("subexpr.no.end", REException.REG_ESUBREG, nextIndex);
      }
      nextIndex = getCharUnit(ctx.pattern, endIndex, ctx.unit);
      if (isSubexpressionClose(ctx.unit, ctx.syntax) && nested == 0) {
        return new SubexpressionBounds(endIndex, nextIndex);
      }
      endIndex = nextIndex;
      if (isSubexpressionOpen(ctx.unit, ctx.syntax)) {
        nested++;
      }
      if (isSubexpressionClose(ctx.unit, ctx.syntax)) {
        nested--;
      }
    }
  }

  /** Returns true when the current unit is an opening parenthesis. */
  private boolean isSubexpressionOpen(CharUnit unit, RESyntax syntax) {
    return (unit.ch == '(') && (syntax.get(RESyntax.RE_NO_BK_PARENS) ^ unit.bk);
  }

  /** Returns true when the current unit is a closing parenthesis. */
  private boolean isSubexpressionClose(CharUnit unit, RESyntax syntax) {
    return (unit.ch == ')') && (syntax.get(RESyntax.RE_NO_BK_PARENS) ^ unit.bk);
  }

  /** Creates the token representing a parsed sub-expression. */
  private void createSubexpressionToken(ParseContext ctx, GroupModifier mod, SubexpressionBounds bounds) throws REException {
    addToken(ctx.currentToken);

    if (!mod.pure) {
      numSubs++;
    }

    int useIndex;
    if (mod.pure || mod.lookAhead) {
      useIndex = 0;
    } else {
      useIndex = ctx.nextSub + numSubs;
    }

    ctx.currentToken = new RE(String.valueOf(ctx.pattern, ctx.index, bounds.endIndex - ctx.index).toCharArray(),
        ctx.cflags, ctx.syntax, useIndex, ctx.nextSub + numSubs);
    numSubs += ((RE) ctx.currentToken).getNumSubs();

    if (mod.lookAhead) {
      ctx.currentToken = new RETokenLookAhead(ctx.currentToken, mod.negative);
    }

    ctx.index = bounds.nextIndex;
  }

  /** Throws an exception for an unmatched right parenthesis when appropriate. */
  private boolean tryUnmatchedRightParen(ParseContext ctx) throws REException {
    if (!isUnmatchedRightParen(ctx.unit, ctx.syntax)) return false;
    throw parseError("unmatched.paren", REException.REG_EPAREN, ctx.index);
  }

  /** Returns true when the current unit is an unmatched right parenthesis. */
  private boolean isUnmatchedRightParen(CharUnit unit, RESyntax syntax) {
    return !syntax.get(RESyntax.RE_UNMATCHED_RIGHT_PAREN_ORD)
        && (unit.ch == ')') && (syntax.get(RESyntax.RE_NO_BK_PARENS) ^ unit.bk);
  }

  /** Handles start-of-line and end-of-line anchors. */
  private boolean tryLineAnchor(ParseContext ctx) throws REException {
    if (isStartOfLine(ctx.unit)) {
      addToken(ctx.currentToken);
      ctx.currentToken = null;
      addToken(new RETokenStart(subIndex, getLineSeparator(ctx.cflags, ctx.syntax)));
      return true;
    }
    if (isEndOfLine(ctx.unit)) {
      addToken(ctx.currentToken);
      ctx.currentToken = null;
      addToken(new RETokenEnd(subIndex, getLineSeparator(ctx.cflags, ctx.syntax)));
      return true;
    }
    return false;
  }

  /** Returns true when the current unit is a start-of-line anchor. */
  private boolean isStartOfLine(CharUnit unit) {
    return (unit.ch == '^') && !unit.bk;
  }

  /** Returns true when the current unit is an end-of-line anchor. */
  private boolean isEndOfLine(CharUnit unit) {
    return (unit.ch == '$') && !unit.bk;
  }

  /** Returns the line separator when multiline mode is enabled, otherwise null. */
  private char[] getLineSeparator(int cflags, RESyntax syntax) {
    if (isMultiline(cflags)) {
      return syntax.getLineSeparator();
    }
    return null;
  }

  /** Returns true when multiline mode is enabled. */
  private boolean isMultiline(int cflags) {
    return (cflags & REG_MULTILINE) > 0;
  }

  /** Handles the match-any-character operator. */
  private boolean tryAnyChar(ParseContext ctx) {
    if (!isAnyChar(ctx.unit)) return false;
    addToken(ctx.currentToken);
    ctx.currentToken = new RETokenAny(subIndex,
        ctx.syntax.get(RESyntax.RE_DOT_NEWLINE) || isDotNewline(ctx.cflags),
        ctx.syntax.get(RESyntax.RE_DOT_NOT_NULL));
    return true;
  }

  /** Returns true when the current unit is the match-any-character operator. */
  private boolean isAnyChar(CharUnit unit) {
    return (unit.ch == '.') && !unit.bk;
  }

  /** Returns true when the dot-matches-newline flag is set. */
  private boolean isDotNewline(int cflags) {
    return (cflags & REG_DOT_NEWLINE) > 0;
  }

  /** Handles quantifier operators (*, +, ?). */
  private boolean tryRepeat(ParseContext ctx) throws REException {
    if (isZeroOrMore(ctx.unit)) {
      validateAndRepeat(ctx, 0, Integer.MAX_VALUE);
      return true;
    }
    if (isOneOrMore(ctx.unit, ctx.syntax)) {
      validateAndRepeat(ctx, 1, Integer.MAX_VALUE);
      return true;
    }
    if (isZeroOrOne(ctx.unit, ctx.syntax)) {
      handleZeroOrOne(ctx);
      return true;
    }
    return false;
  }

  /** Returns true when the current unit is a zero-or-more quantifier. */
  private boolean isZeroOrMore(CharUnit unit) {
    return (unit.ch == '*') && !unit.bk;
  }

  /** Returns true when the current unit is a one-or-more quantifier. */
  private boolean isOneOrMore(CharUnit unit, RESyntax syntax) {
    return (unit.ch == '+') && !syntax.get(RESyntax.RE_LIMITED_OPS)
        && (!syntax.get(RESyntax.RE_BK_PLUS_QM) ^ unit.bk);
  }

  /** Returns true when the current unit is a zero-or-one quantifier. */
  private boolean isZeroOrOne(CharUnit unit, RESyntax syntax) {
    return (unit.ch == '?') && !syntax.get(RESyntax.RE_LIMITED_OPS)
        && (!syntax.get(RESyntax.RE_BK_PLUS_QM) ^ unit.bk);
  }

  /** Validates a token can be repeated and wraps it in a repetition token. */
  private void validateAndRepeat(ParseContext ctx, int min, int max) throws REException {
    validateRepeatableToken(ctx.currentToken, max, ctx.index);
    ctx.currentToken = setRepeated(ctx.currentToken, min, max, ctx.index);
  }

  /** Ensures the supplied token may legally be repeated. */
  private void validateRepeatableToken(REToken token, int max, int index) throws REException {
    if (token == null) {
      throw parseError("repeat.no.token", REException.REG_BADRPT, index);
    }
    if (isRepeatedToken(token)) {
      throw parseError("repeat.chained", REException.REG_BADRPT, index);
    }
    if (isWordBoundaryToken(token)) {
      throw parseError("repeat.assertion", REException.REG_BADRPT, index);
    }
    if (isEmptyInfiniteRepeat(token, max)) {
      throw parseError("repeat.empty.token", REException.REG_BADRPT, index);
    }
  }

  /** Returns true when the token is already a repeated token. */
  private boolean isRepeatedToken(REToken token) {
    return token instanceof RETokenRepeated;
  }

  /** Returns true when the token is a word-boundary assertion. */
  private boolean isWordBoundaryToken(REToken token) {
    return token instanceof RETokenWordBoundary;
  }

  /** Returns true when the token can match empty input an unbounded number of times. */
  private boolean isEmptyInfiniteRepeat(REToken token, int max) {
    return (token.getMinimumLength() == 0) && (max == Integer.MAX_VALUE);
  }

  /** Handles the zero-or-one quantifier, including stingy matching. */
  private void handleZeroOrOne(ParseContext ctx) throws REException {
    if (ctx.currentToken == null) {
      throw parseError("repeat.no.token", REException.REG_BADRPT, ctx.index);
    }
    if (isRepeatedToken(ctx.currentToken)) {
      handleStingy(ctx);
      return;
    }
    if (isWordBoundaryToken(ctx.currentToken)) {
      throw parseError("repeat.assertion", REException.REG_BADRPT, ctx.index);
    }
    ctx.currentToken = setRepeated(ctx.currentToken, 0, 1, ctx.index);
  }

  /** Applies stingy matching to a repeated token when permitted. */
  private void handleStingy(ParseContext ctx) throws REException {
    RETokenRepeated repeated = (RETokenRepeated) ctx.currentToken;
    if (ctx.syntax.get(RESyntax.RE_STINGY_OPS) && !repeated.isStingy()) {
      repeated.makeStingy();
    } else {
      throw parseError("repeat.chained", REException.REG_BADRPT, ctx.index);
    }
  }

  /** Handles a backreference escape when applicable. */
  private boolean tryBackreference(ParseContext ctx) {
    if (!isBackreference(ctx.unit, ctx.syntax)) return false;
    addToken(ctx.currentToken);
    ctx.currentToken = new RETokenBackRef(subIndex, Character.digit(ctx.unit.ch, 10), ctx.insens);
    return true;
  }

  /** Returns true when the current unit is a numeric backreference. */
  private boolean isBackreference(CharUnit unit, RESyntax syntax) {
    return unit.bk && Character.isDigit(unit.ch) && !syntax.get(RESyntax.RE_NO_BK_REFS);
  }

  /** Handles string and word-boundary anchors. */
  private boolean tryAnchor(ParseContext ctx) {
    if (isStartOfStringAnchor(ctx.unit, ctx.syntax)) {
      addToken(ctx.currentToken);
      ctx.currentToken = new RETokenStart(subIndex, null);
      return true;
    }
    if (isWordBoundary(ctx.unit, ctx.syntax)) {
      addToken(ctx.currentToken);
      ctx.currentToken = new RETokenWordBoundary(subIndex,
          RETokenWordBoundary.BEGIN | RETokenWordBoundary.END, false);
      return true;
    }
    if (isWordBoundaryBegin(ctx.unit)) {
      addToken(ctx.currentToken);
      ctx.currentToken = new RETokenWordBoundary(subIndex, RETokenWordBoundary.BEGIN, false);
      return true;
    }
    if (isWordBoundaryEnd(ctx.unit)) {
      addToken(ctx.currentToken);
      ctx.currentToken = new RETokenWordBoundary(subIndex, RETokenWordBoundary.END, false);
      return true;
    }
    if (isNonWordBoundary(ctx.unit, ctx.syntax)) {
      addToken(ctx.currentToken);
      ctx.currentToken = new RETokenWordBoundary(subIndex,
          RETokenWordBoundary.BEGIN | RETokenWordBoundary.END, true);
      return true;
    }
    if (isEndOfStringAnchor(ctx.unit, ctx.syntax)) {
      addToken(ctx.currentToken);
      ctx.currentToken = new RETokenEnd(subIndex, null);
      return true;
    }
    return false;
  }

  /** Returns true when the current unit is a start-of-string anchor. */
  private boolean isStartOfStringAnchor(CharUnit unit, RESyntax syntax) {
    return unit.bk && (unit.ch == 'A') && syntax.get(RESyntax.RE_STRING_ANCHORS);
  }

  /** Returns true when the current unit is a word-boundary anchor. */
  private boolean isWordBoundary(CharUnit unit, RESyntax syntax) {
    return unit.bk && (unit.ch == 'b') && syntax.get(RESyntax.RE_STRING_ANCHORS);
  }

  /** Returns true when the current unit is a word-beginning anchor. */
  private boolean isWordBoundaryBegin(CharUnit unit) {
    return unit.bk && (unit.ch == '<');
  }

  /** Returns true when the current unit is a word-end anchor. */
  private boolean isWordBoundaryEnd(CharUnit unit) {
    return unit.bk && (unit.ch == '>');
  }

  /** Returns true when the current unit is a non-word-boundary anchor. */
  private boolean isNonWordBoundary(CharUnit unit, RESyntax syntax) {
    return unit.bk && (unit.ch == 'B') && syntax.get(RESyntax.RE_STRING_ANCHORS);
  }

  /** Returns true when the current unit is an end-of-string anchor. */
  private boolean isEndOfStringAnchor(CharUnit unit, RESyntax syntax) {
    return unit.bk && (unit.ch == 'Z') && syntax.get(RESyntax.RE_STRING_ANCHORS);
  }

  /** Handles POSIX character-class escapes. */
  private boolean tryCharClassEscape(ParseContext ctx) {
    if (isDigitEscape(ctx.unit, ctx.syntax)) {
      addToken(ctx.currentToken);
      ctx.currentToken = new RETokenPOSIX(subIndex, RETokenPOSIX.DIGIT, ctx.insens, false);
      return true;
    }
    if (isNonDigitEscape(ctx.unit, ctx.syntax)) {
      addToken(ctx.currentToken);
      ctx.currentToken = new RETokenPOSIX(subIndex, RETokenPOSIX.DIGIT, ctx.insens, true);
      return true;
    }
    if (isWhitespaceEscape(ctx.unit, ctx.syntax)) {
      addToken(ctx.currentToken);
      ctx.currentToken = new RETokenPOSIX(subIndex, RETokenPOSIX.SPACE, ctx.insens, false);
      return true;
    }
    if (isNonWhitespaceEscape(ctx.unit, ctx.syntax)) {
      addToken(ctx.currentToken);
      ctx.currentToken = new RETokenPOSIX(subIndex, RETokenPOSIX.SPACE, ctx.insens, true);
      return true;
    }
    if (isAlnumEscape(ctx.unit, ctx.syntax)) {
      addToken(ctx.currentToken);
      ctx.currentToken = new RETokenPOSIX(subIndex, RETokenPOSIX.ALNUM, ctx.insens, false);
      return true;
    }
    if (isNonAlnumEscape(ctx.unit, ctx.syntax)) {
      addToken(ctx.currentToken);
      ctx.currentToken = new RETokenPOSIX(subIndex, RETokenPOSIX.ALNUM, ctx.insens, true);
      return true;
    }
    return false;
  }

  /** Returns true when the current unit is a digit class escape. */
  private boolean isDigitEscape(CharUnit unit, RESyntax syntax) {
    return unit.bk && (unit.ch == 'd') && syntax.get(RESyntax.RE_CHAR_CLASS_ESCAPES);
  }

  /** Returns true when the current unit is a non-digit class escape. */
  private boolean isNonDigitEscape(CharUnit unit, RESyntax syntax) {
    return unit.bk && (unit.ch == 'D') && syntax.get(RESyntax.RE_CHAR_CLASS_ESCAPES);
  }

  /** Returns true when the current unit is a whitespace class escape. */
  private boolean isWhitespaceEscape(CharUnit unit, RESyntax syntax) {
    return unit.bk && (unit.ch == 's') && syntax.get(RESyntax.RE_CHAR_CLASS_ESCAPES);
  }

  /** Returns true when the current unit is a non-whitespace class escape. */
  private boolean isNonWhitespaceEscape(CharUnit unit, RESyntax syntax) {
    return unit.bk && (unit.ch == 'S') && syntax.get(RESyntax.RE_CHAR_CLASS_ESCAPES);
  }

  /** Returns true when the current unit is an alphanumeric class escape. */
  private boolean isAlnumEscape(CharUnit unit, RESyntax syntax) {
    return unit.bk && (unit.ch == 'w') && syntax.get(RESyntax.RE_CHAR_CLASS_ESCAPES);
  }

  /** Returns true when the current unit is a non-alphanumeric class escape. */
  private boolean isNonAlnumEscape(CharUnit unit, RESyntax syntax) {
    return unit.bk && (unit.ch == 'W') && syntax.get(RESyntax.RE_CHAR_CLASS_ESCAPES);
  }

  /** Handles ASCII control-character escapes. */
  private boolean tryAsciiEscape(ParseContext ctx) {
    if (isNewlineEscape(ctx.unit)) {
      addToken(ctx.currentToken);
      ctx.currentToken = new RETokenChar(subIndex, '\n', false);
      return true;
    }
    if (isReturnEscape(ctx.unit)) {
      addToken(ctx.currentToken);
      ctx.currentToken = new RETokenChar(subIndex, '\r', false);
      return true;
    }
    if (isTabEscape(ctx.unit)) {
      addToken(ctx.currentToken);
      ctx.currentToken = new RETokenChar(subIndex, '\t', false);
      return true;
    }
    return false;
  }

  /** Returns true when the current unit is a newline escape. */
  private boolean isNewlineEscape(CharUnit unit) {
    return unit.bk && (unit.ch == 'n');
  }

  /** Returns true when the current unit is a carriage-return escape. */
  private boolean isReturnEscape(CharUnit unit) {
    return unit.bk && (unit.ch == 'r');
  }

  /** Returns true when the current unit is a tab escape. */
  private boolean isTabEscape(CharUnit unit) {
    return unit.bk && (unit.ch == 't');
  }

  /** Handles a non-special character as a literal token. */
  private boolean tryLiteral(ParseContext ctx) {
    addToken(ctx.currentToken);
    ctx.currentToken = new RETokenChar(subIndex, ctx.unit.ch, ctx.insens);
    return true;
  }

  /** Builds an REException for the given message key and error code. */
  private REException parseError(String key, int code, int index) {
    return new REException(getLocalizedMessage(key), code, index);
  }

  /**
   * Checks if the regular expression matches the input in its entirety.
   *
   * @param input The input text.
   */
  public boolean isMatch(Object input) {
    return isMatch(input,0,0);
  }
  
  /**
   * Checks if the input string, starting from index, is an exact match of
   * this regular expression.
   *
   * @param input The input text.
   * @param index The offset index at which the search should be begin.
   */
  public boolean isMatch(Object input,int index) {
    return isMatch(input,index,0);
  }
  

  /**
   * Checks if the input, starting from index and using the specified
   * execution flags, is an exact match of this regular expression.
   *
   * @param input The input text.
   * @param index The offset index at which the search should be begin.
   * @param eflags The logical OR of any execution flags above.
   */
  public boolean isMatch(Object input,int index,int eflags) {
    return isMatchImpl(makeCharIndexed(input,index),index,eflags);
  }

  private boolean isMatchImpl(CharIndexed input, int index, int eflags) {
    if (firstToken == null)  // Trivial case
      return (input.charAt(0) == CharIndexed.OUT_OF_BOUNDS);
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
    
  /**
   * Returns the maximum number of subexpressions in this regular expression.
   * If the expression contains branches, the value returned will be the
   * maximum subexpressions in any of the branches.
   */
  public int getNumSubs() {
    return numSubs;
  }

  // Overrides REToken.setUncle
  void setUncle(REToken uncle) {
      if (lastToken != null) {
	  lastToken.setUncle(uncle);
      } else super.setUncle(uncle); // to deal with empty subexpressions
  }

  // Overrides REToken.chain

  boolean chain(REToken next) {
    super.chain(next);
    setUncle(next);
    return true;
  }

  /**
   * Returns the minimum number of characters that could possibly
   * constitute a match of this regular expression.
   */
  public int getMinimumLength() {
      return minimumLength;
  }

  /**
   * Returns an array of all matches found in the input.
   *
   * If the regular expression allows the empty string to match, it will
   * substitute matches at all positions except the end of the input.
   *
   * @param input The input text.
   * @return a non-null (but possibly zero-length) array of matches
   */
  public REMatch[] getAllMatches(Object input) {
    return getAllMatches(input,0,0);
  }

  /**
   * Returns an array of all matches found in the input,
   * beginning at the specified index position.
   *
   * If the regular expression allows the empty string to match, it will
   * substitute matches at all positions except the end of the input.
   *
   * @param input The input text.
   * @param index The offset index at which the search should be begin.
   * @return a non-null (but possibly zero-length) array of matches
   */
  public REMatch[] getAllMatches(Object input, int index) {
    return getAllMatches(input,index,0);
  }

  /**
   * Returns an array of all matches found in the input string,
   * beginning at the specified index position and using the specified
   * execution flags.
   *
   * If the regular expression allows the empty string to match, it will
   * substitute matches at all positions except the end of the input.
   *
   * @param input The input text.
   * @param index The offset index at which the search should be begin.
   * @param eflags The logical OR of any execution flags above.
   * @return a non-null (but possibly zero-length) array of matches
   */
  public REMatch[] getAllMatches(Object input, int index, int eflags) {
    return getAllMatchesImpl(makeCharIndexed(input,index),index,eflags);
  }

  // this has been changed since 1.03 to be non-overlapping matches
  private REMatch[] getAllMatchesImpl(CharIndexed input, int index, int eflags) {
    Vector all = new Vector();
    REMatch m = null;
    while ((m = getMatchImpl(input,index,eflags,null)) != null) {
      all.addElement(m);
      index = m.getEndIndex();
      if (m.end[0] == 0) {   // handle pathological case of zero-length match
	index++;
	input.move(1);
      } else {
	input.move(m.end[0]);
      }
      if (!input.isValid()) break;
    }
    REMatch[] mset = new REMatch[all.size()];
    all.copyInto(mset);
    return mset;
  }
  
    /* Implements abstract method REToken.match() */
    boolean match(CharIndexed input, REMatch mymatch) { 
	if (firstToken == null) return next(input, mymatch);

	// Note the start of this subexpression
	mymatch.start[subIndex] = mymatch.index;

	return firstToken.match(input, mymatch);
    }
  
  /**
   * Returns the first match found in the input.  If no match is found,
   * null is returned.
   *
   * @param input The input text.
   * @return An REMatch instance referencing the match, or null if none.
   */
  public REMatch getMatch(Object input) {
    return getMatch(input,0,0);
  }
  
  /**
   * Returns the first match found in the input, beginning
   * the search at the specified index.  If no match is found,
   * returns null.
   *
   * @param input The input text.
   * @param index The offset within the text to begin looking for a match.
   * @return An REMatch instance referencing the match, or null if none.
   */
  public REMatch getMatch(Object input, int index) {
    return getMatch(input,index,0);
  }
  
  /**
   * Returns the first match found in the input, beginning
   * the search at the specified index, and using the specified
   * execution flags.  If no match is found, returns null.
   *
   * @param input The input text.
   * @param index The offset index at which the search should be begin.
   * @param eflags The logical OR of any execution flags above.
   * @return An REMatch instance referencing the match, or null if none.
   */
  public REMatch getMatch(Object input, int index, int eflags) {
    return getMatch(input,index,eflags,null);
  }

  /**
   * Returns the first match found in the input, beginning the search
   * at the specified index, and using the specified execution flags.
   * If no match is found, returns null.  If a StringBuffer is
   * provided and is non-null, the contents of the input text from the
   * index to the beginning of the match (or to the end of the input,
   * if there is no match) are appended to the StringBuffer.
   *
   * @param input The input text.
   * @param index The offset index at which the search should be begin.
   * @param eflags The logical OR of any execution flags above.
   * @param buffer The StringBuffer to save pre-match text in.
   * @return An REMatch instance referencing the match, or null if none.  */
  public REMatch getMatch(Object input, int index, int eflags, StringBuffer buffer) {
    return getMatchImpl(makeCharIndexed(input,index),index,eflags,buffer);
  }

  REMatch getMatchImpl(CharIndexed input, int anchor, int eflags, StringBuffer buffer) {
      // Create a new REMatch to hold results
      REMatch mymatch = new REMatch(numSubs, anchor, eflags);
      do {
	  // Optimization: check if anchor + minimumLength > length
	  if (minimumLength == 0 || input.charAt(minimumLength-1) != CharIndexed.OUT_OF_BOUNDS) {
	      if (match(input, mymatch)) {
		  // Find longest match of them all to observe leftmost longest
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
	  // Append character to buffer if needed
	  if (buffer != null && input.charAt(0) != CharIndexed.OUT_OF_BOUNDS) {
	      buffer.append(input.charAt(0));
	  }
      } while (input.move(1));
      
      // Special handling at end of input for e.g. "$"
      if (minimumLength == 0) {
	  if (match(input, mymatch)) {
	      mymatch.finish(input);
	      return mymatch;
	  }
      }

      return null;
  }

  /**
   * Returns an REMatchEnumeration that can be used to iterate over the
   * matches found in the input text.
   *
   * @param input The input text.
   * @return A non-null REMatchEnumeration instance.
   */
  public REMatchEnumeration getMatchEnumeration(Object input) {
    return getMatchEnumeration(input,0,0);
  }


  /**
   * Returns an REMatchEnumeration that can be used to iterate over the
   * matches found in the input text.
   *
   * @param input The input text.
   * @param index The offset index at which the search should be begin.
   * @return A non-null REMatchEnumeration instance, with its input cursor
   *  set to the index position specified.
   */
  public REMatchEnumeration getMatchEnumeration(Object input, int index) {
    return getMatchEnumeration(input,index,0);
  }

  /**
   * Returns an REMatchEnumeration that can be used to iterate over the
   * matches found in the input text.
   *
   * @param input The input text.
   * @param index The offset index at which the search should be begin.
   * @param eflags The logical OR of any execution flags above.
   * @return A non-null REMatchEnumeration instance, with its input cursor
   *  set to the index position specified.
   */
  public REMatchEnumeration getMatchEnumeration(Object input, int index, int eflags) {
    return new REMatchEnumeration(this,makeCharIndexed(input,index),index,eflags);
  }


  /**
   * Substitutes the replacement text for the first match found in the input.
   *
   * @param input The input text.
   * @param replace The replacement text, which may contain $x metacharacters (see REMatch.substituteInto).
   * @return A String interpolating the substituted text.
   * @see REMatch#substituteInto
   */
  public String substitute(Object input,String replace) {
    return substitute(input,replace,0,0);
  }

  /**
   * Substitutes the replacement text for the first match found in the input
   * beginning at the specified index position.  Specifying an index
   * effectively causes the regular expression engine to throw away the
   * specified number of characters. 
   *
   * @param input The input text.
   * @param replace The replacement text, which may contain $x metacharacters (see REMatch.substituteInto).
   * @param index The offset index at which the search should be begin.
   * @return A String containing the substring of the input, starting
   *   at the index position, and interpolating the substituted text.
   * @see REMatch#substituteInto
   */
  public String substitute(Object input,String replace,int index) {
    return substitute(input,replace,index,0);
  }

  /**
   * Substitutes the replacement text for the first match found in the input
   * string, beginning at the specified index position and using the
   * specified execution flags.
   *
   * @param input The input text.
   * @param replace The replacement text, which may contain $x metacharacters (see REMatch.substituteInto).
   * @param index The offset index at which the search should be begin.
   * @param eflags The logical OR of any execution flags above.
   * @return A String containing the substring of the input, starting
   *   at the index position, and interpolating the substituted text.
   * @see REMatch#substituteInto
   */
  public String substitute(Object input,String replace,int index,int eflags) {
    return substituteImpl(makeCharIndexed(input,index),replace,index,eflags);
  }

  private String substituteImpl(CharIndexed input,String replace,int index,int eflags) {
    StringBuffer buffer = new StringBuffer();
    REMatch m = getMatchImpl(input,index,eflags,buffer);
    if (m==null) return buffer.toString();
    buffer.append(getReplacement(replace, m, eflags));
    if (input.move(m.end[0])) {
      do {
	buffer.append(input.charAt(0));
      } while (input.move(1));
    }
    return buffer.toString();
  }

  /** Returns the replacement text, interpolating when permitted. */
  private String getReplacement(String replace, REMatch m, int eflags) {
    if ((eflags & REG_NO_INTERPOLATE) > 0) {
      return replace;
    }
    return m.substituteInto(replace);
  }
  
  /**
   * Substitutes the replacement text for each non-overlapping match found 
   * in the input text.
   *
   * @param input The input text.
   * @param replace The replacement text, which may contain $x metacharacters (see REMatch.substituteInto).
   * @return A String interpolating the substituted text.
   * @see REMatch#substituteInto
   */
  public String substituteAll(Object input,String replace) {
    return substituteAll(input,replace,0,0);
  }

  /**
   * Substitutes the replacement text for each non-overlapping match found 
   * in the input text, starting at the specified index.
   *
   * If the regular expression allows the empty string to match, it will
   * substitute matches at all positions except the end of the input.
   *
   * @param input The input text.
   * @param replace The replacement text, which may contain $x metacharacters (see REMatch.substituteInto).
   * @param index The offset index at which the search should be begin.
   * @return A String containing the substring of the input, starting
   *   at the index position, and interpolating the substituted text.
   * @see REMatch#substituteInto
   */
  public String substituteAll(Object input,String replace,int index) {
    return substituteAll(input,replace,index,0);
  }
 
  /**
   * Substitutes the replacement text for each non-overlapping match found 
   * in the input text, starting at the specified index and using the
   * specified execution flags.
   *
   * @param input The input text.
   * @param replace The replacement text, which may contain $x metacharacters (see REMatch.substituteInto).
   * @param index The offset index at which the search should be begin.
   * @param eflags The logical OR of any execution flags above.
   * @return A String containing the substring of the input, starting
   *   at the index position, and interpolating the substituted text.
   * @see REMatch#substituteInto
   */
  public String substituteAll(Object input,String replace,int index,int eflags) {
    return substituteAllImpl(makeCharIndexed(input,index),replace,index,eflags);
  }

  private String substituteAllImpl(CharIndexed input,String replace,int index,int eflags) {
    StringBuffer buffer = new StringBuffer();
    REMatch m;
    while ((m = getMatchImpl(input,index,eflags,buffer)) != null) {
	buffer.append(getReplacement(replace, m, eflags));
      index = m.getEndIndex();
      if (m.end[0] == 0) {
	char ch = input.charAt(0);
	if (ch != CharIndexed.OUT_OF_BOUNDS) 
	    buffer.append(ch);
	input.move(1);
      } else {
	  input.move(m.end[0]);
      }

      if (!input.isValid()) break;
    }
    return buffer.toString();
  }
  
  /* Helper function for constructor */
  private void addToken(REToken next) {
    if (next == null) return;
    minimumLength += next.getMinimumLength();
    if (firstToken == null) {
	lastToken = firstToken = next;
    } else {
      // if chain returns false, it "rejected" the token due to
      // an optimization, and next was combined with lastToken
      if (lastToken.chain(next)) {
	  lastToken = next;
      }
    }
  }

  private static REToken setRepeated(REToken current, int min, int max, int index) throws REException {
    if (current == null) throw new REException(getLocalizedMessage("repeat.no.token"),REException.REG_BADRPT,index);
    return new RETokenRepeated(current.subIndex,current,min,max);
  }

  private static int getPosixSet(char[] pattern,int index,StringBuffer buf) {
    // Precondition: pattern[index-1] == ':'
    // we will return pos of closing ']'.
    int i;
    for (i=index; i<(pattern.length-1); i++) {
      if ((pattern[i] == ':') && (pattern[i+1] == ']'))
	return i+2;
      buf.append(pattern[i]);
    }
    return index; // didn't match up
  }

  private int getMinMax(char[] input,int index,IntPair minMax,RESyntax syntax) throws REException {
    boolean mustMatch = !syntax.get(RESyntax.RE_NO_BK_BRACES);
    int startIndex = index;

    if (index == input.length) {
      return intervalErrorOrReturn(mustMatch, startIndex, "unmatched.brace", REException.REG_EBRACE, index);
    }

    CharUnit unit = new CharUnit();
    StringBuffer buf = new StringBuffer();
    index = readDigits(input, index, unit, buf);

    if (buf.length() == 0) {
      return intervalErrorOrReturn(mustMatch, startIndex, "interval.error", REException.REG_EBRACE, index);
    }

    int min = Integer.parseInt(buf.toString());

    if (isIntervalEnd(unit, syntax)) {
      minMax.first = min;
      minMax.second = min;
      return index;
    }

    if (index == input.length) {
      return intervalErrorOrReturn(mustMatch, startIndex, "interval.no.end", REException.REG_EBRACE, index);
    }

    if (isIntervalComma(unit)) {
      buf = new StringBuffer();
      index = readDigits(input, index, unit, buf);

      if (!isIntervalEnd(unit, syntax)) {
        return intervalErrorOrReturn(mustMatch, startIndex, "interval.error", REException.REG_EBRACE, index);
      }

      int max;
      if (buf.length() == 0) {
        max = Integer.MAX_VALUE;
      } else {
        max = Integer.parseInt(buf.toString());
      }

      minMax.first = min;
      minMax.second = max;
      return index;
    }

    return intervalErrorOrReturn(mustMatch, startIndex, "interval.error", REException.REG_EBRACE, index);
  }

  /** Reads a sequence of decimal digits and returns the updated index. */
  private int readDigits(char[] input, int index, CharUnit unit, StringBuffer buf) throws REException {
    do {
      index = getCharUnit(input, index, unit);
      if (Character.isDigit(unit.ch)) {
        buf.append(unit.ch);
      }
    } while ((index != input.length) && Character.isDigit(unit.ch));
    return index;
  }

  /** Returns true when the unit marks the end of an interval expression. */
  private boolean isIntervalEnd(CharUnit unit, RESyntax syntax) {
    return (unit.ch == '}') && (syntax.get(RESyntax.RE_NO_BK_BRACES) ^ unit.bk);
  }

  /** Returns true when the unit is the comma separating interval bounds. */
  private boolean isIntervalComma(CharUnit unit) {
    return (unit.ch == ',') && !unit.bk;
  }

  /** Throws an interval error when matching is required, otherwise returns the start index. */
  private int intervalErrorOrReturn(boolean mustMatch, int startIndex, String key, int code, int index) throws REException {
    if (mustMatch) {
      throw parseError(key, code, index);
    }
    return startIndex;
  }

   /**
    * Return a human readable form of the compiled regular expression,
    * useful for debugging.
    */
   public String toString() {
     StringBuffer sb = new StringBuffer();
     dump(sb);
     return sb.toString();
   }

  void dump(StringBuffer os) {
    os.append('(');
    if (subIndex == 0)
      os.append("?:");
    if (firstToken != null)
      firstToken.dumpAll(os);
    os.append(')');
  }

  // Cast input appropriately or throw exception
  private static CharIndexed makeCharIndexed(Object input, int index) {
      // We could let a String fall through to final input, but since
      // it's the most likely input type, we check it first.
    if (input instanceof String)
      return new CharIndexedString((String) input,index);
    else if (input instanceof char[])
      return new CharIndexedCharArray((char[]) input,index);
    else if (input instanceof StringBuffer)
      return new CharIndexedStringBuffer((StringBuffer) input,index);
    else if (input instanceof InputStream)
      return new CharIndexedInputStream((InputStream) input,index);
    else if (input instanceof Reader)
	return new CharIndexedReader((Reader) input, index);
    else if (input instanceof CharIndexed)
	return (CharIndexed) input; // do we lose index info?
    else 
	return new CharIndexedString(input.toString(), index);
  }
}