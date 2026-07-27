// json5.js
// Modern JSON. See README.md for details.
//
// This file is based directly off of Douglas Crockford's json_parse.js:
// https://github.com/douglascrockford/JSON-js/blob/master/json_parse.js

var JSON5 = (typeof exports === 'object' ? exports : {});

JSON5.parse = (function () {
    "use strict";

    // Parser state
    let at;
    let ch;
    let text;

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

    // ---------- Error handling ----------
    const parseError = (msg) => {
        const err = new SyntaxError();
        err.message = msg;
        err.at = at;
        err.text = text;
        throw err;
    };

    // ---------- Character utilities ----------
    const advance = (expected) => {
        if (expected && expected !== ch) {
            parseError(`Expected '${expected}' instead of '${ch}'`);
        }
        ch = text.charAt(at);
        at += 1;
        return ch;
    };

    const peekChar = () => text.charAt(at);

    // ---------- Identifier ----------
    const parseIdentifier = () => {
        let key = ch;
        if ((ch !== '_' && ch !== '$') && (ch < 'a' || ch > 'z') && (ch < 'A' || ch > 'Z')) {
            parseError("Bad identifier");
        }
        while (advance() && (ch === '_' || ch === '$' ||
            (ch >= 'a' && ch <= 'z') ||
            (ch >= 'A' && ch <= 'Z') ||
            (ch >= '0' && ch <= '9'))) {
            key += ch;
        }
        return key;
    };

    // ---------- Number ----------
    const parseNumber = () => {
        let sign = '';
        let numStr = '';
        let base = 10;

        if (ch === '-' || ch === '+') {
            sign = ch;
            advance(ch);
        }

        // Infinity
        if (ch === 'I') {
            const val = parseWord();
            if (typeof val !== 'number' || isNaN(val)) {
                parseError('Unexpected word for number');
            }
            return sign === '-' ? -val : val;
        }

        // NaN
        if (ch === 'N') {
            const val = parseWord();
            if (!isNaN(val)) {
                parseError('expected word to be NaN');
            }
            return val;
        }

        // Hexadecimal or octal check
        if (ch === '0') {
            numStr += ch;
            advance();
            if (ch === 'x' || ch === 'X') {
                numStr += ch;
                advance();
                base = 16;
            } else if (ch >= '0' && ch <= '9') {
                parseError('Octal literal');
            }
        }

        if (base === 10) {
            while (ch >= '0' && ch <= '9') {
                numStr += ch;
                advance();
            }
            if (ch === '.') {
                numStr += '.';
                while (advance() && ch >= '0' && ch <= '9') {
                    numStr += ch;
                }
            }
            if (ch === 'e' || ch === 'E') {
                numStr += ch;
                advance();
                if (ch === '-' || ch === '+') {
                    numStr += ch;
                    advance();
                }
                while (ch >= '0' && ch <= '9') {
                    numStr += ch;
                    advance();
                }
            }
        } else {
            while ((ch >= '0' && ch <= '9') ||
                (ch >= 'A' && ch <= 'F') ||
                (ch >= 'a' && ch <= 'f')) {
                numStr += ch;
                advance();
            }
        }

        const number = sign === '-' ? -numStr : +numStr;
        if (!isFinite(number)) {
            parseError("Bad number");
        }
        return number;
    };

    // ---------- String ----------
    const parseString = () => {
        let result = '';
        let delim;
        let uffff;
        let i;
        let hex;

        if (ch === '"' || ch === "'") {
            delim = ch;
            while (advance()) {
                if (ch === delim) {
                    advance();
                    return result;
                }
                if (ch === '\\') {
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
                        result += String.fromCharCode(uffff);
                    } else if (ch === '\r') {
                        if (peekChar() === '\n') {
                            advance();
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
        parseError("Bad string");
    };

    // ---------- Comments ----------
    const skipInlineComment = () => {
        if (ch !== '/') {
            parseError("Not an inline comment");
        }
        do {
            advance();
            if (ch === '\n' || ch === '\r') {
                advance();
                return;
            }
        } while (ch);
    };

    const skipBlockComment = () => {
        if (ch !== '*') {
            parseError("Not a block comment");
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
        parseError("Undetermined block comment");
    };

    const skipComment = () => {
        if (ch !== '/') {
            parseError("Not a comment");
        }
        advance('/');
        if (ch === '/') {
            skipInlineComment();
        } else if (ch === '*') {
            skipBlockComment();
        } else {
            parseError("Unrecognized comment");
        }
    };

    // ---------- Whitespace ----------
    const skipWhitespace = () => {
        while (ch) {
            if (ch === '/') {
                skipComment();
            } else if (ws.indexOf(ch) >= 0) {
                advance();
            } else {
                return;
            }
        }
    };

    // ---------- Literals ----------
    const parseWord = () => {
        switch (ch) {
            case 't':
                advance('t'); advance('r'); advance('u'); advance('e');
                return true;
            case 'f':
                advance('f'); advance('a'); advance('l'); advance('s'); advance('e');
                return false;
            case 'n':
                advance('n'); advance('u'); advance('l'); advance('l');
                return null;
            case 'I':
                advance('I'); advance('n'); advance('f'); advance('i'); advance('n'); advance('i'); advance('t'); advance('y');
                return Infinity;
            case 'N':
                advance('N'); advance('a'); advance('N');
                return NaN;
        }
        parseError(`Unexpected '${ch}'`);
    };

    // ---------- Array ----------
    const parseArray = () => {
        const arr = [];
        if (ch === '[') {
            advance('[');
            skipWhitespace();
            while (ch) {
                if (ch === ']') {
                    advance(']');
                    return arr;
                }
                if (ch === ',') {
                    parseError("Missing array element");
                }
                arr.push(parseValue());
                skipWhitespace();
                if (ch !== ',') {
                    advance(']');
                    return arr;
                }
                advance(',');
                skipWhitespace();
            }
        }
        parseError("Bad array");
    };

    // ---------- Object ----------
    const parseObject = () => {
        const obj = {};
        if (ch === '{') {
            advance('{');
            skipWhitespace();
            while (ch) {
                if (ch === '}') {
                    advance('}');
                    return obj;
                }
                const key = (ch === '"' || ch === "'") ? parseString() : parseIdentifier();
                skipWhitespace();
                advance(':');
                obj[key] = parseValue();
                skipWhitespace();
                if (ch !== ',') {
                    advance('}');
                    return obj;
                }
                advance(',');
                skipWhitespace();
            }
        }
        parseError("Bad object");
    };

    // ---------- Value ----------
    const parseValue = () => {
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
                return (ch >= '0' && ch <= '9') ? parseNumber() : parseWord();
        }
    };

    // ---------- Reviver walk ----------
    const walkReviver = (holder, key, reviver) => {
        const value = holder[key];
        if (value && typeof value === 'object') {
            for (const k in value) {
                if (Object.prototype.hasOwnProperty.call(value, k)) {
                    const v = walkReviver(value, k, reviver);
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

    // ---------- Public parse ----------
    return (source, reviver) => {
        text = String(source);
        at = 0;
        ch = ' ';
        const result = parseValue();
        skipWhitespace();
        if (ch) {
            parseError("Syntax error");
        }
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

    const isWordChar = (char) => (char >= 'a' && char <= 'z') ||
        (char >= 'A' && char <= 'Z') ||
        (char >= '0' && char <= '9') ||
        char === '_' || char === '$';

    const isWordStart = (char) => (char >= 'a' && char <= 'z') ||
        (char >= 'A' && char <= 'Z') ||
        char === '_' || char === '$';

    const isWord = (key) => {
        if (typeof key !== 'string') return false;
        if (!isWordStart(key[0])) return false;
        for (let i = 1; i < key.length; i++) {
            if (!isWordChar(key[i])) return false;
        }
        return true;
    };

    // export for use in tests
    JSON5.isWord = isWord;

    // polyfills
    const isArray = (obj) => Array.isArray ? Array.isArray(obj) :
        Object.prototype.toString.call(obj) === '[object Array]';

    const isDate = (obj) => Object.prototype.toString.call(obj) === '[object Date]';

    const isNaNPoly = (val) => typeof val === 'number' && val !== val;
    const isNaNCheck = isNaN || isNaNPoly;

    const objStack = [];

    const checkForCircular = (obj) => {
        for (let i = 0; i < objStack.length; i++) {
            if (objStack[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    const makeIndent = (str, num, noNewLine) => {
        if (!str) return "";
        if (str.length > 10) str = str.substring(0, 10);
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
        return escapable.test(string) ?
            '"' + string.replace(escapable, (a) => {
                const c = meta[a];
                return typeof c === 'string' ? c : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
            }) + '"' :
            '"' + string + '"';
    };

    const internalStringify = (holder, key, isTopLevel) => {
        const objPart = getReplacedValueOrUndefined(holder, key, isTopLevel);
        let value = objPart;

        if (value && !isDate(value)) {
            value = value.valueOf();
        }

        switch (typeof value) {
            case "boolean":
                return value.toString();
            case "number":
                return (isNaNCheck(value) || !isFinite(value)) ? "null" : value.toString();
            case "string":
                return escapeString(value);
            case "object":
                if (value === null) {
                    return "null";
                }
                if (isArray(value)) {
                    checkForCircular(value);
                    objStack.push(value);
                    let buffer = "[";
                    for (let i = 0; i < value.length; i++) {
                        const res = internalStringify(value, i, false);
                        buffer += makeIndent(indentStr, objStack.length);
                        buffer += (res === null || typeof res === "undefined") ? "null" : res;
                        buffer += (i < value.length - 1) ? "," : (indentStr ? "\n" : "");
                    }
                    objStack.pop();
                    buffer += makeIndent(indentStr, objStack.length, true) + "]";
                    return buffer;
                }
                checkForCircular(value);
                objStack.push(value);
                let buf = "{";
                let nonEmpty = false;
                for (const prop in value) {
                    if (Object.prototype.hasOwnProperty.call(value, prop)) {
                        const v = internalStringify(value, prop, false);
                        if (v !== undefined && v !== null) {
                            buf += makeIndent(indentStr, objStack.length);
                            nonEmpty = true;
                            const keyStr = isWord(prop) ? prop : escapeString(prop);
                            buf += keyStr + ":" + (indentStr ? ' ' : '') + v + ",";
                        }
                    }
                }
                objStack.pop();
                if (nonEmpty) {
                    buf = buf.slice(0, -1) + makeIndent(indentStr, objStack.length) + "}";
                } else {
                    buf = "{}";
                }
                return buf;
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