```javascript
'use strict';

var grunt = require('../grunt');

// Nodejs libs.
var fs = require('fs');
var path = require('path');

// External libs.
var glob = require('glob');
var minimatch = require('minimatch');
var findup = require('findup-sync');
var YAML = require('js-yaml');
var rimraf = require('rimraf');
var iconv = require('iconv-lite');
var mkdirp = require('mkdirp').sync;

// Constants
var WIN32 = process.platform === 'win32';
var PATH_SEPARATOR_RE = /[\/\\]/g;
var EXT_DOT_RE = {
  first: /(\.[^\/]*)?$/,
  last: /(\.[^\/\.]*)?$/,
};

// The module to be exported.
var file = module.exports = {
  glob: glob,
  minimatch: minimatch,
  findup: findup,
  defaultEncoding: 'utf8',
  preserveBOM: false
};

// Utility functions
var unixifyPath = function(filepath) {
  return WIN32 ? filepath.replace(/\\/g, '/') : filepath;
};

var normalizePatterns = function(patterns) {
  return Array.isArray(patterns) ? patterns : [patterns];
};

var normalizeFilepaths = function(filepaths) {
  return Array.isArray(filepaths) ? filepaths : [filepaths];
};

var isValidPatternAndFilepaths = function(patterns, filepaths) {
  return patterns != null && filepaths != null && patterns.length > 0 && filepaths.length > 0;
};

var processPatterns = function(patterns, fn) {
  var result = [];
  grunt.util._.flattenDeep(patterns).forEach(function(pattern) {
    var exclusion = pattern.indexOf('!') === 0;
    if (exclusion) { pattern = pattern.slice(1); }
    var matches = fn(pattern);
    result = exclusion
      ? grunt.util._.difference(result, matches)
      : grunt.util._.union(result, matches);
  });
  return result;
};

var applyFilterToMatches = function(matches, options) {
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

var buildDestPath = function(src, options) {
  var destPath = src;
  if (options.flatten) {
    destPath = path.basename(destPath);
  }
  if ('ext' in options) {
    destPath = destPath.replace(EXT_DOT_RE[options.extDot], options.ext);
  }
  return destPath;
};

var createFileMapping = function(src, dest, fileByDest, files) {
  dest = dest.replace(PATH_SEPARATOR_RE, '/');
  src = src.replace(PATH_SEPARATOR_RE, '/');
  
  if (fileByDest[dest]) {
    fileByDest[dest].src.push(src);
  } else {
    var mapping = { src: [src], dest: dest };
    files.push(mapping);
    fileByDest[dest] = mapping;
  }
};

var handleFileOperation = function(operation, filepath, options) {
  var nowrite = grunt.option('no-write');
  var message = nowrite ? 'Not actually ' + operation + ' ' : operation.charAt(0).toUpperCase() + operation.slice(1) + ' ';
  grunt.verbose.write(message + filepath + '...');
  return nowrite;
};

var readFileWithEncoding = function(filepath, options) {
  var contents = fs.readFileSync(String(filepath));
  if (options.encoding !== null) {
    contents = iconv.decode(contents, options.encoding || file.defaultEncoding, {stripBOM: !file.preserveBOM});
  }
  return contents;
};

var parseFileContent = function(filepath, parser, options) {
  var src = file.read(filepath, options);
  var result;
  grunt.verbose.write('Parsing ' + filepath + '...');
  try {
    result = parser(src);
    grunt.verbose.ok();
    return result;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Unable to parse "' + filepath + '" file (' + e.message + ').', e);
  }
};

var resolvePath = function() {
  return path.join.apply(path, arguments);
};

var resolveRealPath = function() {
  return fs.realpathSync(resolvePath.apply(null, arguments));
};

// Public API
file.setBase = function() {
  var dirpath = resolvePath.apply(null, arguments);
  process.chdir(dirpath);
};

file.match = function(options, patterns, filepaths) {
  if (grunt.util.kindOf(options) !== 'object') {
    filepaths = patterns;
    patterns = options;
    options = {};
  }
  
  patterns = normalizePatterns(patterns);
  filepaths = normalizeFilepaths(filepaths);
  
  if (!isValidPatternAndFilepaths(patterns, filepaths)) { return []; }
  
  return processPatterns(patterns, function(pattern) {
    return minimatch.match(filepaths, pattern, options);
  });
};

file.isMatch = function() {
  return file.match.apply(file, arguments).length > 0;
};

file.expand = function() {
  var args = grunt.util.toArray(arguments);
  var options = grunt.util.kindOf(args[0]) === 'object' ? args.shift() : {};
  var patterns = Array.isArray(args[0]) ? args[0] : args;
  
  if (patterns.length === 0) { return []; }
  
  var matches = processPatterns(patterns, function(pattern) {
    return glob.sync(pattern, options);
  });
  
  return applyFilterToMatches(matches, options);
};

file.expandMapping = function(patterns, destBase, options) {
  options = grunt.util._.defaults({}, options, {
    extDot: 'first',
    rename: function(destBase, destPath) {
      return path.join(destBase || '', destPath);
    }
  });
  
  var files = [];
  var fileByDest = {};
  
  file.expand(options, patterns).forEach(function(src) {
    var destPath = buildDestPath(src, options);
    var dest = options.rename(destBase, destPath, options);
    if (options.cwd) { src = path.join(options.cwd, src); }
    createFileMapping(src, dest, fileByDest, files);
  });
  
  return files;
};

file.mkdir = function(dirpath, mode) {
  if (grunt.option('no-write')) { return; }
  try {
    mkdirp(dirpath, { mode: mode });
  } catch (e) {
    throw grunt.util.error('Unable to create directory "' + dirpath + '" (Error code: ' + e.code + ').', e);
  }
};

file.recurse = function recurse(rootdir, callback, subdir) {
  var abspath = subdir ? path.join(rootdir, subdir) : rootdir;
  fs.readdirSync(abspath).forEach(function(filename) {
    var filepath = path.join(abspath, filename);
    if (fs.statSync(filepath).isDirectory()) {
      recurse(rootdir, callback, unixifyPath(path.join(subdir || '', filename || '')));
    } else {
      callback(unixifyPath(filepath), rootdir, subdir, filename);
    }
  });
};

file.read = function(filepath, options) {
  options = options || {};
  grunt.verbose.write('Reading ' + filepath + '...');
  try {
    var contents = readFileWithEncoding(filepath, options);
    grunt.verbose.ok();
    return contents;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Unable to read "' + filepath + '" file (Error code: ' + e.code + ').', e);
  }
};

file.readJSON = function(filepath, options) {
  return parseFileContent(filepath, JSON.parse, options);
};

file.readYAML = function(filepath, options, yamlOptions) {
  options = options || {};
  yamlOptions = yamlOptions || {};
  
  return parseFileContent(filepath, function(src) {
    return yamlOptions.unsafeLoad ? YAML.load(src) : YAML.safeLoad(src);
  }, options);
};

file.write = function(filepath, contents, options) {
  options = options || {};
  var nowrite = handleFileOperation('write', filepath, options);
  
  file.mkdir(path.dirname(filepath));
  try {
    if (!Buffer.isBuffer(contents)) {
      contents = iconv.encode(contents, options.encoding || file.defaultEncoding);
    }
    if (!nowrite) {
      fs.writeFileSync(filepath, contents, 'mode' in options ? {mode: options.mode} : {});
    }
    grunt.verbose.ok();
    return true;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Unable to write "' + filepath + '" file (Error code: ' + e.code + ').', e);
  }
};

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
  var process = options.process && options.noProcess !== true &&
    !(options.noProcess && file.isMatch(options.noProcess, srcpath));
  var readWriteOptions = process ? options : {encoding: null};
  var contents = file.read(srcpath, readWriteOptions);
  
  if (process) {
    grunt.verbose.write('Processing source...');
    try {
      contents = options.process(contents, srcpath, destpath);
      grunt.verbose.ok();
    } catch (e) {
      grunt.verbose.error();
      throw grunt.util.error('Error while processing "' + srcpath + '" file.', e);
    }
  }
  
  if (contents === false) {
    grunt.verbose.writeln('Write aborted.');
  } else {
    file.write(destpath, contents, readWriteOptions);
  }
};

file.delete = function(filepath, options) {
  filepath = String(filepath);
  var nowrite = grunt.option('no-write');
  options = options || {force: grunt.option('force') || false};
  
  grunt.verbose.write((nowrite ? 'Not actually deleting ' : 'Deleting ') + filepath + '...');
  
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
    } else if (!file.isPathInCwd(filepath)) {
      grunt.verbose.error();
      grunt.fail.warn('Cannot delete files outside the current working directory.');
      return false;
    }
  }
  
  try {
    if (!nowrite) {
      rimraf.sync(filepath);
    }
    grunt.verbose.ok();
    return true;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Unable to delete "' + filepath + '" file (' + e.message + ').', e);
  }
};

file.exists = function() {
  return fs.existsSync(resolvePath.apply(null, arguments));
};

file.isLink = function() {
  var filepath = resolvePath.apply(null, arguments);
  try {
    return fs.lstatSync(filepath).isSymbolicLink();
  } catch (e) {
    if (e.code === 'ENOENT') { return false; }
    throw grunt.util.error('Unable to read "' + filepath + '" file (Error code: ' + e.code + ').', e);
  }
};

file.isDir = function() {
  var filepath = resolvePath.apply(null, arguments);
  return file.exists(filepath) && fs.statSync(filepath).isDirectory();
};

file.isFile = function() {
  var filepath = resolvePath.apply(null, arguments);
  return file.exists(filepath) && fs.statSync(filepath).isFile();
};

file.isPathAbsolute = function() {
  return path.isAbsolute(resolvePath.apply(null, arguments));
};

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

file.isPathCwd = function() {
  try {
    return file.arePathsEquivalent(resolveRealPath(process.cwd()), resolveRealPath.apply(null, arguments));
  } catch (e) {
    return false;
  }
};

file.isPathInCwd = function() {
  try {
    return file.doesPathContain(resolveRealPath(process.cwd()), resolveRealPath.apply(null, arguments));
  } catch (e) {
    return false;
  }
};
```