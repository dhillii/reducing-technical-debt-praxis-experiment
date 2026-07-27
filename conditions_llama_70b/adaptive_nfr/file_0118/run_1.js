const JSON5 = (typeof exports === 'object' ? exports : {});

/**
 * JSON5 parser.
 * @param {string} source - The JSON5 string to parse.
 * @param {function} reviver - The reviver function to transform the parsed value.
 * @returns {*} The parsed JSON5 value.
 */
JSON5.parse = (function () {
    "use strict";

    // Define constants
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

    // Define predicate functions
    /**
     * Checks if a character is a whitespace.
     * @param {string} ch - The character to check.
     * @returns {boolean} True if the character is a whitespace, false otherwise.
     */
    function isWhitespace(ch) {
        return ws.indexOf(ch) >= 0;
    }

    /**
     * Checks if a character is a word character.
     * @param {string} ch - The character to check.
     * @returns {boolean} True if the character is a word character, false otherwise.
     */
    function isWordChar(ch) {
        return (ch >= 'a' && ch <= 'z') ||
            (ch >= 'A' && ch <= 'Z') ||
            (ch >= '0' && ch <= '9') ||
            ch === '_' || ch === '$';
    }

    /**
     * Checks if a character is a word start character.
     * @param {string} ch - The character to check.
     * @returns {boolean} True if the character is a word start character, false otherwise.
     */
    function isWordStart(ch) {
        return (ch >= 'a' && ch <= 'z') ||
            (ch >= 'A' && ch <= 'Z') ||
            ch === '_' || ch === '$';
    }

    /**
     * Checks if a string is a word.
     * @param {string} key - The string to check.
     * @returns {boolean} True if the string is a word, false otherwise.
     */
    function isWord(key) {
        if (typeof key !== 'string') {
            return false;
        }
        if (!isWordStart(key[0])) {
            return false;
        }
        var i = 1, length = key.length;
        while (i < length) {
            if (!isWordChar(key[i])) {
                return false;
            }
            i++;
        }
        return true;
    }

    // Define the parser functions
    let at,     // The index of the current character
        ch,     // The current character
        text;

    /**
     * Throws an error with the given message.
     * @param {string} m - The error message.
     */
    function error(m) {
        const error = new SyntaxError();
        error.message = m;
        error.at = at;
        error.text = text;
        throw error;
    }

    /**
     * Gets the next character.
     * @param {string} c - The expected character.
     * @returns {string} The next character.
     */
    function next(c) {
        if (c && c !== ch) {
            error("Expected '" + c + "' instead of '" + ch + "'");
        }
        ch = text.charAt(at);
        at += 1;
        return ch;
    }

    /**
     * Peeks at the next character without consuming it.
     * @returns {string} The next character.
     */
    function peek() {
        return text.charAt(at);
    }

    /**
     * Parses an identifier.
     * @returns {string} The parsed identifier.
     */
    function identifier() {
        if (!isWordStart(ch)) {
            error("Bad identifier");
        }
        let key = ch;
        while (next() && isWordChar(ch)) {
            key += ch;
        }
        return key;
    }

    /**
     * Parses a number value.
     * @returns {number} The parsed number value.
     */
    function number() {
        let number,
            sign = '',
            string = '',
            base = 10;

        if (ch === '-' || ch === '+') {
            sign = ch;
            next(ch);
        }

        if (ch === 'I') {
            number = word();
            if (typeof number !== 'number' || isNaN(number)) {
                error('Unexpected word for number');
            }
            return (sign === '-') ? -number : number;
        }

        if (ch === 'N') {
            number = word();
            if (!isNaN(number)) {
                error('expected word to be NaN');
            }
            return number;
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

        if (sign === '-') {
            number = -string;
        } else {
            number = +string;
        }

        if (!isFinite(number)) {
            error("Bad number");
        } else {
            return number;
        }
    }

    /**
     * Parses a string value.
     * @returns {string} The parsed string value.
     */
    function string() {
        let hex,
            i,
            string = '',
            delim;      // double quote or single quote
        let uffff;

        if (ch === '"' || ch === "'") {
            delim = ch;
            while (next()) {
                if (ch === delim) {
                    next();
                    return string;
                } else if (ch === '\\') {
                    next();
                    if (ch === 'u') {
                        uffff = 0;
                        for (i = 0; i < 4; i += 1) {
                            hex = parseInt(next(), 16);
                            if (!isFinite(hex)) {
                                break;
                            }
                            uffff = uffff * 16 + hex;
                        }
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
                    error("Bad string");
                } else {
                    string += ch;
                }
            }
        }
        error("Bad string");
    }

    /**
     * Skips an inline comment.
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
     * Skips a block comment.
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
     * Skips a comment.
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
     * Skips whitespace and comments.
     */
    function white() {
        while (ch) {
            if (ch === '/') {
                comment();
            } else if (isWhitespace(ch)) {
                next();
            } else {
                return;
            }
        }
    }

    /**
     * Parses a word value.
     * @returns {*} The parsed word value.
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
        error("Unexpected '" + ch + "'");
    }

    /**
     * Parses a JSON value.
     * @returns {*} The parsed JSON value.
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
                return isWordChar(ch) ? word() : error("Unexpected '" + ch + "'");
        }
    }

    /**
     * Parses an array value.
     * @returns {Array} The parsed array value.
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
     * Parses an object value.
     * @returns {Object} The parsed object value.
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
        text = String(source);
        at = 0;
        ch = ' ';
        const result = value();
        white();
        if (ch) {
            error("Syntax error");
        }

        if (typeof reviver === 'function') {
            return (function walk(holder, key) {
                let k, v, value = holder[key];
                if (value && typeof value === 'object') {
                    for (k in value) {
                        if (Object.prototype.hasOwnProperty.call(value, k)) {
                            v = walk(value, k);
                            if (v !== undefined) {
                                value[k] = v;
                            } else {
                                delete value[k];
                            }
                        }
                    }
                }
                return reviver.call(holder, key, value);
            }({'': result}, ''));
        } else {
            return result;
        }
    };
}());

/**
 * JSON5 stringifier.
 * @param {*} obj - The object to stringify.
 * @param {function|Array} replacer - The replacer function or array.
 * @param {string|number} space - The indentation string or number.
 * @returns {string} The stringified JSON5 string.
 */
JSON5.stringify = function (obj, replacer, space) {
    if (replacer && (typeof(replacer) !== "function" && !isArray(replacer))) {
        throw new Error('Replacer must be a function or an array');
    }

    /**
     * Gets the replaced value or undefined.
     * @param {Object} holder - The holder object.
     * @param {string} key - The key.
     * @param {boolean} isTopLevel - Whether it's the top level.
     * @returns {*} The replaced value or undefined.
     */
    function getReplacedValueOrUndefined(holder, key, isTopLevel) {
        let value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
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
     * Checks if a character is a word character.
     * @param {string} char - The character to check.
     * @returns {boolean} True if the character is a word character, false otherwise.
     */
    function isWordChar(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            (char >= '0' && char <= '9') ||
            char === '_' || char === '$';
    }

    /**
     * Checks if a character is a word start character.
     * @param {string} char - The character to check.
     * @returns {boolean} True if the character is a word start character, false otherwise.
     */
    function isWordStart(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            char === '_' || char === '$';
    }

    /**
     * Checks if a string is a word.
     * @param {string} key - The string to check.
     * @returns {boolean} True if the string is a word, false otherwise.
     */
    function isWord(key) {
        if (typeof key !== 'string') {
            return false;
        }
        if (!isWordStart(key[0])) {
            return false;
        }
        let i = 1, length = key.length;
        while (i < length) {
            if (!isWordChar(key[i])) {
                return false;
            }
            i++;
        }
        return true;
    }

    // Export for use in tests
    JSON5.isWord = isWord;

    // Polyfills
    function isArray(obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    }

    function isDate(obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    }

    const isNaN = isNaN || function(val) {
        return typeof val === 'number' && val !== val;
    };

    let objStack = [];
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

    // Copied from Crokford's implementation of JSON
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
     * Escapes a string.
     * @param {string} string - The string to escape.
     * @returns {string} The escaped string.
     */
    function escapeString(string) {
        escapable.lastIndex = 0;
        return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
            let c = meta[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    }

    /**
     * Internal stringifier.
     * @param {Object} holder - The holder object.
     * @param {string} key - The key.
     * @param {boolean} isTopLevel - Whether it's the top level.
     * @returns {string} The stringified value.
     */
    function internalStringify(holder, key, isTopLevel) {
        let buffer, res;

        let obj_part = getReplacedValueOrUndefined(holder, key, isTopLevel);

        if (obj_part && !isDate(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaN(obj_part) || !isFinite(obj_part)) {
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
                        if (i < obj_part.length-1) {
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
                            let value = internalStringify(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent(indentStr, objStack.length);
                                nonEmpty = true;
                                let key = isWord(prop) ? prop : escapeString(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent(indentStr, objStack.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    }

    let topLevelHolder = {"":obj};
    if (obj === undefined) {
        return getReplacedValueOrUndefined(topLevelHolder, '', true);
    }
    return internalStringify(topLevelHolder, '', true);
};