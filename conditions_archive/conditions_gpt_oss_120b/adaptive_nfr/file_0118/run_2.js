```javascript
// json5.js
// Modern JSON. See README.md for details.
//
// This file is based directly off of Douglas Crockford's json_parse.js:
// https://github.com/douglascrockford/JSON-js/blob/master/json_parse.js

const JSON5 = typeof exports === 'object' ? exports : {};

/**
 * Parse a JSON5 text, producing a JavaScript data structure.
 * @returns {function(string, function=):*}
 */
JSON5.parse = (function () {
    'use strict';

    // ---------- State ----------
    let at = 0;               // The index of the current character
    let ch = '';              // The current character
    let text = '';            // Input text

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

    const ws = [
        ' ', '\t', '\r', '\n', '\v', '\f', '\xA0', '\uFEFF'
    ];

    // ---------- Helper Predicates ----------
    /** @returns {boolean} */
    const isWhitespace = c => ws.includes(c);
    /** @returns {boolean} */
    const isIdentifierStart = c => c === '_' || c === '$' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
    /** @returns {boolean} */
    const isIdentifierPart = c => isIdentifierStart(c) || (c >= '0' && c <= '9');
    /** @returns {boolean} */
    const isDigit = c => c >= '0' && c <= '9';
    /** @returns {boolean} */
    const isHexDigit = c => isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
    /** @returns {boolean} */
    const isWordChar = c => isIdentifierPart(c);
    /** @returns {boolean} */
    const isWordStart = c => isIdentifierStart(c);
    /** @returns {boolean} */
    const isObject = v => v && typeof v === 'object';
    /** @returns {boolean} */
    const isArray = obj => Array.isArray ? Array.isArray(obj) : Object.prototype.toString.call(obj) === '[object Array]';
    /** @returns {boolean} */
    const isDate = obj => Object.prototype.toString.call(obj) === '[object Date]';

    // ---------- Core Functions ----------
    const error = m => {
        const err = new SyntaxError();
        err.message = m;
        err.at = at;
        err.text = text;
        throw err;
    };

    const next = expected => {
        if (expected && expected !== ch) {
            error(`Expected '${expected}' instead of '${ch}'`);
        }
        ch = text.charAt(at);
        at += 1;
        return ch;
    };

    const peek = () => text.charAt(at);

    const skipWhitespaceAndComments = () => {
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

    // ---------- Comment Handling ----------
    const comment = () => {
        if (ch !== '/') error('Not a comment');
        next('/');
        if (ch === '/') {
            inlineComment();
        } else if (ch === '*') {
            blockComment();
        } else {
            error('Unrecognized comment');
        }
    };

    const inlineComment = () => {
        if (ch !== '/') error('Not an inline comment');
        do {
            next();
            if (ch === '\n' || ch === '\r') {
                next();
                return;
            }
        } while (ch);
    };

    const blockComment = () => {
        if (ch !== '*') error('Not a block comment');
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
        error('Undetermined block comment');
    };

    // ---------- Token Parsers ----------
    const parseIdentifier = () => {
        if (!isIdentifierStart(ch)) error('Bad identifier');
        let key = ch;
        while (next() && isIdentifierPart(ch)) {
            key += ch;
        }
        return key;
    };

    const parseNumber = () => {
        let sign = '';
        let numStr = '';
        let base = 10;

        if (ch === '-' || ch === '+') {
            sign = ch;
            next(ch);
        }

        if (ch === 'I') return parseInfinity(sign);
        if (ch === 'N') return parseNaN();

        if (ch === '0') {
            numStr += ch;
            next();
            if (ch === 'x' || ch === 'X') {
                numStr += ch;
                next();
                base = 16;
            } else if (isDigit(ch)) {
                error('Octal literal');
            }
        }

        if (base === 10) {
            while (isDigit(ch)) {
                numStr += ch;
                next();
            }
            if (ch === '.') {
                numStr += '.';
                while (next() && isDigit(ch)) {
                    numStr += ch;
                }
            }
            if (ch === 'e' || ch === 'E') {
                numStr += ch;
                next();
                if (ch === '-' || ch === '+') {
                    numStr += ch;
                    next();
                }
                while (isDigit(ch)) {
                    numStr += ch;
                    next();
                }
            }
        } else {
            while (isHexDigit(ch)) {
                numStr += ch;
                next();
            }
        }

        const number = sign === '-' ? -numStr : +numStr;
        if (!isFinite(number)) error('Bad number');
        return number;
    };

    const parseInfinity = sign => {
        const val = word();
        if (typeof val !== 'number' || isNaN(val)) error('Unexpected word for number');
        return sign === '-' ? -val : val;
    };

    const parseNaN = () => {
        const val = word();
        if (!isNaN(val)) error('expected word to be NaN');
        return val;
    };

    const parseString = () => {
        if (ch !== '"' && ch !== "'") error('Bad string');
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
                    let uffff = 0;
                    for (let i = 0; i < 4; i++) {
                        const hex = parseInt(next(), 16);
                        if (!isFinite(hex)) break;
                        uffff = uffff * 16 + hex;
                    }
                    result += String.fromCharCode(uffff);
                } else if (ch === '\r') {
                    if (peek() === '\n') next();
                } else if (escapee[ch] !== undefined) {
                    result += escapee[ch];
                } else {
                    break;
                }
            } else if (ch === '\n') {
                break;
            } else {
                result += ch;
            }
        }
        error('Bad string');
    };

    const parseWord = () => {
        switch (ch) {
            case 't':
                next('t'); next('r'); next('u'); next('e');
                return true;
            case 'f':
                next('f'); next('a'); next('l'); next('s'); next('e');
                return false;
            case 'n':
                next('n'); next('u'); next('l'); next('l');
                return null;
            case 'I':
                next('I'); next('n'); next('f'); next('i'); next('n'); next('i'); next('t'); next('y');
                return Infinity;
            case 'N':
                next('N'); next('a'); next('N');
                return NaN;
            default:
                error(`Unexpected '${ch}'`);
        }
    };

    const parseArray = () => {
        const arr = [];
        if (ch !== '[') error('Bad array');
        next('[');
        white();
        while (ch) {
            if (ch === ']') {
                next(']');
                return arr;
            }
            if (ch === ',') error('Missing array element');
            arr.push(value());
            white();
            if (ch !== ',') {
                next(']');
                return arr;
            }
            next(',');
            white();
        }
        error('Bad array');
    };

    const parseObject = () => {
        const obj = {};
        if (ch !== '{') error('Bad object');
        next('{');
        white();
        while (ch) {
            if (ch === '}') {
                next('}');
                return obj;
            }
            const key = (ch === '"' || ch === "'") ? parseString() : parseIdentifier();
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
        error('Bad object');
    };

    const value = () => {
        white();
        switch (ch) {
            case '{': return parseObject();
            case '[': return parseArray();
            case '"':
            case "'": return parseString();
            case '-':
            case '+':
            case '.': return parseNumber();
            default: return isDigit(ch) ? parseNumber() : parseWord();
        }
    };

    const white = () => skipWhitespaceAndComments();

    // ---------- Public Parse Function ----------
    return (source, reviver) => {
        text = String(source);
        at = 0;
        ch = ' ';
        const result = value();
        white();
        if (ch) error('Syntax error');

        if (typeof reviver !== 'function') return result;

        const walk = (holder, key) => {
            const val = holder[key];
            if (isObject(val)) {
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
        return walk({ '': result }, '');
    };
})();

/**
 * JSON5 stringify will not quote keys where appropriate
 * @param {*} obj
 * @param {(function|string[])=} replacer
 * @param {(number|string)=} space
 * @returns {string|undefined}
 */
JSON5.stringify = function (obj, replacer, space) {
    if (replacer && typeof replacer !== 'function' && !isArray(replacer)) {
        throw new Error('Replacer must be a function or an array');
    }

    const getReplacedValueOrUndefined = (holder, key, isTopLevel) => {
        let value = holder[key];
        if (value && typeof value.toJSON === 'function') {
            value = value.toJSON();
        }
        if (typeof replacer === 'function') {
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

    const isWordChar = c => (c >= 'a' && c <= 'z') ||
        (c >= 'A' && c <= 'Z') ||
        (c >= '0' && c <= '9') ||
        c === '_' || c === '$';

    const isWordStart = c => (c >= 'a' && c <= 'z') ||
        (c >= 'A' && c <= 'Z') ||
        c === '_' || c === '$';

    const isWord = key => {
        if (typeof key !== 'string') return false;
        if (!isWordStart(key[0])) return false;
        for (let i = 1; i < key.length; i++) {
            if (!isWordChar(key[i])) return false;
        }
        return true;
    };

    // Export for tests
    JSON5.isWord = isWord;

    const makeIndent = (str, num, noNewLine) => {
        if (!str) return '';
        const limited = str.length > 10 ? str.substring(0, 10) : str;
        let indent = noNewLine ? '' : '\n';
        for (let i = 0; i < num; i++) {
            indent += limited;
        }
        return indent;
    };

    let indentStr;
    if (space) {
        if (typeof space === 'string') {
            indentStr = space;
        } else if (typeof space === 'number' && space >= 0) {
            indentStr = makeIndent(' ', space, true);
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
        '"': '\\"',
        '\\': '\\\\'
    };

    const escapeString = s => {
        escapable.lastIndex = 0;
        return escapable.test(s)
            ? '"' + s.replace(escapable, a => {
                const c = meta[a];
                return typeof c === 'string' ? c : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
            }) + '"'
            : '"' + s + '"';
    };

    const circularStack = [];

    const checkForCircular = obj => {
        for (const item of circularStack) {
            if (item === obj) throw new TypeError('Converting circular structure to JSON');
        }
    };

    const internalStringify = (holder, key, isTopLevel) => {
        let value = getReplacedValueOrUndefined(holder, key, isTopLevel);
        if (value && !isDate(value)) value = value.valueOf();

        switch (typeof value) {
            case 'boolean':
                return value.toString();
            case 'number':
                return (isNaN(value) || !isFinite(value)) ? 'null' : value.toString();
            case 'string':
                return escapeString(value);
            case 'object':
                if (value === null) return 'null';
                if (isArray(value)) {
                    checkForCircular(value);
                    circularStack.push(value);
                    const parts = value.map((_, i) => {
                        const res = internalStringify(value, i, false);
                        return res == null ? 'null' : res;
                    });
                    circularStack.pop();
                    return '[' + parts.map(p => makeIndent(indentStr, circularStack.length) + p).join(',') + (indentStr ? '\n' : '') + makeIndent(indentStr, circularStack.length, true) + ']';
                }
                checkForCircular(value);
                circularStack.push(value);
                const entries = [];
                for (const prop in value) {
                    if (Object.prototype.hasOwnProperty.call(value, prop)) {
                        const v = internalStringify(value, prop, false);
                        if (v !== undefined && v !== null) {
                            const keyStr = isWord(prop) ? prop : escapeString(prop);
                            entries.push(makeIndent(indentStr, circularStack.length) + keyStr + ':' + (indentStr ? ' ' : '') + v);
                        }
                    }
                }
                circularStack.pop();
                if (entries.length) {
                    return '{' + entries.join(',') + makeIndent(indentStr, circularStack.length) + '}';
                }
                return '{}';
            default:
                return undefined;
        }
    };

    const topHolder = { '': obj };
    if (obj === undefined) {
        return getReplacedValueOrUndefined(topHolder, '', true);
    }
    return internalStringify(topHolder, '', true);
};
```