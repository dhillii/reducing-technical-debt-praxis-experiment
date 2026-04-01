```javascript
// json5.js
// Modern JSON. See README.md for details.
//
// This file is based directly off of Douglas Crockford's json_parse.js:
// https://github.com/douglascrockford/JSON-js/blob/master/json_parse.js

const JSON5 = (typeof exports === 'object' ? exports : {});

JSON5.parse = (function () {
    "use strict";

// This is a function that can parse a JSON5 text, producing a JavaScript
// data structure. It is a simple, recursive descent parser. It does not use
// eval or regular expressions, so it can be used as a model for implementing
// a JSON5 parser in other languages.

// We are defining the function inside of another function to avoid creating
// global variables.

    let at;     // The index of the current character
    let ch;     // The current character
    const escapee = {
        "'":  "'",
        '"':  '"',
        '\\': '\\',
        '/':  '/',
        '\n': '',       // Replace escaped newlines in strings w/ empty string
        b:    '\b',
        f:    '\f',
        n:    '\n',
        r:    '\r',
        t:    '\t'
    };
    const ws = [
        ' ',
        '\t',
        '\r',
        '\n',
        '\v',
        '\f',
        '\xA0',
        '\uFEFF'
    ];
    let text;

    const error = function (m) {
// Call error when something is wrong.
        const err = new SyntaxError();
        err.message = m;
        err.at = at;
        err.text = text;
        throw err;
    };

    const next = function (c) {
// If a c parameter is provided, verify that it matches the current character.
        if (c && c !== ch) {
            error("Expected '" + c + "' instead of '" + ch + "'");
        }

// Get the next character. When there are no more characters,
// return the empty string.
        ch = text.charAt(at);
        at += 1;
        return ch;
    };

    const peek = function () {
// Get the next character without consuming it or
// assigning it to the ch varaible.
        return text.charAt(at);
    };

    /** @returns {string} Parsed identifier */
    const identifier = function () {
// Parse an identifier. Normally, reserved words are disallowed here, but we
// only use this for unquoted object keys, where reserved words are allowed,
// so we don't check for those here. References:
// - http://es5.github.com/#x7.6
// - https://developer.mozilla.org/en/Core_JavaScript_1.5_Guide/Core_Language_Features#Variables
// - http://docstore.mik.ua/orelly/webprog/jscript/ch02_07.htm

        let key = ch;

        // Identifiers must start with a letter, _ or $.
        if ((ch !== '_' && ch !== '$') &&
                (ch < 'a' || ch > 'z') &&
                (ch < 'A' || ch > 'Z')) {
            error("Bad identifier");
        }

        // Subsequent characters can contain digits.
        while (next() && (
                ch === '_' || ch === '$' ||
                (ch >= 'a' && ch <= 'z') ||
                (ch >= 'A' && ch <= 'Z') ||
                (ch >= '0' && ch <= '9'))) {
            key += ch;
        }

        return key;
    };

    /** @returns {boolean} True if character is a digit */
    const isDigit = function (c) {
        return c >= '0' && c <= '9';
    };

    /** @returns {boolean} True if character is a hex digit */
    const isHexDigit = function (c) {
        return isDigit(c) || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f');
    };

    /** @returns {boolean} True if character is a sign character */
    const isSign = function (c) {
        return c === '-' || c === '+';
    };

    /** @returns {number} Parsed number value */
    const number = function () {
// Parse a number value.
        let numValue;
        let sign = '';
        let string = '';
        let base = 10;

        if (isSign(ch)) {
            sign = ch;
            next(ch);
        }

        // support for Infinity (could tweak to allow other words):
        if (ch === 'I') {
            numValue = word();
            if (typeof numValue !== 'number' || isNaN(numValue)) {
                error('Unexpected word for number');
            }
            return (sign === '-') ? -numValue : numValue;
        }

        // support for NaN
        if (ch === 'N') {
            numValue = word();
            if (!isNaN(numValue)) {
                error('expected word to be NaN');
            }
            // ignore sign as -NaN also is NaN
            return numValue;
        }

        if (ch === '0') {
            string += ch;
            next();
            if (ch === 'x' || ch === 'X') {
                string += ch;
                next();
                base = 16;
            } else if (isDigit(ch)) {
                error('Octal literal');
            }
        }

        if (base === 10) {
            parseBase10Number(string);
        } else if (base === 16) {
            parseBase16Number(string);
        }

        numValue = sign === '-' ? -string : +string;

        if (!isFinite(numValue)) {
            error("Bad number");
        }
        return numValue;
    };

    /** @returns {void} Parses base 10 number digits into string */
    const parseBase10Number = function (str) {
        while (isDigit(ch)) {
            str += ch;
            next();
        }
        if (ch === '.') {
            str += '.';
            while (next() && isDigit(ch)) {
                str += ch;
            }
        }
        if (ch === 'e' || ch === 'E') {
            str += ch;
            next();
            if (isSign(ch)) {
                str += ch;
                next();
            }
            while (isDigit(ch)) {
                str += ch;
                next();
            }
        }
    };

    /** @returns {void} Parses base 16 number digits into string */
    const parseBase16Number = function (str) {
        while (isHexDigit(ch)) {
            str += ch;
            next();
        }
    };

    /** @returns {boolean} True if character is valid escape character */
    const isValidEscapeChar = function (c) {
        return typeof escapee[c] === 'string';
    };

    /** @returns {string} Parsed string value */
    const string = function () {
// Parse a string value.
        let hex;
        let i;
        let str = '';
        let delim;      // double quote or single quote
        let uffff;

// When parsing for string values, we must look for ' or " and \ characters.
        if (ch !== '"' && ch !== "'") {
            error("Bad string");
        }

        delim = ch;
        while (next()) {
            if (ch === delim) {
                next();
                return str;
            }
            if (ch === '\\') {
                next();
                if (ch === 'u') {
                    uffff = parseUnicodeEscape();
                    str += String.fromCharCode(uffff);
                } else if (ch === '\r') {
                    if (peek() === '\n') {
                        next();
                    }
                } else if (isValidEscapeChar(ch)) {
                    str += escapee[ch];
                } else {
                    break;
                }
            } else if (ch === '\n') {
                // unescaped newlines are invalid; see:
                // https://github.com/aseemk/json5/issues/24
                // invalid unescaped chars?
                break;
            } else {
                str += ch;
            }
        }
        error("Bad string");
    };

    /** @returns {number} Parsed unicode escape sequence */
    const parseUnicodeEscape = function () {
        let uffff = 0;
        for (let i = 0; i < 4; i += 1) {
            const hex = parseInt(next(), 16);
            if (!isFinite(hex)) {
                break;
            }
            uffff = uffff * 16 + hex;
        }
        return uffff;
    };

    const inlineComment = function () {
// Skip an inline comment, assuming this is one. The current character should
// be the second / character in the // pair that begins this inline comment.
// To finish the inline comment, we look for a newline or the end of the text.
        if (ch !== '/') {
            error("Not an inline comment");
        }

        do {
            next();
            if (ch === '\n' || ch === '\r') {
                next();
                return;
            }
        } while (ch);
    };

    const blockComment = function () {
// Skip a block comment, assuming this is one. The current character should be
// the * character in the /* pair that begins this block comment.
// To finish the block comment, we look for an ending */ pair of characters,
// but we also watch for the end of text before the comment is terminated.
        if (ch !== '*') {
            error("Not a block comment");
        }

        do {
            next();
            while (ch === '*') {
                next('*');
                if (ch === '/') {
                    next('/');
                    return;
                }
            }
        } while (ch);

        error("Unterminated block comment");
    };

    const comment = function () {
// Skip a comment, whether inline or block-level, assuming this is one.
// Comments always begin with a / character.
        if (ch !== '/') {
            error("Not a comment");
        }

        next('/');

        if (ch === '/') {
            inlineComment();
        } else if (ch === '*') {
            blockComment();
        } else {
            error("Unrecognized comment");
        }
    };

    const white = function () {
// Skip whitespace and comments.
// Note that we're detecting comments by only a single / character.
// This works since regular expressions are not valid JSON(5), but this will
// break if there are other valid values that begin with a / character!
        while (ch) {
            if (ch === '/') {
                comment();
            } else if (ws.indexOf(ch) >= 0) {
                next();
            } else {
                return;
            }
        }
    };

    const word = function () {
// true, false, or null.
        switch (ch) {
        case 't':
            next('t');
            next('r');
            next('u');
            next('e');
            return true;
        case 'f':
            next('f');
            next('a');
            next('l');
            next('s');
            next('e');
            return false;
        case 'n':
            next('n');
            next('u');
            next('l');
            next('l');
            return null;
        case 'I':
            next('I');
            next('n');
            next('f');
            next('i');
            next('n');
            next('i');
            next('t');
            next('y');
            return Infinity;
        case 'N':
            next('N');
            next('a');
            next('N');
            return NaN;
        }
        error("Unexpected '" + ch + "'");
    };

    let value;  // Place holder for the value function.

    /** @returns {boolean} True if at end of array */
    const isEndOfArray = function () {
        return ch === ']';
    };

    /** @returns {boolean} True if missing array element */
    const isMissingArrayElement = function () {
        return ch === ',';
    };

    /** @returns {boolean} True if array continues */
    const shouldContinueArray = function () {
        return ch === ',';
    };

    const array = function () {
// Parse an array value.
        const arr = [];

        if (ch !== '[') {
            error("Bad array");
        }

        next('[');
        white();

        while (ch) {
            if (isEndOfArray()) {
                next(']');
                return arr;   // Potentially empty array
            }
            // ES5 allows omitting elements in arrays, e.g. [,] and
            // [,null]. We don't allow this in JSON5.
            if (isMissingArrayElement()) {
                error("Missing array element");
            }
            arr.push(value());
            white();
            // If there's no comma after this value, this needs to
            // be the end of the array.
            if (!shouldContinueArray()) {
                next(']');
                return arr;
            }
            next(',');
            white();
        }
        error("Bad array");
    };

    /** @returns {boolean} True if at end of object */
    const isEndOfObject = function () {
        return ch === '}';
    };

    /** @returns {boolean} True if key is quoted */
    const isQuotedKey = function () {
        return ch === '"' || ch === "'";
    };

    /** @returns {boolean} True if object continues */
    const shouldContinueObject = function () {
        return ch === ',';
    };

    const object = function () {
// Parse an object value.
        let key;
        const obj = {};

        if (ch !== '{') {
            error("Bad object");
        }

        next('{');
        white();

        while (ch) {
            if (isEndOfObject()) {
                next('}');
                return obj;   // Potentially empty object
            }

            // Keys can be unquoted. If they are, they need to be
            // valid JS identifiers.
            if (isQuotedKey()) {
                key = string();
            } else {
                key = identifier();
            }

            white();
            next(':');
            obj[key] = value();
            white();
            // If there's no comma after this pair, this needs to be
            // the end of the object.
            if (!shouldContinueObject()) {
                next('}');
                return obj;
            }
            next(',');
            white();
        }
        error("Bad object");
    };

    value = function () {
// Parse a JSON value. It could be an object, an array, a string, a number,
// or a word.
        white();
        switch (ch) {
        case '{':
            return object();
        case '[':
            return array();
        case '"':
        case "'":
            return string();
        case '-':
        case '+':
        case '.':
            return number();
        default:
            return isDigit(ch) ? number() : word();
        }
    };

// Return the json_parse function. It will have access to all of the above
// functions and variables.
    return function (source, reviver) {
        let result;

        text = String(source);
        at = 0;
        ch = ' ';
        result = value();
        white();
        if (ch) {
            error("Syntax error");
        }

// If there is a reviver function, we recursively walk the new structure,
// passing each name/value pair to the reviver function for possible
// transformation, starting with a temporary root object that holds the result
// in an empty key. If there is not a reviver function, we simply return the
// result.
        if (typeof reviver !== 'function') {
            return result;
        }

        const walk = function (holder, key) {
            let k;
            let v;
            const val = holder[key];
            if (val && typeof val === 'object') {
                for (k in val) {
                    if (Object.prototype.has