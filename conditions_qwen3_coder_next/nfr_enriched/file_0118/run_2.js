var JSON5 = (typeof exports === 'object' ? exports : {});

JSON5.parse = (function () {
    "use strict";

    var at,
        ch,
        escapee,
        ws,
        text;

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
    };

    ws = [
        ' ',
        '\t',
        '\r',
        '\n',
        '\v',
        '\f',
        '\xA0',
        '\uFEFF'
    ];

    function error(message) {
        var err = new SyntaxError();
        err.message = message;
        err.at = at;
        err.text = text;
        throw err;
    }

    function next(expectedChar) {
        if (expectedChar && expectedChar !== ch) {
            error("Expected '" + expectedChar + "' instead of '" + ch + "'");
        }
        ch = text.charAt(at);
        at += 1;
        return ch;
    }

    function peek() {
        return text.charAt(at);
    }

    function readIdentifier() {
        var key = ch;

        if ((ch !== '_' && ch !== '$') &&
            (ch < 'a' || ch > 'z') &&
            (ch < 'A' || ch > 'Z')) {
            error("Bad identifier");
        }

        while (next()) {
            if (ch === '_' || ch === '$' ||
                (ch >= 'a' && ch <= 'z') ||
                (ch >= 'A' && ch <= 'Z') ||
                (ch >= '0' && ch <= '9')) {
                key += ch;
            } else {
                break;
            }
        }

        return key;
    }

    function readNumber() {
        var sign = '',
            numString = '',
            base = 10;

        if (ch === '-' || ch === '+') {
            sign = ch;
            next();
        }

        if (ch === 'I') {
            const number = readWord('Infinity');
            if (typeof number !== 'number' || isNaN(number)) {
                error('Unexpected word for number');
            }
            return sign === '-' ? -number : number;
        }

        if (ch === 'N') {
            const number = readWord('NaN');
            if (!isNaN(number)) {
                error('expected word to be NaN');
            }
            return number;
        }

        if (ch === '0') {
            numString += ch;
            next();
            if (ch === 'x' || ch === 'X') {
                numString += ch;
                next();
                base = 16;
            } else if (ch >= '0' && ch <= '9') {
                error('Octal literal');
            }
        }

        switch (base) {
        case 10:
            while (ch >= '0' && ch <= '9') {
                numString += ch;
                next();
            }
            if (ch === '.') {
                numString += '.';
                while (next() && ch >= '0' && ch <= '9') {
                    numString += ch;
                }
            }
            if (ch === 'e' || ch === 'E') {
                numString += ch;
                next();
                if (ch === '-' || ch === '+') {
                    numString += ch;
                    next();
                }
                while (ch >= '0' && ch <= '9') {
                    numString += ch;
                    next();
                }
            }
            break;
        case 16:
            while ((ch >= '0' && ch <= '9') ||
                   (ch >= 'A' && ch <= 'F') ||
                   (ch >= 'a' && ch <= 'f')) {
                numString += ch;
                next();
            }
            break;
        }

        const number = sign === '-' ? -numString : +numString;

        if (!isFinite(number)) {
            error("Bad number");
        }

        return number;
    }

    function readWord(target) {
        for (var i = 0; i < target.length; i++) {
            next(target.charAt(i));
        }
        if (target === 'true') return true;
        if (target === 'false') return false;
        if (target === 'null') return null;
        if (target === 'Infinity') return Infinity;
        if (target === 'NaN') return NaN;
        error("Unexpected '" + ch + "'");
    }

    function readString() {
        var hex,
            i,
            resultString = '',
            delimiter,
            uffff;

        if (ch !== '"' && ch !== "'") {
            error("Bad string");
        }

        delimiter = ch;

        while (next()) {
            if (ch === delimiter) {
                next();
                return resultString;
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
                    resultString += String.fromCharCode(uffff);
                } else if (ch === '\r') {
                    if (peek() === '\n') {
                        next();
                    }
                } else if (typeof escapee[ch] === 'string') {
                    resultString += escapee[ch];
                } else {
                    break;
                }
            } else if (ch === '\n') {
                break;
            } else {
                resultString += ch;
            }
        }

        error("Bad string");
    }

    function skipInlineComment() {
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
    }

    function skipBlockComment() {
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

    function skipComment() {
        if (ch !== '/') {
            error("Not a comment");
        }

        next('/');

        if (ch === '/') {
            skipInlineComment();
        } else if (ch === '*') {
            skipBlockComment();
        } else {
            error("Unrecognized comment");
        }
    }

    function skipWhitespace() {
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

    function parseArray() {
        var resultArray = [];

        if (ch !== '[') {
            error("Bad array");
        }
        next('[');
        skipWhitespace();

        while (ch) {
            if (ch === ']') {
                next(']');
                return resultArray;
            }

            if (ch === ',') {
                error("Missing array element");
            } else {
                resultArray.push(parseValue());
            }
            skipWhitespace();

            if (ch !== ',') {
                next(']');
                return resultArray;
            }

            next(',');
            skipWhitespace();
        }

        error("Bad array");
    }

    function parseObject() {
        var key,
            resultObject = {};

        if (ch !== '{') {
            error("Bad object");
        }
        next('{');
        skipWhitespace();

        while (ch) {
            if (ch === '}') {
                next('}');
                return resultObject;
            }

            if (ch === '"' || ch === "'") {
                key = readString();
            } else {
                key = readIdentifier();
            }

            skipWhitespace();
            next(':');
            resultObject[key] = parseValue();
            skipWhitespace();

            if (ch !== ',') {
                next('}');
                return resultObject;
            }

            next(',');
            skipWhitespace();
        }

        error("Bad object");
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
            return readString();
        case '-':
        case '+':
        case '.':
            return readNumber();
        default:
            if (ch >= '0' && ch <= '9') {
                return readNumber();
            }
            return readWord('');
        }
    }

    return function parse(source, reviver) {
        text = String(source);
        at = 0;
        ch = ' ';
        const result = parseValue();
        skipWhitespace();

        if (ch) {
            error("Syntax error");
        }

        if (typeof reviver !== 'function') {
            return result;
        }

        function walk(holder, key) {
            var value = holder[key];
            if (value && typeof value === 'object') {
                for (var k in value) {
                    if (Object.prototype.hasOwnProperty.call(value, k)) {
                        var newValue = walk(value, k);
                        if (newValue !== undefined) {
                            value[k] = newValue;
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
    if (replacer && (typeof replacer !== "function" && !isArray(replacer))) {
        throw new Error('Replacer must be a function or an array');
    }

    function getReplacedValueOrUndefined(holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof replacer === "function") {
            return replacer.call(holder, key, value);
        } else if (replacer) {
            return isTopLevel || isArray(holder) || replacer.indexOf(key) >= 0 ? value : undefined;
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
        var i = 1,
            length = key.length;
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

    function isNaNValue(val) {
        return typeof val === 'number' && val !== val;
    }

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
        return escapable.test(string) ?
            '"' + string.replace(escapable, function (a) {
                var c = meta[a];
                return typeof c === 'string' ?
                    c :
                    '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
            }) + '"' :
            '"' + string + '"';
    }

    function internalStringify(holder, key, isTopLevel) {
        var resultValue = getReplacedValueOrUndefined(holder, key, isTopLevel);

        if (resultValue && !isDate(resultValue)) {
            resultValue = resultValue.valueOf();
        }

        switch (typeof resultValue) {
        case "boolean":
            return resultValue.toString();

        case "number":
            if (isNaNValue(resultValue) || !isFinite(resultValue)) {
                return "null";
            }
            return resultValue.toString();

        case "string":
            return escapeString(resultValue.toString());

        case "object":
            if (resultValue === null) {
                return "null";
            } else if (isArray(resultValue)) {
                checkForCircular(resultValue);
                var buffer = "[";
                objStack.push(resultValue);

                for (var i = 0; i < resultValue.length; i++) {
                    var res = internalStringify(resultValue, i, false);
                    buffer += makeIndent(indentStr, objStack.length);
                    if (res === null || typeof res === "undefined") {
                        buffer += "null";
                    } else {
                        buffer += res;
                    }
                    if (i < resultValue.length - 1) {
                        buffer += ",";
                    } else if (indentStr) {
                        buffer += "\n";
                    }
                }
                objStack.pop();
                buffer += makeIndent(indentStr, objStack.length, true) + "]";
                return buffer;
            } else {
                checkForCircular(resultValue);
                var buffer = "{";
                var nonEmpty = false;
                objStack.push(resultValue);
                for (var prop in resultValue) {
                    if (Object.prototype.hasOwnProperty.call(resultValue, prop)) {
                        var value = internalStringify(resultValue, prop, false);
                        if (typeof value !== "undefined" && value !== null) {
                            buffer += makeIndent(indentStr, objStack.length);
                            nonEmpty = true;
                            var keyName = isWord(prop) ? prop : escapeString(prop);
                            buffer += keyName + ":" + (indentStr ? ' ' : '') + value + ",";
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
        default:
            return undefined;
        }
    }

    var topLevelHolder = {"": obj};
    if (obj === undefined) {
        return getReplacedValueOrUndefined(topLevelHolder, '', true);
    }
    return internalStringify(topLevelHolder, '', true);
};