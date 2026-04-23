const JSON5 = (typeof exports === 'object' ? exports : {});

JSON5.parse = (function () {
    "use strict";

    let at, ch, text;

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

    const error = (m) => {
        const err = new SyntaxError();
        err.message = m;
        err.at = at;
        err.text = text;
        throw err;
    };

    const next = (c) => {
        if (c && c !== ch) {
            error(`Expected '${c}' instead of '${ch}'`);
        }
        ch = text.charAt(at);
        at += 1;
        return ch;
    };

    const peek = () => text.charAt(at);

    const identifier = () => {
        let key = ch;
        if ((ch !== '_' && ch !== '$') &&
            (ch < 'a' || ch > 'z') &&
            (ch < 'A' || ch > 'Z')) {
            error("Bad identifier");
        }
        while (next() && (
            ch === '_' || ch === '$' ||
            (ch >= 'a' && ch <= 'z') ||
            (ch >= 'A' && ch <= 'Z') ||
            (ch >= '0' && ch <= '9')
        )) {
            key += ch;
        }
        return key;
    };

    const number = () => {
        let num, sign = '', str = '', base = 10;
        if (ch === '-' || ch === '+') {
            sign = ch;
            next(ch);
        }
        if (ch === 'I') {
            num = word();
            if (typeof num !== 'number' || isNaN(num)) {
                error('Unexpected word for number');
            }
            return sign === '-' ? -num : num;
        }
        if (ch === 'N') {
            num = word();
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
        switch (base) {
            case 10:
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
                break;
            case 16:
                while (ch >= '0' && ch <= '9' || ch >= 'A' && ch <= 'F' || ch >= 'a' && ch <= 'f') {
                    str += ch;
                    next();
                }
                break;
        }
        num = sign === '-' ? -str : +str;
        if (!isFinite(num)) {
            error("Bad number");
        }
        return num;
    };

    const string = () => {
        let hex, i, str = '', delim, uffff;
        if (ch === '"' || ch === "'") {
            delim = ch;
            while (next()) {
                if (ch === delim) {
                    next();
                    return str;
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
                        str += String.fromCharCode(uffff);
                    } else if (ch === '\r') {
                        if (peek() === '\n') {
                            next();
                        }
                    } else if (typeof escapee[ch] === 'string') {
                        str += escapee[ch];
                    } else {
                        break;
                    }
                } else if (ch === '\n') {
                    break;
                } else {
                    str += ch;
                }
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
        error("Unterminated block comment");
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
            } else if (ws.indexOf(ch) >= 0) {
                next();
            } else {
                return;
            }
        }
    };

    const word = () => {
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
    };

    const array = () => {
        const arr = [];
        if (ch === '[') {
            next('[');
            white();
            while (ch) {
                if (ch === ']') {
                    next(']');
                    return arr;
                }
                if (ch === ',') {
                    error("Missing array element");
                } else {
                    arr.push(value());
                }
                white();
                if (ch !== ',') {
                    next(']');
                    return arr;
                }
                next(',');
                white();
            }
        }
        error("Bad array");
    };

    const object = () => {
        let key, obj = {};
        if (ch === '{') {
            next('{');
            white();
            while (ch) {
                if (ch === '}') {
                    next('}');
                    return obj;
                }
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
        }
        error("Bad object");
    };

    const value = () => {
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
    };

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
        return typeof reviver === 'function' ? (function walk(holder, key) {
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
        }({ '': result }, '')) : result;
    };
}());

JSON5.stringify = function (obj, replacer, space) {
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
        if (typeof key !== 'string') return false;
        if (!isWordStart(key[0])) return false;
        for (let i = 1, length = key.length; i < length; i++) {
            if (!isWordChar(key[i])) return false;
        }
        return true;
    };

    JSON5.isWord = isWord;

    const isArray = (obj) => Array.isArray ? Array.isArray(obj) : Object.prototype.toString.call(obj) === '[object Array]';

    const isDate = (obj) => Object.prototype.toString.call(obj) === '[object Date]';

    isNaN = isNaN || function (val) {
        return typeof val === 'number' && val !== val;
    };

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
        '"' : '\\"',
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
        let buffer, res;
        let obj_part = getReplacedValueOrUndefined(holder, key, isTopLevel);
        if (obj_part && !isDate(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch (typeof obj_part) {
            case "boolean":
                return obj_part.toString();
            case "number":
                if (isNaN(obj_part) || !isFinite(obj_part)) return "null";
                return obj_part.toString();
            case "string":
                return escapeString(obj_part.toString());
            case "object":
                if (obj_part === null) return "null";
                if (isArray(obj_part)) {
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
                    for (const prop in obj_part) {
                        if (Object.prototype.hasOwnProperty.call(obj_part, prop)) {
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
                        buffer = "{}";
                    }
                }
                return buffer;
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