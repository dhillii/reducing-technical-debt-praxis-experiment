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

    const isDigit = function (char) {
        return char >= '0' && char <= '9';
    };

    const isHexDigit = function (char) {
        return isDigit(char) ||
            (char >= 'A' && char <= 'F') ||
            (char >= 'a' && char <= 'f');
    };

    const parseInfinity = function (sign) {
        const num = word();
        if (typeof num !== 'number' || isNaN(num)) {
            error('Unexpected word for number');
        }
        return (sign === '-') ? -num : num;
    };

    const parseNaN = function () {
        const num = word();
        if (!isNaN(num)) {
            error('expected word to be NaN');
        }
        return num;
    };

    const parseHexNumber = function (sign, string) {
        let hexString = string;
        next();
        if (ch === 'x' || ch === 'X') {
            hexString += ch;
            next();
            while (isHexDigit(ch)) {
                hexString += ch;
                next();
            }
        }
        return sign === '-' ? -hexString : +hexString;
    };

    const parseDecimalNumber = function (sign, string) {
        let decString = string;
        while (isDigit(ch)) {
            decString += ch;
            next();
        }

        if (ch === '.') {
            decString += '.';
            while (next() && isDigit(ch)) {
                decString += ch;
            }
        }

        if (ch === 'e' || ch === 'E') {
            decString += ch;
            next();
            if (ch === '-' || ch === '+') {
                decString += ch;
                next();
            }
            while (isDigit(ch)) {
                decString += ch;
                next();
            }
        }

        const num = sign === '-' ? -decString : +decString;
        if (!isFinite(num)) {
            error("Bad number");
        }
        return num;
    };

    const number = function () {
        let sign = '';
        if (ch === '-' || ch === '+') {
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
            if (isDigit(ch)) {
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
                next();
                const escaped = handleStringEscape(result);
                if (escaped === null) {
                    error("Bad string");
                }
                result += escaped;
                continue;
            }
            if (ch === '\n') {
                error("Bad string");
            }
            result += ch;
        }

        error("Bad string");
    };

    const inlineComment = function () {
        if (ch !== '/') {
            error("Not an inline comment");
        }

        while (ch) {
            next();
            if (ch === '\n' || ch === '\r') {
                next();
                return;
            }
        }
    };

    const blockComment = function () {
        if (ch !== '*') {
            error("Not a block comment");
        }

        while (ch) {
            next();
            while (ch === '*') {
                next('*');
                if (ch === '/') {
                    next('/');
                    return;
                }
            }
        }

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

    const isArrayContinuing = function () {
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

            if (!isArrayContinuing()) {
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

    const isObjectKey = function () {
        return ch === '"' || ch === "'";
    };

    const getObjectKey = function () {
        if (isObjectKey()) {
            return string();
        }
        return identifier();
    };

    const isObjectContinuing = function () {
        return ch === ',';
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

            const key = getObjectKey();
            white();
            next(':');
            result[key] = value();
            white();

            if (!isObjectContinuing()) {
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
            return isDigit(ch) ? number() : word();
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

    let objStack = [];

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

    const isNullOrUndefined = function(val) {
        return val === null || typeof val === "undefined";
    };

    const isNaNOrInfinite = function(val) {
        return isNaNValue(val) || !isFinite(val);
    };

    const stringifyBoolean = function(val) {
        return val.toString();
    };

    const stringifyNumber = function(val) {
        if (isNaNOrInfinite(val)) {
            return "null";
        }
        return val.toString();
    };

    const stringifyArray = function(obj_part, isTopLevel) {
        checkForCircular(obj_part);
        let buffer = "[";
        objStack.push(obj_part);

        for (let i = 0; i < obj_part.length; i++) {
            const res = internalStringify(obj_part, i, false);
            buffer += makeIndent(indentStr, objStack.length);
            if (isNullOrUndefined(res)) {
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
            if (isNullOrUndefined(value)) {
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