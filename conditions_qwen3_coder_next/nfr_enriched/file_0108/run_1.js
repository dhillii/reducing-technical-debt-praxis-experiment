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

exports.inherits = require('util').inherits;

exports.escape = function (html) {
  return he.encode(String(html), { useNamedReferences: false });
};

exports.isString = function (obj) {
  return typeof obj === 'string';
};

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

var ignore = ['node_modules', '.git'];

function isNotIgnored (item) {
  return !~ignore.indexOf(item);
}

exports.files = function (dir, ext, ret) {
  ret = ret || [];
  ext = ext || ['js'];

  var re = new RegExp('\\.(' + ext.join('|') + ')$');

  readdirSync(dir)
    .filter(isNotIgnored)
    .forEach(function (item) {
      var fullPath = join(dir, item);
      var stats = lstatSync(fullPath);

      if (stats.isDirectory()) {
        exports.files(fullPath, ext, ret);
      } else if (re.test(fullPath)) {
        ret.push(fullPath);
      }
    });

  return ret;
};

exports.slug = function (str) {
  return str
    .toLowerCase()
    .replace(/ +/g, '-')
    .replace(/[^-\w]/g, '');
};

exports.clean = function (str) {
  str = str
    .replace(/\r\n?|[\n\u2028\u2029]/g, '\n').replace(/^\uFEFF/, '')
    // (traditional)->  space/name     parameters    body     (lambda)-> parameters       body   multi-statement/single          keep body content
    .replace(/^function(?:\s*|\s+[^(]*)\([^)]*\)\s*\{((?:.|\n)*?)\s*\}$|^\([^)]*\)\s*=>\s*(?:\{((?:.|\n)*?)\s*\}|((?:.|\n)*))$/, '$1$2$3');

  var spaces = str.match(/^\n?( *)/)[1].length;
  var tabs = str.match(/^\n?(\t*)/)[1].length;
  var indentPattern = '^\n?' + (tabs ? '\t' : ' ') + '{' + (tabs || spaces) + '}';

  var re = new RegExp(indentPattern, 'gm');
  str = str.replace(re, '');

  return str.trim();
};

exports.parseQuery = function (qs) {
  return qs.replace('?', '').split('&').reduce(function (obj, pair) {
    var i = pair.indexOf('=');
    var key = pair.slice(0, i);
    var val = pair.slice(++i);

    obj[key] = decodeURIComponent(val.replace(/\+/g, '%20'));
    return obj;
  }, {});
};

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

exports.highlightTags = function (name) {
  var codes = document.getElementById('mocha').getElementsByTagName(name);
  for (var i = 0, len = codes.length; i < len; ++i) {
    codes[i].innerHTML = highlight(codes[i].innerHTML);
  }
};

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

