// json5.js
// Modern JSON. See README.md for details.
//
// This file is based directly off of Douglas Crockford's json_parse.js:
// https://github.com/douglascrockford/JSON-js/blob/master/json_parse.js

var JSON5 = (typeof exports === 'object' ? exports : {});

JSON5.parse = (function () {
    "use strict";

    // Parser state
    let at = 0;          // Current index
    let ch = ' ';        // Current character
    let text = '';       // Input text

    const escapee = {
        "'":  "'",
        '"':  '"',
        '\\': '\\',
        '/':  '/',
        '\n': '',
        b:    '\b',
        f:    '\f',
        n:    '\n',
        r:    '\r',
        t:    '\t'
    };

    const whitespaceChars = [
        ' ', '\t', '\r', '\n', '\v', '\f', '\xA0', '\uFEFF'
    ];

    /** Throw a SyntaxError with location info */
    function error(message) {
        const err = new SyntaxError(message);
        err.at = at;
        err.text = text;
        throw err;
    }

    /** Advance to the next character, optionally verifying the current one */
    function next(expected) {
        if (expected && expected !== ch) {
            error(`Expected '${expected}' instead of '${ch}'`);
        }
        ch = text.charAt(at);
        at += 1;
        return ch;
    }

    /** Peek at the next character without consuming it */
    function peek() {
        return text.charAt(at);
    }

    /** Skip whitespace and comments */
    function skipWhite() {
        while (ch) {
            if (ch === '/') {
                skipComment();
            } else if (whitespaceChars.includes(ch)) {
                next();
            } else {
                break;
            }
        }
    }

    /** Skip a comment (inline or block) */
    function skipComment() {
        next('/');
        if (ch === '/') {
            skipInlineComment();
        } else if (ch === '*') {
            skipBlockComment();
        } else {
            error("Unrecognized comment");
        }
    }

    /** Skip an inline comment */
    function skipInlineComment() {
        while (ch) {
            next();
            if (ch === '\n' || ch === '\r') {
                next();
                return;
            }
        }
    }

    /** Skip a block comment */
    function skipBlockComment() {
        while (ch) {
            next();
            if (ch === '*') {
                next();
                if (ch === '/') {
                    next();
                    return;
                }
            }
        }
        error("Unterminated block comment");
    }

    /** Parse an identifier (used for unquoted object keys) */
    function parseIdentifier() {
        let key = ch;
        if (!isIdentifierStart(ch)) {
            error("Bad identifier");
        }
        while (next() && isIdentifierPart(ch)) {
            key += ch;
        }
        return key;
    }

    function isIdentifierStart(c) {
        return c === '_' || c === '$' ||
            (c >= 'a' && c <= 'z') ||
            (c >= 'A' && c <= 'Z');
    }

    function isIdentifierPart(c) {
        return isIdentifierStart(c) ||
            (c >= '0' && c <= '9');
    }

    /** Parse a numeric literal */
    function parseNumber() {
        let sign = '';
        if (ch === '-' || ch === '+') {
            sign = ch;
            next();
        }

        // Handle Infinity and NaN via word parsing
        if (ch === 'I' || ch === 'N') {
            const num = parseWord();
            if (typeof num !== 'number' || (ch === 'N' && !isNaN(num))) {
                error('Unexpected word for number');
            }
            return sign === '-' && !isNaN(num) ? -num : num;
        }

        // Hexadecimal or decimal parsing
        let base = 10;
        let numStr = '';

        if (ch === '0') {
            numStr += ch;
            next();
            if (ch === 'x' || ch === 'X') {
                numStr += ch;
                next();
                base = 16;
            } else if (ch >= '0' && ch <= '9') {
                error('Octal literal');
            }
        }

        if (base === 10) {
            numStr += readDecimalDigits();
            if (ch === '.') {
                numStr += '.';
                next();
                numStr += readDecimalDigits();
            }
            if (ch === 'e' || ch === 'E') {
                numStr += readExponent();
            }
        } else {
            numStr += readHexDigits();
        }

        const number = sign === '-' ? -Number(numStr) : Number(numStr);
        if (!isFinite(number)) {
            error("Bad number");
        }
        return number;
    }

    function readDecimalDigits() {
        let digits = '';
        while (ch >= '0' && ch <= '9') {
            digits += ch;
            next();
        }
        return digits;
    }

    function readHexDigits() {
        let digits = '';
        while ((ch >= '0' && ch <= '9') ||
               (ch >= 'A' && ch <= 'F') ||
               (ch >= 'a' && ch <= 'f')) {
            digits += ch;
            next();
        }
        return digits;
    }

    function readExponent() {
        let exp = ch; // 'e' or 'E'
        next();
        if (ch === '-' || ch === '+') {
            exp += ch;
            next();
        }
        while (ch >= '0' && ch <= '9') {
            exp += ch;
            next();
        }
        return exp;
    }

    /** Parse a string literal */
    function parseString() {
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
                    result += readUnicodeEscape();
                } else if (ch === '\r') {
                    if (peek() === '\n') next();
                } else if (escapee.hasOwnProperty(ch)) {
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
        error("Bad string");
    }

    function readUnicodeEscape() {
        let code = 0;
        for (let i = 0; i < 4; i++) {
            const hex = parseInt(next(), 16);
            if (!isFinite(hex)) break;
            code = code * 16 + hex;
        }
        return String.fromCharCode(code);
    }

    /** Parse literals: true, false, null, Infinity, NaN */
    function parseWord() {
        switch (ch) {
            case 't':
                expectSequence('true');
                return true;
            case 'f':
                expectSequence('false');
                return false;
            case 'n':
                expectSequence('null');
                return null;
            case 'I':
                expectSequence('Infinity');
                return Infinity;
            case 'N':
                expectSequence('NaN');
                return NaN;
        }
        error(`Unexpected '${ch}'`);
    }

    function expectSequence(seq) {
        for (let i = 0; i < seq.length; i++) {
            next(seq[i]);
        }
    }

    /** Parse an array */
    function parseArray() {
        const arr = [];
        next('[');
        skipWhite();
        while (ch) {
            if (ch === ']') {
                next(']');
                return arr;
            }
            if (ch === ',') error("Missing array element");
            arr.push(parseValue());
            skipWhite();
            if (ch !== ',') {
                next(']');
                return arr;
            }
            next(',');
            skipWhite();
        }
        error("Bad array");
    }

    /** Parse an object */
    function parseObject() {
        const obj = {};
        next('{');
        skipWhite();
        while (ch) {
            if (ch === '}') {
                next('}');
                return obj;
            }
            const key = (ch === '"' || ch === "'") ? parseString() : parseIdentifier();
            skipWhite();
            next(':');
            obj[key] = parseValue();
            skipWhite();
            if (ch !== ',') {
                next('}');
                return obj;
            }
            next(',');
            skipWhite();
        }
        error("Bad object");
    }

    /** Parse any JSON5 value */
    function parseValue() {
        skipWhite();
        if (ch === '{') return parseObject();
        if (ch === '[') return parseArray();
        if (ch === '"' || ch === "'") return parseString();
        if (ch === '-' || ch === '+' || ch === '.' || (ch >= '0' && ch <= '9')) return parseNumber();
        return parseWord();
    }

    // Public parse function
    return function (source, reviver) {
        text = String(source);
        at = 0;
        ch = ' ';
        const result = parseValue();
        skipWhite();
        if (ch) error("Syntax error");

        if (typeof reviver !== 'function') return result;

        // Reviver walk
        return (function walk(holder, key) {
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
        }({ '': result }, ''));
    };
}());

