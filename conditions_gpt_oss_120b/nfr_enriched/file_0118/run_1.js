var JSON5 = (typeof exports === 'object' ? exports : {});

JSON5.parse = (function () {
    "use strict";

    const ws = [' ', '\t', '\r', '\n', '\v', '\f', '\xA0', '\uFEFF'];
    const escapee = {
        "'": "'",
        '"': '"',
        '\\': '\\',
        '/': '/',
        '\n': '',
        b: '\b',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t'
    };

    class Parser {
        constructor(source) {
            this.text = String(source);
            this.at = 0;
            this.ch = ' ';
        }

        error(message) {
            const err = new SyntaxError();
            err.message = message;
            err.at = this.at;
            err.text = this.text;
            throw err;
        }

        next(expected) {
            if (expected && expected !== this.ch) {
                this.error("Expected '" + expected + "' instead of '" + this.ch + "'");
            }
            this.ch = this.text.charAt(this.at);
            this.at += 1;
            return this.ch;
        }

        peek() {
            return this.text.charAt(this.at);
        }

        isWhiteSpace(ch) {
            return ws.indexOf(ch) >= 0;
        }

        skipWhiteSpace() {
            while (this.ch) {
                if (this.ch === '/') {
                    this.skipComment();
                } else if (this.isWhiteSpace(this.ch)) {
                    this.next();
                } else {
                    break;
                }
            }
        }

        skipComment() {
            this.next('/');
            if (this.ch === '/') {
                this.skipInlineComment();
            } else if (this.ch === '*') {
                this.skipBlockComment();
            } else {
                this.error("Unrecognized comment");
            }
        }

        skipInlineComment() {
            while (this.next()) {
                if (this.ch === '\n' || this.ch === '\r') {
                    this.next();
                    return;
                }
            }
        }

        skipBlockComment() {
            while (this.next()) {
                if (this.ch === '*') {
                    while (this.next() && this.ch === '*') { }
                    if (this.ch === '/') {
                        this.next();
                        return;
                    }
                }
            }
            this.error("Undterminated block comment");
        }

        parseIdentifier() {
            let key = this.ch;
            if ((this.ch !== '_' && this.ch !== '$') &&
                (this.ch < 'a' || this.ch > 'z') &&
                (this.ch < 'A' || this.ch > 'Z')) {
                this.error("Bad identifier");
            }
            while (this.next() && (this.ch === '_' || this.ch === '$' ||
                (this.ch >= 'a' && this.ch <= 'z') ||
                (this.ch >= 'A' && this.ch <= 'Z') ||
                (this.ch >= '0' && this.ch <= '9'))) {
                key += this.ch;
            }
            return key;
        }

        parseNumber() {
            const sign = (this.ch === '-' || this.ch === '+') ? this.ch : '';
            if (sign) this.next(sign);

            if (this.ch === 'I') return this.parseInfinity(sign);
            if (this.ch === 'N') return this.parseNaN();

            let base = 10;
            let numStr = '';

            if (this.ch === '0') {
                numStr += this.ch;
                this.next();
                if (this.ch === 'x' || this.ch === 'X') {
                    numStr += this.ch;
                    this.next();
                    base = 16;
                } else if (this.ch >= '0' && this.ch <= '9') {
                    this.error('Octal literal');
                }
            }

            if (base === 10) {
                numStr += this.consumeDigits();
                if (this.ch === '.') {
                    numStr += '.';
                    this.next();
                    numStr += this.consumeDigits();
                }
                if (this.ch === 'e' || this.ch === 'E') {
                    numStr += this.consumeExponent();
                }
            } else {
                numStr += this.consumeHexDigits();
            }

            const number = sign === '-' ? -numStr : +numStr;
            if (!isFinite(number)) this.error("Bad number");
            return number;
        }

        consumeDigits() {
            let digits = '';
            while (this.ch >= '0' && this.ch <= '9') {
                digits += this.ch;
                this.next();
            }
            return digits;
        }

        consumeHexDigits() {
            let hex = '';
            while ((this.ch >= '0' && this.ch <= '9') ||
                (this.ch >= 'A' && this.ch <= 'F') ||
                (this.ch >= 'a' && this.ch <= 'f')) {
                hex += this.ch;
                this.next();
            }
            return hex;
        }

        consumeExponent() {
            let exp = this.ch;
            this.next();
            if (this.ch === '-' || this.ch === '+') {
                exp += this.ch;
                this.next();
            }
            exp += this.consumeDigits();
            return exp;
        }

        parseInfinity(sign) {
            const value = this.parseWord();
            if (typeof value !== 'number' || isNaN(value)) {
                this.error('Unexpected word for number');
            }
            return sign === '-' ? -value : value;
        }

        parseNaN() {
            const value = this.parseWord();
            if (!isNaN(value)) this.error('expected word to be NaN');
            return value;
        }

        parseString() {
            const delim = this.ch;
            let result = '';
            while (this.next()) {
                if (this.ch === delim) {
                    this.next();
                    return result;
                }
                if (this.ch === '\\') {
                    this.next();
                    if (this.ch === 'u') {
                        result += this.parseUnicodeEscape();
                    } else if (this.ch === '\r') {
                        if (this.peek() === '\n') this.next();
                    } else if (escapee[this.ch] !== undefined) {
                        result += escapee[this.ch];
                    } else {
                        break;
                    }
                } else if (this.ch === '\n') {
                    break;
                } else {
                    result += this.ch;
                }
            }
            this.error("Bad string");
        }

        parseUnicodeEscape() {
            let code = 0;
            for (let i = 0; i < 4; i++) {
                const hex = parseInt(this.next(), 16);
                if (!isFinite(hex)) break;
                code = code * 16 + hex;
            }
            return String.fromCharCode(code);
        }

        parseWord() {
            switch (this.ch) {
                case 't':
                    this.expectSequence('true');
                    return true;
                case 'f':
                    this.expectSequence('false');
                    return false;
                case 'n':
                    this.expectSequence('null');
                    return null;
                case 'I':
                    this.expectSequence('Infinity');
                    return Infinity;
                case 'N':
                    this.expectSequence('NaN');
                    return NaN;
            }
            this.error("Unexpected '" + this.ch + "'");
        }

        expectSequence(seq) {
            for (let i = 0; i < seq.length; i++) {
                this.next(seq[i]);
            }
        }

        parseArray() {
            const arr = [];
            this.next('[');
            this.skipWhiteSpace();
            while (this.ch) {
                if (this.ch === ']') {
                    this.next(']');
                    return arr;
                }
                if (this.ch === ',') this.error("Missing array element");
                arr.push(this.parseValue());
                this.skipWhiteSpace();
                if (this.ch !== ',') {
                    this.next(']');
                    return arr;
                }
                this.next(',');
                this.skipWhiteSpace();
            }
            this.error("Bad array");
        }

        parseObject() {
            const obj = {};
            this.next('{');
            this.skipWhiteSpace();
            while (this.ch) {
                if (this.ch === '}') {
                    this.next('}');
                    return obj;
                }
                const key = (this.ch === '"' || this.ch === "'") ? this.parseString() : this.parseIdentifier();
                this.skipWhiteSpace();
                this.next(':');
                obj[key] = this.parseValue();
                this.skipWhiteSpace();
                if (this.ch !== ',') {
                    this.next('}');
                    return obj;
                }
                this.next(',');
                this.skipWhiteSpace();
            }
            this.error("Bad object");
        }

        parseValue() {
            this.skipWhiteSpace();
            switch (this.ch) {
                case '{': return this.parseObject();
                case '[': return this.parseArray();
                case '"':
                case "'": return this.parseString();
                case '-':
                case '+':
                case '.':
                case '0':
                case '1':
                case '2':
                case '3':
                case '4':
                case '5':
                case '6':
                case '7':
                case '8':
                case '9':
                    return this.parseNumber();
                default: return this.parseWord();
            }
        }

        parseRoot() {
            const result = this.parseValue();
            this.skipWhiteSpace();
            if (this.ch) this.error("Syntax error");
            return result;
        }
    }

    return function (source, reviver) {
        const parser = new Parser(source);
        const result = parser.parseRoot();

        if (typeof reviver !== 'function') return result;

        const walk = (holder, key) => {
            const value = holder[key];
            if (value && typeof value === 'object') {
                for (const k in value) {
                    if (Object.prototype.hasOwnProperty.call(value, k)) {
                        const v = walk(value, k);
                        if (v !== undefined) {
                            value[k] = v;
                        } else {
                            delete value[k];
                        }
                    }
                }
            }
            return reviver.call(holder, key, value);
        };
        return walk({ '': result }, '');
    };
}());

