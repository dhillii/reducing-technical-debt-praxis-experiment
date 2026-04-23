'use strict';

/* eslint-env browser */

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
  files.forEach(file => {
    debug('file %s', file);
    watchFile(file, options, (curr, prev) => {
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
 * @param {string} p
 * @return {boolean}
 */
function ignored(p) {
  return !~ignore.indexOf(p);
}

/**
 * Lookup files in the given `dir`.
 *
 * @api private
 * @param {string} dir
 * @param {string[]} [ext=['js']]
 * @param {Array} [ret=[]]
 * @return {Array}
 */
exports.files = function (dir, ext, ret) {
  const result = ret || [];
  const extensions = ext || ['js'];
  const re = new RegExp('\\.(' + extensions.join('|') + ')$');

  readdirSync(dir)
    .filter(ignored)
    .forEach(p => {
      const fullPath = join(dir, p);
      if (lstatSync(fullPath).isDirectory()) {
        exports.files(fullPath, extensions, result);
      } else if (re.test(fullPath)) {
        result.push(fullPath);
      }
    });

  return result;
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
    .replace(
      /^function(?:\s*|\s+[^(]*)\([^)]*\)\s*\{((?:.|\n)*?)\s*\}$|^\([^)]*\)\s*=>\s*(?:\{((?:.|\n)*?)\s*\}|((?:.|\n)*))$/,
      '$1$2$3'
    );

  const spaces = (str.match(/^\n?( *)/)?.[1]?.length) ?? 0;
  const tabs = (str.match(/^\n?(\t*)/)?.[1]?.length) ?? 0;
  const re = new RegExp('^\\n?' + (tabs ? '\\t' : ' ') + '{' + (tabs || spaces) + '}', 'gm');

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
  return qs.replace('?', '').split('&').reduce((obj, pair) => {
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
function highlight(js) {
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
  for (let i = 0; i < code.length; ++i) {
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
function emptyRepresentation(value, typeHint) {
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
 * Serialize a value to a string.
 *
 * @api private
 * @param {*} value
 * @return {string}
 */
exports.stringify = function (value) {
  return _stringifyValue(value);
};

/**
 * Core implementation of stringify handling all type branches.
 *
 * @param {*} value
 * @returns {string}
 */
function _stringifyValue(value) {
  const typeHint = type(value);

  if (!['object', 'array', 'function'].includes(typeHint)) {
    if (typeHint === 'buffer') {
      const json = Buffer.prototype.toJSON.call(value);
      return jsonStringify(json.data && json.type ? json.data : json, 2)
        .replace(/,(\n|$)/g, '$1');
    }

    if (typeHint === 'string' && typeof value === 'object') {
      const coerced = value.split('').reduce((acc, char, idx) => {
        acc[idx] = char;
        return acc;
      }, {});
      return _stringifyValue(coerced);
    }

    return jsonStringify(value);
  }

  if (hasOwnProperties(value)) {
    return jsonStringify(canonicalize(value, [], typeHint), 2)
      .replace(/,(\n|$)/g, '$1');
  }

  return emptyRepresentation(value, typeHint);
}

/**
 * Check whether an object has own enumerable properties.
 *
 * @param {Object} obj
 * @returns {boolean}
 */
function hasOwnProperties(obj) {
  for (const prop in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, prop)) {
      return true;
    }
  }
  return false;
}

/**
 * JSON stringify with custom formatting.
 *
 * @api private
 * @param {Object} object
 * @param {number=} spaces
 * @param {number=} depth
 * @returns {*}
 */
function jsonStringify(object, spaces, depth) {
  if (spaces === undefined) {
    return _primitiveStringify(object);
  }

  const currentDepth = depth || 1;
  const indentSize = spaces * currentDepth;
  const opening = Array.isArray(object) ? '[' : '{';
  const closing = Array.isArray(object) ? ']' : '}';
  const totalKeys = typeof object.length === 'number' ? object.length : Object.keys(object).length;

  const repeat = (s, n) => new Array(n).join(s);

  const formatted = Object.keys(object).reduce((acc, key) => {
    if (!Object.prototype.hasOwnProperty.call(object, key)) return acc;
    const valueStr = _formatValue(object[key], spaces, currentDepth + 1);
    const line = `\n ${repeat(' ', indentSize)}${Array.isArray(object) ? '' : '"' + key + '": '}${valueStr}`;
    return acc + line + (acc.remaining-- ? ',' : '');
  }, { result: opening, remaining: totalKeys });

  const finalStr = formatted.result + (formatted.result.length !== 1 ? `\n${repeat(' ', indentSize - spaces)}${closing}` : closing);
  return finalStr;
}

/**
 * Primitive JSON stringify fallback.
 *
 * @param {*} val
 * @returns {string}
 */
function _primitiveStringify(val) {
  return JSON.stringify(val);
}

/**
 * Format a value according to its type for jsonStringify.
 *
 * @param {*} val
 * @param {number} spaces
 * @param {number} depth
 * @returns {string}
 */
function _formatValue(val, spaces, depth) {
  const valType = type(val);
  switch (valType) {
    case 'null':
    case 'undefined':
      return '[' + valType + ']';
    case 'array':
    case 'object':
      return jsonStringify(val, spaces, depth);
    case 'boolean':
    case 'regexp':
    case 'symbol':
    case 'number':
      return (val === 0 && (1 / val) === -Infinity) ? '-0' : val.toString();
    case 'date':
      const dateStr = isNaN(val.getTime()) ? val.toString() : val.toISOString();
      return '[Date: ' + dateStr + ']';
    case 'buffer':
      const json = val.toJSON();
      const data = json.data && json.type ? json.data : json;
      return '[Buffer: ' + jsonStringify(data, 2, depth) + ']';
    default:
      return (val === '[Function]' || val === '[Circular]') ? val : JSON.stringify(val);
  }
}

/**
 * Return a new object with sorted keys and canonical representation.
 *
 * @api private
 * @param {*} value
 * @param {Array} [stack=[]]
 * @param {string} [typeHint]
 * @return {(Object|Array|Function|string|undefined)}
 */
exports.canonicalize = function (value, stack = [], typeHint) {
  const hint = typeHint || type(value);
  if (stack.includes(value)) {
    return '[Circular]';
  }

  switch (hint) {
    case 'undefined':
    case 'null':
    case 'buffer':
      return value;
    case 'array':
      return _canonicalizeArray(value, stack);
    case 'function':
      return _canonicalizeFunction(value, stack);
    case 'object':
      return _canonicalizeObject(value, stack);
    case 'date':
    case 'number':
    case 'regexp':
    case 'boolean':
    case 'symbol':
      return value;
    default:
      return String(value);
  }
};

/**
 * Canonicalize an array.
 *
 * @param {Array} arr
 * @param {Array} stack
 * @returns {Array}
 */
function _canonicalizeArray(arr, stack) {
  stack.push(arr);
  const result = arr.map(item => exports.canonicalize(item, stack));
  stack.pop();
  return result;
}

/**
 * Canonicalize a function (its enumerable properties).
 *
 * @param {Function} fn
 * @param {Array} stack
 * @returns {Object|string}
 */
function _canonicalizeFunction(fn, stack) {
  const hasProps = hasOwnProperties(fn);
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
 * Canonicalize a plain object.
 *
 * @param {Object} obj
 * @param {Array} stack
 * @returns {Object}
 */
function _canonicalizeObject(obj, stack) {
  const result = {};
  stack.push(obj);
  Object.keys(obj).sort().forEach(key => {
    result[key] = exports.canonicalize(obj[key], stack);
  });
  stack.pop();
  return result;
}

/**
 * Lookup file names at the given `path`.
 *
 * @api public
 * @param {string} basePath
 * @param {string[]} extensions
 * @param {boolean} recursive
 * @return {string[]}
 */
exports.lookupFiles = function (basePath, extensions, recursive) {
  if (!exists(basePath)) {
    return _resolveNonExistingPath(basePath);
  }

  const stat = _safeStatSync(basePath);
  if (stat && stat.isFile()) {
    return basePath;
  }

  return _traverseDirectory(basePath, extensions, recursive);
};

/**
 * Resolve a path that does not exist on disk.
 *
 * @param {string} p
 * @returns {string[]}
 */
function _resolveNonExistingPath(p) {
  if (exists(p + '.js')) {
    return p + '.js';
  }
  const files = glob.sync(p);
  if (!files.length) {
    throw new Error("cannot resolve path (or pattern) '" + p + "'");
  }
  return files;
}

/**
 * Safely get file stats, ignoring errors.
 *
 * @param {string} p
 * @returns {fs.Stats|undefined}
 */
function _safeStatSync(p) {
  try {
    return statSync(p);
  } catch (_) {
    return undefined;
  }
}

/**
 * Recursively collect files matching extensions.
 *
 * @param {string} dir
 * @param {string[]} extensions
 * @param {boolean} recursive
 * @returns {string[]}
 */
function _traverseDirectory(dir, extensions, recursive) {
  const collected = [];
  readdirSync(dir).forEach(entry => {
    const fullPath = join(dir, entry);
    const stat = _safeStatSync(fullPath);
    if (!stat) return;

    if (stat.isDirectory()) {
      if (recursive) {
        collected.push(...exports.lookupFiles(fullPath, extensions, recursive));
      }
      return;
    }

    const re = new RegExp('\\.(?:' + extensions.join('|') + ')$');
    if (!stat.isFile() || !re.test(fullPath) || basename(fullPath)[0] === '.') {
      return;
    }
    collected.push(fullPath);
  });
  return collected;
}

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
 * Returns a stack trace filter function that removes internal Mocha and Node frames.
 *
 * @returns {Function}
 */
exports.stackTraceFilter = function () {
  const isNode = typeof document === 'undefined';
  const slash = path.sep;
  const cwd = isNode ? process.cwd() + slash : (typeof location === 'undefined' ? window.location : location).href.replace(/\/[^/]*$/, '/') + '/';

  function isMochaInternal(line) {
    return line.includes('node_modules' + slash + 'mocha' + slash) ||
      line.includes('node_modules' + slash + 'mocha.js') ||
      line.includes('bower_components' + slash + 'mocha.js') ||
      line.includes(slash + 'mocha.js');
  }

  function isNodeInternal(line) {
    return line.includes('(timers.js:') ||
      line.includes('(events.js:') ||
      line.includes('(node.js:') ||
      line.includes('(module.js:') ||
      line.includes('GeneratorFunctionPrototype.next (native)');
  }

  return function (stack) {
    return stack
      .split('\n')
      .filter(line => {
        if (isMochaInternal(line)) return false;
        if (isNode && isNodeInternal(line)) return false;
        if (/\(?.+:\d+:\d+\)?$/.test(line)) {
          line = line.replace(cwd, '');
        }
        return true;
      })
      .join('\n');
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