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

    var error = function (m) {
        var error = new SyntaxError();
        error.message = m;
        error.at = at;
        error.text = text;
        throw error;
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

    var isIdentifierStart = function () {
        return ch === '_' || ch === '$' || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
    };

    var isIdentifierPart = function () {
        return ch === '_' || ch === '$' || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9');
    };

    var identifier = function () {
        var key = ch;

        if (!isIdentifierStart()) {
            error("Bad identifier");
        }

        while (next() && isIdentifierPart()) {
            key += ch;
        }

        return key;
    };

    var isDigit = function () {
        return ch >= '0' && ch <= '9';
    };

    var isHexDigit = function () {
        return isDigit() || (ch >= 'A' && ch <= 'F') || (ch >= 'a' && ch <= 'f');
    };

    var number = function () {
        var number,
            sign = '',
            string = '',
            base = 10;

        if (ch === '-' || ch === '+') {
            sign = ch;
            next(ch);
        }

        if (ch === 'I') {
            number = word();
            if (typeof number !== 'number' || isNaN(number)) {
                error('Unexpected word for number');
            }
            return (sign === '-') ? -number : number;
        }

        if (ch === 'N') {
            number = word();
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
            } else if (isDigit()) {
                error('Octal literal');
            }
        }

        switch (base) {
            case 10:
                while (isDigit()) {
                    string += ch;
                    next();
                }
                if (ch === '.') {
                    string += '.';
                    while (next() && isDigit()) {
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
                    while (isDigit()) {
                        string += ch;
                        next();
                    }
                }
                break;
            case 16:
                while (isHexDigit()) {
                    string += ch;
                    next();
                }
                break;
        }

        if (sign === '-') {
            number = -string;
        } else {
            number = +string;
        }

        if (!isFinite(number)) {
            error("Bad number");
        } else {
            return number;
        }
    };

    var string = function () {
        var hex,
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
        error("Unexpected '" + ch + "'");
    };

    var isFiniteNumber = function (str) {
        return isFinite(str);
    };

    var isWordChar = function (char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            (char >= '0' && char <= '9') ||
            char === '_' || char === '$';
    };

    var isWordStart = function (char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            char === '_' || char === '$';
    };

    var isWord = function (key) {
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

    var isArray = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDate = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular = function (obj) {
        for (var i = 0; i < objStack.length; i++) {
            if (objStack[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent = function (str, num, noNewLine) {
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

    var escapeString = function (string) {
        escapable.lastIndex = 0;
        return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
            var c = meta[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined = function (holder, key, isTopLevel) {
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

    var internalStringify = function (holder, key, isTopLevel) {
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

    var objStack = [];

    var isArrayPolyfill = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill2 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular2 = function (obj) {
        for (var i = 0; i < objStack.length; i++) {
            if (objStack[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent2 = function (str, num, noNewLine) {
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

    var cx2 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable2 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta2 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString2 = function (string) {
        escapable2.lastIndex = 0;
        return escapable2.test(string) ? '"' + string.replace(escapable2, function (a) {
            var c = meta2[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined2 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify2 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined2(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill2(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString2(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill(obj_part)) {
                    checkForCircular2(obj_part);
                    buffer = "[";
                    objStack.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify2(obj_part, i, false);
                        buffer += makeIndent2(indentStr, objStack.length);
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
                    buffer += makeIndent2(indentStr, objStack.length, true) + "]";
                } else {
                    checkForCircular2(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify2(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent2(indentStr, objStack.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString2(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent2(indentStr, objStack.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack2 = [];

    var isArrayPolyfill3 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill3 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill3 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular3 = function (obj) {
        for (var i = 0; i < objStack2.length; i++) {
            if (objStack2[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent3 = function (str, num, noNewLine) {
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

    var cx3 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable3 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta3 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString3 = function (string) {
        escapable3.lastIndex = 0;
        return escapable3.test(string) ? '"' + string.replace(escapable3, function (a) {
            var c = meta3[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined3 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill3(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify3 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined3(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill3(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill3(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString3(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill3(obj_part)) {
                    checkForCircular3(obj_part);
                    buffer = "[";
                    objStack2.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify3(obj_part, i, false);
                        buffer += makeIndent3(indentStr, objStack2.length);
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
                    objStack2.pop();
                    buffer += makeIndent3(indentStr, objStack2.length, true) + "]";
                } else {
                    checkForCircular3(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack2.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify3(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent3(indentStr, objStack2.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString3(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack2.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent3(indentStr, objStack2.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack3 = [];

    var isArrayPolyfill4 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill4 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill4 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular4 = function (obj) {
        for (var i = 0; i < objStack3.length; i++) {
            if (objStack3[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent4 = function (str, num, noNewLine) {
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

    var cx4 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable4 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta4 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString4 = function (string) {
        escapable4.lastIndex = 0;
        return escapable4.test(string) ? '"' + string.replace(escapable4, function (a) {
            var c = meta4[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined4 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill4(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify4 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined4(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill4(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill4(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString4(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill4(obj_part)) {
                    checkForCircular4(obj_part);
                    buffer = "[";
                    objStack3.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify4(obj_part, i, false);
                        buffer += makeIndent4(indentStr, objStack3.length);
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
                    objStack3.pop();
                    buffer += makeIndent4(indentStr, objStack3.length, true) + "]";
                } else {
                    checkForCircular4(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack3.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify4(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent4(indentStr, objStack3.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString4(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack3.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent4(indentStr, objStack3.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack4 = [];

    var isArrayPolyfill5 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill5 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill5 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular5 = function (obj) {
        for (var i = 0; i < objStack4.length; i++) {
            if (objStack4[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent5 = function (str, num, noNewLine) {
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

    var cx5 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable5 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta5 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString5 = function (string) {
        escapable5.lastIndex = 0;
        return escapable5.test(string) ? '"' + string.replace(escapable5, function (a) {
            var c = meta5[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined5 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill5(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify5 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined5(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill5(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill5(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString5(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill5(obj_part)) {
                    checkForCircular5(obj_part);
                    buffer = "[";
                    objStack4.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify5(obj_part, i, false);
                        buffer += makeIndent5(indentStr, objStack4.length);
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
                    objStack4.pop();
                    buffer += makeIndent5(indentStr, objStack4.length, true) + "]";
                } else {
                    checkForCircular5(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack4.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify5(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent5(indentStr, objStack4.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString5(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack4.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent5(indentStr, objStack4.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack5 = [];

    var isArrayPolyfill6 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill6 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill6 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular6 = function (obj) {
        for (var i = 0; i < objStack5.length; i++) {
            if (objStack5[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent6 = function (str, num, noNewLine) {
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

    var cx6 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable6 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta6 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString6 = function (string) {
        escapable6.lastIndex = 0;
        return escapable6.test(string) ? '"' + string.replace(escapable6, function (a) {
            var c = meta6[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined6 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill6(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify6 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined6(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill6(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill6(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString6(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill6(obj_part)) {
                    checkForCircular6(obj_part);
                    buffer = "[";
                    objStack5.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify6(obj_part, i, false);
                        buffer += makeIndent6(indentStr, objStack5.length);
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
                    objStack5.pop();
                    buffer += makeIndent6(indentStr, objStack5.length, true) + "]";
                } else {
                    checkForCircular6(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack5.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify6(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent6(indentStr, objStack5.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString6(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack5.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent6(indentStr, objStack5.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack6 = [];

    var isArrayPolyfill7 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill7 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill7 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular7 = function (obj) {
        for (var i = 0; i < objStack6.length; i++) {
            if (objStack6[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent7 = function (str, num, noNewLine) {
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

    var cx7 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable7 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta7 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString7 = function (string) {
        escapable7.lastIndex = 0;
        return escapable7.test(string) ? '"' + string.replace(escapable7, function (a) {
            var c = meta7[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined7 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill7(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify7 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined7(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill7(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill7(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString7(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill7(obj_part)) {
                    checkForCircular7(obj_part);
                    buffer = "[";
                    objStack6.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify7(obj_part, i, false);
                        buffer += makeIndent7(indentStr, objStack6.length);
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
                    objStack6.pop();
                    buffer += makeIndent7(indentStr, objStack6.length, true) + "]";
                } else {
                    checkForCircular7(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack6.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify7(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent7(indentStr, objStack6.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString7(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack6.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent7(indentStr, objStack6.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack7 = [];

    var isArrayPolyfill8 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill8 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill8 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular8 = function (obj) {
        for (var i = 0; i < objStack7.length; i++) {
            if (objStack7[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent8 = function (str, num, noNewLine) {
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

    var cx8 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable8 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta8 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString8 = function (string) {
        escapable8.lastIndex = 0;
        return escapable8.test(string) ? '"' + string.replace(escapable8, function (a) {
            var c = meta8[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined8 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill8(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify8 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined8(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill8(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill8(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString8(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill8(obj_part)) {
                    checkForCircular8(obj_part);
                    buffer = "[";
                    objStack7.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify8(obj_part, i, false);
                        buffer += makeIndent8(indentStr, objStack7.length);
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
                    objStack7.pop();
                    buffer += makeIndent8(indentStr, objStack7.length, true) + "]";
                } else {
                    checkForCircular8(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack7.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify8(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent8(indentStr, objStack7.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString8(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack7.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent8(indentStr, objStack7.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack8 = [];

    var isArrayPolyfill9 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill9 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill9 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular9 = function (obj) {
        for (var i = 0; i < objStack8.length; i++) {
            if (objStack8[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent9 = function (str, num, noNewLine) {
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

    var cx9 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable9 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta9 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString9 = function (string) {
        escapable9.lastIndex = 0;
        return escapable9.test(string) ? '"' + string.replace(escapable9, function (a) {
            var c = meta9[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined9 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill9(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify9 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined9(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill9(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill9(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString9(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill9(obj_part)) {
                    checkForCircular9(obj_part);
                    buffer = "[";
                    objStack8.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify9(obj_part, i, false);
                        buffer += makeIndent9(indentStr, objStack8.length);
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
                    objStack8.pop();
                    buffer += makeIndent9(indentStr, objStack8.length, true) + "]";
                } else {
                    checkForCircular9(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack8.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify9(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent9(indentStr, objStack8.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString9(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack8.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent9(indentStr, objStack8.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack9 = [];

    var isArrayPolyfill10 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill10 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill10 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular10 = function (obj) {
        for (var i = 0; i < objStack9.length; i++) {
            if (objStack9[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent10 = function (str, num, noNewLine) {
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

    var cx10 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable10 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta10 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString10 = function (string) {
        escapable10.lastIndex = 0;
        return escapable10.test(string) ? '"' + string.replace(escapable10, function (a) {
            var c = meta10[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined10 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill10(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify10 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined10(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill10(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill10(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString10(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill10(obj_part)) {
                    checkForCircular10(obj_part);
                    buffer = "[";
                    objStack9.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify10(obj_part, i, false);
                        buffer += makeIndent10(indentStr, objStack9.length);
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
                    objStack9.pop();
                    buffer += makeIndent10(indentStr, objStack9.length, true) + "]";
                } else {
                    checkForCircular10(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack9.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify10(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent10(indentStr, objStack9.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString10(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack9.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent10(indentStr, objStack9.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack10 = [];

    var isArrayPolyfill11 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill11 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill11 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular11 = function (obj) {
        for (var i = 0; i < objStack10.length; i++) {
            if (objStack10[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent11 = function (str, num, noNewLine) {
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

    var cx11 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable11 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta11 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString11 = function (string) {
        escapable11.lastIndex = 0;
        return escapable11.test(string) ? '"' + string.replace(escapable11, function (a) {
            var c = meta11[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined11 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill11(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify11 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined11(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill11(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill11(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString11(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill11(obj_part)) {
                    checkForCircular11(obj_part);
                    buffer = "[";
                    objStack10.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify11(obj_part, i, false);
                        buffer += makeIndent11(indentStr, objStack10.length);
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
                    objStack10.pop();
                    buffer += makeIndent11(indentStr, objStack10.length, true) + "]";
                } else {
                    checkForCircular11(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack10.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify11(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent11(indentStr, objStack10.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString11(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack10.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent11(indentStr, objStack10.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack11 = [];

    var isArrayPolyfill12 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill12 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill12 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular12 = function (obj) {
        for (var i = 0; i < objStack11.length; i++) {
            if (objStack11[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent12 = function (str, num, noNewLine) {
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

    var cx12 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable12 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta12 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString12 = function (string) {
        escapable12.lastIndex = 0;
        return escapable12.test(string) ? '"' + string.replace(escapable12, function (a) {
            var c = meta12[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined12 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill12(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify12 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined12(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill12(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill12(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString12(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill12(obj_part)) {
                    checkForCircular12(obj_part);
                    buffer = "[";
                    objStack11.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify12(obj_part, i, false);
                        buffer += makeIndent12(indentStr, objStack11.length);
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
                    objStack11.pop();
                    buffer += makeIndent12(indentStr, objStack11.length, true) + "]";
                } else {
                    checkForCircular12(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack11.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify12(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent12(indentStr, objStack11.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString12(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack11.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent12(indentStr, objStack11.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack12 = [];

    var isArrayPolyfill13 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill13 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill13 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular13 = function (obj) {
        for (var i = 0; i < objStack12.length; i++) {
            if (objStack12[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent13 = function (str, num, noNewLine) {
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

    var cx13 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable13 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta13 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString13 = function (string) {
        escapable13.lastIndex = 0;
        return escapable13.test(string) ? '"' + string.replace(escapable13, function (a) {
            var c = meta13[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined13 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill13(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify13 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined13(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill13(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill13(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString13(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill13(obj_part)) {
                    checkForCircular13(obj_part);
                    buffer = "[";
                    objStack12.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify13(obj_part, i, false);
                        buffer += makeIndent13(indentStr, objStack12.length);
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
                    objStack12.pop();
                    buffer += makeIndent13(indentStr, objStack12.length, true) + "]";
                } else {
                    checkForCircular13(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack12.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify13(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent13(indentStr, objStack12.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString13(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack12.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent13(indentStr, objStack12.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack13 = [];

    var isArrayPolyfill14 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill14 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill14 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular14 = function (obj) {
        for (var i = 0; i < objStack13.length; i++) {
            if (objStack13[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent14 = function (str, num, noNewLine) {
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

    var cx14 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable14 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta14 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString14 = function (string) {
        escapable14.lastIndex = 0;
        return escapable14.test(string) ? '"' + string.replace(escapable14, function (a) {
            var c = meta14[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined14 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill14(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify14 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined14(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill14(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill14(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString14(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill14(obj_part)) {
                    checkForCircular14(obj_part);
                    buffer = "[";
                    objStack13.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify14(obj_part, i, false);
                        buffer += makeIndent14(indentStr, objStack13.length);
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
                    objStack13.pop();
                    buffer += makeIndent14(indentStr, objStack13.length, true) + "]";
                } else {
                    checkForCircular14(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack13.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify14(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent14(indentStr, objStack13.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString14(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack13.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent14(indentStr, objStack13.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack14 = [];

    var isArrayPolyfill15 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill15 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill15 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular15 = function (obj) {
        for (var i = 0; i < objStack14.length; i++) {
            if (objStack14[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent15 = function (str, num, noNewLine) {
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

    var cx15 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable15 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta15 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString15 = function (string) {
        escapable15.lastIndex = 0;
        return escapable15.test(string) ? '"' + string.replace(escapable15, function (a) {
            var c = meta15[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined15 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill15(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify15 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined15(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill15(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill15(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString15(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill15(obj_part)) {
                    checkForCircular15(obj_part);
                    buffer = "[";
                    objStack14.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify15(obj_part, i, false);
                        buffer += makeIndent15(indentStr, objStack14.length);
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
                    objStack14.pop();
                    buffer += makeIndent15(indentStr, objStack14.length, true) + "]";
                } else {
                    checkForCircular15(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack14.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify15(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent15(indentStr, objStack14.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString15(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack14.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent15(indentStr, objStack14.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack15 = [];

    var isArrayPolyfill16 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill16 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill16 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular16 = function (obj) {
        for (var i = 0; i < objStack15.length; i++) {
            if (objStack15[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent16 = function (str, num, noNewLine) {
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

    var cx16 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable16 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta16 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString16 = function (string) {
        escapable16.lastIndex = 0;
        return escapable16.test(string) ? '"' + string.replace(escapable16, function (a) {
            var c = meta16[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined16 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill16(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify16 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined16(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill16(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill16(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString16(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill16(obj_part)) {
                    checkForCircular16(obj_part);
                    buffer = "[";
                    objStack15.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify16(obj_part, i, false);
                        buffer += makeIndent16(indentStr, objStack15.length);
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
                    objStack15.pop();
                    buffer += makeIndent16(indentStr, objStack15.length, true) + "]";
                } else {
                    checkForCircular16(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack15.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify16(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent16(indentStr, objStack15.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString16(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack15.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent16(indentStr, objStack15.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack16 = [];

    var isArrayPolyfill17 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill17 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill17 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular17 = function (obj) {
        for (var i = 0; i < objStack16.length; i++) {
            if (objStack16[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent17 = function (str, num, noNewLine) {
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

    var cx17 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable17 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta17 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString17 = function (string) {
        escapable17.lastIndex = 0;
        return escapable17.test(string) ? '"' + string.replace(escapable17, function (a) {
            var c = meta17[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined17 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill17(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify17 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined17(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill17(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill17(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString17(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill17(obj_part)) {
                    checkForCircular17(obj_part);
                    buffer = "[";
                    objStack16.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify17(obj_part, i, false);
                        buffer += makeIndent17(indentStr, objStack16.length);
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
                    objStack16.pop();
                    buffer += makeIndent17(indentStr, objStack16.length, true) + "]";
                } else {
                    checkForCircular17(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack16.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify17(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent17(indentStr, objStack16.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString17(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack16.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent17(indentStr, objStack16.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack17 = [];

    var isArrayPolyfill18 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill18 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill18 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular18 = function (obj) {
        for (var i = 0; i < objStack17.length; i++) {
            if (objStack17[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent18 = function (str, num, noNewLine) {
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

    var cx18 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable18 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta18 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString18 = function (string) {
        escapable18.lastIndex = 0;
        return escapable18.test(string) ? '"' + string.replace(escapable18, function (a) {
            var c = meta18[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined18 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill18(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify18 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined18(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill18(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill18(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString18(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill18(obj_part)) {
                    checkForCircular18(obj_part);
                    buffer = "[";
                    objStack17.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify18(obj_part, i, false);
                        buffer += makeIndent18(indentStr, objStack17.length);
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
                    objStack17.pop();
                    buffer += makeIndent18(indentStr, objStack17.length, true) + "]";
                } else {
                    checkForCircular18(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack17.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify18(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent18(indentStr, objStack17.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString18(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack17.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent18(indentStr, objStack17.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack18 = [];

    var isArrayPolyfill19 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill19 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill19 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular19 = function (obj) {
        for (var i = 0; i < objStack18.length; i++) {
            if (objStack18[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent19 = function (str, num, noNewLine) {
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

    var cx19 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable19 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta19 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString19 = function (string) {
        escapable19.lastIndex = 0;
        return escapable19.test(string) ? '"' + string.replace(escapable19, function (a) {
            var c = meta19[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined19 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill19(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify19 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined19(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill19(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill19(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString19(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill19(obj_part)) {
                    checkForCircular19(obj_part);
                    buffer = "[";
                    objStack18.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify19(obj_part, i, false);
                        buffer += makeIndent19(indentStr, objStack18.length);
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
                    objStack18.pop();
                    buffer += makeIndent19(indentStr, objStack18.length, true) + "]";
                } else {
                    checkForCircular19(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack18.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify19(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent19(indentStr, objStack18.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString19(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack18.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent19(indentStr, objStack18.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack19 = [];

    var isArrayPolyfill20 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill20 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill20 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular20 = function (obj) {
        for (var i = 0; i < objStack19.length; i++) {
            if (objStack19[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent20 = function (str, num, noNewLine) {
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

    var cx20 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable20 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta20 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString20 = function (string) {
        escapable20.lastIndex = 0;
        return escapable20.test(string) ? '"' + string.replace(escapable20, function (a) {
            var c = meta20[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined20 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill20(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify20 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined20(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill20(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill20(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString20(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill20(obj_part)) {
                    checkForCircular20(obj_part);
                    buffer = "[";
                    objStack19.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify20(obj_part, i, false);
                        buffer += makeIndent20(indentStr, objStack19.length);
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
                    objStack19.pop();
                    buffer += makeIndent20(indentStr, objStack19.length, true) + "]";
                } else {
                    checkForCircular20(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack19.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify20(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent20(indentStr, objStack19.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString20(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack19.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent20(indentStr, objStack19.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack20 = [];

    var isArrayPolyfill21 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill21 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill21 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular21 = function (obj) {
        for (var i = 0; i < objStack20.length; i++) {
            if (objStack20[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent21 = function (str, num, noNewLine) {
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

    var cx21 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable21 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta21 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString21 = function (string) {
        escapable21.lastIndex = 0;
        return escapable21.test(string) ? '"' + string.replace(escapable21, function (a) {
            var c = meta21[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined21 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill21(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify21 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined21(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill21(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill21(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString21(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill21(obj_part)) {
                    checkForCircular21(obj_part);
                    buffer = "[";
                    objStack20.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify21(obj_part, i, false);
                        buffer += makeIndent21(indentStr, objStack20.length);
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
                    objStack20.pop();
                    buffer += makeIndent21(indentStr, objStack20.length, true) + "]";
                } else {
                    checkForCircular21(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack20.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify21(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent21(indentStr, objStack20.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString21(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack20.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent21(indentStr, objStack20.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack21 = [];

    var isArrayPolyfill22 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill22 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill22 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular22 = function (obj) {
        for (var i = 0; i < objStack21.length; i++) {
            if (objStack21[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent22 = function (str, num, noNewLine) {
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

    var cx22 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable22 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta22 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString22 = function (string) {
        escapable22.lastIndex = 0;
        return escapable22.test(string) ? '"' + string.replace(escapable22, function (a) {
            var c = meta22[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined22 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill22(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify22 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined22(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill22(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill22(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString22(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill22(obj_part)) {
                    checkForCircular22(obj_part);
                    buffer = "[";
                    objStack21.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify22(obj_part, i, false);
                        buffer += makeIndent22(indentStr, objStack21.length);
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
                    objStack21.pop();
                    buffer += makeIndent22(indentStr, objStack21.length, true) + "]";
                } else {
                    checkForCircular22(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack21.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify22(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent22(indentStr, objStack21.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString22(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack21.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent22(indentStr, objStack21.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack22 = [];

    var isArrayPolyfill23 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill23 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill23 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular23 = function (obj) {
        for (var i = 0; i < objStack22.length; i++) {
            if (objStack22[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent23 = function (str, num, noNewLine) {
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

    var cx23 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable23 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta23 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString23 = function (string) {
        escapable23.lastIndex = 0;
        return escapable23.test(string) ? '"' + string.replace(escapable23, function (a) {
            var c = meta23[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined23 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill23(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify23 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined23(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill23(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill23(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString23(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill23(obj_part)) {
                    checkForCircular23(obj_part);
                    buffer = "[";
                    objStack22.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify23(obj_part, i, false);
                        buffer += makeIndent23(indentStr, objStack22.length);
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
                    objStack22.pop();
                    buffer += makeIndent23(indentStr, objStack22.length, true) + "]";
                } else {
                    checkForCircular23(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack22.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify23(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent23(indentStr, objStack22.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString23(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack22.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent23(indentStr, objStack22.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack23 = [];

    var isArrayPolyfill24 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill24 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill24 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular24 = function (obj) {
        for (var i = 0; i < objStack23.length; i++) {
            if (objStack23[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent24 = function (str, num, noNewLine) {
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

    var cx24 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable24 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta24 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString24 = function (string) {
        escapable24.lastIndex = 0;
        return escapable24.test(string) ? '"' + string.replace(escapable24, function (a) {
            var c = meta24[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined24 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill24(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify24 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined24(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill24(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill24(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString24(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill24(obj_part)) {
                    checkForCircular24(obj_part);
                    buffer = "[";
                    objStack23.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify24(obj_part, i, false);
                        buffer += makeIndent24(indentStr, objStack23.length);
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
                    objStack23.pop();
                    buffer += makeIndent24(indentStr, objStack23.length, true) + "]";
                } else {
                    checkForCircular24(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack23.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify24(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent24(indentStr, objStack23.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString24(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack23.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent24(indentStr, objStack23.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack24 = [];

    var isArrayPolyfill25 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill25 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill25 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular25 = function (obj) {
        for (var i = 0; i < objStack24.length; i++) {
            if (objStack24[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent25 = function (str, num, noNewLine) {
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

    var cx25 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable25 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta25 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString25 = function (string) {
        escapable25.lastIndex = 0;
        return escapable25.test(string) ? '"' + string.replace(escapable25, function (a) {
            var c = meta25[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined25 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill25(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify25 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined25(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill25(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill25(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString25(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill25(obj_part)) {
                    checkForCircular25(obj_part);
                    buffer = "[";
                    objStack24.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify25(obj_part, i, false);
                        buffer += makeIndent25(indentStr, objStack24.length);
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
                    objStack24.pop();
                    buffer += makeIndent25(indentStr, objStack24.length, true) + "]";
                } else {
                    checkForCircular25(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack24.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify25(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent25(indentStr, objStack24.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString25(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack24.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent25(indentStr, objStack24.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack25 = [];

    var isArrayPolyfill26 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill26 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill26 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular26 = function (obj) {
        for (var i = 0; i < objStack25.length; i++) {
            if (objStack25[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent26 = function (str, num, noNewLine) {
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

    var cx26 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable26 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta26 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString26 = function (string) {
        escapable26.lastIndex = 0;
        return escapable26.test(string) ? '"' + string.replace(escapable26, function (a) {
            var c = meta26[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined26 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill26(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify26 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined26(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill26(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill26(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString26(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill26(obj_part)) {
                    checkForCircular26(obj_part);
                    buffer = "[";
                    objStack25.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify26(obj_part, i, false);
                        buffer += makeIndent26(indentStr, objStack25.length);
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
                    objStack25.pop();
                    buffer += makeIndent26(indentStr, objStack25.length, true) + "]";
                } else {
                    checkForCircular26(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack25.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify26(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent26(indentStr, objStack25.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString26(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack25.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent26(indentStr, objStack25.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack26 = [];

    var isArrayPolyfill27 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill27 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill27 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular27 = function (obj) {
        for (var i = 0; i < objStack26.length; i++) {
            if (objStack26[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent27 = function (str, num, noNewLine) {
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

    var cx27 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable27 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta27 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString27 = function (string) {
        escapable27.lastIndex = 0;
        return escapable27.test(string) ? '"' + string.replace(escapable27, function (a) {
            var c = meta27[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined27 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill27(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify27 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined27(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill27(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill27(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString27(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill27(obj_part)) {
                    checkForCircular27(obj_part);
                    buffer = "[";
                    objStack26.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify27(obj_part, i, false);
                        buffer += makeIndent27(indentStr, objStack26.length);
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
                    objStack26.pop();
                    buffer += makeIndent27(indentStr, objStack26.length, true) + "]";
                } else {
                    checkForCircular27(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack26.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify27(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent27(indentStr, objStack26.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString27(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack26.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent27(indentStr, objStack26.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack27 = [];

    var isArrayPolyfill28 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill28 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill28 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular28 = function (obj) {
        for (var i = 0; i < objStack27.length; i++) {
            if (objStack27[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent28 = function (str, num, noNewLine) {
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

    var cx28 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable28 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta28 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString28 = function (string) {
        escapable28.lastIndex = 0;
        return escapable28.test(string) ? '"' + string.replace(escapable28, function (a) {
            var c = meta28[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined28 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill28(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify28 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined28(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill28(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill28(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString28(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill28(obj_part)) {
                    checkForCircular28(obj_part);
                    buffer = "[";
                    objStack27.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify28(obj_part, i, false);
                        buffer += makeIndent28(indentStr, objStack27.length);
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
                    objStack27.pop();
                    buffer += makeIndent28(indentStr, objStack27.length, true) + "]";
                } else {
                    checkForCircular28(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack27.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify28(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent28(indentStr, objStack27.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString28(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack27.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent28(indentStr, objStack27.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack28 = [];

    var isArrayPolyfill29 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill29 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill29 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular29 = function (obj) {
        for (var i = 0; i < objStack28.length; i++) {
            if (objStack28[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent29 = function (str, num, noNewLine) {
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

    var cx29 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable29 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta29 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString29 = function (string) {
        escapable29.lastIndex = 0;
        return escapable29.test(string) ? '"' + string.replace(escapable29, function (a) {
            var c = meta29[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined29 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill29(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify29 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined29(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill29(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill29(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString29(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill29(obj_part)) {
                    checkForCircular29(obj_part);
                    buffer = "[";
                    objStack28.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify29(obj_part, i, false);
                        buffer += makeIndent29(indentStr, objStack28.length);
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
                    objStack28.pop();
                    buffer += makeIndent29(indentStr, objStack28.length, true) + "]";
                } else {
                    checkForCircular29(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack28.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify29(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent29(indentStr, objStack28.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString29(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack28.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent29(indentStr, objStack28.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack29 = [];

    var isArrayPolyfill30 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill30 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill30 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular30 = function (obj) {
        for (var i = 0; i < objStack29.length; i++) {
            if (objStack29[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent30 = function (str, num, noNewLine) {
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

    var cx30 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable30 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta30 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString30 = function (string) {
        escapable30.lastIndex = 0;
        return escapable30.test(string) ? '"' + string.replace(escapable30, function (a) {
            var c = meta30[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined30 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill30(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify30 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined30(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill30(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill30(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString30(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill30(obj_part)) {
                    checkForCircular30(obj_part);
                    buffer = "[";
                    objStack29.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify30(obj_part, i, false);
                        buffer += makeIndent30(indentStr, objStack29.length);
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
                    objStack29.pop();
                    buffer += makeIndent30(indentStr, objStack29.length, true) + "]";
                } else {
                    checkForCircular30(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack29.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify30(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent30(indentStr, objStack29.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString30(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack29.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent30(indentStr, objStack29.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack30 = [];

    var isArrayPolyfill31 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill31 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill31 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular31 = function (obj) {
        for (var i = 0; i < objStack30.length; i++) {
            if (objStack30[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent31 = function (str, num, noNewLine) {
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

    var cx31 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable31 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta31 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString31 = function (string) {
        escapable31.lastIndex = 0;
        return escapable31.test(string) ? '"' + string.replace(escapable31, function (a) {
            var c = meta31[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined31 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill31(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify31 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined31(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill31(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill31(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString31(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill31(obj_part)) {
                    checkForCircular31(obj_part);
                    buffer = "[";
                    objStack30.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify31(obj_part, i, false);
                        buffer += makeIndent31(indentStr, objStack30.length);
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
                    objStack30.pop();
                    buffer += makeIndent31(indentStr, objStack30.length, true) + "]";
                } else {
                    checkForCircular31(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack30.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify31(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent31(indentStr, objStack30.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString31(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack30.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent31(indentStr, objStack30.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack31 = [];

    var isArrayPolyfill32 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill32 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill32 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular32 = function (obj) {
        for (var i = 0; i < objStack31.length; i++) {
            if (objStack31[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent32 = function (str, num, noNewLine) {
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

    var cx32 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable32 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta32 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString32 = function (string) {
        escapable32.lastIndex = 0;
        return escapable32.test(string) ? '"' + string.replace(escapable32, function (a) {
            var c = meta32[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined32 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill32(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify32 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined32(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill32(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill32(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString32(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill32(obj_part)) {
                    checkForCircular32(obj_part);
                    buffer = "[";
                    objStack31.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify32(obj_part, i, false);
                        buffer += makeIndent32(indentStr, objStack31.length);
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
                    objStack31.pop();
                    buffer += makeIndent32(indentStr, objStack31.length, true) + "]";
                } else {
                    checkForCircular32(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack31.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify32(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent32(indentStr, objStack31.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString32(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack31.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent32(indentStr, objStack31.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack32 = [];

    var isArrayPolyfill33 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill33 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill33 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular33 = function (obj) {
        for (var i = 0; i < objStack32.length; i++) {
            if (objStack32[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent33 = function (str, num, noNewLine) {
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

    var cx33 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable33 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta33 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString33 = function (string) {
        escapable33.lastIndex = 0;
        return escapable33.test(string) ? '"' + string.replace(escapable33, function (a) {
            var c = meta33[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined33 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill33(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify33 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined33(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill33(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill33(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString33(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill33(obj_part)) {
                    checkForCircular33(obj_part);
                    buffer = "[";
                    objStack32.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify33(obj_part, i, false);
                        buffer += makeIndent33(indentStr, objStack32.length);
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
                    objStack32.pop();
                    buffer += makeIndent33(indentStr, objStack32.length, true) + "]";
                } else {
                    checkForCircular33(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack32.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify33(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent33(indentStr, objStack32.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString33(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack32.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent33(indentStr, objStack32.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack33 = [];

    var isArrayPolyfill34 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill34 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill34 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular34 = function (obj) {
        for (var i = 0; i < objStack33.length; i++) {
            if (objStack33[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent34 = function (str, num, noNewLine) {
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

    var cx34 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable34 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta34 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString34 = function (string) {
        escapable34.lastIndex = 0;
        return escapable34.test(string) ? '"' + string.replace(escapable34, function (a) {
            var c = meta34[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined34 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill34(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify34 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined34(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill34(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill34(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString34(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill34(obj_part)) {
                    checkForCircular34(obj_part);
                    buffer = "[";
                    objStack33.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify34(obj_part, i, false);
                        buffer += makeIndent34(indentStr, objStack33.length);
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
                    objStack33.pop();
                    buffer += makeIndent34(indentStr, objStack33.length, true) + "]";
                } else {
                    checkForCircular34(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack33.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify34(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent34(indentStr, objStack33.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString34(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack33.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent34(indentStr, objStack33.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack34 = [];

    var isArrayPolyfill35 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill35 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill35 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular35 = function (obj) {
        for (var i = 0; i < objStack34.length; i++) {
            if (objStack34[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent35 = function (str, num, noNewLine) {
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

    var cx35 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable35 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta35 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString35 = function (string) {
        escapable35.lastIndex = 0;
        return escapable35.test(string) ? '"' + string.replace(escapable35, function (a) {
            var c = meta35[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined35 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill35(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify35 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined35(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill35(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill35(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString35(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill35(obj_part)) {
                    checkForCircular35(obj_part);
                    buffer = "[";
                    objStack34.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify35(obj_part, i, false);
                        buffer += makeIndent35(indentStr, objStack34.length);
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
                    objStack34.pop();
                    buffer += makeIndent35(indentStr, objStack34.length, true) + "]";
                } else {
                    checkForCircular35(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack34.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify35(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent35(indentStr, objStack34.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString35(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack34.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent35(indentStr, objStack34.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack35 = [];

    var isArrayPolyfill36 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill36 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill36 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular36 = function (obj) {
        for (var i = 0; i < objStack35.length; i++) {
            if (objStack35[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent36 = function (str, num, noNewLine) {
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

    var cx36 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable36 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta36 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString36 = function (string) {
        escapable36.lastIndex = 0;
        return escapable36.test(string) ? '"' + string.replace(escapable36, function (a) {
            var c = meta36[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined36 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill36(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify36 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined36(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill36(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill36(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString36(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill36(obj_part)) {
                    checkForCircular36(obj_part);
                    buffer = "[";
                    objStack35.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify36(obj_part, i, false);
                        buffer += makeIndent36(indentStr, objStack35.length);
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
                    objStack35.pop();
                    buffer += makeIndent36(indentStr, objStack35.length, true) + "]";
                } else {
                    checkForCircular36(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack35.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify36(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent36(indentStr, objStack35.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString36(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack35.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent36(indentStr, objStack35.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack36 = [];

    var isArrayPolyfill37 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill37 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill37 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular37 = function (obj) {
        for (var i = 0; i < objStack36.length; i++) {
            if (objStack36[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent37 = function (str, num, noNewLine) {
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

    var cx37 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable37 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta37 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString37 = function (string) {
        escapable37.lastIndex = 0;
        return escapable37.test(string) ? '"' + string.replace(escapable37, function (a) {
            var c = meta37[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined37 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill37(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify37 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined37(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill37(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill37(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString37(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill37(obj_part)) {
                    checkForCircular37(obj_part);
                    buffer = "[";
                    objStack36.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify37(obj_part, i, false);
                        buffer += makeIndent37(indentStr, objStack36.length);
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
                    objStack36.pop();
                    buffer += makeIndent37(indentStr, objStack36.length, true) + "]";
                } else {
                    checkForCircular37(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack36.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify37(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent37(indentStr, objStack36.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString37(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack36.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent37(indentStr, objStack36.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack37 = [];

    var isArrayPolyfill38 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill38 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill38 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular38 = function (obj) {
        for (var i = 0; i < objStack37.length; i++) {
            if (objStack37[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent38 = function (str, num, noNewLine) {
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

    var cx38 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable38 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta38 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString38 = function (string) {
        escapable38.lastIndex = 0;
        return escapable38.test(string) ? '"' + string.replace(escapable38, function (a) {
            var c = meta38[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined38 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill38(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify38 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined38(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill38(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill38(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString38(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill38(obj_part)) {
                    checkForCircular38(obj_part);
                    buffer = "[";
                    objStack37.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify38(obj_part, i, false);
                        buffer += makeIndent38(indentStr, objStack37.length);
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
                    objStack37.pop();
                    buffer += makeIndent38(indentStr, objStack37.length, true) + "]";
                } else {
                    checkForCircular38(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack37.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify38(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent38(indentStr, objStack37.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString38(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack37.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent38(indentStr, objStack37.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack38 = [];

    var isArrayPolyfill39 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill39 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill39 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular39 = function (obj) {
        for (var i = 0; i < objStack38.length; i++) {
            if (objStack38[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent39 = function (str, num, noNewLine) {
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

    var cx39 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable39 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta39 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString39 = function (string) {
        escapable39.lastIndex = 0;
        return escapable39.test(string) ? '"' + string.replace(escapable39, function (a) {
            var c = meta39[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined39 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill39(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify39 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined39(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill39(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill39(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString39(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill39(obj_part)) {
                    checkForCircular39(obj_part);
                    buffer = "[";
                    objStack38.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify39(obj_part, i, false);
                        buffer += makeIndent39(indentStr, objStack38.length);
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
                    objStack38.pop();
                    buffer += makeIndent39(indentStr, objStack38.length, true) + "]";
                } else {
                    checkForCircular39(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack38.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify39(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent39(indentStr, objStack38.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString39(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack38.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent39(indentStr, objStack38.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack39 = [];

    var isArrayPolyfill40 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill40 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill40 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular40 = function (obj) {
        for (var i = 0; i < objStack39.length; i++) {
            if (objStack39[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent40 = function (str, num, noNewLine) {
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

    var cx40 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable40 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta40 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString40 = function (string) {
        escapable40.lastIndex = 0;
        return escapable40.test(string) ? '"' + string.replace(escapable40, function (a) {
            var c = meta40[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined40 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill40(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify40 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined40(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill40(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill40(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString40(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill40(obj_part)) {
                    checkForCircular40(obj_part);
                    buffer = "[";
                    objStack39.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify40(obj_part, i, false);
                        buffer += makeIndent40(indentStr, objStack39.length);
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
                    objStack39.pop();
                    buffer += makeIndent40(indentStr, objStack39.length, true) + "]";
                } else {
                    checkForCircular40(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack39.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify40(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent40(indentStr, objStack39.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString40(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack39.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent40(indentStr, objStack39.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack40 = [];

    var isArrayPolyfill41 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill41 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill41 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular41 = function (obj) {
        for (var i = 0; i < objStack40.length; i++) {
            if (objStack40[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent41 = function (str, num, noNewLine) {
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

    var cx41 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable41 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta41 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString41 = function (string) {
        escapable41.lastIndex = 0;
        return escapable41.test(string) ? '"' + string.replace(escapable41, function (a) {
            var c = meta41[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined41 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill41(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify41 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined41(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill41(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill41(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString41(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill41(obj_part)) {
                    checkForCircular41(obj_part);
                    buffer = "[";
                    objStack40.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify41(obj_part, i, false);
                        buffer += makeIndent41(indentStr, objStack40.length);
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
                    objStack40.pop();
                    buffer += makeIndent41(indentStr, objStack40.length, true) + "]";
                } else {
                    checkForCircular41(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack40.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify41(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent41(indentStr, objStack40.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString41(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack40.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent41(indentStr, objStack40.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack41 = [];

    var isArrayPolyfill42 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill42 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill42 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular42 = function (obj) {
        for (var i = 0; i < objStack41.length; i++) {
            if (objStack41[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent42 = function (str, num, noNewLine) {
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

    var cx42 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable42 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta42 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString42 = function (string) {
        escapable42.lastIndex = 0;
        return escapable42.test(string) ? '"' + string.replace(escapable42, function (a) {
            var c = meta42[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    var getReplacedValueOrUndefined42 = function (holder, key, isTopLevel) {
        var value = holder[key];

        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArrayPolyfill42(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    var internalStringify42 = function (holder, key, isTopLevel) {
        var buffer, res;

        var obj_part = getReplacedValueOrUndefined42(holder, key, isTopLevel);

        if (obj_part && !isDatePolyfill42(obj_part)) {
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaNPolyfill42(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString42(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArrayPolyfill42(obj_part)) {
                    checkForCircular42(obj_part);
                    buffer = "[";
                    objStack41.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify42(obj_part, i, false);
                        buffer += makeIndent42(indentStr, objStack41.length);
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
                    objStack41.pop();
                    buffer += makeIndent42(indentStr, objStack41.length, true) + "]";
                } else {
                    checkForCircular42(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack41.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify42(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent42(indentStr, objStack41.length);
                                nonEmpty = true;
                                var key = isWord(prop) ? prop : escapeString42(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack41.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent42(indentStr, objStack41.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                return undefined;
        }
    };

    var objStack42 = [];

    var isArrayPolyfill43 = function (obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    var isDatePolyfill43 = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    var isNaNPolyfill43 = function (val) {
        return typeof val === 'number' && val !== val;
    };

    var checkForCircular43 = function (obj) {
        for (var i = 0; i < objStack42.length; i++) {
            if (objStack42[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    var makeIndent43 = function (str, num, noNewLine) {
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

    var cx43 = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable43 = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta43 = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

    var escapeString43 = function (string) {
        escapable43.lastIndex = 0;
        return escapable43.test(string) ? '"' + string.replace(escapable43, function (a) {
            var c = meta43[a];
            return typeof c === 'string' ?