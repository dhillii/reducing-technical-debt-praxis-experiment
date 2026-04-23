// json5.js
// Modern JSON. See README.md for details.
//
// This file is based directly off of Douglas Crockford's json_parse.js:
// https://github.com/douglascrockford/JSON-js/blob/master/json_parse.js

const JSON5 = (typeof exports === 'object' ? exports : {});

/**
 * Parse a JSON5 text, producing a JavaScript data structure.
 * @param {string} source - The JSON5 text to parse.
 * @param {function} reviver - A function to transform the parsed data.
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

    // Define functions
    /**
     * Throw a SyntaxError with the given message.
     * @param {string} m - The error message.
     */
    function error(m) {
        const err = new SyntaxError();
        err.message = m;
        throw err;
    }

    /**
     * Get the next character in the text.
     * @param {string} c - The expected character.
     * @returns {string} The next character.
     */
    function next(c) {
        if (c && c !== text.charAt(at)) {
            error(`Expected '${c}' instead of '${text.charAt(at)}'`);
        }
        return text.charAt(at++);
    }

    /**
     * Get the next character without consuming it.
     * @returns {string} The next character.
     */
    function peek() {
        return text.charAt(at);
    }

    /**
     * Parse an identifier.
     * @returns {string} The identifier.
     */
    function identifier() {
        let key = next();
        // Identifiers must start with a letter, _ or $.
        if ((key !== '_' && key !== '$') &&
                (key < 'a' || key > 'z') &&
                (key < 'A' || key > 'Z')) {
            error("Bad identifier");
        }
        // Subsequent characters can contain digits.
        while (next() && (
                key === '_' || key === '$' ||
                (key >= 'a' && key <= 'z') ||
                (key >= 'A' && key <= 'Z') ||
                (key >= '0' && key <= '9'))) {
            key += text.charAt(at - 1);
        }
        return key;
    }

    /**
     * Parse a number value.
     * @returns {number} The number value.
     */
    function number() {
        let sign = '';
        let string = '';
        let base = 10;

        if (next() === '-' || next() === '+') {
            sign = text.charAt(at - 1);
            next();
        }

        // support for Infinity (could tweak to allow other words):
        if (next() === 'I') {
            const word = word();
            if (typeof word !== 'number' || isNaN(word)) {
                error('Unexpected word for number');
            }
            return (sign === '-') ? -word : word;
        }

        // support for NaN
        if (next() === 'N') {
            const word = word();
            if (!isNaN(word)) {
                error('expected word to be NaN');
            }
            // ignore sign as -NaN also is NaN
            return word;
        }

        if (next() === '0') {
            string += '0';
            next();
            if (next() === 'x' || next() === 'X') {
                string += text.charAt(at - 1);
                next();
                base = 16;
            } else if (text.charAt(at - 1) >= '0' && text.charAt(at - 1) <= '9') {
                error('Octal literal');
            }
        }

        switch (base) {
        case 10:
            while (next() && text.charAt(at - 1) >= '0' && text.charAt(at - 1) <= '9') {
                string += text.charAt(at - 1);
            }
            if (next() === '.') {
                string += '.';
                while (next() && text.charAt(at - 1) >= '0' && text.charAt(at - 1) <= '9') {
                    string += text.charAt(at - 1);
                }
            }
            if (next() === 'e' || next() === 'E') {
                string += text.charAt(at - 1);
                next();
                if (next() === '-' || next() === '+') {
                    string += text.charAt(at - 1);
                    next();
                }
                while (next() && text.charAt(at - 1) >= '0' && text.charAt(at - 1) <= '9') {
                    string += text.charAt(at - 1);
                }
            }
            break;
        case 16:
            while (next() && (text.charAt(at - 1) >= '0' && text.charAt(at - 1) <= '9' || text.charAt(at - 1) >= 'A' && text.charAt(at - 1) <= 'F' || text.charAt(at - 1) >= 'a' && text.charAt(at - 1) <= 'f')) {
                string += text.charAt(at - 1);
            }
            break;
        }

        if (sign === '-') {
            return -parseFloat(string);
        } else {
            return parseFloat(string);
        }
    }

    /**
     * Parse a string value.
     * @returns {string} The string value.
     */
    function string() {
        let hex;
        let i;
        let string = '';
        let delim;      // double quote or single quote
        let uffff;

        if (next() === '"' || next() === "'") {
            delim = text.charAt(at - 1);
            while (next()) {
                if (text.charAt(at - 1) === delim) {
                    next();
                    return string;
                } else if (text.charAt(at - 1) === '\\') {
                    next();
                    if (next() === 'u') {
                        uffff = 0;
                        for (i = 0; i < 4; i += 1) {
                            hex = parseInt(next(), 16);
                            if (!isFinite(hex)) {
                                break;
                            }
                            uffff = uffff * 16 + hex;
                        }
                        string += String.fromCharCode(uffff);
                    } else if (next() === '\r') {
                        if (peek() === '\n') {
                            next();
                        }
                    } else if (typeof escapee[text.charAt(at - 1)] === 'string') {
                        string += escapee[text.charAt(at - 1)];
                    } else {
                        break;
                    }
                } else if (text.charAt(at - 1) === '\n') {
                    // unescaped newlines are invalid; see:
                    // https://github.com/aseemk/json5/issues/24
                    // invalid unescaped chars?
                    break;
                } else {
                    string += text.charAt(at - 1);
                }
            }
        }
        error("Bad string");
    }

    /**
     * Skip an inline comment.
     */
    function inlineComment() {
        if (next() !== '/') {
            error("Not an inline comment");
        }
        do {
            next();
            if (text.charAt(at - 1) === '\n' || text.charAt(at - 1) === '\r') {
                next();
                return;
            }
        } while (text.charAt(at - 1));
    }

    /**
     * Skip a block comment.
     */
    function blockComment() {
        if (next() !== '*') {
            error("Not a block comment");
        }
        do {
            next();
            while (text.charAt(at - 1) === '*') {
                next('*');
                if (next() === '/') {
                    next('/');
                    return;
                }
            }
        } while (text.charAt(at - 1));
        error("Unterminated block comment");
    }

    /**
     * Skip a comment.
     */
    function comment() {
        if (next() !== '/') {
            error("Not a comment");
        }
        next('/');
        if (next() === '/') {
            inlineComment();
        } else if (next() === '*') {
            blockComment();
        } else {
            error("Unrecognized comment");
        }
    }

    /**
     * Skip whitespace and comments.
     */
    function white() {
        while (text.charAt(at)) {
            if (text.charAt(at) === '/') {
                comment();
            } else if (ws.indexOf(text.charAt(at)) >= 0) {
                next();
            } else {
                return;
            }
        }
    }

    /**
     * Parse a word (true, false, null, etc.).
     * @returns {*} The word value.
     */
    function word() {
        switch (next()) {
        case 't':
            next('r');
            next('u');
            next('e');
            return true;
        case 'f':
            next('a');
            next('l');
            next('s');
            next('e');
            return false;
        case 'n':
            next('u');
            next('l');
            next('l');
            return null;
        case 'I':
            next('n');
            next('f');
            next('i');
            next('n');
            next('i');
            next('t');
            next('y');
            return Infinity;
        case 'N':
            next('a');
            next('N');
            return NaN;
        }
        error(`Unexpected '${text.charAt(at - 1)}'`);
    }

    /**
     * Parse a JSON value.
     * @returns {*} The JSON value.
     */
    function value() {
        white();
        switch (text.charAt(at)) {
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
            return (text.charAt(at) >= '0' && text.charAt(at) <= '9') ? number() : word();
        }
    }

    /**
     * Parse an array value.
     * @returns {Array} The array value.
     */
    function array() {
        const array = [];
        if (next() === '[') {
            white();
            while (text.charAt(at)) {
                if (next() === ']') {
                    return array;   // Potentially empty array
                }
                // ES5 allows omitting elements in arrays, e.g. [,] and
                // [,null]. We don't allow this in JSON5.
                if (next() === ',') {
                    error("Missing array element");
                } else {
                    array.push(value());
                }
                white();
                // If there's no comma after this value, this needs to
                // be the end of the array.
                if (text.charAt(at) !== ',') {
                    next(']');
                    return array;
                }
                next(',');
                white();
            }
        }
        error("Bad array");
    }

    /**
     * Parse an object value.
     * @returns {Object} The object value.
     */
    function object() {
        const object = {};
        if (next() === '{') {
            white();
            while (text.charAt(at)) {
                if (next() === '}') {
                    return object;   // Potentially empty object
                }

                // Keys can be unquoted. If they are, they need to be
                // valid JS identifiers.
                let key;
                if (text.charAt(at) === '"' || text.charAt(at) === "'") {
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
                if (text.charAt(at) !== ',') {
                    next('}');
                    return object;
                }
                next(',');
                white();
            }
        }
        error("Bad object");
    }

    // Return the json_parse function.
    return function (source, reviver) {
        let result;

        text = String(source);
        at = 0;
        result = value();
        white();
        if (text.charAt(at)) {
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
        }({'': result}, '')) : result;
    };
}());

