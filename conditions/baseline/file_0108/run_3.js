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

exports.inherits = require('util').inherits;

exports.escape = (html) => he.encode(String(html), { useNamedReferences: false });

exports.isString = (obj) => typeof obj === 'string';

exports.watch = (files, fn) => {
  files.forEach((file) => {
    debug('file %s', file);
    watchFile(file, WATCH_OPTIONS, (curr, prev) => {
      if (prev.mtime < curr.mtime) {
        fn(file);
      }
    });
  });
};

const isIgnored = (dirName) => !~IGNORED_DIRS.indexOf(dirName);

exports.files = (dir, ext, ret) => {
  ret = ret || [];
  ext = ext || ['js'];

  const extensionRegex = new RegExp(`\\.(${ext.join('|')})$`);

  readdirSync(dir)
    .filter(isIgnored)
    .forEach((filePath) => {
      filePath = join(dir, filePath);
      if (lstatSync(filePath).isDirectory()) {
        exports.files(filePath, ext, ret);
      } else if (filePath.match(extensionRegex)) {
        ret.push(filePath);
      }
    });

  return ret;
};

exports.slug = (str) =>
  str
    .toLowerCase()
    .replace(/ +/g, '-')
    .replace(/[^-\w]/g, '');

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
  const indentRegex = new RegExp(
    `^\n?${tabs ? '\t' : ' '}{${tabs || spaces}}`,
    'gm'
  );

  str = str.replace(indentRegex, '');
  return str.trim();
};

exports.parseQuery = (qs) =>
  qs
    .replace('?', '')
    .split('&')
    .reduce((obj, pair) => {
      const i = pair.indexOf('=');
      const key = pair.slice(0, i);
      const val = pair.slice(++i);
      obj[key] = decodeURIComponent(val.replace(/\+/g, '%20'));
      return obj;
    }, {});

const highlightPatterns = [
  { regex: /</g, replacement: '&lt;' },
  { regex: />/g, replacement: '&gt;' },
  { regex: /\/\/(.*)/gm, replacement: '<span class="comment">//$1</span>' },
  { regex: /('.*?')/gm, replacement: '<span class="string">$1</span>' },
  { regex: /(\d+\.\d+)/gm, replacement: '<span class="number">$1</span>' },
  { regex: /(\d+)/gm, replacement: '<span class="number">$1</span>' },
  {
    regex: /\bnew[ \t]+(\w+)/gm,
    replacement: '<span class="keyword">new</span> <span class="init">$1</span>',
  },
  {
    regex: /\b(function|new|throw|return|var|if|else)\b/gm,
    replacement: '<span class="keyword">$1</span>',
  },
];

const highlight = (js) =>
  highlightPatterns.reduce((result, { regex, replacement }) =>
    result.replace(regex, replacement),
    js
  );

exports.highlightTags = (name) => {
  const code = document.getElementById('mocha').getElementsByTagName(name);
  for (let i = 0; i < code.length; ++i) {
    code[i].innerHTML = highlight(code[i].innerHTML);
  }
};

const emptyRepresentation = (value, typeHint) => {
  const representations = {
    function: '[Function]',
    object: '{}',
    array: '[]',
  };
  return representations[typeHint] || value.toString();
};

const type = (exports.type = (value) => {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Buffer.isBuffer(value)) return 'buffer';
  return Object.prototype.toString
    .call(value)
    .replace(/^\[.+\s(.+?)]$/, '$1')
    .toLowerCase();
});

const repeat = (s, n) => new Array(n).join(s);

const stringifyValue = (val, spaces, depth) => {
  const valueType = type(val);
  switch (valueType) {
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
      return val === 0 && 1 / val === -Infinity ? '-0' : val.toString();
    case 'date':
      const dateStr = isNaN(val.getTime()) ? val.toString() : val.toISOString();
      return `[Date: ${dateStr}]`;
    case 'buffer':
      const json = val.toJSON();
      const bufferData = json.data && json.type ? json.data : json;
      return `[Buffer: ${jsonStringify(bufferData, 2, depth + 1)}]`;
    default:
      return val === '[Function]' || val === '[Circular]'
        ? val
        : JSON.stringify(val);
  }
};

