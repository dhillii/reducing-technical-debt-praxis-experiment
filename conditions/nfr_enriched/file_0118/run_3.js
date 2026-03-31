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
    const WHITESPACE_SET = new Set(WHITESPACE);

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
        (c === '_' || c === '$') || 
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
        (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f');

    const parseHexNumber = () => {
        let string = '0';
        next();
        if (ch === 'x' || ch === 'X') {
            string += ch;
            next();
            while (isHexDigit(ch)) {
                string += ch;
                next();
            }
        }
        return parseInt(string, 16);
    };

    const parseDecimalNumber = () => {
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
            if (ch === '-' || ch === '+') {
                string += ch;
                next();
            }
            while (isDigit(ch)) {
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

        let result;
        if (ch === '0') {
            next();
            if (ch === 'x' || ch === 'X') {
                result = parseHexNumber();
            } else if (isDigit(ch)) {
                error('Octal literal');
            } else {
                result = 0;
            }
        } else {
            result = parseDecimalNumber();
        }

        if (sign === '-') {
            result = -result;
        }

        if (!isFinite(result)) {
            error("Bad number");
        }
        return result;
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
                } else if (ESCAPEE.hasOwnProperty(ch)) {
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
            } else if (WHITESPACE_SET.has(ch)) {
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
        if (KEYWORDS[ch]) {
            return KEYWORDS[ch]();
        }
        error(`Unexpected '${ch}'`);
    };

    let value;

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
            default: return isDigit(ch) ? number() : word();
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

        if (typeof reviver === 'function') {
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
        }
        return result;
    };
}());

JSON5.stringify = function (obj, replacer, space) {
    if (replacer && typeof replacer !== "function" && !Array.isArray(replacer)) {
        throw new Error('Replacer must be a function or an array');
    }

    const isArray = Array.isArray;
    const isDate = (o) => Object.prototype.toString.call(o) === '[object Date]';
    const isWordChar = (c) => /[a-zA-Z0-9_$]/.test(c);
    const isWordStart = (c) => /[a-zA-Z_$]/.test(c);

    const isWord = (key) => {
        if (typeof key !== 'string' || !key.length) return false;
        if (!isWordStart(key[0])) return false;
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
            return typeof c === 'string' ? c : `\\u${('0000' + a.charCodeAt(0).toString(16)).slice(-4)}`;
        })}"`;
    };

    const makeIndent = (str, num, noNewLine) => {
        if (!str) return "";
        const trimmed = str.length > 10 ? str.substring(0, 10) : str;
        let indent = noNewLine ? "" : "\n";
        for (let i = 0; i < num; i++) indent += trimmed;
        return indent;
    };

    let indentStr = '';
    if (space) {
        if (typeof space === "string") {
            indentStr = space;
        } else if (typeof space === "number" && space >= 0) {
            indentStr = makeIndent(" ", space, true);
        }
    }

    const objStack = [];

    const checkForCircular = (obj) => {
        if (objStack.includes(obj)) {
            throw new TypeError("Converting circular structure to JSON");
        }
    };

    const getReplacedValue = (holder, key, isTopLevel) => {
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

    const stringifyValue = (holder, key, isTopLevel) => {
        let obj = getReplacedValue(holder, key, isTopLevel);

        if (obj && !isDate(obj)) {
            obj = obj.valueOf();
        }

        switch (typeof obj) {
            case "boolean":
            case "number":
                if (typeof obj === "number" && (isNaN(obj) || !isFinite(obj))) {
                    return "null";
                }
                return String(obj);

            case "string":
                return escapeString(obj);

            case "object":
                if (obj === null) return "null";

                if (isArray(obj)) {
                    checkForCircular(obj);
                    objStack.push(obj);
                    let buffer = "[";
                    for (let i = 0; i < obj.length; i++) {
                        const res = stringifyValue(obj, i, false);
                        buffer += makeIndent(indentStr, objStack.length);
                        buffer += res === null || res === undefined ? "null" : res;
                        if (i < obj.length - 1) buffer += ",";
                        else if (indentStr) buffer += "\n";
                    }
                    objStack.pop();
                    buffer += makeIndent(indentStr, objStack.length, true) + "]";
                    return buffer;
                }

                checkForCircular(obj);
                objStack.push(obj);
                let buffer = "{";
                let nonEmpty = false;
                for (const prop in obj) {
                    if (obj.hasOwnProperty(prop)) {
                        const value = stringifyValue(obj, prop, false);
                        if (value !== undefined && value !== null) {
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
                return buffer;

            default:
                return undefined;
        }
    };

    const topLevelHolder = {"": obj};
    if (obj === undefined)