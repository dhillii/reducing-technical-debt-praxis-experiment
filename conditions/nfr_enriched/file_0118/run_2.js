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
                } else if (ch in ESCAPEE) {
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
            if (ch === '*' && peek() === '/') {
                next();
                next();
                return;
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
            } else if (WHITESPACE_SET.has(ch)) {
                next();
            } else {
                return;
            }
        }
    };

    const word = () => {
        const words = {
            't': ['r', 'u', 'e', true],
            'f': ['a', 'l', 's', 'e', false],
            'n': ['u', 'l', 'l', null],
            'I': ['n', 'f', 'i', 'n', 'i', 't', 'y', Infinity],
            'N': ['a', 'N', NaN]
        };

        if (!(ch in words)) {
            error(`Unexpected '${ch}'`);
        }

        const [chars, value] = [words[ch].slice(0, -1), words[ch][words[ch].length - 1]];
        for (const c of chars) {
            next(c);
        }
        return value;
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
            default: return isDigit(ch) ? number() : word();
        }
    };

    const walk = (holder, key, reviver) => {
        const val = holder[key];
        if (val && typeof val === 'object') {
            for (const k in val) {
                if (Object.prototype.hasOwnProperty.call(val, k)) {
                    const v = walk(val, k, reviver);
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

    return (source, reviver) => {
        text = String(source);
        at = 0;
        ch = ' ';
        const result = value();
        white();
        if (ch) error("Syntax error");
        return reviver ? walk({'': result}, '', reviver) : result;
    };
}());

JSON5.stringify = (function() {
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

    const meta = {
        '\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f',
        '\r': '\\r', '"': '\\"', '\\': '\\\\'
    };

    const escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;

    const escapeString = (str) => {
        escapable.lastIndex = 0;
        return escapable.test(str) ? 
            '"' + str.replace(escapable, (a) => 
                meta[a] || ('\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4))
            ) + '"' : 
            '"' + str + '"';
    };

    const makeIndent = (str, num, noNewLine) => {
        if (!str) return "";
        const s = str.length > 10 ? str.substring(0, 10) : str;
        return (noNewLine ? "" : "\n") + s.repeat(num);
    };

    return (obj, replacer, space) => {
        if (replacer && typeof replacer !== "function" && !isArray(replacer)) {
            throw new Error('Replacer must be a function or an array');
        }

        let indentStr = '';
        if (space) {
            indentStr = typeof space === "string" ? space : 
                (typeof space === "number" && space >= 0 ? makeIndent(" ", space, true) : '');
        }

        const objStack = [];

        const getReplacedValue = (holder, key, isTopLevel) => {
            let val = holder[key];
            if (val && typeof val.toJSON === "function") {
                val = val.toJSON();
            }
            if (typeof replacer === "function") {
                return replacer.call(holder, key, val);
            } else if (replacer) {
                return isTopLevel || isArray(holder) || replacer.indexOf(key) >= 0 ? val : undefined;
            }
            return val;
        };

        const stringifyValue = (holder, key, isTopLevel) => {
            let obj = getReplacedValue(holder, key, isTopLevel);

            if (obj && !isDate(obj)) {
                obj = obj.valueOf();
            }

            switch (typeof obj) {
                case "boolean":
                case "number":
                    return isNaN(obj) || !isFinite(obj) ? "null" : obj.toString();
                case "string":
                    return escapeString(obj);
                case "object":
                    if (obj === null) return "null";

                    for (let i = 0; i < objStack.length; i++) {
                        if (objStack[i] === obj) {
                            throw new TypeError("Converting circular structure to JSON");
                        }
                    }

                    if (isArray(obj)) {
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
                    } else {
                        objStack.push(obj);
                        let buffer = "{";
                        let nonEmpty = false;
                        for (const prop in obj) {
                            if (obj.hasOwnProperty(prop)) {
                                const val = stringifyValue(obj, prop, false);
                                if (val !== undefined && val !== null) {
                                    buffer += makeIndent(indentStr, objStack.length);
                                    nonEmpty = true;
                                    const k = isWord(prop) ? prop : escapeString(prop);
                                    buffer += k + ":" + (indentStr ? ' ' : '') + val + ",";
                                }
                            }
                        }
                        objStack.pop();
                        return nonEmpty ? 
                            buffer.substring(0, buffer.length - 1) + makeIndent(indentStr, objStack.length) + "}" : 
                            '{}';
                    }
                default:
                    return undefined;
            }
        };

        const topLevelHolder = {"": obj};
        return obj === undefined ? 
            getReplacedValue(topLevelHolder, '', true) : 
            stringifyValue(topLevelHolder, '', true);
    };
}());
```