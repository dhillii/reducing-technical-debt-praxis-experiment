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
const EXTENSION_PATTERN_PREFIX = '\\.(?:';
const EXTENSION_PATTERN_SUFFIX = ')$';

// ============================================================================
// Type Detection
// ============================================================================

const type = exports.type = function type(value) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Buffer.isBuffer(value)) return 'buffer';
  
  return Object.prototype.toString.call(value)
    .replace(/^\[.+\s(.+?)]$/, '$1')
    .toLowerCase();
};

// ============================================================================
// String Utilities
// ============================================================================

exports.inherits = require('util').inherits;

exports.escape = function(html) {
  return he.encode(String(html), { useNamedReferences: false });
};

exports.isString = function(obj) {
  return typeof obj === 'string';
};

exports.slug = function(str) {
  return str
    .toLowerCase()
    .replace(/ +/g, '-')
    .replace(/[^-\w]/g, '');
};

exports.clean = function(str) {
  str = str
    .replace(/\r\n?|[\n\u2028\u2029]/g, '\n')
    .replace(/^\uFEFF/, '')
    .replace(/^function(?:\s*|\s+[^(]*)\([^)]*\)\s*\{((?:.|\n)*?)\s*\}$|^\([^)]*\)\s*=>\s*(?:\{((?:.|\n)*?)\s*\}|((?:.|\n)*))$/, '$1$2$3');

  const spaces = str.match(/^\n?( *)/)[1].length;
  const tabs = str.match(/^\n?(\t*)/)[1].length;
  const re = new RegExp('^\n?' + (tabs ? '\t' : ' ') + '{' + (tabs || spaces) + '}', 'gm');

  return str.replace(re, '').trim();
};

exports.parseQuery = function(qs) {
  return qs.replace('?', '').split('&').reduce((obj, pair) => {
    const i = pair.indexOf('=');
    const key = pair.slice(0, i);
    const val = pair.slice(++i);
    obj[key] = decodeURIComponent(val.replace(/\+/g, '%20'));
    return obj;
  }, {});
};

// ============================================================================
// File System Utilities
// ============================================================================

function isIgnored(dirName) {
  return !~IGNORED_DIRS.indexOf(dirName);
}

exports.watch = function(files, fn) {
  files.forEach(file => {
    debug('file %s', file);
    watchFile(file, WATCH_OPTIONS, (curr, prev) => {
      if (prev.mtime < curr.mtime) {
        fn(file);
      }
    });
  });
};

exports.files = function(dir, ext, ret) {
  ret = ret || [];
  ext = ext || ['js'];

  const re = new RegExp('\\.(' + ext.join('|') + ')$');

  readdirSync(dir)
    .filter(isIgnored)
    .forEach(fileName => {
      const filePath = join(dir, fileName);
      const stat = lstatSync(filePath);
      
      if (stat.isDirectory()) {
        exports.files(filePath, ext, ret);
      } else if (filePath.match(re)) {
        ret.push(filePath);
      }
    });

  return ret;
};

