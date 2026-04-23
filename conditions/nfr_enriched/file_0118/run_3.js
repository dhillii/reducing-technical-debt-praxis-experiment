const JSON5 = (typeof exports === 'object' ? exports : {});

JSON5.parse = (function () {
    "use strict";

    let at;
    let ch;
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
    let text;

    const error = function (m) {
        const syntaxError = new SyntaxError();
        syntaxError.message = m;
        syntaxError.at = at;
        syntaxError.text = text;
        throw syntaxError;
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
        return (char === '_' || char === '$') ||
                (char >= 'a' && char <= 'z') ||
                (char >= 'A' && char <= 'Z');
    };

    const isIdentifierPart = function (char) {
        return char === '_' || char === '$' ||
                (char >= 'a' && char <= 'z') ||
                (char >= 'A' && char <= 'Z') ||
                (char >= '0' && char <= '9');
    };

    const identifier = function () {
        if (!isIdentifierStart(ch)) {
            error("Bad identifier");
        }

        let key = ch;
        while (next() && isIdentifierPart(ch)) {
            key += ch;
        }
        return key;
    };

    const parseInfinity = function () {
        const result = word();
        if (typeof result !== 'number' || isNaN(result)) {
            error('Unexpected word for number');
        }
        return result;
    };

    const parseNaN = function () {
        const result = word();
        if (!isNaN(result)) {
            error('expected word to be NaN');
        }
        return result;
    };

    const parseHexNumber = function () {
        let hexString = '0';
        next();
        if (ch === 'x' || ch === 'X') {
            hexString += ch;
            next();
            while (ch >= '0' && ch <= '9' || ch >= 'A' && ch <= 'F' || ch >= 'a' && ch <= 'f') {
                hexString += ch;
                next();
            }
        }
        return parseInt(hexString, 16);
    };

    const parseDecimalNumber = function () {
        let numString = '';
        while (ch >= '0' && ch <= '9') {
            numString += ch;
            next();
        }
        if (ch === '.') {
            numString += '.';
            while (next() && ch >= '0' && ch <= '9') {
                numString += ch;
            }
        }
        if (ch === 'e' || ch === 'E') {
            numString += ch;
            next();
            if (ch === '-' || ch === '+') {
                numString += ch;
                next();
            }
            while (ch >= '0' && ch <= '9') {
                numString += ch;
                next();
            }
        }
        return numString;
    };

    const number = function () {
        let sign = '';
        let numString = '';
        let base = 10;

        if (ch === '-' || ch === '+') {
            sign = ch;
            next(ch);
        }

        if (ch === 'I') {
            const result = parseInfinity();
            return (sign === '-') ? -result : result;
        }

        if (ch === 'N') {
            return parseNaN();
        }

        if (ch === '0') {
            numString += ch;
            next();
            if (ch === 'x' || ch === 'X') {
                return parseHexNumber();
            } else if (ch >= '0' && ch <= '9') {
                error('Octal literal');
            }
        }

        numString += parseDecimalNumber();

        let result = sign === '-' ? -numString : +numString;

        if (!isFinite(result)) {
            error("Bad number");
        }
        return result;
    };

    const parseUnicodeEscape = function () {
        let uffff = 0;
        for (let i = 0; i < 4; i += 1) {
            const hex = parseInt(next(), 16);
            if (!isFinite(hex)) {
                break;
            }
            uffff = uffff * 16 + hex;
        }
        return String.fromCharCode(uffff);
    };

    const handleStringEscape = function () {
        next();
        if (ch === 'u') {
            return parseUnicodeEscape();
        } else if (ch === '\r') {
            if (peek() === '\n') {
                next();
            }
            return '';
        } else if (typeof escapee[ch] === 'string') {
            return escapee[ch];
        }
        return null;
    };

    const string = function () {
        if (ch !== '"' && ch !== "'") {
            error("Bad string");
        }

        const delim = ch;
        let result = '';

        while (next()) {
            if (ch === delim) {
                next();
                return result;
            } else if (ch === '\\') {
                const escaped = handleStringEscape();
                if (escaped === null) {
                    break;
                }
                result += escaped;
            } else if (ch === '\n') {
                break;
            } else {
                result += ch;
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

        error("Unterminated block comment");
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
        error("Unexpected '" + ch + "'");
    };

    let value;

    const parseArrayElement = function () {
        if (ch === ',') {
            error("Missing array element");
        }
        return value();
    };

    const array = function () {
        if (ch !== '[') {
            error("Bad array");
        }

        const result = [];
        next('[');
        white();

        while (ch) {
            if (ch === ']') {
                next(']');
                return result;
            }

            result.push(parseArrayElement());
            white();

            if (ch !== ',') {
                next(']');
                return result;
            }
            next(',');
            white();
        }

        error("Bad array");
    };

    const parseObjectKey = function () {
        if (ch === '"' || ch === "'") {
            return string();
        }
        return identifier();
    };

    const object = function () {
        if (ch !== '{') {
            error("Bad object");
        }

        const result = {};
        next('{');
        white();

        while (ch) {
            if (ch === '}') {
                next('}');
                return result;
            }

            const key = parseObjectKey();
            white();
            next(':');
            result[key] = value();
            white();

            if (ch !== ',') {
                next('}');
                return result;
            }
            next(',');
            white();
        }

        error("Bad object");
    };

    value = function () {
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

    const walkReviver = function (holder, key, reviver) {
        const val = holder[key];
        if (val && typeof val === 'object') {
            for (const k in val) {
                if (Object.prototype.hasOwnProperty.call(val, k)) {
                    const v = walkReviver(val, k, reviver);
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

    return function (source, reviver) {
        text = String(source);
        at = 0;
        ch = ' ';
        const result = value();
        white();
        if (ch) {
            error("Syntax error");
        }

        if (typeof reviver === 'function') {
            return walkReviver({'': result}, '', reviver);
        }
        return result;
    };
}());

JSON5.stringify = function (obj, replacer, space) {
    if (replacer && (typeof(replacer) !== "function" && !isArray(replacer))) {
        throw new Error('Replacer must be a function or an array');
    }

    const getReplacedValueOrUndefined = function(holder, key, isTopLevel) {
        let value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArray(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    const isWordChar = function(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            (char >= '0' && char <= '9') ||
            char === '_' || char === '$';
    };

    const isWordStart = function(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            char === '_' || char === '$';
    };

    const isWord = function(key) {
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

    JSON5.isWord = isWord;

    const isArray = function(obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    const isDate = function(obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    const isNaNValue = function(val) {
        return typeof val === 'number' && val !== val;
    };

    const objStack = [];

    const checkForCircular = function(obj) {
        for (let i = 0; i < objStack.length; i++) {
            if (objStack[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    const makeIndent = function(str, num, noNewLine) {
        if (!str) {
            return "";
        }
        let indentStr = str.length > 10 ? str.substring(0, 10) : str;
        let indent = noNewLine ? "" : "\n";
        for (let i = 0; i < num; i++) {
            indent += indentStr;
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

    const escapeString = function(str) {
        escapable.lastIndex = 0;
        return escapable.test(str) ? '"' + str.replace(escapable, function (a) {
            const c = meta[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + str + '"';
    };

    const stringifyArrayValue = function(arr, index) {
        const res = internalStringify(arr, index, false);
        let buffer = makeIndent(indentStr, objStack.length);
        if (res === null || typeof res === "undefined") {
            buffer += "null";
        } else {
            buffer += res;
        }
        if (index < arr.length - 1) {
            buffer += ",";
        } else if (indentStr) {
            buffer += "\n";
        }
        return buffer;
    };

    const stringifyArray = function(arr) {
        checkForCircular(arr);
        let buffer = "[";
        objStack.push(arr);

        for (let i = 0; i < arr.length; i++) {
            buffer += stringifyArrayValue(arr, i);
        }

        objStack.pop();
        buffer += makeIndent(indentStr, objStack.length, true) + "]";
        return buffer;
    };

    const stringifyObjectProperty = function(obj, prop) {
        const value = internalStringify(obj, prop, false);
        if (typeof value !== "undefined" && value !== null) {
            let buffer = makeIndent(indentStr, objStack.length);
            const key = isWord(prop) ? prop : escapeString(prop);
            buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
            return { buffer: buffer, hasContent: true };
        }
        return { buffer: "", hasContent: false };
    };

    const stringifyObject = function(obj) {
        checkForCircular(obj);
        let buffer = "{";
        let nonEmpty = false;
        objStack.push(obj);

        for (const prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                const result = stringifyObjectProperty(obj, prop);
                buffer += result.buffer;
                nonEmpty = nonEmpty || result.hasContent;
            }
        }

        objStack.pop();
        if (nonEmpty) {
            buffer = buffer.substring(0, buffer.length - 1) + makeIndent(indentStr, objStack.length) + "}";
        } else {
            buffer = '{}';
        }
        return buffer;
    };

    const internalStringify = function(holder, key, isTopLevel) {
        let obj_part = getReplacedValueOrUndefined(holder, key, isTopLevel);

        if (obj_part && !isDate(obj_part)) {
            obj_part = obj_part.valueOf();
        }

        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNValue(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArray(obj_part)) {
                    return stringifyArray(obj_part);
                } else {
                    return stringifyObject(obj_part);
                }

            default:
                return undefined;
        }
    };

    const topLevelHolder = {"": obj};
    if (obj === undefined) {
        return getReplacedValueOrUndefined(topLevelHolder, '', true);
    }
    return internalStringify(topLevelHolder, '', true);
};