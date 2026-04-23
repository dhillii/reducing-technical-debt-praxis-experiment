var JSON5 = (typeof exports === 'object' ? exports : {});

JSON5.parse = (function () {
    "use strict";

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

    const whitespaceChars = [
        ' ', '\t', '\r', '\n', '\v', '\f', '\xA0', '\uFEFF'
    ];

    function createError(message, at, text) {
        const err = new SyntaxError();
        err.message = message;
        err.at = at;
        err.text = text;
        throw err;
    }

    class Parser {
        constructor(source) {
            this.text = String(source);
            this.at = 0;
            this.ch = ' ';
        }

        next(expected) {
            if (expected && expected !== this.ch) {
                createError(`Expected '${expected}' instead of '${this.ch}'`, this.at, this.text);
            }
            this.ch = this.text.charAt(this.at);
            this.at += 1;
            return this.ch;
        }

        peek() {
            return this.text.charAt(this.at);
        }

        isWhiteSpace(ch) {
            return whitespaceChars.indexOf(ch) >= 0;
        }

        skipWhite() {
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
                createError("Unrecognized comment", this.at, this.text);
            }
        }

        skipInlineComment() {
            while (this.ch) {
                this.next();
                if (this.ch === '\n' || this.ch === '\r') {
                    this.next();
                    return;
                }
            }
        }

        skipBlockComment() {
            while (this.ch) {
                this.next();
                while (this.ch === '*') {
                    this.next('*');
                    if (this.ch === '/') {
                        this.next('/');
                        return;
                    }
                }
            }
            createError("Undterminated block comment", this.at, this.text);
        }

        parseIdentifier() {
            let key = this.ch;
            if ((this.ch !== '_' && this.ch !== '$') &&
                (this.ch < 'a' || this.ch > 'z') &&
                (this.ch < 'A' || this.ch > 'Z')) {
                createError("Bad identifier", this.at, this.text);
            }
            while (this.next() && (
                this.ch === '_' || this.ch === '$' ||
                (this.ch >= 'a' && this.ch <= 'z') ||
                (this.ch >= 'A' && this.ch <= 'Z') ||
                (this.ch >= '0' && this.ch <= '9')
            )) {
                key += this.ch;
            }
            return key;
        }

        parseNumber() {
            const sign = (this.ch === '-' || this.ch === '+') ? this.ch : '';
            if (sign) this.next(this.ch);
            if (this.ch === 'I') return this.parseInfinity(sign);
            if (this.ch === 'N') return this.parseNaN();
            return this.parseNumericLiteral(sign);
        }

        parseInfinity(sign) {
            const num = this.parseWord();
            if (typeof num !== 'number' || isNaN(num)) {
                createError('Unexpected word for number', this.at, this.text);
            }
            return sign === '-' ? -num : num;
        }

        parseNaN() {
            const val = this.parseWord();
            if (!isNaN(val)) {
                createError('expected word to be NaN', this.at, this.text);
            }
            return val;
        }

        parseNumericLiteral(sign) {
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
                    createError('Octal literal', this.at, this.text);
                }
            }
            if (base === 10) {
                numStr += this.consumeDecimalDigits();
                if (this.ch === '.') {
                    numStr += '.';
                    this.next();
                    numStr += this.consumeDecimalDigits();
                }
                if (this.ch === 'e' || this.ch === 'E') {
                    numStr += this.ch;
                    this.next();
                    if (this.ch === '-' || this.ch === '+') {
                        numStr += this.ch;
                        this.next();
                    }
                    numStr += this.consumeDecimalDigits();
                }
            } else {
                while (this.isHexDigit(this.ch)) {
                    numStr += this.ch;
                    this.next();
                }
            }
            const number = sign === '-' ? -numStr : +numStr;
            if (!isFinite(number)) {
                createError("Bad number", this.at, this.text);
            }
            return number;
        }

        consumeDecimalDigits() {
            let digits = '';
            while (this.ch >= '0' && this.ch <= '9') {
                digits += this.ch;
                this.next();
            }
            return digits;
        }

        isHexDigit(ch) {
            return (ch >= '0' && ch <= '9') ||
                (ch >= 'A' && ch <= 'F') ||
                (ch >= 'a' && ch <= 'f');
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
                    } else if (escapee.hasOwnProperty(this.ch)) {
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
            createError("Bad string", this.at, this.text);
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
            createError(`Unexpected '${this.ch}'`, this.at, this.text);
        }

        expectSequence(seq) {
            for (let i = 0; i < seq.length; i++) {
                this.next(seq[i]);
            }
        }

        parseArray() {
            const arr = [];
            this.next('[');
            this.skipWhite();
            while (this.ch) {
                if (this.ch === ']') {
                    this.next(']');
                    return arr;
                }
                if (this.ch === ',') createError("Missing array element", this.at, this.text);
                arr.push(this.parseValue());
                this.skipWhite();
                if (this.ch !== ',') {
                    this.next(']');
                    return arr;
                }
                this.next(',');
                this.skipWhite();
            }
            createError("Bad array", this.at, this.text);
        }

        parseObject() {
            const obj = {};
            this.next('{');
            this.skipWhite();
            while (this.ch) {
                if (this.ch === '}') {
                    this.next('}');
                    return obj;
                }
                const key = (this.ch === '"' || this.ch === "'") ? this.parseString() : this.parseIdentifier();
                this.skipWhite();
                this.next(':');
                obj[key] = this.parseValue();
                this.skipWhite();
                if (this.ch !== ',') {
                    this.next('}');
                    return obj;
                }
                this.next(',');
                this.skipWhite();
            }
            createError("Bad object", this.at, this.text);
        }

        parseValue() {
            this.skipWhite();
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
                case 'I':
                case 'N':
                    return this.parseNumber();
                default: return this.parseWord();
            }
        }
    }

    return function (source, reviver) {
        const parser = new Parser(source);
        const result = parser.parseValue();
        parser.skipWhite();
        if (parser.ch) createError("Syntax error", parser.at, parser.text);
        if (typeof reviver !== 'function') return result;
        return (function walk(holder, key) {
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
        }({ '': result }, ''));
    };
}());

