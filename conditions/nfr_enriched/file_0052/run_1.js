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

var joinArgs = function(args) {
  return path.join.apply(path, args);
};

var normalizeOptions = function(options) {
  return options || {};
};

var verboseAction = function(action, filepath) {
  grunt.verbose.write(action + ' ' + filepath + '...');
};

var handleError = function(message, e) {
  grunt.verbose.error();
  throw grunt.util.error(message, e);
};

// Change the current base path to the specified path.
file.setBase = function() {
  process.chdir(joinArgs(arguments));
};

// Process wildcard glob patterns or filenames against a callback,
// excluding and uniquing files in the result set.
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

// Match filepath(s) against one or more wildcard patterns.
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

// Returns true if any of the patterns match.
file.isMatch = function() {
  return file.match.apply(file, arguments).length > 0;
};

var applyFilter = function(matches, options) {
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

// Return an array of all file paths that match the given wildcard patterns.
file.expand = function() {
  var args = grunt.util.toArray(arguments);
  var options = grunt.util.kindOf(args[0]) === 'object' ? args.shift() : {};
  var patterns = Array.isArray(args[0]) ? args[0] : args;
  if (patterns.length === 0) { return []; }
  var matches = processPatterns(patterns, function(pattern) {
    return file.glob.sync(pattern, options);
  });
  return applyFilter(matches, options);
};

// Build a multi task "files" object dynamically.
file.expandMapping = function(patterns, destBase, options) {
  options = grunt.util._.defaults({}, options, {
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

// Like mkdir -p. Create a directory and any intermediary directories.
file.mkdir = function(dirpath, mode) {
  if (grunt.option('no-write')) { return; }
  try {
    mkdirp(dirpath, { mode: mode });
  } catch (e) {
    handleError('Unable to create directory "' + dirpath + '" (Error code: ' + e.code + ').', e);
  }
};

// Recurse into a directory, executing callback for each file.
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

file.defaultEncoding = 'utf8';
file.preserveBOM = false;

// Read a file, return its contents.
file.read = function(filepath, options) {
  options = normalizeOptions(options);
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

// Read a file, parse its contents as JSON, return an object.
file.readJSON = function(filepath, options) {
  return parseFile(filepath, file.read(filepath, options), JSON.parse, 'JSON');
};

// Read a YAML file, parse its contents, return an object.
file.readYAML = function(filepath, options, yamlOptions) {
  options = normalizeOptions(options);
  yamlOptions = normalizeOptions(yamlOptions);
  var src = file.read(filepath, options);
  var parseFn = yamlOptions.unsafeLoad ? YAML.load : YAML.safeLoad;
  return parseFile(filepath, src, parseFn, 'YAML');
};

// Write a file.
file.write = function(filepath, contents, options) {
  options = normalizeOptions(options);
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

// Read a file, optionally process its content, then write the output.
// Or read a directory, recursively creating directories, reading files,
// processing content, writing output.
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
  options = normalizeOptions(options);
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

// Delete folders and files recursively.
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

// True if the file path exists.
file.exists = function() {
  return fs.existsSync(joinArgs(arguments));
};

// True if the file is a symbolic link.
file.isLink = function() {
  var filepath = joinArgs(arguments);
  try {
    return fs.lstatSync(filepath).isSymbolicLink();
  } catch (e) {
    if (e.code === 'ENOENT') { return false; }
    handleError('Unable to read "' + filepath + '" file (Error code: ' + e.code + ').', e);
  }
};

// True if the path is a directory.
file.isDir = function() {
  var filepath = joinArgs(arguments);
  return file.exists(filepath) && fs.statSync(filepath).isDirectory();
};

// True if the path is a file.
file.isFile = function() {
  var filepath = joinArgs(arguments);
  return file.exists(filepath) && fs.statSync(filepath).isFile();
};

// Is a given file path absolute?
file.isPathAbsolute = function() {
  return path.isAbsolute(joinArgs(arguments));
};

// Do all the specified paths refer to the same path?
file.arePathsEquivalent = function(first) {
  first = path.resolve(first);
  return Array.from(arguments).slice(1).every(function(arg) {
    return first === path.resolve(arg);
  });
};

// Are descendant path(s) contained within ancestor path?
file.doesPathContain = function(ancestor) {
  ancestor = path.resolve(ancestor);
  return Array.from(arguments).slice(1).every(function(arg) {
    var relative = path.relative(path.resolve(arg), ancestor);
    return relative !== '' && !/\w+/.test(relative);
  });
};

var resolveRealPath = function(filepath) {
  return fs.realpathSync(filepath);
};

// Test to see if a filepath is the CWD.
file.isPathCwd = function() {
  var filepath = joinArgs(arguments);
  try {
    return file.arePathsEquivalent(resolveRealPath(process.cwd()), resolveRealPath(filepath));
  } catch (e) {
    return false;
  }
};

// Test to see if a filepath is contained within the CWD.
file.isPathInCwd = function() {
  var filepath = joinArgs(arguments);
  try {
    return file.doesPathContain(resolveRealPath(process.cwd()), resolveRealPath(filepath));
  } catch (e) {
    return false;
  }
};
```