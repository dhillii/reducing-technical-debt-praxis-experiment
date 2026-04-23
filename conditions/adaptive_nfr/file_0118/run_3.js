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

    /** @returns {boolean} True if character is valid identifier start */
    const isIdentifierStart = function (char) {
        return char === '_' || char === '$' ||
            (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z');
    };

    /** @returns {boolean} True if character is valid identifier continuation */
    const isIdentifierChar = function (char) {
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
        while (next() && isIdentifierChar(ch)) {
            key += ch;
        }
        return key;
    };

    /** @returns {boolean} True if character is decimal digit */
    const isDigit = function (char) {
        return char >= '0' && char <= '9';
    };

    /** @returns {boolean} True if character is hexadecimal digit */
    const isHexDigit = function (char) {
        return isDigit(char) ||
            (char >= 'A' && char <= 'F') ||
            (char >= 'a' && char <= 'f');
    };

    /** @returns {boolean} True if sign character */
    const isSign = function (char) {
        return char === '-' || char === '+';
    };

    const parseInfinity = function () {
        const num = word();
        if (typeof num !== 'number' || isNaN(num)) {
            error('Unexpected word for number');
        }
        return ch === '-' ? -num : num;
    };

    const parseNaN = function () {
        const num = word();
        if (!isNaN(num)) {
            error('expected word to be NaN');
        }
        return num;
    };

    const parseHexNumber = function () {
        let string = '0';
        string += ch;
        next();
        while (isHexDigit(ch)) {
            string += ch;
            next();
        }
        return parseInt(string, 16);
    };

    const parseDecimalNumber = function () {
        let string = '';
        while (isDigit(ch)) {
            string += ch;
            next();
        }
        if (ch === '.') {
            string += '.';
            while (next() && isDigit(ch)) {
                string += ch;
            }
        }
        if (ch === 'e' || ch === 'E') {
            string += ch;
            next();
            if (isSign(ch)) {
                string += ch;
                next();
            }
            while (isDigit(ch)) {
                string += ch;
                next();
            }
        }
        return string;
    };

    const number = function () {
        let sign = '';
        let string = '';
        let base = 10;

        if (isSign(ch)) {
            sign = ch;
            next(ch);
        }

        if (ch === 'I') {
            return parseInfinity();
        }

        if (ch === 'N') {
            return parseNaN();
        }

        if (ch === '0') {
            string += ch;
            next();
            if (ch === 'x' || ch === 'X') {
                string += ch;
                next();
                base = 16;
            } else if (isDigit(ch)) {
                error('Octal literal');
            }
        }

        if (base === 10) {
            string += parseDecimalNumber();
        } else {
            while (isHexDigit(ch)) {
                string += ch;
                next();
            }
        }

        let num;
        if (sign === '-') {
            num = -string;
        } else {
            num = +string;
        }

        if (!isFinite(num)) {
            error("Bad number");
        }
        return num;
    };

    /** @returns {boolean} True if character is quote */
    const isQuote = function (char) {
        return char === '"' || char === "'";
    };

    /** @returns {boolean} True if character is escape sequence start */
    const isEscapeStart = function (char) {
        return char === '\\';
    };

    /** @returns {boolean} True if character is newline */
    const isNewline = function (char) {
        return char === '\n';
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

    const handleEscapeSequence = function () {
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
        if (!isQuote(ch)) {
            error("Bad string");
        }
        const delim = ch;
        let result = '';
        while (next()) {
            if (ch === delim) {
                next();
                return result;
            }
            if (isEscapeStart(ch)) {
                const escaped = handleEscapeSequence();
                if (escaped === null) {
                    error("Bad string");
                }
                result += escaped;
                continue;
            }
            if (isNewline(ch)) {
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
        next('[');
        white();
        const result = [];
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
        if (isQuote(ch)) {
            return string();
        }
        return identifier();
    };

    const object = function () {
        if (ch !== '{') {
            error("Bad object");
        }
        next('{');
        white();
        const result = {};
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

    /** @returns {boolean} True if character is word character */
    function isWordChar(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            (char >= '0' && char <= '9') ||
            char === '_' || char === '$';
    }

    /** @returns {boolean} True if character can start word */
    function isWordStart(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            char === '_' || char === '$';
    }

    function isWord(key) {
        if (typeof key !== 'string') {
            return false;
        }
        if (!isWordStart(key[0])) {
            return false;
        }
        let i = 1;
        const length = key.length;
        while (i < length) {
            if (!isWordChar(key[i])) {
                return false;
            }
            i++;
        }
        return true;
    }

    JSON5.isWord = isWord;

    function isArray(obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        }
        return Object.prototype.toString.call(obj) === '[object Array]';
    }

    function isDate(obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    }

    if (!isNaN) {
        isNaN = function(val) {
            return typeof val === 'number' && val !== val;
        };
    }

    const objStack = [];

    function checkForCircular(obj) {
        for (let i = 0; i < objStack.length; i++) {
            if (objStack[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    }

    function makeIndent(str, num, noNewLine) {
        if (!str) {
            return "";
        }
        let indentStr = str;
        if (indentStr.length > 10) {
            indentStr = indentStr.substring(0, 10);
        }

        let indent = noNewLine ? "" : "\n";
        for (let i = 0; i < num; i++) {
            indent += indentStr;
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
        '"' : '\\"',
        '\\': '\\\\'
    };

    function escapeString(string) {
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
    }

    /** @returns {boolean} True if value should be serialized as null */
    function shouldSerializeAsNull(val) {
        return isNaN(val) || !isFinite(val);
    }

    /** @returns {boolean} True if value is undefined or null */
    function isUndefinedOrNull(val) {
        return val === null || typeof val === "undefined";
    }

    function stringifyArrayElement(element, index) {
        const res = internalStringify(element, index, false);
        let result = makeIndent(indentStr, objStack.length);
        if (isUndefinedOrNull(res)) {
            result += "null";
        } else {
            result += res;
        }
        if (index < element.length - 1) {
            result += ",";
        } else if (indentStr) {
            result += "\n";
        }
        return result;
    }

    function stringifyObjectProperty(obj, prop) {
        const value = internalStringify(obj, prop, false);
        if (isUndefinedOrNull(value)) {
            return null;
        }
        let result = makeIndent(indentStr, objStack.length);
        const key = isWord(prop) ? prop : escapeString(prop);
        result += key + ":" + (indentStr ? ' ' : '') + value + ",";
        return result;
    }

    function internalStringify(holder, key, isTopLevel) {
        const obj_part = getReplacedValueOrUndefined(holder, key, isTopLevel);

        if (obj_part && !isDate(obj_part)) {
            obj_part.valueOf();
        }

        const objType = typeof obj_part;

        if (objType === "boolean") {
            return obj_part.toString();
        }

        if (objType === "number") {
            if (shouldSerializeAsNull(obj_part)) {
                return "null";
            }
            return obj_part.toString();
        }

        if (objType === "string") {
            return escapeString(obj_part.toString());
        }

        if (objType !== "object") {
            return undefined;
        }

        if (obj_part === null) {
            return "null";
        }

        if (isArray(obj_part)) {
            checkForCircular(obj_part);
            let buffer = "[";
            objStack.push(obj_part);

            for (let i = 0; i < obj_part.length; i++) {
                buffer += stringifyArrayElement(obj_part, i);
            }

            objStack.pop();
            buffer += makeIndent(indentStr, objStack.length, true) + "]";
            return buffer;
        }

        checkForCircular(obj_part);
        let buffer = "{";
        let nonEmpty = false;
        objStack.push(obj_part);

        for (const prop in obj_part) {
            if (obj_part.hasOwnProperty(prop)) {
                const propResult = stringifyObjectProperty(obj_part, prop);
                if (propResult !== null) {
                    buffer += propResult;
                    nonEmpty = true;
                }
            }
        }

        objStack.pop();
        if (nonEmpty) {
            buffer = buffer.substring(0, buffer.length - 1) + makeIndent(indentStr, objStack.length) + "}";
        } else {
            buffer = '{}';
        }
        return buffer;
    }

    const topLevelHolder = {"": obj};
    if (obj === undefined) {
        return getReplacedValueOrUndefined(topLevelHolder, '', true);
    }
    return internalStringify(topLevelHolder, '', true);
};