const jsonStringify = (object, spaces, depth) => {
  if (typeof spaces === 'undefined') {
    return stringifyValue(object, spaces, depth);
  }

  depth = depth || 1;
  const space = spaces * depth;
  const isArray = Array.isArray(object);
  const str = isArray ? '[' : '{';
  const end = isArray ? ']' : '}';
  const length =
    typeof object.length === 'number'
      ? object.length
      : Object.keys(object).length;

  let result = str;
  let itemCount = length;

  for (const i in object) {
    if (!Object.prototype.hasOwnProperty.call(object, i)) continue;
    itemCount--;
    result +=
      `\n ${repeat(' ', space)}` +
      (isArray ? '' : `"${i}": `) +
      stringifyValue(object[i], spaces, depth) +
      (itemCount ? ',' : '');
  }

  return (
    result +
    (result.length !== 1 ? `\n${repeat(' ', --space)}${end}` : end)
  );
};

exports.stringify = (value) => {
  const typeHint = type(value);

  if (!~['object', 'array', 'function'].indexOf(typeHint)) {
    if (typeHint === 'buffer') {
      const json = Buffer.prototype.toJSON.call(value);
      return jsonStringify(json.data && json.type ? json.data : json, 2).replace(
        /,(\n|$)/g,
        '$1'
      );
    }

    if (typeHint === 'string' && typeof value === 'object') {
      const stringObj = value.split('').reduce((acc, char, idx) => {
        acc[idx] = char;
        return acc;
      }, {});
      return jsonStringify(exports.canonicalize(stringObj, null, 'object'), 2).replace(
        /,(\n|$)/g,
        '$1'
      );
    }

    return jsonStringify(value);
  }

  for (const prop in value) {
    if (Object.prototype.hasOwnProperty.call(value, prop)) {
      return jsonStringify(exports.canonicalize(value, null, typeHint), 2).replace(
        /,(\n|$)/g,
        '$1'
      );
    }
  }

  return emptyRepresentation(value, typeHint);
};

exports.canonicalize = (value, stack, typeHint) => {
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
        canonicalizedObj = value.map((item) =>
          exports.canonicalize(item, stack)
        );
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
        Object.keys(value)
          .sort()
          .forEach((key) => {
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

const createExtensionRegex = (extensions) =>
  new RegExp(EXTENSION_PATTERN_PREFIX + extensions.join('|') + EXTENSION_PATTERN_SUFFIX);

const lookupFilesRecursive = (filePath, extensions, recursive, files = []) => {
  const extensionRegex = createExtensionRegex(extensions);

  readdirSync(filePath).forEach((file) => {
    file = join(filePath, file);
    try {
      const stat = statSync(file);
      if (stat.isDirectory()) {
        if (recursive) {
          lookupFilesRecursive(file, extensions, recursive, files);
        }
        return;
      }

      if (stat.isFile() && extensionRegex.test(file) && basename(file)[0] !== '.') {
        files.push(file);
      }
    } catch (err) {
      // ignore error
    }
  });

  return files;
};

exports.lookupFiles = (filePath, extensions, recursive) => {
  if (!existsSync(filePath)) {
    if (existsSync(filePath + '.js')) {
      return filePath + '.js';
    }
    const files = glob.sync(filePath);
    if (!files.length) {
      throw new Error(`cannot resolve path (or pattern) '${filePath}'`);
    }
    return files;
  }

  try {
    const stat = statSync(filePath);
    if (stat.isFile()) {
      return filePath;
    }
  } catch (err) {
    return;
  }

  return lookupFilesRecursive(filePath, extensions, recursive);
};

exports.undefinedError = () =>
  new Error('Caught undefined error, did you throw without specifying what?');

exports.getError = (err) => err || exports.undefinedError();

exports.stackTraceFilter = () => {
  const isNode = typeof document === 'undefined';
  const slash = isNode ? path.sep : '/';
  const cwd = isNode
    ? process.cwd() + slash
    : (typeof location === 'undefined' ? window.location : location).href.replace(
        /\/[^/]*$/,
        '/'
      );

  const isMochaInternal = (line) =>
    [
      `node_modules${slash}mocha${slash}`,
      `node_modules${slash}mocha.js`,
      `bower_components${slash}mocha.js`,
      `${slash}mocha.js`,
    ].some((pattern) => ~line.indexOf(pattern));

  const isNodeInternal = (line) =>
    [
      '(timers.js:',
      '(events.js:',
      '(node.js:',
      '(module.js:',
      'GeneratorFunctionPrototype.next (native)',
    ].some((pattern) => ~line.indexOf(pattern));

  return (stack) => {
    stack = stack
      .split('\n')
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
      }, []);

    return stack.join('\n');
  };
};

exports.isPromise = (value) =>
  typeof value === 'object' && typeof value.then === 'function';

exports.noop = () => {};
```