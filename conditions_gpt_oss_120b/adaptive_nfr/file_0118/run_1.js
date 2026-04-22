```javascript
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
    let text;

    const error = function (m) {
        const err = new SyntaxError();
        err.message = m;
        err.at = at;
        err.text = text;
        throw err;
    };

    const next = function (c) {
        if (c && c !== ch) {
            error("Expected '" + c + "' instead of '" + ch + "'");
        }
        ch = text.charAt(at);
        at += 1;
        return ch;
    };

    const peek = function () {
        return text.charAt(at);
    };

    const isIdentifierStart = function (char) {
        return (char === '_' || char === '$' ||
            (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z'));
    };

    const isIdentifierPart = function (char) {
        return (char === '_' || char === '$' ||
            (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            (char >= '0' && char <= '9'));
    };

    const identifier = function () {
        let key = ch;

        if (!isIdentifierStart(ch)) {
            error("Bad identifier");
        }

        while (next() && isIdentifierPart(ch)) {
            key += ch;
        }

        return key;
    };

    const isDecimalDigit = function (char) {
        return char >= '0' && char <= '9';
    };

    const number = function () {
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
            return (sign === '-') ? -number : number;
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
            } else if (isDecimalDigit(ch)) {
                error('Octal literal');
            }
        }

        if (base === 10) {
            while (isDecimalDigit(ch)) {
                string += ch;
                next();
            }
            if (ch === '.') {
                string += '.';
                while (next() && isDecimalDigit(ch)) {
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
                while (isDecimalDigit(ch)) {
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

        number = (sign === '-') ? -string : +string;

        if (!isFinite(number)) {
            error("Bad number");
        }
        return number;
    };

    const string = function () {
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

    const inlineComment = function () {
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

    const blockComment = function () {
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

    const comment = function () {
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

    const white = function () {
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

    const word = function () {
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

    let value; // placeholder

    const array = function () {
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

    const object = function () {
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

    value = function () {
        white();
        if (ch === '{') return object();
        if (ch === '[') return array();
        if (ch === '"' || ch === "'") return string();
        if (ch === '-' || ch === '+' || ch === '.' || isDecimalDigit(ch)) return number();
        return word();
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

        if (typeof reviver !== 'function') {
            return result;
        }

        const walk = function (holder, key) {
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
    };
}());

// JSON5 stringify will not quote keys where appropriate
JSON5.stringify = function (obj, replacer, space) {
    if (replacer && (typeof replacer !== "function" && !isArray(replacer))) {
        throw new Error('Replacer must be a function or an array');
    }

    const getReplacedValueOrUndefined = function (holder, key, isTopLevel) {
        let value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
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

    const isWordChar = function (char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            (char >= '0' && char <= '9') ||
            char === '_' || char === '$';
    };

    const isWordStart = function (char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            char === '_' || char === '$';
    };

    const isWord = function (key) {
        if (typeof key !== 'string') return false;
        if (!isWordStart(key[0])) return false;
        for (let i = 1; i < key.length; i++) {
            if (!isWordChar(key[i])) return false;
        }
        return true;
    };

    // export for use in tests
    JSON5.isWord = isWord;

    const isArray = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        }
        return Object.prototype.toString.call(obj) === '[object Array]';
    };

    const isDate = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    isNaN = isNaN || function (val) {
        return typeof val === 'number' && val !== val;
    };

    const objStack = [];

    const checkForCircular = function (obj) {
        for (let i = 0; i < objStack.length; i++) {
            if (objStack[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    const makeIndent = function (str, num, noNewLine) {
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

    const escapeString = function (string) {
        escapable.lastIndex = 0;
        return escapable.test(string) ?
            '"' + string.replace(escapable, function (a) {
                const c = meta[a];
                return typeof c === 'string' ? c : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
            }) + '"' :
            '"' + string + '"';
    };

    const internalStringify = function (holder, key, isTopLevel) {
        const objPart = getReplacedValueOrUndefined(holder, key, isTopLevel);
        let value = objPart;

        if (value && !isDate(value)) {
            value = value.valueOf();
        }

        switch (typeof value) {
            case "boolean":
                return value.toString();
            case "number":
                if (isNaN(value) || !isFinite(value)) return "null";
                return value.toString();
            case "string":
                return escapeString(value);
            case "object":
                if (value === null) return "null";
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
                // object
                checkForCircular(value);
                objStack.push(value);
                let buffer = "{";
                let nonEmpty = false;
                for (const prop in value) {
                    if (Object.prototype.hasOwnProperty.call(value, prop)) {
                        const propVal = internalStringify(value, prop, false);
                        if (typeof propVal !== "undefined" && propVal !== null) {
                            buffer += makeIndent(indentStr, objStack.length);
                            nonEmpty = true;
                            const keyStr = isWord(prop) ? prop : escapeString(prop);
                            buffer += keyStr + ":" + (indentStr ? ' ' : '') + propVal + ",";
                        }
                    }
                }
                objStack.pop();
                if (nonEmpty) {
                    buffer = buffer.slice(0, -1) + makeIndent(indentStr, objStack.length) + "}";
                } else {
                    buffer = '{}';
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
```