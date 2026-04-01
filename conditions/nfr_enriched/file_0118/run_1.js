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

    // Error handling: Call error when something is wrong.
    const error = function (m) {
        const syntaxError = new SyntaxError();
        syntaxError.message = m;
        syntaxError.at = at;
        syntaxError.text = text;
        throw syntaxError;
    };

    // Get the next character. When there are no more characters, return the empty string.
    const next = function (c) {
        if (c && c !== ch) {
            error("Expected '" + c + "' instead of '" + ch + "'");
        }
        ch = text.charAt(at);
        at += 1;
        return ch;
    };

    // Get the next character without consuming it or assigning it to the ch variable.
    const peek = function () {
        return text.charAt(at);
    };

    // Check if character is valid identifier start character
    const isIdentifierStart = function (c) {
        return (c === '_' || c === '$') ||
               (c >= 'a' && c <= 'z') ||
               (c >= 'A' && c <= 'Z');
    };

    // Check if character is valid identifier continuation character
    const isIdentifierChar = function (c) {
        return c === '_' || c === '$' ||
               (c >= 'a' && c <= 'z') ||
               (c >= 'A' && c <= 'Z') ||
               (c >= '0' && c <= '9');
    };

    // Parse an identifier. Unquoted object keys where reserved words are allowed.
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

    // Parse decimal number
    const parseDecimalNumber = function () {
        let numString = '';

        while (isDigit(ch)) {
            numString += ch;
            next();
        }

        if (ch === '.') {
            numString += '.';
            while (next() && isDigit(ch)) {
                numString += ch;
            }
        }

        if (ch === 'e' || ch === 'E') {
            numString += ch;
            next();
            if (ch === '-' || ch === '+') {
                numString += ch;
                next();
            }
            while (isDigit(ch)) {
                numString += ch;
                next();
            }
        }

        return numString;
    };

    // Parse a number value.
    const number = function () {
        const sign = parseNumberSign();

        const specialNum = parseSpecialNumber(sign);
        if (specialNum !== null) {
            return specialNum;
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
            } else if (isDigit(ch)) {
                error('Octal literal');
            }
        }

        if (base === 16) {
            numString += parseHexNumber();
        } else {
            numString += parseDecimalNumber();
        }

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

    // Parse a string value.
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

    // Skip an inline comment (// style)
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

    // Skip a block comment (/* */ style)
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

    // Parse true, false, null, Infinity, or NaN
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

    // Parse a JSON value (object, array, string, number, or word)
    const value = function () {
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

    // Apply reviver function to parsed structure
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

    // Check if value is an array
    const isArray = function (val) {
        if (Array.isArray) {
            return Array.isArray(val);
        }
        return Object.prototype.toString.call(val) === '[object Array]';
    };

    // Check if value is a Date
    const isDate = function (val) {
        return Object.prototype.toString.call(val) === '[object Date]';
    };

    // Check if character is valid word character
    const isWordChar = function (char) {
        return (char >= 'a' && char <= 'z') ||
               (char >= 'A' && char <= 'Z') ||
               (char >= '0' && char <= '9') ||
               char === '_' || char === '$';
    };

    // Check if character is valid word start character
    const isWordStart = function (char) {
        return (char >= 'a' && char <= 'z') ||
               (char >= 'A' && char <= 'Z') ||
               char === '_' || char === '$';
    };

    // Check if string is a valid identifier word
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

    // Export for use in tests
    JSON5.isWord = isWord;

    // Polyfill for isNaN
    const isNaNPolyfill = isNaN || function(val) {
        return typeof val === 'number' && val !== val;
    };

    // Track object stack for circular reference detection
    const objStack = [];

    // Check for circular references
    const checkForCircular = function (val) {
        for (let i = 0; i < objStack.length; i++) {
            if (objStack[i] === val) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    // Create indentation string
    const makeIndent = function (str, num, noNewLine) {
        if (!str) {
            return "";
        }
        let indentStr = str.length > 10 ? str.substring(0, 10) : str;
        let result = noNewLine ? "" : "\n";
        for (let i = 0; i < num; i++) {
            result += indentStr;
        }
        return result;
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

    // Escape string for JSON output
    const escapeString = function (str) {
        escapable.lastIndex = 0;
        return escapable.test(str) ? '"' + str.replace(escapable, function (a) {
            const c = meta[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + str + '"';
    };

    // Get replaced value or undefined based on replacer
    const getReplacedValueOrUndefined = function(holder, key, isTopLevel) {
        let val = holder[key];

        if (val && val.toJSON && typeof val.toJSON === "function") {
            val = val.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, val);
        } else if(replacer) {
            if (isTopLevel || isArray(holder) || replacer.indexOf(key) >= 0) {
                return val;
            }
            return undefined;
        }
        return val;
    };

    // Stringify array elements
    const stringifyArray = function (arr) {
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

    // Stringify object properties
    const stringifyObject = function (obj) {
        let buffer = "{";
        let nonEmpty = false;
        objStack.push(obj);

        for (const prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                const val = internalStringify(obj, prop, false);
                if (typeof val !== "undefined" && val !== null) {
                    buffer += makeIndent(indentStr, objStack.length);
                    nonEmpty = true;
                    const key = isWord(prop) ? prop : escapeString(prop);
                    buffer += key + ":" + (indentStr ? ' ' : '') + val + ",";
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

    // Internal stringify function
    const internalStringify = function (holder, key, isTopLevel) {
        const objPart = getReplacedValueOrUndefined(holder, key, isTopLevel);

        let val = objPart;
        if (val && !isDate(val)) {
            val = val.valueOf();
        }

        switch(typeof val) {
            case "boolean":
                return val.toString();

            case "number":
                if (isNaNPolyfill(val) || !isFinite(val)) {
                    return "null";
                }
                return val.toString();

            case "string":
                return escapeString(val.toString());

            case "object":
                if (val === null) {
                    return "null";
                } else if (isArray(val)) {
                    checkForCircular(val);
                    return stringifyArray(val);
                } else {
                    checkForCircular(val);
                    return stringifyObject(val);
                }

            default:
                return undefined;
        }
    };

    const topLevelHolder = {"": obj};
    if (obj === undefined) {
        return getReplacedValueOrUndefined(topLevelHolder, '', true);
    }
    return internalStringify(topLevelHolder, '', true);
};
```