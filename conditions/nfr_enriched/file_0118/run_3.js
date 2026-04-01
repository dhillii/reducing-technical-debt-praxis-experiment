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

    // Parse an identifier (unquoted object key)
    const identifier = function () {
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

    // Check if character is a decimal digit
    const isDecimalDigit = function (c) {
        return c >= '0' && c <= '9';
    };

    // Check if character is a hexadecimal digit
    const isHexDigit = function (c) {
        return isDecimalDigit(c) || 
               (c >= 'A' && c <= 'F') || 
               (c >= 'a' && c <= 'f');
    };

    // Check if character is a letter
    const isLetter = function (c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
    };

    // Parse sign character for numbers
    const parseNumberSign = function () {
        let sign = '';
        if (ch === '-' || ch === '+') {
            sign = ch;
            next(ch);
        }
        return sign;
    };

    // Parse special number values (Infinity, NaN)
    const parseSpecialNumber = function (sign) {
        if (ch === 'I') {
            const num = word();
            if (typeof num !== 'number' || isNaN(num)) {
                error('Unexpected word for number');
            }
            return (sign === '-') ? -num : num;
        }

        if (ch === 'N') {
            const num = word();
            if (!isNaN(num)) {
                error('expected word to be NaN');
            }
            return num;
        }

        return null;
    };

    // Parse hexadecimal number
    const parseHexNumber = function () {
        let hexString = '';
        while (isHexDigit(ch)) {
            hexString += ch;
            next();
        }
        return parseInt(hexString, 16);
    };

    // Parse decimal number (base 10)
    const parseDecimalNumber = function () {
        let numString = '';

        // Parse integer part
        while (isDecimalDigit(ch)) {
            numString += ch;
            next();
        }

        // Parse decimal part
        if (ch === '.') {
            numString += '.';
            while (next() && isDecimalDigit(ch)) {
                numString += ch;
            }
        }

        // Parse exponent part
        if (ch === 'e' || ch === 'E') {
            numString += ch;
            next();
            if (ch === '-' || ch === '+') {
                numString += ch;
                next();
            }
            while (isDecimalDigit(ch)) {
                numString += ch;
                next();
            }
        }

        return numString;
    };

    // Parse a number value
    const number = function () {
        const sign = parseNumberSign();

        // Check for special number values
        const specialNum = parseSpecialNumber(sign);
        if (specialNum !== null) {
            return specialNum;
        }

        let numString = '';
        let base = 10;

        // Handle leading zero (hex or octal check)
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

        // Parse based on detected base
        if (base === 16) {
            numString += parseHexNumber();
        } else {
            numString += parseDecimalNumber();
        }

        // Convert to number
        let result = sign === '-' ? -numString : +numString;

        if (!isFinite(result)) {
            error("Bad number");
        }

        return result;
    };

    // Parse unicode escape sequence in string
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
    const handleStringEscape = function (str) {
        if (ch === 'u') {
            return str + parseUnicodeEscape();
        } else if (ch === '\r') {
            if (peek() === '\n') {
                next();
            }
            return str;
        } else if (typeof escapee[ch] === 'string') {
            return str + escapee[ch];
        }
        return null;
    };

    // Parse a string value
    const string = function () {
        let result = '';
        const delim = ch;

        if (ch === '"' || ch === "'") {
            while (next()) {
                if (ch === delim) {
                    next();
                    return result;
                } else if (ch === '\\') {
                    next();
                    const escaped = handleStringEscape(result);
                    if (escaped === null) {
                        break;
                    }
                    result = escaped;
                } else if (ch === '\n') {
                    break;
                } else {
                    result += ch;
                }
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

    // Parse boolean, null, Infinity, or NaN keywords
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

        if (ch === '[') {
            next('[');
            white();
            while (ch) {
                if (ch === ']') {
                    next(']');
                    return result;
                }
                if (ch === ',') {
                    error("Missing array element");
                } else {
                    result.push(value());
                }
                white();
                if (ch !== ',') {
                    next(']');
                    return result;
                }
                next(',');
                white();
            }
        }
        error("Bad array");
    };

    // Parse object key (quoted or unquoted)
    const parseObjectKey = function () {
        if (ch === '"' || ch === "'") {
            return string();
        } else {
            return identifier();
        }
    };

    // Parse an object value
    const object = function () {
        const result = {};

        if (ch === '{') {
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
        }
        error("Bad object");
    };

    // Parse a JSON value (object, array, string, number, or keyword)
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
            return isDecimalDigit(ch) ? number() : word();
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

    // Check if value is a character that can start an identifier
    const isWordStart = function (char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            char === '_' || char === '$';
    };

    // Check if value is a character that can be in an identifier
    const isWordChar = function (char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            (char >= '0' && char <= '9') ||
            char === '_' || char === '$';
    };

    // Check if string is a valid unquoted identifier
    const isWord = function (key) {
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
    };

    // export for use in tests
    JSON5.isWord = isWord;

    // Check if value is an array
    const isArray = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    // Check if value is a Date object
    const isDate = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    // Polyfill for isNaN if needed
    const checkIsNaN = isNaN || function(val) {
        return typeof val === 'number' && val !== val;
    };

    // Track object stack for circular reference detection
    const objStack = [];

    // Check for circular references
    const checkForCircular = function (obj) {
        for (let i = 0; i < objStack.length; i++) {
            if (objStack[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    // Create indentation string
    const makeIndent = function (str, num, noNewLine) {
        if (!str) {
            return "";
        }
        // indentation no more than 10 chars
        let indentStr = str.length > 10 ? str.substring(0, 10) : str;
        let indent = noNewLine ? "" : "\n";
        for (let i = 0; i < num; i++) {
            indent += indentStr;
        }
        return indent;
    };

    // Determine indentation string from space parameter
    let indentStr;
    if (space) {
        if (typeof space === "string") {
            indentStr = space;
        } else if (typeof space === "number" && space >= 0) {
            indentStr = makeIndent(" ", space, true);
        }
    }

    // Regular expressions for string escaping (from Crockford's implementation)
    const cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    const escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    const meta = {
        '\b': '\\b',
        '\t': '\\t',
        '\n': '\\n',
        '\f': '\\f',
        '\r': '\\r',
        '"' : '\\"',
        '\\': '\\\\'
    };

    // Escape special characters in strings
    const escapeString = function (str) {
        escapable.lastIndex = 0;
        return escapable.test(str) ? '"' + str.replace(escapable, function (a) {
            const c = meta[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + str + '"';
    };

    // Get replaced value using replacer function or array
    const getReplacedValueOrUndefined = function(holder, key, isTopLevel) {
        let value = holder[key];

        // Replace the value with its toJSON value first, if possible
        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        // If the user-supplied replacer is a function, call it
        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            // If replacer is an array, check if key is in array
            if (isTopLevel || isArray(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    // Stringify an array value
    const stringifyArray = function (arr, isTopLevel) {
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
    };

    // Stringify an object value
    const stringifyObject = function (obj, isTopLevel) {
        let buffer = "{";
        let nonEmpty = false;
        objStack.push(obj);

        for (const prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                const value = internalStringify(obj, prop, false);
                if (typeof value !== "undefined" && value !== null) {
                    buffer += makeIndent(indentStr, objStack.length);
                    nonEmpty = true;
                    const key = isWord(prop) ? prop : escapeString(prop);
                    buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                }
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

    // Internal stringify function - handles all value types
    const internalStringify = function (holder, key, isTopLevel) {
        // Replace the value, if necessary
        const obj_part = getReplacedValueOrUndefined(holder, key, isTopLevel);

        // Unbox objects (but not dates)
        let value = obj_part;
        if (value && !isDate(value)) {
            value = value.valueOf();
        }

        switch(typeof value) {
            case "boolean":
                return value.toString();

            case "number":
                if (checkIsNaN(value) || !isFinite(value)) {
                    return "null";
                }
                return value.toString();

            case "string":
                return escapeString(value.toString());

            case "object":
                if (value === null) {
                    return "null";
                } else if (isArray(value)) {
                    checkForCircular(value);
                    return stringifyArray(value, isTopLevel);
                } else {
                    checkForCircular(value);
                    return stringifyObject(value, isTopLevel);
                }

            default:
                // functions and undefined should be ignored
                return undefined;
        }
    };

    // Main stringify entry point
    const topLevelHolder = {"": obj};
    if (obj === undefined) {
        return getReplacedValueOrUndefined(topLevelHolder, '', true);
    }
    return internalStringify(topLevelHolder, '', true);
};
```