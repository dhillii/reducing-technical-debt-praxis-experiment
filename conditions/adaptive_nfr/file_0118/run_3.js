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
        const errorObj = new SyntaxError();
        errorObj.message = m;
        errorObj.at = at;
        errorObj.text = text;
        throw errorObj;
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

        let key = ch;

        // Identifiers must start with a letter, _ or $.
        if (!isIdentifierStart(ch)) {
            error("Bad identifier");
        }

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
        return (c >= '0' && c <= '9') ||
               (c >= 'A' && c <= 'F') ||
               (c >= 'a' && c <= 'f');
    };

    /** @returns {boolean} True if sign character */
    const isSign = function (c) {
        return c === '-' || c === '+';
    };

    /** @returns {boolean} True if exponent character */
    const isExponent = function (c) {
        return c === 'e' || c === 'E';
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

    const parseHexNumber = function (sign) {
        let string = '0';
        next();
        string += ch;
        next();
        while (ch && isHexDigit(ch)) {
            string += ch;
            next();
        }
        const number = parseInt(string, 16);
        return (sign === '-') ? -number : number;
    };

    const parseDecimalNumber = function (sign, string) {
        while (isDecimalDigit(ch)) {
            string += ch;
            next();
        }

        if (ch === '.') {
            string += '.';
            while (next() && isDecimalDigit(ch)) {
                string += ch;
            }
        }

        if (isExponent(ch)) {
            string += ch;
            next();
            if (isSign(ch)) {
                string += ch;
                next();
            }
            while (isDecimalDigit(ch)) {
                string += ch;
                next();
            }
        }

        const number = +string;
        if (!isFinite(number)) {
            error("Bad number");
        }
        return (sign === '-') ? -number : number;
    };

    const number = function () {
// Parse a number value.
        let sign = '';
        let string = '';

        if (isSign(ch)) {
            sign = ch;
            next(ch);
        }

        // support for Infinity (could tweak to allow other words):
        if (ch === 'I') {
            return parseInfinity();
        }

        // support for NaN
        if (ch === 'N') {
            return parseNaN();
        }

        if (ch === '0') {
            string += ch;
            next();
            if (ch === 'x' || ch === 'X') {
                return parseHexNumber(sign);
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

    /** @returns {boolean} True if character is line terminator */
    const isLineTerminator = function (c) {
        return c === '\n' || c === '\r';
    };

    /** @returns {boolean} True if character has escape sequence */
    const hasEscapeSequence = function (c) {
        return typeof escapee[c] === 'string';
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

    const handleStringEscape = function (string) {
        next();
        if (ch === 'u') {
            return string + parseUnicodeEscape();
        }
        if (ch === '\r') {
            if (peek() === '\n') {
                next();
            }
            return string;
        }
        if (hasEscapeSequence(ch)) {
            return string + escapee[ch];
        }
        return null;
    };

    const string = function () {
// Parse a string value.
        if (!isStringDelimiter(ch)) {
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
                const escaped = handleStringEscape(result);
                if (escaped === null) {
                    break;
                }
                result = escaped;
                continue;
            }
            if (isLineTerminator(ch)) {
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

        do {
            next();
            if (isLineTerminator(ch)) {
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

    const parseArrayElement = function (array) {
        if (ch === ',') {
            error("Missing array element");
        }
        array.push(value());
    };

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
            parseArrayElement(result);
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

    const parseObjectKey = function () {
        if (isStringDelimiter(ch)) {
            return string();
        }
        return identifier();
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
        if (replacer) {
            if (isTopLevel || isArray(holder) || replacer.indexOf(key) >= 0) {
                return value;
            }
            return undefined;
        }
        return value;
    };

    function isWordChar(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            (char >= '0' && char <= '9') ||
            char === '_' || char === '$';
    }

    function isWordStart(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            char === '_' || char === '$';
    }

    function isWord(key) {
        if (typeof key !== 'string') {
            return false;
        }
        if (!isWordStart(key[0])) {
            return false;
        }
        let i = 1;
        const length = key.length;
        while (i < length) {
            if (!isWordChar(key[i])) {
                return false;
            }
            i++;
        }
        return true;
    }

    // export for use in tests
    JSON5.isWord = isWord;

    // polyfills
    function isArray(obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        }
        return Object.prototype.toString.call(obj) === '[object Array]';
    }

    function isDate(obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    }

    let isNaNFunc = isNaN;
    if (!isNaNFunc) {
        isNaNFunc = function(val) {
            return typeof val === 'number' && val !== val;
        };
    }

    const objStack = [];

    function checkForCircular(obj) {
        for (let i = 0; i < objStack.length; i++) {
            if (objStack[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    }

    function makeIndent(str, num, noNewLine) {
        if (!str) {
            return "";
        }
        // indentation no more than 10 chars
        let indentStr = str;
        if (indentStr.length > 10) {
            indentStr = indentStr.substring(0, 10);
        }

        let indent = noNewLine ? "" : "\n";
        for (let i = 0; i < num; i++) {
            indent += indentStr;
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

    /** @returns {boolean} True if value should be serialized as null */
    const shouldSerializeAsNull = function (val) {
        return isNaNFunc(val) || !isFinite(val);
    };

    /** @returns {boolean} True if value is undefined or null */
    const isUndefinedOrNull = function (val) {
        return val === null || typeof val === "undefined";
    };

    const stringifyArrayElement = function (obj, i, buffer) {
        const res = internalStringify(obj, i, false);
        buffer += makeIndent(indentStr, objStack.length);
        if (isUndefinedOrNull(res)) {
            buffer += "null";
        } else {
            buffer += res;
        }
        if (i < obj.length - 1) {
            buffer += ",";
        } else if (indentStr) {
            buffer += "\n";
        }
        return buffer;
    };

    const stringifyArrayElements = function (obj) {
        let buffer = "[";
        objStack.push(obj);

        for (let i = 0; i < obj.length; i++) {
            buffer = stringifyArrayElement(obj, i, buffer);
        }

        objStack.pop();
        buffer += makeIndent(indentStr, objStack.length, true) + "]";
        return buffer;
    };

    const stringifyObjectProperty = function (obj, prop, buffer) {
        const value = internalStringify(obj, prop, false);
        if (isUndefinedOrNull(value)) {
            return { buffer: buffer, nonEmpty: false };
        }
        buffer += makeIndent(indentStr, objStack.length);
        const key = isWord(prop) ? prop : escapeString(prop);
        buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
        return { buffer: buffer, nonEmpty: true };
    };

    const stringifyObjectProperties = function (obj) {
        let buffer = "{";
        let nonEmpty = false;
        objStack.push(obj);

        for (const prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                const result = stringifyObjectProperty(obj, prop, buffer);
                buffer = result.buffer;
                nonEmpty = nonEmpty || result.nonEmpty;
            }
        }

        objStack.pop();
        if (nonEmpty) {
            buffer = buffer.substring(0, buffer.length - 1) + makeIndent(indentStr, objStack.length) + "}";
        } else {
            buffer = '{}';
        }
        return buffer;
    };

    function internalStringify(holder, key, isTopLevel) {
        // Replace the value, if necessary
        let obj_part = getReplacedValueOrUndefined(holder, key, isTopLevel);

        if (obj_part && !isDate(obj_part)) {
            // unbox objects
            // don't unbox dates, since will turn it into number
            obj_part = obj_part.valueOf();
        }

        const typeOf = typeof obj_part;

        if (typeOf === "boolean") {
            return obj_part.toString();
        }

        if (typeOf === "number") {
            if (shouldSerializeAsNull(obj_part)) {
                return "null";
            }
            return obj_part.toString();
        }

        if (typeOf === "string") {
            return escapeString(obj_part.toString());
        }

        if (typeOf === "object") {
            if (obj_part === null) {
                return "null";
            }
            if (isArray(obj_part)) {
                checkForCircular(obj_part);
                return stringifyArrayElements(obj_part);
            }
            checkForCircular(obj_part);
            return stringifyObjectProperties(obj_part);
        }

        // functions and undefined should be ignored
        return undefined;
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