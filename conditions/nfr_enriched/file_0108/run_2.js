```javascript
'use strict';

/* eslint-env browser */

/**
 * Module dependencies.
 */

const { basename } = require('path');
const debug = require('debug')('mocha:watch');
const { existsSync: exists } = require('fs');
const glob = require('glob');
const path = require('path');
const { join } = path;
const { readdirSync } = require('fs');
const { statSync } = require('fs');
const { watchFile } = require('fs');
const { lstatSync } = require('fs');
const he = require('he');

/**
 * Ignored directories.
 */

const ignore = ['node_modules', '.git'];

exports.inherits = require('util').inherits;

/**
 * Escape special characters in the given string of html.
 *
 * @api private
 * @param  {string} html
 * @return {string}
 */
exports.escape = function (html) {
  return he.encode(String(html), { useNamedReferences: false });
};

/**
 * Test if the given obj is type of string.
 *
 * @api private
 * @param {Object} obj
 * @return {boolean}
 */
exports.isString = function (obj) {
  return typeof obj === 'string';
};

/**
 * Watch the given `files` for changes
 * and invoke `fn(file)` on modification.
 *
 * @api private
 * @param {Array} files
 * @param {Function} fn
 */
exports.watch = function (files, fn) {
  const options = { interval: 100 };
  files.forEach(function (file) {
    debug('file %s', file);
    watchFile(file, options, function (curr, prev) {
      if (prev.mtime < curr.mtime) {
        fn(file);
      }
    });
  });
};

/**
 * Ignored files.
 *
 * @api private
 * @param {string} path
 * @return {boolean}
 */
function ignored (path) {
  return !~ignore.indexOf(path);
}

/**
 * Lookup files in the given `dir`.
 *
 * @api private
 * @param {string} dir
 * @param {string[]} [ext=['.js']]
 * @param {Array} [ret=[]]
 * @return {Array}
 */
exports.files = function (dir, ext, ret) {
  ret = ret || [];
  ext = ext || ['js'];

  const re = new RegExp('\\.(' + ext.join('|') + ')$');

  readdirSync(dir)
    .filter(ignored)
    .forEach(function (filePath) {
      filePath = join(dir, filePath);
      if (lstatSync(filePath).isDirectory()) {
        exports.files(filePath, ext, ret);
      } else if (filePath.match(re)) {
        ret.push(filePath);
      }
    });

  return ret;
};

/**
 * Compute a slug from the given `str`.
 *
 * @api private
 * @param {string} str
 * @return {string}
 */
exports.slug = function (str) {
  return str
    .toLowerCase()
    .replace(/ +/g, '-')
    .replace(/[^-\w]/g, '');
};

/**
 * Strip the function definition from `str`, and re-indent for pre whitespace.
 *
 * @param {string} str
 * @return {string}
 */
exports.clean = function (str) {
  str = str
    .replace(/\r\n?|[\n\u2028\u2029]/g, '\n').replace(/^\uFEFF/, '')
    .replace(/^function(?:\s*|\s+[^(]*)\([^)]*\)\s*\{((?:.|\n)*?)\s*\}$|^\([^)]*\)\s*=>\s*(?:\{((?:.|\n)*?)\s*\}|((?:.|\n)*))$/, '$1$2$3');

  const spaces = str.match(/^\n?( *)/)[1].length;
  const tabs = str.match(/^\n?(\t*)/)[1].length;
  const re = new RegExp('^\n?' + (tabs ? '\t' : ' ') + '{' + (tabs || spaces) + '}', 'gm');

  str = str.replace(re, '');

  return str.trim();
};

/**
 * Parse the given `qs`.
 *
 * @api private
 * @param {string} qs
 * @return {Object}
 */
exports.parseQuery = function (qs) {
  return qs.replace('?', '').split('&').reduce(function (obj, pair) {
    const i = pair.indexOf('=');
    const key = pair.slice(0, i);
    const val = pair.slice(++i);

    obj[key] = decodeURIComponent(val.replace(/\+/g, '%20'));

    return obj;
  }, {});
};

/**
 * Highlight the given string of `js`.
 *
 * @api private
 * @param {string} js
 * @return {string}
 */
function highlight (js) {
  return js
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\/\/(.*)/gm, '<span class="comment">//$1</span>')
    .replace(/('.*?')/gm, '<span class="string">$1</span>')
    .replace(/(\d+\.\d+)/gm, '<span class="number">$1</span>')
    .replace(/(\d+)/gm, '<span class="number">$1</span>')
    .replace(/\bnew[ \t]+(\w+)/gm, '<span class="keyword">new</span> <span class="init">$1</span>')
    .replace(/\b(function|new|throw|return|var|if|else)\b/gm, '<span class="keyword">$1</span>');
}

/**
 * Highlight the contents of tag `name`.
 *
 * @api private
 * @param {string} name
 */
exports.highlightTags = function (name) {
  const code = document.getElementById('mocha').getElementsByTagName(name);
  for (let i = 0, len = code.length; i < len; ++i) {
    code[i].innerHTML = highlight(code[i].innerHTML);
  }
};

/**
 * If a value could have properties, and has none, this function is called,
 * which returns a string representation of the empty value.
 *
 * Functions w/ no properties return `'[Function]'`
 * Arrays w/ length === 0 return `'[]'`
 * Objects w/ no properties return `'{}'`
 * All else: return result of `value.toString()`
 *
 * @api private
 * @param {*} value The value to inspect.
 * @param {string} typeHint The type of the value
 * @returns {string}
 */
function emptyRepresentation (value, typeHint) {
  switch (typeHint) {
    case 'function':
      return '[Function]';
    case 'object':
      return '{}';
    case 'array':
      return '[]';
    default:
      return value.toString();
  }
}

/**
 * Takes some variable and asks `Object.prototype.toString()` what it thinks it
 * is.
 *
 * @api private
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/toString
 * @param {*} value The value to test.
 * @returns {string} Computed type
 * @example
 * type({}) // 'object'
 * type([]) // 'array'
 * type(1) // 'number'
 * type(false) // 'boolean'
 * type(Infinity) // 'number'
 * type(null) // 'null'
 * type(new Date()) // 'date'
 * type(/foo/) // 'regexp'
 * type('type') // 'string'
 * type(global) // 'global'
 * type(new String('foo') // 'object'
 */
const type = exports.type = function type (value) {
  if (value === undefined) {
    return 'undefined';
  } else if (value === null) {
    return 'null';
  } else if (Buffer.isBuffer(value)) {
    return 'buffer';
  }
  return Object.prototype.toString.call(value)
    .replace(/^\[.+\s(.+?)]$/, '$1')
    .toLowerCase();
};

/**
 * Check if value has own properties.
 *
 * @api private
 * @param {*} value
 * @return {boolean}
 */
function hasProperties (value) {
  for (const prop in value) {
    if (Object.prototype.hasOwnProperty.call(value, prop)) {
      return true;
    }
  }
  return false;
}

/**
 * Convert string to character-indexed object.
 *
 * @api private
 * @param {string} value
 * @return {Object}
 */
function stringToCharObject (value) {
  return value.split('').reduce(function (acc, char, idx) {
    acc[idx] = char;
    return acc;
  }, {});
}

/**
 * Stringify `value`. Different behavior depending on type of value:
 *
 * - If `value` is undefined or null, return `'[undefined]'` or `'[null]'`, respectively.
 * - If `value` is not an object, function or array, return result of `value.toString()` wrapped in double-quotes.
 * - If `value` is an *empty* object, function, or array, return result of function
 *   {@link emptyRepresentation}.
 * - If `value` has properties, call {@link exports.canonicalize} on it, then return result of
 *   JSON.stringify().
 *
 * @api private
 * @see exports.type
 * @param {*} value
 * @return {string}
 */
exports.stringify = function (value) {
  const typeHint = type(value);

  if (!~['object', 'array', 'function'].indexOf(typeHint)) {
    if (typeHint === 'buffer') {
      const json = Buffer.prototype.toJSON.call(value);
      return jsonStringify(json.data && json.type ? json.data : json, 2)
        .replace(/,(\n|$)/g, '$1');
    }

    if (typeHint === 'string' && typeof value === 'object') {
      const charObj = stringToCharObject(value);
      return jsonStringify(exports.canonicalize(charObj, null, 'object'), 2).replace(/,(\n|$)/g, '$1');
    }

    return jsonStringify(value);
  }

  if (hasProperties(value)) {
    return jsonStringify(exports.canonicalize(value, null, typeHint), 2).replace(/,(\n|$)/g, '$1');
  }

  return emptyRepresentation(value, typeHint);
};

/**
 * Repeat string n times.
 *
 * @api private
 * @param {string} s
 * @param {number} n
 * @return {string}
 */
function repeat (s, n) {
  return new Array(n).join(s);
}

/**
 * Stringify a value for JSON output.
 *
 * @api private
 * @param {*} val
 * @return {string}
 */
function stringifyValue (val) {
  switch (type(val)) {
    case 'null':
    case 'undefined':
      return '[' + val + ']';
    case 'array':
    case 'object':
      return jsonStringify(val, arguments[1], arguments[2]);
    case 'boolean':
    case 'regexp':
    case 'symbol':
    case 'number':
      return val === 0 && (1 / val) === -Infinity ? '-0' : val.toString();
    case 'date':
      const sDate = isNaN(val.getTime()) ? val.toString() : val.toISOString();
      return '[Date: ' + sDate + ']';
    case 'buffer':
      const json = val.toJSON();
      const bufferData = json.data && json.type ? json.data : json;
      return '[Buffer: ' + jsonStringify(bufferData, 2, arguments[2]) + ']';
    default:
      return (val === '[Function]' || val === '[Circular]')
        ? val
        : JSON.stringify(val);
  }
}

/**
 * like JSON.stringify but more sense.
 *
 * @api private
 * @param {Object}  object
 * @param {number=} spaces
 * @param {number=} depth
 * @returns {*}
 */
function jsonStringify (object, spaces, depth) {
  if (typeof spaces === 'undefined') {
    return stringifyValue(object);
  }

  depth = depth || 1;
  const space = spaces * depth;
  const str = Array.isArray(object) ? '[' : '{';
  const end = Array.isArray(object) ? ']' : '}';
  const length = typeof object.length === 'number' ? object.length : Object.keys(object).length;

  let result = str;
  let itemCount = length;

  for (const i in object) {
    if (!Object.prototype.hasOwnProperty.call(object, i)) {
      continue;
    }
    --itemCount;
    const key = Array.isArray(object) ? '' : '"' + i + '": ';
    const val = stringifyValue(object[i], spaces, depth + 1);
    const comma = itemCount ? ',' : '';
    result += '\n ' + repeat(' ', space) + key + val + comma;
  }

  return result + (result.length !== 1 ? '\n' + repeat(' ', --space) + end : end);
}

/**
 * Check if value is circular reference.
 *
 * @api private
 * @param {*} value
 * @param {Array} stack
 * @return {boolean}
 */
function isCircular (value, stack) {
  return stack.indexOf(value) !== -1;
}

/**
 * Canonicalize an array value.
 *
 * @api private
 * @param {Array} value
 * @param {Array} stack
 * @return {Array}
 */
function canonicalizeArray (value, stack) {
  const result = [];
  stack.push(value);
  value.forEach(function (item) {
    result.push(exports.canonicalize(item, stack));
  });
  stack.pop();
  return result;
}

/**
 * Canonicalize an object value.
 *
 * @api private
 * @param {Object} value
 * @param {Array} stack
 * @return {Object}
 */
function canonicalizeObject (value, stack) {
  const result = {};
  stack.push(value);
  Object.keys(value).sort().forEach(function (key) {
    result[key] = exports.canonicalize(value[key], stack);
  });
  stack.pop();
  return result;
}

/**
 * Canonicalize a function value.
 *
 * @api private
 * @param {Function} value
 * @return {string|Object}
 */
function canonicalizeFunction (value) {
  for (const prop in value) {
    if (Object.prototype.hasOwnProperty.call(value, prop)) {
      return canonicalizeObject(value, []);
    }
  }
  return emptyRepresentation(value, 'function');
}

/**
 * Return a new Thing that has the keys in sorted order. Recursive.
 *
 * If the Thing...
 * - has already been seen, return string `'[Circular]'`
 * - is `undefined`, return string `'[undefined]'`
 * - is `null`, return value `null`
 * - is some other primitive, return the value
 * - is not a primitive or an `Array`, `Object`, or `Function`, return the value of the Thing's `toString()` method
 * - is a non-empty `Array`, `Object`, or `Function`, return the result of calling this function again.
 * - is an empty `Array`, `Object`, or `Function`, return the result of calling `emptyRepresentation()`
 *
 * @api private
 * @see {@link exports.stringify}
 * @param {*} value Thing to inspect.  May or may not have properties.
 * @param {Array} [stack=[]] Stack of seen values
 * @param {string} [typeHint] Type hint
 * @return {(Object|Array|Function|string|undefined)}
 */
exports.canonicalize = function canonicalize (value, stack, typeHint) {
  typeHint = typeHint || type(value);
  stack = stack || [];

  if (isCircular(value, stack)) {
    return '[Circular]';
  }

  switch (typeHint) {
    case 'undefined':
    case 'buffer':
    case 'null':
      return value;
    case 'array':
      return canonicalizeArray(value, stack);
    case 'function':
      return canonicalizeFunction(value);
    case 'object':
      return canonicalizeObject(value, stack);
    case 'date':
    case 'number':
    case 'regexp':
    case 'boolean':
    case 'symbol':
      return value;
    default:
      return value + '';
  }
};

/**
 * Check if path exists.
 *
 * @api private
 * @param {string} filePath
 * @return {boolean}
 */
function pathExists (filePath) {
  return exists(filePath);
}

/**
 * Try to add .js extension to path.
 *
 * @api private
 * @param {string} filePath
 * @return {string|null}
 */
function tryAddJsExtension (filePath) {
  if (exists(filePath + '.js')) {
    return filePath + '.js';
  }
  return null;
}

/**
 * Get files from glob pattern.
 *
 * @api private
 * @param {string} pattern
 * @return {Array}
 */
function getFilesFromGlob (pattern) {
  const files = glob.sync(pattern);
  if (!files.length) {
    throw new Error("cannot resolve path (or pattern) '" + pattern + "'");
  }
  return files;
}

/**
 * Process a single file entry.
 *
 * @api private
 * @param {string} filePath
 * @param {string[]} extensions
 * @param {boolean} recursive
 * @param {Array} files
 */
function processFileEntry (filePath, extensions, recursive, files) {
  try {
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      if (recursive) {
        const subFiles = exports.lookupFiles(filePath, extensions, recursive);
        files.push(...subFiles);
      }
      return;
    }

    const re = new RegExp('\\.(?:' + extensions.join('|') + ')$');
    if (stat.isFile() && re.test(filePath) && basename(filePath)[0] !== '.') {
      files.push(filePath);
    }
  } catch (err) {
    // ignore error
  }
}

/**
 * Lookup file names at the given `path`.
 *
 * @api public
 * @param {string} path Base path to start searching from.
 * @param {string[]} extensions File extensions to look for.
 * @param {boolean} recursive Whether or not to recurse into subdirectories.
 * @return {string[]} An array of paths.
 */
exports.lookupFiles = function lookupFiles (filePath, extensions, recursive) {
  const files = [];

  if (!pathExists(filePath)) {
    const jsPath = tryAddJsExtension(filePath);
    if (jsPath) {
      filePath = jsPath;
    } else {
      return getFilesFromGlob(filePath);
    }
  }

  try {
    const stat = statSync(filePath);
    if (stat.isFile()) {
      return filePath;
    }
  } catch (err) {
    return;
  }

  readdirSync(filePath).forEach(function (file) {
    const fullPath = join(filePath, file);
    processFileEntry(fullPath, extensions, recursive, files);
  });

  return files;
};

/**
 * Generate an undefined error with a message warning the user.
 *
 * @return {Error}
 */

exports.undefinedError = function () {
  return new Error('Caught undefined error, did you throw without specifying what?');
};

/**
 * Generate an undefined error if `err` is not defined.
 *
 * @param {Error} err
 * @return {Error}
 */

exports.getError = function (err) {
  return err || exports.undefinedError();
};

/**
 * Check if line is from Mocha internals.
 *
 * @api private
 * @param {string} line
 * @param {string} slash
 * @return {boolean}
 */
function isMochaInternal (line, slash) {
  return (~line.indexOf('node_modules' + slash + 'mocha' + slash)) ||
    (~line.indexOf('node_modules' + slash + 'mocha.js')) ||
    (~line.indexOf('bower_components' + slash + 'mocha.js')) ||
    (~line.indexOf(slash + 'mocha.js'));
}

/**
 * Check if line is from Node internals.
 *
 * @api private
 * @param {string} line
 * @return {boolean}
 */
function isNodeInternal (line) {
  return (~line.indexOf('(timers.js:')) ||
    (~line.indexOf('(events.js:')) ||
    (~line.indexOf('(node.js:')) ||
    (~line.indexOf('(module.js:')) ||
    (~line.indexOf('GeneratorFunctionPrototype.next (native)')) ||
    false;
}

/**
 * Clean up line path.
 *
 * @api private
 * @param {string} line
 * @param {string} cwd
 * @return {string}
 */
function cleanupLinePath (line, cwd) {
  if (/\(?.+:\d+:\d+\)?$/.test(line)) {
    return line.replace(cwd, '');
  }
  return line;
}

/**
 * @summary
 * This Filter based on `mocha-clean` module.(see: `github.com/rstacruz/mocha-clean`)
 * @description
 * When invoking this function you get a filter function that get the Error.stack as an input,
 * and return a prettify output.
 * (i.e: strip Mocha and internal node functions from stack trace).
 * @returns {Function}
 */
exports.stackTraceFilter = function () {
  const isNode = typeof document === 'undefined';
  const slash = isNode ? path.sep : '/';
  let cwd;

  if (isNode) {
    cwd = process.cwd() + slash;
  } else {
    const location = typeof window === 'undefined' ? global.location : window.location;
    cwd = location.href.replace(/\/[^/]*$/, '/');
  }

  return function (stack) {
    const lines = stack.split('\n');

    const filtered = lines.reduce(function (list, line) {
      if (isMochaInternal(line, slash)) {
        return list;
      }

      if (isNode && isNodeInternal(line)) {
        return list;
      }

      const cleanedLine = cleanupLinePath(line, cwd);
      list.push(cleanedLine);
      return list;
    }, []);

    return filtered.join('\n');
  };
};

/**
 * Crude, but effective.
 * @api
 * @param {*} value
 * @returns {boolean} Whether or not `value` is a Promise
 */
exports.isPromise = function isPromise (value) {
  return typeof value === 'object' && typeof value.then === 'function';
};

/**
 * It's a noop.
 * @api
 */
exports.noop = function () {};
```