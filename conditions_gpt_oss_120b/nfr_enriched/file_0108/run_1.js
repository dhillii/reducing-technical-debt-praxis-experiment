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

const ignore = ['node_modules', '.git'];

exports.inherits = require('util').inherits;

/**
 * Escape special characters in the given string of html.
 *
 * @api private
 * @param {string} html
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
 * Watch the given `files` for changes and invoke `fn(file)` on modification.
 *
 * @api private
 * @param {Array<string>} files
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
 * Determine whether a path should be ignored.
 *
 * @api private
 * @param {string} p
 * @return {boolean}
 */
function ignored(p) {
  return !~ignore.indexOf(p);
}

/**
 * Recursively collect files matching extensions.
 *
 * @api private
 * @param {string} dir
 * @param {string[]} [ext=['js']]
 * @param {string[]} [ret=[]]
 * @return {string[]}
 */
exports.files = function (dir, ext = ['js'], ret = []) {
  const re = new RegExp(`\\.(${ext.join('|')})$`);
  readdirSync(dir)
    .filter(ignored)
    .forEach(entry => {
      const fullPath = join(dir, entry);
      if (lstatSync(fullPath).isDirectory()) {
        exports.files(fullPath, ext, ret);
      } else if (re.test(fullPath)) {
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
    .replace(
      /^function(?:\s*|\s+[^(]*)\([^)]*\)\s*\{((?:.|\n)*?)\s*\}$|^\([^)]*\)\s*=>\s*(?:\{((?:.|\n)*?)\s*\}|((?:.|\n)*))$/,
      '$1$2$3'
    );

  const spaces = (str.match(/^\n?( *)/)?.[1]?.length) ?? 0;
  const tabs = (str.match(/^\n?(\t*)/)?.[1]?.length) ?? 0;
  const re = new RegExp(`^\\n?${tabs ? '\\t' : ' '}{${tabs || spaces}}`, 'gm');

  str = str.replace(re, '');
  return str.trim();
};

/**
 * Parse the given query string.
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
      const val = pair.slice(i + 1);
      obj[key] = decodeURIComponent(val.replace(/\+/g, '%20'));
      return obj;
    }, {});
};

/**
 * Highlight JavaScript source.
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
 * Apply syntax highlighting to all elements of a given tag name.
 *
 * @api private
 * @param {string} name
 */
exports.highlightTags = function (name) {
  const elements = document.getElementById('mocha').getElementsByTagName(name);
  for (let i = 0; i < elements.length; ++i) {
    elements[i].innerHTML = highlight(elements[i].innerHTML);
  }
};

/**
 * Return a string representation for empty values.
 *
 * @api private
 * @param {*} value
 * @param {string} typeHint
 * @return {string}
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
 * Determine the internal [[Class]] of a value.
 *
 * @api private
 * @param {*} value
 * @return {string}
 */
const type = (exports.type = function (value) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Buffer.isBuffer(value)) return 'buffer';
  return Object.prototype.toString
    .call(value)
    .replace(/^\[.+\s(.+?)]$/, '$1')
    .toLowerCase();
});

/**
 * Serialize a value to a JSON-like string.
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
 * Serialize primitive, buffer, or string-object values.
 *
 * @param {*} value
 * @param {string} typeHint
 * @return {string}
 */
function handlePrimitiveStringify(value, typeHint) {
  if (typeHint === 'buffer') {
    const json = Buffer.prototype.toJSON.call(value);
    return jsonStringify(json.data && json.type ? json.data : json, 2).replace(/,(\n|$)/g, '$1');
  }

  if (typeHint === 'string' && typeof value === 'object') {
    const obj = {};
    value.split('').forEach((char, idx) => {
      obj[idx] = char;
    });
    return jsonStringify(obj);
  }

  return jsonStringify(value);
}

/**
 * Check if an object has own enumerable properties.
 *
 * @param {*} obj
 * @return {boolean}
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
 * JSON.stringify replacement with pretty printing.
 *
 * @api private
 * @param {Object|Array} object
 * @param {number} [spaces]
 * @param {number} [depth]
 * @return {string}
 */
function jsonStringify(object, spaces, depth = 1) {
  if (spaces === undefined) {
    return _primitiveStringify(object);
  }

  const indent = spaces * depth;
  const opening = Array.isArray(object) ? '[' : '{';
  const closing = Array.isArray(object) ? ']' : '}';
  const entries = Object.entries(object).filter(([k]) => Object.prototype.hasOwnProperty.call(object, k));
  const lines = entries.map(([key, val]) => {
    const serialized = _serializeValue(val, spaces, depth + 1);
    const formattedKey = Array.isArray(object) ? '' : `"${key}": `;
    return `${' '.repeat(indent)}${formattedKey}${serialized}`;
  });

  const body = lines.length ? `\n${lines.join(',\n')}\n${' '.repeat(indent - spaces)}` : '';
  return `${opening}${body}${closing}`;
}

/**
 * Serialize a primitive value based on its type.
 *
 * @param {*} val
 * @return {string}
 */
function _primitiveStringify(val) {
  return JSON.stringify(val);
}

/**
 * Serialize a value for jsonStringify.
 *
 * @param {*} val
 * @param {number} spaces
 * @param {number} depth
 * @return {string}
 */
