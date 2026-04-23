```javascript
// json5.js
// Modern JSON. See README.md for details.
//
// This file is based directly off of Douglas Crockford's json_parse.js:
// https://github.com/douglascrockford/JSON-js/blob/master/json_parse.js

var JSON5 = (typeof exports === 'object' ? exports : {});

/**
 * Parse a JSON5 text into a JavaScript data structure.
 * @param {string|Object} source - The JSON5 text to parse
 * @param {Function} [reviver] - Optional reviver function for transformation
 * @returns {any} - The parsed JavaScript value
 */
JSON5.parse = (function () {
    "use strict";

    // Character escape mappings for string parsing
    const escapee = {
        "'": "'",
        '"': '"',
        '\\': '\\',
        '/': '/',
        '\n': '',
        b: '\b',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t'
    };

    // Whitespace characters for skipping
    const whitespaceChars = [
        ' ',
        '\t',
        '\r',
        '\n',
        '\v',
        '\f',
        '\xA0',
        '\uFEFF'
    ];

    /**
     * Create and throw a SyntaxError with context information.
     * @param {string} message - The error message
     * @throws {SyntaxError}
     */
    function createError(message) {
        const error = new SyntaxError(message);
        error.at = at;
        error.text = text;
        throw error;
    }

    /**
     * Advance the parser to the next character.
     * @param {string} [expected] - Optional expected character to validate
     * @returns {string} - The current character after advancement
     */
    function advance(expected) {
        if (expected && expected !== ch) {
            createError(`Expected '${expected}' instead of '${ch}'`);
        }
        ch = text.charAt(at);
        at += 1;
        return ch;
    }

    /**
     * Peek at the next character without consuming it.
     * @returns {string} - The next character
     */
    function peek() {
        return text.charAt(at);
    }

    /**
     * Parse an identifier (unquoted object key).
     * @returns {string} - The parsed identifier
     */
    function parseIdentifier() {
        let key = ch;

        if ((ch !== '_' && ch !== '$') &&
            (ch < 'a' || ch > 'z') &&
            (ch < 'A' || ch > 'Z')) {
            createError("Bad identifier");
        }

        while (advance() && (
            ch === '_' || ch === '$' ||
            (ch >= 'a' && ch <= 'z') ||
            (ch >= 'A' && ch <= 'Z') ||
            (ch >= '0' && ch <= '9'))) {
            key += ch;
        }

        return key;
    }

    /**
     * Parse a numeric value including special values like Infinity and NaN.
     * @returns {number} - The parsed number
     */
    function parseNumber() {
        let number;
        let sign = '';
        let string = '';
        let base = 10;

        if (ch === '-' || ch === '+') {
            sign = ch;
            advance(ch);
        }

        if (ch === 'I') {
            number = parseWord();
            if (typeof number !== 'number' || isNaN(number)) {
                createError('Unexpected word for number');
            }
            return (sign === '-') ? -number : number;
        }

        if (ch === 'N') {
            number = parseWord();
            if (!isNaN(number)) {
                createError('expected word to be NaN');
            }
            return number;
        }

        if (ch === '0') {
            string += ch;
            advance();
            if (ch === 'x' || ch === 'X') {
                string += ch;
                advance();
                base = 16;
            } else if (ch >= '0' && ch <= '9') {
                createError('Octal literal');
            }
        }

        switch (base) {
            case 10:
                while (ch >= '0' && ch <= '9') {
                    string += ch;
                    advance();
                }
                if (ch === '.') {
                    string += '.';
                    while (advance() && ch >= '0' && ch <= '9') {
                        string += ch;
                    }
                }
                if (ch === 'e' || ch === 'E') {
                    string += ch;
                    advance();
                    if (ch === '-' || ch === '+') {
                        string += ch;
                        advance();
                    }
                    while (ch >= '0' && ch <= '9') {
                        string += ch;
                        advance();
                    }
                }
                break;
            case 16:
                while (ch >= '0' && ch <= '9' || ch >= 'A' && ch <= 'F' || ch >= 'a' && ch <= 'f') {
                    string += ch;
                    advance();
                }
                break;
        }

        number = sign === '-' ? -string : +string;

        if (!isFinite(number)) {
            createError("Bad number");
        }

        return number;
    }

    /**
     * Parse a string value with proper escape handling.
     * @returns {string} - The parsed string
     */
    function parseString() {
        let hex;
        let i;
        let string = '';
        let delim;
        let uffff;

        if (ch === '"' || ch === "'") {
            delim = ch;
            while (advance()) {
                if (ch === delim) {
                    advance();
                    return string;
                } else if (ch === '\\') {
                    advance();
                    if (ch === 'u') {
                        uffff = 0;
                        for (i = 0; i < 4; i += 1) {
                            hex = parseInt(advance(), 16);
                            if (!isFinite(hex)) {
                                break;
                            }
                            uffff = uffff * 16 + hex;
                        }
                        string += String.fromCharCode(uffff);
                    } else if (ch === '\r') {
                        if (peek() === '\n') {
                            advance();
                        }
                    } else if (typeof escapee[ch] === 'string') {
                        string += escapee[ch];
                    } else {
                        break;
                    }
                } else if (ch === '\n') {
                    break;
                } else {
                    string += ch;
                }
            }
        }
        createError("Bad string");
    }

    /**
     * Parse a word value (true, false, null, Infinity, NaN).
     * @returns {boolean|number|null} - The parsed word value
     */
    function parseWord() {
        switch (ch) {
            case 't':
                advance('t');
                advance('r');
                advance('u');
                advance('e');
                return true;
            case 'f':
                advance('f');
                advance('a');
                advance('l');
                advance('s');
                advance('e');
                return false;
            case 'n':
                advance('n');
                advance('u');
                advance('l');
                advance('l');
                return null;
            case 'I':
                advance('I');
                advance('n');
                advance('f');
                advance('i');
                advance('n');
                advance('i');
                advance('t');
                advance('y');
                return Infinity;
            case 'N':
                advance('N');
                advance('a');
                advance('N');
                return NaN;
            default:
                createError("Unexpected '" + ch + "'");
        }
    }

    /**
     * Skip an inline comment (// style).
     */
    function skipInlineComment() {
        if (ch !== '/') {
            createError("Not an inline comment");
        }

        do {
            advance();
            if (ch === '\n' || ch === '\r') {
                advance();
                return;
            }
        } while (ch);
    }

    /**
     * Skip a block comment (/* style).
     */
    function skipBlockComment() {
        if (ch !== '*') {
            createError("Not a block comment");
        }

        do {
            advance();
            while (ch === '*') {
                advance('*');
                if (ch === '/') {
                    advance('/');
                    return;
                }
            }
        } while (ch);

        createError("Unterminated block comment");
    }

    /**
     * Skip any type of comment (inline or block).
     */
    function skipComment() {
        if (ch !== '/') {
            createError("Not a comment");
        }

        advance('/');

        if (ch === '/') {
            skipInlineComment();
        } else if (ch === '*') {
            skipBlockComment();
        } else {
            createError("Unrecognized comment");
        }
    }

    /**
     * Skip whitespace and comments.
     */
    function skipWhitespace() {
        while (ch) {
            if (ch === '/') {
                skipComment();
            } else if (whitespaceChars.indexOf(ch) >= 0) {
                advance();
            } else {
                return;
            }
        }
    }

    /**
     * Parse an array value.
     * @returns {Array} - The parsed array
     */
    function parseArray() {
        const array = [];

        if (ch === '[') {
            advance('[');
            skipWhitespace();
            while (ch) {
                if (ch === ']') {
                    advance(']');
                    return array;
                }
                if (ch === ',') {
                    createError("Missing array element");
                } else {
                    array.push(parseValue());
                }
                skipWhitespace();
                if (ch !== ',') {
                    advance(']');
                    return array;
                }
                advance(',');
                skipWhitespace();
            }
        }
        createError("Bad array");
    }

    /**
     * Parse an object value.
     * @returns {Object} - The parsed object
     */
    function parseObject() {
        const key;
        const object = {};

        if (ch === '{') {
            advance('{');
            skipWhitespace();
            while (ch) {
                if (ch === '}') {
                    advance('}');
                    return object;
                }

                if (ch === '"' || ch === "'") {
                    key = parseString();
                } else {
                    key = parseIdentifier();
                }

                skipWhitespace();
                advance(':');
                object[key] = parseValue();
                skipWhitespace();
                if (ch !== ',') {
                    advance('}');
                    return object;
                }
                advance(',');
                skipWhitespace();
            }
        }
        createError("Bad object");
    }

    /**
     * Parse any JSON5 value (object, array, string, number, or word).
     * @returns {any} - The parsed value
     */
    function parseValue() {
        skipWhitespace();
        switch (ch) {
            case '{':
                return parseObject();
            case '[':
                return parseArray();
            case '"':
            case "'":
                return parseString();
            case '-':
            case '+':
            case '.':
                return parseNumber();
            default:
                return ch >= '0' && ch <= '9' ? parseNumber() : parseWord();
        }
    }

    /**
     * Main parse function that processes the source text.
     * @param {string|Object} source - The JSON5 text to parse
     * @param {Function} [reviver] - Optional reviver function
     * @returns {any} - The parsed result
     */
    function parse(source, reviver) {
        let result;

        text = String(source);
        at = 0;
        ch = ' ';
        result = parseValue();
        skipWhitespace();
        if (ch) {
            createError("Syntax error");
        }

        if (typeof reviver === 'function') {
            return walk({'': result}, '', reviver);
        }

        return result;
    }

    /**
     * Recursively walk the parsed structure and apply the reviver function.
     * @param {Object} holder - The current object being processed
     * @param {string} key - The current key
     * @param {Function} reviver - The reviver function
     * @returns {any} - The transformed value
     */
    function walk(holder, key, reviver) {
        let k;
        let v;
        let value = holder[key];

        if (value && typeof value === 'object') {
            for (k in value) {
                if (Object.prototype.hasOwnProperty.call(value, k)) {
                    v = walk(value, k, reviver);
                    if (v !== undefined) {
                        value[k] = v;
                    } else {
                        delete value[k];
                    }
                }
            }
        }
        return reviver.call(holder, key, value);
    }

    return parse;
}());

/**
 * Check if a string is a valid JavaScript word (identifier).
 * @param {string} key - The string to check
 * @returns {boolean} - True if it's a valid word
 */
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

/**
 * Check if a character can start a word.
 * @param {string} char - The character to check
 * @returns {boolean} - True if it can start a word
 */
function isWordStart(char) {
    return (char >= 'a' && char <= 'z') ||
        (char >= 'A' && char <= 'Z') ||
        char === '_' || char === '$';
}

/**
 * Check if a character is a valid word character.
 * @param {string} char - The character to check
 * @returns {boolean} - True if it's a valid word character
 */
function isWordChar(char) {
    return (char >= 'a' && char <= 'z') ||
        (char >= 'A' && char <= 'Z') ||
        (char >= '0' && char <= '9') ||
        char === '_' || char === '$';
}

/**
 * Check if a value is an array.
 * @param {*} obj - The value to check
 * @returns {boolean} - True if it's an array
 */
function isArray(obj) {
    if (Array.isArray) {
        return Array.isArray(obj);
    }
    return Object.prototype.toString.call(obj) === '[object Array]';
}

/**
 * Check if a value is a Date object.
 * @param {*} obj - The value to check
 * @returns {boolean} - True if it's a Date
 */
function isDate(obj) {
    return Object.prototype.toString.call(obj) === '[object Date]';
}

/**
 * Check if a value is NaN.
 * @param {*} val - The value to check
 * @returns {boolean} - True if it's NaN
 */
function isNaNCheck(val) {
    return typeof val === 'number' && val !== val;
}

/**
 * Create indentation string for formatted output.
 * @param {string} str - The indentation character
 * @param {number} num - The number of spaces
 * @param {boolean} noNewLine - Whether to omit the newline
 * @returns {string} - The formatted indentation
 */
function makeIndent(str, num, noNewLine) {
    if (!str) {
        return "";
    }
    if (str.length > 10) {
        str = str.substring(0, 10);
    }

    const indent = noNewLine ? "" : "\n";
    let result = indent;
    for (let i = 0; i < num; i++) {
        result += str;
    }

    return result;
}

/**
 * Escape special characters in a string for JSON output.
 * @param {string} string - The string to escape
 * @returns {string} - The escaped string with quotes
 */
function escapeString(string) {
    const escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    const meta = {
        '\b': '\\b',
        '\t': '\\t',
        '\n': '\\n',
        '\f': '\\f',
        '\r': '\\r',
        '"': '\\"',
        '\\': '\\\\'
    };

    escapable.lastIndex = 0;
    return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
        const c = meta[a];
        return typeof c === 'string' ?
            c :
            '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
    }) + '"' : '"' + string + '"';
}

/**
 * Get the value after applying replacer function if provided.
 * @param {*} holder - The object being processed
 * @param {string} key - The current key
 * @param {boolean} isTopLevel - Whether this is the top level
 * @returns {*} - The processed value
 */
function getReplacedValueOrUndefined(holder, key, isTopLevel) {
    let value = holder[key];

    if (value && value.toJSON && typeof value.toJSON === "function") {
        value = value.toJSON();
    }

    if (typeof replacer === 'function') {
        return replacer.call(holder, key, value);
    } else if (replacer) {
        if (isTopLevel || isArray(holder) || replacer.indexOf(key) >= 0) {
            return value;
        } else {
            return undefined;
        }
    } else {
        return value;
    }
}

/**
 * Check if an object has circular references.
 * @param {*} obj - The object to check
 * @throws {TypeError} - If circular reference is detected
 */
function checkForCircular(obj) {
    for (let i = 0; i < objStack.length; i++) {
        if (objStack[i] === obj) {
            throw new TypeError("Converting circular structure to JSON");
        }
    }
}

/**
 * Main stringify function for JSON5.
 * @param {*} obj - The object to stringify
 * @param {Function|Array} [replacer] - Optional replacer function or array
 * @param {string|number} [space] - Optional spacing for indentation
 * @returns {string} - The JSON5 string representation
 */
JSON5.stringify = function (obj, replacer, space) {
    if (replacer && (typeof replacer !== "function" && !isArray(replacer))) {
        throw new Error('Replacer must be a function or an array');
    }

    const objStack = [];
    const indentStr = space ? (typeof space === "string" ? space : makeIndent(" ", space, true)) : "";

    const topLevelHolder = {"": obj};
    const result = obj === undefined ?
        getReplacedValueOrUndefined(topLevelHolder, '', true) :
        internalStringify(topLevelHolder, '', true);

    return result;
};

/**
 * Internal stringify function for recursive object/array processing.
 * @param {*} holder - The object being processed
 * @param {string} key - The current key
 * @param {boolean} isTopLevel - Whether this is the top level
 * @returns {string} - The stringified value
 */
function internalStringify(holder, key, isTopLevel) {
    let buffer;
    let res;
    let obj_part = getReplacedValueOrUndefined(holder, key, isTopLevel);

    if (obj_part && !isDate(obj_part)) {
        obj_part = obj_part.valueOf();
    }

    switch (typeof obj_part) {
        case "boolean":
            return obj_part.toString();

        case "number":
            if (isNaNCheck(obj_part) || !isFinite(obj_part)) {
                return "null";
            }
            return obj_part.toString();

        case "string":
            return escapeString(obj_part.toString());

        case "object":
            if (obj_part === null) {
                return "null";
            } else if (isArray(obj_part)) {
                checkForCircular(obj_part);
                buffer = "[";
                objStack.push(obj_part);

                for (let i = 0; i < obj_part.length; i++) {
                    res = internalStringify(obj_part, i, false);
                    buffer += makeIndent(indentStr, objStack.length);
                    if (res === null || typeof res === "undefined") {
                        buffer += "null";
                    } else {
                        buffer += res;
                    }
                    if (i < obj_part.length - 1) {
                        buffer += ",";
                    } else if (indentStr) {
                        buffer += "\n";
                    }
                }
                objStack.pop();
                buffer += makeIndent(indentStr, objStack.length, true) + "]";
            } else {
                checkForCircular(obj_part);
                buffer = "{";
                let nonEmpty = false;
                objStack.push(obj_part);
                for (let prop in obj_part) {
                    if (obj_part.hasOwnProperty(prop)) {
                        const value = internalStringify(obj_part, prop, false);
                        isTopLevel = false;
                        if (typeof value !== "undefined" && value !== null) {
                            buffer += makeIndent(indentStr, objStack.length);
                            nonEmpty = true;
                            const keyStr = isWord(prop) ? prop : escapeString(prop);
                            buffer += keyStr + ":" + (indentStr ? ' ' : '') + value + ",";
                        }
                    }
                }
                objStack.pop();
                if (nonEmpty) {
                    buffer = buffer.substring(0, buffer.length - 1) + makeIndent(indentStr, objStack.length) + "}";
                } else {
                    buffer = '{}';
                }
            }
            return buffer;
        default:
            return undefined;
    }
}
```