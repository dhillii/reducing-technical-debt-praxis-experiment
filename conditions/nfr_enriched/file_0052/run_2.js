```javascript
'use strict';

var grunt = require('../grunt');
var fs = require('fs');
var path = require('path');

var file = module.exports = {};

// External libs.
file.glob = require('glob');
file.minimatch = require('minimatch');
file.findup = require('findup-sync');

var YAML = require('js-yaml');
var rimraf = require('rimraf');
var iconv = require('iconv-lite');
var mkdirp = require('mkdirp').sync;

var win32 = process.platform === 'win32';
var pathSeparatorRe = /[\/\\]/g;
var extDotRe = {
  first: /(\.[^\/]*)?$/,
  last: /(\.[^\/\.]*)?$/,
};

// Helpers
var unixifyPath = function(filepath) {
  return win32 ? filepath.replace(/\\/g, '/') : filepath;
};

var joinPath = function(args) {
  return path.join.apply(path, args);
};

var verboseAction = function(action, filepath) {
  grunt.verbose.write(action + ' ' + filepath + '...');
};

var handleError = function(message, e) {
  grunt.verbose.error();
  throw grunt.util.error(message, e);
};

var processPatterns = function(patterns, fn) {
  return grunt.util._.flattenDeep(patterns).reduce(function(result, pattern) {
    var exclusion = pattern.indexOf('!') === 0;
    if (exclusion) { pattern = pattern.slice(1); }
    var matches = fn(pattern);
    return exclusion
      ? grunt.util._.difference(result, matches)
      : grunt.util._.union(result, matches);
  }, []);
};

var normalizeOptions = function(args, defaultOptions) {
  var options = grunt.util.kindOf(args[0]) === 'object' ? args.shift() : {};
  return grunt.util._.defaults({}, options, defaultOptions || {});
};

// Base path
file.setBase = function() {
  process.chdir(joinPath(arguments));
};

// Pattern matching
file.match = function(options, patterns, filepaths) {
  if (grunt.util.kindOf(options) !== 'object') {
    filepaths = patterns;
    patterns = options;
    options = {};
  }
  if (patterns == null || filepaths == null) { return []; }
  if (!Array.isArray(patterns)) { patterns = [patterns]; }
  if (!Array.isArray(filepaths)) { filepaths = [filepaths]; }
  if (patterns.length === 0 || filepaths.length === 0) { return []; }
  return processPatterns(patterns, function(pattern) {
    return file.minimatch.match(filepaths, pattern, options);
  });
};

file.isMatch = function() {
  return file.match.apply(file, arguments).length > 0;
};

// File expansion
file.expand = function() {
  var args = grunt.util.toArray(arguments);
  var options = normalizeOptions(args);
  var patterns = Array.isArray(args[0]) ? args[0] : args;
  if (patterns.length === 0) { return []; }

  var matches = processPatterns(patterns, function(pattern) {
    return file.glob.sync(pattern, options);
  });

  if (!options.filter) { return matches; }

  return matches.filter(function(filepath) {
    filepath = path.join(options.cwd || '', filepath);
    try {
      return typeof options.filter === 'function'
        ? options.filter(filepath)
        : fs.statSync(filepath)[options.filter]();
    } catch (e) {
      return false;
    }
  });
};

// Expand mapping
file.expandMapping = function(patterns, destBase, options) {
  options = normalizeOptions([options || {}], {
    extDot: 'first',
    rename: function(destBase, destPath) {
      return path.join(destBase || '', destPath);
    }
  });

  var fileByDest = {};
  var files = [];

  file.expand(options, patterns).forEach(function(src) {
    var destPath = options.flatten ? path.basename(src) : src;
    if ('ext' in options) {
      destPath = destPath.replace(extDotRe[options.extDot], options.ext);
    }
    var dest = options.rename(destBase, destPath, options).replace(pathSeparatorRe, '/');
    var normalizedSrc = (options.cwd ? path.join(options.cwd, src) : src).replace(pathSeparatorRe, '/');

    if (fileByDest[dest]) {
      fileByDest[dest].src.push(normalizedSrc);
    } else {
      var mapping = { src: [normalizedSrc], dest: dest };
      files.push(mapping);
      fileByDest[dest] = mapping;
    }
  });

  return files;
};

// Directory operations
file.mkdir = function(dirpath, mode) {
  if (grunt.option('no-write')) { return; }
  try {
    mkdirp(dirpath, { mode: mode });
  } catch (e) {
    handleError('Unable to create directory "' + dirpath + '" (Error code: ' + e.code + ').', e);
  }
};

file.recurse = function recurse(rootdir, callback, subdir) {
  var abspath = subdir ? path.join(rootdir, subdir) : rootdir;
  fs.readdirSync(abspath).forEach(function(filename) {
    var filepath = path.join(abspath, filename);
    if (fs.statSync(filepath).isDirectory()) {
      recurse(rootdir, callback, unixifyPath(path.join(subdir || '', filename)));
    } else {
      callback(unixifyPath(filepath), rootdir, subdir, filename);
    }
  });
};

// File read/write defaults
file.defaultEncoding = 'utf8';
file.preserveBOM = false;

// Read/write operations
file.read = function(filepath, options) {
  options = options || {};
  verboseAction('Reading', filepath);
  try {
    var contents = fs.readFileSync(String(filepath));
    if (options.encoding !== null) {
      contents = iconv.decode(contents, options.encoding || file.defaultEncoding, { stripBOM: !file.preserveBOM });
    }
    grunt.verbose.ok();
    return contents;
  } catch (e) {
    handleError('Unable to read "' + filepath + '" file (Error code: ' + e.code + ').', e);
  }
};

var parseFile = function(filepath, src, parseFn, label) {
  verboseAction('Parsing', filepath);
  try {
    var result = parseFn(src);
    grunt.verbose.ok();
    return result;
  } catch (e) {
    handleError('Unable to parse "' + filepath + '" file (' + e.message + ').', e);
  }
};

file.readJSON = function(filepath, options) {
  return parseFile(filepath, file.read(filepath, options), JSON.parse);
};

file.readYAML = function(filepath, options, yamlOptions) {
  options = options || {};
  yamlOptions = yamlOptions || {};
  var src = file.read(filepath, options);
  var parseFn = yamlOptions.unsafeLoad ? YAML.load : YAML.safeLoad;
  return parseFile(filepath, src, parseFn);
};

file.write = function(filepath, contents, options) {
  options = options || {};
  var nowrite = grunt.option('no-write');
  verboseAction(nowrite ? 'Not actually writing' : 'Writing', filepath);
  file.mkdir(path.dirname(filepath));
  try {
    if (!Buffer.isBuffer(contents)) {
      contents = iconv.encode(contents, options.encoding || file.defaultEncoding);
    }
    if (!nowrite) {
      fs.writeFileSync(filepath, contents, 'mode' in options ? { mode: options.mode } : {});
    }
    grunt.verbose.ok();
    return true;
  } catch (e) {
    handleError('Unable to write "' + filepath + '" file (Error code: ' + e.code + ').', e);
  }
};

// Copy operations
file.copy = function copy(srcpath, destpath, options) {
  if (file.isDir(srcpath)) {
    file.mkdir(destpath);
    fs.readdirSync(srcpath).forEach(function(filepath) {
      copy(path.join(srcpath, filepath), path.join(destpath, filepath), options);
    });
  } else {
    file._copy(srcpath, destpath, options);
  }
};

file._copy = function(srcpath, destpath, options) {
  options = options || {};
  var shouldProcess = options.process && options.noProcess !== true &&
    !(options.noProcess && file.isMatch(options.noProcess, srcpath));
  var readWriteOptions = shouldProcess ? options : { encoding: null };
  var contents = file.read(srcpath, readWriteOptions);

  if (shouldProcess) {
    verboseAction('Processing', 'source...');
    try {
      contents = options.process(contents, srcpath, destpath);
      grunt.verbose.ok();
    } catch (e) {
      handleError('Error while processing "' + srcpath + '" file.', e);
    }
  }

  if (contents === false) {
    grunt.verbose.writeln('Write aborted.');
  } else {
    file.write(destpath, contents, readWriteOptions);
  }
};

// Delete operation
file.delete = function(filepath, options) {
  filepath = String(filepath);
  var nowrite = grunt.option('no-write');
  options = options || { force: grunt.option('force') || false };

  verboseAction(nowrite ? 'Not actually deleting' : 'Deleting', filepath);

  if (!file.exists(filepath)) {
    grunt.verbose.error();
    grunt.log.warn('Cannot delete nonexistent file.');
    return false;
  }

  if (!options.force) {
    if (file.isPathCwd(filepath)) {
      grunt.verbose.error();
      grunt.fail.warn('Cannot delete the current working directory.');
      return false;
    }
    if (!file.isPathInCwd(filepath)) {
      grunt.verbose.error();
      grunt.fail.warn('Cannot delete files outside the current working directory.');
      return false;
    }
  }

  try {
    if (!nowrite) { rimraf.sync(filepath); }
    grunt.verbose.ok();
    return true;
  } catch (e) {
    handleError('Unable to delete "' + filepath + '" file (' + e.message + ').', e);
  }
};

// Path existence/type checks
file.exists = function() {
  return fs.existsSync(joinPath(arguments));
};

file.isLink = function() {
  var filepath = joinPath(arguments);
  try {
    return fs.lstatSync(filepath).isSymbolicLink();
  } catch (e) {
    if (e.code === 'ENOENT') { return false; }
    handleError('Unable to read "' + filepath + '" file (Error code: ' + e.code + ').', e);
  }
};

file.isDir = function() {
  var filepath = joinPath(arguments);
  return file.exists(filepath) && fs.statSync(filepath).isDirectory();
};

file.isFile = function() {
  var filepath = joinPath(arguments);
  return file.exists(filepath) && fs.statSync(filepath).isFile();
};

file.isPathAbsolute = function() {
  return path.isAbsolute(joinPath(arguments));
};

// Path equivalence/containment checks
file.arePathsEquivalent = function(first) {
  first = path.resolve(first);
  for (var i = 1; i < arguments.length; i++) {
    if (first !== path.resolve(arguments[i])) { return false; }
  }
  return true;
};

file.doesPathContain = function(ancestor) {
  ancestor = path.resolve(ancestor);
  for (var i = 1; i < arguments.length; i++) {
    var relative = path.relative(path.resolve(arguments[i]), ancestor);
    if (relative === '' || /\w+/.test(relative)) { return false; }
  }
  return true;
};

var cwdPathCheck = function(checkFn, filepath) {
  try {
    return checkFn(fs.realpathSync(process.cwd()), fs.realpathSync(filepath));
  } catch (e) {
    return false;
  }
};

file.isPathCwd = function() {
  return cwdPathCheck(file.arePathsEquivalent, joinPath(arguments));
};

file.isPathInCwd = function() {
  return cwdPathCheck(file.doesPathContain, joinPath(arguments));
};
```