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

    const isIdentifierStart = (c) => 
        c === '_' || c === '$' || 
        (c >= 'a' && c <= 'z') || 
        (c >= 'A' && c <= 'Z');

    const isIdentifierPart = (c) => 
        isIdentifierStart(c) || (c >= '0' && c <= '9');

    const identifier = () => {
        if (!isIdentifierStart(ch)) {
            error("Bad identifier");
        }
        let key = ch;
        while (next() && isIdentifierPart(ch)) {
            key += ch;
        }
        return key;
    };

    const isDigit = (c) => c >= '0' && c <= '9';
    const isHexDigit = (c) => isDigit(c) || 
        (c >= 'A' && c <= 'F') || 
        (c >= 'a' && c <= 'f');

    const parseDecimalNumber = (sign, string) => {
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
            if (ch === '-' || ch === '+') {
                string += ch;
                next();
            }
            while (isDigit(ch)) {
                string += ch;
                next();
            }
        }
        const num = sign === '-' ? -string : +string;
        if (!isFinite(num)) {
            error("Bad number");
        }
        return num;
    };

    const parseHexNumber = () => {
        let string = '';
        while (isHexDigit(ch)) {
            string += ch;
            next();
        }
        return parseInt(string, 16);
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

        let string = '';
        if (ch === '0') {
            string += ch;
            next();
            if (ch === 'x' || ch === 'X') {
                string += ch;
                next();
                return parseHexNumber();
            } else if (isDigit(ch)) {
                error('Octal literal');
            }
        }

        return parseDecimalNumber(sign, string);
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
            } else if (ch === '\\') {
                next();
                if (ch === 'u') {
                    result += parseUnicodeEscape();
                } else if (ch === '\r') {
                    if (peek() === '\n') next();
                } else if (typeof ESCAPEE[ch] === 'string') {
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
        do {
            next();
            if (ch === '\n' || ch === '\r') {
                next();
                return;
            }
        } while (ch);
    };

    const blockComment = () => {
        if (ch !== '*') error("Not a block comment");
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

    const KEYWORDS = {
        't': () => { next('t'); next('r'); next('u'); next('e'); return true; },
        'f': () => { next('f'); next('a'); next('l'); next('s'); next('e'); return false; },
        'n': () => { next('n'); next('u'); next('l'); next('l'); return null; },
        'I': () => { next('I'); next('n'); next('f'); next('i'); next('n'); next('i'); next('t'); next('y'); return Infinity; },
        'N': () => { next('N'); next('a'); next('N'); return NaN; }
    };

    const word = () => {
        const parser = KEYWORDS[ch];
        if (parser) return parser();
        error(`Unexpected '${ch}'`);
    };

    const array = () => {
        if (ch !== '[') error("Bad array");
        next('[');
        white();
        const result = [];

        while (ch) {
            if (ch === ']') {
                next(']');
                return result;
            }
            if (ch === ',') {
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

    const object = () => {
        if (ch !== '{') error("Bad object");
        next('{');
        white();
        const result = {};

        while (ch) {
            if (ch === '}') {
                next('}');
                return result;
            }
            const key = (ch === '"' || ch === "'") ? string() : identifier();
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
            default: return isDigit(ch) ? number() : word();
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

JSON5.stringify = (function () {
    const isArray = (obj) => Array.isArray ? Array.isArray(obj) : 
        Object.prototype.toString.call(obj) === '[object Array]';

    const isDate = (obj) => Object.prototype.toString.call(obj) === '[object Date]';

    const isWordChar = (c) => 
        (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || 
        (c >= '0' && c <= '9') || c === '_' || c === '$';

    const isWordStart = (c) => 
        (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || 
        c === '_' || c === '$';

    const isWord = (key) => {
        if (typeof key !== 'string' || !isWordStart(key[0])) return false;
        for (let i = 1; i < key.length; i++) {
            if (!isWordChar(key[i])) return false;
        }
        return true;
    };

    JSON5.isWord = isWord;

    const META = {
        '\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f',
        '\r': '\\r', '"': '\\"', '\\': '\\\\'
    };

    const ESCAPABLE = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;

    const escapeString = (str) => {
        ESCAPABLE.lastIndex = 0;
        if (!ESCAPABLE.test(str)) return `"${str}"`;
        return `"${str.replace(ESCAPABLE, (a) => {
            const c = META[a];
            return typeof c === 'string' ? c : 
                `\\u${('0000' + a.charCodeAt(0).toString(16)).slice(-4)}`;
        })}"`;
    };

    const makeIndent = (str, num, noNewLine) => {
        if (!str) return "";
        const trimmed = str.length > 10 ? str.substring(0, 10) : str;
        let indent = noNewLine ? "" : "\n";
        for (let i = 0; i < num; i++) indent += trimmed;
        return indent;
    };

    const stringifyArray = (arr, indentStr, objStack) => {
        let buffer = "[";
        objStack.push(arr);

        for (let i = 0; i < arr.length; i++) {
            const res = internalStringify(arr, i, false, indentStr, objStack);
            buffer += makeIndent(indentStr, objStack.length);
            buffer += (res === null || typeof res === "undefined") ? "null" : res;
            if (i < arr.length - 1) {
                buffer += ",";
            } else if (indentStr) {
                buffer += "\n";
            }
        }
        objStack.pop();
        return buffer + makeIndent(indentStr, objStack.length, true) + "]";
    };

    const stringifyObject = (obj, indentStr, objStack) => {
        let buffer = "{";
        let nonEmpty = false;
        objStack.push(obj);

        for (const prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                const value = internalStringify(obj, prop, false, indentStr, objStack);
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
            buffer = buffer.substring(0, buffer.length - 1) + 
                makeIndent(indentStr, objStack.length) + "}";
        } else {
            buffer = '{}';
        }
        return buffer;
    };

    const internalStringify = (holder, key, isTopLevel, indentStr, objStack) => {
        const obj = holder[key];
        const unboxed = (obj && !isDate(obj)) ? obj.valueOf() : obj;

        switch (typeof unboxed) {
            case "boolean":
            case "number":
                if (typeof unboxed === "number" && (isNaN(unboxed) || !isFinite(unboxed))) {
                    return "null";
                }
                return unboxed.toString();
            case "string":
                return escapeString(unboxed.toString());
            case "object":
                if (unboxed === null) return "null";
                for (let i = 0; i < objStack.length; i++) {
                    if (objStack[i] === unboxed) {
                        throw new TypeError("Converting circular structure to JSON");
                    }
                }
                return isArray(unboxed) ? 
                    stringifyArray(unboxed, indentStr, objStack) :
                    stringifyObject(unboxed, indentStr, objStack);
            default:
                return undefined;
        }
    };

    return function (obj, replacer, space) {
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

        const getReplacedValue = (holder, key, isTopLevel) => {
            let value = holder[key];
            if (value && value.toJSON