const JSON5 = (typeof exports === 'object' ? exports : {});

JSON5.parse = (function () {
    "use strict";

    let at;
    let ch;
    let text;

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

    /** @private */
    function error(m) {
        const err = new SyntaxError();
        err.message = m;
        err.at = at;
        err.text = text;
        throw err;
    }

    /** @private */
    function next(c) {
        if (c && c !== ch) {
            error(`Expected '${c}' instead of '${ch}'`);
        }
        ch = text.charAt(at);
        at += 1;
        return ch;
    }

    /** @private */
    function peek() {
        return text.charAt(at);
    }

    /** @private */
    function isIdentifierStart(ch) {
        return ch === '_' || ch === '$' ||
            (ch >= 'a' && ch <= 'z') ||
            (ch >= 'A' && ch <= 'Z');
    }

    /** @private */
    function isIdentifierPart(ch) {
        return isIdentifierStart(ch) || (ch >= '0' && ch <= '9');
    }

    /** @private */
    function isDigit(ch) {
        return ch >= '0' && ch <= '9';
    }

    /** @private */
    function isHexDigit(ch) {
        return (ch >= '0' && ch <= '9') ||
            (ch >= 'a' && ch <= 'f') ||
            (ch >= 'A' && ch <= 'F');
    }

    /** @private */
    function isWhitespace(ch) {
        return ws.indexOf(ch) >= 0;
    }

    /** @private */
    function identifier() {
        let key = ch;
        if (!isIdentifierStart(ch)) {
            error("Bad identifier");
        }
        while (next() && isIdentifierPart(ch)) {
            key += ch;
        }
        return key;
    }

    /** @private */
    function number() {
        let sign = '';
        let base = 10;
        if (ch === '-' || ch === '+') {
            sign = ch;
            next(ch);
        }

        if (ch === 'I') {
            const num = word();
            if (typeof num !== 'number' || isNaN(num)) {
                error('Unexpected word for number');
            }
            return sign === '-' ? -num : num;
        }

        if (ch === 'N') {
            const num = word();
            if (!isNaN(num)) {
                error('expected word to be NaN');
            }
            return num;
        }

        let str = '';
        if (ch === '0') {
            str += ch;
            next();
            if (ch === 'x' || ch === 'X') {
                str += ch;
                next();
                base = 16;
            } else if (isDigit(ch)) {
                error('Octal literal');
            }
        }

        if (base === 10) {
            while (isDigit(ch)) {
                str += ch;
                next();
            }
            if (ch === '.') {
                str += '.';
                while (next() && isDigit(ch)) {
                    str += ch;
                }
            }
            if (ch === 'e' || ch === 'E') {
                str += ch;
                next();
                if (ch === '-' || ch === '+') {
                    str += ch;
                    next();
                }
                while (isDigit(ch)) {
                    str += ch;
                    next();
                }
            }
        } else {
            while (isHexDigit(ch)) {
                str += ch;
                next();
            }
        }

        const num = sign === '-' ? -str : +str;
        if (!isFinite(num)) {
            error("Bad number");
        }
        return num;
    }

    /** @private */
    function string() {
        let result = '';
        let delim;
        if (ch !== '"' && ch !== "'") {
            error("Bad string");
        }
        delim = ch;
        while (next()) {
            if (ch === delim) {
                next();
                return result;
            }
            if (ch === '\\') {
                next();
                if (ch === 'u') {
                    let uffff = 0;
                    for (let i = 0; i < 4; i += 1) {
                        const hex = parseInt(next(), 16);
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
        error("Bad string");
    }

    /** @private */
    function inlineComment() {
        if (ch !== '/') {
            error("Not an inline comment");
        }
        while (next()) {
            if (ch === '\n' || ch === '\r') {
                next();
                return;
            }
        }
    }

    /** @private */
    function blockComment() {
        if (ch !== '*') {
            error("Not a block comment");
        }
        while (next()) {
            while (ch === '*') {
                next();
                if (ch === '/') {
                    next();
                    return;
                }
            }
        }
        error("Undterminated block comment");
    }

    /** @private */
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

    /** @private */
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

    /** @private */
    function word() {
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
    }

    /** @private */
    function array() {
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
    }

    /** @private */
    function object() {
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
            let key;
            if (ch === '"' || ch === "'") {
                key = string();
            } else {
                key = identifier();
            }
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
    }

    /** @private */
    function value() {
        white();
        if (ch === '{') return object();
        if (ch === '[') return array();
        if (ch === '"' || ch === "'") return string();
        if (ch === '-' || ch === '+' || ch === '.' || isDigit(ch)) return number();
        return word();
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
            })({ '': result }, '');
        }
        return result;
    };
}());

JSON5.stringify = function (obj, replacer, space) {
    if (replacer && (typeof replacer !== "function" && !isArray(replacer))) {
        throw new Error('Replacer must be a function or an array');
    }

    /** @private */
    function getReplacedValueOrUndefined(holder, key, isTopLevel) {
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
    }

    /** @private */
    function isWordChar(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            (char >= '0' && char <= '9') ||
            char === '_' || char === '$';
    }

    /** @private */
    function isWordStart(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            char === '_' || char === '$';
    }

    /** @private */
    function isWord(key) {
        if (typeof key !== 'string') return false;
        if (!isWordStart(key[0])) return false;
        for (let i = 1; i < key.length; i++) {
            if (!isWordChar(key[i])) return false;
        }
        return true;
    }

    JSON5.isWord = isWord;

    /** @private */
    function isArray(obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        }
        return Object.prototype.toString.call(obj) === '[object Array]';
    }

    /** @private */
    function isDate(obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    }

    /* global isNaN */
    isNaN = isNaN || function (val) {
        return typeof val === 'number' && val !== val;
    };

    const objStack = [];

    /** @private */
    function checkForCircular(o) {
        for (let i = 0; i < objStack.length; i++) {
            if (objStack[i] === o) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    }

    /** @private */
    function makeIndent(str, num, noNewLine) {
        if (!str) return "";
        if (str.length > 10) str = str.substring(0, 10);
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

    /** @private */
    function escapeString(str) {
        escapable.lastIndex = 0;
        if (!escapable.test(str)) {
            return `"${str}"`;
        }
        return '"' + str.replace(escapable, function (a) {
            const c = meta[a];
            return typeof c === 'string' ? c : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"';
    }

    /** @private */
    function stringifyArray(arr) {
        checkForCircular(arr);
        objStack.push(arr);
        let buffer = "[";
        for (let i = 0; i < arr.length; i++) {
            const res = internalStringify(arr, i, false);
            buffer += makeIndent(indentStr, objStack.length);
            buffer += (res === null || typeof res === "undefined") ? "null" : res;
            buffer += (i < arr.length - 1) ? "," : (indentStr ? "\n" : "");
        }
        objStack.pop();
        buffer += makeIndent(indentStr, objStack.length, true) + "]";
        return buffer;
    }

    /** @private */
    function stringifyObject(o) {
        checkForCircular(o);
        objStack.push(o);
        let buffer = "{";
        let nonEmpty = false;
        for (const prop in o) {
            if (Object.prototype.hasOwnProperty.call(o, prop)) {
                const valueStr = internalStringify(o, prop, false);
                if (typeof valueStr !== "undefined" && valueStr !== null) {
                    buffer += makeIndent(indentStr, objStack.length);
                    nonEmpty = true;
                    const key = isWord(prop) ? prop : escapeString(prop);
                    buffer += key + ":" + (indentStr ? " " : "") + valueStr + ",";
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
    }

    /** @private */
    function internalStringify(holder, key, isTopLevel) {
        const objPart = getReplacedValueOrUndefined(holder, key, isTopLevel);
        if (objPart && !isDate(objPart)) {
            // unbox objects except dates
            return stringifyValue(objPart);
        }
        return stringifyValue(objPart);
    }

    /** @private */
    function stringifyValue(val) {
        switch (typeof val) {
            case "boolean":
                return val.toString();
            case "number":
                if (isNaN(val) || !isFinite(val)) return "null";
                return val.toString();
            case "string":
                return escapeString(val);
            case "object":
                if (val === null) return "null";
                if (isArray(val)) return stringifyArray(val);
                return stringifyObject(val);
            default:
                return undefined;
        }
    }

    const topLevelHolder = { "": obj };
    if (obj === undefined) {
        return getReplacedValueOrUndefined(topLevelHolder, '', true);
    }
    return internalStringify(topLevelHolder, '', true);
};