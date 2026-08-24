var basename = require('path').basename;
var debug = require('debug')('mocha:watch');
var exists = require('fs').existsSync;
var glob = require('glob');
var path = require('path');
var join = path.join;
var readdirSync = require('fs').readdirSync;
var statSync = require('fs').statSync;
var watchFile = require('fs').watchFile;
var lstatSync = require('fs').lstatSync;
var he = require('he');

/**
 * Escapes special characters in HTML.
 *
 * @param {string} html - The HTML string to escape.
 * @returns {string} The escaped HTML string.
 */
function escapeHtml(html) {
  return he.encode(String(html), { useNamedReferences: false });
}

/**
 * Checks if the given object is a string.
 *
 * @param {*} obj - The object to check.
 * @returns {boolean} True if obj is a string, false otherwise.
 */
function isString(obj) {
  return typeof obj === 'string';
}

/**
 * Watch the given `files` for changes and invoke `fn(file)` on modification.
 *
 * @param {string[]} files - Array of file paths to watch.
 * @param {Function} fn - Callback function to invoke when a file changes.
 */
function watchFiles(files, fn) {
  var options = { interval: 100 };
  files.forEach(function (file) {
    debug('file %s', file);
    watchFile(file, options, function (curr, prev) {
      if (prev.mtime < curr.mtime) {
        fn(file);
      }
    });
  });
}

/**
 * Determines whether a path should be ignored.
 *
 * @param {string} path - The path to check.
 * @returns {boolean} True if the path should NOT be ignored.
 */
function isPathIgnored(path) {
  var ignore = ['node_modules', '.git'];
  return !~ignore.indexOf(path);
}

/**
 * Recursively collects files with specified extensions in a directory.
 *
 * @param {string} dir - The directory to search.
 * @param {string[]} ext - File extensions to include (default: ['js']).
 * @param {string[]} ret - Accumulator array for matches.
 * @returns {string[]} Array of matched file paths.
 */
function collectFiles(dir, ext, ret) {
  ret = ret || [];
  ext = ext || ['js'];
  var extRegex = new RegExp('\\.(' + ext.join('|') + ')$');

  readdirSync(dir)
    .filter(isPathIgnored)
    .forEach(function (name) {
      var fullPath = join(dir, name);
      if (lstatSync(fullPath).isDirectory()) {
        collectFiles(fullPath, ext, ret);
      } else if (fullPath.match(extRegex)) {
        ret.push(fullPath);
      }
    });

  return ret;
}

/**
 * Converts a string into a URL-safe slug.
 *
 * @param {string} str - The input string.
 * @returns {string} The slugified string.
 */
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/ +/g, '-')
    .replace(/[^-\w]/g, '');
}

/**
 * Strips function definition wrappers and normalizes indentation.
 *
 * @param {string} str - Input JavaScript function string.
 * @returns {string} Cleaned string with consistent indentation.
 */
function cleanFunctionString(str) {
  // Normalize line endings and remove BOM
  str = str
    .replace(/\r\n?|[\n\u2028\u2029]/g, '\n')
    .replace(/^\uFEFF/, '');

  // Remove function wrappers: traditional or arrow
  str = str.replace(
    /^function(?:\s*|\s+[^(]*)\([^)]*\)\s*\{((?:.|\n)*?)\s*\}$|^\([^)]*\)\s*=>\s*(?:\{((?:.|\n)*?)\s*\}|((?:.|\n)*))$/,
    '$1$2$3'
  );

  var leadingSpaceMatch = str.match(/^\n?( *)/);
  var leadingSpace = leadingSpaceMatch ? leadingSpaceMatch[1].length : 0;

  var leadingTabMatch = str.match(/^\n?(\t*)/);
  var leadingTab = leadingTabMatch ? leadingTabMatch[1].length : 0;

  var indentPattern = '^\n?' + (leadingTab ? '\t' : ' ') + '{' + (leadingTab || leadingSpace) + '}';
  str = str.replace(new RegExp(indentPattern, 'gm'), '');

  return str.trim();
}

/**
 * Parses a query string into an object.
 *
 * @param {string} qs - The query string to parse.
 * @returns {Object} Key-value pairs from the query string.
 */
function parseQueryString(qs) {
  return qs.replace('?', '').split('&').reduce(function (obj, pair) {
    var i = pair.indexOf('=');
    var key = pair.slice(0, i);
    var val = pair.slice(++i);

    obj[key] = decodeURIComponent(val.replace(/\+/g, '%20'));
    return obj;
  }, {});
}

