// json5.js
// Modern JSON. See README.md for details.
//
// This file is based directly off of Douglas Crockford's json_parse.js:
// https://github.com/douglascrockford/JSON-js/blob/master/json_parse.js

var JSON5 = (typeof exports === 'object' ? exports : {});

JSON5.parse = (function () {
    "use strict";

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

    let at, ch, text;

    const error = (msg) => {
        const err = new SyntaxError();
        err.message = msg;
        err.at = at;
        err.text = text;
        throw err;
    };

    const next = (c) => {
        if (c && c !== ch) {
            error("Expected '" + c + "' instead of '" + ch + "'");
        }
        ch = text.charAt(at);
        at += 1;
        return ch;
    };

    const peek = () => text.charAt(at);

    const identifier = () => {
        let key = ch;
        if ((ch !== '_' && ch !== '$') && (ch < 'a' || ch > 'z') && (ch < 'A' || ch > 'Z')) {
            error("Bad identifier");
        }
        while (next() && (ch === '_' || ch === '$' || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9'))) {
            key += ch;
        }
        return key;
    };

    // ----- Number parsing helpers -----
    const readSign = () => {
        let sign = '';
        if (ch === '-' || ch === '+') {
            sign = ch;
            next(ch);
        }
        return sign;
    };

    const readBasePrefix = (sign) => {
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
        return { base, numStr };
    };

    const readDigits = (base, startStr) => {
        let str = startStr;
        const digitCond = base === 10
            ? (c) => c >= '0' && c <= '9'
            : (c) => (c >= '0' && c <= '9') || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f');
        while (digitCond(ch)) {
            str += ch;
            next();
        }
        return str;
    };

    const readFraction = (str) => {
        if (ch === '.') {
            str += '.';
            while (next() && ch >= '0' && ch <= '9') {
                str += ch;
            }
        }
        return str;
    };

    const readExponent = (str) => {
        if (ch === 'e' || ch === 'E') {
            str += ch;
            next();
            if (ch === '-' || ch === '+') {
                str += ch;
                next();
            }
            while (ch >= '0' && ch <= '9') {
                str += ch;
                next();
            }
        }
        return str;
    };

    const constructNumber = (sign, str) => {
        const num = sign === '-' ? -str : +str;
        if (!isFinite(num)) error("Bad number");
        return num;
    };

    const parseNumber = () => {
        const sign = readSign();

        // Infinity and NaN handling
        if (ch === 'I') {
            const num = parseWord();
            if (typeof num !== 'number' || isNaN(num)) error('Unexpected word for number');
            return sign === '-' ? -num : num;
        }
        if (ch === 'N') {
            const num = parseWord();
            if (!isNaN(num)) error('expected word to be NaN');
            return num; // sign ignored for NaN
        }

        const { base, numStr: prefix } = readBasePrefix(sign);
        let numberStr = readDigits(base, prefix);
        if (base === 10) {
            numberStr = readFraction(numberStr);
            numberStr = readExponent(numberStr);
        }
        return constructNumber(sign, numberStr);
    };

    const parseString = () => {
        let hex, i, result = '', delim, uffff;
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
                            if (!isFinite(hex)) break;
                            uffff = uffff * 16 + hex;
                        }
                        result += String.fromCharCode(uffff);
                    } else if (ch === '\r') {
                        if (peek() === '\n') next();
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

    const skipInlineComment = () => {
        if (ch !== '/') error("Not an inline comment");
        do {
            next();
            if (ch === '\n' || ch === '\r') {
                next();
                return;
            }
        } while (ch);
    };

    const skipBlockComment = () => {
        if (ch !== '*') error("Not a block comment");
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

    const skipComment = () => {
        if (ch !== '/') error("Not a comment");
        next('/');
        if (ch === '/') {
            skipInlineComment();
        } else if (ch === '*') {
            skipBlockComment();
        } else {
            error("Unrecognized comment");
        }
    };

    const skipWhiteSpace = () => {
        while (ch) {
            if (ch === '/') {
                skipComment();
            } else if (ws.indexOf(ch) >= 0) {
                next();
            } else {
                return;
            }
        }
    };

    const parseWord = () => {
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
        error("Unexpected '" + ch + "'");
    };

    const parseArray = () => {
        const arr = [];
        if (ch === '[') {
            next('[');
            skipWhiteSpace();
            while (ch) {
                if (ch === ']') {
                    next(']');
                    return arr;
                }
                if (ch === ',') error("Missing array element");
                arr.push(parseValue());
                skipWhiteSpace();
                if (ch !== ',') {
                    next(']');
                    return arr;
                }
                next(',');
                skipWhiteSpace();
            }
        }
        error("Bad array");
    };

    const parseObject = () => {
        const obj = {};
        if (ch === '{') {
            next('{');
            skipWhiteSpace();
            while (ch) {
                if (ch === '}') {
                    next('}');
                    return obj;
                }
                const key = (ch === '"' || ch === "'") ? parseString() : identifier();
                skipWhiteSpace();
                next(':');
                obj[key] = parseValue();
                skipWhiteSpace();
                if (ch !== ',') {
                    next('}');
                    return obj;
                }
                next(',');
                skipWhiteSpace();
            }
        }
        error("Bad object");
    };

    const parseValue = () => {
        skipWhiteSpace();
        switch (ch) {
            case '{': return parseObject();
            case '[': return parseArray();
            case '"':
            case "'": return parseString();
            case '-':
            case '+':
            case '.': return parseNumber();
            default:
                return (ch >= '0' && ch <= '9') ? parseNumber() : parseWord();
        }
    };

    const walkReviver = (holder, key, rev) => {
        const value = holder[key];
        if (value && typeof value === 'object') {
            for (const k in value) {
                if (Object.prototype.hasOwnProperty.call(value, k)) {
                    const v = walkReviver(value, k, rev);
                    if (v !== undefined) {
                        value[k] = v;
                    } else {
                        delete value[k];
                    }
                }
            }
        }
        return rev.call(holder, key, value);
    };

    return (source, reviver) => {
        text = String(source);
        at = 0;
        ch = ' ';
        const result = parseValue();
        skipWhiteSpace();
        if (ch) error("Syntax error");
        if (typeof reviver === 'function') {
            return walkReviver({ '': result }, '', reviver);
        }
        return result;
    };
}());

// JSON5 stringify will not quote keys where appropriate
JSON5.stringify = function (obj, replacer, space) {
    if (replacer && (typeof replacer !== "function" && !isArray(replacer))) {
        throw new Error('Replacer must be a function or an array');
    }

    const getReplacedValueOrUndefined = (holder, key, isTopLevel) => {
        let value = holder[key];
        if (value && typeof value.toJSON === "function") {
            value = value.toJSON();
        }
        if (typeof replacer === "function") {
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

    const isWordChar = (c) => (c >= 'a' && c <= 'z') ||
        (c >= 'A' && c <= 'Z') ||
        (c >= '0' && c <= '9') ||
        c === '_' || c === '$';

    const isWordStart = (c) => (c >= 'a' && c <= 'z') ||
        (c >= 'A' && c <= 'Z') ||
        c === '_' || c === '$';

    const isWord = (key) => {
        if (typeof key !== 'string') return false;
        if (!isWordStart(key[0])) return false;
        for (let i = 1; i < key.length; i++) {
            if (!isWordChar(key[i])) return false;
        }
        return true;
    };

    JSON5.isWord = isWord;

    const isArray = (obj) => Array.isArray ? Array.isArray(obj) : Object.prototype.toString.call(obj) === '[object Array]';

    const isDate = (obj) => Object.prototype.toString.call(obj) === '[object Date]';

    const isNaNPoly = (val) => typeof val === 'number' && val !== val;

    const objStack = [];

    const checkForCircular = (o) => {
        for (let i = 0; i < objStack.length; i++) {
            if (objStack[i] === o) throw new TypeError("Converting circular structure to JSON");
        }
    };

    const makeIndent = (str, num, noNewLine) => {
        if (!str) return "";
        if (str.length > 10) str = str.substring(0, 10);
        let indent = noNewLine ? "" : "\n";
        for (let i = 0; i < num; i++) indent += str;
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

    const escapeString = (str) => {
        escapable.lastIndex = 0;
        return escapable.test(str)
            ? '"' + str.replace(escapable, (a) => {
                const c = meta[a];
                return typeof c === 'string' ? c : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
            }) + '"'
            : '"' + str + '"';
    };

    const stringifyArray = (arr, depth) => {
        checkForCircular(arr);
        objStack.push(arr);
        let buffer = "[";
        for (let i = 0; i < arr.length; i++) {
            const item = internalStringify(arr, i, false, depth + 1);
            buffer += makeIndent(indentStr, objStack.length);
            buffer += (item === null || typeof item === "undefined") ? "null" : item;
            buffer += i < arr.length - 1 ? "," : (indentStr ? "\n" : "");
        }
        objStack.pop();
        buffer += makeIndent(indentStr, objStack.length, true) + "]";
        return buffer;
    };

    const stringifyObject = (obj, depth) => {
        checkForCircular(obj);
        objStack.push(obj);
        let buffer = "{";
        let nonEmpty = false;
        for (const prop in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, prop)) {
                const valueStr = internalStringify(obj, prop, false, depth + 1);
                if (typeof valueStr !== "undefined" && valueStr !== null) {
                    buffer += makeIndent(indentStr, objStack.length);
                    nonEmpty = true;
                    const key = isWord(prop) ? prop : escapeString(prop);
                    buffer += key + ":" + (indentStr ? ' ' : '') + valueStr + ",";
                }
            }
        }
        objStack.pop();
        if (nonEmpty) {
            buffer = buffer.slice(0, -1) + makeIndent(indentStr, objStack.length) + "}";
        } else {
            buffer = "{}";
        }
        return buffer;
    };

    const internalStringify = (holder, key, isTopLevel, depth = 0) => {
        const objPart = getReplacedValueOrUndefined(holder, key, isTopLevel);
        let value = objPart;
        if (value && !isDate(value)) value = value.valueOf();

        switch (typeof value) {
            case "boolean":
                return value.toString();
            case "number":
                return (isNaNPoly(value) || !isFinite(value)) ? "null" : value.toString();
            case "string":
                return escapeString(value);
            case "object":
                if (value === null) return "null";
                if (isArray(value)) return stringifyArray(value, depth);
                return stringifyObject(value, depth);
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