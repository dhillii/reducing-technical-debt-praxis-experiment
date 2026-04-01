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

    /** @returns {boolean} True if character is valid identifier start */
    const isIdentifierStart = function (c) {
        return (c === '_' || c === '$') ||
                (c >= 'a' && c <= 'z') ||
                (c >= 'A' && c <= 'Z');
    };

    /** @returns {boolean} True if character is valid identifier continuation */
    const isIdentifierChar = function (c) {
        return c === '_' || c === '$' ||
                (c >= 'a' && c <= 'z') ||
                (c >= 'A' && c <= 'Z') ||
                (c >= '0' && c <= '9');
    };

    const identifier = function () {
// Parse an identifier. Normally, reserved words are disallowed here, but we
// only use this for unquoted object keys, where reserved words are allowed,
// so we don't check for those here. References:
// - http://es5.github.com/#x7.6
// - https://developer.mozilla.org/en/Core_JavaScript_1.5_Guide/Core_Language_Features#Variables
// - http://docstore.mik.ua/orelly/webprog/jscript/ch02_07.htm

        if (!isIdentifierStart(ch)) {
            error("Bad identifier");
        }

        let key = ch;

        // Subsequent characters can contain digits.
        while (next() && isIdentifierChar(ch)) {
            key += ch;
        }

        return key;
    };

    /** @returns {boolean} True if character is decimal digit */
    const isDecimalDigit = function (c) {
        return c >= '0' && c <= '9';
    };

    /** @returns {boolean} True if character is hexadecimal digit */
    const isHexDigit = function (c) {
        return isDecimalDigit(c) ||
                (c >= 'A' && c <= 'F') ||
                (c >= 'a' && c <= 'f');
    };

    /** @returns {boolean} True if current character starts a sign */
    const isSign = function (c) {
        return c === '-' || c === '+';
    };

    const parseInfinity = function () {
        const num = word();
        if (typeof num !== 'number' || isNaN(num)) {
            error('Unexpected word for number');
        }
        return (ch === '-') ? -num : num;
    };

    const parseNaN = function () {
        const num = word();
        if (!isNaN(num)) {
            error('expected word to be NaN');
        }
        return num;
    };

    const parseHexNumber = function (sign, string) {
        let hexString = string;
        next();
        hexString += ch;
        next();
        while (isHexDigit(ch)) {
            hexString += ch;
            next();
        }
        const num = parseInt(hexString, 16);
        return (sign === '-') ? -num : num;
    };

    const parseDecimalNumber = function (sign, string) {
        let decString = string;
        while (isDecimalDigit(ch)) {
            decString += ch;
            next();
        }

        if (ch === '.') {
            decString += '.';
            while (next() && isDecimalDigit(ch)) {
                decString += ch;
            }
        }

        if (ch === 'e' || ch === 'E') {
            decString += ch;
            next();
            if (isSign(ch)) {
                decString += ch;
                next();
            }
            while (isDecimalDigit(ch)) {
                decString += ch;
                next();
            }
        }

        let num = +decString;
        if (!isFinite(num)) {
            error("Bad number");
        }
        return (sign === '-') ? -num : num;
    };

    const number = function () {
// Parse a number value.
        let sign = '';
        if (isSign(ch)) {
            sign = ch;
            next(ch);
        }

        // support for Infinity
        if (ch === 'I') {
            return parseInfinity();
        }

        // support for NaN
        if (ch === 'N') {
            return parseNaN();
        }

        let string = '';
        if (ch === '0') {
            string += ch;
            next();
            if (ch === 'x' || ch === 'X') {
                return parseHexNumber(sign, string);
            }
            if (isDecimalDigit(ch)) {
                error('Octal literal');
            }
        }

        return parseDecimalNumber(sign, string);
    };

    /** @returns {boolean} True if character is string delimiter */
    const isStringDelimiter = function (c) {
        return c === '"' || c === "'";
    };

    const parseUnicodeEscape = function () {
        let uffff = 0;
        for (let i = 0; i < 4; i += 1) {
            const hex = parseInt(next(), 16);
            if (!isFinite(hex)) {
                break;
            }
            uffff = uffff * 16 + hex;
        }
        return String.fromCharCode(uffff);
    };

    const handleStringEscape = function (str) {
        if (ch === 'u') {
            return str + parseUnicodeEscape();
        }
        if (ch === '\r') {
            if (peek() === '\n') {
                next();
            }
            return str;
        }
        if (typeof escapee[ch] === 'string') {
            return str + escapee[ch];
        }
        return null;
    };

    const string = function () {
// Parse a string value.
        if (!isStringDelimiter(ch)) {
            error("Bad string");
        }

        const delim = ch;
        let str = '';

        while (next()) {
            if (ch === delim) {
                next();
                return str;
            }
            if (ch === '\\') {
                next();
                const escaped = handleStringEscape(str);
                if (escaped === null) {
                    error("Bad string");
                }
                str = escaped;
                continue;
            }
            if (ch === '\n') {
                error("Bad string");
            }
            str += ch;
        }

        error("Bad string");
    };

    const inlineComment = function () {
// Skip an inline comment, assuming this is one. The current character should
// be the second / character in the // pair that begins this inline comment.
// To finish the inline comment, we look for a newline or the end of the text.

        if (ch !== '/') {
            error("Not an inline comment");
        }

        while (ch) {
            next();
            if (ch === '\n' || ch === '\r') {
                next();
                return;
            }
        }
    };

    const blockComment = function () {
// Skip a block comment, assuming this is one. The current character should be
// the * character in the /* pair that begins this block comment.
// To finish the block comment, we look for an ending */ pair of characters,
// but we also watch for the end of text before the comment is terminated.

        if (ch !== '*') {
            error("Not a block comment");
        }

        while (ch) {
            next();
            while (ch === '*') {
                next('*');
                if (ch === '/') {
                    next('/');
                    return;
                }
            }
        }

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

    /** @returns {boolean} True if character is whitespace */
    const isWhitespace = function (c) {
        return ws.indexOf(c) >= 0;
    };

    const white = function () {
// Skip whitespace and comments.
// Note that we're detecting comments by only a single / character.
// This works since regular expressions are not valid JSON(5), but this will
// break if there are other valid values that begin with a / character!

        while (ch) {
            if (ch === '/') {
                comment();
            } else if (isWhitespace(ch)) {
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

    const array = function () {
// Parse an array value.

        if (ch !== '[') {
            error("Bad array");
        }

        const arr = [];
        next('[');
        white();

        while (ch) {
            if (ch === ']') {
                next(']');
                return arr;
            }
            if (ch === ',') {
                error("Missing array element");
            }
            arr.push(value());
            white();
            if (ch !== ',') {
                next(']');
                return arr;
            }
            next(',');
            white();
        }

        error("Bad array");
    };

    const object = function () {
// Parse an object value.

        if (ch !== '{') {
            error("Bad object");
        }

        const obj = {};
        next('{');
        white();

        while (ch) {
            if (ch === '}') {
                next('}');
                return obj;
            }

            let key;
            if (isStringDelimiter(ch)) {
                key = string();
            } else {
                key = identifier();
            }

            white();
            next(':');
            obj[key] = value();
            white();
            if (ch !== ',') {
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
            return isDecimalDigit(ch) ? number() : word();
        }
    };

// Return the json_parse function. It will have access to all of the above
// functions and variables.

    return function (source, reviver) {
        text = String(source);
        at = 0;
        ch = ' ';
        const result = value();
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
            const val = holder[key];
            if (val && typeof val === 'object') {
                for (const k in val) {
                    if (Object.prototype.hasOwnProperty.call(val, k)) {
                        const v = walk(val, k);
                        if (v !== undefined) {
                            val[k] = v;
                        } else {
                            delete val[k];
                        }
                    }
                }
            }
            return reviver.call(holder, key, val);
        };

        return walk({'': result}, '');
    };
}());

// JSON5 stringify will not quote keys where appropriate
JSON5.stringify = function (obj, replacer, space) {
    if (replacer && (typeof(replacer) !== "function" && !isArray(replacer))) {
        throw new Error('Replacer must be a function or an array');
    }

    const getReplacedValueOrUndefined = function(holder, key, isTopLevel) {
        let value = holder[key];

        // Replace the value with its toJSON value first, if possible
        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        // If the user-supplied replacer if a function, call it. If it's an array, check objects' string keys for
        // presence in the array (removing the key/value pair from the resulting JSON if the key is missing).
        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        }
        if (replac