```javascript
// json5.js
// Modern JSON. See README.md for details.
//
// This file is based directly off of Douglas Crockford's json_parse.js:
// https://github.com/douglascrockford/JSON-js/blob/master/json_parse.js

const JSON5 = (typeof exports === 'object' ? exports : {});

JSON5.parse = (function () {
    "use strict";

    // ---------- Parser helpers ----------
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
            error('Bad identifier');
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
            while (ch >= '0' && ch <= '9' ||
                   ch >= 'A' && ch <= 'F' ||
                   ch >= 'a' && ch <= 'f') {
                str += ch;
                next();
            }
        }

        const num = sign === '-' ? -Number(str) : Number(str);
        if (!isFinite(num)) {
            error('Bad number');
        }
        return num;
    };

    const string = () => {
        let hex, i, result = '', delim, uffff;

        if (ch === '"' || ch === "'") {
            delim = ch;
            while (next()) {
                if (ch === delim) {
                    next();
                    return result;
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
        error('Bad string');
    };

    const inlineComment = () => {
        if (ch !== '/') {
            error('Not an inline comment');
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
            error('Not a block comment');
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
        error('Unterminated block comment');
    };

    const comment = () => {
        if (ch !== '/') {
            error('Not a comment');
        }
        next('/');
        if (ch === '/') {
            inlineComment();
        } else if (ch === '*') {
            blockComment();
        } else {
            error('Unrecognized comment');
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
                    error('Missing array element');
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
        error('Bad array');
    };

    const object = () => {
        const obj = {};
        if (ch === '{') {
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
        }
        error('Bad object');
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
            default: return (ch >= '0' && ch <= '9') ? number() : word();
        }
    };

    // ---------- Reviver ----------
    const walk = (holder, key) => {
        const val = holder[key];
        if (val && typeof val === 'object') {
            for (const k in val) {
                if (Object.prototype.hasOwnProperty.call(val, k)) {
                    const v = walk(val, k);
                    if (v !== undefined) {
                        val[k] = v;
                    } else {
                        delete val[k];
                    }
                }
            }
        }
        return typeof reviver === 'function' ? reviver.call(holder, key, val) : val;
    };

    // ---------- Public parse ----------
    return function (source, reviver) {
        text = String(source);
        at = 0;
        ch = ' ';
        const result = value();
        white();
        if (ch) {
            error('Syntax error');
        }
        return typeof reviver === 'function'
            ? walk({ '': result }, '')
            : result;
    };
}());

// ---------- Stringify ----------
JSON5.stringify = function (obj, replacer, space) {
    if (replacer && (typeof replacer !== 'function' && !isArray(replacer))) {
        throw new Error('Replacer must be a function or an array');
    }

    const getReplacedValueOrUndefined = (holder, key, isTopLevel) => {
        let value = holder[key];
        if (value && typeof value.toJSON === 'function') {
            value = value.toJSON();
        }
        if (typeof replacer === 'function') {
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

    const isWordChar = (char) =>
        (char >= 'a' && char <= 'z') ||
        (char >= 'A' && char <= 'Z') ||
        (char >= '0' && char <= '9') ||
        char === '_' || char === '$';

    const isWordStart = (char) =>
        (char >= 'a' && char <= 'z') ||
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

    const isArray = (obj) => Array.isArray(obj);
    const isDate = (obj) => Object.prototype.toString.call(obj) === '[object Date]';

    const checkForCircular = (obj) => {
        for (let i = 0; i < objStack.length; i++) {
            if (objStack[i] === obj) {
                throw new TypeError('Converting circular structure to JSON');
            }
        }
    };

    const makeIndent = (str, num, noNewLine) => {
        if (!str) return '';
        if (str.length > 10) str = str.substring(0, 10);
        let indent = noNewLine ? '' : '\n';
        for (let i = 0; i < num; i++) indent += str;
        return indent;
    };

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

    const stringifyPrimitive = (value) => {
        switch (typeof value) {
            case 'boolean':
                return value.toString();
            case 'number':
                return isNaN(value) || !isFinite(value) ? 'null' : value.toString();
            case 'string':
                return escapeString(value);
            default:
                return undefined;
        }
    };

    const stringifyArray = (arr) => {
        checkForCircular(arr);
        const buffer = ['['];
        objStack.push(arr);
        for (let i = 0; i < arr.length; i++) {
            const res = internalStringify(arr, i, false);
            buffer.push(makeIndent(indentStr, objStack.length));
            buffer.push(res === null || typeof res === 'undefined' ? 'null' : res);
            if (i < arr.length - 1) buffer.push(',');
            else if (indentStr) buffer.push('\n');
        }
        objStack.pop();
        buffer.push(makeIndent(indentStr, objStack.length, true) + ']');
        return buffer.join('');
    };

    const stringifyObject = (obj) => {
        checkForCircular(obj);
        const buffer = ['{'];
        objStack.push(obj);
        let nonEmpty = false;
        for (const prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                const val = internalStringify(obj, prop, false);
                if (typeof val !== 'undefined' && val !== null) {
                    buffer.push(makeIndent(indentStr, objStack.length));
                    nonEmpty = true;
                    const key = isWord(prop) ? prop : escapeString(prop);
                    buffer.push(`${key}:${indentStr ? ' ' : ''}${val},`);
                }
            }
        }
        objStack.pop();
        if (nonEmpty) {
            buffer[buffer.length - 1] = buffer[buffer.length - 1].slice(0, -1);
            buffer.push(makeIndent(indentStr, objStack.length) + '}');
        } else {
            buffer.push('}');
        }
        return buffer.join('');
    };

    const internalStringify = (holder, key, isTopLevel) => {
        let objPart = getReplacedValueOrUndefined(holder, key, isTopLevel);
        if (objPart && !isDate(objPart)) objPart = objPart.valueOf();

        if (objPart === null) return 'null';
        if (isArray(objPart)) return stringifyArray(objPart);
        if (typeof objPart === 'object') return stringifyObject(objPart);
        return stringifyPrimitive(objPart);
    };

    const objStack = [];
    let indentStr;
    if (space) {
        if (typeof space === 'string') indentStr = space;
        else if (typeof space === 'number' && space >= 0) indentStr = makeIndent(' ', space, true);
    }

    const topLevelHolder = { '': obj };
    if (obj === undefined) {
        return getReplacedValueOrUndefined(topLevelHolder, '', true);
    }
    return internalStringify(topLevelHolder, '', true);
};
```