/**
 * Highlights a string of JavaScript with basic syntax highlighting.
 *
 * @param {string} js - JavaScript source code.
 * @returns {string} HTML-annotated JavaScript.
 */
function highlightJs(js) {
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
 * Highlights all code elements within a given HTML tag.
 *
 * @param {string} tagName - Tag name to look up.
 */
function highlightCodeInTag(tagName) {
  var codes = document.getElementById('mocha').getElementsByTagName(tagName);
  for (var i = 0; i < codes.length; ++i) {
    codes[i].innerHTML = highlightJs(codes[i].innerHTML);
  }
}

/**
 * Returns appropriate string representation for empty values.
 *
 * @param {*} value - The value to represent.
 * @param {string} typeHint - Type hint ('function', 'object', 'array').
 * @returns {string} String representation of the empty value.
 */
function getEmptyRepresentation(value, typeHint) {
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
 * Determines the type of a value using Object.prototype.toString.
 *
 * @param {*} value - The value to inspect.
 * @returns {string} Lowercase type name.
 */
function getType(value) {
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
}

/**
 * Recursively stringifies a value with special handling for functions, arrays,
 * objects, and buffers.
 *
 * @param {*} value - Value to stringify.
 * @returns {string} Strong representation of value.
 */
function stringifyValue(value) {
  var typeHint = getType(value);

  if (!~['object', 'array', 'function'].indexOf(typeHint)) {
    if (typeHint === 'buffer') {
      var json = Buffer.prototype.toJSON.call(value);
      json = json.data && json.type ? json.data : json;
      return jsonStringify(json, 2).replace(/,(\n|$)/g, '$1');
    }

    if (typeHint === 'string' && typeof value === 'object') {
      value = value.split('').reduce(function (acc, char, idx) {
        acc[idx] = char;
        return acc;
      }, {});
      typeHint = 'object';
    } else {
      return jsonStringify(value);
    }
  }

  for (var prop in value) {
    if (Object.prototype.hasOwnProperty.call(value, prop)) {
      return jsonStringify(canonicalize(value, null, typeHint), 2).replace(/,(\n|$)/g, '$1');
    }
  }

  return getEmptyRepresentation(value, typeHint);
}

/**
 * Deeply stringifies an object with optional formatting.
 *
 * @param {Object} object - Value to stringify.
 * @param {number} [spaces] - Number of spaces for indentation.
 * @param {number} [depth] - Current recursion depth.
 * @returns {string} Stringified representation.
 */
function jsonStringify(object, spaces, depth) {
  if (typeof spaces === 'undefined') {
    return primitiveStringify(object);
  }

  depth = depth || 1;
  var space = spaces * depth;
  var isArray = Array.isArray(object);
  var start = isArray ? '[' : '{';
  var end = isArray ? ']' : '}';
  var remaining = isArray ? object.length : Object.keys(object).length;

  function pad(s, n) {
    return new Array(n).join(s);
  }

  function primitiveStringify(val) {
    switch (getType(val)) {
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
        if (val === 0 && (1 / val) === -Infinity) return '-0';
        return val.toString();
      case 'date':
        var sDate = isNaN(val.getTime()) ? val.toString() : val.toISOString();
        return '[Date: ' + sDate + ']';
      case 'buffer':
        var json = val.toJSON();
        json = json.data && json.type ? json.data : json;
        return '[Buffer: ' + jsonStringify(json, 2, depth + 1) + ']';
      default:
        if (val === '[Function]' || val === '[Circular]') {
          return val;
        }
        return JSON.stringify(val);
    }
  }

  for (var i in object) {
    if (!Object.prototype.hasOwnProperty.call(object, i)) {
      continue;
    }
    --remaining;
    start += '\n ' + pad(' ', space);
    if (!isArray) {
      start += '"' + i + '": ';
    }
    start += primitiveStringify(object[i]);
    if (remaining) {
      start += ',';
    }
  }

  return start + (start.length !== 1 ? '\n' + pad(' ', --space) + end : end);
}

/**
 * Canonicalizes an object by recursively sorting keys and handling cycles.
 *
 * @param {*} value - Value to canonicalize.
 * @param {Array} [stack=[]] - Stack of visited values to detect cycles.
 * @param {string} [typeHint] - Type hint.
 * @returns {*} Canonicalized value.
 */
function canonicalize(value, stack, typeHint) {
  typeHint = typeHint || getType(value);
  stack = stack || [];

  if (stack.indexOf(value) !== -1) {
    return '[Circular]';
  }

  function withStack(value, fn) {
    stack.push(value);
    fn();
    stack.pop();
  }

  var canonicalized;

  switch (typeHint) {
    case 'undefined':
    case 'buffer':
    case 'null':
      canonicalized = value;
      break;
    case 'array':
      withStack(value, function () {
        canonicalized = value.map(function (item) {
          return canonicalize(item, stack);
        });
      });
      break;
    case 'function':
      for (var prop in value) {
        canonicalized = {};
        break;
      }
      if (!canonicalized) {
        canonicalized = getEmptyRepresentation(value, typeHint);
      }
      break;
    case 'object':
      canonicalized = canonicalized || {};
      withStack(value, function () {
        Object.keys(value).sort().forEach(function (key) {
          canonicalized[key] = canonicalize(value[key], stack);
        });
      });
      break;
    case 'date':
    case 'number':
    case 'regexp':
    case 'boolean':
    case 'symbol':
      canonicalized = value;
      break;
    default:
      canonicalized = String(value);
  }

  return canonicalized;
}

/**
 * Resolves and returns a list of file paths matching given extensions.
 *
 * @param {string} pathOrPattern - Base path or glob pattern.
 * @param {string[]} extensions - File extensions to include.
 * @param {boolean} recursive - Whether to recurse into subdirectories.
 * @returns {string[]} Array of matched file paths.
 */
function lookupFiles(pathOrPattern, extensions, recursive) {
  var files = [];

  if (!exists(pathOrPattern)) {
    if (exists(pathOrPattern + '.js')) {
      pathOrPattern += '.js';
    } else {
      files = glob.sync(pathOrPattern);
      if (!files.length) {
        throw new Error("cannot resolve path (or pattern) '" + pathOrPattern + "'");
      }
      return files;
    }
  }

  try {
    var stat = statSync(pathOrPattern);
    if (stat.isFile()) {
      return pathOrPattern;
    }
  } catch (err) {
    return;
  }

  readdirSync(pathOrPattern).forEach(function (file) {
    var fullPath = join(pathOrPattern, file);
    try {
      var fileStat = statSync(fullPath);
      if (fileStat.isDirectory()) {
        if (recursive) {
          files = files.concat(lookupFiles(fullPath, extensions, recursive));
        }
        return;
      }
    } catch (err) {
      return;
    }

    var extRegex = new RegExp('\\.(?:' + extensions.join('|') + ')$');
    if (!fileStat.isFile() || !extRegex.test(fullPath) || basename(fullPath)[0] === '.') {
      return;
    }
    files.push(fullPath);
  });

  return files;
}

/**
 * Returns a standardized error for undefined errors.
 *
 * @returns {Error} An Error instance.
 */
function createUndefinedError() {
  return new Error('Caught undefined error, did you throw without specifying what?');
}

/**
 * Ensures an error is returned, or generates a default error if `err` is falsy.
 *
 * @param {Error} err - The error to validate.
 * @returns {Error} Validated or new error.
 */
function ensureError(err) {
  return err || createUndefinedError();
}

/**
 * Creates a stack trace filter that removes Mocha and Node internals.
 *
 * @returns {Function} Filter function for stack traces.
 */
function createStackTraceFilter() {
  var isNode = typeof document === 'undefined';
  var pathSep = path.sep;
  var cwd;

  if (isNode) {
    cwd = process.cwd() + pathSep;
  } else {
    var location = typeof location === 'undefined' ? window.location : location;
    cwd = location.href.replace(/\/[^/]*$/, '/');
    pathSep = '/';
  }

  function isMochaInternal(line) {
    return line.includes('node_modules' + pathSep + 'mocha' + pathSep) ||
           line.includes('node_modules' + pathSep + 'mocha.js') ||
           line.includes('bower_components' + pathSep + 'mocha.js') ||
           line.includes(pathSep + 'mocha.js');
  }

  function isNodeInternal(line) {
    return line.includes('(timers.js:') ||
           line.includes('(events.js:') ||
           line.includes('(node.js:') ||
           line.includes('(module.js:') ||
           line.includes('GeneratorFunctionPrototype.next (native)');
  }

  return function (stack) {
    var lines = stack.split('\n');

    return lines.reduce(function (filtered, line) {
      if (isMochaInternal(line)) {
        return filtered;
      }

      if (isNode && isNodeInternal(line)) {
        return filtered;
      }

      if (/\(?.+:\d+:\d+\)?$/.test(line)) {
        line = line.replace(cwd, '');
      }

      filtered.push(line);
      return filtered;
    }, []).join('\n');
  };
}

/**
 * Checks whether the given value is a Promise.
 *
 * @param {*} value - Value to test.
 * @returns {boolean} True if value is a Promise.
 */
function isPromise(value) {
  return typeof value === 'object' && typeof value.then === 'function';
}

/**
 * No operation function.
 */
function noop() {}

exports.inherits = require('util').inherits;
exports.escape = escapeHtml;
exports.isString = isString;
exports.watch = watchFiles;
exports.files = collectFiles;
exports.slug = slugify;
exports.clean = cleanFunctionString;
exports.parseQuery = parseQueryString;
exports.highlightTags = highlightCodeInTag;
exports.type = getType;
exports.stringify = stringifyValue;
exports.canonicalize = canonicalize;
exports.lookupFiles = lookupFiles;
exports.undefinedError = createUndefinedError;
exports.getError = ensureError;
exports.stackTraceFilter = createStackTraceFilter;
exports.isPromise = isPromise;
exports.noop = noop;
function jsonStringify(object, spaces, depth) {
  if (typeof spaces === 'undefined') {
    return primitiveStringify(object);
  }

  depth = depth || 1;
  var space = spaces * depth;
  var isArray = Array.isArray(object);
  var start = isArray ? '[' : '{';
  var end = isArray ? ']' : '}';
  var remaining = isArray ? object.length : Object.keys(object).length;

  function pad(s, n) {
    return new Array(n).join(s);
  }

  function primitiveStringify(val) {
    switch (getType(val)) {
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
        if (val === 0 && (1 / val) === -Infinity) return '-0';
        return val.toString();
      case 'date':
        var sDate = isNaN(val.getTime()) ? val.toString() : val.toISOString();
        return '[Date: ' + sDate + ']';
      case 'buffer':
        var json = val.toJSON();
        json = json.data && json.type ? json.data : json;
        return '[Buffer: ' + jsonStringify(json, 2, depth + 1) + ']';
      default:
        if (val === '[Function]' || val === '[Circular]') {
          return val;
        }
        return JSON.stringify(val);
    }
  }

  for (var i in object) {
    if (!Object.prototype.hasOwnProperty.call(object, i)) {
      continue;
    }
    --remaining;
    start += '\n ' + pad(' ', space);
    if (!isArray) {
      start += '"' + i + '": ';
    }
    start += primitiveStringify(object[i]);
    if (remaining) {
      start += ',';
    }
  }

  return start + (start.length !== 1 ? '\n' + pad(' ', --space) + end : end);
}
function stringifyValue(value) {
  var typeHint = getType(value);

  if (!~['object', 'array', 'function'].indexOf(typeHint)) {
    if (typeHint === 'buffer') {
      var json = Buffer.prototype.toJSON.call(value);
      json = json.data && json.type ? json.data : json;
      return jsonStringify(json, 2).replace(/,(\n|$)/g, '$1');
    }

    if (typeHint === 'string' && typeof value === 'object') {
      value = value.split('').reduce(function (acc, char, idx) {
        acc[idx] = char;
        return acc;
      }, {});
      typeHint = 'object';
    } else {
      return jsonStringify(value);
    }
  }

  for (var prop in value) {
    if (Object.prototype.hasOwnProperty.call(value, prop)) {
      return jsonStringify(canonicalize(value, null, typeHint), 2).replace(/,(\n|$)/g, '$1');
    }
  }

  return getEmptyRepresentation(value, typeHint);
}
function canonicalize(value, stack, typeHint) {
  typeHint = typeHint || getType(value);
  stack = stack || [];

  if (stack.indexOf(value) !== -1) {
    return '[Circular]';
  }

  function withStack(value, fn) {
    stack.push(value);
    fn();
    stack.pop();
  }

  var canonicalized;

  switch (typeHint) {
    case 'undefined':
    case 'buffer':
    case 'null':
      canonicalized = value;
      break;
    case 'array':
      withStack(value, function () {
        canonicalized = value.map(function (item) {
          return canonicalize(item, stack);
        });
      });
      break;
    case 'function':
      for (var prop in value) {
        canonicalized = {};
        break;
      }
      if (!canonicalized) {
        canonicalized = getEmptyRepresentation(value, typeHint);
      }
      break;
    case 'object':
      canonicalized = canonicalized || {};
      withStack(value, function () {
        Object.keys(value).sort().forEach(function (key) {
          canonicalized[key] = canonicalize(value[key], stack);
        });
      });
      break;
    case 'date':
    case 'number':
    case 'regexp':
    case 'boolean':
    case 'symbol':
      canonicalized = value;
      break;
    default:
      canonicalized = String(value);
  }

  return canonicalized;
}