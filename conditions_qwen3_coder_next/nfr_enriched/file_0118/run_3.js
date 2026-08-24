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

    function showError(message) {
        const error = new SyntaxError();
        error.message = message;
        error.at = at;
        error.text = text;
        throw error;
    }

    function next(expectedChar) {
        if (expectedChar && expectedChar !== ch) {
            showError(`Expected '${expectedChar}' instead of '${ch}'`);
        }

        ch = text.charAt(at);
        at += 1;
        return ch;
    }

    function peek() {
        return text.charAt(at);
    }

    function parseIdentifier() {
        let key = ch;

        if ((ch !== '_' && ch !== '$') && (ch < 'a' || ch > 'z') && (ch < 'A' || ch > 'Z')) {
            showError('Bad identifier');
        }

        while (next() && (
            ch === '_' || ch === '$' ||
            (ch >= 'a' && ch <= 'z') ||
            (ch >= 'A' && ch <= 'Z') ||
            (ch >= '0' && ch <= '9')
        )) {
            key += ch;
        }

        return key;
    }

    function parseNumber() {
        let number,
            sign = '',
            string = '',
            base = 10;

        if (ch === '-' || ch === '+') {
            sign = ch;
            next();
        }

        if (ch === 'I') {
            number = parseWord();
            if (typeof number !== 'number' || isNaN(number)) {
                showError('Unexpected word for number');
            }
            return sign === '-' ? -number : number;
        }

        if (ch === 'N') {
            number = parseWord();
            if (!isNaN(number)) {
                showError('expected word to be NaN');
            }
            return number;
        }

        if (ch === '0') {
            string += ch;
            next();
            if (ch === 'x' || ch === 'X') {
                string += ch;
                next();
                base = 16;
            } else if (ch >= '0' && ch <= '9') {
                showError('Octal literal');
            }
        }

        switch (base) {
        case 10:
            string += parseDecimalDigits();
            if (ch === '.') {
                string += parseFractionalPart();
            }
            if (ch === 'e' || ch === 'E') {
                string += parseExponent();
            }
            break;
        case 16:
            string += parseHexDigits();
            break;
        }

        number = sign === '-' ? -string : +string;

        if (!isFinite(number)) {
            showError('Bad number');
        }

        return number;
    }

    function parseDecimalDigits() {
        let result = '';
        while (ch >= '0' && ch <= '9') {
            result += ch;
            next();
        }
        return result;
    }

    function parseFractionalPart() {
        let result = '.';
        next();
        while (ch >= '0' && ch <= '9') {
            result += ch;
            next();
        }
        return result;
    }

    function parseExponent() {
        let result = ch;
        next();
        if (ch === '-' || ch === '+') {
            result += ch;
            next();
        }
        while (ch >= '0' && ch <= '9') {
            result += ch;
            next();
        }
        return result;
    }

    function parseHexDigits() {
        let result = '';
        while (
            (ch >= '0' && ch <= '9') ||
            (ch >= 'A' && ch <= 'F') ||
            (ch >= 'a' && ch <= 'f')
        ) {
            result += ch;
            next();
        }
        return result;
    }

    function parseString() {
        let hex,
            i,
            string = '',
            delim,
            uffff;

        if (ch === '"' || ch === "'") {
            delim = ch;
            while (next()) {
                if (ch === delim) {
                    next();
                    return string;
                } else if (ch === '\\') {
                    next();
                    if (ch === 'u') {
                        uffff = 0;
                        for (i = 0; i < 4; i += 1) {
                            hex = parseInt(next(), 16);
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
                    } else if (typeof escapee[ch] === 'string') {
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
        }
        showError('Bad string');
    }

    function skipInlineComment() {
        if (ch !== '/') {
            showError('Not an inline comment');
        }

        do {
            next();
            if (ch === '\n' || ch === '\r') {
                next();
                return;
            }
        } while (ch);
    }

    function skipBlockComment() {
        if (ch !== '*') {
            showError('Not a block comment');
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

        showError('Unterminated block comment');
    }

    function skipComment() {
        if (ch !== '/') {
            showError('Not a comment');
        }

        next('/');

        if (ch === '/') {
            skipInlineComment();
        } else if (ch === '*') {
            skipBlockComment();
        } else {
            showError('Unrecognized comment');
        }
    }

    function skipWhitespaceAndComments() {
        while (ch) {
            if (ch === '/') {
                skipComment();
            } else if (ws.indexOf(ch) >= 0) {
                next();
            } else {
                return;
            }
        }
    }

    function parseWord() {
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
        showError(`Unexpected '${ch}'`);
    }

    function parseArray() {
        const array = [];

        if (ch === '[') {
            next('[');
            skipWhitespaceAndComments();
            while (ch) {
                if (ch === ']') {
                    next(']');
                    return array;
                }
                if (ch === ',') {
                    showError('Missing array element');
                } else {
                    array.push(parseValue());
                }
                skipWhitespaceAndComments();
                if (ch !== ',') {
                    next(']');
                    return array;
                }
                next(',');
                skipWhitespaceAndComments();
            }
        }
        showError('Bad array');
    }

    function parseObject() {
        let key;
        const object = {};

        if (ch === '{') {
            next('{');
            skipWhitespaceAndComments();
            while (ch) {
                if (ch === '}') {
                    next('}');
                    return object;
                }

                if (ch === '"' || ch === "'") {
                    key = parseString();
                } else {
                    key = parseIdentifier();
                }

                skipWhitespaceAndComments();
                next(':');
                object[key] = parseValue();
                skipWhitespaceAndComments();
                if (ch !== ',') {
                    next('}');
                    return object;
                }
                next(',');
                skipWhitespaceAndComments();
            }
        }
        showError('Bad object');
    }

    function parseValue() {
        skipWhitespaceAndComments();
        switch (ch) {
        case '{':
            return parseObject();
        case '[':
            return parseArray();
        case '"':
        case "'":
            return parseString();
        case '-':
        case '+':
        case '.':
            return parseNumber();
        default:
            return (ch >= '0' && ch <= '9') ? parseNumber() : parseWord();
        }
    }

    return function (source, reviver) {
        text = String(source);
        at = 0;
        ch = ' ';
        const result = parseValue();
        skipWhitespaceAndComments();
        if (ch) {
            showError('Syntax error');
        }

        if (typeof reviver !== 'function') {
            return result;
        }

        function walk(holder, key) {
            const value = holder[key];
            if (value && typeof value === 'object') {
                for (const k in value) {
                    if (Object.prototype.hasOwnProperty.call(value, k)) {
                        const replacedValue = walk(value, k);
                        if (replacedValue !== undefined) {
                            value[k] = replacedValue;
                        } else {
                            delete value[k];
                        }
                    }
                }
            }
            return reviver.call(holder, key, value);
        }

        return walk({'': result}, '');
    };
}());

JSON5.stringify = function (obj, replacer, space) {
    if (replacer && (typeof replacer !== 'function' && !Array.isArray(replacer))) {
        throw new Error('Replacer must be a function or an array');
    }

    function getReplacedValueOrUndefined(holder, key, isTopLevel) {
        let value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === 'function') {
            value = value.toJSON();
        }

        if (typeof replacer === 'function') {
            return replacer.call(holder, key, value);
        } else if (replacer) {
            return isTopLevel || Array.isArray(holder) || replacer.indexOf(key) >= 0 ? value : undefined;
        } else {
            return value;
        }
    }

    function isWordChar(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            (char >= '0' && char <= '9') ||
            char === '_' || char === '$';
    }

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
        for (let i = 1, len = key.length; i < len; i++) {
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
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    }

    function isDate(obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    }

    const isNaNSafe = isNaN || function(val) {
        return typeof val === 'number' && val !== val;
    };

    const objStack = [];
    function checkForCircular(obj) {
        for (let i = 0; i < objStack.length; i++) {
            if (objStack[i] === obj) {
                throw new TypeError('Converting circular structure to JSON');
            }
        }
    }

    function makeIndent(str, num, noNewLine) {
        if (!str) {
            return '';
        }
        if (str.length > 10) {
            str = str.substring(0, 10);
        }

        let indent = noNewLine ? '' : '\n';
        for (let i = 0; i < num; i++) {
            indent += str;
        }

        return indent;
    }

    let indentStr;
    if (space) {
        if (typeof space === 'string') {
            indentStr = space;
        } else if (typeof space === 'number' && space >= 0) {
            indentStr = makeIndent(' ', space, true);
        }
    }

    const cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta = {
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
        return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
            const c = meta[a];
            return typeof c === 'string' ? c : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    }

    function internalStringify(holder, key, isTopLevel) {
        let objPart = getReplacedValueOrUndefined(holder, key, isTopLevel);

        if (objPart && !isDate(objPart)) {
            objPart = objPart.valueOf();
        }

        switch (typeof objPart) {
        case 'boolean':
            return objPart.toString();

        case 'number':
            if (isNaNSafe(objPart) || !isFinite(objPart)) {
                return 'null';
            }
            return objPart.toString();

        case 'string':
            return escapeString(objPart.toString());

        case 'object':
            if (objPart === null) {
                return 'null';
            } else if (Array.isArray(objPart)) {
                checkForCircular(objPart);
                let buffer = '[';
                objStack.push(objPart);

                for (let i = 0; i < objPart.length; i++) {
                    const res = internalStringify(objPart, i, false);
                    buffer += makeIndent(indentStr, objStack.length);
                    if (res === null || typeof res === 'undefined') {
                        buffer += 'null';
                    } else {
                        buffer += res;
                    }
                    if (i < objPart.length - 1) {
                        buffer += ',';
                    } else if (indentStr) {
                        buffer += '\n';
                    }
                }
                objStack.pop();
                buffer += makeIndent(indentStr, objStack.length, true) + ']';
                return buffer;
            } else {
                checkForCircular(objPart);
                let buffer = '{';
                let nonEmpty = false;
                objStack.push(objPart);
                for (const prop in objPart) {
                    if (Object.prototype.hasOwnProperty.call(objPart, prop)) {
                        const value = internalStringify(objPart, prop, false);
                        if (typeof value !== 'undefined' && value !== null) {
                            buffer += makeIndent(indentStr, objStack.length);
                            nonEmpty = true;
                            const keyStr = isWord(prop) ? prop : escapeString(prop);
                            buffer += keyStr + ':' + (indentStr ? ' ' : '') + value + ',';
                        }
                    }
                }
                objStack.pop();
                if (nonEmpty) {
                    buffer = buffer.substring(0, buffer.length - 1) + makeIndent(indentStr, objStack.length) + '}';
                } else {
                    buffer = '{}';
                }
                return buffer;
            }
        default:
            return undefined;
        }
    }

    const topLevelHolder = {'': obj};
    if (obj === undefined) {
        return getReplacedValueOrUndefined(topLevelHolder, '', true);
    }
    return internalStringify(topLevelHolder, '', true);
};