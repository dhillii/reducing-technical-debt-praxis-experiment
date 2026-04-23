var JSON5 = (typeof exports === 'object' ? exports : {});

JSON5.parse = (function () {
    "use strict";

    // Helper to create a parser instance
    function createParser(source) {
        const parser = {
            text: String(source),
            at: 0,
            ch: ' ',
            escapee: {
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
            ws: [' ', '\t', '\r', '\n', '\v', '\f', '\xA0', '\uFEFF']
        };
        return parser;
    }

    // Core error handling
    function throwError(parser, message) {
        const err = new SyntaxError(message);
        err.at = parser.at;
        err.text = parser.text;
        throw err;
    }

    // Advance to next character
    function nextChar(parser, expected) {
        if (expected && expected !== parser.ch) {
            throwError(parser, "Expected '" + expected + "' instead of '" + parser.ch + "'");
        }
        parser.ch = parser.text.charAt(parser.at);
        parser.at += 1;
        return parser.ch;
    }

    // Look ahead without consuming
    function peekChar(parser) {
        return parser.text.charAt(parser.at);
    }

    // Skip whitespace and comments
    function skipWhite(parser) {
        while (parser.ch) {
            if (parser.ch === '/') {
                skipComment(parser);
            } else if (parser.ws.includes(parser.ch)) {
                nextChar(parser);
            } else {
                break;
            }
        }
    }

    // Comment handling
    function skipComment(parser) {
        nextChar(parser, '/');
        if (parser.ch === '/') {
            skipInlineComment(parser);
        } else if (parser.ch === '*') {
            skipBlockComment(parser);
        } else {
            throwError(parser, "Unrecognized comment");
        }
    }

    function skipInlineComment(parser) {
        while (parser.ch) {
            nextChar(parser);
            if (parser.ch === '\n' || parser.ch === '\r') {
                nextChar(parser);
                return;
            }
        }
    }

    function skipBlockComment(parser) {
        while (parser.ch) {
            nextChar(parser);
            if (parser.ch === '*') {
                nextChar(parser, '*');
                if (parser.ch === '/') {
                    nextChar(parser, '/');
                    return;
                }
            }
        }
        throwError(parser, "Unterminated block comment");
    }

    // Identifier parsing
    function parseIdentifier(parser) {
        let key = parser.ch;
        if (!isIdentifierStart(parser.ch)) {
            throwError(parser, "Bad identifier");
        }
        while (nextChar(parser) && isIdentifierPart(parser.ch)) {
            key += parser.ch;
        }
        return key;
    }

    function isIdentifierStart(ch) {
        return (ch === '_' || ch === '$' ||
            (ch >= 'a' && ch <= 'z') ||
            (ch >= 'A' && ch <= 'Z'));
    }

    function isIdentifierPart(ch) {
        return (ch === '_' || ch === '$' ||
            (ch >= 'a' && ch <= 'z') ||
            (ch >= 'A' && ch <= 'Z') ||
            (ch >= '0' && ch <= '9'));
    }

    // Number parsing
    function parseNumber(parser) {
        let sign = '';
        let numStr = '';
        let base = 10;

        if (parser.ch === '-' || parser.ch === '+') {
            sign = parser.ch;
            nextChar(parser);
        }

        if (parser.ch === 'I') {
            const value = parseWord(parser);
            if (typeof value !== 'number' || isNaN(value)) {
                throwError(parser, 'Unexpected word for number');
            }
            return sign === '-' ? -value : value;
        }

        if (parser.ch === 'N') {
            const value = parseWord(parser);
            if (!isNaN(value)) {
                throwError(parser, 'expected word to be NaN');
            }
            return value;
        }

        if (parser.ch === '0') {
            numStr += parser.ch;
            nextChar(parser);
            if (parser.ch === 'x' || parser.ch === 'X') {
                numStr += parser.ch;
                nextChar(parser);
                base = 16;
            } else if (parser.ch >= '0' && parser.ch <= '9') {
                throwError(parser, 'Octal literal');
            }
        }

        if (base === 10) {
            numStr += readDigits(parser, /[0-9]/);
            if (parser.ch === '.') {
                numStr += '.';
                nextChar(parser);
                numStr += readDigits(parser, /[0-9]/);
            }
            if (parser.ch === 'e' || parser.ch === 'E') {
                numStr += parser.ch;
                nextChar(parser);
                if (parser.ch === '-' || parser.ch === '+') {
                    numStr += parser.ch;
                    nextChar(parser);
                }
                numStr += readDigits(parser, /[0-9]/);
            }
        } else {
            numStr += readDigits(parser, /[0-9a-fA-F]/);
        }

        const number = sign === '-' ? -Number(numStr) : Number(numStr);
        if (!isFinite(number)) {
            throwError(parser, "Bad number");
        }
        return number;
    }

    function readDigits(parser, regex) {
        let digits = '';
        while (regex.test(parser.ch)) {
            digits += parser.ch;
            nextChar(parser);
        }
        return digits;
    }

    // String parsing
    function parseString(parser) {
        const delim = parser.ch;
        let result = '';
        while (nextChar(parser)) {
            if (parser.ch === delim) {
                nextChar(parser);
                return result;
            }
            if (parser.ch === '\\') {
                nextChar(parser);
                if (parser.ch === 'u') {
                    result += parseUnicodeEscape(parser);
                } else if (parser.ch === '\r') {
                    if (peekChar(parser) === '\n') {
                        nextChar(parser);
                    }
                } else if (parser.escapee.hasOwnProperty(parser.ch)) {
                    result += parser.escapee[parser.ch];
                } else {
                    break;
                }
            } else if (parser.ch === '\n') {
                break;
            } else {
                result += parser.ch;
            }
        }
        throwError(parser, "Bad string");
    }

    function parseUnicodeEscape(parser) {
        let code = 0;
        for (let i = 0; i < 4; i++) {
            const hex = parseInt(nextChar(parser), 16);
            if (!isFinite(hex)) {
                break;
            }
            code = code * 16 + hex;
        }
        return String.fromCharCode(code);
    }

    // Word parsing (true, false, null, Infinity, NaN)
    function parseWord(parser) {
        switch (parser.ch) {
            case 't':
                expectSequence(parser, ['t', 'r', 'u', 'e']);
                return true;
            case 'f':
                expectSequence(parser, ['f', 'a', 'l', 's', 'e']);
                return false;
            case 'n':
                expectSequence(parser, ['n', 'u', 'l', 'l']);
                return null;
            case 'I':
                expectSequence(parser, ['I', 'n', 'f', 'i', 'n', 'i', 't', 'y']);
                return Infinity;
            case 'N':
                expectSequence(parser, ['N', 'a', 'N']);
                return NaN;
        }
        throwError(parser, "Unexpected '" + parser.ch + "'");
    }

    function expectSequence(parser, seq) {
        for (let i = 0; i < seq.length; i++) {
            nextChar(parser, seq[i]);
        }
    }

    // Array parsing
    function parseArray(parser) {
        const arr = [];
        nextChar(parser, '[');
        skipWhite(parser);
        while (parser.ch) {
            if (parser.ch === ']') {
                nextChar(parser, ']');
                return arr;
            }
            if (parser.ch === ',') {
                throwError(parser, "Missing array element");
            }
            arr.push(parseValue(parser));
            skipWhite(parser);
            if (parser.ch !== ',') {
                nextChar(parser, ']');
                return arr;
            }
            nextChar(parser, ',');
            skipWhite(parser);
        }
        throwError(parser, "Bad array");
    }

    // Object parsing
    function parseObject(parser) {
        const obj = {};
        nextChar(parser, '{');
        skipWhite(parser);
        while (parser.ch) {
            if (parser.ch === '}') {
                nextChar(parser, '}');
                return obj;
            }
            const key = (parser.ch === '"' || parser.ch === "'") ? parseString(parser) : parseIdentifier(parser);
            skipWhite(parser);
            nextChar(parser, ':');
            obj[key] = parseValue(parser);
            skipWhite(parser);
            if (parser.ch !== ',') {
                nextChar(parser, '}');
                return obj;
            }
            nextChar(parser, ',');
            skipWhite(parser);
        }
        throwError(parser, "Bad object");
    }

    // Value dispatcher
    function parseValue(parser) {
        skipWhite(parser);
        switch (parser.ch) {
            case '{': return parseObject(parser);
            case '[': return parseArray(parser);
            case '"':
            case "'": return parseString(parser);
            case '-':
            case '+':
            case '.':
                return parseNumber(parser);
            default:
                return (parser.ch >= '0' && parser.ch <= '9') ? parseNumber(parser) : parseWord(parser);
        }
    }

    // Reviver walk
    function applyReviver(reviver, result) {
        if (typeof reviver !== 'function') return result;
        return (function walk(holder, key) {
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
        }({ '': result }, ''));
    }

    // Public parse function
    return function (source, reviver) {
        const parser = createParser(source);
        parser.ch = ' ';
        const result = parseValue(parser);
        skipWhite(parser);
        if (parser.ch) {
            throwError(parser, "Syntax error");
        }
        return applyReviver(reviver, result);
    };
}());

JSON5.stringify = function (obj, replacer, space) {
    if (replacer && (typeof replacer !== "function" && !Array.isArray(replacer))) {
        throw new Error('Replacer must be a function or an array');
    }

    const isArray = Array.isArray || function (a) {
        return Object.prototype.toString.call(a) === '[object Array]';
    };

    const isDate = function (d) {
        return Object.prototype.toString.call(d) === '[object Date]';
    };

    const isWordChar = function (c) {
        return (c >= 'a' && c <= 'z') ||
            (c >= 'A' && c <= 'Z') ||
            (c >= '0' && c <= '9') ||
            c === '_' || c === '$';
    };

    const isWordStart = function (c) {
        return (c >= 'a' && c <= 'z') ||
            (c >= 'A' && c <= 'Z') ||
            c === '_' || c === '$';
    };

    const isWord = function (key) {
        if (typeof key !== 'string') return false;
        if (!isWordStart(key[0])) return false;
        for (let i = 1; i < key.length; i++) {
            if (!isWordChar(key[i])) return false;
        }
        return true;
    };

    JSON5.isWord = isWord;

    const getReplaced = function (holder, key, top) {
        let value = holder[key];
        if (value && typeof value.toJSON === 'function') {
            value = value.toJSON();
        }
        if (typeof replacer === 'function') {
            return replacer.call(holder, key, value);
        }
        if (replacer) {
            if (top || isArray(holder) || replacer.indexOf(key) >= 0) {
                return value;
            }
            return undefined;
        }
        return value;
    };

    const escapeString = function (str) {
        const meta = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"': '\\"',
            '\\': '\\\\'
        };
        const escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
        escapable.lastIndex = 0;
        return escapable.test(str) ?
            '"' + str.replace(escapable, function (a) {
                return meta[a] || '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
            }) + '"' :
            '"' + str + '"';
    };

    const makeIndent = function (str, level, noNewLine) {
        if (!str) return "";
        const limited = str.length > 10 ? str.substring(0, 10) : str;
        let indent = noNewLine ? "" : "\n";
        for (let i = 0; i < level; i++) {
            indent += limited;
        }
        return indent;
    };

    let indentStr = "";
    if (space) {
        if (typeof space === "string") {
            indentStr = space;
        } else if (typeof space === "number" && space >= 0) {
            indentStr = makeIndent(" ", space, true);
        }
    }

    const circularStack = [];

    const checkCircular = function (value) {
        if (circularStack.includes(value)) {
            throw new TypeError("Converting circular structure to JSON");
        }
    };

    const internalStringify = function (holder, key, top) {
        const raw = getReplaced(holder, key, top);
        const value = raw && !isDate(raw) ? raw.valueOf() : raw;

        switch (typeof value) {
            case "boolean":
                return value.toString();
            case "number":
                return (isNaN(value) || !isFinite(value)) ? "null" : value.toString();
            case "string":
                return escapeString(value);
            case "object":
                if (value === null) return "null";
                if (isArray(value)) {
                    checkCircular(value);
                    circularStack.push(value);
                    let out = "[";
                    for (let i = 0; i < value.length; i++) {
                        const item = internalStringify(value, i, false);
                        out += makeIndent(indentStr, circularStack.length);
                        out += (item === null || typeof item === "undefined") ? "null" : item;
                        out += i < value.length - 1 ? "," : (indentStr ? "\n" : "");
                    }
                    circularStack.pop();
                    out += makeIndent(indentStr, circularStack.length, true) + "]";
                    return out;
                }
                checkCircular(value);
                circularStack.push(value);
                let objOut = "{";
                let hasProp = false;
                for (const prop in value) {
                    if (Object.prototype.hasOwnProperty.call(value, prop)) {
                        const propVal = internalStringify(value, prop, false);
                        if (propVal !== undefined && propVal !== null) {
                            objOut += makeIndent(indentStr, circularStack.length);
                            hasProp = true;
                            const keyStr = isWord(prop) ? prop : escapeString(prop);
                            objOut += keyStr + ":" + (indentStr ? " " : "") + propVal + ",";
                        }
                    }
                }
                circularStack.pop();
                if (hasProp) {
                    objOut = objOut.slice(0, -1) + makeIndent(indentStr, circularStack.length) + "}";
                } else {
                    objOut = "{}";
                }
                return objOut;
            default:
                return undefined;
        }
    };

    const topHolder = { "": obj };
    if (obj === undefined) {
        return getReplaced(topHolder, "", true);
    }
    return internalStringify(topHolder, "", true);
};