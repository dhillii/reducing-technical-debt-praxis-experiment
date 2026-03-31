```javascript
var JSON5 = (typeof exports === 'object' ? exports : {});

JSON5.parse = (function () {
    "use strict";

    var at, ch, text;

    var escapee = {
        "'": "'", '"': '"', '\\': '\\', '/': '/',
        '\n': '', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t'
    };

    var ws = [' ', '\t', '\r', '\n', '\v', '\f', '\xA0', '\uFEFF'];

    var error = function (m) {
        var err = new SyntaxError(m);
        err.at = at;
        err.text = text;
        throw err;
    };

    var next = function (c) {
        if (c && c !== ch) {
            error("Expected '" + c + "' instead of '" + ch + "'");
        }
        ch = text.charAt(at);
        at += 1;
        return ch;
    };

    var peek = function () {
        return text.charAt(at);
    };

    var isIdentifierStart = function (c) {
        return (c === '_' || c === '$') ||
            (c >= 'a' && c <= 'z') ||
            (c >= 'A' && c <= 'Z');
    };

    var isIdentifierPart = function (c) {
        return isIdentifierStart(c) || (c >= '0' && c <= '9');
    };

    var identifier = function () {
        var key = ch;
        if (!isIdentifierStart(ch)) {
            error("Bad identifier");
        }
        while (next() && isIdentifierPart(ch)) {
            key += ch;
        }
        return key;
    };

    var isDigit = function (c) {
        return c >= '0' && c <= '9';
    };

    var isHexDigit = function (c) {
        return isDigit(c) || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f');
    };

    var parseDecimalNumber = function (string) {
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
        return string;
    };

    var parseHexNumber = function (string) {
        while (isHexDigit(ch)) {
            string += ch;
            next();
        }
        return string;
    };

    var number = function () {
        var sign = '', string = '', base = 10;

        if (ch === '-' || ch === '+') {
            sign = ch;
            next(ch);
        }

        if (ch === 'I') {
            var num = word();
            if (typeof num !== 'number' || isNaN(num)) {
                error('Unexpected word for number');
            }
            return sign === '-' ? -num : num;
        }

        if (ch === 'N') {
            num = word();
            if (!isNaN(num)) {
                error('expected word to be NaN');
            }
            return num;
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

        string = base === 10 ? parseDecimalNumber(string) : parseHexNumber(string);

        var result = sign === '-' ? -string : +string;
        if (!isFinite(result)) {
            error("Bad number");
        }
        return result;
    };

    var parseUnicodeEscape = function () {
        var uffff = 0;
        for (var i = 0; i < 4; i += 1) {
            var hex = parseInt(next(), 16);
            if (!isFinite(hex)) {
                break;
            }
            uffff = uffff * 16 + hex;
        }
        return String.fromCharCode(uffff);
    };

    var string = function () {
        var str = '', delim;

        if (ch === '"' || ch === "'") {
            delim = ch;
            while (next()) {
                if (ch === delim) {
                    next();
                    return str;
                } else if (ch === '\\') {
                    next();
                    if (ch === 'u') {
                        str += parseUnicodeEscape();
                    } else if (ch === '\r') {
                        if (peek() === '\n') {
                            next();
                        }
                    } else if (typeof escapee[ch] === 'string') {
                        str += escapee[ch];
                    } else {
                        break;
                    }
                } else if (ch === '\n') {
                    break;
                } else {
                    str += ch;
                }
            }
        }
        error("Bad string");
    };

    var inlineComment = function () {
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

    var blockComment = function () {
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

    var comment = function () {
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
    };

    var white = function () {
        while (ch) {
            if (ch === '/') {
                comment();
            } else if (ws.indexOf(ch) >= 0) {
                next();
            } else {
                return;
            }
        }
    };

    var word = function () {
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
        }
        error("Unexpected '" + ch + "'");
    };

    var value;

    var array = function () {
        var arr = [];
        if (ch === '[') {
            next('[');
            white();
            while (ch) {
                if (ch === ']') {
                    next(']');
                    return arr;
                }
                if (ch === ',') {
                    error("Missing array element");
                } else {
                    arr.push(value());
                }
                white();
                if (ch !== ',') {
                    next(']');
                    return arr;
                }
                next(',');
                white();
            }
        }
        error("Bad array");
    };

    var object = function () {
        var obj = {};
        if (ch === '{') {
            next('{');
            white();
            while (ch) {
                if (ch === '}') {
                    next('}');
                    return obj;
                }
                var key = (ch === '"' || ch === "'") ? string() : identifier();
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
        }
        error("Bad object");
    };

    value = function () {
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

    return function (source, reviver) {
        text = String(source);
        at = 0;
        ch = ' ';
        var result = value();
        white();
        if (ch) {
            error("Syntax error");
        }

        if (typeof reviver === 'function') {
            var walk = function (holder, key) {
                var val = holder[key];
                if (val && typeof val === 'object') {
                    for (var k in val) {
                        if (Object.prototype.hasOwnProperty.call(val, k)) {
                            var v = walk(val, k);
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
            return walk({'': result}, '');
        }
        return result;
    };
}());

JSON5.stringify = (function () {
    var objStack = [];

    var isArray = function (obj) {
        return Array.isArray ? Array.isArray(obj) : Object.prototype.toString.call(obj) === '[object Array]';
    };

    var isDate = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isCharInRange = function (char, start, end) {
        return char >= start && char <= end;
    };

    var isWordChar = function (char) {
        return isCharInRange(char, 'a', 'z') || isCharInRange(char, 'A', 'Z') ||
            isCharInRange(char, '0', '9') || char === '_' || char === '$';
    };

    var isWordStart = function (char) {
        return isCharInRange(char, 'a', 'z') || isCharInRange(char, 'A', 'Z') ||
            char === '_' || char === '$';
    };

    var isWord = function (key) {
        if (typeof key !== 'string' || !isWordStart(key[0])) {
            return false;
        }
        for (var i = 1; i < key.length; i++) {
            if (!isWordChar(key[i])) {
                return false;
            }
        }
        return true;
    };

    JSON5.isWord = isWord;

    var checkForCircular = function (obj) {
        for (var i = 0; i < objStack.length; i++) {
            if (objStack[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent = function (str, num, noNewLine) {
        if (!str) return "";
        var s = str.length > 10 ? str.substring(0, 10) : str;
        var indent = noNewLine ? "" : "\n";
        for (var i = 0; i < num; i++) {
            indent += s;
        }
        return indent;
    };

    var meta = {
        '\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f',
        '\r': '\\r', '"': '\\"', '\\': '\\\\'
    };

    var escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;

    var escapeString = function (str) {
        escapable.lastIndex = 0;
        return escapable.test(str) ? '"' + str.replace(escapable, function (a) {
            var c = meta[a];
            return typeof c === 'string' ? c : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + str + '"';
    };

    var stringifyValue = function (val, indentStr) {
        switch (typeof val) {
            case "boolean":
            case "number":
                return isNaN(val) || !isFinite(val) ? "null" : val.toString();
            case "string":
                return escapeString(val);
            default:
                return undefined;
        }
    };

    var stringifyArray = function (arr, indentStr) {
        var buffer = "[";
        objStack.push(arr);

        for (var i = 0; i < arr.length; i++) {
            var res = stringifyItem(arr, i, indentStr);
            buffer += makeIndent(indentStr, objStack.length);
            buffer += res === null || typeof res === "undefined" ? "null" : res;
            if (i < arr.length - 1) {
                buffer += ",";
            } else if (indentStr) {
                buffer += "\n";
            }
        }

        objStack.pop();
        buffer += makeIndent(indentStr, objStack.length, true) + "]";
        return buffer;
    };

    var stringifyObject = function (obj, indentStr) {
        var buffer = "{";
        var nonEmpty = false;
        objStack.push(obj);

        for (var prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                var value = stringifyItem(obj, prop, indentStr);
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
    };

    var stringifyItem = function (holder, key, indentStr) {
        var obj = holder[key];

        if (obj && obj.toJSON && typeof obj.toJSON === "function") {
            obj = obj.toJSON();
        }

        if (obj && !isDate(obj)) {
            obj = obj.valueOf();
        }

        if (obj === null) {
            return "null";
        }

        var primitiveResult = stringifyValue(obj, indentStr);
        if (primitiveResult !== undefined) {
            return primitiveResult;
        }

        if (isArray(obj)) {
            checkForCircular(obj);
            return stringifyArray(obj, indent