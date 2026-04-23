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
  files.forEach((file) => {
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
 * @param {string[]} [ext=['.js']]
 * @param {Array} [ret=[]]
 * @return {Array}
 */
exports.files = function (dir, ext, ret) {
  ret = ret || [];
  ext = ext || ['js'];

  const re = new RegExp(`\\.(${ext.join('|')})$`);

  readdirSync(dir)
    .filter(ignored)
    .forEach((p) => {
      const full = join(dir, p);
      if (lstatSync(full).isDirectory()) {
        exports.files(full, ext, ret);
      } else if (full.match(re)) {
        ret.push(full);
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
    .replace(
      /^function(?:\s*|\s+[^(]*)\([^)]*\)\s*\{((?:.|\n)*?)\s*\}$|^\([^)]*\)\s*=>\s*(?:\{((?:.|\n)*?)\s*\}|((?:.|\n)*))$/,
      '$1$2$3'
    );

  const spaces = str.match(/^\n?( *)/)[1].length;
  const tabs = str.match(/^\n?(\t*)/)[1].length;
  const re = new RegExp(`^\\n?${tabs ? '\\t' : ' '}{${tabs || spaces}}`, 'gm');

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
  return qs
    .replace('?', '')
    .split('&')
    .reduce((obj, pair) => {
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
 * Takes some variable and asks `Object.prototype.toString()` what it thinks it
 * is.
 *
 * @api private
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/toString
 * @param {*} value The value to test.
 * @returns {string} Computed type
 */
var type = exports.type = function type(value) {
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

  // Primitive or non-object types
  if (!['object', 'array', 'function'].includes(typeHint)) {
    if (typeHint === 'buffer') {
      const json = Buffer.prototype.toJSON.call(value);
      return jsonStringify(json.data && json.type ? json.data : json, 2)
        .replace(/,(\n|$)/g, '$1');
    }

    if (typeHint === 'string' && typeof value === 'object') {
      const arr = value.split('').reduce((acc, char, idx) => {
        acc[idx] = char;
        return acc;
      }, {});
      return jsonStringify(arr);
    }

    return jsonStringify(value);
  }

  // Object, array, or function
  const hasProps = Object.keys(value).some((k) => Object.prototype.hasOwnProperty.call(value, k));
  if (hasProps) {
    const canonical = exports.canonicalize(value, null, typeHint);
    return jsonStringify(canonical, 2).replace(/,(\n|$)/g, '$1');
  }

  return emptyRepresentation(value, typeHint);
};

/**
 * like JSON.stringify but more sense.
 *
 * @api private
 * @param {Object}  object
 * @param {number=} spaces
 * @param {number=} depth
 * @returns {*}
 */
function jsonStringify(object, spaces, depth) {
  if (typeof spaces === 'undefined') {
    return _stringify(object);
  }

  depth = depth || 1;
  const space = spaces * depth;
  const isArray = Array.isArray(object);
  let str = isArray ? '[' : '{';
  const end = isArray ? ']' : '}';
  const length = typeof object.length === 'number' ? object.length : Object.keys(object).length;

  function repeat(s, n) {
    return new Array(n + 1).join(s);
  }

  function _stringify(val) {
    switch (type(val)) {
      case 'null':
      case 'undefined':
        return `[${val}]`;
      case 'array':
      case 'object':
        return jsonStringify(val, spaces, depth + 1);
      case 'boolean':
      case 'regexp':
      case 'symbol':
      case 'number':
        return val === 0 && (1 / val) === -Infinity ? '-0' : val.toString();
      case 'date':
        const sDate = isNaN(val.getTime()) ? val.toString() : val.toISOString();
        return `[Date: ${sDate}]`;
      case 'buffer':
        const json = val.toJSON();
        const data = json.data && json.type ? json.data : json;
        return `[Buffer: ${jsonStringify(data, 2, depth + 1)}]`;
      default:
        return val === '[Function]' || val === '[Circular]'
          ? val
          : JSON.stringify(val);
    }
  }

  for (const key in object) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) {
      continue;
    }
    str += `\n ${repeat(' ', space)}${isArray ? '' : `"${key}": `}${_stringify(object[key])}${--length ? ',' : ''}`;
  }

  return str + (str.length !== 1 ? `\n${repeat(' ', --space)}${end}` : end);
}

/**
 * Return a new Thing that has the keys in sorted order. Recursive.
 *
 * @api private
 * @see {@link exports.stringify}
 * @param {*} value Thing to inspect.  May or may not have properties.
 * @param {Array} [stack=[]] Stack of seen values
 * @param {string} [typeHint] Type hint
 * @return {(Object|Array|Function|string|undefined)}
 */
exports.canonicalize = function canonicalize(value, stack, typeHint) {
  typeHint = typeHint || type(value);
  stack = stack || [];

  if (stack.includes(value)) {
    return '[Circular]';
  }

  const pushAndPop = (val, fn) => {
    stack.push(val);
    fn();
    stack.pop();
  };

  switch (typeHint) {
    case 'undefined':
    case 'buffer':
    case 'null':
      return value;

    case 'array':
      return pushAndPop(value, () => {
        value = value.map((item) => exports.canonicalize(item, stack));
      }) || value;

    case 'function':
      if (Object.keys(value).length === 0) {
        return emptyRepresentation(value, typeHint);
      }
      // fall through to object handling

    case 'object':
      const result = {};
      pushAndPop(value, () => {
        Object.keys(value)
          .sort()
          .forEach((key) => {
            result[key] = exports.canonicalize(value[key], stack);
          });
      });
      return result;

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
 * @param {string} path Base path to start searching from.
 * @param {string[]} extensions File extensions to look for.
 * @param {boolean} recursive Whether or not to recurse into subdirectories.
 * @return {string[]} An array of paths.
 */
exports.lookupFiles = function lookupFiles(p, extensions, recursive) {
  const files = [];

  if (!exists(p)) {
    if (exists(`${p}.js`)) {
      p += '.js';
    } else {
      const globFiles = glob.sync(p);
      if (!globFiles.length) {
        throw new Error(`cannot resolve path (or pattern) '${p}'`);
      }
      return globFiles;
    }
  }

  try {
    const stat = statSync(p);
    if (stat.isFile()) {
      return p;
    }
  } catch (err) {
    return;
  }

  readdirSync(p).forEach((file) => {
    const full = join(p, file);
    try {
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (recursive) {
          files.push(...lookupFiles(full, extensions, recursive));
        }
        return;
      }
    } catch (err) {
      return;
    }
    const re = new RegExp(`\\.(?:${extensions.join('|')})$`);
    if (!stat.isFile() || !re.test(full) || basename(full)[0] === '.') {
      return;
    }
    files.push(full);
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
 * @summary
 * This Filter based on `mocha-clean` module.(see: `github.com/rstacruz/mocha-clean`)
 * @description
 * When invoking this function you get a filter function that get the Error.stack as an input,
 * and return a prettify output.
 * (i.e: strip Mocha and internal node functions from stack trace).
 * @returns {Function}
 */
exports.stackTraceFilter = function () {
  const is = typeof document === 'undefined' ? { node: true } : { browser: true };
  const slash = path.sep;
  let cwd;

  if (is.node) {
    cwd = process.cwd() + slash;
  } else {
    cwd = (typeof location === 'undefined'
      ? window.location
      : location).href.replace(/\/[^/]*$/, '/');
    slash = '/';
  }

  const isMochaInternal = (line) => {
    return (~line.indexOf(`node_modules${slash}mocha${slash}`)) ||
      (~line.indexOf(`node_modules${slash}mocha.js`)) ||
      (~line.indexOf(`bower_components${slash}mocha.js`)) ||
      (~line.indexOf(`${slash}mocha.js`));
  };

  const isNodeInternal = (line) => {
    return (~line.indexOf('(timers.js:')) ||
      (~line.indexOf('(events.js:')) ||
      (~line.indexOf('(node.js:')) ||
      (~line.indexOf('(module.js:')) ||
      (~line.indexOf('GeneratorFunctionPrototype.next (native)')) ||
      false;
  };

  return (stack) => {
    const lines = stack.split('\n');

    const filtered = lines.reduce((list, line) => {
      if (isMochaInternal(line)) {
        return list;
      }
      if (is.node && isNodeInternal(line)) {
        return list;
      }
      if (/\(?.+:\d+:\d+\)?$/.test(line)) {
        return list.concat(line.replace(cwd, ''));
      }
      return list.concat(line);
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
exports.isPromise = function isPromise(value) {
  return typeof value === 'object' && typeof value.then === 'function';
};

/**
 * It's a noop.
 * @api
 */
exports.noop = function () {};