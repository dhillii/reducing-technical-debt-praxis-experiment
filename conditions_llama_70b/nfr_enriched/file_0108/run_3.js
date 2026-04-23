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
exports.escape = (html) => he.encode(String(html), { useNamedReferences: false });

/**
 * Test if the given obj is type of string.
 *
 * @api private
 * @param {Object} obj
 * @return {boolean}
 */
exports.isString = (obj) => typeof obj === 'string';

/**
 * Watch the given `files` for changes
 * and invoke `fn(file)` on modification.
 *
 * @api private
 * @param {Array} files
 * @param {Function} fn
 */
exports.watch = (files, fn) => {
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
 * Check if a path is ignored.
 *
 * @api private
 * @param {string} path
 * @return {boolean}
 */
const isIgnored = (path) => !ignore.includes(path);

/**
 * Lookup files in the given `dir`.
 *
 * @api private
 * @param {string} dir
 * @param {string[]} [ext=['.js']]
 * @param {Array} [ret=[]]
 * @return {Array}
 */
exports.files = (dir, ext = ['js'], ret = []) => {
  const re = new RegExp(`\\.(${ext.join('|')})$`);
  readdirSync(dir)
    .filter(isIgnored)
    .forEach((path) => {
      path = join(dir, path);
      if (lstatSync(path).isDirectory()) {
        exports.files(path, ext, ret);
      } else if (path.match(re)) {
        ret.push(path);
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
exports.slug = (str) => str.toLowerCase().replace(/ +/g, '-').replace(/[^-\w]/g, '');

/**
 * Strip the function definition from `str`, and re-indent for pre whitespace.
 *
 * @param {string} str
 * @return {string}
 */
exports.clean = (str) => {
  str = str
    .replace(/\r\n?|[\n\u2028\u2029]/g, '\n')
    .replace(/^\uFEFF/, '')
    .replace(
      /^function(?:\s*|\s+[^(]*)\([^)]*\)\s*\{((?:.|\n)*?)\s*\}$|^\([^)]*\)\s*=>\s*(?:\{((?:.|\n)*?)\s*\}|((?:.|\n)*))$/,
      '$1$2$3'
    );

  const spaces = str.match(/^\n?( *)/)[1].length;
  const tabs = str.match(/^\n?(\t*)/)[1].length;
  const re = new RegExp(`^\\n?(?:\\t{${tabs}}| {${spaces}})`, 'gm');

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
exports.parseQuery = (qs) =>
  qs.replace('?', '').split('&').reduce((obj, pair) => {
    const i = pair.indexOf('=');
    const key = pair.slice(0, i);
    const val = pair.slice(++i);
    obj[key] = decodeURIComponent(val.replace(/\+/g, '%20'));
    return obj;
  }, {});

/**
 * Highlight the given string of `js`.
 *
 * @api private
 * @param {string} js
 * @return {string}
 */
const highlight = (js) =>
  js
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\/\/(.*)/gm, '<span class="comment">//$1</span>')
    .replace(/('.*?')/gm, '<span class="string">$1</span>')
    .replace(/(\d+\.\d+)/gm, '<span class="number">$1</span>')
    .replace(/(\d+)/gm, '<span class="number">$1</span>')
    .replace(/\bnew[ \t]+(\w+)/gm, '<span class="keyword">new</span> <span class="init">$1</span>')
    .replace(/\b(function|new|throw|return|var|if|else)\b/gm, '<span class="keyword">$1</span>');

/**
 * Highlight the contents of tag `name`.
 *
 * @api private
 * @param {string} name
 */
exports.highlightTags = (name) => {
  const code = document.getElementById('mocha').getElementsByTagName(name);
  for (let i = 0, len = code.length; i < len; ++i) {
    code[i].innerHTML = highlight(code[i].innerHTML);
  }
};

/**
 * Get a string representation of an empty value.
 *
 * @api private
 * @param {*} value
 * @param {string} typeHint
 * @returns {string}
 */
const emptyRepresentation = (value, typeHint) => {
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
};

/**
 * Get the type of a value.
 *
 * @api private
 * @param {*} value
 * @returns {string}
 */
const getType = (value) => {
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
 * Stringify a value.
 *
 * @api private
 * @param {*} value
 * @returns {string}
 */
exports.stringify = (value) => {
  const typeHint = getType(value);

  if (!['object', 'array', 'function'].includes(typeHint)) {
    if (typeHint === 'buffer') {
      const json = Buffer.prototype.toJSON.call(value);
      return jsonStringify(json.data && json.type ? json.data : json, 2).replace(/,(\n|$)/g, '$1');
    }

    return jsonStringify(value);
  }

  for (const prop in value) {
    if (Object.prototype.hasOwnProperty.call(value, prop)) {
      return jsonStringify(exports.canonicalize(value, null, typeHint), 2).replace(/,(\n|$)/g, '$1');
    }
  }

  return emptyRepresentation(value, typeHint);
};

/**
 * Like JSON.stringify but more sense.
 *
 * @api private
 * @param {Object} object
 * @param {number} [spaces]
 * @param {number} [depth]
 * @returns {string}
 */
const jsonStringify = (object, spaces, depth = 1) => {
  if (typeof spaces === 'undefined') {
    return _stringify(object);
  }

  const space = spaces * depth;
  const str = Array.isArray(object) ? '[' : '{';
  const end = Array.isArray(object) ? ']' : '}';
  const length = typeof object.length === 'number' ? object.length : Object.keys(object).length;

  function _stringify(val) {
    switch (getType(val)) {
      case 'null':
      case 'undefined':
        val = `[${val}]`;
        break;
      case 'array':
      case 'object':
        val = jsonStringify(val, spaces, depth + 1);
        break;
      case 'boolean':
      case 'regexp':
      case 'symbol':
      case 'number':
        val = val === 0 && (1 / val) === -Infinity ? '-0' : val.toString();
        break;
      case 'date':
        const sDate = isNaN(val.getTime()) ? val.toString() : val.toISOString();
        val = `[Date: ${sDate}]`;
        break;
      case 'buffer':
        const json = val.toJSON();
        val = `[Buffer: ${jsonStringify(json.data && json.type ? json.data : json, 2, depth + 1)}]`;
        break;
      default:
        val = (val === '[Function]' || val === '[Circular]') ? val : JSON.stringify(val);
    }
    return val;
  }

  let result = str;
  for (const i in object) {
    if (!Object.prototype.hasOwnProperty.call(object, i)) {
      continue;
    }
    --length;
    result += `\n ${' '.repeat(space)}${Array.isArray(object) ? '' : `"${i}": `}${_stringify(object[i])}${length ? ',' : ''}`;
  }

  return result + (result.length !== 1 ? `\n${' '.repeat(--space)}${end}` : end);
};

/**
 * Canonicalize a value.
 *
 * @api private
 * @param {*} value
 * @param {Array} [stack=[]]
 * @param {string} [typeHint]
 * @returns {(Object|Array|Function|string|undefined)}
 */
exports.canonicalize = (value, stack = [], typeHint) => {
  typeHint = typeHint || getType(value);

  if (stack.includes(value)) {
    return '[Circular]';
  }

  switch (typeHint) {
    case 'undefined':
    case 'buffer':
    case 'null':
      return value;
    case 'array':
      return value.map((item) => exports.canonicalize(item, stack));
    case 'function':
      for (const prop in value) {
        if (Object.prototype.hasOwnProperty.call(value, prop)) {
          return {};
        }
      }
      return emptyRepresentation(value, typeHint);
    case 'object':
      const canonicalizedObj = {};
      stack.push(value);
      Object.keys(value)
        .sort()
        .forEach((key) => {
          canonicalizedObj[key] = exports.canonicalize(value[key], stack);
        });
      stack.pop();
      return canonicalizedObj;
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
 * @param {string} path
 * @param {string[]} extensions
 * @param {boolean} recursive
 * @return {string[]}
 */
exports.lookupFiles = (path, extensions, recursive) => {
  const files = [];

  if (!exists(path)) {
    if (exists(path + '.js')) {
      path += '.js';
    } else {
      files.push(...glob.sync(path));
      if (!files.length) {
        throw new Error(`cannot resolve path (or pattern) '${path}'`);
      }
      return files;
    }
  }

  try {
    const stat = statSync(path);
    if (stat.isFile()) {
      return [path];
    }
  } catch (err) {
    return;
  }

  readdirSync(path).forEach((file) => {
    file = join(path, file);
    try {
      const stat = statSync(file);
      if (stat.isDirectory()) {
        if (recursive) {
          files.push(...exports.lookupFiles(file, extensions, recursive));
        }
        return;
      }
    } catch (err) {
      return;
    }
    const re = new RegExp(`\\.(?:${extensions.join('|')})$`);
    if (!stat.isFile() || !re.test(file) || basename(file)[0] === '.') {
      return;
    }
    files.push(file);
  });

  return files;
};

/**
 * Generate an undefined error with a message warning the user.
 *
 * @return {Error}
 */
exports.undefinedError = () => new Error('Caught undefined error, did you throw without specifying what?');

/**
 * Generate an undefined error if `err` is not defined.
 *
 * @param {Error} err
 * @return {Error}
 */
exports.getError = (err) => err || exports.undefinedError();

/**
 * Get a stack trace filter function.
 *
 * @returns {Function}
 */
exports.stackTraceFilter = () => {
  const is = typeof document === 'undefined' ? { node: true } : { browser: true };
  const slash = path.sep;
  let cwd;

  if (is.node) {
    cwd = process.cwd() + slash;
  } else {
    cwd = (typeof location === 'undefined' ? window.location : location).href.replace(/\/[^/]*$/, '/');
    slash = '/';
  }

  const isMochaInternal = (line) =>
    line.includes('node_modules' + slash + 'mocha' + slash) ||
    line.includes('node_modules' + slash + 'mocha.js') ||
    line.includes('bower_components' + slash + 'mocha.js') ||
    line.includes(slash + 'mocha.js');

  const isNodeInternal = (line) =>
    line.includes('(timers.js:') ||
    line.includes('(events.js:') ||
    line.includes('(node.js:') ||
    line.includes('(module.js:') ||
    line.includes('GeneratorFunctionPrototype.next (native)');

  return (stack) => {
    stack = stack.split('\n');

    stack = stack.reduce((list, line) => {
      if (isMochaInternal(line)) {
        return list;
      }

      if (is.node && isNodeInternal(line)) {
        return list;
      }

      line = line.replace(cwd, '');
      list.push(line);
      return list;
    }, []);

    return stack.join('\n');
  };
};

/**
 * Check if a value is a Promise.
 *
 * @api
 * @param {*} value
 * @returns {boolean}
 */
exports.isPromise = (value) => typeof value === 'object' && typeof value.then === 'function';

/**
 * No-op function.
 *
 * @api
 */
exports.noop = () => {};