```javascript
// json5.js
// Modern JSON. See README.md for details.
//
// This file is based directly off of Douglas Crockford's json_parse.js:
// https://github.com/douglascrockford/JSON-js/blob/master/json_parse.js

const JSON5 = (typeof exports === 'object' ? exports : {});

JSON5.parse = (function () {
    "use strict";

    // Parser state variables
    let at;     // The index of the current character
    let ch;     // The current character
    let text;   // The source text being parsed

    // Character escape mappings
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

    // Whitespace characters
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

    // Error handling - throws SyntaxError with context information
    const error = function (m) {
        const syntaxError = new SyntaxError();
        syntaxError.message = m;
        syntaxError.at = at;
        syntaxError.text = text;
        throw syntaxError;
    };

    // Advance to next character, optionally validating expected character
    const next = function (c) {
        if (c && c !== ch) {
            error("Expected '" + c + "' instead of '" + ch + "'");
        }
        ch = text.charAt(at);
        at += 1;
        return ch;
    };

    // Peek at next character without consuming it
    const peek = function () {
        return text.charAt(at);
    };

    // Check if character is valid identifier start
    const isIdentifierStart = function (c) {
        return (c === '_' || c === '$') ||
               (c >= 'a' && c <= 'z') ||
               (c >= 'A' && c <= 'Z');
    };

    // Check if character is valid identifier continuation
    const isIdentifierChar = function (c) {
        return (c === '_' || c === '$') ||
               (c >= 'a' && c <= 'z') ||
               (c >= 'A' && c <= 'Z') ||
               (c >= '0' && c <= '9');
    };

    // Parse an identifier (unquoted object key)
    const identifier = function () {
        let key = ch;

        if (!isIdentifierStart(ch)) {
            error("Bad identifier");
        }

        while (next() && isIdentifierChar(ch)) {
            key += ch;
        }

        return key;
    };

    // Check if character is a decimal digit
    const isDigit = function (c) {
        return c >= '0' && c <= '9';
    };

    // Check if character is a hexadecimal digit
    const isHexDigit = function (c) {
        return isDigit(c) ||
               (c >= 'A' && c <= 'F') ||
               (c >= 'a' && c <= 'f');
    };

    // Parse decimal number portion
    const parseDecimalNumber = function (sign, string) {
        while (isDigit(ch)) {
            string += ch;
            next();
        }

        if (ch === '.') {
            string += '.';
            while (next() && isDigit(ch)) {
                string += ch;
            }
        }

        if (ch === 'e' || ch === 'E') {
            string += ch;
            next();
            if (ch === '-' || ch === '+') {
                string += ch;
                next();
            }
            while (isDigit(ch)) {
                string += ch;
                next();
            }
        }

        const number = sign === '-' ? -string : +string;
        if (!isFinite(number)) {
            error("Bad number");
        }
        return number;
    };

    // Parse hexadecimal number portion
    const parseHexNumber = function (string) {
        while (isHexDigit(ch)) {
            string += ch;
            next();
        }
        return parseInt(string, 16);
    };

    // Parse a number value
    const number = function () {
        let sign = '';
        let string = '';
        let base = 10;

        if (ch === '-' || ch === '+') {
            sign = ch;
            next(ch);
        }

        // Support for Infinity
        if (ch === 'I') {
            const result = word();
            if (typeof result !== 'number' || isNaN(result)) {
                error('Unexpected word for number');
            }
            return (sign === '-') ? -result : result;
        }

        // Support for NaN
        if (ch === 'N') {
            const result = word();
            if (!isNaN(result)) {
                error('expected word to be NaN');
            }
            return result;
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
            return parseDecimalNumber(sign, string);
        } else {
            return parseHexNumber(string);
        }
    };

    // Parse unicode escape sequence
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

    // Handle escape sequence in string
    const handleStringEscape = function () {
        next();
        if (ch === 'u') {
            return parseUnicodeEscape();
        } else if (ch === '\r') {
            if (peek() === '\n') {
                next();
            }
            return '';
        } else if (typeof escapee[ch] === 'string') {
            return escapee[ch];
        }
        return null;
    };

    // Parse a string value
    const string = function () {
        let result = '';
        const delim = ch;

        if (ch !== '"' && ch !== "'") {
            error("Bad string");
        }

        while (next()) {
            if (ch === delim) {
                next();
                return result;
            } else if (ch === '\\') {
                const escaped = handleStringEscape();
                if (escaped === null) {
                    break;
                }
                result += escaped;
            } else if (ch === '\n') {
                break;
            } else {
                result += ch;
            }
        }
        error("Bad string");
    };

    // Skip inline comment (// style)
    const inlineComment = function () {
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

    // Skip block comment (/* */ style)
    const blockComment = function () {
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

    // Skip a comment (inline or block)
    const comment = function () {
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

    // Skip whitespace and comments
    const white = function () {
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

    // Parse boolean, null, Infinity, or NaN literals
    const word = function () {
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

    // Forward declaration for recursive value parsing
    let value;

    // Parse an array value
    const array = function () {
        const result = [];

        if (ch !== '[') {
            error("Bad array");
        }

        next('[');
        white();

        while (ch) {
            if (ch === ']') {
                next(']');
                return result;
            }

            if (ch === ',') {
                error("Missing array element");
            }

            result.push(value());
            white();

            if (ch !== ',') {
                next(']');
                return result;
            }

            next(',');
            white();
        }

        error("Bad array");
    };

    // Parse object key (quoted or unquoted)
    const parseObjectKey = function () {
        if (ch === '"' || ch === "'") {
            return string();
        }
        return identifier();
    };

    // Parse an object value
    const object = function () {
        const result = {};

        if (ch !== '{') {
            error("Bad object");
        }

        next('{');
        white();

        while (ch) {
            if (ch === '}') {
                next('}');
                return result;
            }

            const key = parseObjectKey();
            white();
            next(':');
            result[key] = value();
            white();

            if (ch !== ',') {
                next('}');
                return result;
            }

            next(',');
            white();
        }

        error("Bad object");
    };

    // Parse a JSON value (object, array, string, number, or word)
    value = function () {
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

    // Apply reviver function to transform parsed values
    const applyReviver = function (reviver, result) {
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

    // Return the main parse function
    return function (source, reviver) {
        text = String(source);
        at = 0;
        ch = ' ';
        const result = value();
        white();

        if (ch) {
            error("Syntax error");
        }

        return typeof reviver === 'function' ? applyReviver(reviver, result) : result;
    };
}());

// JSON5 stringify will not quote keys where appropriate
JSON5.stringify = function (obj, replacer, space) {
    if (replacer && (typeof(replacer) !== "function" && !isArray(replacer))) {
        throw new Error('Replacer must be a function or an array');
    }

    // Polyfill for Array.isArray
    function isArray(obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        }
        return Object.prototype.toString.call(obj) === '[object Array]';
    }

    // Check if object is a Date
    function isDate(obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    }

    // Check if character is valid identifier character
    function isWordChar(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            (char >= '0' && char <= '9') ||
            char === '_' || char === '$';
    }

    // Check if character is valid identifier start
    function isWordStart(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            char === '_' || char === '$';
    }

    // Check if string is a valid unquoted identifier
    function isWord(key) {
        if (typeof key !== 'string') {
            return false;
        }
        if (!isWordStart(key[0])) {
            return false;
        }
        for (let i = 1; i < key.length; i++) {
            if (!isWordChar(key[i])) {
                return false;
            }
        }
        return true;
    }

    // Export for use in tests
    JSON5.isWord = isWord;

    // Polyfill for isNaN
    const originalIsNaN = isNaN;
    const customIsNaN = function(val) {
        return typeof val === 'number' && val !== val;
    };
    const isNaNFunc = originalIsNaN || customIsNaN;

    // Track object stack for circular reference detection
    const objStack = [];

    // Check for circular references
    function checkForCircular(obj) {
        for (let i = 0; i < objStack.length; i++) {
            if (objStack[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    }

    // Create indentation string
    function makeIndent(str, num, noNewLine) {
        if (!str) {
            return "";
        }
        // Limit indentation to 10 characters
        const limitedStr = str.length > 10 ? str.substring(0, 10) : str;
        let indent = noNewLine ? "" : "\n";
        for (let i = 0; i < num; i++) {
            indent += limitedStr;
        }
        return indent;
    }

    // Determine indentation string from space parameter
    let indentStr;
    if (space) {
        if (typeof space === "string") {
            indentStr = space;
        } else if (typeof space === "number" && space >= 0) {
            indentStr = makeIndent(" ", space, true);
        }