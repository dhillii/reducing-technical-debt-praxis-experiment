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
 * Escapes special characters in the given string of HTML.
 * @param {string} html - HTML string to escape
 * @returns {string} Escaped HTML string
 */
exports.escape = function (html) {
  return he.encode(String(html), { useNamedReferences: false });
};

/**
 * Determines whether the given object is a string.
 * @param {*} obj - Object to check
 * @returns {boolean} true if obj is a string, false otherwise
 */
exports.isString = function (obj) {
  return typeof obj === 'string';
};

/**
 * Watches the given files for changes and invokes the callback on modification.
 * @param {string[]} files - Array of file paths to watch
 * @param {Function} fn - Callback function to invoke when a file changes
 */
exports.watch = function (files, fn) {
  var options = { interval: 100 };
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
 * Determines if a path should not be ignored.
 * @param {string} pathName - Path to check
 * @returns {boolean} true if path should not be ignored, false otherwise
 */
function isNotIgnored (pathName) {
  var ignoreList = ['node_modules', '.git'];
  return !ignoreList.includes(pathName);
}

/**
 * Recursively collects files in the given directory matching the extensions.
 * @param {string} dir - Base directory to search in
 * @param {string[]} [extensions=['js']] - File extensions to include
 * @param {string[]} [result=[]] - Accumulator array for results
 * @returns {string[]} Array of file paths matching the criteria
 */
exports.files = function (dir, extensions, result) {
  result = result || [];
  extensions = extensions || ['js'];

  var pattern = '\\.(' + extensions.join('|') + ')$';
  var regex = new RegExp(pattern);

  var entries = readdirSync(dir)
    .filter(function (entry) {
      return isNotIgnored(entry);
    });

  entries.forEach(function (entry) {
    var fullPath = join(dir, entry);
    try {
      var lstat = lstatSync(fullPath);
      if (lstat.isDirectory()) {
        exports.files(fullPath, extensions, result);
      } else if (regex.test(fullPath)) {
        result.push(fullPath);
      }
    } catch (err) {
      // ignore errors
    }
  });

  return result;
};

/**
 * Generates a slug from the given string by normalizing and replacing special characters.
 * @param {string} str - Input string to convert to slug
 * @returns {string} Generated slug
 */
exports.slug = function (str) {
  return str
    .toLowerCase()
    .replace(/ +/g, '-')
    .replace(/[^-\w]/g, '');
};

/**
 * Strips function definitions and normalizes indentation in the given string.
 * @param {string} str - Input JavaScript code string
 * @returns {string} Cleaned code string
 */
exports.clean = function (str) {
  str = str
    .replace(/\r\n?|[\n\u2028\u2029]/g, '\n')
    .replace(/^\uFEFF/, '')
    .replace(/^function(?:\s*|\s+[^(]*)\([^)]*\)\s*\{((?:.|\n)*?)\s*\}$|^\([^)]*\)\s*=>\s*(?:\{((?:.|\n)*?)\s*\}|((?:.|\n)*))$/, '$1$2$3');

  var indentMatch = str.match(/^\n?( *)/);
  var spaces = indentMatch ? indentMatch[1].length : 0;

  var tabMatch = str.match(/^\n?(\t*)/);
  var tabs = tabMatch ? tabMatch[1].length : 0;

  var indentPattern = '^\\n?' + (tabs ? '\\t' : ' ') + '{' + (tabs || spaces) + '}';
  var re = new RegExp(indentPattern, 'gm');

  str = str.replace(re, '');
  return str.trim();
};

/**
 * Parses the given query string into an object.
 * @param {string} qs - Query string to parse
 * @returns {Object} Parsed query object
 */
exports.parseQuery = function (qs) {
  return qs.replace('?', '').split('&').reduce(function (obj, pair) {
    var i = pair.indexOf('=');
    var key = pair.slice(0, i);
    var val = pair.slice(++i);

    obj[key] = decodeURIComponent(val.replace(/\+/g, '%20'));
    return obj;
  }, {});
};

/**
 * Highlights JavaScript code for display in HTML.
 * @param {string} js - JavaScript code string to highlight
 * @returns {string} Highlighted HTML string
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
 * Highlights all elements with the given tag name in the document.
 * @param {string} tagName - Tag name of elements to highlight
 */
exports.highlightTags = function (tagName) {
  var codes = document.getElementById('mocha').getElementsByTagName(tagName);

  for (var i = 0, len = codes.length; i < len; ++i) {
    codes[i].innerHTML = highlight(codes[i].innerHTML);
  }
};