function _serializeValue(val, spaces, depth) {
  const valType = type(val);
  switch (valType) {
    case 'null':
    case 'undefined':
      return `[${valType}]`;
    case 'array':
    case 'object':
      return jsonStringify(val, spaces, depth);
    case 'boolean':
    case 'regexp':
    case 'symbol':
    case 'number':
      return val === 0 && 1 / val === -Infinity ? '-0' : val.toString();
    case 'date':
      const iso = isNaN(val.getTime()) ? val.toString() : val.toISOString();
      return `[Date: ${iso}]`;
    case 'buffer':
      const json = val.toJSON();
      const data = json.data && json.type ? json.data : json;
      return `[Buffer: ${jsonStringify(data, 2, depth)}]`;
    default:
      return val === '[Function]' || val === '[Circular]' ? val : JSON.stringify(val);
  }
}

/**
 * Return a new object with sorted keys and circular reference handling.
 *
 * @api private
 * @param {*} value
 * @param {Array} [stack=[]]
 * @param {string} [typeHint]
 * @return {any}
 */
exports.canonicalize = function canonicalize(value, stack = [], typeHint = type(value)) {
  if (stack.includes(value)) {
    return '[Circular]';
  }

  switch (typeHint) {
    case 'undefined':
    case 'null':
    case 'buffer':
      return value;
    case 'array':
      stack.push(value);
      const arr = value.map(item => exports.canonicalize(item, stack));
      stack.pop();
      return arr;
    case 'function':
      if (hasOwnProperties(value)) {
        return canonicalizeObject(value, stack);
      }
      return emptyRepresentation(value, typeHint);
    case 'object':
      return canonicalizeObject(value, stack);
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
 * Helper to canonicalize plain objects.
 *
 * @param {Object} obj
 * @param {Array} stack
 * @return {Object}
 */
function canonicalizeObject(obj, stack) {
  const result = {};
  stack.push(obj);
  Object.keys(obj)
    .sort()
    .forEach(key => {
      result[key] = exports.canonicalize(obj[key], stack);
    });
  stack.pop();
  return result;
}

/**
 * Recursively lookup files matching extensions.
 *
 * @api public
 * @param {string} basePath
 * @param {string[]} extensions
 * @param {boolean} recursive
 * @return {string[]|string|undefined}
 */
exports.lookupFiles = function lookupFiles(basePath, extensions, recursive) {
  if (!exists(basePath)) {
    return resolvePathOrPattern(basePath);
  }

  try {
    const stat = statSync(basePath);
    if (stat.isFile()) {
      return basePath;
    }
  } catch {
    return undefined;
  }

  const files = [];
  readdirSync(basePath).forEach(entry => {
    const fullPath = join(basePath, entry);
    if (isDirectory(fullPath)) {
      if (recursive) {
        const nested = lookupFiles(fullPath, extensions, recursive);
        if (Array.isArray(nested)) files.push(...nested);
      }
      return;
    }

    if (shouldIncludeFile(fullPath, extensions)) {
      files.push(fullPath);
    }
  });

  return files;
};

/**
 * Resolve a path that may be a file, a .js extension, or a glob pattern.
 *
 * @param {string} p
 * @return {string[]|string}
 */
function resolvePathOrPattern(p) {
  if (exists(p + '.js')) {
    return p + '.js';
  }
  const matches = glob.sync(p);
  if (!matches.length) {
    throw new Error(`cannot resolve path (or pattern) '${p}'`);
  }
  return matches;
}

/**
 * Determine if a path points to a directory.
 *
 * @param {string} p
 * @return {boolean}
 */
function isDirectory(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Determine if a file should be included based on extension and visibility.
 *
 * @param {string} file
 * @param {string[]} extensions
 * @return {boolean}
 */
function shouldIncludeFile(file, extensions) {
  const re = new RegExp(`\\.(?:${extensions.join('|')})$`);
  if (!re.test(file)) return false;
  if (basename(file)[0] === '.') return false;
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * Generate an undefined error with a helpful message.
 *
 * @return {Error}
 */
exports.undefinedError = function () {
  return new Error('Caught undefined error, did you throw without specifying what?');
};

/**
 * Return the provided error or a generated undefined error.
 *
 * @param {Error} err
 * @return {Error}
 */
exports.getError = function (err) {
  return err || exports.undefinedError();
};

/**
 * Create a stack trace filter that removes Mocha and Node internal frames.
 *
 * @return {Function}
 */
exports.stackTraceFilter = function () {
  const isNode = typeof document === 'undefined';
  const slash = path.sep;
  const cwd = isNode ? process.cwd() + slash : (typeof location === 'undefined' ? window.location : location).href.replace(/\/[^/]*$/, '/') + '/';

  function isMochaInternal(line) {
    return (
      line.includes(`node_modules${slash}mocha${slash}`) ||
      line.includes(`node_modules${slash}mocha.js`) ||
      line.includes(`bower_components${slash}mocha.js`) ||
      line.includes(`${slash}mocha.js`)
    );
  }

  function isNodeInternal(line) {
    return (
      line.includes('(timers.js:') ||
      line.includes('(events.js:') ||
      line.includes('(node.js:') ||
      line.includes('(module.js:') ||
      line.includes('GeneratorFunctionPrototype.next (native)')
    );
  }

  return function filter(stack) {
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
 * Determine whether a value is a Promise.
 *
 * @api private
 * @param {*} value
 * @return {boolean}
 */
exports.isPromise = function isPromise(value) {
  return typeof value === 'object' && typeof value.then === 'function';
};

/**
 * No-op function.
 *
 * @api private
 */
exports.noop = function () {};