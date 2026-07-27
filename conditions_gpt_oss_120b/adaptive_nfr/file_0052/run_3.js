'use strict';

const grunt = require('../grunt');
const fs = require('fs');
const path = require('path');
const file = module.exports = {};

file.glob = require('glob');
file.minimatch = require('minimatch');
file.findup = require('findup-sync');
const YAML = require('js-yaml');
const rimraf = require('rimraf');
const iconv = require('iconv-lite');
const mkdirp = require('mkdirp').sync;

const win32 = process.platform === 'win32';

/**
 * Convert Windows backslashes to Unix forward slashes.
 * @param {string} filepath
 * @returns {string}
 */
const unixifyPath = (filepath) => {
  return win32 ? filepath.replace(/\\/g, '/') : filepath;
};

file.setBase = function () {
  const dirpath = path.join.apply(path, arguments);
  process.chdir(dirpath);
};

/**
 * Determine if a pattern is an exclusion (starts with '!').
 * @param {string} pattern
 * @returns {boolean}
 */
const isExclusion = (pattern) => pattern.indexOf('!') === 0;

/**
 * Process patterns with inclusion/exclusion logic.
 * @param {Array|string} patterns
 * @param {Function} fn
 * @returns {Array}
 */
const processPatterns = (patterns, fn) => {
  const result = [];
  grunt.util._.flattenDeep(patterns).forEach((pattern) => {
    const exclusion = isExclusion(pattern);
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

file.match = function (options, patterns, filepaths) {
  if (grunt.util.kindOf(options) !== 'object') {
    filepaths = patterns;
    patterns = options;
    options = {};
  }
  if (patterns == null || filepaths == null) {
    return [];
  }
  if (!Array.isArray(patterns)) {
    patterns = [patterns];
  }
  if (!Array.isArray(filepaths)) {
    filepaths = [filepaths];
  }
  if (patterns.length === 0 || filepaths.length === 0) {
    return [];
  }
  return processPatterns(patterns, (pattern) => file.minimatch.match(filepaths, pattern, options));
};

file.isMatch = function () {
  return file.match.apply(file, arguments).length > 0;
};

file.expand = function () {
  const args = grunt.util.toArray(arguments);
  const options = grunt.util.kindOf(args[0]) === 'object' ? args.shift() : {};
  const patterns = Array.isArray(args[0]) ? args[0] : args;
  if (patterns.length === 0) {
    return [];
  }
  const matches = processPatterns(patterns, (pattern) => file.glob.sync(pattern, options));
  if (options.filter) {
    return filterFiles(matches, options);
  }
  return matches;
};

/**
 * Filter file paths based on provided options.
 * @param {Array<string>} filepaths
 * @param {Object} options
 * @returns {Array<string>}
 */
const filterFiles = (filepaths, options) => {
  return filepaths.filter((filepath) => {
    const fullPath = path.join(options.cwd || '', filepath);
    try {
      if (typeof options.filter === 'function') {
        return options.filter(fullPath);
      }
      return fs.statSync(fullPath)[options.filter]();
    } catch (e) {
      return false;
    }
  });
};

const pathSeparatorRe = /[\/\\]/g;

const extDotRe = {
  first: /(\.[^\/]*)?$/,
  last: /(\.[^\/\.]*)?$/,
};

file.expandMapping = function (patterns, destBase, options) {
  options = grunt.util._.defaults({}, options, {
    extDot: 'first',
    rename: (destBase, destPath) => path.join(destBase || '', destPath),
  });
  const files = [];
  const fileByDest = {};

  file.expand(options, patterns).forEach((src) => {
    let destPath = src;
    if (options.flatten) {
      destPath = path.basename(destPath);
    }
    if ('ext' in options) {
      destPath = destPath.replace(extDotRe[options.extDot], options.ext);
    }
    const dest = options.rename(destBase, destPath, options);
    const finalSrc = options.cwd ? path.join(options.cwd, src) : src;
    const normalizedDest = dest.replace(pathSeparatorRe, '/');
    const normalizedSrc = finalSrc.replace(pathSeparatorRe, '/');

    if (fileByDest[normalizedDest]) {
      fileByDest[normalizedDest].src.push(normalizedSrc);
    } else {
      const mapping = { src: [normalizedSrc], dest: normalizedDest };
      files.push(mapping);
      fileByDest[normalizedDest] = mapping;
    }
  });
  return files;
};

file.mkdir = function (dirpath, mode) {
  if (grunt.option('no-write')) {
    return;
  }
  try {
    mkdirp(dirpath, { mode });
  } catch (e) {
    throw grunt.util.error('Unable to create directory "' + dirpath + '" (Error code: ' + e.code + ').', e);
  }
};

file.recurse = function recurse(rootdir, callback, subdir) {
  const abspath = subdir ? path.join(rootdir, subdir) : rootdir;
  fs.readdirSync(abspath).forEach((filename) => {
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

file.read = function (filepath, options) {
  if (!options) {
    options = {};
  }
  grunt.verbose.write('Reading ' + filepath + '...');
  try {
    let contents = fs.readFileSync(String(filepath));
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

file.readJSON = function (filepath, options) {
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

file.readYAML = function (filepath, options, yamlOptions) {
  if (!options) {
    options = {};
  }
  if (!yamlOptions) {
    yamlOptions = {};
  }
  const src = file.read(filepath, options);
  grunt.verbose.write('Parsing ' + filepath + '...');
  try {
    const result = yamlOptions.unsafeLoad ? YAML.load(src) : YAML.safeLoad(src);
    grunt.verbose.ok();
    return result;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Unable to parse "' + filepath + '" file (' + e.message + ').', e);
  }
};

file.write = function (filepath, contents, options) {
  if (!options) {
    options = {};
  }
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

file.copy = function copy(srcpath, destpath, options) {
  if (file.isDir(srcpath)) {
    file.mkdir(destpath);
    fs.readdirSync(srcpath).forEach((filepath) => {
      copy(path.join(srcpath, filepath), path.join(destpath, filepath), options);
    });
  } else {
    file._copy(srcpath, destpath, options);
  }
};

file._copy = function (srcpath, destpath, options) {
  if (!options) {
    options = {};
  }
  const shouldProcess = options.process && options.noProcess !== true && !(options.noProcess && file.isMatch(options.noProcess, srcpath));
  const readWriteOptions = shouldProcess ? options : { encoding: null };
  const contents = file.read(srcpath, readWriteOptions);
  if (shouldProcess) {
    grunt.verbose.write('Processing source...');
    try {
      const processed = options.process(contents, srcpath, destpath);
      grunt.verbose.ok();
      if (processed === false) {
        grunt.verbose.writeln('Write aborted.');
        return;
      }
      file.write(destpath, processed, readWriteOptions);
      return;
    } catch (e) {
      grunt.verbose.error();
      throw grunt.util.error('Error while processing "' + srcpath + '" file.', e);
    }
  }
  file.write(destpath, contents, readWriteOptions);
};

file.delete = function (filepath, options) {
  const target = String(filepath);
  const nowrite = grunt.option('no-write');
  if (!options) {
    options = { force: grunt.option('force') || false };
  }
  grunt.verbose.write((nowrite ? 'Not actually deleting ' : 'Deleting ') + target + '...');
  if (!file.exists(target)) {
    grunt.verbose.error();
    grunt.log.warn('Cannot delete nonexistent file.');
    return false;
  }
  if (!options.force) {
    if (file.isPathCwd(target)) {
      grunt.verbose.error();
      grunt.fail.warn('Cannot delete the current working directory.');
      return false;
    }
    if (!file.isPathInCwd(target)) {
      grunt.verbose.error();
      grunt.fail.warn('Cannot delete files outside the current working directory.');
      return false;
    }
  }
  try {
    if (!nowrite) {
      rimraf.sync(target);
    }
    grunt.verbose.ok();
    return true;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Unable to delete "' + target + '" file (' + e.message + ').', e);
  }
};

file.exists = function () {
  const filepath = path.join.apply(path, arguments);
  return fs.existsSync(filepath);
};

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

file.isDir = function () {
  const filepath = path.join.apply(path, arguments);
  return file.exists(filepath) && fs.statSync(filepath).isDirectory();
};

file.isFile = function () {
  const filepath = path.join.apply(path, arguments);
  return file.exists(filepath) && fs.statSync(filepath).isFile();
};

file.isPathAbsolute = function () {
  const filepath = path.join.apply(path, arguments);
  return path.isAbsolute(filepath);
};

file.arePathsEquivalent = function (first) {
  const base = path.resolve(first);
  for (let i = 1; i < arguments.length; i++) {
    if (base !== path.resolve(arguments[i])) {
      return false;
    }
  }
  return true;
};

file.doesPathContain = function (ancestor) {
  const base = path.resolve(ancestor);
  for (let i = 1; i < arguments.length; i++) {
    const relative = path.relative(path.resolve(arguments[i]), base);
    if (relative === '' || /\w+/.test(relative)) {
      return false;
    }
  }
  return true;
};

file.isPathCwd = function () {
  const filepath = path.join.apply(path, arguments);
  try {
    return file.arePathsEquivalent(fs.realpathSync(process.cwd()), fs.realpathSync(filepath));
  } catch (e) {
    return false;
  }
};

file.isPathInCwd = function () {
  const filepath = path.join.apply(path, arguments);
  try {
    return file.doesPathContain(fs.realpathSync(process.cwd()), fs.realpathSync(filepath));
  } catch (e) {
    return false;
  }
};