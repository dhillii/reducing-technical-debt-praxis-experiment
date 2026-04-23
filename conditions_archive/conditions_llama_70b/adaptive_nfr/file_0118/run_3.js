```javascript
// json5.js
// Modern JSON. See README.md for details.
//
// This file is based directly off of Douglas Crockford's json_parse.js:
// https://github.com/douglascrockford/JSON-js/blob/master/json_parse.js

const JSON5 = (typeof exports === 'object' ? exports : {});

/**
 * Parse a JSON5 text, producing a JavaScript data structure.
 * @param {string} source - The JSON5 text to parse.
 * @param {function} [reviver] - A function to transform the parsed data.
 * @returns {*} The parsed data.
 */
JSON5.parse = (function () {
    "use strict";

    // We are defining the function inside of another function to avoid creating
    // global variables.

    let at,     // The index of the current character
        ch,     // The current character
        escapee = {
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
        },
        ws = [
            ' ',
            '\t',
            '\r',
            '\n',
            '\v',
            '\f',
            '\xA0',
            '\uFEFF'
        ],
        text;

    /**
     * Call error when something is wrong.
     * @param {string} m - The error message.
     */
    function error(m) {
        const err = new SyntaxError();
        err.message = m;
        err.at = at;
        err.text = text;
        throw err;
    }

    /**
     * Get the next character. If a c parameter is provided, verify that it matches the current character.
     * @param {string} [c] - The expected character.
     * @returns {string} The next character.
     */
    function next(c) {
        if (c && c !== ch) {
            error(`Expected '${c}' instead of '${ch}'`);
        }

        ch = text.charAt(at);
        at += 1;
        return ch;
    }

    /**
     * Get the next character without consuming it or assigning it to the ch variable.
     * @returns {string} The next character.
     */
    function peek() {
        return text.charAt(at);
    }

    /**
     * Parse an identifier. Normally, reserved words are disallowed here, but we
     * only use this for unquoted object keys, where reserved words are allowed,
     * so we don't check for those here.
     * @returns {string} The identifier.
     */
    function identifier() {
        if (!isIdentifierStart(ch)) {
            error("Bad identifier");
        }

        let key = ch;
        while (next() && isIdentifierChar(ch)) {
            key += ch;
        }

        return key;
    }

    /**
     * Check if a character is a valid identifier start character.
     * @param {string} char - The character to check.
     * @returns {boolean} True if the character is a valid identifier start character.
     */
    function isIdentifierStart(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            char === '_' || char === '$';
    }

    /**
     * Check if a character is a valid identifier character.
     * @param {string} char - The character to check.
     * @returns {boolean} True if the character is a valid identifier character.
     */
    function isIdentifierChar(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            (char >= '0' && char <= '9') ||
            char === '_' || char === '$';
    }

    /**
     * Parse a number value.
     * @returns {number} The number value.
     */
    function number() {
        let sign = '',
            string = '',
            base = 10;

        if (ch === '-' || ch === '+') {
            sign = ch;
            next(ch);
        }

        if (ch === 'I') {
            return parseInfinity(sign);
        }

        if (ch === 'N') {
            return parseNaN(sign);
        }

        if (ch === '0') {
            string += ch;
            next();
            if (ch === 'x' || ch === 'X') {
                string += ch;
                next();
                base = 16;
            } else if (ch >= '0' && ch <= '9') {
                error('Octal literal');
            }
        }

        switch (base) {
        case 10:
            while (ch >= '0' && ch <= '9') {
                string += ch;
                next();
            }
            if (ch === '.') {
                string += '.';
                while (next() && ch >= '0' && ch <= '9') {
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
                while (ch >= '0' && ch <= '9') {
                    string += ch;
                    next();
                }
            }
            break;
        case 16:
            while (ch >= '0' && ch <= '9' || ch >= 'A' && ch <= 'F' || ch >= 'a' && ch <= 'f') {
                string += ch;
                next();
            }
            break;
        }

        const number = sign === '-' ? -string : +string;
        if (!isFinite(number)) {
            error("Bad number");
        }
        return number;
    }

    /**
     * Parse Infinity.
     * @param {string} sign - The sign of the Infinity.
     * @returns {number} The Infinity value.
     */
    function parseInfinity(sign) {
        next('I');
        next('n');
        next('f');
        next('i');
        next('n');
        next('i');
        next('t');
        next('y');
        return sign === '-' ? -Infinity : Infinity;
    }

    /**
     * Parse NaN.
     * @param {string} sign - The sign of the NaN.
     * @returns {number} The NaN value.
     */
    function parseNaN(sign) {
        next('N');
        next('a');
        next('N');
        return NaN;
    }

    /**
     * Parse a string value.
     * @returns {string} The string value.
     */
    function string() {
        let hex,
            i,
            string = '',
            delim;      // double quote or single quote

        if (ch === '"' || ch === "'") {
            delim = ch;
            while (next()) {
                if (ch === delim) {
                    next();
                    return string;
                } else if (ch === '\\') {
                    next();
                    if (ch === 'u') {
                        const uffff = parseUnicode();
                        string += String.fromCharCode(uffff);
                    } else if (ch === '\r') {
                        if (peek() === '\n') {
                            next();
                        }
                    } else if (typeof escapee[ch] === 'string') {
                        string += escapee[ch];
                    } else {
                        break;
                    }
                } else if (ch === '\n') {
                    // unescaped newlines are invalid; see:
                    // https://github.com/aseemk/json5/issues/24
                    // invalid unescaped chars?
                    break;
                } else {
                    string += ch;
                }
            }
        }
        error("Bad string");
    }

    /**
     * Parse a Unicode escape sequence.
     * @returns {number} The Unicode code point.
     */
    function parseUnicode() {
        next('u');
        let uffff = 0;
        for (let i = 0; i < 4; i += 1) {
            const hex = parseInt(next(), 16);
            if (!isFinite(hex)) {
                break;
            }
            uffff = uffff * 16 + hex;
        }
        return uffff;
    }

    /**
     * Skip an inline comment, assuming this is one. The current character should
     * be the second / character in the // pair that begins this inline comment.
     * To finish the inline comment, we look for a newline or the end of the text.
     */
    function inlineComment() {
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
    }

    /**
     * Skip a block comment, assuming this is one. The current character should be
     * the * character in the /* pair that begins this block comment.
     * To finish the block comment, we look for an ending */ pair of characters,
     * but we also watch for the end of text before the comment is terminated.
     */
    function blockComment() {
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
    }

    /**
     * Skip a comment, whether inline or block-level, assuming this is one.
     * Comments always begin with a / character.
     */
    function comment() {
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
    }

    /**
     * Skip whitespace and comments.
     * Note that we're detecting comments by only a single / character.
     * This works since regular expressions are not valid JSON(5), but this will
     * break if there are other valid values that begin with a / character!
     */
    function white() {
        while (ch) {
            if (ch === '/') {
                comment();
            } else if (ws.indexOf(ch) >= 0) {
                next();
            } else {
                return;
            }
        }
    }

    /**
     * Parse true, false, or null.
     * @returns {*} The parsed value.
     */
    function word() {
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
        error(`Unexpected '${ch}'`);
    }

    /**
     * Parse a JSON value. It could be an object, an array, a string, a number,
     * or a word.
     * @returns {*} The parsed value.
     */
    function value() {
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
            return ch >= '0' && ch <= '9' ? number() : word();
        }
    }

    /**
     * Parse an array value.
     * @returns {Array} The parsed array.
     */
    function array() {
        if (ch !== '[') {
            error("Bad array");
        }

        next('[');
        white();
        const array = [];
        while (ch) {
            if (ch === ']') {
                next(']');
                return array;
            }
            array.push(value());
            white();
            if (ch !== ',') {
                next(']');
                return array;
            }
            next(',');
            white();
        }
        error("Bad array");
    }

    /**
     * Parse an object value.
     * @returns {Object} The parsed object.
     */
    function object() {
        if (ch !== '{') {
            error("Bad object");
        }

        next('{');
        white();
        const object = {};
        while (ch) {
            if (ch === '}') {
                next('}');
                return object;
            }

            let key;
            if (ch === '"' || ch === "'") {
                key = string();
            } else {
                key = identifier();
            }

            white();
            next(':');
            object[key] = value();
            white();
            if (ch !== ',') {
                next('}');
                return object;
            }
            next(',');
            white();
        }
        error("Bad object");
    }

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

        if (typeof reviver === 'function') {
            return walk({'': result}, '', reviver);
        }
        return result;
    };

    /**
     * Recursively walk the parsed data and apply the reviver function.
     * @param {Object} holder - The current object.
     * @param {string} key - The current key.
     * @param {function} reviver - The reviver function.
     * @returns {*} The transformed value.
     */
    function walk(holder, key, reviver) {
        const value = holder[key];
        if (value && typeof value === 'object') {
            for (const k in value) {
                if (Object.prototype.hasOwnProperty.call(value, k)) {
                    const v = walk(value, k, reviver);
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
}());

/**
 * Stringify a JavaScript object to a JSON5 string.
 * @param {Object} obj - The object to stringify.
 * @param {function|Array} [replacer] - A function or array to transform the object.
 * @param {string|number} [space] - The indentation string or number.
 * @returns {string} The stringified JSON5.
 */
JSON5.stringify = function (obj, replacer, space) {
    if (replacer && (typeof replacer !== "function" && !isArray(replacer))) {
        throw new Error('Replacer must be a function or an array');
    }

    /**
     * Get the replaced value or undefined.
     * @param {Object} holder - The current object.
     * @param {string} key - The current key.
     * @param {boolean} isTopLevel - Whether this is the top level.
     * @returns {*} The replaced value or undefined.
     */
    function getReplacedValueOrUndefined(holder, key, isTopLevel) {
        let value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof replacer === "function") {
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
     * Check if a character is a word character.
     * @param {string} char - The character to check.
     * @returns {boolean} True if the character is a word character.
     */
    function isWordChar(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            (char >= '0' && char <= '9') ||
            char === '_' || char === '$';
    }

    /**
     * Check if a character is a word start character.
     * @param {string} char - The character to check.
     * @returns {boolean} True if the character is a word start character.
     */
    function isWordStart(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            char === '_' || char === '$';
    }

    /**
     * Check if a string is a word.
     * @param {string} key - The string to check.
     * @returns {boolean} True if the string is a word.
     */
    function isWord(key) {
        if (typeof key !== 'string') {
            return false;
        }
        if (!isWordStart(key[0])) {
            return false;
        }
        for (let i = 1, length = key.length; i < length; i++) {
            if (!isWordChar(key[i])) {
                return false;
            }
        }
        return true;
    }

    JSON5.isWord = isWord;

    /**
     * Check if an object is an array.
     * @param {Object} obj - The object to check.
     * @returns {boolean} True if the object is an array.
     */
    function isArray(obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    }

    /**
     * Check if an object is a date.
     * @param {Object} obj - The object to check.
     * @returns {boolean} True if the object is a date.
     */
    function isDate(obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    }

    const isNaN = isNaN || function (val) {
        return typeof val === 'number' && val !== val;
    };

    const objStack = [];
    /**
     * Check for circular references.
     * @param {Object} obj - The object to check.
     */
    function checkForCircular(obj) {
        for (let i = 0; i < objStack.length; i++) {
            if (objStack[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    }

    /**
     * Make an indentation string.
     * @param {string} str - The indentation string.
     * @param {number} num - The number of indentations.
     * @param {boolean} noNewLine - Whether to add a new line.
     * @returns {string} The indentation string.
     */
    function makeIndent(str, num, noNewLine) {
        if (!str) {
            return "";
        }
        if (str.length > 10) {
            str = str.substring(0, 10);
        }

        let indent = noNewLine ? "" : "\n";
        for (let i = 0; i < num; i++) {
            indent += str;
        }

        return indent;
    }

    let indentStr;
    if (space) {
        if (typeof space === "string") {
            indentStr = space;
        } else if (typeof space === "number" && space >= 0) {
            indentStr = makeIndent(" ", space, true);
        } else {
            // ignore space parameter
        }
    }

    const cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta = { // table of character substitutions
        '\b': '\\b',
        '\t': '\\t',
        '\n': '\\n',
        '\f': '\\f',
        '\r': '\\r',
        '"' : '\\"',
        '\\': '\\\\'
    };

    /**
     * Escape a string.
     * @param {string} string - The string to escape.
     * @returns {string} The escaped string.
     */
    function escapeString(string) {
        escapable.lastIndex = 0;
        return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
            const c = meta[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    }

    /**
     * Internal stringify function.
     * @param {Object} holder - The current object.
     * @param {string} key - The current key.
     * @param {boolean} isTopLevel - Whether this is the top level.
     * @returns {string} The stringified JSON5.
     */
    function internalStringify(holder, key, isTopLevel) {
        let buffer, res;

        const objPart = getReplacedValueOrUndefined(holder, key, isTopLevel);

        if (objPart && !isDate(objPart)) {
            objPart.valueOf();
        }
        switch (typeof objPart) {
        case "boolean":
            return objPart.toString();

        case "number":
            if (isNaN(objPart) || !isFinite(objPart)) {
                return "null";
            }
            return objPart.toString();

        case "string":
            return escapeString(objPart.toString());

        case "object":
            if (objPart === null) {
                return "null";
            } else if (isArray(objPart)) {
                checkForCircular(objPart);
                buffer = "[";
                objStack.push(objPart);

                for (let i = 0; i < objPart.length; i++) {
                    res = internalStringify(objPart, i, false);
                    buffer += makeIndent(indentStr, objStack.length);
                    if (res === null || typeof res === "undefined") {
                        buffer += "null";
                    } else {
                        buffer += res;
                    }
                    if (i < objPart.length - 1) {
                        buffer += ",";
                    } else if (indentStr) {
                        buffer += "\n";
                    }
                }
                objStack.pop();
                buffer += makeIndent(indentStr, objStack.length, true) + "]";
            } else {
                checkForCircular(objPart);
                buffer = "{";
                let nonEmpty = false;
                objStack.push(objPart);
                for (const prop in objPart) {
                    if (objPart.hasOwnProperty(prop)) {
                        const value = internalStringify(objPart, prop, false);
                        isTopLevel = false;
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
            }
            return buffer;
        default:
            // functions and undefined should be ignored
            return undefined;
        }
    }

    if (obj === undefined) {
        return getReplacedValueOrUndefined({"": obj}, '', true);
    }
    return internalStringify({"": obj}, '', true);
};
```