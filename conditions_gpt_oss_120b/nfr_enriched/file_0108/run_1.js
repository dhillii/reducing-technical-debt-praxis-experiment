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
 * Determine if a path should be ignored.
 *
 * @api private
 * @param {string} p
 * @return {boolean}
 */
function isNotIgnored(p) {
  return !ignore.includes(p);
}

/**
 * Recursively collect files with given extensions.
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
  const regex = new RegExp('\\.(' + extensions.join('|') + ')$');

  readdirSync(dir)
    .filter(isNotIgnored)
    .forEach(entry => {
      const fullPath = join(dir, entry);
      if (lstatSync(fullPath).isDirectory()) {
        exports.files(fullPath, extensions, result);
      } else if (regex.test(fullPath)) {
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
  const indentRegex = new RegExp('^\n?' + (tabs ? '\t' : ' ') + '{' + (tabs || spaces) + '}', 'gm');

  return str.replace(indentRegex, '').trim();
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
    const canonical = exports.canonicalize(value, null, typeHint);
    return jsonStringify(canonical, 2).replace(/,(\n|$)/g, '$1');
  }

  return emptyRepresentation(value, typeHint);
};

/**
 * Serialize primitive, buffer, or string-wrapped objects.
 *
 * @param {*} value
 * @param {string} typeHint
 * @return {string}
 */
function handlePrimitiveStringify(value, typeHint) {
  if (typeHint === 'buffer') {
    const json = Buffer.prototype.toJSON.call(value);
    const data = json.data && json.type ? json.data : json;
    return jsonStringify(data, 2).replace(/,(\n|$)/g, '$1');
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
 * @param {Object} object
 * @param {number} [spaces]
 * @param {number} [depth]
 * @returns {string}
 */
function jsonStringify(object, spaces, depth) {
  if (spaces === undefined) {
    return primitiveStringify(object);
  }

  const currentDepth = depth || 1;
  const indentSize = spaces * currentDepth;
  const opening = Array.isArray(object) ? '[' : '{';
  const closing = Array.isArray(object) ? ']' : '}';
  const entries = Array.isArray(object) ? object : Object.keys(object);
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
        return val === 0 && 1 / val === -Infinity ? '-0' : val.toString();
      case 'date':
        const dateStr = isNaN(val.getTime()) ? val.toString() : val.toISOString();
        return '[Date: ' + dateStr + ']';
      case 'buffer':
        const bufJson = val.toJSON();
        const bufData = bufJson.data && bufJson.type ? bufJson.data : bufJson;
        return '[Buffer: ' + jsonStringify(bufData, 2, currentDepth + 1) + ']';
      default:
        return val === '[Function]' || val === '[Circular]'
          ? val
          : JSON.stringify(val);
    }
  };

  let result = opening;
  let remaining = total;

  for (const key in object) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) continue;
    remaining--;
    const line = '\n ' + repeat(' ', indentSize) +
      (Array.isArray(object) ? '' : '"' + key + '": ') +
      stringifyValue(object[key]) +
      (remaining ? ',' : '');
    result += line;
  }

  const finalIndent = repeat(' ', indentSize - spaces);
  return result + (result.length !== 1 ? '\n' + finalIndent + closing : closing);
}

/**
 * Primitive values stringification.
 *
 * @param {*} val
 * @return {string}
 */
function primitiveStringify(val) {
  return JSON.stringify(val);
}

/**
 * Produce a canonical representation with sorted keys.
 *
 * @api private
 * @param {*} value
 * @param {Array} [stack=[]]
 * @param {string} [typeHint]
 * @return {(Object|Array|Function|string|undefined)}
 */
exports.canonicalize = function (value, stack, typeHint) {
  const seenStack = stack || [];
  const hint = typeHint || type(value);

  if (seenStack.includes(value)) {
    return '[Circular]';
  }

  const withStack = (val, fn) => {
    seenStack.push(val);
    const result = fn();
    seenStack.pop();
    return result;
  };

  switch (hint) {
    case 'undefined':
    case 'null':
    case 'buffer':
      return value;
    case 'array':
      return withStack(value, () => value.map(item => exports.canonicalize(item, seenStack)));
    case 'function':
      if (hasOwnProperties(value)) {
        const obj = {};
        return withStack(value, () => {
          Object.keys(value).sort().forEach(key => {
            obj[key] = exports.canonicalize(value[key], seenStack);
          });
          return obj;
        });
      }
      return emptyRepresentation(value, hint);
    case 'object':
      const resultObj = {};
      return withStack(value, () => {
        Object.keys(value).sort().forEach(key => {
          resultObj[key] = exports.canonicalize(value[key], seenStack);
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
 * Recursively lookup files matching extensions.
 *
 * @api public
 * @param {string} basePath
 * @param {string[]} extensions
 * @param {boolean} recursive
 * @return {string[]}
 */
exports.lookupFiles = function (basePath, extensions, recursive) {
  const collected = [];

  if (!exists(basePath)) {
    if (exists(basePath + '.js')) {
      basePath += '.js';
    } else {
      const globMatches = glob.sync(basePath);
      if (!globMatches.length) {
        throw new Error("cannot resolve path (or pattern) '" + basePath + "'");
      }
      return globMatches;
    }
  }

  try {
    const stats = statSync(basePath);
    if (stats.isFile()) {
      return basePath;
    }
  } catch {
    return;
  }

  readdirSync(basePath).forEach(entry => {
    const fullPath = join(basePath, entry);
    try {
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        if (recursive) {
          collected.push(...exports.lookupFiles(fullPath, extensions, recursive));
        }
        return;
      }
      const extRegex = new RegExp('\\.(?:' + extensions.join('|') + ')$');
      if (!stats.isFile() || !extRegex.test(fullPath) || basename(fullPath)[0] === '.') {
        return;
      }
      collected.push(fullPath);
    } catch {
      // ignore errors
    }
  });

  return collected;
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
 * Create a stack trace filter that removes Mocha and internal Node entries.
 *
 * @returns {Function}
 */
exports.stackTraceFilter = function () {
  const isNode = typeof document === 'undefined';
  const slash = path.sep;
  const cwd = isNode ? process.cwd() + slash : (typeof location === 'undefined' ? window.location : location).href.replace(/\/[^/]*$/, '/') + '/';

  const isMochaInternal = line =>
    line.includes('node_modules' + slash + 'mocha' + slash) ||
    line.includes('node_modules' + slash + 'mocha.js') ||
    line.includes('bower_components' + slash + 'mocha.js') ||
    line.includes(slash + 'mocha.js');

  const isNodeInternal = line =>
    line.includes('(timers.js:') ||
    line.includes('(events.js:') ||
    line.includes('(node.js:') ||
    line.includes('(module.js:') ||
    line.includes('GeneratorFunctionPrototype.next (native)');

  return function (stack) {
    return stack
      .split('\n')
      .reduce((list, line) => {
        if (isMochaInternal(line)) return list;
        if (isNode && isNodeInternal(line)) return list;
        if (/\(?.+:\d+:\d+\)?$/.test(line)) {
          line = line.replace(cwd, '');
        }
        list.push(line);
        return list;
      }, [])
      .join('\n');
  };
};

/**
 * Determine if a value is a Promise.
 *
 * @api private
 * @param {*} value
 * @returns {boolean}
 */
exports.isPromise = function (value) {
  return typeof value === 'object' && typeof value.then === 'function';
};

/**
 * No-operation function.
 *
 * @api private
 */
exports.noop = function () {};