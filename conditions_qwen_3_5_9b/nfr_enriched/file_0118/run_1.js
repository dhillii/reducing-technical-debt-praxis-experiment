```typescript
// json5.js
// Modern JSON. See README.md for details.
//
// This file is based directly off of Douglas Crockford's json_parse.js:
// https://github.com/douglascrockford/JSON-js/blob/master/json_parse.js

const JSON5 = (typeof exports === 'object' ? exports : {});

// Parse a JSON5 text into a JavaScript data structure
JSON5.parse = (function () {
    "use strict";

    // Parser state variables
    let at: number;
    let ch: string;
    let text: string;

    // Escape character mappings
    const escapee: Record<string, string> = {
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

    // Whitespace characters
    const ws: string[] = [
        ' ',
        '\t',
        '\r',
        '\n',
        '\v',
        '\f',
        '\xA0',
        '\uFEFF'
    ];

    // Error reporting function
    function createError(message: string): never {
        const error = new SyntaxError(message);
        error.at = at;
        error.text = text;
        throw error;
    }

    // Advance to next character
    function advance(expected?: string): string {
        if (expected && expected !== ch) {
            createError(`Expected '${expected}' instead of '${ch}'`);
        }
        ch = text.charAt(at);
        at += 1;
        return ch;
    }

    // Peek at next character without consuming
    function peek(): string {
        return text.charAt(at);
    }

    // Parse an identifier (unquoted object key)
    function parseIdentifier(): string {
        let key = ch;

        if ((ch !== '_' && ch !== '$') &&
            (ch < 'a' || ch > 'z') &&
            (ch < 'A' || ch > 'Z')) {
            createError("Bad identifier");
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

    // Parse a numeric value
    function parseNumber(): number {
        let number: number;
        let sign = '';
        let string = '';
        let base = 10;

        if (ch === '-' || ch === '+') {
            sign = advance();
        }

        // Handle Infinity
        if (ch === 'I') {
            const word = parseWord();
            if (typeof word !== 'number' || isNaN(word)) {
                createError('Unexpected word for number');
            }
            return sign === '-' ? -word : word;
        }

        // Handle NaN
        if (ch === 'N') {
            const word = parseWord();
            if (!isNaN(word)) {
                createError('expected word to be NaN');
            }
            return word;
        }

        if (ch === '0') {
            string += advance();
            if (ch === 'x' || ch === 'X') {
                string += advance();
                base = 16;
            } else if (ch >= '0' && ch <= '9') {
                createError('Octal literal');
            }
        }

        switch (base) {
            case 10:
                while (ch >= '0' && ch <= '9') {
                    string += advance();
                }
                if (ch === '.') {
                    advance();
                    while (ch >= '0' && ch <= '9') {
                        string += advance();
                    }
                }
                if (ch === 'e' || ch === 'E') {
                    string += advance();
                    if (ch === '-' || ch === '+') {
                        string += advance();
                    }
                    while (ch >= '0' && ch <= '9') {
                        string += advance();
                    }
                }
                break;
            case 16:
                while (ch >= '0' && ch <= '9' || ch >= 'A' && ch <= 'F' || ch >= 'a' && ch <= 'f') {
                    string += advance();
                }
                break;
        }

        number = sign === '-' ? -string : +string;

        if (!isFinite(number)) {
            createError("Bad number");
        }

        return number;
    }

    // Parse a string value
    function parseString(): string {
        let string = '';
        let delim = ch;

        advance();

        while (advance()) {
            if (ch === delim) {
                advance();
                return string;
            } else if (ch === '\\') {
                advance();
                if (ch === 'u') {
                    let uffff = 0;
                    for (let i = 0; i < 4; i += 1) {
                        const hex = parseInt(advance(), 16);
                        if (!isFinite(hex)) {
                            break;
                        }
                        uffff = uffff * 16 + hex;
                    }
                    string += String.fromCharCode(uffff);
                } else if (ch === '\r') {
                    if (peek() === '\n') {
                        advance();
                    }
                } else if (escapee[ch]) {
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

        createError("Bad string");
    }

    // Parse an inline comment (//)
    function parseInlineComment(): void {
        advance();

        while (advance()) {
            if (ch === '\n' || ch === '\r') {
                advance();
                return;
            }
        }
    }

    // Parse a block comment (/* */)
    function parseBlockComment(): void {
        advance();

        while (advance()) {
            if (ch === '*') {
                advance();
                if (ch === '/') {
                    advance();
                    return;
                }
            }
        }

        createError("Unterminated block comment");
    }

    // Parse any comment
    function parseComment(): void {
        advance();

        if (ch === '/') {
            parseInlineComment();
        } else if (ch === '*') {
            parseBlockComment();
        } else {
            createError("Unrecognized comment");
        }
    }

    // Skip whitespace and comments
    function skipWhitespace(): void {
        while (ch) {
            if (ch === '/') {
                parseComment();
            } else if (ws.indexOf(ch) >= 0) {
                advance();
            } else {
                return;
            }
        }
    }

    // Parse true, false, null, Infinity, NaN
    function parseWord(): any {
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
            default:
                createError(`Unexpected '${ch}'`);
        }
    }

    // Parse an array value
    function parseArray(): any[] {
        const array: any[] = [];

        advance('[');
        skipWhitespace();

        while (ch) {
            if (ch === ']') {
                advance(']');
                return array;
            }

            if (ch === ',') {
                createError("Missing array element");
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

        createError("Bad array");
    }

    // Parse an object value
    function parseObject(): Record<string, any> {
        const object: Record<string, any> = {};

        advance('{');
        skipWhitespace();

        while (ch) {
            if (ch === '}') {
                advance('}');
                return object;
            }

            const key = ch === '"' || ch === "'" ? parseString() : parseIdentifier();
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

        createError("Bad object");
    }

    // Parse any JSON value
    function parseValue(): any {
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
    }

    // Main parse function
    function parse(source: string, reviver?: (this: any, key: string, value: any) => any): any {
        text = String(source);
        at = 0;
        ch = ' ';
        const result = parseValue();
        skipWhitespace();

        if (ch) {
            createError("Syntax error");
        }

        if (typeof reviver === 'function') {
            return walk({'': result}, '');
        }

        return result;
    }

    // Walk the structure with reviver function
    function walk(holder: any, key: string): any {
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
    }

    return parse;
}());

// Check if a value is an array
function isArray(obj: any): boolean {
    if (Array.isArray) {
        return Array.isArray(obj);
    }
    return Object.prototype.toString.call(obj) === '[object Array]';
}

// Check if a value is a date
function isDate(obj: any): boolean {
    return Object.prototype.toString.call(obj) === '[object Date]';
}

// Check if a value is NaN
function isNaNCheck(val: any): boolean {
    return typeof val === 'number' && val !== val;
}

// Check if a key is a valid word character
function isWordChar(char: string): boolean {
    return (char >= 'a' && char <= 'z') ||
        (char >= 'A' && char <= 'Z') ||
        (char >= '0' && char <= '9') ||
        char === '_' || char === '$';
}

// Check if a key is a valid word start character
function isWordStart(char: string): boolean {
    return (char >= 'a' && char <= 'z') ||
        (char >= 'A' && char <= 'Z') ||
        char === '_' || char === '$';
}

// Check if a key is a valid word
function isWord(key: string): boolean {
    if (typeof key !== 'string') {
        return false;
    }
    if (!isWordStart(key[0])) {
        return false;
    }
    for (let i = 1; i < key.length; i++) {
        if (!isWordChar(key[i])) {
            return false;
        }
    }
    return true;
}

// Create indentation string
function makeIndent(str: string, num: number, noNewLine: boolean): string {
    if (!str) {
        return "";
    }
    if (str.length > 10) {
        str = str.substring(0, 10);
    }

    const indent = noNewLine ? "" : "\n";
    let result = indent;
    for (let i = 0; i < num; i++) {
        result += str;
    }

    return result;
}

// Escape special characters in strings
function escapeString(string: string): string {
    const escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    const meta: Record<string, string> = {
        '\b': '\\b',
        '\t': '\\t',
        '\n': '\\n',
        '\f': '\\f',
        '\r': '\\r',
        '"': '\\"',
        '\\': '\\\\'
    };

    escapable.lastIndex = 0;
    return escapable.test(string) ? '"' + string.replace(escapable, function (a: string) {
        const c = meta[a];
        return typeof c === 'string' ?
            c :
            '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
    }) + '"' : '"' + string + '"';
}

// Get replaced value or undefined based on replacer
function getReplacedValueOrUndefined(holder: any, key: string, isTopLevel: boolean): any {
    const value = holder[key];

    if (value && value.toJSON && typeof value.toJSON === "function") {
        value = value.toJSON();
    }

    if (typeof replacer === 'function') {
        return replacer.call(holder, key, value);
    } else if (replacer) {
        if (isTopLevel || isArray(holder) || replacer.indexOf(key) >= 0) {
            return value;
        } else {
            return undefined;
        }
    } else {
        return value;
    }
}

// Check for circular references
function checkForCircular(obj: any, stack: any[]): void {
    for (let i = 0; i < stack.length; i++) {
        if (stack[i] === obj) {
            throw new TypeError("Converting circular structure to JSON");
        }
    }
}

// Internal stringify function
function internalStringify(holder: any, key: string, isTopLevel: boolean, stack: any[]): string {
    const objPart = getReplacedValueOrUndefined(holder, key, isTopLevel);

    if (objPart && !isDate(objPart)) {
        objPart = objPart.valueOf();
    }

    switch (typeof objPart) {
        case "boolean":
            return objPart.toString();

        case "number":
            if (isNaNCheck(objPart) || !isFinite(objPart)) {
                return "null";
            }
            return objPart.toString();

        case "string":
            return escapeString(objPart.toString());

        case "object":
            if (objPart === null) {
                return "null";
            } else if (isArray(objPart)) {
                checkForCircular(objPart, stack);
                const buffer = "[";
                stack.push(objPart);

                for (let i = 0; i < objPart.length; i++) {
                    const res = internalStringify(objPart, i, false, stack);
                    buffer += makeIndent(indentStr, stack.length);
                    if (res === null || typeof res === "undefined") {
                        buffer += "null";
                    } else {
                        buffer += res;
                    }
                    if (i < objPart.length - 1) {
                        buffer += ",";
                    } else if (indentStr) {
                        buffer += "\n";
                    }
                }

                stack.pop();
                buffer += makeIndent(indentStr, stack.length, true) + "]";
                return buffer;
            } else {
                checkForCircular(objPart, stack);
                const buffer = "{";
                const objStack = stack;
                stack.push(objPart);
                let nonEmpty = false;

                for (const prop in objPart) {
                    if (objPart.hasOwnProperty(prop)) {
                        const value = internalStringify(objPart, prop, false, stack);
                        isTopLevel = false;
                        if (typeof value !== "undefined" && value !== null) {
                            buffer += makeIndent(indentStr, stack.length);
                            nonEmpty = true;
                            const keyStr = isWord(prop) ? prop : escapeString(prop);
                            buffer += keyStr + ":" + (indentStr ? ' ' : '') + value + ",";
                        }
                    }
                }

                stack.pop();
                if (nonEmpty) {
                    buffer = buffer.substring(0, buffer.length - 1) + makeIndent(indentStr, stack.length) + "}";
                } else {
                    buffer = '{}';
                }
                return buffer;
            }

        default:
            return undefined;
    }
}

// Main stringify function
JSON5.stringify = function (obj: any, replacer?: any, space?: any): string {
    if (replacer && (typeof replacer !== "function" && !isArray(replacer))) {
        throw new Error('Replacer must be a function or an array');
    }

    // Handle space parameter
    let indentStr: string;
    if (space) {
        if (typeof space === "string") {
            indentStr = space;
        } else if (typeof space === "number" && space >= 0) {
            indentStr = makeIndent(" ", space, true);
        } else {
            indentStr = undefined;
        }
    }

    // Handle undefined top-level value
    if (obj === undefined) {
        const topLevelHolder = {"": obj};
        return getReplacedValueOrUndefined(topLevelHolder, '', true);
    }

    const topLevelHolder = {"": obj};
    return internalStringify(topLevelHolder, '', true, []);
};
```