JSON5.stringify = function (obj, replacer, space) {
    if (replacer && (typeof replacer !== "function" && !isArray(replacer))) {
        throw new Error('Replacer must be a function or an array');
    }

    const getReplaced = (holder, key, isTop) => {
        let value = holder[key];
        if (value && typeof value.toJSON === "function") {
            value = value.toJSON();
        }
        if (typeof replacer === "function") {
            return replacer.call(holder, key, value);
        }
        if (replacer) {
            if (isTop || isArray(holder) || replacer.indexOf(key) >= 0) {
                return value;
            }
            return undefined;
        }
        return value;
    };

    const isWordChar = (c) => (c >= 'a' && c <= 'z') ||
        (c >= 'A' && c <= 'Z') ||
        (c >= '0' && c <= '9') ||
        c === '_' || c === '$';

    const isWordStart = (c) => (c >= 'a' && c <= 'z') ||
        (c >= 'A' && c <= 'Z') ||
        c === '_' || c === '$';

    const isWord = (key) => {
        if (typeof key !== 'string') return false;
        if (!isWordStart(key[0])) return false;
        for (let i = 1; i < key.length; i++) {
            if (!isWordChar(key[i])) return false;
        }
        return true;
    };
    JSON5.isWord = isWord;

    const isArray = (obj) => Array.isArray ? Array.isArray(obj) : Object.prototype.toString.call(obj) === '[object Array]';
    const isDate = (obj) => Object.prototype.toString.call(obj) === '[object Date]';
    const isNaNPoly = (val) => typeof val === 'number' && val !== val;

    const objStack = [];
    const checkCircular = (o) => {
        for (let i = 0; i < objStack.length; i++) {
            if (objStack[i] === o) throw new TypeError("Converting circular structure to JSON");
        }
    };

    const makeIndent = (str, num, noNL) => {
        if (!str) return "";
        const limited = str.length > 10 ? str.substring(0, 10) : str;
        let indent = noNL ? "" : "\n";
        for (let i = 0; i < num; i++) indent += limited;
        return indent;
    };

    let indentStr;
    if (space) {
        if (typeof space === "string") indentStr = space;
        else if (typeof space === "number" && space >= 0) indentStr = makeIndent(" ", space, true);
    }

    const cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    const escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    const meta = {
        '\b': '\\b',
        '\t': '\\t',
        '\n': '\\n',
        '\f': '\\f',
        '\r': '\\r',
        '"': '\\"',
        '\\': '\\\\'
    };
    const escapeString = (str) => {
        escapable.lastIndex = 0;
        return escapable.test(str) ?
            '"' + str.replace(escapable, (a) => meta[a] || '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4)) + '"' :
            '"' + str + '"';
    };

    const internalStringify = (holder, key, isTop) => {
        const raw = getReplaced(holder, key, isTop);
        let value = raw;
        if (value && !isDate(value)) value = value.valueOf();

        switch (typeof value) {
            case "boolean":
                return value.toString();
            case "number":
                return (isNaNPoly(value) || !isFinite(value)) ? "null" : value.toString();
            case "string":
                return escapeString(value);
            case "object":
                if (value === null) return "null";
                if (isArray(value)) return stringifyArray(value);
                return stringifyObject(value);
            default:
                return undefined;
        }
    };

    const stringifyArray = (arr) => {
        checkCircular(arr);
        objStack.push(arr);
        let out = "[";
        for (let i = 0; i < arr.length; i++) {
            const item = internalStringify(arr, i, false);
            out += makeIndent(indentStr, objStack.length);
            out += (item === null || typeof item === "undefined") ? "null" : item;
            out += i < arr.length - 1 ? "," : indentStr ? "\n" : "";
        }
        objStack.pop();
        out += makeIndent(indentStr, objStack.length, true) + "]";
        return out;
    };

    const stringifyObject = (obj) => {
        checkCircular(obj);
        objStack.push(obj);
        let out = "{";
        let hasProp = false;
        for (const prop in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, prop)) {
                const val = internalStringify(obj, prop, false);
                if (val !== undefined && val !== null) {
                    out += makeIndent(indentStr, objStack.length);
                    hasProp = true;
                    const key = isWord(prop) ? prop : escapeString(prop);
                    out += key + ":" + (indentStr ? ' ' : '') + val + ",";
                }
            }
        }
        objStack.pop();
        if (hasProp) {
            out = out.slice(0, -1) + makeIndent(indentStr, objStack.length) + "}";
        } else {
            out = "{}";
        }
        return out;
    };

    const topHolder = { "": obj };
    if (obj === undefined) return getReplaced(topHolder, '', true);
    return internalStringify(topHolder, '', true);
};

function isArray(obj) {
    return Array.isArray ? Array.isArray(obj) : Object.prototype.toString.call(obj) === '[object Array]';
}