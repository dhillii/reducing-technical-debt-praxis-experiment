'use strict';

const grunt = require('../grunt');

// Nodejs libs.
const fs = require('fs');
const path = require('path');

// The module to be exported.
const file = module.exports = {};

// External libs.
file.glob = require('glob');
file.minimatch = require('minimatch');
file.findup = require('findup-sync');
const YAML = require('js-yaml');
const rimraf = require('rimraf');
const iconv = require('iconv-lite');
const mkdirp = require('mkdirp').sync;

// Windows?
const win32 = process.platform === 'win32';

/**
 * Normalize Windows backslashes to forward slashes.
 * @param {string} filepath
 * @returns {string}
 */
const unixifyPath = function (filepath) {
  return win32 ? filepath.replace(/\\/g, '/') : filepath;
};

/**
 * Change the current base path (ie, CWD) to the specified path.
 * @param {...string} args
 */
file.setBase = function (...args) {
  const dirpath = path.join(...args);
  process.chdir(dirpath);
};

/**
 * Process specified wildcard glob patterns or filenames against a
 * callback, excluding and uniquing files in the result set.
 * @param {Array<string>} patterns
 * @param {Function} fn
 * @returns {Array<string>}
 */
const processPatterns = function (patterns, fn) {
  let result = [];
  grunt.util._.flattenDeep(patterns).forEach(function (pattern) {
    const exclusion = pattern.indexOf('!') === 0;
    if (exclusion) {
      pattern = pattern.slice(1);
    }
    const matches = fn(pattern);
    if (exclusion) {
      result = grunt.util._.difference(result, matches);
    } else {
      result = grunt.util._.union(result, matches);
    }
  });
  return result;
};

/**
 * Match a filepath or filepaths against one or more wildcard patterns.
 * Returns all matching filepaths.
 * @param {Object|Array|string} optionsOrPatterns
 * @param {Array|string} [patterns]
 * @param {Array|string} [filepaths]
 * @returns {Array<string>}
 */
file.match = function (optionsOrPatterns, patterns, filepaths) {
  let options = optionsOrPatterns;
  if (grunt.util.kindOf(options) !== 'object') {
    filepaths = patterns;
    patterns = options;
    options = {};
  }
  if (patterns == null || filepaths == null) { return []; }
  if (!Array.isArray(patterns)) { patterns = [patterns]; }
  if (!Array.isArray(filepaths)) { filepaths = [filepaths]; }
  if (patterns.length === 0 || filepaths.length === 0) { return []; }
  return processPatterns(patterns, function (pattern) {
    return file.minimatch.match(filepaths, pattern, options);
  });
};

/**
 * Match a filepath or filepaths against one or more wildcard patterns.
 * Returns true if any of the patterns match.
 * @returns {boolean}
 */
file.isMatch = function () {
  return file.match.apply(file, arguments).length > 0;
};

/**
 * Return an array of all file paths that match the given wildcard patterns.
 * @returns {Array<string>}
 */
file.expand = function () {
  const args = grunt.util.toArray(arguments);
  const options = grunt.util.kindOf(args[0]) === 'object' ? args.shift() : {};
  const patterns = Array.isArray(args[0]) ? args[0] : args;
  if (patterns.length === 0) { return []; }
  let matches = processPatterns(patterns, function (pattern) {
    return file.glob.sync(pattern, options);
  });
  if (options.filter) {
    matches = matches.filter(function (filepath) {
      filepath = path.join(options.cwd || '', filepath);
      try {
        if (typeof options.filter === 'function') {
          return options.filter(filepath);
        } else {
          return fs.statSync(filepath)[options.filter]();
        }
      } catch (e) {
        return false;
      }
    });
  }
  return matches;
};

const pathSeparatorRe = /[\/\\]/g;

// The "ext" option refers to either everything after the first dot (default)
// or everything after the last dot.
const extDotRe = {
  first: /(\.[^\/]*)?$/,
  last: /(\.[^\/\.]*)?$/
};

/**
 * Build a multi task "files" object dynamically.
 * @param {Array|string} patterns
 * @param {string} destBase
 * @param {Object} [options]
 * @returns {Array<Object>}
 */
