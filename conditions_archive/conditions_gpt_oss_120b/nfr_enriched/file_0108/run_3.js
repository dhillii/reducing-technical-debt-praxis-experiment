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
  const result = ret || [];
  const extensions = ext || ['js'];
  const re = new RegExp('\\.(' + extensions.join('|') + ')$');

  readdirSync(dir)
    .filter(ignored)
    .forEach(function (filePath) {
      const fullPath = join(dir, filePath);
      if (lstatSync(fullPath).isDirectory()) {
        exports.files(fullPath, extensions, result);
      } else if (fullPath.match(re)) {
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
  const normalized = str
    .replace(/\r\n?|[\n\u2028\u2029]/g, '\n')
    .replace(/^\uFEFF/, '')
    .replace(/^function(?:\s*|\s+[^(]*)\([^)]*\)\s*\{((?:.|\n)*?)\s*\}$|^\([^)]*\)\s*=>\s*(?:\{((?:.|\n)*?)\s*\}|((?:.|\n)*))$/, '$1$2$3');

  const spaces = normalized.match(/^\n?( *)/)[1].length;
  const tabs = normalized.match(/^\n?(\t*)/)[1].length;
  const indentRe = new RegExp('^\n?' + (tabs ? '\t' : ' ') + '{' + (tabs || spaces) + '}', 'gm');

  const deindented = normalized.replace(indentRe, '');

  return deindented.trim();
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
  const codeElements = document.getElementById('mocha').getElementsByTagName(name);
  for (let i = 0, len = codeElements.length; i < len; ++i) {
    codeElements[i].innerHTML = highlight(codeElements[i].innerHTML);
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
 * Determine the internal [[Class]] of a value.
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
  const typeHint = type(value);

  if (!~['object', 'array', 'function'].indexOf(typeHint)) {
    return handlePrimitiveStringify(value, typeHint);
  }

  if (hasOwnProperties(value)) {
    return jsonStringify(exports.canonicalize(value, null, typeHint), 2).replace(/,(\n|$)/g, '$1');
  }

  return emptyRepresentation(value, typeHint);
};

/**
 * Handle primitive (non‑object) values for stringify().
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
 * Check whether an object has own enumerable properties.
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
 * JSON.stringify replacement with indentation control.
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

  const currentDepth = depth || 1;
  const indentSize = spaces * currentDepth;
  const opening = Array.isArray(object) ? '[' : '{';
  const closing = Array.isArray(object) ? ']' : '}';
  const totalKeys = typeof object.length === 'number' ? object.length : Object.keys(object).length;

  const repeat = (s, n) => new Array(n).join(s);

  const _stringify = (val) => {
    switch (type(val)) {
      case 'null':
      case 'undefined':
        return '[' + val + ']';
      case 'array':
      case 'object':
        return jsonStringify(val, spaces, currentDepth + 1);
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
        return '[Buffer: ' + jsonStringify(data, 2, currentDepth + 1) + ']';
      default:
        return (val === '[Function]' || val === '[Circular]') ? val : JSON.stringify(val);
    }
  };

  let remaining = totalKeys;
  let result = opening;

  for (const key in object) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) continue;
    remaining--;
    result += '\n ' + repeat(' ', indentSize) +
      (Array.isArray(object) ? '' : '"' + key + '": ') +
      _stringify(object[key]) +
      (remaining ? ',' : '');
  }

  return result + (result.length !== 1 ? '\n' + repeat(' ', indentSize - spaces) + closing : closing);
}

/**
 * Primitive fallback for jsonStringify.
 *
 * @param {*} value
 * @return {string}
 */
function _primitiveStringify (value) {
  return JSON.stringify(value);
}

/**
 * Return a new object with sorted keys and circular‑reference handling.
 *
 * @api private
 * @param {*} value
 * @param {Array} [stack=[]]
 * @param {string} [typeHint]
 * @return {(Object|Array|Function|string|undefined)}
 */
exports.canonicalize = function (value, stack, typeHint) {
  const hint = typeHint || type(value);
  const currentStack = stack || [];

  if (currentStack.includes(value)) {
    return '[Circular]';
  }

  const withStack = (val, fn) => {
    currentStack.push(val);
    fn();
    currentStack.pop();
  };

  switch (hint) {
    case 'undefined':
    case 'buffer':
    case 'null':
      return value;
    case 'array':
      let arrayResult;
      withStack(value, () => {
        arrayResult = value.map(item => exports.canonicalize(item, currentStack));
      });
      return arrayResult;
    case 'function':
      if (hasOwnProperties(value)) {
        const funcObj = {};
        withStack(value, () => {
          Object.keys(value).sort().forEach(key => {
            funcObj[key] = exports.canonicalize(value[key], currentStack);
          });
        });
        return funcObj;
      }
      return emptyRepresentation(value, hint);
    case 'object':
      const objResult = {};
      withStack(value, () => {
        Object.keys(value).sort().forEach(key => {
          objResult[key] = exports.canonicalize(value[key], currentStack);
        });
      });
      return objResult;
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
 * Lookup file names at the given `path`.
 *
 * @api public
 * @param {string} basePath
 * @param {string[]} extensions
 * @param {boolean} recursive
 * @return {string[]}
 */
exports.lookupFiles = function lookupFiles (basePath, extensions, recursive) {
  const collected = [];

  if (!exists(basePath)) {
    return resolveNonExistingPath(basePath);
  }

  const stat = safeStatSync(basePath);
  if (stat && stat.isFile()) {
    return basePath;
  }

  readdirSync(basePath).forEach(file => {
    const fullPath = join(basePath, file);
    const fileStat = safeStatSync(fullPath);
    if (!fileStat) return;

    if (fileStat.isDirectory()) {
      if (recursive) {
        collected.push(...lookupFiles(fullPath, extensions, recursive));
      }
      return;
    }

    if (shouldIncludeFile(fullPath, fileStat, extensions)) {
      collected.push(fullPath);
    }
  });

  return collected;
};

/**
 * Resolve a path that does not exist on disk.
 *
 * @param {string} p
 * @return {string[]}
 */
function resolveNonExistingPath (p) {
  if (exists(p + '.js')) {
    return p + '.js';
  }
  const matches = glob.sync(p);
  if (!matches.length) {
    throw new Error("cannot resolve path (or pattern) '" + p + "'");
  }
  return matches;
}

/**
 * Safely obtain file stats, swallowing errors.
 *
 * @param {string} p
 * @return {fs.Stats|undefined}
 */
function safeStatSync (p) {
  try {
    return statSync(p);
  } catch (_) {
    return undefined;
  }
}

/**
 * Determine whether a file should be included in results.
 *
 * @param {string} filePath
 * @param {fs.Stats} stat
 * @param {string[]} extensions
 * @return {boolean}
 */
function shouldIncludeFile (filePath, stat, extensions) {
  const extRe = new RegExp('\\.(?:' + extensions.join('|') + ')$');
  return stat.isFile() && extRe.test(filePath) && basename(filePath)[0] !== '.';
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
 * Returns a stack‑trace filter function that removes Mocha and Node internal frames.
 *
 * @returns {Function}
 */
exports.stackTraceFilter = function () {
  const isNode = typeof document === 'undefined';
  const slash = path.sep;
  const cwd = isNode ? process.cwd() + slash : (typeof location === 'undefined' ? window.location : location).href.replace(/\/[^/]*$/, '/') + '/';

  /**
   * Detect Mocha internal stack lines.
   *
   * @param {string} line
   * @return {boolean}
   */
  function isMochaInternal (line) {
    return (~line.indexOf('node_modules' + slash + 'mocha' + slash)) ||
      (~line.indexOf('node_modules' + slash + 'mocha.js')) ||
      (~line.indexOf('bower_components' + slash + 'mocha.js')) ||
      (~line.indexOf(slash + 'mocha.js'));
  }

  /**
   * Detect Node internal stack lines.
   *
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

  return function (stack) {
    const lines = stack.split('\n');
    const filtered = lines.reduce((list, line) => {
      if (isMochaInternal(line)) return list;
      if (isNode && isNodeInternal(line)) return list;
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
exports.isPromise = function isPromise (value) {
  return typeof value === 'object' && typeof value.then === 'function';
};

/**
 * It's a noop.
 * @api
 */
exports.noop = function () {};