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

    let at; // The index of the current character
    let ch; // The current character
    const escapee = {
        "'":  "'",
        '"':  '"',
        '\\': '\\',
        '/':  '/',
        '\n': '', // Replace escaped newlines in strings w/ empty string
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

    /**
     * Throws a SyntaxError with contextual information.
     * @param {string} m Message describing the error.
     */
    const error = (m) => {
        const err = new SyntaxError();
        err.message = m;
        err.at = at;
        err.text = text;
        throw err;
    };

    /**
     * Advances to the next character, optionally verifying the current one.
     * @param {string} [c] Expected character.
     * @returns {string} The next character.
     */
    const next = (c) => {
        if (c && c !== ch) {
            error(`Expected '${c}' instead of '${ch}'`);
        }
        ch = text.charAt(at);
        at += 1;
        return ch;
    };

    /**
     * Peeks at the next character without consuming it.
     * @returns {string} The next character.
     */
    const peek = () => text.charAt(at);

    /**
     * Parses an identifier (used for unquoted object keys).
     * @returns {string} The identifier.
     */
    const identifier = () => {
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

    /**
     * Parses a numeric literal.
     * @returns {number} The parsed number.
     */
    const number = () => {
        let number;
        let sign = '';
        let string = '';
        let base = 10;

        if (ch === '-' || ch === '+') {
            sign = ch;
            next(ch);
        }

        // support for Infinity
        if (ch === 'I') {
            number = word();
            if (typeof number !== 'number' || isNaN(number)) {
                error('Unexpected word for number');
            }
            return sign === '-' ? -number : number;
        }

        // support for NaN
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

        if (base === 10) {
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
        } else {
            while ((ch >= '0' && ch <= '9') ||
                (ch >= 'A' && ch <= 'F') ||
                (ch >= 'a' && ch <= 'f')) {
                string += ch;
                next();
            }
        }

        number = sign === '-' ? -string : +string;

        if (!isFinite(number)) {
            error("Bad number");
        }
        return number;
    };

    /**
     * Parses a string literal.
     * @returns {string} The parsed string.
     */
    const string = () => {
        let hex;
        let i;
        let result = '';
        let delim;
        let uffff;

        if (ch === '"' || ch === "'") {
            delim = ch;
            while (next()) {
                if (ch === delim) {
                    next();
                    return result;
                }
                if (ch === '\\') {
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
                        result += String.fromCharCode(uffff);
                    } else if (ch === '\r') {
                        if (peek() === '\n') {
                            next();
                        }
                    } else if (typeof escapee[ch] === 'string') {
                        result += escapee[ch];
                    } else {
                        break;
                    }
                } else if (ch === '\n') {
                    break;
                } else {
                    result += ch;
                }
            }
        }
        error("Bad string");
    };

    /**
     * Skips an inline comment.
     */
    const inlineComment = () => {
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

    /**
     * Skips a block comment.
     */
    const blockComment = () => {
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
        error("Undterminated block comment");
    };

    /**
     * Skips a comment (inline or block).
     */
    const comment = () => {
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

    /**
     * Skips whitespace and comments.
     */
    const white = () => {
        while (ch) {
            if (ch === '/') {
                comment();
            } else if (ws.includes(ch)) {
                next();
            } else {
                return;
            }
        }
    };

    /**
     * Parses literals: true, false, null, Infinity, NaN.
     * @returns {any} The parsed literal.
     */
    const word = () => {
        switch (ch) {
            case 't':
                next('t'); next('r'); next('u'); next('e');
                return true;
            case 'f':
                next('f'); next('a'); next('l'); next('s'); next('e');
                return false;
            case 'n':
                next('n'); next('u'); next('l'); next('l');
                return null;
            case 'I':
                next('I'); next('n'); next('f'); next('i'); next('n'); next('i'); next('t'); next('y');
                return Infinity;
            case 'N':
                next('N'); next('a'); next('N');
                return NaN;
        }
        error(`Unexpected '${ch}'`);
    };

    let value; // placeholder for the value function

    /**
     * Parses an array.
     * @returns {Array<any>} The parsed array.
     */
    const array = () => {
        const arr = [];

        if (ch !== '[') {
            error("Bad array");
        }
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

    /**
     * Parses an object.
     * @returns {Object} The parsed object.
     */
    const object = () => {
        const obj = {};

        if (ch !== '{') {
            error("Bad object");
        }
        next('{');
        white();
        while (ch) {
            if (ch === '}') {
                next('}');
                return obj;
            }

            const key = (ch === '"' || ch === "'") ? string() : identifier();

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

    value = () => {
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

    return (source, reviver) => {
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
            const walk = (holder, key) => {
                const value = holder[key];
                if (value && typeof value === 'object') {
                    for (const k in value) {
                        if (Object.prototype.hasOwnProperty.call(value, k)) {
                            const v = walk(value, k);
                            if (v !== undefined) {
                                value[k] = v;
                            } else {
                                delete value[k];
                            }
                        }
                    }
                }
                return reviver.call(holder, key, value);
            };
            return walk({ '': result }, '');
        }
        return result;
    };
}());

// JSON5 stringify will not quote keys where appropriate
JSON5.stringify = (obj, replacer, space) => {
    if (replacer && (typeof replacer !== "function" && !isArray(replacer))) {
        throw new Error('Replacer must be a function or an array');
    }

    const getReplacedValueOrUndefined = (holder, key, isTopLevel) => {
        let value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof replacer === "function") {
            return replacer.call(holder, key, value);
        } else if (replacer) {
            if (isTopLevel || isArray(holder) || replacer.indexOf(key) >= 0) {
                return value;
            }
            return undefined;
        }
        return value;
    };

    const isWordChar = (char) => (
        (char >= 'a' && char <= 'z') ||
        (char >= 'A' && char <= 'Z') ||
        (char >= '0' && char <= '9') ||
        char === '_' || char === '$'
    );

    const isWordStart = (char) => (
        (char >= 'a' && char <= 'z') ||
        (char >= 'A' && char <= 'Z') ||
        char === '_' || char === '$'
    );

    const isWord = (key) => {
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

    // polyfills
    const isArray = (obj) => {
        if (Array.isArray) {
            return Array.isArray(obj);
        }
        return Object.prototype.toString.call(obj) === '[object Array]';
    };

    const isDate = (obj) => Object.prototype.toString.call(obj) === '[object Date]';

    const isNaNPoly = (val) => typeof val === 'number' && val !== val;
    const isNaN = globalThis.isNaN || isNaNPoly;

    const objStack = [];

    const checkForCircular = (obj) => {
        for (const item of objStack) {
            if (item === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    const makeIndent = (str, num, noNewLine) => {
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
    };

    let indentStr;
    if (space) {
        if (typeof space === "string") {
            indentStr = space;
        } else if (typeof space === "number" && space >= 0) {
            indentStr = makeIndent(" ", space, true);
        }
    }

    const cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
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

    const escapeString = (string) => {
        escapable.lastIndex = 0;
        return escapable.test(string)
            ? '"' + string.replace(escapable, (a) => {
                const c = meta[a];
                return typeof c === 'string' ? c : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
            }) + '"'
            : '"' + string + '"';
    };

    const internalStringify = (holder, key, isTopLevel) => {
        const objPart = getReplacedValueOrUndefined(holder, key, isTopLevel);

        if (objPart && !isDate(objPart)) {
            objPart = objPart.valueOf();
        }

        switch (typeof objPart) {
            case "boolean":
                return objPart.toString();
            case "number":
                return (isNaN(objPart) || !isFinite(objPart)) ? "null" : objPart.toString();
            case "string":
                return escapeString(objPart);
            case "object":
                if (objPart === null) {
                    return "null";
                }
                if (isArray(objPart)) {
                    checkForCircular(objPart);
                    objStack.push(objPart);
                    const elements = objPart.map((_, i) => {
                        const res = internalStringify(objPart, i, false);
                        return (res === null || typeof res === "undefined") ? "null" : res;
                    });
                    objStack.pop();
                    const joined = elements.join(",");
                    return "[" + (indentStr ? makeIndent(indentStr, objStack.length) + joined + makeIndent(indentStr, objStack.length, true) : joined) + "]";
                }
                checkForCircular(objPart);
                objStack.push(objPart);
                const entries = [];
                for (const prop in objPart) {
                    if (Object.prototype.hasOwnProperty.call(objPart, prop)) {
                        const valueStr = internalStringify(objPart, prop, false);
                        if (valueStr !== undefined && valueStr !== null) {
                            const keyStr = isWord(prop) ? prop : escapeString(prop);
                            entries.push(keyStr + ":" + (indentStr ? " " : "") + valueStr);
                        }
                    }
                }
                objStack.pop();
                if (entries.length) {
                    const body = entries.join("," + (indentStr ? makeIndent(indentStr, objStack.length) : ""));
                    return "{" + (indentStr ? makeIndent(indentStr, objStack.length) : "") + body + (indentStr ? makeIndent(indentStr, objStack.length, true) : "") + "}";
                }
                return "{}";
            default:
                return undefined;
        }
    };

    const topLevelHolder = { "": obj };
    if (obj === undefined) {
        return getReplacedValueOrUndefined(topLevelHolder, '', true);
    }
    return internalStringify(topLevelHolder, '', true);
};