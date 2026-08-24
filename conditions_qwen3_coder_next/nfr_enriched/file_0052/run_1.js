'use strict';

var grunt = require('../grunt');

// Nodejs libs.
var fs = require('fs');
var path = require('path');

// The module to be exported.
var file = module.exports = {};

// External libs.
file.glob = require('glob');
file.minimatch = require('minimatch');
file.findup = require('findup-sync');
var YAML = require('js-yaml');
var rimraf = require('rimraf');
var iconv = require('iconv-lite');
var mkdirp = require('mkdirp').sync;

// Windows?
var win32 = process.platform === 'win32';

// Normalize \\ paths to / paths.
var unixifyPath = function(filepath) {
  if (win32) {
    return filepath.replace(/\\/g, '/');
  } else {
    return filepath;
  }
};

// Change the current base path (ie, CWD) to the specified path.
file.setBase = function() {
  var dirpath = path.join.apply(path, arguments);
  process.chdir(dirpath);
};

// Process specified wildcard glob patterns or filenames against a
// callback, excluding and uniquing files in the result set.
var processPatterns = function(patterns, fn) {
  const result = [];
  const flattenedPatterns = grunt.util._.flattenDeep(patterns);

  flattenedPatterns.forEach(function(pattern) {
    const exclusion = pattern.startsWith('!');
    const cleanPattern = exclusion ? pattern.slice(1) : pattern;
    const matches = fn(cleanPattern);

    if (exclusion) {
      result = grunt.util._.difference(result, matches);
    } else {
      result = grunt.util._.union(result, matches);
    }
  });

  return result;
};

// Match a filepath or filepaths against one or more wildcard patterns. Returns
// all matching filepaths.
file.match = function(options, patterns, filepaths) {
  if (grunt.util.kindOf(options) !== 'object') {
    filepaths = patterns;
    patterns = options;
    options = {};
  }
  if (patterns == null || filepaths == null) {
    return [];
  }
  const normalizedPatterns = Array.isArray(patterns) ? patterns : [patterns];
  const normalizedFilepaths = Array.isArray(filepaths) ? filepaths : [filepaths];

  if (normalizedPatterns.length === 0 || normalizedFilepaths.length === 0) {
    return [];
  }

  return processPatterns(normalizedPatterns, function(pattern) {
    return file.minimatch.match(normalizedFilepaths, pattern, options);
  });
};

// Match a filepath or filepaths against one or more wildcard patterns. Returns
// true if any of the patterns match.
file.isMatch = function() {
  return file.match.apply(file, arguments).length > 0;
};

// Return an array of all file paths that match the given wildcard patterns.
file.expand = function() {
  const args = grunt.util.toArray(arguments);
  const options = grunt.util.kindOf(args[0]) === 'object' ? args.shift() : {};
  const patterns = Array.isArray(args[0]) ? args[0] : args;

  if (patterns.length === 0) {
    return [];
  }

  let matches = processPatterns(patterns, function(pattern) {
    return file.glob.sync(pattern, options);
  });

  if (options.filter) {
    matches = matches.filter(function(filepath) {
      const joinedPath = path.join(options.cwd || '', filepath);
      try {
        if (typeof options.filter === 'function') {
          return options.filter(joinedPath);
        } else {
          return fs.statSync(joinedPath)[options.filter]();
        }
      } catch (e) {
        return false;
      }
    });
  }

  return matches;
};

var pathSeparatorRe = /[\/\\]/g;

// The "ext" option refers to either everything after the first dot (default)
// or everything after the last dot.
var extDotRe = {
  first: /(\.[^\/]*)?$/,
  last: /(\.[^\/\.]*)?$/,
};

// Build a multi task "files" object dynamically.
file.expandMapping = function(patterns, destBase, options) {
  options = grunt.util._.defaults({}, options, {
    extDot: 'first',
    rename: function(destBase, destPath) {
      return path.join(destBase || '', destPath);
    }
  });

  const files = [];
  const fileByDest = {};

  file.expand(options, patterns).forEach(function(src) {
    const destPath = processDestPath(src, options);

    const dest = options.rename(destBase, destPath, options);
    const normalizedSrc = prependCwdIfPresent(src, options);
    const normalizedDest = normalizePath(dest);

    mapFileDest(normalizedSrc, normalizedDest, files, fileByDest);
  });

  return files;
};

// Process destination path based on options
function processDestPath(src, options) {
  let destPath = src;
  if (options.flatten) {
    destPath = path.basename(destPath);
  }
  if ('ext' in options) {
    destPath = destPath.replace(extDotRe[options.extDot], options.ext);
  }
  return destPath;
}

// Prepend cwd to src if provided
function prependCwdIfPresent(src, options) {
  if (options.cwd) {
    return path.join(options.cwd, src);
  }
  return src;
}

// Normalize path separators to Unix-style
function normalizePath(filepath) {
  return filepath.replace(pathSeparatorRe, '/');
}

// Map source path to destination path in files collection
function mapFileDest(srcPath, destPath, files, fileByDest) {
  if (fileByDest[destPath]) {
    fileByDest[destPath].src.push(srcPath);
  } else {
    files.push({
      src: [srcPath],
      dest: destPath,
    });
    fileByDest[destPath] = files[files.length - 1];
  }
}

// Like mkdir -p. Create a directory and any intermediary directories.
file.mkdir = function(dirpath, mode) {
  if (grunt.option('no-write')) {
    return;
  }
  try {
    mkdirp(dirpath, { mode: mode });
  } catch (e) {
    throw grunt.util.error('Unable to create directory "' + dirpath + '" (Error code: ' + e.code + ').', e);
  }
};