// JSON5 stringify will not quote keys where appropriate
JSON5.stringify = function (obj, replacer, space) {
    // Validate replacer
    if (replacer && typeof replacer !== "function" && !isArray(replacer)) {
        throw new Error('Replacer must be a function or an array');
    }

    /** Resolve value via replacer or toJSON */
    function getReplacedValue(holder, key, isTop) {
        let value = holder[key];
        if (value && typeof value.toJSON === "function") {
            value = value.toJSON();
        }
        if (typeof replacer === "function") {
            return replacer.call(holder, key, value);
        }
        if (replacer) {
            if (isTop || isArray(holder) || replacer.indexOf(key) >= 0) {
                return value;
            }
            return undefined;
        }
        return value;
    }

    /** Character classification helpers */
    function isWordChar(c) {
        return (c >= 'a' && c <= 'z') ||
               (c >= 'A' && c <= 'Z') ||
               (c >= '0' && c <= '9') ||
               c === '_' || c === '$';
    }

    function isWordStart(c) {
        return (c >= 'a' && c <= 'z') ||
               (c >= 'A' && c <= 'Z') ||
               c === '_' || c === '$';
    }

    function isWord(key) {
        if (typeof key !== 'string') return false;
        if (!isWordStart(key[0])) return false;
        for (let i = 1; i < key.length; i++) {
            if (!isWordChar(key[i])) return false;
        }
        return true;
    }

    // Export for tests
    JSON5.isWord = isWord;

    /** Polyfills */
    function isArray(a) {
        return Array.isArray ? Array.isArray(a) : Object.prototype.toString.call(a) === '[object Array]';
    }

    function isDate(d) {
        return Object.prototype.toString.call(d) === '[object Date]';
    }

    const originalIsNaN = isNaN;
    isNaN = isNaN || function (v) {
        return typeof v === 'number' && v !== v;
    };

    /** Circular reference detection */
    const stack = [];
    function checkCircular(o) {
        if (stack.includes(o)) {
            throw new TypeError("Converting circular structure to JSON");
        }
    }

    /** Indentation helper */
    function makeIndent(str, count, noNewLine) {
        if (!str) return "";
        const limited = str.length > 10 ? str.slice(0, 10) : str;
        let indent = noNewLine ? "" : "\n";
        for (let i = 0; i < count; i++) {
            indent += limited;
        }
        return indent;
    }

    /** Determine indentation string */
    let indentStr = "";
    if (space) {
        if (typeof space === "string") {
            indentStr = space;
        } else if (typeof space === "number" && space >= 0) {
            indentStr = makeIndent(" ", space, true);
        }
    }

    /** Escape a string for JSON output */
    const cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    const escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    const meta = {
        '\b': '\\b',
        '\t': '\\t',
        '\n': '\\n',
        '\f': '\\f',
        '\r': '\\r',
        '"':  '\\"',
        '\\': '\\\\'
    };
    function escapeString(str) {
        escapable.lastIndex = 0;
        return escapable.test(str)
            ? '"' + str.replace(escapable, function (a) {
                const c = meta[a];
                return typeof c === 'string' ? c : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
            }) + '"'
            : '"' + str + '"';
    }

    /** Core stringify recursion */
    function internalStringify(holder, key, isTop) {
        const value = getReplacedValue(holder, key, isTop);
        if (value && !isDate(value)) {
            // Unbox objects except Dates
            value = value.valueOf();
        }
        switch (typeof value) {
            case "boolean":
                return value.toString();
            case "number":
                return (isNaN(value) || !isFinite(value)) ? "null" : value.toString();
            case "string":
                return escapeString(value);
            case "object":
                if (value === null) return "null";
                if (isArray(value)) return stringifyArray(value);
                return stringifyObject(value);
            default:
                return undefined; // functions, undefined
        }
    }

    function stringifyArray(arr) {
        checkCircular(arr);
        stack.push(arr);
        let result = "[";
        for (let i = 0; i < arr.length; i++) {
            const item = internalStringify(arr, i, false);
            result += makeIndent(indentStr, stack.length);
            result += (item === null || item === undefined) ? "null" : item;
            result += i < arr.length - 1 ? "," : "";
        }
        if (indentStr) result += "\n";
        stack.pop();
        result += makeIndent(indentStr, stack.length, true) + "]";
        return result;
    }

    function stringifyObject(obj) {
        checkCircular(obj);
        stack.push(obj);
        let result = "{";
        let hasProps = false;
        for (const prop in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, prop)) {
                const val = internalStringify(obj, prop, false);
                if (val !== undefined && val !== null) {
                    result += makeIndent(indentStr, stack.length);
                    const key = isWord(prop) ? prop : escapeString(prop);
                    result += key + ":" + (indentStr ? " " : "") + val + ",";
                    hasProps = true;
                }
            }
        }
        stack.pop();
        if (hasProps) {
            result = result.slice(0, -1) + makeIndent(indentStr, stack.length) + "}";
        } else {
            result = "{}";
        }
        return result;
    }

    // Handle top-level undefined
    const topHolder = { "": obj };
    if (obj === undefined) {
        return getReplacedValue(topHolder, "", true);
    }
    return internalStringify(topHolder, "", true);
};