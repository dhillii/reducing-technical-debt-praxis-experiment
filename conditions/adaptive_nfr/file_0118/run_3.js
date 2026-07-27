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
        return char === '_' || char === '$' ||
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

    const isSignChar = function (char) {
        return char === '-' || char === '+';
    };

    const isDecimalDigit = function (char) {
        return char >= '0' && char <= '9';
    };

    const isHexDigit = function (char) {
        return (char >= '0' && char <= '9') ||
            (char >= 'A' && char <= 'F') ||
            (char >= 'a' && char <= 'f');
    };

    const parseInfinity = function (sign) {
        const infinityValue = word();
        if (typeof infinityValue !== 'number' || isNaN(infinityValue)) {
            error('Unexpected word for number');
        }
        return (sign === '-') ? -infinityValue : infinityValue;
    };

    const parseNaN = function () {
        const nanValue = word();
        if (!isNaN(nanValue)) {
            error('expected word to be NaN');
        }
        return nanValue;
    };

    const parseHexNumber = function (sign, string) {
        string += ch;
        next();
        let hexString = '';
        while (isHexDigit(ch)) {
            hexString += ch;
            next();
        }
        const number = parseInt(hexString, 16);
        return (sign === '-') ? -number : number;
    };

    const parseDecimalNumber = function (sign, string) {
        let decimalString = string;
        while (isDecimalDigit(ch)) {
            decimalString += ch;
            next();
        }

        if (ch === '.') {
            decimalString += '.';
            while (next() && isDecimalDigit(ch)) {
                decimalString += ch;
            }
        }

        if (ch === 'e' || ch === 'E') {
            decimalString += ch;
            next();
            if (isSignChar(ch)) {
                decimalString += ch;
                next();
            }
            while (isDecimalDigit(ch)) {
                decimalString += ch;
                next();
            }
        }

        const number = +decimalString;
        if (!isFinite(number)) {
            error("Bad number");
        }
        return (sign === '-') ? -number : number;
    };

    const number = function () {
        let sign = '';
        if (isSignChar(ch)) {
            sign = ch;
            next(ch);
        }

        if (ch === 'I') {
            return parseInfinity(sign);
        }

        if (ch === 'N') {
            return parseNaN();
        }

        let string = '';
        if (ch === '0') {
            string += ch;
            next();
            if (ch === 'x' || ch === 'X') {
                return parseHexNumber(sign, string);
            }
            if (isDecimalDigit(ch)) {
                error('Octal literal');
            }
        }

        return parseDecimalNumber(sign, string);
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

    const handleStringEscape = function (string) {
        next();
        if (ch === 'u') {
            return parseUnicodeEscape();
        }
        if (ch === '\r') {
            if (peek() === '\n') {
                next();
            }
            return '';
        }
        if (typeof escapee[ch] === 'string') {
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
            }
            if (ch === '\\') {
                const escaped = handleStringEscape(result);
                if (escaped === null) {
                    break;
                }
                result += escaped;
                continue;
            }
            if (ch === '\n') {
                break;
            }
            result += ch;
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

    const isArrayEnd = function () {
        return ch === ']';
    };

    const isArrayMissingElement = function () {
        return ch === ',';
    };

    const array = function () {
        if (ch !== '[') {
            error("Bad array");
        }

        const result = [];
        next('[');
        white();

        while (ch) {
            if (isArrayEnd()) {
                next(']');
                return result;
            }

            if (isArrayMissingElement()) {
                error("Missing array element");
            }

            result.push(value());
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

    const isObjectEnd = function () {
        return ch === '}';
    };

    const isQuotedKey = function () {
        return ch === '"' || ch === "'";
    };

    const object = function () {
        if (ch !== '{') {
            error("Bad object");
        }

        const result = {};
        next('{');
        white();

        while (ch) {
            if (isObjectEnd()) {
                next('}');
                return result;
            }

            let key;
            if (isQuotedKey()) {
                key = string();
            } else {
                key = identifier();
            }

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
            return isDecimalDigit(ch) ? number() : word();
        }
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

        if (typeof reviver !== 'function') {
            return result;
        }

        const walk = function (holder, key) {
            const currentValue = holder[key];
            if (!currentValue || typeof currentValue !== 'object') {
                return reviver.call(holder, key, currentValue);
            }

            for (const k in currentValue) {
                if (Object.prototype.hasOwnProperty.call(currentValue, k)) {
                    const v = walk(currentValue, k);
                    if (v !== undefined) {
                        currentValue[k] = v;
                    } else {
                        delete currentValue[k];
                    }
                }
            }
            return reviver.call(holder, key, currentValue);
        };

        return walk({'': result}, '');
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
        }

        if (replacer) {
            if (isTopLevel || isArray(holder) || replacer.indexOf(key) >= 0) {
                return value;
            }
            return undefined;
        }

        return value;
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
        }
        return Object.prototype.toString.call(obj) === '[object Array]';
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

    const escapeString = function(string) {
        escapable.lastIndex = 0;
        if (!escapable.test(string)) {
            return '"' + string + '"';
        }
        return '"' + string.replace(escapable, function (a) {
            const c = meta[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"';
    };

    const stringifyBoolean = function(value) {
        return value.toString();
    };

    const stringifyNumber = function(value) {
        if (isNaNValue(value) || !isFinite(value)) {
            return "null";
        }
        return value.toString();
    };

    const stringifyArray = function(obj_part, isTopLevel) {
        checkForCircular(obj_part);
        let buffer = "[";
        objStack.push(obj_part);

        for (let i = 0; i < obj_part.length; i++) {
            const res = internalStringify(obj_part, i, false);
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
        return buffer;
    };

    const stringifyObject = function(obj_part, isTopLevel) {
        checkForCircular(obj_part);
        let buffer = "{";
        let nonEmpty = false;
        objStack.push(obj_part);

        for (const prop in obj_part) {
            if (!obj_part.hasOwnProperty(prop)) {
                continue;
            }

            const value = internalStringify(obj_part, prop, false);
            if (typeof value === "undefined" || value === null) {
                continue;
            }

            buffer += makeIndent(indentStr, objStack.length);
            nonEmpty = true;
            const key = isWord(prop) ? prop : escapeString(prop);
            buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
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

        const objType = typeof obj_part;

        if (objType === "boolean") {
            return stringifyBoolean(obj_part);
        }

        if (objType === "number") {
            return stringifyNumber(obj_part);
        }

        if (objType === "string") {
            return escapeString(obj_part.toString());
        }

        if (objType === "object") {
            if (obj_part === null) {
                return "null";
            }
            if (isArray(obj_part)) {
                return stringifyArray(obj_part, isTopLevel);
            }
            return stringifyObject(obj_part, isTopLevel);
        }

        return undefined;
    };

    const topLevelHolder = {"": obj};
    if (obj === undefined) {
        return getReplacedValueOrUndefined(topLevelHolder, '', true);
    }
    return internalStringify(topLevelHolder, '', true);
};