file.expandMapping = function (patterns, destBase, options) {
  options = grunt.util._.defaults({}, options, {
    extDot: 'first',
    rename: function (destBase, destPath) {
      return path.join(destBase || '', destPath);
    }
  });
  const files = [];
  const fileByDest = {};
  file.expand(options, patterns).forEach(function (src) {
    let destPath = src;
    if (options.flatten) {
      destPath = path.basename(destPath);
    }
    if ('ext' in options) {
      destPath = destPath.replace(extDotRe[options.extDot], options.ext);
    }
    const dest = options.rename(destBase, destPath, options);
    if (options.cwd) { src = path.join(options.cwd, src); }
    const normalizedDest = dest.replace(pathSeparatorRe, '/');
    const normalizedSrc = src.replace(pathSeparatorRe, '/');
    if (fileByDest[normalizedDest]) {
      fileByDest[normalizedDest].src.push(normalizedSrc);
    } else {
      files.push({
        src: [normalizedSrc],
        dest: normalizedDest
      });
      fileByDest[normalizedDest] = files[files.length - 1];
    }
  });
  return files;
};

/**
 * Like mkdir -p. Create a directory and any intermediary directories.
 * @param {string} dirpath
 * @param {number} [mode]
 */
file.mkdir = function (dirpath, mode) {
  if (grunt.option('no-write')) { return; }
  try {
    mkdirp(dirpath, { mode: mode });
  } catch (e) {
    throw grunt.util.error('Unable to create directory "' + dirpath + '" (Error code: ' + e.code + ').', e);
  }
};

/**
 * Recurse into a directory, executing callback for each file.
 * @param {string} rootdir
 * @param {Function} callback
 * @param {string} [subdir]
 */
file.recurse = function recurse(rootdir, callback, subdir) {
  const abspath = subdir ? path.join(rootdir, subdir) : rootdir;
  fs.readdirSync(abspath).forEach(function (filename) {
    const filepath = path.join(abspath, filename);
    if (fs.statSync(filepath).isDirectory()) {
      recurse(rootdir, callback, unixifyPath(path.join(subdir || '', filename || '')));
    } else {
      callback(unixifyPath(filepath), rootdir, subdir, filename);
    }
  });
};

file.defaultEncoding = 'utf8';
file.preserveBOM = false;

/**
 * Read a file, return its contents.
 * @param {string} filepath
 * @param {Object} [options]
 * @returns {string|Buffer}
 */
file.read = function (filepath, options) {
  if (!options) { options = {}; }
  let contents;
  grunt.verbose.write('Reading ' + filepath + '...');
  try {
    contents = fs.readFileSync(String(filepath));
    if (options.encoding !== null) {
      contents = iconv.decode(contents, options.encoding || file.defaultEncoding, { stripBOM: !file.preserveBOM });
    }
    grunt.verbose.ok();
    return contents;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Unable to read "' + filepath + '" file (Error code: ' + e.code + ').', e);
  }
};

/**
 * Read a file, parse its contents, return an object.
 * @param {string} filepath
 * @param {Object} [options]
 * @returns {Object}
 */
file.readJSON = function (filepath, options) {
  const src = file.read(filepath, options);
  let result;
  grunt.verbose.write('Parsing ' + filepath + '...');
  try {
    result = JSON.parse(src);
    grunt.verbose.ok();
    return result;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Unable to parse "' + filepath + '" file (' + e.message + ').', e);
  }
};

/**
 * Read a YAML file, parse its contents, return an object.
 * @param {string} filepath
 * @param {Object} [options]
 * @param {Object} [yamlOptions]
 * @returns {Object}
 */
file.readYAML = function (filepath, options, yamlOptions) {
  if (!options) { options = {}; }
  if (!yamlOptions) { yamlOptions = {}; }
  const src = file.read(filepath, options);
  let result;
  grunt.verbose.write('Parsing ' + filepath + '...');
  try {
    if (yamlOptions.unsafeLoad) {
      result = YAML.load(src);
    } else {
      result = YAML.safeLoad(src);
    }
    grunt.verbose.ok();
    return result;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Unable to parse "' + filepath + '" file (' + e.message + ').', e);
  }
};

/**
 * Write a file.
 * @param {string} filepath
 * @param {string|Buffer} contents
 * @param {Object} [options]
 * @returns {boolean}
 */
