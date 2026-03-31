```javascript
var JSON5 = (typeof exports === 'object' ? exports : {});

JSON5.parse = (function () {
    "use strict";

    var at, ch, text;

    const ESCAPEE = {
        "'": "'", '"': '"', '\\': '\\', '/': '/',
        '\n': '', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t'
    };

    const WHITESPACE = [' ', '\t', '\r', '\n', '\v', '\f', '\xA0', '\uFEFF'];
    const WS_SET = new Set(WHITESPACE);

    const CharValidator = {
        isDigit: (c) => c >= '0' && c <= '9',
        isHexDigit: (c) => (c >= '0' && c <= '9') || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f'),
        isIdentifierStart: (c) => (c === '_' || c === '$') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'),
        isIdentifierPart: (c) => CharValidator.isIdentifierStart(c) || CharValidator.isDigit(c)
    };

    const error = (m) => {
        const err = new SyntaxError(m);
        err.at = at;
        err.text = text;
        throw err;
    };

    const next = (c) => {
        if (c && c !== ch) {
            error(`Expected '${c}' instead of '${ch}'`);
        }
        ch = text.charAt(at++);
        return ch;
    };

    const peek = () => text.charAt(at);

    const identifier = () => {
        let key = ch;
        if (!CharValidator.isIdentifierStart(ch)) {
            error("Bad identifier");
        }
        while (next() && CharValidator.isIdentifierPart(ch)) {
            key += ch;
        }
        return key;
    };

    const parseHexNumber = () => {
        let string = '0';
        next();
        if (ch === 'x' || ch === 'X') {
            string += ch;
            next();
            while (CharValidator.isHexDigit(ch)) {
                string += ch;
                next();
            }
        }
        return parseInt(string, 16);
    };

    const parseDecimalNumber = () => {
        let string = '';
        while (CharValidator.isDigit(ch)) {
            string += ch;
            next();
        }
        if (ch === '.') {
            string += '.';
            while (next() && CharValidator.isDigit(ch)) {
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
            while (CharValidator.isDigit(ch)) {
                string += ch;
                next();
            }
        }
        return +string;
    };

    const number = () => {
        let sign = '';
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
            const num = parseHexNumber();
            if (isFinite(num)) return sign === '-' ? -num : num;
        }

        const num = parseDecimalNumber();
        if (!isFinite(num)) {
            error("Bad number");
        }
        return sign === '-' ? -num : num;
    };

    const parseUnicodeEscape = () => {
        let uffff = 0;
        for (let i = 0; i < 4; i++) {
            const hex = parseInt(next(), 16);
            if (!isFinite(hex)) break;
            uffff = uffff * 16 + hex;
        }
        return String.fromCharCode(uffff);
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
                    result += parseUnicodeEscape();
                } else if (ch === '\r') {
                    if (peek() === '\n') next();
                } else if (ESCAPEE[ch] !== undefined) {
                    result += ESCAPEE[ch];
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
        if (ch !== '/') error("Not an inline comment");
        while (next() && ch !== '\n' && ch !== '\r');
        if (ch) next();
    };

    const blockComment = () => {
        if (ch !== '*') error("Not a block comment");
        while (next()) {
            while (ch === '*') {
                if (next() === '/') {
                    next();
                    return;
                }
            }
        }
        error("Unterminated block comment");
    };

    const comment = () => {
        if (ch !== '/') error("Not a comment");
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
            } else if (WS_SET.has(ch)) {
                next();
            } else {
                return;
            }
        }
    };

    const word = () => {
        const words = {
            't': () => { next('t'); next('r'); next('u'); next('e'); return true; },
            'f': () => { next('f'); next('a'); next('l'); next('s'); next('e'); return false; },
            'n': () => { next('n'); next('u'); next('l'); next('l'); return null; },
            'I': () => { next('I'); next('n'); next('f'); next('i'); next('n'); next('i'); next('t'); next('y'); return Infinity; },
            'N': () => { next('N'); next('a'); next('N'); return NaN; }
        };
        if (words[ch]) return words[ch]();
        error(`Unexpected '${ch}'`);
    };

    let value;

    const array = () => {
        if (ch !== '[') error("Bad array");
        next('[');
        white();
        const result = [];

        while (ch && ch !== ']') {
            if (ch === ',') {
                error("Missing array element");
            }
            result.push(value());
            white();
            if (ch !== ',') break;
            next(',');
            white();
        }
        next(']');
        return result;
    };

    const object = () => {
        if (ch !== '{') error("Bad object");
        next('{');
        white();
        const result = {};

        while (ch && ch !== '}') {
            const key = (ch === '"' || ch === "'") ? string() : identifier();
            white();
            next(':');
            result[key] = value();
            white();
            if (ch !== ',') break;
            next(',');
            white();
        }
        next('}');
        return result;
    };

    value = () => {
        white();
        switch (ch) {
            case '{': return object();
            case '[': return array();
            case '"':
            case "'": return string();
            case '-':
            case '+':
            case '.': return number();
            default: return CharValidator.isDigit(ch) ? number() : word();
        }
    };

    return function (source, reviver) {
        text = String(source);
        at = 0;
        ch = ' ';
        const result = value();
        white();
        if (ch) error("Syntax error");

        if (typeof reviver !== 'function') return result;

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
            return reviver.call(holder, key, val);
        };

        return walk({'': result}, '');
    };
}());

JSON5.stringify = (function() {
    const isArray = (obj) => Array.isArray ? Array.isArray(obj) : Object.prototype.toString.call(obj) === '[object Array]';
    const isDate = (obj) => Object.prototype.toString.call(obj) === '[object Date]';

    const CharChecker = {
        isWordChar: (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '$',
        isWordStart: (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$'
    };

    const isWord = (key) => {
        if (typeof key !== 'string' || !CharChecker.isWordStart(key[0])) return false;
        for (let i = 1; i < key.length; i++) {
            if (!CharChecker.isWordChar(key[i])) return false;
        }
        return true;
    };

    JSON5.isWord = isWord;

    const cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    const escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    const meta = {'\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f', '\r': '\\r', '"': '\\"', '\\': '\\\\'};

    const escapeString = (str) => {
        escapable.lastIndex = 0;
        if (!escapable.test(str)) return `"${str}"`;
        return `"${str.replace(escapable, (a) => {
            const c = meta[a];
            return typeof c === 'string' ? c : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        })}"`;
    };

    const makeIndent = (str, num, noNewLine) => {
        if (!str) return "";
        const s = str.length > 10 ? str.substring(0, 10) : str;
        let indent = noNewLine ? "" : "\n";
        for (let i = 0; i < num; i++) indent += s;
        return indent;
    };

    return function(obj, replacer, space) {
        if (replacer && typeof replacer !== "function" && !isArray(replacer)) {
            throw new Error('Replacer must be a function or an array');
        }

        let indentStr = '';
        if (space) {
            if (typeof space === "string") {
                indentStr = space;
            } else if (typeof space === "number" && space >= 0) {
                indentStr = makeIndent(" ", space, true);
            }
        }

        const objStack = [];

        const getReplacedValue = (holder, key, isTopLevel) => {
            let value = holder[key];
            if (value && typeof value.toJSON === "function") {
                value = value.toJSON();
            }
            if (typeof replacer === "function") {
                return replacer.call(holder, key, value);
            } else if (replacer) {
                return (isTopLevel || isArray(holder) || replacer.indexOf(key) >= 0) ? value : undefined;
            }
            return value;
        };

        const stringifyValue = (holder, key, isTopLevel) => {
            let obj = getReplacedValue(holder, key, isTopLevel);

            if (obj && !isDate(obj)) {
                obj = obj.valueOf();
            }

            switch (typeof obj) {
                case "boolean":
                case "number":
                    return (typeof obj === "number" && (!isFinite(obj) || isNaN(obj))) ? "null" : obj.toString();
                case "string":
                    return escapeString(obj);
                case "object":
                    if (obj === null) return "null";
                    if (isArray(obj)) return stringifyArray(obj);
                    return stringifyObject(obj);
                default:
                    return undefined;
            }
        };

        const stringifyArray = (arr) => {
            for (let i = 0; i < objStack.length; i++) {
                if (objStack[i] === arr) throw new TypeError("Converting circular structure to JSON");
            }
            objStack.push(arr);
            let buffer = "[";
            for (let i = 0; i < arr.length; i++) {
                const res = stringifyValue(arr, i, false);
                buffer += makeIndent(indentStr, objStack.length);
                buffer += (res === null || typeof res === "undefined") ? "null" : res;
                if (i < arr.length - 1) buffer += ",";
                else if (indentStr) buffer += "\n";
            }
            objStack.pop();
            buffer += makeIndent(indentStr, objStack.length, true) + "]";
            return buffer;
        };

        const stringifyObject = (obj) => {
            for (let i = 0; i < objStack.length; i++) {
                if (objStack[i] === obj) throw new TypeError("Converting circular structure to JSON");
            }
            objStack.push(obj);
            let buffer = "{";
            let nonEmpty = false;
            for (const prop in obj) {
                if (obj.hasOwnProperty(prop)) {
                    const value = stringifyValue(obj, prop, false);
                    if (typeof value !== "undefined" && value !== null) {
                        buffer += makeIndent(indentStr, objStack.length);
                        nonEmpty = true;
                        const key = isWord(prop) ? prop : escapeString(prop);
                        buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                    }
                }
            }
            objStack.pop();
            if (nonEmpty) {
                buffer = buffer.substring(0, buffer.length -