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

    /** @returns {boolean} True if current character starts Infinity */
    const isInfinityStart = function () {
        return ch === 'I';
    };

    /** @returns {boolean} True if current character starts NaN */
    const isNaNStart = function () {
        return ch === 'N';
    };

    /** @returns {boolean} True if current character is sign */
    const isSign = function (char) {
        return char === '-' || char === '+';
    };

    /** @returns {boolean} True if current character is hex prefix */
    const isHexPrefix = function (char) {
        return char === 'x' || char === 'X';
    };

    /** @returns {boolean} True if current character is exponent marker */
    const isExponentMarker = function (char) {
        return char === 'e' || char === 'E';
    };

    const parseDecimalNumber = function (string) {
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
        if (isExponentMarker(ch)) {
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

    const parseHexNumber = function (string) {
        while (isHexDigit(ch)) {
            string += ch;
            next();
        }
        return string;
    };

    const parseInfinity = function (sign) {
        const num = word();
        if (typeof num !== 'number' || isNaN(num)) {
            error('Unexpected word for number');
        }
        return sign === '-' ? -num : num;
    };

    const parseNaN = function () {
        const num = word();
        if (!isNaN(num)) {
            error('expected word to be NaN');
        }
        return num;
    };

    const parseZeroPrefix = function (string) {
        string += ch;
        next();
        if (isHexPrefix(ch)) {
            string += ch;
            next();
            return { string: string, base: 16 };
        }
        if (isDigit(ch)) {
            error('Octal literal');
        }
        return { string: string, base: 10 };
    };

    const number = function () {
        let sign = '';
        if (isSign(ch)) {
            sign = ch;
            next(ch);
        }

        if (isInfinityStart()) {
            return parseInfinity(sign);
        }

        if (isNaNStart()) {
            return parseNaN();
        }

        let string = '';
        let base = 10;

        if (ch === '0') {
            const result = parseZeroPrefix(string);
            string = result.string;
            base = result.base;
        }

        if (base === 10) {
            string = parseDecimalNumber(string);
        } else {
            string = parseHexNumber(string);
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

    /** @returns {boolean} True if character is string delimiter */
    const isStringDelimiter = function (char) {
        return char === '"' || char === "'";
    };

    /** @returns {boolean} True if character is line terminator */
    const isLineTerminator = function (char) {
        return char === '\n' || char === '\r';
    };

    /** @returns {boolean} True if character has escape sequence */
    const hasEscapeSequence = function (char) {
        return typeof escapee[char] === 'string';
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

    const handleStringEscape = function (str) {
        next();
        if (ch === 'u') {
            return str + parseUnicodeEscape();
        }
        if (ch === '\r') {
            if (peek() === '\n') {
                next();
            }
            return str;
        }
        if (hasEscapeSequence(ch)) {
            return str + escapee[ch];
        }
        return null;
    };

    const string = function () {
        if (!isStringDelimiter(ch)) {
            error("Bad string");
        }

        const delim = ch;
        let str = '';

        while (next()) {
            if (ch === delim) {
                next();
                return str;
            }
            if (ch === '\\') {
                const result = handleStringEscape(str);
                if (result === null) {
                    break;
                }
                str = result;
                continue;
            }
            if (isLineTerminator(ch)) {
                break;
            }
            str += ch;
        }
        error("Bad string");
    };

    const inlineComment = function () {
        if (ch !== '/') {
            error("Not an inline comment");
        }
        do {
            next();
            if (isLineTerminator(ch)) {
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

    /** @returns {boolean} True if character is whitespace */
    const isWhitespace = function (char) {
        return ws.indexOf(char) >= 0;
    };

    const white = function () {
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

    const array = function () {
        if (ch !== '[') {
            error("Bad array");
        }

        const arr = [];
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
        if (ch !== '{') {
            error("Bad object");
        }

        const obj = {};
        next('{');
        white();

        while (ch) {
            if (ch === '}') {
                next('}');
                return obj;
            }

            let key;
            if (isStringDelimiter(ch)) {
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

    /** @returns {boolean} True if character is valid word character */
    function isWordChar(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            (char >= '0' && char <= '9') ||
            char === '_' || char === '$';
    }

    /** @returns {boolean} True if character is valid word start */
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
        for (let i = 1; i < key.length; i++) {
            if (!isWordChar(key[i])) {
                return false;
            }
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

    if (!isNaN || typeof isNaN !== 'function') {
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
        let indentStr = str.length > 10 ? str.substring(0, 10) : str;
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

    /** @returns {boolean} True if value is null */
    function isNull(val) {
        return val === null;
    }

    /** @returns {boolean} True if value is undefined */
    function isUndefined(val) {
        return typeof val === "undefined";
    }

    /** @returns {boolean} True if value is NaN or not finite */
    function isInvalidNumber(val) {
        return isNaN(val) || !isFinite(val);
    }

    /** @returns {boolean} True if result should be null */
    function shouldBeNull(res) {
        return res === null || isUndefined(res);
    }

    function stringifyArrayElement(obj, i) {
        const res = internalStringify(obj, i, false);
        let buffer = makeIndent(indentStr, objStack.length);
        if (shouldBeNull(res)) {
            buffer += "null";
        } else {
            buffer += res;
        }
        if (i < obj.length - 1) {
            buffer += ",";
        } else if (indentStr) {
            buffer += "\n";
        }
        return buffer;
    }

    function stringifyObjectProperty(obj, prop) {
        const value = internalStringify(obj, prop, false);
        if (isUndefined(value) || isNull(value)) {
            return null;
        }
        let buffer = makeIndent(indentStr, objStack.length);
        const key = isWord(prop) ? prop : escapeString(prop);
        buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
        return buffer;
    }

    function stringifyArray(obj) {
        checkForCircular(obj);
        let buffer = "[";
        objStack.push(obj);

        for (let i = 0; i < obj.length; i++) {
            buffer += stringifyArrayElement(obj, i);
        }

        objStack.pop();
        buffer += makeIndent(indentStr, objStack.length, true) + "]";
        return buffer;
    }

    function stringifyObject(obj) {
        checkForCircular(obj);
        let buffer = "{";
        let nonEmpty = false;
        objStack.push(obj);

        for (const prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                const propBuffer = stringifyObjectProperty(obj, prop);
                if (propBuffer !== null) {
                    buffer += propBuffer;
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

    function internalStringify(holder, key, isTopLevel) {
        let obj_part = getReplacedValueOrUndefined(holder, key, isTopLevel);

        if (obj_part && !isDate(obj_part)) {
            obj_part = obj_part.valueOf();
        }

        const typeOf = typeof obj_part;

        if (typeOf === "boolean") {
            return obj_part.toString();
        }

        if (typeOf === "number") {
            if (isInvalidNumber(obj_part)) {
                return "null";
            }
            return obj_part.toString();
        }

        if (typeOf === "string") {
            return escapeString(obj_part.toString());
        }

        if (typeOf === "object") {
            if (isNull(obj_part)) {
                return "null";
            }
            if (isArray(obj_part)) {
                return stringifyArray(obj_part);
            }
            return stringifyObject(obj_part);
        }

        return undefined;
    }

    const topLevelHolder = {"": obj};
    if (obj === undefined) {
        return getReplacedValueOrUndefined(topLevelHolder, '', true);
    }
    return internalStringify(topLevelHolder, '', true);
};