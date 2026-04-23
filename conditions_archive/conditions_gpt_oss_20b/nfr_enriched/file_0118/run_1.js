```javascript
// json5.js
// Modern JSON. See README.md for details.
//
// This file is based directly off of Douglas Crockford's json_parse.js:
// https://github.com/douglascrockford/JSON-js/blob/master/json_parse.js

const JSON5 = (typeof exports === 'object' ? exports : {});

JSON5.parse = (function () {
    "use strict";

    // Parser state
    let at;          // The index of the current character
    let ch;          // The current character
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

    // Error handling
    const error = function (m) {
        const err = new SyntaxError();
        err.message = m;
        err.at = at;
        err.text = text;
        throw err;
    };

    // Advance to next character
    const next = function (c) {
        if (c && c !== ch) {
            error("Expected '" + c + "' instead of '" + ch + "'");
        }
        ch = text.charAt(at);
        at += 1;
        return ch;
    };

    // Peek at next character without consuming
    const peek = function () {
        return text.charAt(at);
    };

    // Parse an identifier (unquoted object key)
    const identifier = function () {
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

    // Parse a number value
    const number = function () {
        let numStr = '';
        let sign = '';
        let base = 10;

        if (ch === '-' || ch === '+') {
            sign = ch;
            next(ch);
        }

        // Infinity
        if (ch === 'I') {
            const val = word();
            if (typeof val !== 'number' || isNaN(val)) {
                error('Unexpected word for number');
            }
            return sign === '-' ? -val : val;
        }

        // NaN
        if (ch === 'N') {
            const val = word();
            if (!isNaN(val)) {
                error('expected word to be NaN');
            }
            return val;
        }

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

        switch (base) {
            case 10:
                while (ch >= '0' && ch <= '9') {
                    numStr += ch;
                    next();
                }
                if (ch === '.') {
                    numStr += '.';
                    while (next() && ch >= '0' && ch <= '9') {
                        numStr += ch;
                    }
                }
                if (ch === 'e' || ch === 'E') {
                    numStr += ch;
                    next();
                    if (ch === '-' || ch === '+') {
                        numStr += ch;
                        next();
                    }
                    while (ch >= '0' && ch <= '9') {
                        numStr += ch;
                        next();
                    }
                }
                break;
            case 16:
                while (
                    (ch >= '0' && ch <= '9') ||
                    (ch >= 'A' && ch <= 'F') ||
                    (ch >= 'a' && ch <= 'f')
                ) {
                    numStr += ch;
                    next();
                }
                break;
        }

        const num = sign === '-' ? -Number(numStr) : Number(numStr);
        if (!isFinite(num)) {
            error("Bad number");
        }
        return num;
    };

    // Parse a string value
    const string = function () {
        let result = '';
        let delim;
        let uffff;

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
        }
        error("Bad string");
    };

    // Skip an inline comment
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

    // Skip a block comment
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
        error("Unterminated block comment");
    };

    // Skip a comment (inline or block)
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

    // Skip whitespace and comments
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

    // Parse true, false, null, Infinity, NaN
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
                next('I'); next('n'); next('f'); next('i'); next('n'); next('i'); next('t'); next('y');
                return Infinity;
            case 'N':
                next('N'); next('a'); next('N');
                return NaN;
        }
        error("Unexpected '" + ch + "'");
    };

    // Forward declaration for value
    let value;

    // Parse an array value
    const array = function () {
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

    // Parse an object value
    const object = function () {
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
        error("Bad object");
    };

    // Parse a JSON value
    value = function () {
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

    // Main parse function
    return function (source, reviver) {
        text = String(source);
        at = 0;
        ch = ' ';
        const result = value();
        white();
        if (ch) {
            error("Syntax error");
        }

        if (typeof reviver !== 'function') {
            return result;
        }

        const walk = function (holder, key) {
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
            return reviver.call(holder, key, val);
        };

        return walk({ '': result }, '');
    };
}());

// JSON5 stringify
JSON5.stringify = function (obj, replacer, space) {
    if (replacer && (typeof replacer !== "function" && !isArray(replacer))) {
        throw new Error('Replacer must be a function or an array');
    }

    const getReplacedValueOrUndefined = function (holder, key, isTopLevel) {
        let value = holder[key];
        if (value && typeof value.toJSON === "function") {
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
        if (typeof key !== 'string') {
            return false;
        }
        if (!isWordStart(key[0])) {
            return false;
        }
        for (let i = 1, len = key.length; i < len; i++) {
            if (!isWordChar(key[i])) {
                return false;
            }
        }
        return true;
    };

    // Export for tests
    JSON5.isWord = isWord;

    // Polyfills
    const isArray = function (obj) {
        return Array.isArray ? Array.isArray(obj) : Object.prototype.toString.call(obj) === '[object Array]';
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
        '"' : '\\"',
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
        let buffer, res;
        let objPart = getReplacedValueOrUndefined(holder, key, isTopLevel);

        if (objPart && !isDate(objPart)) {
            objPart = objPart.valueOf();
        }

        switch (typeof objPart) {
            case "boolean":
                return objPart.toString();
            case "number":
                if (isNaN(objPart) || !isFinite(objPart)) {
                    return "null";
                }
                return objPart.toString();
            case "string":
                return escapeString(objPart.toString());
            case "object":
                if (objPart === null) {
                    return "null";
                } else if (isArray(objPart)) {
                    checkForCircular(objPart);
                    buffer = "[";
                    objStack.push(objPart);
                    for (let i = 0; i < objPart.length; i++) {
                        res = internalStringify(objPart, i, false);
                        buffer += makeIndent(indentStr, objStack.length);
                        if (res === null || typeof res === "undefined") {
                            buffer += "null";
                        } else {
                            buffer += res;
                        }
                        if (i < objPart.length - 1) {
                            buffer += ",";
                        } else if (indentStr) {
                            buffer += "\n";
                        }
                    }
                    objStack.pop();
                    buffer += makeIndent(indentStr, objStack.length, true) + "]";
                } else {
                    checkForCircular(objPart);
                    buffer = "{";
                    let nonEmpty = false;
                    objStack.push(objPart);
                    for (const prop in objPart) {
                        if (objPart.hasOwnProperty(prop)) {
                            const value = internalStringify(objPart, prop, false);
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
                        buffer = '{}';
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
```