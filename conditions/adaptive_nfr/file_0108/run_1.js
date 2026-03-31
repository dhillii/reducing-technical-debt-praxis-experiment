```javascript
'use strict';

/* eslint-env browser */

const { basename } = require('path');
const debug = require('debug')('mocha:watch');
const { existsSync, readdirSync, statSync, watchFile, lstatSync } = require('fs');
const glob = require('glob');
const path = require('path');
const { join } = path;
const he = require('he');

const IGNORED_DIRS = ['node_modules', '.git'];
const WATCH_OPTIONS = { interval: 100 };
const EXTENSION_PATTERN_TEMPLATE = '\\.(?:EXT)$';

// ============================================================================
// Type Detection & Conversion
// ============================================================================

const type = (value) => {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Buffer.isBuffer(value)) return 'buffer';
  return Object.prototype.toString.call(value)
    .replace(/^\[.+\s(.+?)]$/, '$1')
    .toLowerCase();
};

const emptyRepresentation = (value, typeHint) => {
  const representations = {
    function: '[Function]',
    object: '{}',
    array: '[]'
  };
  return representations[typeHint] || value.toString();
};

// ============================================================================
// String Utilities
// ============================================================================

const escape = (html) => he.encode(String(html), { useNamedReferences: false });

const isString = (obj) => typeof obj === 'string';

const slug = (str) => str
  .toLowerCase()
  .replace(/ +/g, '-')
  .replace(/[^-\w]/g, '');

const clean = (str) => {
  str = str
    .replace(/\r\n?|[\n\u2028\u2029]/g, '\n')
    .replace(/^\uFEFF/, '')
    .replace(/^function(?:\s*|\s+[^(]*)\([^)]*\)\s*\{((?:.|\n)*?)\s*\}$|^\([^)]*\)\s*=>\s*(?:\{((?:.|\n)*?)\s*\}|((?:.|\n)*))$/, '$1$2$3');

  const spaces = str.match(/^\n?( *)/)[1].length;
  const tabs = str.match(/^\n?(\t*)/)[1].length;
  const re = new RegExp('^\n?' + (tabs ? '\t' : ' ') + '{' + (tabs || spaces) + '}', 'gm');

  return str.replace(re, '').trim();
};

const parseQuery = (qs) => {
  return qs.replace('?', '').split('&').reduce((obj, pair) => {
    const i = pair.indexOf('=');
    const key = pair.slice(0, i);
    const val = pair.slice(++i);
    obj[key] = decodeURIComponent(val.replace(/\+/g, '%20'));
    return obj;
  }, {});
};

// ============================================================================
// HTML & Highlighting
// ============================================================================

const highlightPatterns = [
  { regex: /</g, replacement: '&lt;' },
  { regex: />/g, replacement: '&gt;' },
  { regex: /\/\/(.*)/gm, replacement: '<span class="comment">//$1</span>' },
  { regex: /('.*?')/gm, replacement: '<span class="string">$1</span>' },
  { regex: /(\d+\.\d+)/gm, replacement: '<span class="number">$1</span>' },
  { regex: /(\d+)/gm, replacement: '<span class="number">$1</span>' },
  { regex: /\bnew[ \t]+(\w+)/gm, replacement: '<span class="keyword">new</span> <span class="init">$1</span>' },
  { regex: /\b(function|new|throw|return|var|if|else)\b/gm, replacement: '<span class="keyword">$1</span>' }
];

const highlight = (js) => highlightPatterns.reduce((str, { regex, replacement }) => 
  str.replace(regex, replacement), js);

const highlightTags = (name) => {
  const code = document.getElementById('mocha').getElementsByTagName(name);
  for (let i = 0; i < code.length; ++i) {
    code[i].innerHTML = highlight(code[i].innerHTML);
  }
};

// ============================================================================
// File System Operations
// ============================================================================

const isIgnored = (dirName) => !~IGNORED_DIRS.indexOf(dirName);

const files = (dir, ext, ret) => {
  ret = ret || [];
  ext = ext || ['js'];
  const re = new RegExp('\\.(' + ext.join('|') + ')$');

  readdirSync(dir)
    .filter(isIgnored)
    .forEach((filePath) => {
      filePath = join(dir, filePath);
      if (lstatSync(filePath).isDirectory()) {
        files(filePath, ext, ret);
      } else if (filePath.match(re)) {
        ret.push(filePath);
      }
    });

  return ret;
};

const watch = (fileList, fn) => {
  fileList.forEach((file) => {
    debug('file %s', file);
    watchFile(file, WATCH_OPTIONS, (curr, prev) => {
      if (prev.mtime < curr.mtime) {
        fn(file);
      }
    });
  });
};

const lookupFiles = (filePath, extensions, recursive) => {
  let foundFiles = [];

  if (!existsSync(filePath)) {
    if (existsSync(filePath + '.js')) {
      filePath += '.js';
    } else {
      foundFiles = glob.sync(filePath);
      if (!foundFiles.length) {
        throw new Error(`cannot resolve path (or pattern) '${filePath}'`);
      }
      return foundFiles;
    }
  }

  try {
    const stat = statSync(filePath);
    if (stat.isFile()) {
      return filePath;
    }
  } catch (err) {
    return;
  }

  const extensionRegex = new RegExp(EXTENSION_PATTERN_TEMPLATE.replace('EXT', extensions.join('|')));

  readdirSync(filePath).forEach((file) => {
    file = join(filePath, file);
    let stat;
    try {
      stat = statSync(file);
      if (stat.isDirectory()) {
        if (recursive) {
          foundFiles = foundFiles.concat(lookupFiles(file, extensions, recursive));
        }
        return;
      }
    } catch (err) {
      return;
    }

    if (stat.isFile() && extensionRegex.test(file) && basename(file)[0] !== '.') {
      foundFiles.push(file);
    }
  });

  return foundFiles;
};

// ============================================================================
// JSON Stringification
// ============================================================================

const repeat = (s, n) => new Array(n).join(s);

const stringifyValue = (val, spaces, depth, type) => {
  const typeOfVal = type(val);
  
  switch (typeOfVal) {
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
      return val === 0 && (1 / val) === -Infinity ? '-0' : val.toString();
    case 'date':
      const sDate = isNaN(val.getTime()) ? val.toString() : val.toISOString();
      return '[Date: ' + sDate + ']';
    case 'buffer':
      const json = val.toJSON();
      const bufferData = json.data && json.type ? json.data : json;
      return '[Buffer: ' + jsonStringify(bufferData, 2, depth + 1) + ']';
    default:
      return (val === '[Function]' || val === '[Circular]') ? val : JSON.stringify(val);
  }
};

const jsonStringify = (object, spaces, depth) => {
  if (typeof spaces === 'undefined') {
    return stringifyValue(object, spaces, 1, type);
  }

  depth = depth || 1;
  const space = spaces * depth;
  const isArray = Array.isArray(object);
  const str = isArray ? '[' : '{';
  const end = isArray ? ']' : '}';
  let length = typeof object.length === 'number' ? object.length : Object.keys(object).length;
  let result = str;

  for (const i in object) {
    if (!Object.prototype.hasOwnProperty.call(object, i)) continue;
    --length;
    result += '\n ' + repeat(' ', space) +
      (isArray ? '' : '"' + i + '": ') +
      stringifyValue(object[i], spaces, depth, type) +
      (length ? ',' : '');
  }

  return result + (result.length !== 1 ? '\n' + repeat(' ', --space) + end : end);
};

// ============================================================================
// Canonicalization
// ============================================================================

const canonicalize = (value, stack, typeHint) => {
  typeHint = typeHint || type(value);
  stack = stack || [];

  if (stack.indexOf(value) !== -1) {
    return '[Circular]';
  }

  const withStack = (val, fn) => {
    stack.push(val);
    fn();
    stack.pop();
  };

  let canonicalizedObj;

  switch (typeHint) {
    case 'undefined':
    case 'buffer':
    case 'null':
      canonicalizedObj = value;
      break;
    case 'array':
      withStack(value, () => {
        canonicalizedObj = value.map((item) => canonicalize(item, stack));
      });
      break;
    case 'function':
      for (const prop in value) {
        canonicalizedObj = {};
        break;
      }
      if (!canonicalizedObj) {
        canonicalizedObj = emptyRepresentation(value, typeHint);
        break;
      }
    /* falls through */
    case 'object':
      canonicalizedObj = canonicalizedObj || {};
      withStack(value, () => {
        Object.keys(value).sort().forEach((key) => {
          canonicalizedObj[key] = canonicalize(value[key], stack);
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
      canonicalizedObj = value + '';
  }

  return canonicalizedObj;
};

// ============================================================================
// Stringify
// ============================================================================

const stringify = (value) => {
  const typeHint = type(value);

  if (!~['object', 'array', 'function'].indexOf(typeHint)) {
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
      return jsonStringify(obj);
    }

    return jsonStringify(value);
  }

  for (const prop in value) {
    if (Object.prototype.hasOwnProperty.call(value, prop)) {
      return jsonStringify(canonicalize(value, null, typeHint), 2).replace(/,(\n|$)/g, '$1');
    }
  }

  return emptyRepresentation(value, typeHint);
};

// ============================================================================
// Error Handling
// ============================================================================

const undefinedError = () => new Error('Caught undefined error, did you throw without specifying what?');

const getError = (err) => err || undefinedError();

// ============================================================================
// Stack Trace Filtering
// ============================================================================

const stackTraceFilter = () => {
  const is = typeof document === 'undefined' ? { node: true } : { browser: true };
  let slash = path.sep;
  let cwd;

  if (is.node) {
    cwd = process.cwd() + slash;
  } else {
    cwd = (typeof location === 'undefined' ? window.location : location)
      .href.replace(/\/[^/]*$/, '/');
    slash = '/';
  }

  const isMochaInternal = (line) => {
    const mochaPatterns = [
      'node_modules' + slash + 'mocha' + slash,
      'node_modules' + slash + 'mocha.js',
      'bower_components' + slash + 'mocha.js',
      slash + 'mocha.js'
    ];
    return mochaPatterns.some(pattern => ~line.indexOf(pattern));
  };

  const isNodeInternal = (line) => {
    const nodePatterns = ['(timers.js:', '(events.js:', '(node.js:', '(module.js:', 'GeneratorFunctionPrototype.next (native)'];
    return nodePatterns.some(pattern => ~line.indexOf(pattern));
  };

  return (stack) => {
    stack = stack.split('\n').reduce((list, line) => {
      if (isMochaInternal(line)) return list;
      if (is.node && isNodeInternal(line)) return list;

      if (/\(?.+:\d+:\d+\)?$/.test(line)) {
        line = line.replace(cwd, '');
      }

      list.push(line);
      return list;
    }, []);

    return stack.join('\n');
  };
};

// ============================================================================
// Utility Functions
// ============================================================================

const isPromise = (value) => typeof value === 'object' && typeof value.then === 'function';

const noop = () => {};

// ============================================================================
// Exports
// ============================================================================

exports.inherits = require('util').inherits;
exports.escape = escape;
exports.isString = isString;
exports.watch = watch;
exports.files = files;
exports.slug = slug;
exports.clean = clean;
exports.parseQuery = parseQuery;
exports.highlightTags = highlightTags;
exports.type = type;
exports.stringify = stringify;
exports.canonicalize = canonicalize;
exports.lookupFiles = lookupFiles;
exports.undefinedError = undefinedError;
exports.getError = getError;
exports.stackTraceFilter = stackTraceFilter;
exports.isPromise = isPromise;
exports.noop = noop;
```