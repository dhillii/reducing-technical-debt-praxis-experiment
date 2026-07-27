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
    .forEach(function (p) {
      const fullPath = join(dir, p);
      if (lstatSync(fullPath).isDirectory()) {
        exports.files(fullPath, ext, ret);
      } else if (fullPath.match(re)) {
        ret.push(fullPath);
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
    .replace(/\r\n?|[\n\u2028\u2029]/g, '\n')
    .replace(/^\uFEFF/, '')
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
    const val = pair.slice(i + 1);
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
 * Return a string representation for empty values.
 *
 * @api private
 * @param {*} value
 * @param {string} typeHint
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
 * Determine the internal type of a value.
 *
 * @api private
 * @param {*} value
 * @returns {string}
 */
const type = exports.type = function (value) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Buffer.isBuffer(value)) return 'buffer';
  return Object.prototype.toString.call(value)
    .replace(/^\[.+\s(.+?)]$/, '$1')
    .toLowerCase();
};

/**
 * Serialize a value to a string representation.
 *
 * @api private
 * @param {*} value
 * @return {string}
 */
exports.stringify = function (value) {
  const typeHint = type(value);

  if (!['object', 'array', 'function'].includes(typeHint)) {
    return handlePrimitiveStringify(value, typeHint);
  }

  if (hasOwnProperties(value)) {
    return jsonStringify(exports.canonicalize(value, null, typeHint), 2).replace(/,(\n|$)/g, '$1');
  }

  return emptyRepresentation(value, typeHint);
};

/**
 * Handle primitive, buffer, and string-object cases for stringify.
 *
 * @param {*} value
 * @param {string} typeHint
 * @return {string}
 */
function handlePrimitiveStringify (value, typeHint) {
  if (typeHint === 'buffer') {
    const json = Buffer.prototype.toJSON.call(value);
    return jsonStringify(json.data && json.type ? json.data : json, 2)
      .replace(/,(\n|$)/g, '$1');
  }

  if (typeHint === 'string' && typeof value === 'object') {
    const obj = value.split('').reduce((acc, char, idx) => {
      acc[idx] = char;
      return acc;
    }, {});
    return jsonStringify(exports.canonicalize(obj, null, 'object'), 2).replace(/,(\n|$)/g, '$1');
  }

  return jsonStringify(value);
}

/**
 * Determine if an object has own enumerable properties.
 *
 * @param {Object} obj
 * @return {boolean}
 */
function hasOwnProperties (obj) {
  for (const prop in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, prop)) {
      return true;
    }
  }
  return false;
}

/**
 * JSON stringify with pretty printing and custom handling.
 *
 * @api private
 * @param {Object} object
 * @param {number=} spaces
 * @param {number=} depth
 * @returns {*}
 */
function jsonStringify (object, spaces, depth) {
  if (typeof spaces === 'undefined') {
    return _primitiveStringify(object);
  }

  depth = depth || 1;
  const indent = spaces * depth;
  const opening = Array.isArray(object) ? '[' : '{';
  const closing = Array.isArray(object) ? ']' : '}';
  const totalKeys = typeof object.length === 'number' ? object.length : Object.keys(object).length;

  const repeat = (s, n) => new Array(n).join(s);

  const _primitiveStringify = (val) => {
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
        return (val === 0 && (1 / val) === -Infinity) ? '-0' : val.toString();
      case 'date':
        const sDate = isNaN(val.getTime()) ? val.toString() : val.toISOString();
        return '[Date: ' + sDate + ']';
      case 'buffer':
        const json = val.toJSON();
        const data = json.data && json.type ? json.data : json;
        return '[Buffer: ' + jsonStringify(data, 2, depth + 1) + ']';
      default:
        return (val === '[Function]' || val === '[Circular]') ? val : JSON.stringify(val);
    }
  };

  let remaining = totalKeys;
  let result = opening;

  for (const key in object) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) continue;
    remaining--;
    result += '\n ' + repeat(' ', indent) +
      (Array.isArray(object) ? '' : '"' + key + '": ') +
      _primitiveStringify(object[key]) +
      (remaining ? ',' : '');
  }

  return result + (result.length !== 1 ? '\n' + repeat(' ', indent - spaces) + closing : closing);
}

/**
 * Canonicalize a value by sorting keys and handling circular references.
 *
 * @api private
 * @param {*} value
 * @param {Array} [stack=[]]
 * @param {string} [typeHint]
 * @return {(Object|Array|Function|string|undefined)}
 */
