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
 * Serialize a value to a readable string.
 *
 * @api private
 * @param {*} value
 * @return {string}
 */
exports.stringify = function (value) {
  const typeHint = type(value);

  // Primitive or buffer handling
  if (!['object', 'array', 'function'].includes(typeHint)) {
    if (typeHint === 'buffer') {
      const json = Buffer.prototype.toJSON.call(value);
      return jsonStringify(json.data && json.type ? json.data : json, 2)
        .replace(/,(\n|$)/g, '$1');
    }

    // String objects (IE edge case)
    if (typeHint === 'string' && typeof value === 'object') {
      const obj = {};
      value.split('').forEach((char, idx) => {
        obj[idx] = char;
      });
      return jsonStringify(obj);
    }

    return jsonStringify(value);
  }

  // Objects, arrays, functions with properties
  if (hasOwnProperties(value)) {
    return jsonStringify(exports.canonicalize(value, null, typeHint), 2)
      .replace(/,(\n|$)/g, '$1');
  }

  // Empty structures
  return emptyRepresentation(value, typeHint);
};

/**
 * Check if an object has own enumerable properties.
 *
 * @param {*} obj
 * @returns {boolean}
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
  if (spaces === undefined) {
    return _primitiveStringify(object);
  }

  const currentDepth = depth || 1;
  const indentSize = spaces * currentDepth;
  const opening = Array.isArray(object) ? '[' : '{';
  const closing = Array.isArray(object) ? ']' : '}';
  const entries = Array.isArray(object) ? object : Object.keys(object);
  const total = entries.length;

  const repeat = (s, n) => new Array(n + 1).join(s);

  const _primitiveStringify = (val) => {
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

  let result = opening;
  let remaining = total;

  for (const key in object) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) continue;
    remaining--;
    const line = '\n ' + repeat(' ', indentSize) +
      (Array.isArray(object) ? '' : '"' + key + '": ') +
      _primitiveStringify(object[key]) +
      (remaining ? ',' : '');
    result += line;
  }

  return result + (result.length !== 1 ? '\n' + repeat(' ', indentSize - spaces) + closing : closing);
}

/**
 * Primitive fallback for jsonStringify.
 *
 * @param {*} value
 * @returns {string}
 */
function _primitiveStringify (value) {
  switch (type(value)) {
    case 'string':
      return JSON.stringify(value);
    case 'function':
      return '[Function]';
    default:
      return String(value);
  }
}

/**
 * Return a new object with sorted keys, handling circular references.
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
    const result = fn();
    currentStack.pop();
    return result;
  };

  switch (hint) {
    case 'undefined':
    case 'null':
    case 'buffer':
      return value;
    case 'array':
      return withStack(value, () => value.map(item => exports.canonicalize(item, currentStack)));
    case 'function':
      if (hasOwnProperties(value)) {
        const obj = {};
        return withStack(value, () => {
          Object.keys(value).sort().forEach(key => {
            obj[key] = exports.canonicalize(value[key], currentStack);
          });
          return obj;
        });
      }
      return emptyRepresentation(value, hint);
    case 'object':
      const resultObj = {};
      return withStack(value, () => {
        Object.keys(value).sort().forEach(key => {
          resultObj[key] = exports.canonicalize(value[key], currentStack);
        });
        return resultObj;
      });
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
 * Resolve a path to an array of matching files.
 *
 * @api private
 * @param {string} targetPath
 * @return {string[]}
 */
function resolvePath (targetPath) {
  if (exists(targetPath)) {
    try {
      const stat = statSync(targetPath);
      if (stat.isFile()) return [targetPath];
    } catch (_) {
      return [];
    }
    return [];
  }

  if (exists(targetPath + '.js')) {
    return [targetPath + '.js'];
  }

  const matched = glob.sync(targetPath);
  if (!matched.length) {
    throw new Error("cannot resolve path (or pattern) '" + targetPath + "'");
  }
  return matched;
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
exports.lookupFiles = function (basePath, extensions, recursive) {
  const files = [];

  const resolved = resolvePath(basePath);
  if (resolved.length) {
    return resolved[0];
  }

  try {
    const entries = readdirSync(basePath);
    entries.forEach(entry => {
      const fullPath = join(basePath, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          if (recursive) {
            files.push(...exports.lookupFiles(fullPath, extensions, recursive));
          }
          return;
        }
        const re = new RegExp('\\.(?:' + extensions.join('|') + ')$');
        if (!stat.isFile() || !re.test(fullPath) || basename(fullPath)[0] === '.') {
          return;
        }
        files.push(fullPath);
      } catch (_) {
        // ignore errors per original behavior
      }
    });
  } catch (_) {
    // ignore errors per original behavior
  }

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
 * Returns a stack trace filter that removes Mocha and Node internal frames.
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
exports.isPromise = function (value) {
  return typeof value === 'object' && typeof value.then === 'function';
};

/**
 * It's a noop.
 * @api
 */
exports.noop = function () {};