exports.lookupFiles = function lookupFiles(filePath, extensions, recursive) {
  let files = [];

  if (!existsSync(filePath)) {
    if (existsSync(filePath + '.js')) {
      filePath += '.js';
    } else {
      files = glob.sync(filePath);
      if (!files.length) {
        throw new Error(`cannot resolve path (or pattern) '${filePath}'`);
      }
      return files;
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

  const extensionRegex = new RegExp(EXTENSION_PATTERN_PREFIX + extensions.join('|') + EXTENSION_PATTERN_SUFFIX);

  readdirSync(filePath).forEach(file => {
    const fullPath = join(filePath, file);
    
    try {
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        if (recursive) {
          files = files.concat(lookupFiles(fullPath, extensions, recursive));
        }
        return;
      }

      if (stat.isFile() && extensionRegex.test(fullPath) && basename(fullPath)[0] !== '.') {
        files.push(fullPath);
      }
    } catch (err) {
      // ignore error
    }
  });

  return files;
};

// ============================================================================
// HTML/Highlighting Utilities
// ============================================================================

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

exports.highlightTags = function(name) {
  const code = document.getElementById('mocha').getElementsByTagName(name);
  for (let i = 0; i < code.length; ++i) {
    code[i].innerHTML = highlight(code[i].innerHTML);
  }
};

// ============================================================================
// Serialization Utilities
// ============================================================================

function emptyRepresentation(value, typeHint) {
  const representations = {
    function: '[Function]',
    object: '{}',
    array: '[]'
  };
  return representations[typeHint] || value.toString();
}

function repeat(str, count) {
  return new Array(count).join(str);
}

function stringifyValue(val, spaces, depth) {
  const typeHint = type(val);

  switch (typeHint) {
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
      const dateStr = isNaN(val.getTime()) ? val.toString() : val.toISOString();
      return '[Date: ' + dateStr + ']';
    case 'buffer':
      const json = val.toJSON();
      const bufferData = json.data && json.type ? json.data : json;
      return '[Buffer: ' + jsonStringify(bufferData, 2, depth + 1) + ']';
    default:
      return (val === '[Function]' || val === '[Circular]') ? val : JSON.stringify(val);
  }
}

function jsonStringify(object, spaces, depth) {
  if (typeof spaces === 'undefined') {
    return stringifyValue(object, spaces, 1);
  }

  depth = depth || 1;
  const space = spaces * depth;
  const isArray = Array.isArray(object);
  const str = isArray ? '[' : '{';
  const end = isArray ? ']' : '}';
  const length = typeof object.length === 'number' ? object.length : Object.keys(object).length;

  let result = str;
  let itemCount = length;

  for (const i in object) {
    if (!Object.prototype.hasOwnProperty.call(object, i)) {
      continue;
    }
    --itemCount;
    result += '\n ' + repeat(' ', space) +
      (isArray ? '' : '"' + i + '": ') +
      stringifyValue(object[i], spaces, depth + 1) +
      (itemCount ? ',' : '');
  }

  return result + (result.length !== 1 ? '\n' + repeat(' ', --space) + end : end);
}

exports.stringify = function(value) {
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
      return jsonStringify(exports.canonicalize(obj, null, 'object'), 2).replace(/,(\n|$)/g, '$1');
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

exports.canonicalize = function canonicalize(value, stack, typeHint) {
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
        canonicalizedObj = value.map(item => exports.canonicalize(item, stack));
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
        Object.keys(value).sort().forEach(key => {
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
      canonicalizedObj = value + '';
  }

  return canonicalizedObj;
};

// ============================================================================
// Error Handling
// ============================================================================

exports.undefinedError = function() {
  return new Error('Caught undefined error, did you throw without specifying what?');
};

exports.getError = function(err) {
  return err || exports.undefinedError();
};

// ============================================================================
// Stack Trace Filtering
// ============================================================================

exports.stackTraceFilter = function() {
  const isNode = typeof document === 'undefined';
  const slash = isNode ? path.sep : '/';
  const cwd = isNode ? process.cwd() + slash : (typeof location === 'undefined' ? window.location : location).href.replace(/\/[^/]*$/, '/');

  const isMochaInternal = (line) => {
    return line.includes('node_modules' + slash + 'mocha' + slash) ||
           line.includes('node_modules' + slash + 'mocha.js') ||
           line.includes('bower_components' + slash + 'mocha.js') ||
           line.includes(slash + 'mocha.js');
  };

  const isNodeInternal = (line) => {
    return line.includes('(timers.js:') ||
           line.includes('(events.js:') ||
           line.includes('(node.js:') ||
           line.includes('(module.js:') ||
           line.includes('GeneratorFunctionPrototype.next (native)');
  };

  return function(stack) {
    return stack.split('\n')
      .reduce((list, line) => {
        if (isMochaInternal(line)) {
          return list;
        }

        if (isNode && isNodeInternal(line)) {
          return list;
        }

        if (/\(?.+:\d+:\d+\)?$/.test(line)) {
          line = line.replace(cwd, '');
        }

        list.push(line);
        return list;
      }, [])
      .join('\n');
  };
};

// ============================================================================
// Promise Detection & Utilities
// ============================================================================

exports.isPromise = function isPromise(value) {
  return typeof value === 'object' && typeof value.then === 'function';
};

exports.noop = function() {};
```