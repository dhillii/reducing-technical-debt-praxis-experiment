var JSON5 = (typeof exports === 'object' ? exports : {});

JSON5.parse = (function () {
    "use strict";

    // ---------- Helper predicates ----------
    /** @returns {boolean} */
    const isWhitespace = (ch) => ws.indexOf(ch) >= 0;

    /** @returns {boolean} */
    const isIdentifierStart = (ch) => (ch === '_' || ch === '$' ||
        (ch >= 'a' && ch <= 'z') ||
        (ch >= 'A' && ch <= 'Z'));

    /** @returns {boolean} */
    const isIdentifierPart = (ch) => isIdentifierStart(ch) ||
        (ch >= '0' && ch <= '9');

    /** @returns {boolean} */
    const isHexDigit = (ch) => (ch >= '0' && ch <= '9') ||
        (ch >= 'A' && ch <= 'F') ||
        (ch >= 'a' && ch <= 'f');

    // ---------- Parser state ----------
    let at, ch, text;

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
        ' ', '\t', '\r', '\n', '\v', '\f', '\xA0', '\uFEFF'
    ];

    const error = (m) => {
        const err = new SyntaxError();
        err.message = m;
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

    // ---------- Token parsers ----------
    const identifier = () => {
        if (!isIdentifierStart(ch)) {
            error("Bad identifier");
        }
        let key = ch;
        while (next() && isIdentifierPart(ch)) {
            key += ch;
        }
        return key;
    };

    const number = () => {
        let sign = '';
        let str = '';
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

        if (ch === '0') {
            str += ch;
            next();
            if (ch === 'x' || ch === 'X') {
                str += ch;
                next();
                base = 16;
            } else if (ch >= '0' && ch <= '9') {
                error('Octal literal');
            }
        }

        if (base === 10) {
            while (ch >= '0' && ch <= '9') {
                str += ch;
                next();
            }
            if (ch === '.') {
                str += '.';
                while (next() && ch >= '0' && ch <= '9') {
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
                while (ch >= '0' && ch <= '9') {
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
    };

    const string = () => {
        if (ch !== '"' && ch !== "'") {
            error("Bad string");
        }
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
                    let uffff = 0;
                    for (let i = 0; i < 4; i++) {
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
                } else if (escapee[ch] !== undefined) {
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
    };

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

    const white = () => {
        while (ch) {
            if (ch === '/') {
                comment();
            } else if (isWhitespace(ch)) {
                next();
            } else {
                return;
            }
        }
    };

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
                next('I'); next('n'); next('f'); next('i'); next('n');
                next('i'); next('t'); next('y');
                return Infinity;
            case 'N':
                next('N'); next('a'); next('N');
                return NaN;
        }
        error("Unexpected '" + ch + "'");
    };

    // ---------- Structural parsers ----------
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

    const value = () => {
        white();
        switch (ch) {
            case '{': return object();
            case '[': return array();
            case '"':
            case "'": return string();
            case '-':
            case '+':
            case '.': return number();
            default:
                return (ch >= '0' && ch <= '9') ? number() : word();
        }
    };

    // ---------- Reviver walk ----------
    const walk = (holder, key, reviver) => {
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
    };

    // ---------- Public parse function ----------
    return (source, reviver) => {
        text = String(source);
        at = 0;
        ch = ' ';
        const result = value();
        white();
        if (ch) {
            error("Syntax error");
        }
        if (typeof reviver === 'function') {
            return walk({ '': result }, '', reviver);
        }
        return result;
    };
}());

JSON5.stringify = (obj, replacer, space) => {
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
    JSON5.isWord = isWord;

    const isArray = (obj) => Array.isArray ? Array.isArray(obj) :
        Object.prototype.toString.call(obj) === '[object Array]';

    const isDate = (obj) => Object.prototype.toString.call(obj) === '[object Date]';

    const isNaNPoly = (val) => typeof val === 'number' && val !== val;
    const isNaN = globalThis.isNaN || isNaNPoly;

    const objStack = [];

    const checkForCircular = (value) => {
        for (let i = 0; i < objStack.length; i++) {
            if (objStack[i] === value) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    const makeIndent = (str, num, noNewLine) => {
        if (!str) return "";
        const base = str.length > 10 ? str.substring(0, 10) : str;
        let indent = noNewLine ? "" : "\n";
        for (let i = 0; i < num; i++) {
            indent += base;
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

    const escapeString = (str) => {
        escapable.lastIndex = 0;
        return escapable.test(str) ?
            '"' + str.replace(escapable, (a) => {
                const c = meta[a];
                return typeof c === 'string' ? c : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
            }) + '"' :
            '"' + str + '"';
    };

    const stringifyArray = (arr) => {
        checkForCircular(arr);
        objStack.push(arr);
        let buffer = "[";
        for (let i = 0; i < arr.length; i++) {
            const item = internalStringify(arr, i, false);
            buffer += makeIndent(indentStr, objStack.length);
            buffer += (item === null || item === undefined) ? "null" : item;
            buffer += i < arr.length - 1 ? "," : indentStr ? "\n" : "";
        }
        objStack.pop();
        buffer += makeIndent(indentStr, objStack.length, true) + "]";
        return buffer;
    };

    const stringifyObject = (objPart) => {
        checkForCircular(objPart);
        objStack.push(objPart);
        let buffer = "{";
        let nonEmpty = false;
        for (const prop in objPart) {
            if (Object.prototype.hasOwnProperty.call(objPart, prop)) {
                const val = internalStringify(objPart, prop, false);
                if (val !== undefined && val !== null) {
                    buffer += makeIndent(indentStr, objStack.length);
                    nonEmpty = true;
                    const key = isWord(prop) ? prop : escapeString(prop);
                    buffer += key + ":" + (indentStr ? ' ' : '') + val + ",";
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
                if (objPart === null) return "null";
                if (isArray(objPart)) return stringifyArray(objPart);
                return stringifyObject(objPart);
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