```javascript
'use strict';

/* eslint-env browser */

/**
 * Module dependencies.
 */

const basename = require('path').basename;
const debug = require('debug')('mocha:watch');
const exists = require('fs').existsSync;
const glob = require('glob');
const path = require('path');
const join = path.join;
const readdirSync = require('fs').readdirSync;
const statSync = require('fs').statSync;
const watchFile = require('fs').watchFile;
const lstatSync = require('fs').lstatSync;
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
 * File lookup configuration object.
 * @typedef {Object} FileLookupConfig
 * @property {string[]} extensions - File extensions to match
 * @property {Array} accumulator - Accumulated file paths
 */

/**
 * Lookup files in the given `dir`.
 *
 * @api private
 * @param {string} dir
 * @param {FileLookupConfig} config
 * @return {Array}
 */
function filesWithConfig (dir, config) {
  const re = new RegExp('\\.(' + config.extensions.join('|') + ')$');

  readdirSync(dir)
    .filter(ignored)
    .forEach(function (filePath) {
      filePath = join(dir, filePath);
      if (lstatSync(filePath).isDirectory()) {
        filesWithConfig(filePath, config);
      } else if (filePath.match(re)) {
        config.accumulator.push(filePath);
      }
    });

  return config.accumulator;
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

  const config = {
    extensions: ext,
    accumulator: ret
  };

  return filesWithConfig(dir, config);
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
    // (traditional)->  space/name     parameters    body     (lambda)-> parameters       body   multi-statement/single          keep body content
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

    // Due to how the URLSearchParams API treats spaces
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
      // Based on the toJSON result
      return jsonStringify(json.data && json.type ? json.data : json, 2)
        .replace(/,(\n|$)/g, '$1');
    }

    // IE7/IE8 has a bizarre String constructor; needs to be coerced
    // into an array and back to obj.
    let processedValue = value;
    let processedTypeHint = typeHint;
    if (typeHint === 'string' && typeof value === 'object') {
      processedValue = value.split('').reduce(function (acc, char, idx) {
        acc[idx] = char;
        return acc;
      }, {});
      processedTypeHint = 'object';
    } else {
      return jsonStringify(processedValue);
    }
    value = processedValue;
  }

  for (const prop in value) {
    if (Object.prototype.hasOwnProperty.call(value, prop)) {
      return jsonStringify(exports.canonicalize(value, null, typeHint), 2).replace(/,(\n|$)/g, '$1');
    }
  }

  return emptyRepresentation(value, typeHint);
};

/**
 * JSON stringify configuration object.
 * @typedef {Object} JsonStringifyState
 * @property {number} depth - Current recursion depth
 * @property {number} spaces - Number of spaces per indent level
 * @property {string} space - Calculated space string
 * @property {string} str - Accumulated string
 * @property {string} end - Closing bracket
 * @property {number} length - Number of items to process
 */

/**
 * Helper to repeat a string n times.
 * @param {string} s - String to repeat
 * @param {number} n - Number of repetitions
 * @returns {string}
 */
function repeat (s, n) {
  return new Array(n).join(s);
}

/**
 * Stringify a single value based on its type.
 * @param {*} val - Value to stringify
 * @param {number} depth - Current depth
 * @param {number} spaces - Spaces per level
 * @returns {string}
 */
function stringifyValue (val, depth, spaces) {
  switch (type(val)) {
    case 'null':
    case 'undefined':
      return '[' + val + ']';
    case 'array':
    case 'object':
      return jsonStringify(val, spaces, depth + 1);
    case 'boolean':
    case 'regexp':
    case 'symbol':
    case 'number':
      return val === 0 && (1 / val) === -Infinity
        ? '-0'
        : val.toString();
    case 'date': {
      const sDate = isNaN(val.getTime()) ? val.toString() : val.toISOString();
      return '[Date: ' + sDate + ']';
    }
    case 'buffer': {
      let json = val.toJSON();
      json = json.data && json.type ? json.data : json;
      return '[Buffer: ' + jsonStringify(json, 2, depth + 1) + ']';
    }
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
    return stringifyValue(object, 1, 0);
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
    result += '\n ' + repeat(' ', space) +
      (Array.isArray(object) ? '' : '"' + i + '": ') +
      stringifyValue(object[i], depth, spaces) +
      (itemCount ? ',' : '');
  }

  return result +
    (result.length !== 1 ? '\n' + repeat(' ', --space) + end : end);
}

/**
 * Canonicalize context object.
 * @typedef {Object} CanonicalizeContext
 * @property {Array} stack - Stack of seen values
 * @property {string} typeHint - Type hint for the value
 */

/**
 * Helper to manage stack during canonicalization.
 * @param {*} value - Value to push to stack
 * @param {Array} stack - Stack reference
 * @param {Function} fn - Function to execute with value on stack
 */
function withStack (value, stack, fn) {
  stack.push(value);
  fn();
  stack.pop();
}

/**
 * Canonicalize a value recursively.
 * @param {*} value - Value to canonicalize
 * @param {CanonicalizeContext} context - Canonicalization context
 * @returns {*}
 */
function canonicalizeValue (value, context) {
  const stack = context.stack;
  const typeHint = context.typeHint;

  if (stack.indexOf(value) !== -1) {
    return '[Circular]';
  }

  let canonicalizedObj;

  switch (typeHint) {
    case 'undefined':
    case 'buffer':
    case 'null':
      canonicalizedObj = value;
      break;
    case 'array':
      withStack(value, stack, function () {
        canonicalizedObj = value.map(function (item) {
          return exports.canonicalize(item, stack);
        });
      });
      break;
    case 'function': {
      let hasProp = false;
      for (const prop in value) {
        canonicalizedObj = {};
        hasProp = true;
        break;
      }
      if (!hasProp) {
        canonicalizedObj = emptyRepresentation(value, typeHint);
        break;
      }
    }
    /* falls through */
    case 'object':
      canonicalizedObj = canonicalizedObj || {};
      withStack(value, stack, function () {
        Object.keys(value).sort().forEach(function (key) {
          canonicalizedObj[key] = exports.canonicalize(value[key], stack);
        });
      });
      break;
    case 'date':
    case 'number':
    case 'regexp':
    case 'boolean':
    case 'symbol':
      canonicalizedObj = value;
      break;
    default:
      canonicalizedObj = value + '';
  }

  return canonicalizedObj;
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

  const context = {
    stack: stack,
    typeHint: typeHint
  };

  return canonicalizeValue(value, context);
};

/**
 * Lookup file configuration object.
 * @typedef {Object} LookupFilesConfig
 * @property {string[]} extensions - File extensions to match
 * @property {boolean} recursive - Whether to recurse into subdirectories
 */

/**
 * Process directory for file lookup.
 * @param {string} dirPath - Directory path
 * @param {LookupFilesConfig} config - Lookup configuration
 * @param {Array} accumulator - Accumulated files
 */
function processDirectory (dirPath, config, accumulator) {
  readdirSync(dirPath).forEach(function (file) {
    const filePath = join(dirPath, file);
    let stat;
    try {
      stat = statSync(filePath);
      if (stat.isDirectory()) {
        if (config.recursive) {
          const subFiles = lookupFilesInternal(filePath, config);
          accumulator.push(...subFiles);
        }
        return;
      }
    } catch (err) {
      return;
    }
    const re = new RegExp('\\.(?:' + config.extensions.join('|') + ')$');
    if (!stat.isFile() || !re.test(filePath) || basename(filePath)[0] === '.') {
      return;
    }
    accumulator.push(filePath);
  });
}

/**
 * Internal lookup files implementation.
 * @param {string} dirPath - Directory path
 * @param {LookupFilesConfig} config - Lookup configuration
 * @returns {string[]}
 */
function lookupFilesInternal (dirPath, config) {
  const files = [];
  processDirectory(dirPath, config, files);
  return files;
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
exports.lookupFiles = function lookupFiles (path, extensions, recursive) {
  const files = [];

  if (!exists(path)) {
    if (exists(path + '.js')) {
      path += '.js';
    } else {
      const globFiles = glob.sync(path);
      if (!globFiles.length) {
        throw new Error("cannot resolve path (or pattern) '" + path + "'");
      }
      return globFiles;
    }
  }

  try {
    const stat = statSync(path);
    if (stat.isFile()) {
      return path;
    }
  } catch (err) {
    return;
  }

  const config = {
    extensions: extensions,
    recursive: recursive
  };

  processDirectory(path, config, files);
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
 * Stack trace filter context object.
 * @typedef {Object} StackTraceContext
 * @property {Object} environment - Environment detection (node/browser)
 * @property {string} slash - Path separator
 * @property {string} cwd - Current working directory
 */

/**
 * Check if line is from Mocha internals.
 * @param {string} line - Stack trace line
 * @param {string} slash - Path separator
 * @returns {boolean}
 */
function isMochaInternal (line, slash) {
  return (~line.indexOf('node_modules' + slash + 'mocha' + slash)) ||
    (~line.indexOf('node_modules' + slash + 'mocha.js')) ||
    (~line.indexOf('bower_components' + slash + 'mocha.js')) ||
    (~line.indexOf(slash + 'mocha.js'));
}

/**
 * Check if line is from Node internals.
 * @param {string} line - Stack trace line
 * @returns {boolean}
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
 * @summary
 * This Filter based on `mocha-clean` module.(see: `github.com/rstacruz/mocha-clean`)
 * @description
 * When invoking this function you get a filter function that get the Error.stack as an input,
 * and return a prettify output.
 * (i.e: strip Mocha and internal node functions from stack trace).
 * @returns {Function}
 */
exports.stackTraceFilter = function () {
  // TODO: Replace with `process.browser`
  const is = typeof document === 'undefined' ? { node: true } : { browser: true };
  let slash = path.sep;
  let cwd;
  if (is.node) {
    cwd = process.cwd() + slash;
  } else {
    cwd = (typeof location === 'undefined'
      ? window.location
      : location).href.replace(/\/[^/]*$/, '/');
    slash = '/';
  }

  return function (stack) {
    let lines = stack.split('\n');

    lines = lines.reduce(function (list, line) {
      if (isMochaInternal(line, slash)) {
        return list;
      }

      if (is.node && isNodeInternal(line)) {
        return list;
      }

      // Clean up cwd(absolute)
      if (/\(?.+:\d+:\d+\)?$/.test(line)) {
        line = line.replace(cwd, '');
      }

      list.push(line);
      return list;
    }, []);

    return lines.join('\n');
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