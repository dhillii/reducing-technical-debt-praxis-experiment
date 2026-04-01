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

        const isValidIdentifierStart = (c) => {
            return c === '_' || c === '$' ||
                (c >= 'a' && c <= 'z') ||
                (c >= 'A' && c <= 'Z');
        };

        const isValidIdentifierChar = (c) => {
            return c === '_' || c === '$' ||
                (c >= 'a' && c <= 'z') ||
                (c >= 'A' && c <= 'Z') ||
                (c >= '0' && c <= '9');
        };

        if (!isValidIdentifierStart(ch)) {
            error("Bad identifier");
        }

        let key = ch;
        while (next() && isValidIdentifierChar(ch)) {
            key += ch;
        }

        return key;
    };

    /** @returns {number} Parsed number */
    const number = function () {
// Parse a number value.

        const isHexDigit = (c) => {
            return (c >= '0' && c <= '9') ||
                (c >= 'A' && c <= 'F') ||
                (c >= 'a' && c <= 'f');
        };

        const isDecimalDigit = (c) => {
            return c >= '0' && c <= '9';
        };

        const parseInfinity = () => {
            const num = word();
            if (typeof num !== 'number' || isNaN(num)) {
                error('Unexpected word for number');
            }
            return num;
        };

        const parseNaN = () => {
            const num = word();
            if (!isNaN(num)) {
                error('expected word to be NaN');
            }
            return num;
        };

        const parseHexNumber = () => {
            let hexString = '';
            while (isHexDigit(ch)) {
                hexString += ch;
                next();
            }
            return parseInt(hexString, 16);
        };

        const parseDecimalNumber = () => {
            let decString = '';
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
                if (ch === '-' || ch === '+') {
                    decString += ch;
                    next();
                }
                while (isDecimalDigit(ch)) {
                    decString += ch;
                    next();
                }
            }

            return decString;
        };

        let sign = '';
        if (ch === '-' || ch === '+') {
            sign = ch;
            next(ch);
        }

        if (ch === 'I') {
            return (sign === '-') ? -parseInfinity() : parseInfinity();
        }

        if (ch === 'N') {
            return parseNaN();
        }

        let numString = '';
        let base = 10;

        if (ch === '0') {
            numString += ch;
            next();
            if (ch === 'x' || ch === 'X') {
                numString += ch;
                next();
                base = 16;
            } else if (isDecimalDigit(ch)) {
                error('Octal literal');
            }
        }

        if (base === 16) {
            numString = parseHexNumber();
        } else {
            numString += parseDecimalNumber();
        }

        const result = sign === '-' ? -numString : +numString;

        if (!isFinite(result)) {
            error("Bad number");
        }

        return result;
    };

    /** @returns {string} Parsed string */
    const string = function () {
// Parse a string value.

        const isValidEscapeChar = (c) => {
            return typeof escapee[c] === 'string';
        };

        const parseUnicodeEscape = () => {
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

        const handleCarriageReturn = () => {
            if (peek() === '\n') {
                next();
            }
        };

        if (ch !== '"' && ch !== "'") {
            error("Bad string");
        }

        const delim = ch;
        let result = '';

        while (next()) {
            if (ch === delim) {
                next();
                return result;
            }

            if (ch === '\\') {
                next();
                if (ch === 'u') {
                    result += parseUnicodeEscape();
                } else if (ch === '\r') {
                    handleCarriageReturn();
                } else if (isValidEscapeChar(ch)) {
                    result += escapee[ch];
                } else {
                    break;
                }
                continue;
            }

            if (ch === '\n') {
                break;
            }

            result += ch;
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

    const array = function () {
// Parse an array value.

        if (ch !== '[') {
            error("Bad array");
        }

        const result = [];
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

    const object = function () {
// Parse an object value.

        if (ch !== '{') {
            error("Bad object");
        }

        const result = {};
        next('{');
        white();

        while (ch) {
            if (ch === '}') {
                next('}');
                return result;
            }

            let key;
            if (ch === '"' || ch === "'") {
                key = string();
            } else {
                key = identifier();
            }

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
            return (ch >= '0' && ch <= '9') ? number() : word();
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

        const walk = (holder, key) => {
            const val = holder[key];
            if (!val || typeof val !== 'object') {
                return reviver.call(holder, key, val);
            }

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

    /** @returns {*} Replaced value or undefined */
    const getReplacedValueOrUndefined = function(holder, key, isTopLevel) {
        let value = holder[key];

        // Replace the value with its toJSON value first, if possible
        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        }

        if (replacer) {
            if (isTopLevel || isArray(holder) || replacer.indexOf(key) >= 0) {
                return value;
            }
            return undefined;
        }

        return value;
    };

    /** @returns {boolean} True if character is valid in word */
    function isWordChar(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            (char >= '0' && char <= '9') ||
            char === '_' || char === '$';
    }

    /** @returns {boolean} True if character can start a word */
    function isWordStart(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            char === '_' || char === '$';
    }

    /** @returns {boolean} True if key is a valid unquoted word */
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

    // export for use in tests
    JSON5.isWord = isWord;

    // polyfills
    /** @returns {boolean} True if obj is an array */
    function isArray(obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        }
        return Object.prototype.toString.call(obj) === '[object Array]';
    }

    /** @returns {boolean} True if obj is a Date */
    function isDate(obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    }

    const originalIsNaN = isNaN;
    isNaN = isNaN || function(val) {
        return typeof val === 'number' && val !== val;
    };

    const objStack = [];

    /** Checks for circular references in object */
    function checkForCircular(obj) {
        for (let i = 0; i < objStack.length; i++) {
            if (objStack[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    }

    /** @returns {string} Indentation string */
    function makeIndent(str, num, noNewLine) {
        if (!str) {
            return "";
        }
        // indentation no more than 10 chars
        const limitedStr = str.length > 10 ? str.substring(0, 10) : str;
        let indent = noNewLine ? "" : "\n";
        for (let i = 0; i < num; i++) {
            indent += limitedStr;
        }
        return indent;
    }

    let indentStr;
    if (space) {
        if (typeof space === "string") {
            indentStr = space;
        } else if (typeof space === "number" && space >= 0) {
            indentStr = makeIndent(" ", space, true);
        }
    }

    // Copied from Crokford's implementation of JSON
    // See https://github.com/douglascrockford/JSON-js/blob/e39db4b7e6249f04a195e7dd0840e610cc9e941e/json2.js#L195
    // Begin
    const cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    const escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    const meta = { // table of character substitutions
        '\b': '\\b',
        '\t': '\\t',
        '\n': '\\n',
        '\f': '\\f',
        '\r': '\\r',
        '"' : '\\"',
        '\\': '\\\\'
    };

    /** @returns {string} Escaped string with quotes */
    function escapeString(string) {
// If the string contains no control characters, no quote characters, and no
// backslash characters, then we can safely slap some quotes around it.
// Otherwise we must also replace the offending characters with safe escape
// sequences.
        escapable.lastIndex = 0;
        if (!escapable.test(string)) {
            return '"' + string + '"';
        }

        return '"' + string.replace(escapable, function (a) {
            const c = meta[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"';
    }
    // End

    /** @returns {string|undefined} Stringified value */
    function internalStringify(holder, key, isTopLevel) {
        // Replace the value, if necessary
        let obj_part = getReplacedValueOrUndefined(holder, key, isTopLevel);

        if (obj_part && !isDate(obj_part)) {
            // unbox objects
            // don't unbox dates, since will turn it into number
            obj_part = obj_part.valueOf();
        }

        const objType = typeof obj_part;

        if (objType === "boolean") {
            return obj_part.toString();
        }

        if (objType === "number") {
            if (originalIsNaN(obj_part) || !isFinite(obj_part)) {
                return "null";
            }
            return obj_part.toString();
        }

        if (objType === "string") {
            return escapeString(obj_part.toString());
        }

        if (objType !== "object") {
            return undefined;
        }

        if (obj_part === null) {
            return "null";
        }

        if (isArray(obj_part)) {
            return stringifyArray(obj_part);
        }

        return stringifyObject(obj_part);
    }

    /** @returns {string} Stringified array */
    function stringifyArray(arr) {
        checkForCircular(arr);
        let buffer = "[";
        objStack.push(arr);

        for (let i = 0; i < arr.length; i++) {
            const res = internalStringify(arr, i, false);
            buffer += makeIndent(indentStr, objStack.length);
            if (res === null || typeof res === "undefined") {
                buffer += "null";
            } else {
                buffer += res;
            }
            if (i < arr.length - 1) {
                buffer += ",";
            } else if (indentStr) {
                buffer += "\n";
            }
        }

        objStack.pop();
        buffer += makeIndent(indentStr, objStack.length, true) + "]";
        return buffer;
    }

    /** @returns {string} Stringified object */
    function stringifyObject(obj) {
        checkForCircular(obj);
        let buffer = "{";
        let nonEmpty = false;
        objStack.push(obj);

        for (const prop in obj) {
            if (!obj.hasOwnProperty(prop)) {
                continue;
            }

            const value = internalStringify(obj, prop, false);
            if (typeof value === "undefined" || value === null) {
                continue;
            }

            buffer += makeIndent(indentStr, objStack.length);
            nonEmpty = true;
            const keyStr = isWord(prop) ? prop : escapeString(prop);
            buffer += keyStr + ":" + (indentStr ? ' ' : '') + value + ",";
        }

        objStack.pop();
        if (nonEmpty) {
            buffer = buffer.substring(0, buffer.length - 1) + makeIndent(indentStr, objStack.length) + "}";
        } else {
            buffer = '{}';
        }
        return buffer;
    }

    // special case...when undefined is used inside of
    // a compound object/array, return null.
    // but when top-level, return undefined
    const topLevelHolder = {"": obj};
    if (obj === undefined) {
        return getReplacedValueOrUndefined(topLevelHolder, '', true);
    }
    return internalStringify(topLevelHolder, '', true);
};
```