// JSON5 stringify will not quote keys where appropriate
JSON5.stringify = function (obj, replacer, space) {
    if (replacer && (typeof(replacer) !== "function" && !isArray(replacer))) {
        throw new Error('Replacer must be a function or an array');
    }

    /**
     * Get the replaced value or undefined.
     * @param {Object} holder - The object holding the value.
     * @param {string} key - The key of the value.
     * @param {boolean} isTopLevel - Whether this is the top level.
     * @returns {*} The replaced value or undefined.
     */
    function getReplacedValueOrUndefined(holder, key, isTopLevel) {
        let value = holder[key];

        // Replace the value with its toJSON value first, if possible
        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        // If the user-supplied replacer if a function, call it. If it's an array, check objects' string keys for
        // presence in the array (removing the key/value pair from the resulting JSON if the key is missing).
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

    /**
     * Check if a character is a word character.
     * @param {string} char - The character to check.
     * @returns {boolean} Whether the character is a word character.
     */
    function isWordChar(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            (char >= '0' && char <= '9') ||
            char === '_' || char === '$';
    }

    /**
     * Check if a character is a word start character.
     * @param {string} char - The character to check.
     * @returns {boolean} Whether the character is a word start character.
     */
    function isWordStart(char) {
        return (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            char === '_' || char === '$';
    }

    /**
     * Check if a string is a word.
     * @param {string} key - The string to check.
     * @returns {boolean} Whether the string is a word.
     */
    function isWord(key) {
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
    }

    // export for use in tests
    JSON5.isWord = isWord;

    // polyfills
    /**
     * Check if an object is an array.
     * @param {Object} obj - The object to check.
     * @returns {boolean} Whether the object is an array.
     */
    function isArray(obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    }

    /**
     * Check if an object is a date.
     * @param {Object} obj - The object to check.
     * @returns {boolean} Whether the object is a date.
     */
    function isDate(obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    }

    /**
     * Check if a value is NaN.
     * @param {*} val - The value to check.
     * @returns {boolean} Whether the value is NaN.
     */
    const isNaN = isNaN || function(val) {
        return typeof val === 'number' && val !== val;
    };

    /**
     * Check for circular references.
     * @param {Object} obj - The object to check.
     */
    function checkForCircular(obj) {
        for (let i = 0; i < objStack.length; i++) {
            if (objStack[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    }

    /**
     * Make an indent string.
     * @param {string} str - The string to use for indentation.
     * @param {number} num - The number of indent levels.
     * @param {boolean} noNewLine - Whether to add a new line.
     * @returns {string} The indent string.
     */
    function makeIndent(str, num, noNewLine) {
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

    // Copied from Crokford's implementation of JSON
    // See https://github.com/douglascrockford/JSON-js/blob/e39db4b7e6249f04a195e7dd0840e610cc9e941e/json2.js#L195
    // Begin
    const cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta = { // table of character substitutions
        '\b': '\\b',
        '\t': '\\t',
        '\n': '\\n',
        '\f': '\\f',
        '\r': '\\r',
        '"' : '\\"',
        '\\': '\\\\'
    };

    /**
     * Escape a string.
     * @param {string} string - The string to escape.
     * @returns {string} The escaped string.
     */
    function escapeString(string) {

// If the string contains no control characters, no quote characters, and no
// backslash characters, then we can safely slap some quotes around it.
// Otherwise we must also replace the offending characters with safe escape
// sequences.
        escapable.lastIndex = 0;
        return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
            var c = meta[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    }
    // End

    /**
     * Internal stringification function.
     * @param {Object} holder - The object holding the value.
     * @param {string} key - The key of the value.
     * @param {boolean} isTopLevel - Whether this is the top level.
     * @returns {*} The stringified value.
     */
    function internalStringify(holder, key, isTopLevel) {
        let buffer, res;

        // Replace the value, if necessary
        let obj_part = getReplacedValueOrUndefined(holder, key, isTopLevel);

        if (obj_part && !isDate(obj_part)) {
            // unbox objects
            // don't unbox dates, since will turn it into number
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
                    for (let prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            let value = internalStringify(obj_part, prop, false);
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
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent(indentStr, objStack.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                // functions and undefined should be ignored
                return undefined;
        }
    }

    let objStack = [];
    // special case...when undefined is used inside of
    // a compound object/array, return null.
    // but when top-level, return undefined
    let topLevelHolder = {"":obj};
    if (obj === undefined) {
        return getReplacedValueOrUndefined(topLevelHolder, '', true);
    }
    return internalStringify(topLevelHolder, '', true);
};