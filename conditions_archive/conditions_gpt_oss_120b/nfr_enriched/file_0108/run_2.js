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
    .forEach(entry => {
      const fullPath = join(dir, entry);
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
  const indentRe = new RegExp('^\n?' + (tabs ? '\t' : ' ') + '{' + (tabs || spaces) + '}', 'gm');

  str = str.replace(indentRe, '');

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
  for (let i = 0; i < codeElements.length; ++i) {
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
 * Handle primitive (non-object) values for stringify.
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
 * Check if an object has own enumerable properties.
 *
 * @param {*} obj
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
 * JSON stringify with pretty printing.
 *
 * @api private
 * @param {Object} object
 * @param {number=} spaces
 * @param {number=} depth
 * @returns {string}
 */
function jsonStringify (object, spaces, depth) {
  if (spaces === undefined) {
    return primitiveStringify(object);
  }

  const currentDepth = depth || 1;
  const indentSize = spaces * currentDepth;
  const isArray = Array.isArray(object);
  const opening = isArray ? '[' : '{';
  const closing = isArray ? ']' : '}';
  const entries = isArray ? object : Object.keys(object);
  const total = entries.length;

  const repeat = (s, n) => new Array(n + 1).join(s);

  const stringifyValue = val => {
    const valType = type(val);
    switch (valType) {
      case 'null':
      case 'undefined':
        return '[' + valType + ']';
      case 'array':
      case 'object':
        return jsonStringify(val, spaces, currentDepth + 1);
      case 'boolean':
      case 'regexp':
      case 'symbol':
      case 'number':
        return (val === 0 && (1 / val) === -Infinity) ? '-0' : val.toString();
      case 'date':
        const dateStr = isNaN(val.getTime()) ? val.toString() : val.toISOString();
        return '[Date: ' + dateStr + ']';
      case 'buffer':
        const bufJson = val.toJSON();
        const bufData = bufJson.data && bufJson.type ? bufJson.data : bufJson;
        return '[Buffer: ' + jsonStringify(bufData, 2, currentDepth + 1) + ']';
      default:
        return (val === '[Function]' || val === '[Circular]') ? val : JSON.stringify(val);
    }
  };

  let result = opening;
  let remaining = total;

  if (isArray) {
    object.forEach(item => {
      remaining--;
      result += '\n ' + repeat(' ', indentSize) + stringifyValue(item) + (remaining ? ',' : '');
    });
  } else {
    Object.keys(object).sort().forEach(key => {
      remaining--;
      result += '\n ' + repeat(' ', indentSize) + '"' + key + '": ' + stringifyValue(object[key]) + (remaining ? ',' : '');
    });
  }

  return result + (result.length !== 1 ? '\n' + repeat(' ', indentSize - spaces) + closing : closing);
}

/**
 * Primitive JSON stringify fallback.
 *
 * @param {*} value
 * @return {string}
 */
function primitiveStringify (value) {
  return JSON.stringify(value);
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
exports.canonicalize = function (value, stack = [], typeHint) {
  const hint = typeHint || type(value);

  if (stack.includes(value)) {
    return '[Circular]';
  }

  const withStack = (val, fn) => {
    stack.push(val);
    const result = fn();
    stack.pop();
    return result;
  };

  switch (hint) {
    case 'undefined':
    case 'null':
    case 'buffer':
      return value;
    case 'array':
      return withStack(value, () => value.map(item => exports.canonicalize(item, stack)));
    case 'function':
      return handleFunctionCanonicalization(value, stack);
    case 'object':
      return handleObjectCanonicalization(value, stack);
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
 * Handle canonicalization for functions.
 *
 * @param {Function} fn
 * @param {Array} stack
 * @return {Object|string}
 */
function handleFunctionCanonicalization (fn, stack) {
  const hasProps = Object.keys(fn).length > 0;
  if (!hasProps) {
    return emptyRepresentation(fn, 'function');
  }
  const result = {};
  return exports.canonicalize(result, stack);
}

/**
 * Handle canonicalization for objects.
 *
 * @param {Object} obj
 * @param {Array} stack
 * @return {Object}
 */
function handleObjectCanonicalization (obj, stack) {
  const result = {};
  return withStackHelper(obj, stack, () => {
    Object.keys(obj).sort().forEach(key => {
      result[key] = exports.canonicalize(obj[key], stack);
    });
    return result;
  });
}

/**
 * Helper to execute a function with stack push/pop.
 *
 * @param {*} value
 * @param {Array} stack
 * @param {Function} fn
 * @return {*}
 */
function withStackHelper (value, stack, fn) {
  stack.push(value);
  const res = fn();
  stack.pop();
  return res;
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
    return resolveNonExistingPath(basePath);
  }

  const stat = safeStatSync(basePath);
  if (stat && stat.isFile()) {
    return basePath;
  }

  return collectFiles(basePath, extensions, recursive);
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
 * Recursively collect files matching extensions.
 *
 * @param {string} dir
 * @param {string[]} extensions
 * @param {boolean} recursive
 * @return {string[]}
 */
function collectFiles (dir, extensions, recursive) {
  const files = [];
  readdirSync(dir).forEach(entry => {
    const fullPath = join(dir, entry);
    const stat = safeStatSync(fullPath);
    if (!stat) return;

    if (stat.isDirectory()) {
      if (recursive) {
        files.push(...exports.lookupFiles(fullPath, extensions, recursive));
      }
      return;
    }

    const extRe = new RegExp('\\.(?:' + extensions.join('|') + ')$');
    if (stat.isFile() && extRe.test(fullPath) && basename(fullPath)[0] !== '.') {
      files.push(fullPath);
    }
  });
  return files;
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
 * Returns a stack trace filter function.
 *
 * @returns {Function}
 */
exports.stackTraceFilter = function () {
  const isNode = typeof document === 'undefined';
  const slash = path.sep;
  const cwd = isNode ? process.cwd() + slash : (typeof location === 'undefined' ? window.location : location).href.replace(/\/[^/]*$/, '/') + '/';

  const isMochaInternal = line => (
    line.includes('node_modules' + slash + 'mocha' + slash) ||
    line.includes('node_modules' + slash + 'mocha.js') ||
    line.includes('bower_components' + slash + 'mocha.js') ||
    line.includes(slash + 'mocha.js')
  );

  const isNodeInternal = line => (
    line.includes('(timers.js:') ||
    line.includes('(events.js:') ||
    line.includes('(node.js:') ||
    line.includes('(module.js:') ||
    line.includes('GeneratorFunctionPrototype.next (native)')
  );

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