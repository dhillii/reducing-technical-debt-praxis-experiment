var JSON5 = (typeof exports === 'object' ? exports : {});

JSON5.parse = (function () {
    "use strict";

    var at,
        ch,
        escapee = {
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

    var throwError = function (message) {
        var error = new SyntaxError();
        error.message = message;
        error.at = at;
        error.text = text;
        throw error;
    };

    var advance = function (expectedChar) {
        if (expectedChar && expectedChar !== ch) {
            throwError("Expected '" + expectedChar + "' instead of '" + ch + "'");
        }
        ch = text.charAt(at);
        at += 1;
        return ch;
    };

    var lookAhead = function () {
        return text.charAt(at);
    };

    var parseIdentifier = function () {
        var key = ch;

        if ((ch !== '_' && ch !== '$') &&
            (ch < 'a' || ch > 'z') &&
            (ch < 'A' || ch > 'Z')) {
            throwError("Bad identifier");
        }

        while (advance() && (
            ch === '_' || ch === '$' ||
            (ch >= 'a' && ch <= 'z') ||
            (ch >= 'A' && ch <= 'Z') ||
            (ch >= '0' && ch <= '9'))) {
            key += ch;
        }

        return key;
    };

    var parseNumber = function () {
        var number,
            sign = '',
            string = '',
            base = 10;

        if (ch === '-' || ch === '+') {
            sign = ch;
            advance(ch);
        }

        if (ch === 'I') {
            number = parseWord();
            if (typeof number !== 'number' || isNaN(number)) {
                throwError('Unexpected word for number');
            }
            return (sign === '-') ? -number : number;
        }

        if (ch === 'N') {
            number = parseWord();
            if (!isNaN(number)) {
                throwError('expected word to be NaN');
            }
            return number;
        }

        if (ch === '0') {
            string += ch;
            advance();
            if (ch === 'x' || ch === 'X') {
                string += ch;
                advance();
                base = 16;
            } else if (ch >= '0' && ch <= '9') {
                throwError('Octal literal');
            }
        }

        switch (base) {
            case 10:
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
                break;
            case 16:
                while (ch >= '0' && ch <= '9' || ch >= 'A' && ch <= 'F' || ch >= 'a' && ch <= 'f') {
                    string += ch;
                    advance();
                }
                break;
        }

        number = sign === '-' ? -string : +string;

        if (!isFinite(number)) {
            throwError("Bad number");
        }

        return number;
    };

    var parseString = function () {
        var hex,
            i,
            string = '',
            delim,
            uffff;

        if (ch === '"' || ch === "'") {
            delim = ch;
            while (advance()) {
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
                        if (lookAhead() === '\n') {
                            advance();
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
        throwError("Bad string");
    };

    var skipInlineComment = function () {
        if (ch !== '/') {
            throwError("Not an inline comment");
        }

        do {
            advance();
            if (ch === '\n' || ch === '\r') {
                advance();
                return;
            }
        } while (ch);
    };

    var skipBlockComment = function () {
        if (ch !== '*') {
            throwError("Not a block comment");
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

        throwError("Unterminated block comment");
    };

    var skipComment = function () {
        if (ch !== '/') {
            throwError("Not a comment");
        }

        advance('/');

        if (ch === '/') {
            skipInlineComment();
        } else if (ch === '*') {
            skipBlockComment();
        } else {
            throwError("Unrecognized comment");
        }
    };

    var skipWhitespace = function () {
        while (ch) {
            if (ch === '/') {
                skipComment();
            } else if (ws.indexOf(ch) >= 0) {
                advance();
            } else {
                return;
            }
        }
    };

    var parseWord = function () {
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
                advance('I');
                advance('n');
                advance('f');
                advance('i');
                advance('n');
                advance('i');
                advance('t');
                advance('y');
                return Infinity;
            case 'N':
                advance('N');
                advance('a');
                advance('N');
                return NaN;
        }
        throwError("Unexpected '" + ch + "'");
    };

    var parseArray = function () {
        var array = [];

        if (ch === '[') {
            advance('[');
            skipWhitespace();
            while (ch) {
                if (ch === ']') {
                    advance(']');
                    return array;
                }
                if (ch === ',') {
                    throwError("Missing array element");
                } else {
                    array.push(parseValue());
                }
                skipWhitespace();
                if (ch !== ',') {
                    advance(']');
                    return array;
                }
                advance(',');
                skipWhitespace();
            }
        }
        throwError("Bad array");
    };

    var parseObject = function () {
        var key,
            object = {};

        if (ch === '{') {
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
        }
        throwError("Bad object");
    };

    var parseValue = function () {
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
                return ch >= '0' && ch <= '9' ? parseNumber() : parseWord();
        }
    };

    return function (source, reviver) {
        var result;

        text = String(source);
        at = 0;
        ch = ' ';
        result = parseValue();
        skipWhitespace();
        if (ch) {
            throwError("Syntax error");
        }

        return typeof reviver === 'function' ? (function walk(holder, key) {
            var k, v, value = holder[key];
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
        }({'': result}, '')) : result;
    };
}());

JSON5.stringify = function (obj, replacer, space) {
    if (replacer && (typeof(replacer) !== "function" && !isArray(replacer))) {
        throw new Error('Replacer must be a function or an array');
    }

    var getReplacedValueOrUndefined = function(holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArray(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var isWordChar = function(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            (char >= '0' && char <= '9') ||
            char === '_' || char === '$';
    };

    var isWordStart = function(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            char === '_' || char === '$';
    };

    var isWord = function(key) {
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
    };

    JSON5.isWord = isWord;

    var isArray = function(obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDate = function(obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    isNaN = isNaN || function(val) {
        return typeof val === 'number' && val !== val;
    };

    var objStack = [];
    var checkForCircular = function(obj) {
        for (var i = 0; i < objStack.length; i++) {
            if (objStack[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent = function(str, num, noNewLine) {
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
    };

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

    var escapeString = function(string) {
        escapable.lastIndex = 0;
        return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
            var c = meta[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var internalStringify = function(holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined(holder, key, isTopLevel);

        if (obj_part && !isDate(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
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
                    checkForCircular(obj_part);
                    buffer = "[";
                    objStack.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify(obj_part, i, false);
                        buffer += makeIndent(indentStr, objStack.length);
                        if (res === null || typeof res === "undefined") {
                            buffer += "null";
                        } else {
                            buffer += res;
                        }
                        if (i < obj_part.length-1) {
                            buffer += ",";
                        } else if (indentStr) {
                            buffer += "\n";
                        }
                    }
                    objStack.pop();
                    buffer += makeIndent(indentStr, objStack.length, true) + "]";
                } else {
                    checkForCircular(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify(obj_part, prop, false);
                            isTopLevel = false;
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
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent(indentStr, objStack.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var topLevelHolder = {"":obj};
    if (obj === undefined) {
        return getReplacedValueOrUndefined(topLevelHolder, '', true);
    }
    return internalStringify(topLevelHolder, '', true);
};