// Recurse into a directory, executing callback for each file.
file.recurse = function recurse(rootdir, callback, subdir) {
  const abspath = subdir ? path.join(rootdir, subdir) : rootdir;
  const entries = fs.readdirSync(abspath);

  entries.forEach(function(filename) {
    const filepath = path.join(abspath, filename);
    if (fs.statSync(filepath).isDirectory()) {
      recurse(rootdir, callback, unixifyPath(path.join(subdir || '', filename || '')));
    } else {
      callback(unixifyPath(filepath), rootdir, subdir, filename);
    }
  });
};

// The default file encoding to use.
file.defaultEncoding = 'utf8';
// Whether to preserve the BOM on file.read rather than strip it.
file.preserveBOM = false;

// Read a file, return its contents.
file.read = function(filepath, options) {
  options = options || {};
  grunt.verbose.write('Reading ' + filepath + '...');

  try {
    let contents = fs.readFileSync(String(filepath));
    if (options.encoding !== null) {
      const encoding = options.encoding || file.defaultEncoding;
      contents = iconv.decode(contents, encoding, {stripBOM: !file.preserveBOM});
    }
    grunt.verbose.ok();
    return contents;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Unable to read "' + filepath + '" file (Error code: ' + e.code + ').', e);
  }
};

// Read a file, parse its contents, return an object.
file.readJSON = function(filepath, options) {
  const src = file.read(filepath, options);
  grunt.verbose.write('Parsing ' + filepath + '...');

  try {
    const result = JSON.parse(src);
    grunt.verbose.ok();
    return result;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Unable to parse "' + filepath + '" file (' + e.message + ').', e);
  }
};

// Read a YAML file, parse its contents, return an object.
file.readYAML = function(filepath, options, yamlOptions) {
  options = options || {};
  yamlOptions = yamlOptions || {};

  const src = file.read(filepath, options);
  grunt.verbose.write('Parsing ' + filepath + '...');

  try {
    const result = yamlOptions.unsafeLoad
      ? YAML.load(src)
      : YAML.safeLoad(src);
    grunt.verbose.ok();
    return result;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Unable to parse "' + filepath + '" file (' + e.message + ').', e);
  }
};

// Write a file.
file.write = function(filepath, contents, options) {
  options = options || {};
  const nowrite = grunt.option('no-write');
  grunt.verbose.write((nowrite ? 'Not actually writing ' : 'Writing ') + filepath + '...');

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

// Read a file, optionally processing its content, then write the output.
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

// Read a file, optionally processing its content, then write the output.
file._copy = function(srcpath, destpath, options) {
  options = options || {};
  const shouldProcess = options.process && options.noProcess !== true &&
    !(options.noProcess && file.isMatch(options.noProcess, srcpath));
  const readWriteOptions = shouldProcess ? options : {encoding: null};
  const contents = file.read(srcpath, readWriteOptions);

  if (shouldProcess) {
    grunt.verbose.write('Processing source...');
    try {
      const processedContents = options.process(contents, srcpath, destpath);
      grunt.verbose.ok();
      contents = processedContents;
    } catch (e) {
      grunt.verbose.error();
      throw grunt.util.error('Error while processing "' + srcpath + '" file.', e);
    }
  }

  if (contents !== false) {
    file.write(destpath, contents, readWriteOptions);
  } else {
    grunt.verbose.writeln('Write aborted.');
  }
};

// Delete folders or files recursively.
file.delete = function(filepath, options) {
  filepath = String(filepath);

  const nowrite = grunt.option('no-write');
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

// True if the file path exists.
file.exists = function() {
  const filepath = path.join.apply(path, arguments);
  return fs.existsSync(filepath);
};

// True if the file is a symbolic link.
file.isLink = function() {
  const filepath = path.join.apply(path, arguments);
  try {
    return fs.lstatSync(filepath).isSymbolicLink();
  } catch (e) {
    if (e.code === 'ENOENT') {
      return false;
    }
    throw grunt.util.error('Unable to read "' + filepath + '" file (Error code: ' + e.code + ').', e);
  }
};

// True if the path is a directory.
file.isDir = function() {
  const filepath = path.join.apply(path, arguments);
  return file.exists(filepath) && fs.statSync(filepath).isDirectory();
};

// True if the path is a file.
file.isFile = function() {
  const filepath = path.join.apply(path, arguments);
  return file.exists(filepath) && fs.statSync(filepath).isFile();
};

// Is a given file path absolute?
file.isPathAbsolute = function() {
  const filepath = path.join.apply(path, arguments);
  return path.isAbsolute(filepath);
};

// Do all the specified paths refer to the same path?
file.arePathsEquivalent = function(first) {
  first = path.resolve(first);
  for (let i = 1; i < arguments.length; i++) {
    if (first !== path.resolve(arguments[i])) {
      return false;
    }
  }
  return true;
};

// Are descendant path(s) contained within ancestor path? Note: does not test
// if paths actually exist.
file.doesPathContain = function(ancestor) {
  ancestor = path.resolve(ancestor);
  let relative;
  for (let i = 1; i < arguments.length; i++) {
    relative = path.relative(path.resolve(arguments[i]), ancestor);
    if (relative === '' || /\w+/.test(relative)) {
      return false;
    }
  }
  return true;
};

// Test to see if a filepath is the CWD.
file.isPathCwd = function() {
  const filepath = path.join.apply(path, arguments);
  try {
    return file.arePathsEquivalent(
      fs.realpathSync(process.cwd()),
      fs.realpathSync(filepath)
    );
  } catch (e) {
    return false;
  }
};

// Test to see if a filepath is contained within the CWD.
file.isPathInCwd = function() {
  const filepath = path.join.apply(path, arguments);
  try {
    return file.doesPathContain(fs.realpathSync(process.cwd()), fs.realpathSync(filepath));
  } catch (e) {
    return false;
  }
};