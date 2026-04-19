```typescript
// json5.js
// Modern JSON. See README.md for details.
//
// This file is based directly off of Douglas Crockford's json_parse.js:
// https://github.com/douglascrockford/JSON-js/blob/master/json_parse.js

const JSON5 = (typeof exports === 'object' ? exports : {});

/**
 * Parse a JSON5 text into a JavaScript data structure.
 * @param source - The JSON5 string to parse
 * @param reviver - Optional function to transform the result
 * @returns The parsed JavaScript value
 */
JSON5.parse = (function () {
    "use strict";

    // Parser state variables
    let at: number;
    let ch: string;
    let text: string;

    // Character escape mappings
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

    /**
     * Create and throw a SyntaxError with context information.
     * @param message - The error message
     */
    function createError(message: string): never {
        const error = new SyntaxError(message);
        error.at = at;
        error.text = text;
        throw error;
    }

    /**
     * Get the next character from the input.
     * @param expected - Optional expected character for validation
     * @returns The next character or empty string if at end
     */
    function next(expected?: string): string {
        if (expected && expected !== ch) {
            createError(`Expected '${expected}' instead of '${ch}'`);
        }

        ch = text.charAt(at);
        at += 1;
        return ch;
    }

    /**
     * Peek at the next character without consuming it.
     * @returns The next character
     */
    function peek(): string {
        return text.charAt(at);
    }

    /**
     * Parse an identifier (unquoted object key).
     * @returns The parsed identifier string
     */
    function parseIdentifier(): string {
        let key = ch;

        if ((ch !== '_' && ch !== '$') &&
            (ch < 'a' || ch > 'z') &&
            (ch < 'A' || ch > 'Z')) {
            createError("Bad identifier");
        }

        while (next() && (
            ch === '_' || ch === '$' ||
            (ch >= 'a' && ch <= 'z') ||
            (ch >= 'A' && ch <= 'Z') ||
            (ch >= '0' && ch <= '9'))) {
            key += ch;
        }

        return key;
    }

    /**
     * Parse a numeric value including special values like Infinity and NaN.
     * @returns The parsed number
     */
    function parseNumber(): number {
        let number: number;
        let sign = '';
        let string = '';
        let base = 10;

        if (ch === '-' || ch === '+') {
            sign = ch;
            next(ch);
        }

        if (ch === 'I') {
            const wordValue = parseWord();
            if (typeof wordValue !== 'number' || isNaN(wordValue)) {
                createError('Unexpected word for number');
            }
            return (sign === '-') ? -wordValue : wordValue;
        }

        if (ch === 'N') {
            const wordValue = parseWord();
            if (!isNaN(wordValue)) {
                createError('expected word to be NaN');
            }
            return wordValue;
        }

        if (ch === '0') {
            string += ch;
            next();
            if (ch === 'x' || ch === 'X') {
                string += ch;
                next();
                base = 16;
            } else if (ch >= '0' && ch <= '9') {
                createError('Octal literal');
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
                while (ch >= '0' && ch <= '9' || ch >= 'A' && ch <= 'F' || ch >= 'a' && ch <= 'f') {
                    string += ch;
                    next();
                }
                break;
        }

        number = sign === '-' ? -string : +string;

        if (!isFinite(number)) {
            createError("Bad number");
        }

        return number;
    }

    /**
     * Parse a string value with proper escape handling.
     * @returns The parsed string
     */
    function parseString(): string {
        let hex: number;
        let i: number;
        let string = '';
        let delim: string;
        let uffff: number;

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
        createError("Bad string");
    }

    /**
     * Parse a literal word (true, false, null, Infinity, NaN).
     * @returns The parsed value
     */
    function parseWord(): unknown {
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
                createError("Unexpected '" + ch + "'");
        }
    }

    /**
     * Skip an inline comment (// style).
     */
    function skipInlineComment(): void {
        if (ch !== '/') {
            createError("Not an inline comment");
        }

        do {
            next();
            if (ch === '\n' || ch === '\r') {
                next();
                return;
            }
        } while (ch);
    }

    /**
     * Skip a block comment (/* style).
     */
    function skipBlockComment(): void {
        if (ch !== '*') {
            createError("Not a block comment");
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

        createError("Unterminated block comment");
    }

    /**
     * Skip any type of comment.
     */
    function skipComment(): void {
        if (ch !== '/') {
            createError("Not a comment");
        }

        next('/');

        if (ch === '/') {
            skipInlineComment();
        } else if (ch === '*') {
            skipBlockComment();
        } else {
            createError("Unrecognized comment");
        }
    }

    /**
     * Skip whitespace and comments.
     */
    function skipWhitespace(): void {
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

    /**
     * Parse an array value.
     * @returns The parsed array
     */
    function parseArray(): unknown[] {
        const array: unknown[] = [];

        if (ch === '[') {
            next('[');
            skipWhitespace();
            while (ch) {
                if (ch === ']') {
                    next(']');
                    return array;
                }
                if (ch === ',') {
                    createError("Missing array element");
                } else {
                    array.push(parseValue());
                }
                skipWhitespace();
                if (ch !== ',') {
                    next(']');
                    return array;
                }
                next(',');
                skipWhitespace();
            }
        }
        createError("Bad array");
    }

    /**
     * Parse an object value.
     * @returns The parsed object
     */
    function parseObject(): Record<string, unknown> {
        const object: Record<string, unknown> = {};

        if (ch === '{') {
            next('{');
            skipWhitespace();
            while (ch) {
                if (ch === '}') {
                    next('}');
                    return object;
                }

                let key: string;
                if (ch === '"' || ch === "'") {
                    key = parseString();
                } else {
                    key = parseIdentifier();
                }

                skipWhitespace();
                next(':');
                object[key] = parseValue();
                skipWhitespace();
                if (ch !== ',') {
                    next('}');
                    return object;
                }
                next(',');
                skipWhitespace();
            }
        }
        createError("Bad object");
    }

    /**
     * Parse any JSON5 value.
     * @returns The parsed value
     */
    function parseValue(): unknown {
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

    /**
     * Main entry point for parsing JSON5.
     * @param source - The JSON5 string to parse
     * @param reviver - Optional function to transform the result
     * @returns The parsed JavaScript value
     */
    return function (source: string | object, reviver?: (this: any, key: string, value: any) => any): any {
        let result: unknown;

        text = String(source);
        at = 0;
        ch = ' ';
        result = parseValue();
        skipWhitespace();
        if (ch) {
            createError("Syntax error");
        }

        if (typeof reviver === 'function') {
            return function walk(holder: any, key: string): any {
                let k: string;
                let v: any;
                let value = holder[key];
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
            }({'': result}, '')
        }
        return result;
    };
}());

/**
 * Check if a value is an array.
 * @param obj - The value to check
 * @returns True if the value is an array
 */
function isArray(obj: any): boolean {
    if (Array.isArray) {
        return Array.isArray(obj);
    }
    return Object.prototype.toString.call(obj) === '[object Array]';
}

/**
 * Check if a value is a Date object.
 * @param obj - The value to check
 * @returns True if the value is a Date object
 */
function isDate(obj: any): boolean {
    return Object.prototype.toString.call(obj) === '[object Date]';
}

/**
 * Check if a value is NaN.
 * @param val - The value to check
 * @returns True if the value is NaN
 */
const isNaN = isNaN || function(val: any): boolean {
    return typeof val === 'number' && val !== val;
};

/**
 * Check if a character is a valid word character.
 * @param char - The character to check
 * @returns True if the character is a valid word character
 */
function isWordChar(char: string): boolean {
    return (char >= 'a' && char <= 'z') ||
        (char >= 'A' && char <= 'Z') ||
        (char >= '0' && char <= '9') ||
        char === '_' || char === '$';
}

/**
 * Check if a character is a valid word start character.
 * @param char - The character to check
 * @returns True if the character is a valid word start character
 */
function isWordStart(char: string): boolean {
    return (char >= 'a' && char <= 'z') ||
        (char >= 'A' && char <= 'Z') ||
        char === '_' || char === '$';
}

/**
 * Check if a string is a valid JavaScript identifier word.
 * @param key - The string to check
 * @returns True if the string is a valid word
 */
function isWord(key: string): boolean {
    if (typeof key !== 'string') {
        return false;
    }
    if (!isWordStart(key[0])) {
        return false;
    }
    let i = 1;
    const length = key.length;
    while (i < length) {
        if (!isWordChar(key[i])) {
            return false;
        }
        i++;
    }
    return true;
}

/**
 * Create indentation string for formatted output.
 * @param str - The indentation character
 * @param num - The number of indentation levels
 * @param noNewLine - Whether to omit the newline
 * @returns The formatted indentation string
 */
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

/**
 * Escape special characters in a string for JSON output.
 * @param string - The string to escape
 * @returns The escaped string with quotes
 */
function escapeString(string: string): string {
    const cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
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
    return escapable.test(string) ? '"' + string.replace(escapable, function (a: string): string {
        const c = meta[a];
        return typeof c === 'string' ?
            c :
            '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
    }) + '"' : '"' + string + '"';
}

/**
 * Check if a value is circular by checking the object stack.
 * @param obj - The object to check
 * @throws TypeError if circular reference is detected
 */
function checkForCircular(obj: any): void {
    for (let i = 0; i < objStack.length; i++) {
        if (objStack[i] === obj) {
            throw new TypeError("Converting circular structure to JSON");
        }
    }
}

/**
 * Get the replaced value or undefined based on replacer function.
 * @param holder - The object to get the value from
 * @param key - The key to get the value for
 * @param isTopLevel - Whether this is the top level
 * @returns The replaced value or undefined
 */
function getReplacedValueOrUndefined(holder: any, key: string, isTopLevel: boolean): any {
    let value = holder[key];

    if (value && value.toJSON && typeof value.toJSON === "function") {
        value = value.toJSON();
    }

    if (typeof(replacer) === 'function') {
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
}

/**
 * Main stringify function for JSON5.
 * @param obj - The object to stringify
 * @param replacer - Optional function or array to transform the output
 * @param space - Optional string or number for indentation
 * @returns The JSON5 string representation
 */
JSON5.stringify = function (obj: any, replacer?: (this: any, key: string, value: any) => any | string[], space?: string | number): string {
    if (replacer && (typeof(replacer) !== "function" && !isArray(replacer))) {
        throw new Error('Replacer must be a function or an array');
    }

    const objStack: any[] = [];
    let replacer: (this: any, key: string, value: any) => any | string[] | undefined;
    let indentStr: string;

    if (space) {
        if (typeof space === "string") {
            indentStr = space;
        } else if (typeof space === "number" && space >= 0) {
            indentStr = makeIndent(" ", space, true);
        }
    }

    /**
     * Internal stringify function for recursive processing.
     * @param holder - The object to stringify
     * @param key - The key to stringify
     * @param isTopLevel - Whether this is the top level
     * @returns The stringified value
     */
    function internalStringify(holder: any, key: string, isTopLevel: boolean): string | undefined {
        let buffer: string;
        let res: string;
        let obj_part: any;

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

                    for (let i = 0; i < obj_part.length; i++) {
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
                    let nonEmpty = false;
                    objStack.push(obj_part);
                    for (const prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            const value = internalStringify(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent(indentStr, objStack.length);
                                nonEmpty = true;
                                const keyStr = isWord(prop) ? prop : escapeString(prop);
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
    }

    const topLevelHolder: { [key: string]: any } = {"":obj};
    if (obj === undefined) {
        return getReplacedValueOrUndefined(topLevelHolder, '', true);
    }
    return internalStringify(topLevelHolder, '', true);
};
```