file.write = function (filepath, contents, options) {
  if (!options) { options = {}; }
  const nowrite = grunt.option('no-write');
  grunt.verbose.write((nowrite ? 'Not actually writing ' : 'Writing ') + filepath + '...');
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
    grunt.verbose.error();
    throw grunt.util.error('Unable to write "' + filepath + '" file (Error code: ' + e.code + ').', e);
  }
};

/**
 * Read a file, optionally processing its content, then write the output.
 * Or read a directory, recursively creating directories, reading files,
 * processing content, writing output.
 * @param {string} srcpath
 * @param {string} destpath
 * @param {Object} [options]
 */
file.copy = function copy(srcpath, destpath, options) {
  if (file.isDir(srcpath)) {
    file.mkdir(destpath);
    fs.readdirSync(srcpath).forEach(function (filepath) {
      copy(path.join(srcpath, filepath), path.join(destpath, filepath), options);
    });
  } else {
    file._copy(srcpath, destpath, options);
  }
};

/**
 * Read a file, optionally processing its content, then write the output.
 * @param {string} srcpath
 * @param {string} destpath
 * @param {Object} [options]
 */
file._copy = function (srcpath, destpath, options) {
  if (!options) { options = {}; }
  const process = options.process && options.noProcess !== true &&
    !(options.noProcess && file.isMatch(options.noProcess, srcpath));
  const readWriteOptions = process ? options : { encoding: null };
  const contents = file.read(srcpath, readWriteOptions);
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

/**
 * Delete folders and files recursively
 * @param {string} filepath
 * @param {Object} [options]
 * @returns {boolean}
 */
file.delete = function (filepath, options) {
  filepath = String(filepath);
  const nowrite = grunt.option('no-write');
  if (!options) {
    options = { force: grunt.option('force') || false };
  }
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

/**
 * True if the file path exists.
 * @returns {boolean}
 */
file.exists = function () {
  const filepath = path.join.apply(path, arguments);
  return fs.existsSync(filepath);
};

/**
 * True if the file is a symbolic link.
 * @returns {boolean}
 */
file.isLink = function () {
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

/**
 * True if the path is a directory.
 * @returns {boolean}
 */
file.isDir = function () {
  const filepath = path.join.apply(path, arguments);
  return file.exists(filepath) && fs.statSync(filepath).isDirectory();
};

/**
 * True if the path is a file.
 * @returns {boolean}
 */
file.isFile = function () {
  const filepath = path.join.apply(path, arguments);
  return file.exists(filepath) && fs.statSync(filepath).isFile();
};

/**
 * Is a given file path absolute?
 * @returns {boolean}
 */
file.isPathAbsolute = function () {
  const filepath = path.join.apply(path, arguments);
  return path.isAbsolute(filepath);
};

/**
 * Do all the specified paths refer to the same path?
 * @returns {boolean}
 */
file.arePathsEquivalent = function (first) {
  first = path.resolve(first);
  for (let i = 1; i < arguments.length; i++) {
    if (first !== path.resolve(arguments[i])) { return false; }
  }
  return true;
};

/**
 * Are descendant path(s) contained within ancestor path?
 * @returns {boolean}
 */
file.doesPathContain = function (ancestor) {
  ancestor = path.resolve(ancestor);
  let relative;
  for (let i = 1; i < arguments.length; i++) {
    relative = path.relative(path.resolve(arguments[i]), ancestor);
    if (relative === '' || /\w+/.test(relative)) { return false; }
  }
  return true;
};

/**
 * Test to see if a filepath is the CWD.
 * @returns {boolean}
 */
file.isPathCwd = function () {
  const filepath = path.join.apply(path, arguments);
  try {
    return file.arePathsEquivalent(fs.realpathSync(process.cwd()), fs.realpathSync(filepath));
  } catch (e) {
    return false;
  }
};

/**
 * Test to see if a filepath is contained within the CWD.
 * @returns {boolean}
 */
file.isPathInCwd = function () {
  const filepath = path.join.apply(path, arguments);
  try {
    return file.doesPathContain(fs.realpathSync(process.cwd()), fs.realpathSync(filepath));
  } catch (e) {
    return false;
  }
};