exports.canonicalize = function (value, stack, typeHint) {
  typeHint = typeHint || type(value);
  stack = stack || [];

  if (stack.includes(value)) {
    return '[Circular]';
  }

  const handlers = {
    undefined: () => value,
    buffer: () => value,
    null: () => value,
    array: () => handleArray(value, stack),
    function: () => handleFunction(value, stack),
    object: () => handleObject(value, stack),
    date: () => value,
    number: () => value,
    regexp: () => value,
    boolean: () => value,
    symbol: () => value,
    default: () => value + ''
  };

  const handler = handlers[typeHint] || handlers.default;
  return handler();
};

/**
 * Handle array canonicalization.
 *
 * @param {Array} arr
 * @param {Array} stack
 * @return {Array}
 */
function handleArray (arr, stack) {
  stack.push(arr);
  const result = arr.map(item => exports.canonicalize(item, stack));
  stack.pop();
  return result;
}

/**
 * Handle function canonicalization.
 *
 * @param {Function} fn
 * @param {Array} stack
 * @return {Object|string}
 */
function handleFunction (fn, stack) {
  const hasProps = Object.keys(fn).length > 0;
  if (!hasProps) {
    return emptyRepresentation(fn, 'function');
  }
  const obj = {};
  stack.push(fn);
  Object.keys(fn).sort().forEach(key => {
    obj[key] = exports.canonicalize(fn[key], stack);
  });
  stack.pop();
  return obj;
}

/**
 * Handle object canonicalization.
 *
 * @param {Object} obj
 * @param {Array} stack
 * @return {Object}
 */
function handleObject (obj, stack) {
  const result = {};
  stack.push(obj);
  Object.keys(obj).sort().forEach(key => {
    result[key] = exports.canonicalize(obj[key], stack);
  });
  stack.pop();
  return result;
}

/**
 * Resolve a path to an array of matching files.
 *
 * @api private
 * @param {string} basePath
 * @param {string[]} extensions
 * @param {boolean} recursive
 * @return {string[]}
 */
function resolvePath (basePath, extensions, recursive) {
  const files = [];

  if (!exists(basePath)) {
    if (exists(basePath + '.js')) {
      basePath += '.js';
    } else {
      const matched = glob.sync(basePath);
      if (!matched.length) {
        throw new Error("cannot resolve path (or pattern) '" + basePath + "'");
      }
      return matched;
    }
  }

  try {
    const stat = statSync(basePath);
    if (stat.isFile()) {
      return [basePath];
    }
  } catch {
    return [];
  }

  readdirSync(basePath).forEach(entry => {
    const full = join(basePath, entry);
    try {
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (recursive) {
          files.push(...resolvePath(full, extensions, recursive));
        }
        return;
      }
      const re = new RegExp('\\.(?:' + extensions.join('|') + ')$');
      if (stat.isFile() && re.test(full) && basename(full)[0] !== '.') {
        files.push(full);
      }
    } catch {
      // ignore errors
    }
  });

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
exports.lookupFiles = function (path, extensions, recursive) {
  return resolvePath(path, extensions, recursive);
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
 * Returns a stack trace filter function.
 *
 * @returns {Function}
 */
exports.stackTraceFilter = function () {
  const is = typeof document === 'undefined' ? { node: true } : { browser: true };
  let slash = path.sep;
  let cwd;

  if (is.node) {
    cwd = process.cwd() + slash;
  } else {
    cwd = (typeof location === 'undefined' ? window.location : location).href.replace(/\/[^/]*$/, '/');
    slash = '/';
  }

  function isMochaInternal (line) {
    return (~line.indexOf('node_modules' + slash + 'mocha' + slash)) ||
      (~line.indexOf('node_modules' + slash + 'mocha.js')) ||
      (~line.indexOf('bower_components' + slash + 'mocha.js')) ||
      (~line.indexOf(slash + 'mocha.js'));
  }

  function isNodeInternal (line) {
    return (~line.indexOf('(timers.js:')) ||
      (~line.indexOf('(events.js:')) ||
      (~line.indexOf('(node.js:')) ||
      (~line.indexOf('(module.js:')) ||
      (~line.indexOf('GeneratorFunctionPrototype.next (native)')) ||
      false;
  }

  return function (stack) {
    const lines = stack.split('\n');
    const filtered = lines.reduce((list, line) => {
      if (isMochaInternal(line)) return list;
      if (is.node && isNodeInternal(line)) return list;
      if (/\(?.+:\d+:\d+\)?$/.test(line)) {
        line = line.replace(cwd, '');
      }
      list.push(line);
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
exports.isPromise = function (value) {
  return typeof value === 'object' && typeof value.then === 'function';
};

/**
 * It's a noop.
 * @api
 */
exports.noop = function () {};