JSON5.stringify = function (obj, replacer, space) {
    const isArray = (arr) => Array.isArray ? Array.isArray(arr) : Object.prototype.toString.call(arr) === '[object Array]';
    const isDate = (d) => Object.prototype.toString.call(d) === '[object Date]';
    const isWordChar = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '$';
    const isWordStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$';
    const isWord = (key) => {
        if (typeof key !== 'string') return false;
        if (!isWordStart(key[0])) return false;
        for (let i = 1; i < key.length; i++) {
            if (!isWordChar(key[i])) return false;
        }
        return true;
    };
    JSON5.isWord = isWord;

    const getReplaced = (holder, key, top) => {
        let value = holder[key];
        if (value && typeof value.toJSON === 'function') value = value.toJSON();
        if (typeof replacer === 'function') return replacer.call(holder, key, value);
        if (replacer) {
            if (top || isArray(holder) || replacer.indexOf(key) >= 0) return value;
            return undefined;
        }
        return value;
    };

    const makeIndent = (str, count, noNL) => {
        if (!str) return "";
        const base = str.length > 10 ? str.substring(0, 10) : str;
        let indent = noNL ? "" : "\n";
        for (let i = 0; i < count; i++) indent += base;
        return indent;
    };

    let indentStr = "";
    if (space) {
        if (typeof space === "string") indentStr = space;
        else if (typeof space === "number" && space >= 0) indentStr = makeIndent(" ", space, true);
    }

    const cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    const escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    const meta = { '\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f', '\r': '\\r', '"': '\\"', '\\': '\\\\' };
    const escapeString = (str) => {
        escapable.lastIndex = 0;
        return escapable.test(str) ?
            '"' + str.replace(escapable, (a) => meta[a] || '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4)) + '"' :
            '"' + str + '"';
    };

    const circularStack = [];
    const checkCircular = (value) => {
        if (circularStack.includes(value)) throw new TypeError("Converting circular structure to JSON");
    };

    const stringifyValue = (holder, key, top) => {
        const raw = getReplaced(holder, key, top);
        const value = raw && !isDate(raw) ? raw.valueOf() : raw;
        switch (typeof value) {
            case "boolean": return value.toString();
            case "number":
                return (isNaN(value) || !isFinite(value)) ? "null" : value.toString();
            case "string": return escapeString(value);
            case "object":
                if (value === null) return "null";
                if (isArray(value)) return stringifyArray(value);
                return stringifyObject(value);
            default: return undefined;
        }
    };

    const stringifyArray = (arr) => {
        checkCircular(arr);
        circularStack.push(arr);
        let out = "[";
        for (let i = 0; i < arr.length; i++) {
            out += makeIndent(indentStr, circularStack.length);
            const elem = stringifyValue({ _: arr }, i, false);
            out += (elem === null || elem === undefined) ? "null" : elem;
            out += i < arr.length - 1 ? "," : "";
        }
        if (indentStr) out += "\n";
        circularStack.pop();
        out += makeIndent(indentStr, circularStack.length, true) + "]";
        return out;
    };

    const stringifyObject = (obj) => {
        checkCircular(obj);
        circularStack.push(obj);
        let out = "{";
        let hasProp = false;
        for (const prop in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, prop)) {
                const val = stringifyValue({ _: obj }, prop, false);
                if (val !== undefined && val !== null) {
                    out += makeIndent(indentStr, circularStack.length);
                    const key = isWord(prop) ? prop : escapeString(prop);
                    out += key + ":" + (indentStr ? " " : "") + val + ",";
                    hasProp = true;
                }
            }
        }
        circularStack.pop();
        if (hasProp) {
            out = out.slice(0, -1) + makeIndent(indentStr, circularStack.length) + "}";
        } else {
            out = "{}";
        }
        return out;
    };

    const topHolder = { "": obj };
    if (obj === undefined) return getReplaced(topHolder, "", true);
    return stringifyValue(topHolder, "", true);
};