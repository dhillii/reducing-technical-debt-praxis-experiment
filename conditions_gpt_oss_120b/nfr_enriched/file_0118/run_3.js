```javascript
// json5.js
// Modern JSON. See README.md for details.
//
// This file is based directly off of Douglas Crockford's json_parse.js:
// https://github.com/douglascrockford/JSON-js/blob/master/json_parse.js

const JSON5 = (typeof exports === 'object' ? exports : {});

/* ---------- Parser ---------- */
class JSON5Parser {
    constructor(source) {
        this.text = String(source);
        this.at = 0;
        this.ch = ' ';
        this.escapee = {
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
        this.ws = [
            ' ', '\t', '\r', '\n', '\v', '\f', '\xA0', '\uFEFF'
        ];
    }

    error(msg) {
        const err = new SyntaxError(msg);
        err.at = this.at;
        err.text = this.text;
        throw err;
    }

    next(expected) {
        if (expected && expected !== this.ch) {
            this.error(`Expected '${expected}' instead of '${this.ch}'`);
        }
        this.ch = this.text.charAt(this.at);
        this.at += 1;
        return this.ch;
    }

    peek() {
        return this.text.charAt(this.at);
    }

    skipWhite() {
        while (this.ch) {
            if (this.ch === '/') {
                this._skipComment();
            } else if (this.ws.includes(this.ch)) {
                this.next();
            } else {
                break;
            }
        }
    }

    _skipComment() {
        this.next('/');
        if (this.ch === '/') {
            this._skipInlineComment();
        } else if (this.ch === '*') {
            this._skipBlockComment();
        } else {
            this.error('Unrecognized comment');
        }
    }

    _skipInlineComment() {
        while (this.next()) {
            if (this.ch === '\n' || this.ch === '\r') {
                this.next();
                return;
            }
        }
    }

    _skipBlockComment() {
        while (this.next()) {
            while (this.ch === '*') {
                this.next('*');
                if (this.ch === '/') {
                    this.next('/');
                    return;
                }
            }
        }
        this.error('Unterminated block comment');
    }

    parseIdentifier() {
        let key = this.ch;
        if ((this.ch !== '_' && this.ch !== '$') &&
            (this.ch < 'a' || this.ch > 'z') &&
            (this.ch < 'A' || this.ch > 'Z')) {
            this.error('Bad identifier');
        }
        while (this.next() && /[_$a-zA-Z0-9]/.test(this.ch)) {
            key += this.ch;
        }
        return key;
    }

    parseNumber() {
        let sign = '';
        let numStr = '';
        let base = 10;

        if (this.ch === '-' || this.ch === '+') {
            sign = this.ch;
            this.next(this.ch);
        }

        if (this.ch === 'I') {
            const val = this._parseWord();
            if (typeof val !== 'number' || isNaN(val)) this.error('Unexpected word for number');
            return sign === '-' ? -val : val;
        }

        if (this.ch === 'N') {
            const val = this._parseWord();
            if (!isNaN(val)) this.error('expected word to be NaN');
            return val;
        }

        if (this.ch === '0') {
            numStr += this.ch;
            this.next();
            if (this.ch === 'x' || this.ch === 'X') {
                numStr += this.ch;
                this.next();
                base = 16;
            } else if (/[0-9]/.test(this.ch)) {
                this.error('Octal literal');
            }
        }

        if (base === 10) {
            while (/[0-9]/.test(this.ch)) {
                numStr += this.ch;
                this.next();
            }
            if (this.ch === '.') {
                numStr += '.';
                while (this.next() && /[0-9]/.test(this.ch)) {
                    numStr += this.ch;
                }
            }
            if (this.ch === 'e' || this.ch === 'E') {
                numStr += this.ch;
                this.next();
                if (this.ch === '-' || this.ch === '+') {
                    numStr += this.ch;
                    this.next();
                }
                while (/[0-9]/.test(this.ch)) {
                    numStr += this.ch;
                    this.next();
                }
            }
        } else {
            while (/[0-9a-fA-F]/.test(this.ch)) {
                numStr += this.ch;
                this.next();
            }
        }

        const number = sign === '-' ? -numStr : +numStr;
        if (!isFinite(number)) this.error('Bad number');
        return number;
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
                    let uffff = 0;
                    for (let i = 0; i < 4; i++) {
                        const hex = parseInt(this.next(), 16);
                        if (!isFinite(hex)) break;
                        uffff = uffff * 16 + hex;
                    }
                    result += String.fromCharCode(uffff);
                } else if (this.ch === '\r') {
                    if (this.peek() === '\n') this.next();
                } else if (this.escapee[this.ch] !== undefined) {
                    result += this.escapee[this.ch];
                } else {
                    break;
                }
            } else if (this.ch === '\n') {
                break;
            } else {
                result += this.ch;
            }
        }
        this.error('Bad string');
    }

    _parseWord() {
        switch (this.ch) {
            case 't':
                this.next('t'); this.next('r'); this.next('u'); this.next('e');
                return true;
            case 'f':
                this.next('f'); this.next('a'); this.next('l'); this.next('s'); this.next('e');
                return false;
            case 'n':
                this.next('n'); this.next('u'); this.next('l'); this.next('l');
                return null;
            case 'I':
                this.next('I'); this.next('n'); this.next('f'); this.next('i'); this.next('n'); this.next('i'); this.next('t'); this.next('y');
                return Infinity;
            case 'N':
                this.next('N'); this.next('a'); this.next('N');
                return NaN;
        }
        this.error(`Unexpected '${this.ch}'`);
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
            case '.': return this.parseNumber();
            default:
                return (/[0-9]/.test(this.ch)) ? this.parseNumber() : this._parseWord();
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
            if (this.ch === ',') this.error('Missing array element');
            arr.push(this.parseValue());
            this.skipWhite();
            if (this.ch !== ',') {
                this.next(']');
                return arr;
            }
            this.next(',');
            this.skipWhite();
        }
        this.error('Bad array');
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
        this.error('Bad object');
    }
}

/* ---------- Public parse ---------- */
JSON5.parse = function (source, reviver) {
    const parser = new JSON5Parser(source);
    const result = parser.parseValue();
    parser.skipWhite();
    if (parser.ch) parser.error('Syntax error');

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

/* ---------- Stringify ---------- */
JSON5.stringify = function (obj, replacer, space) {
    const isArray = (arr) => Array.isArray ? Array.isArray(arr) : Object.prototype.toString.call(arr) === '[object Array]';
    const isDate = (d) => Object.prototype.toString.call(d) === '[object Date]';
    const isNaNPoly = (v) => typeof v === 'number' && v !== v;
    const isWordChar = (c) => /[a-zA-Z0-9_$]/.test(c);
    const isWordStart = (c) => /[a-zA-Z_$]/.test(c);
    const isWord = (key) => typeof key === 'string' && isWordStart(key[0]) && [...key].every(isWordChar);
    JSON5.isWord = isWord; // export for tests

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

    const makeIndent = (str, num, noNL) => {
        if (!str) return '';
        const base = str.length > 10 ? str.slice(0, 10) : str;
        const nl = noNL ? '' : '\n';
        return nl + base.repeat(num);
    };

    let indentStr = '';
    if (space) {
        if (typeof space === 'string') indentStr = space;
        else if (typeof space === 'number' && space >= 0) indentStr = makeIndent(' ', space, true);
    }

    const cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    const escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    const meta = { '\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f', '\r': '\\r', '"': '\\"', '\\': '\\\\' };
    const escapeString = (str) => {
        escapable.lastIndex = 0;
        return escapable.test(str)
            ? '"' + str.replace(escapable, (a) => meta[a] || '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4)) + '"'
            : '"' + str + '"';
    };

    const stack = [];
    const checkCircular = (value) => {
        if (stack.includes(value)) throw new TypeError('Converting circular structure to JSON');
    };

    const internalStringify = (holder, key, top) => {
        const raw = getReplaced(holder, key, top);
        const value = raw && !isDate(raw) ? raw.valueOf() : raw;

        switch (typeof value) {
            case 'boolean':
                return value.toString();
            case 'number':
                return (isNaNPoly(value) || !isFinite(value)) ? 'null' : value.toString();
            case 'string':
                return escapeString(value);
            case 'object':
                if (value === null) return 'null';
                if (isArray(value)) {
                    checkCircular(value);
                    stack.push(value);
                    const parts = value.map((_, i) => {
                        const res = internalStringify(value, i, false);
                        return res == null ? 'null' : res;
                    });
                    const joined = parts.join(',');
                    const result = '[' + makeIndent(indentStr, stack.length) + joined + makeIndent(indentStr, stack.length, true) + ']';
                    stack.pop();
                    return result;
                }
                checkCircular(value);
                stack.push(value);
                let objStr = '';
                let first = true;
                for (const prop in value) {
                    if (Object.prototype.hasOwnProperty.call(value, prop)) {
                        const propVal = internalStringify(value, prop, false);
                        if (propVal !== undefined && propVal !== null) {
                            const keyStr = isWord(prop) ? prop : escapeString(prop);
                            const sep = indentStr ? ': ' : ':';
                            objStr += makeIndent(indentStr, stack.length) + keyStr + sep + propVal + ',';
                            first = false;
                        }
                    }
                }
                stack.pop();
                if (!first) {
                    objStr = '{' + objStr.slice(0, -1) + makeIndent(indentStr, stack.length) + '}';
                } else {
                    objStr = '{}';
                }
                return objStr;
            default:
                return undefined;
        }
    };

    const topHolder = { '': obj };
    if (obj === undefined) return getReplaced(topHolder, '', true);
    return internalStringify(topHolder, '', true);
};
```