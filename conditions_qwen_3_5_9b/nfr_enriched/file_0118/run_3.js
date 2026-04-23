var JSON5 = (typeof exports === 'object' ? exports : {});

JSON5.parse = (function () {
    "use strict";

    var at, ch, text;

    var escapee = {
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

    var ws = [
        ' ', '\t', '\r', '\n', '\v', '\f', '\xA0', '\uFEFF'
    ];

    var error = function (message) {
        var err = new SyntaxError();
        err.message = message;
        err.at = at;
        err.text = text;
        throw err;
    };

    var next = function (expectedChar) {
        if (expectedChar && expectedChar !== ch) {
            error("Expected '" + expectedChar + "' instead of '" + ch + "'");
        }
        ch = text.charAt(at);
        at += 1;
        return ch;
    };

    var peek = function () {
        return text.charAt(at);
    };

    var isIdentifierStart = function (char) {
        return (char === '_' || char === '$') ||
            (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z');
    };

    var isIdentifierPart = function (char) {
        return isIdentifierStart(char) ||
            (char >= '0' && char <= '9');
    };

    var parseIdentifier = function () {
        var key = ch;
        if (!isIdentifierStart(ch)) {
            error("Bad identifier");
        }
        while (next() && isIdentifierPart(ch)) {
            key += ch;
        }
        return key;
    };

    var parseNumber = function () {
        var number, sign, string, base, i, hex, uffff;

        sign = '';
        string = '';
        base = 10;

        if (ch === '-' || ch === '+') {
            sign = ch;
            next(ch);
        }

        if (ch === 'I') {
            number = parseWord();
            if (typeof number !== 'number' || isNaN(number)) {
                error('Unexpected word for number');
            }
            return (sign === '-') ? -number : number;
        }

        if (ch === 'N') {
            number = parseWord();
            if (!isNaN(number)) {
                error('expected word to be NaN');
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
                error('Octal literal');
            }
        }

        switch (base) {
            case 10:
                while (ch >= '0' && ch <= '9') {
                    string += ch;
                    next();
                }
                if (ch === '.') {
                    string += '.';
                    while (next() && ch >= '0' && ch <= '9') {
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
                    while (ch >= '0' && ch <= '9') {
                        string += ch;
                        next();
                    }
                }
                break;
            case 16:
                while (isHexDigit(ch)) {
                    string += ch;
                    next();
                }
                break;
        }

        number = +string;
        if (sign === '-') {
            number = -number;
        }

        if (!isFinite(number)) {
            error("Bad number");
        }
        return number;
    };

    var isHexDigit = function (char) {
        return (char >= '0' && char <= '9') ||
            (char >= 'A' && char <= 'F') ||
            (char >= 'a' && char <= 'f');
    };

    var parseString = function () {
        var hex, i, string, delim, uffff;

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
                } else if (escapee.hasOwnProperty(ch)) {
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
    };

    var parseInlineComment = function () {
        if (ch !== '/') {
            error("Not an inline comment");
        }
        do {
            next();
            if (ch === '\n' || ch === '\r') {
                next();
                return;
            }
        } while (ch);
    };

    var parseBlockComment = function () {
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
    };

    var parseComment = function () {
        if (ch !== '/') {
            error("Not a comment");
        }
        next('/');
        if (ch === '/') {
            parseInlineComment();
        } else if (ch === '*') {
            parseBlockComment();
        } else {
            error("Unrecognized comment");
        }
    };

    var parseWhitespace = function () {
        while (ch) {
            if (ch === '/') {
                parseComment();
            } else if (ws.indexOf(ch) >= 0) {
                next();
            } else {
                return;
            }
        }
    };

    var parseWord = function () {
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
            default:
                error("Unexpected '" + ch + "'");
        }
    };

    var parseArray = function () {
        var array = [];

        if (ch !== '[') {
            error("Bad array");
        }
        next('[');
        parseWhitespace();

        while (ch) {
            if (ch === ']') {
                next(']');
                return array;
            }
            if (ch === ',') {
                error("Missing array element");
            } else {
                array.push(parseValue());
            }
            parseWhitespace();
            if (ch !== ',') {
                next(']');
                return array;
            }
            next(',');
            parseWhitespace();
        }
        error("Bad array");
    };

    var parseObject = function () {
        var key, object = {};

        if (ch !== '{') {
            error("Bad object");
        }
        next('{');
        parseWhitespace();

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

            parseWhitespace();
            next(':');
            object[key] = parseValue();
            parseWhitespace();

            if (ch !== ',') {
                next('}');
                return object;
            }
            next(',');
            parseWhitespace();
        }
        error("Bad object");
    };

    var parseValue = function () {
        parseWhitespace();
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
    };

    return function (source, reviver) {
        var result;

        text = String(source);
        at = 0;
        ch = ' ';
        result = parseValue();
        parseWhitespace();
        if (ch) {
            error("Syntax error");
        }

        if (typeof reviver === 'function') {
            return (function walk(holder, key) {
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
            }({'': result}, ''));
        }
        return result;
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

    var isNaN = isNaN || function(val) {
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
        var buffer, res, obj_part, i, prop, value, nonEmpty;

        obj_part = getReplacedValueOrUndefined(holder, key, isTopLevel);

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
                    for (i = 0; i < obj_part.length; i++) {
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
                    nonEmpty = false;
                    objStack.push(obj_part);
                    for (prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            value = internalStringify(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent(indentStr, objStack.length);
                                nonEmpty = true;
                                var keyStr = isWord(prop) ? prop : escapeString(prop);
                                buffer += keyStr + ":" + (indentStr ? ' ' : '') + value + ",";
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