function detectType (value) {
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

var type = exports.type = detectType;

function jsonStringifyValue (val) {
  switch (detectType(val)) {
    case 'null':
    case 'undefined':
      return '[' + val + ']';
    case 'array':
    case 'object':
      return jsonStringify(val);
    case 'boolean':
    case 'regexp':
    case 'symbol':
    case 'number':
      return val === 0 && (1 / val) === -Infinity ? '-0' : val.toString();
    case 'date':
      var sDate = isNaN(val.getTime()) ? val.toString() : val.toISOString();
      return '[Date: ' + sDate + ']';
    case 'buffer':
      var json = val.toJSON();
      json = json.data && json.type ? json.data : json;
      return '[Buffer: ' + jsonStringify(json, 2, 1) + ']';
    default:
      return (val === '[Function]' || val === '[Circular]')
        ? val
        : JSON.stringify(val);
  }
}

function jsonStringify (object, spaces, depth) {
  if (typeof spaces === 'undefined') {
    return jsonStringifyValue(object);
  }

  depth = depth || 1;
  var space = spaces * depth;
  var str = Array.isArray(object) ? '[' : '{';
  var end = Array.isArray(object) ? ']' : '}';
  var length = typeof object.length === 'number' ? object.length : Object.keys(object).length;

  function repeat (s, n) {
    return new Array(n).join(s);
  }

  for (var i in object) {
    if (!Object.prototype.hasOwnProperty.call(object, i)) {
      continue;
    }
    --length;
    str += '\n ' + repeat(' ', space) +
      (Array.isArray(object) ? '' : '"' + i + '": ') +
      jsonStringifyValue(object[i]) +
      (length ? ',' : '');
  }

  return str +
    (str.length !== 1 ? '\n' + repeat(' ', --space) + end : end);
}

exports.stringify = function (value) {
  var typeHint = detectType(value);

  if (!~['object', 'array', 'function'].indexOf(typeHint)) {
    if (typeHint === 'buffer') {
      var json = Buffer.prototype.toJSON.call(value);
      return jsonStringify(json.data && json.type ? json.data : json, 2)
        .replace(/,(\n|$)/g, '$1');
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
      return jsonStringify(exports.canonicalize(value, null, typeHint), 2).replace(/,(\n|$)/g, '$1');
    }
  }

  return emptyRepresentation(value, typeHint);
};

exports.canonicalize = function canonicalize (value, stack, typeHint) {
  typeHint = typeHint || detectType(value);
  stack = stack || [];

  if (stack.indexOf(value) !== -1) {
    return '[Circular]';
  }

  function withStack (value, fn) {
    stack.push(value);
    fn();
    stack.pop();
  }

  var canonicalizedObj;

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
      for (var prop in value) {
        canonicalizedObj = {};
        break;
      }
      if (!canonicalizedObj) {
        canonicalizedObj = emptyRepresentation(value, typeHint);
      }
      break;
    case 'object':
      canonicalizedObj = canonicalizedObj || {};
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
      canonicalizedObj = value + '';
  }

  return canonicalizedObj;
};

exports.lookupFiles = function lookupFiles (path, extensions, recursive) {
  var files = [];

  if (!exists(path)) {
    if (exists(path + '.js')) {
      path += '.js';
    } else {
      files = glob.sync(path);
      if (!files.length) {
        throw new Error("cannot resolve path (or pattern) '" + path + "'");
      }
      return files;
    }
  }

  try {
    var stat = statSync(path);
    if (stat.isFile()) {
      return [path];
    }
  } catch (err) {
    return [];
  }

  readdirSync(path).forEach(function (file) {
    file = join(path, file);
    try {
      var stat = statSync(file);
      if (stat.isDirectory()) {
        if (recursive) {
          files = files.concat(lookupFiles(file, extensions, recursive));
        }
        return;
      }
    } catch (err) {
      return;
    }

    if (!stat.isFile()) {
      return;
    }

    var re = new RegExp('\\.(?:' + extensions.join('|') + ')$');
    if (re.test(file) && basename(file)[0] !== '.') {
      files.push(file);
    }
  });

  return files;
};

exports.undefinedError = function () {
  return new Error('Caught undefined error, did you throw without specifying what?');
};

exports.getError = function (err) {
  return err || exports.undefinedError();
};

exports.stackTraceFilter = function () {
  var isNode = typeof document === 'undefined';
  var slash = path.sep;
  var cwd;

  if (isNode) {
    cwd = process.cwd() + slash;
  } else {
    cwd = (typeof location === 'undefined' ? window.location : location).href.replace(/\/[^/]*$/, '/');
    slash = '/';
  }

  function isMochaInternal (line) {
    return (~line.indexOf('node_modules' + slash + 'mocha' + slash)) ||
      (~line.indexOf('node_modules' + slash + 'mocha.js')) ||
      (~line.indexOf('bower_components' + slash + 'mocha.js')) ||
      (~line.indexOf(slash + 'mocha.js'));
  }

  function isNodeInternal (line) {
    return (~line.indexOf('(timers.js:')) ||
      (~line.indexOf('(events.js:')) ||
      (~line.indexOf('(node.js:')) ||
      (~line.indexOf('(module.js:')) ||
      (~line.indexOf('GeneratorFunctionPrototype.next (native)')) ||
      false;
  }

  return function (stack) {
    stack = stack.split('\n');

    return stack.reduce(function (list, line) {
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
    }, []).join('\n');
  };
};

exports.isPromise = function isPromise (value) {
  return typeof value === 'object' && typeof value.then === 'function';
};

exports.noop = function () {};