/**
 * Returns the string representation of empty values based on their type hint.
 * @param {*} value - Value to represent when empty
 * @param {string} typeHint - Type hint indicating how to format empty value
 * @returns {string} String representation of empty value
 */
function getEmptyRepresentation (value, typeHint) {
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
 * Determines the type of the given value using Object.prototype.toString.
 * @param {*} value - Value to determine type of
 * @returns {string} Type of the value (e.g., 'object', 'array', 'string')
 */
var type = exports.type = function type (value) {
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
 * Stringifies a value with appropriate handling for different data structures.
 * @param {*} value - Value to stringify
 * @returns {string} String representation of the value
 */
exports.stringify = function (value) {
  var typeHint = type(value);

  if (['object', 'array', 'function'].includes(typeHint)) {
    var hasProperties = false;
    for (var prop in value) {
      if (Object.prototype.hasOwnProperty.call(value, prop)) {
        hasProperties = true;
        break;
      }
    }

    if (hasProperties) {
      var canonicalized = exports.canonicalize(value, null, typeHint);
      return jsonStringify(canonicalized, 2).replace(/,(\n|$)/g, '$1');
    }

    return getEmptyRepresentation(value, typeHint);
  }

  if (typeHint === 'buffer') {
    var json = Buffer.prototype.toJSON.call(value);
    var data = json.data && json.type ? json.data : json;
    return jsonStringify(data, 2).replace(/,(\n|$)/g, '$1');
  }

  if (typeHint === 'string' && typeof value === 'object') {
    value = value.split('').reduce(function (acc, char, idx) {
      acc[idx] = char;
      return acc;
    }, {});
  }

  return jsonStringify(value);
};

/**
 * Custom JSON stringification implementation with indentation support and special type handling.
 * @param {*} object - Object to stringify
 * @param {number} [spaces] - Indentation spaces
 * @param {number} [depth=1] - Current recursion depth
 * @returns {string} Stringified object
 */
function jsonStringify (object, spaces, depth) {
  if (typeof spaces === 'undefined') {
    return _stringifyPrimitive(object);
  }

  depth = depth || 1;
  var space = spaces * depth;

  function repeat (s, n) {
    return new Array(n).join(s);
  }

  function _stringifyPrimitive (val) {
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
        if (val === 0 && (1 / val) === -Infinity) {
          return '-0';
        }
        return val.toString();
      case 'date':
        var sDate = isNaN(val.getTime()) ? val.toString() : val.toISOString();
        return '[Date: ' + sDate + ']';
      case 'buffer':
        var json = val.toJSON();
        var data = json.data && json.type ? json.data : json;
        return '[Buffer: ' + jsonStringify(data, 2, depth + 1) + ']';
      default:
        return JSON.stringify(val);
    }
  }

  var str = Array.isArray(object) ? '[' : '{';
  var end = Array.isArray(object) ? ']' : '}';
  var length = typeof object.length === 'number' ? object.length : Object.keys(object).length;

  for (var i in object) {
    if (!Object.prototype.hasOwnProperty.call(object, i)) {
      continue;
    }
    --length;
    str += '\n ' + repeat(' ', space) +
      (Array.isArray(object) ? '' : '"' + i + '": ') +
      _stringifyPrimitive(object[i]) +
      (length ? ',' : '');
  }

  return str +
    (str.length !== 1 ? '\n' + repeat(' ', --space) + end : end);
}

/**
 * Creates a canonical version of an object by sorting its properties recursively.
 * @param {*} value - Value to canonicalize
 * @param {Array} [stack=[]] - Stack of already seen values to prevent circular references
 * @param {string} [typeHint] - Type hint for proper handling
 * @returns {Object|string} Canonicalized value
 */
exports.canonicalize = function canonicalize (value, stack, typeHint) {
  typeHint = typeHint || type(value);
  stack = stack || [];

  if (stack.includes(value)) {
    return '[Circular]';
  }

  var canonicalizedObj;
  var withStack = function (value, fn) {
    stack.push(value);
    fn();
    stack.pop();
  };

  switch (typeHint) {
    case 'undefined':
    case 'buffer':
    case 'null':
      canonicalizedObj = value;
      break;
    case 'array':
      withStack(value, function () {
        canonicalizedObj = value.map(function (item) {
          return exports.canonicalize(item, stack);
        });
      });
      break;
    case 'function':
      canonicalizedObj = {};
      for (var prop in value) {
        if (Object.prototype.hasOwnProperty.call(value, prop)) {
          canonicalizedObj[prop] = null;
        }
      }
      if (Object.keys(canonicalizedObj).length === 0) {
        canonicalizedObj = getEmptyRepresentation(value, typeHint);
      }
      break;
    case 'object':
      canonicalizedObj = {};
      withStack(value, function () {
        Object.keys(value).sort().forEach(function (key) {
          canonicalizedObj[key] = exports.canonicalize(value[key], stack);
        });
      });
      break;
    case 'date':
    case 'number':
    case 'regexp':
    case 'boolean':
    case 'symbol':
      canonicalizedObj = value;
      break;
    default:
      canonicalizedObj = String(value);
  }

  return canonicalizedObj;
};

/**
 * Looks up files matching the given extensions in the specified path.
 * @param {string} basePath - Base path to start searching from
 * @param {string[]} extensions - File extensions to look for
 * @param {boolean} recursive - Whether to recurse into subdirectories
 * @returns {string|string[]} Array of matched file paths or single path if file
 */
exports.lookupFiles = function lookupFiles (basePath, extensions, recursive) {
  if (!exists(basePath)) {
    if (exists(basePath + '.js')) {
      basePath += '.js';
    } else {
      var files = glob.sync(basePath);
      if (!files.length) {
        throw new Error("cannot resolve path (or pattern) '" + basePath + "'");
      }
      return files;
    }
  }

  try {
    var stat = statSync(basePath);
    if (stat.isFile()) {
      return basePath;
    }
  } catch (err) {
    return;
  }

  var results = [];
  try {
    var entries = readdirSync(basePath);

    entries.forEach(function (entry) {
      var fullPath = join(basePath, entry);
      try {
        var stat = statSync(fullPath);
        if (stat.isDirectory()) {
          if (recursive) {
            results = results.concat(lookupFiles(fullPath, extensions, recursive));
          }
          return;
        }
      } catch (err) {
        return;
      }

      var pattern = '\\.(' + extensions.join('|') + ')$';
      var regex = new RegExp(pattern);

      if (stat.isFile() && regex.test(fullPath) && basename(entry)[0] !== '.') {
        results.push(fullPath);
      }
    });
  } catch (err) {
    // ignore errors
  }

  return results;
};

/**
 * Generates an error indicating a caught undefined error occurred.
 * @returns {Error} Error instance
 */
exports.undefinedError = function () {
  return new Error('Caught undefined error, did you throw without specifying what?');
};

/**
 * Returns the provided error or generates an undefined error if none is provided.
 * @param {Error} [err] - Error to return if defined
 * @returns {Error} Error instance
 */
exports.getError = function (err) {
  return err || exports.undefinedError();
};

/**
 * Creates a filter function for prettifying stack traces by removing internal calls.
 * @returns {Function} Filter function that takes a stack trace and returns a cleaned version
 */
exports.stackTraceFilter = function () {
  var isNode = typeof document === 'undefined';
  var slash = path.sep;
  var cwd;

  if (isNode) {
    cwd = process.cwd() + slash;
  } else {
    cwd = (typeof location === 'undefined'
      ? window.location
      : location).href.replace(/\/[^/]*$/, '/');
    slash = '/';
  }

  function isMochaInternal (line) {
    return line.includes('node_modules' + slash + 'mocha' + slash) ||
           line.includes('node_modules' + slash + 'mocha.js') ||
           line.includes('bower_components' + slash + 'mocha.js') ||
           line.includes(slash + 'mocha.js');
  }

  function isNodeInternal (line) {
    return line.includes('(timers.js:') ||
           line.includes('(events.js:') ||
           line.includes('(node.js:') ||
           line.includes('(module.js:') ||
           line.includes('GeneratorFunctionPrototype.next (native)');
  }

  return function (stack) {
    var lines = stack.split('\n');

    return lines.reduce(function (list, line) {
      if (isMochaInternal(line)) {
        return list;
      }

      if (isNode && isNodeInternal(line)) {
        return list;
      }

      if (/\(?\.[^:]+:\d+:\d+\)?$/.test(line)) {
        line = line.replace(cwd, '');
      }

      list.push(line);
      return list;
    }, []).join('\n');
  };
};

/**
 * Determines whether the given value is a Promise-like object.
 * @param {*} value - Value to test
 * @returns {boolean} true if value is a Promise, false otherwise
 */
exports.isPromise = function isPromise (value) {
  return typeof value === 'object' && typeof value.then === 'function';
};

/**
 * A no-operation function.
 */
exports.noop = function () {};