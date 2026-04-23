```javascript
// json5.js
// Modern JSON. See README.md for details.
//
// This file is based directly off of Douglas Crockford's json_parse.js:
// https://github.com/douglascrockford/JSON-js/blob/master/json_parse.js

const JSON5 = {};

/**
 * Parse a JSON5 text, producing a JavaScript data structure.
 * @param {string} source - The JSON5 text to parse.
 * @param {function} [reviver] - A function to transform the parsed data.
 * @returns {*} The parsed data.
 */
JSON5.parse = (function () {
    "use strict";

    // Define constants
    const ws = [
        ' ',
        '\t',
        '\r',
        '\n',
        '\v',
        '\f',
        '\xA0',
        '\uFEFF'
    ];
    const escapee = {
        "'":  "'",
        '"':  '"',
        '\\': '\\',
        '/':  '/',
        '\n': '',       // Replace escaped newlines in strings w/ empty string
        b:    '\b',
        f:    '\f',
        n:    '\n',
        r:    '\r',
        t:    '\t'
    };

    // Define parser functions
    const error = (m) => {
        const err = new SyntaxError();
        err.message = m;
        err.at = at;
        err.text = text;
        throw err;
    };

    let at, ch, text;

    const next = (c) => {
        if (c && c !== ch) {
            error(`Expected '${c}' instead of '${ch}'`);
        }
        ch = text.charAt(at);
        at += 1;
        return ch;
    };

    const peek = () => {
        return text.charAt(at);
    };

    const identifier = () => {
        // Parse an identifier. Normally, reserved words are disallowed here, but we
        // only use this for unquoted object keys, where reserved words are allowed,
        // so we don't check for those here. References:
        // - http://es5.github.com/#x7.6
        // - https://developer.mozilla.org/en/Core_JavaScript_1.5_Guide/Core_Language_Features#Variables
        // - http://docstore.mik.ua/orelly/webprog/jscript/ch02_07.htm

        let key = ch;

        // Identifiers must start with a letter, _ or $.
        if ((ch !== '_' && ch !== '$') &&
                (ch < 'a' || ch > 'z') &&
                (ch < 'A' || ch > 'Z')) {
            error("Bad identifier");
        }

        // Subsequent characters can contain digits.
        while (next() && (
                ch === '_' || ch === '$' ||
                (ch >= 'a' && ch <= 'z') ||
                (ch >= 'A' && ch <= 'Z') ||
                (ch >= '0' && ch <= '9'))) {
            key += ch;
        }

        return key;
    };

    const number = () => {
        // Parse a number value.

        let number,
            sign = '',
            string = '',
            base = 10;

        if (ch === '-' || ch === '+') {
            sign = ch;
            next(ch);
        }

        // support for Infinity (could tweak to allow other words):
        if (ch === 'I') {
            number = word();
            if (typeof number !== 'number' || isNaN(number)) {
                error('Unexpected word for number');
            }
            return (sign === '-') ? -number : number;
        }

        // support for NaN
        if (ch === 'N') {
            number = word();
            if (!isNaN(number)) {
                error('expected word to be NaN');
            }
            // ignore sign as -NaN also is NaN
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
            while (ch >= '0' && ch <= '9' || ch >= 'A' && ch <= 'F' || ch >= 'a' && ch <= 'f') {
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

    const string = () => {
        // Parse a string value.

        let hex,
            i,
            string = '',
            delim,      // double quote or single quote
            uffff;

        // When parsing for string values, we must look for ' or " and \ characters.

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
                    // unescaped newlines are invalid; see:
                    // https://github.com/aseemk/json5/issues/24
                    // invalid unescaped chars?
                    break;
                } else {
                    string += ch;
                }
            }
        }
        error("Bad string");
    };

    const inlineComment = () => {
        // Skip an inline comment, assuming this is one. The current character should
        // be the second / character in the // pair that begins this inline comment.
        // To finish the inline comment, we look for a newline or the end of the text.

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

    const blockComment = () => {
        // Skip a block comment, assuming this is one. The current character should be
        // the * character in the /* pair that begins this block comment.
        // To finish the block comment, we look for an ending */ pair of characters,
        // but we also watch for the end of text before the comment is terminated.

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

    const comment = () => {
        // Skip a comment, whether inline or block-level, assuming this is one.
        // Comments always begin with a / character.

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

    const white = () => {
        // Skip whitespace and comments.
        // Note that we're detecting comments by only a single / character.
        // This works since regular expressions are not valid JSON(5), but this will
        // break if there are other valid values that begin with a / character!

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

    const word = () => {
        // true, false, or null.

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
        error(`Unexpected '${ch}'`);
    };

    const array = () => {
        // Parse an array value.

        const array = [];

        if (ch === '[') {
            next('[');
            white();
            while (ch) {
                if (ch === ']') {
                    next(']');
                    return array;   // Potentially empty array
                }
                // ES5 allows omitting elements in arrays, e.g. [,] and
                // [,null]. We don't allow this in JSON5.
                if (ch === ',') {
                    error("Missing array element");
                } else {
                    array.push(value());
                }
                white();
                // If there's no comma after this value, this needs to
                // be the end of the array.
                if (ch !== ',') {
                    next(']');
                    return array;
                }
                next(',');
                white();
            }
        }
        error("Bad array");
    };

    const object = () => {
        // Parse an object value.

        let key,
            object = {};

        if (ch === '{') {
            next('{');
            white();
            while (ch) {
                if (ch === '}') {
                    next('}');
                    return object;   // Potentially empty object
                }

                // Keys can be unquoted. If they are, they need to be
                // valid JS identifiers.
                if (ch === '"' || ch === "'") {
                    key = string();
                } else {
                    key = identifier();
                }

                white();
                next(':');
                object[key] = value();
                white();
                // If there's no comma after this pair, this needs to be
                // the end of the object.
                if (ch !== ',') {
                    next('}');
                    return object;
                }
                next(',');
                white();
            }
        }
        error("Bad object");
    };

    const value = () => {
        // Parse a JSON value. It could be an object, an array, a string, a number,
        // or a word.

        white();
        switch (ch) {
        case '{':
            return object();
        case '[':
            return array();
        case '"':
        case "'":
            return string();
        case '-':
        case '+':
        case '.':
            return number();
        default:
            return ch >= '0' && ch <= '9' ? number() : word();
        }
    };

    return (source, reviver) => {
        let result;

        text = String(source);
        at = 0;
        ch = ' ';
        result = value();
        white();
        if (ch) {
            error("Syntax error");
        }

        // If there is a reviver function, we recursively walk the new structure,
        // passing each name/value pair to the reviver function for possible
        // transformation, starting with a temporary root object that holds the result
        // in an empty key. If there is not a reviver function, we simply return the
        // result.

        return typeof reviver === 'function' ? (function walk(holder, key) {
            let k, v, value = holder[key];
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
        }({ '': result }, '')) : result;
    };
})();

// JSON5 stringify will not quote keys where appropriate
JSON5.stringify = (function () {
    const ws = [
        ' ',
        '\t',
        '\r',
        '\n',
        '\v',
        '\f',
        '\xA0',
        '\uFEFF'
    ];

    const isWordChar = (char) => {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            (char >= '0' && char <= '9') ||
            char === '_' || char === '$';
    };

    const isWordStart = (char) => {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            char === '_' || char === '$';
    };

    const isWord = (key) => {
        if (typeof key !== 'string') {
            return false;
        }
        if (!isWordStart(key[0])) {
            return false;
        }
        let i = 1, length = key.length;
        while (i < length) {
            if (!isWordChar(key[i])) {
                return false;
            }
            i++;
        }
        return true;
    };

    // export for use in tests
    JSON5.isWord = isWord;

    // polyfills
    const isArray = (obj) => {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    const isDate = (obj) => {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };

    const isNaN = (val) => {
        return typeof val === 'number' && val !== val;
    };

    const checkForCircular = (obj, objStack) => {
        for (let i = 0; i < objStack.length; i++) {
            if (objStack[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    };

    const makeIndent = (str, num, noNewLine) => {
        if (!str) {
            return "";
        }
        // indentation no more than 10 chars
        if (str.length > 10) {
            str = str.substring(0, 10);
        }

        let indent = noNewLine ? "" : "\n";
        for (let i = 0; i < num; i++) {
            indent += str;
        }

        return indent;
    };

    const getReplacedValueOrUndefined = (holder, key, isTopLevel, replacer) => {
        let value = holder[key];

        // Replace the value with its toJSON value first, if possible
        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        // If the user-supplied replacer if a function, call it. If it's an array, check objects' string keys for
        // presence in the array (removing the key/value pair from the resulting JSON if the key is missing).
        if (typeof replacer === "function") {
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
    };

    const internalStringify = (holder, key, isTopLevel, replacer, objStack, indentStr) => {
        let buffer, res;

        // Replace the value, if necessary
        let obj_part = getReplacedValueOrUndefined(holder, key, isTopLevel, replacer);

        if (obj_part && !isDate(obj_part)) {
            // unbox objects
            // don't unbox dates, since will turn it into number
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
                checkForCircular(obj_part, objStack);
                buffer = "[";
                objStack.push(obj_part);

                for (let i = 0; i < obj_part.length; i++) {
                    res = internalStringify(obj_part, i, false, replacer, objStack, indentStr);
                    buffer += makeIndent(indentStr, objStack.length);
                    if (res === null || typeof res === "undefined") {
                        buffer += "null";
                    } else {
                        buffer += res;
                    }
                    if (i < obj_part.length - 1) {
                        buffer += ",";
                    } else if (indentStr) {
                        buffer += "\n";
                    }
                }
                objStack.pop();
                buffer += makeIndent(indentStr, objStack.length, true) + "]";
            } else {
                checkForCircular(obj_part, objStack);
                buffer = "{";
                let nonEmpty = false;
                objStack.push(obj_part);
                for (let prop in obj_part) {
                    if (obj_part.hasOwnProperty(prop)) {
                        let value = internalStringify(obj_part, prop, false, replacer, objStack, indentStr);
                        isTopLevel = false;
                        if (typeof value !== "undefined" && value !== null) {
                            buffer += makeIndent(indentStr, objStack.length);
                            nonEmpty = true;
                            let key = isWord(prop) ? prop : escapeString(prop);
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
            }
            return buffer;
        default:
            // functions and undefined should be ignored
            return undefined;
        }
    };

    const escapeString = (string) => {
        // If the string contains no control characters, no quote characters, and no
        // backslash characters, then we can safely slap some quotes around it.
        // Otherwise we must also replace the offending characters with safe escape
        // sequences.
        const escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
        const meta = { // table of character substitutions
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"': '\\"',
            '\\': '\\\\'
        };
        escapable.lastIndex = 0;
        return escapable.test(string) ? '"' + string.replace(escapable, (a) => {
            const c = meta[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    };

    return (obj, replacer, space) => {
        if (replacer && (typeof replacer !== "function" && !isArray(replacer))) {
            throw new Error('Replacer must be a function or an array');
        }
        let indentStr;
        if (space) {
            if (typeof space === "string") {
                indentStr = space;
            } else if (typeof space === "number" && space >= 0) {
                indentStr = makeIndent(" ", space, true);
            } else {
                // ignore space parameter
            }
        }

        const objStack = [];
        // special case...when undefined is used inside of
        // a compound object/array, return null.
        // but when top-level, return undefined
        const topLevelHolder = { "": obj };
        if (obj === undefined) {
            return getReplacedValueOrUndefined(topLevelHolder, '', true, replacer);
        }
        return internalStringify(topLevelHolder, '', true, replacer, objStack, indentStr);
    };
})();
```