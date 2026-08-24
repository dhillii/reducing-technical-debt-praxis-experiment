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

    function reportError(message) {
        var error = new SyntaxError();
        error.message = message;
        error.at = at;
        error.text = text;
        throw error;
    }

    function advance(expected) {
        if (expected && expected !== ch) {
            reportError("Expected '" + expected + "' instead of '" + ch + "'");
        }
        ch = text.charAt(at);
        at += 1;
        return ch;
    }

    function peekChar() {
        return text.charAt(at);
    }

    function parseIdentifier() {
        var key = ch;

        if ((ch !== '_' && ch !== '$') &&
                (ch < 'a' || ch > 'z') &&
                (ch < 'A' || ch > 'Z')) {
            reportError("Bad identifier");
        }

        while (advance() && (
                ch === '_' || ch === '$' ||
                (ch >= 'a' && ch <= 'z') ||
                (ch >= 'A' && ch <= 'Z') ||
                (ch >= '0' && ch <= '9'))) {
            key += ch;
        }

        return key;
    }

    function parseNumber() {
        var sign = '',
            string = '',
            base = 10;

        if (ch === '-' || ch === '+') {
            sign = ch;
            advance();
        }

        if (ch === 'I') {
            return parseInfinity(sign);
        }

        if (ch === 'N') {
            return parseNaN();
        }

        if (ch === '0') {
            string += ch;
            advance();
            if (ch === 'x' || ch === 'X') {
                string += ch;
                advance();
                base = 16;
            } else if (ch >= '0' && ch <= '9') {
                reportError('Octal literal');
            }
        }

        switch (base) {
        case 10:
            return parseDecimalNumber(string);
        case 16:
            return parseHexNumber(string);
        }
    }

    function parseInfinity(sign) {
        advance('I');
        advance('n');
        advance('f');
        advance('i');
        advance('n');
        advance('i');
        advance('t');
        advance('y');
        var result = Infinity;
        return (sign === '-') ? -result : result;
    }

    function parseNaN() {
        advance('N');
        advance('a');
        advance('N');
        return NaN;
    }

    function parseDecimalNumber(string) {
        while (ch >= '0' && ch <= '9') {
            string += ch;
            advance();
        }
        if (ch === '.') {
            string += '.';
            while (advance() && ch >= '0' && ch <= '9') {
                string += ch;
            }
        }
        if (ch === 'e' || ch === 'E') {
            string += ch;
            advance();
            if (ch === '-' || ch === '+') {
                string += ch;
                advance();
            }
            while (ch >= '0' && ch <= '9') {
                string += ch;
                advance();
            }
        }
        return finalizeNumber(string);
    }

    function parseHexNumber(string) {
        while ((ch >= '0' && ch <= '9') ||
               (ch >= 'A' && ch <= 'F') ||
               (ch >= 'a' && ch <= 'f')) {
            string += ch;
            advance();
        }
        return finalizeNumber(string);
    }

    function finalizeNumber(string) {
        var number = (string.charAt(0) === '-') ? -string : +string;
        if (!isFinite(number)) {
            reportError("Bad number");
        }
        return number;
    }

    function parseString() {
        var string = '',
            delim,
            uffff,
            i,
            hex;

        if (ch !== '"' && ch !== "'") {
            reportError("Bad string");
        }
        delim = ch;
        advance();

        while (ch) {
            if (ch === delim) {
                advance();
                return string;
            } else if (ch === '\\') {
                advance();
                if (ch === 'u') {
                    uffff = 0;
                    for (i = 0; i < 4; i += 1) {
                        hex = parseInt(advance(), 16);
                        if (!isFinite(hex)) {
                            break;
                        }
                        uffff = uffff * 16 + hex;
                    }
                    string += String.fromCharCode(uffff);
                } else if (ch === '\r') {
                    if (peekChar() === '\n') {
                        advance();
                    }
                } else if (typeof escapee[ch] === 'string') {
                    string += escapee[ch];
                } else {
                    break;
                }
            } else if (ch === '\n') {
                reportError("Bad string");
            } else {
                string += ch;
                advance();
            }
        }
        reportError("Bad string");
    }

    function skipInlineComment() {
        if (ch !== '/') {
            reportError("Not an inline comment");
        }
        do {
            advance();
            if (ch === '\n' || ch === '\r') {
                advance();
                return;
            }
        } while (ch);
    }

    function skipBlockComment() {
        if (ch !== '*') {
            reportError("Not a block comment");
        }
        do {
            advance();
            while (ch === '*') {
                advance('*');
                if (ch === '/') {
                    advance('/');
                    return;
                }
            }
        } while (ch);
        reportError("Unterminated block comment");
    }

    function skipComment() {
        if (ch !== '/') {
            reportError("Not a comment");
        }
        advance('/');
        if (ch === '/') {
            skipInlineComment();
        } else if (ch === '*') {
            skipBlockComment();
        } else {
            reportError("Unrecognized comment");
        }
    }

    function skipWhitespace() {
        while (ch) {
            if (ch === '/') {
                skipComment();
            } else if (ws.indexOf(ch) >= 0) {
                advance();
            } else {
                return;
            }
        }
    }

    function parseWord() {
        switch (ch) {
        case 't':
            advance('t');
            advance('r');
            advance('u');
            advance('e');
            return true;
        case 'f':
            advance('f');
            advance('a');
            advance('l');
            advance('s');
            advance('e');
            return false;
        case 'n':
            advance('n');
            advance('u');
            advance('l');
            advance('l');
            return null;
        case 'I':
            return parseInfinity('');
        case 'N':
            return parseNaN();
        }
        reportError("Unexpected '" + ch + "'");
    }

    function parseArray() {
        var array = [];

        if (ch !== '[') {
            reportError("Bad array");
        }
        advance('[');
        skipWhitespace();

        while (ch) {
            if (ch === ']') {
                advance(']');
                return array;
            }
            if (ch === ',') {
                reportError("Missing array element");
            }
            array.push(parseValue());
            skipWhitespace();
            if (ch !== ',') {
                advance(']');
                return array;
            }
            advance(',');
            skipWhitespace();
        }
        reportError("Bad array");
    }

    function parseObject() {
        var key,
            object = {};

        if (ch !== '{') {
            reportError("Bad object");
        }
        advance('{');
        skipWhitespace();

        while (ch) {
            if (ch === '}') {
                advance('}');
                return object;
            }
            if (ch === '"' || ch === "'") {
                key = parseString();
            } else {
                key = parseIdentifier();
            }
            skipWhitespace();
            advance(':');
            object[key] = parseValue();
            skipWhitespace();
            if (ch !== ',') {
                advance('}');
                return object;
            }
            advance(',');
            skipWhitespace();
        }
        reportError("Bad object");
    }

    function parseValue() {
        skipWhitespace();
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
        var result = parseValue();
        skipWhitespace();
        if (ch) {
            reportError("Syntax error");
        }

        if (typeof reviver !== 'function') {
            return result;
        }

        function walk(holder, key) {
            var value = holder[key];
            if (value && typeof value === 'object') {
                for (var k in value) {
                    if (Object.prototype.hasOwnProperty.call(value, k)) {
                        var v = walk(value, k);
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
    };
}());

JSON5.stringify = function (obj, replacer, space) {
    if (replacer && (typeof(replacer) !== "function" && !Array.isArray(replacer))) {
        throw new Error('Replacer must be a function or an array');
    }

    function getReplacedValueOrUndefined(holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if (replacer) {
            if (isTopLevel || Array.isArray(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
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
        var i = 1, length = key.length;
        while (i < length) {
            if (!isWordChar(key[i])) {
                return false;
            }
            i++;
        }
        return true;
    }

    JSON5.isWord = isWord;

    function isArray(obj) {
        return Array.isArray ? Array.isArray(obj) : Object.prototype.toString.call(obj) === '[object Array]';
    }

    function isDate(obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    }

    isNaN = isNaN || function(val) {
        return typeof val === 'number' && val !== val;
    };

    var objStack = [];
    function checkForCircular(obj) {
        for (var i = 0; i < objStack.length; i++) {
            if (objStack[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    }

    function makeIndent(str, num, noNewLine) {
        if (!str) {
            return "";
        }
        if (str.length > 10) {
            str = str.substring(0, 10);
        }

        var indent = noNewLine ? "" : "\n";
        for (var i = 0; i < num; i++) {
            indent += str;
        }

        return indent;
    }

    var indentStr;
    if (space) {
        if (typeof space === "string") {
            indentStr = space;
        } else if (typeof space === "number" && space >= 0) {
            indentStr = makeIndent(" ", space, true);
        }
    }

    var cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
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
            var c = meta[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    }

    function internalStringify(holder, key, isTopLevel) {
        var obj_part = getReplacedValueOrUndefined(holder, key, isTopLevel);

        if (obj_part && !isDate(obj_part)) {
            obj_part = obj_part.valueOf();
        }

        switch (typeof obj_part) {
        case "boolean":
            return obj_part.toString();

        case "number":
            if (isNaN(obj_part) || !isFinite(obj_part)) {
                return "null";
            }
            return obj_part.toString();

        case "string":
            return escapeString(obj_part.toString());

        case "object":
            if (obj_part === null) {
                return "null";
            } else if (isArray(obj_part)) {
                return buildArrayString(obj_part);
            } else {
                return buildObjectString(obj_part);
            }

        default:
            return undefined;
        }
    }

    function buildArrayString(array) {
        checkForCircular(array);
        var buffer = "[";
        objStack.push(array);

        for (var i = 0; i < array.length; i++) {
            var res = internalStringify(array, i, false);
            buffer += makeIndent(indentStr, objStack.length);
            if (res === null || typeof res === "undefined") {
                buffer += "null";
            } else {
                buffer += res;
            }
            if (i < array.length - 1) {
                buffer += ",";
            } else if (indentStr) {
                buffer += "\n";
            }
        }
        objStack.pop();
        buffer += makeIndent(indentStr, objStack.length, true) + "]";
        return buffer;
    }

    function buildObjectString(object) {
        checkForCircular(object);
        var buffer = "{";
        var nonEmpty = false;
        objStack.push(object);

        for (var prop in object) {
            if (Object.prototype.hasOwnProperty.call(object, prop)) {
                var value = internalStringify(object, prop, false);
                if (typeof value !== "undefined" && value !== null) {
                    buffer += makeIndent(indentStr, objStack.length);
                    nonEmpty = true;
                    var key = isWord(prop) ? prop : escapeString(prop);
                    buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
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
    }

    var topLevelHolder = {"": obj};
    if (obj === undefined) {
        return getReplacedValueOrUndefined(topLevelHolder, '', true);
    }
    return internalStringify(topLevelHolder, '', true);
};