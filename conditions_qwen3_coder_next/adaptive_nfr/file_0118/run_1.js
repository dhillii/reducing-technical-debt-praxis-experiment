// This file is based directly off of Douglas Crockford's json_parse.js:
// https://github.com/douglascrockford/JSON-js/blob/master/json_parse.js

var JSON5 = (typeof exports === 'object' ? exports : {});

JSON5.parse = (function () {
    "use strict";

    var at,
        ch,
        escapee = {
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
        },
        ws = [
            ' ',
            '\t',
            '\r',
            '\n',
            '\v',
            '\f',
            '\xA0',
            '\uFEFF'
        ],
        text;

    /**
     * Throw a SyntaxError with position and text information.
     */
    function error(m) {
        var err = new SyntaxError();
        err.message = m;
        err.at = at;
        err.text = text;
        throw err;
    }

    /**
     * Advance to next character and optionally validate expected character.
     */
    function next(c) {
        if (c && c !== ch) {
            error("Expected '" + c + "' instead of '" + ch + "'");
        }
        ch = text.charAt(at);
        at += 1;
        return ch;
    }

    /**
     * Peek at next character without consuming it.
     */
    function peek() {
        return text.charAt(at);
    }

    /**
     * Parse an identifier starting with current character.
     */
    function identifier() {
        var key = ch;

        if (!isIdentifierStart(ch)) {
            error("Bad identifier");
        }

        while (next() && isIdentifierPart(ch)) {
            key += ch;
        }

        return key;
    }

    /**
     * Check if character is valid for identifier start.
     */
    function isIdentifierStart(c) {
        return c === '_' || c === '$' ||
            (c >= 'a' && c <= 'z') ||
            (c >= 'A' && c <= 'Z');
    }

    /**
     * Check if character is valid for identifier part.
     */
    function isIdentifierPart(c) {
        return c === '_' || c === '$' ||
            (c >= 'a' && c <= 'z') ||
            (c >= 'A' && c <= 'Z') ||
            (c >= '0' && c <= '9');
    }

    /**
     * Parse a number value.
     */
    function number() {
        var sign = '',
            string = '',
            base = 10;

        if (ch === '-' || ch === '+') {
            sign = ch;
            next();
        }

        if (isInfinityIndicator()) {
            return processInfinity(sign);
        }

        if (isNaNIndicator()) {
            return NaN;
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

        switch (base) {
        case 10:
            parseDecimalNumber(string);
            break;
        case 16:
            parseHexNumber(string);
            break;
        }

        return createNumber(sign, string);
    }

    /**
     * Check if current character starts Infinity.
     */
    function isInfinityIndicator() {
        return ch === 'I';
    }

    /**
     * Process Infinity value with sign handling.
     */
    function processInfinity(sign) {
        var number = word();
        if (typeof number !== 'number' || isNaN(number)) {
            error('Unexpected word for number');
        }
        return (sign === '-') ? -number : number;
    }

    /**
     * Check if current character starts NaN.
     */
    function isNaNIndicator() {
        return ch === 'N';
    }

    /**
     * Parse decimal number pattern.
     */
    function parseDecimalNumber(string) {
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
    }

    /**
     * Parse hexadecimal number pattern.
     */
    function parseHexNumber(string) {
        while (isHexDigit(ch)) {
            string += ch;
            next();
        }
    }

    /**
     * Check if character is a digit [0-9].
     */
    function isDigit(c) {
        return c >= '0' && c <= '9';
    }

    /**
     * Check if character is a hexadecimal digit.
     */
    function isHexDigit(c) {
        return isDigit(c) ||
            (c >= 'A' && c <= 'F') ||
            (c >= 'a' && c <= 'f');
    }

    /**
     * Create final number value with sign handling.
     */
    function createNumber(sign, string) {
        var number = (sign === '-') ? -string : +string;

        if (!isFinite(number)) {
            error("Bad number");
        }
        return number;
    }

    /**
     * Parse a string value.
     */
    function string() {
        var delim,
            string = '',
            uffff;

        if (ch !== '"' && ch !== "'") {
            error("Bad string");
        }

        delim = ch;
        while (next()) {
            if (ch === delim) {
                next();
                return string;
            } else if (ch === '\\') {
                next();
                if (ch === 'u') {
                    uffff = 0;
                    for (var i = 0; i < 4; i += 1) {
                        var hex = parseInt(next(), 16);
                        if (!isFinite(hex)) {
                            break;
                        }
                        uffff = uffff * 16 + hex;
                    }
                    string += String.fromCharCode(uffff);
                } else if (ch === '\r') {
                    if (peek() === '\n') {
                        next();
                    }
                } else if (escapee[ch] !== undefined && typeof escapee[ch] === 'string') {
                    string += escapee[ch];
                } else {
                    break;
                }
            } else if (ch === '\n') {
                break;
            } else {
                string += ch;
            }
        }
        error("Bad string");
    }

    /**
     * Skip an inline comment starting at current position.
     */
    function inlineComment() {
        if (ch !== '/') {
            error("Not an inline comment");
        }

        do {
            next();
        } while (ch && ch !== '\n' && ch !== '\r');

        next();
    }

    /**
     * Skip a block comment starting at current position.
     */
    function blockComment() {
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
    }

    /**
     * Skip a comment (inline or block) starting at current position.
     */
    function comment() {
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
    }

    /**
     * Skip whitespace and comments.
     */
    function white() {
        while (ch) {
            if (ch === '/') {
                comment();
            } else if (ws.indexOf(ch) >= 0) {
                next();
            } else {
                return;
            }
        }
    }

    /**
     * Parse literal values true, false, null, Infinity, NaN.
     */
    function word() {
        switch (ch) {
        case 't':
            advanceExpected('true');
            return true;
        case 'f':
            advanceExpected('false');
            return false;
        case 'n':
            advanceExpected('null');
            return null;
        case 'I':
            advanceExpected('Infinity');
            return Infinity;
        case 'N':
            next('N');
            next('a');
            next('N');
            return NaN;
        default:
            error("Unexpected '" + ch + "'");
        }
    }

    /**
     * Helper to advance and verify expected word characters.
     */
    function advanceExpected(wordStr) {
        for (var i = 0; i < wordStr.length; i++) {
            next(wordStr.charAt(i));
        }
    }

    /**
     * Parse an array value.
     */
    function array() {
        var arr = [];

        if (ch !== '[') {
            error("Bad array");
        }

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
    }

    /**
     * Parse an object value.
     */
    function object() {
        var key,
            obj = {};

        if (ch !== '{') {
            error("Bad object");
        }

        next('{');
        white();

        while (ch) {
            if (ch === '}') {
                next('}');
                return obj;
            }

            key = (ch === '"' || ch === "'") ? string() : identifier();
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
    }

    /**
     * Parse any JSON5 value.
     */
    function value() {
        white();

        if (ch === '{') {
            return object();
        }
        if (ch === '[') {
            return array();
        }
        if (ch === '"' || ch === "'") {
            return string();
        }
        if (ch === '-' || ch === '+' || ch === '.') {
            return number();
        }
        if (ch >= '0' && ch <= '9') {
            return number();
        }

        return word();
    }

    /**
     * Parse JSON5 source text and return parsed value.
     */
    function parser(source, reviver) {
        var result;

        text = String(source);
        at = 0;
        ch = ' ';
        result = value();
        white();
        if (ch) {
            error("Syntax error");
        }

        if (typeof reviver !== 'function') {
            return result;
        }

        function walk(holder, key) {
            var k,
                v,
                value = holder[key];

            if (value && typeof value === 'object') {
                for (k in value) {
                    if (Object.prototype.hasOwnProperty.call(value, k)) {
                        v = walk(value, k);
                        if (v !== undefined) {
                            value[k] = v;
                        } else {
                            delete value[k];
                        }
                    }
                }
            }

            return reviver.call(holder, key, value);
        }

        return walk({'': result}, '');
    }

    return parser;
}());