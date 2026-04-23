'use strict';

const grunt = require('../grunt');
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const minimatch = require('minimatch');
const findup = require('findup-sync');
const YAML = require('js-yaml');
const rimraf = require('rimraf');
const iconv = require('iconv-lite');
const mkdirp = require('mkdirp').sync;

const file = module.exports = {};

file.glob = glob;
file.minimatch = minimatch;
file.findup = findup;

const win32 = process.platform === 'win32';
const pathSeparatorRe = /[\/\\]/g;
const extDotRe = {
  first: /(\.[^\/]*)?$/,
  last: /(\.[^\/\.]*)?$/,
};

/**
 * Convert Windows backslashes to forward slashes.
 */
function unixifyPath(filepath) {
  return win32 ? filepath.replace(/\\/g, '/') : filepath;
}

/**
 * Resolve a list of path segments into a single path.
 */
function resolvePath(...segments) {
  return path.join.apply(path, segments);
}

/**
 * Process patterns with inclusion/exclusion logic.
 */
function processPatterns(patterns, matcher) {
  const result = [];
  grunt.util._.flattenDeep(patterns).forEach(pattern => {
    const isExclusion = pattern.indexOf('!') === 0;
    const cleanPattern = isExclusion ? pattern.slice(1) : pattern;
    const matches = matcher(cleanPattern);
    if (isExclusion) {
      result.splice(0, result.length, ...grunt.util._.difference(result, matches));
    } else {
      result.splice(0, result.length, ...grunt.util._.union(result, matches));
    }
  });
  return result;
}

/**
 * Apply a filter function or fs method to a list of filepaths.
 */
function applyFilter(filepaths, options) {
  if (!options.filter) { return filepaths; }
  return filepaths.filter(filepath => {
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
}

/**
 * Build a destination path for a source file.
 */
function buildDestPath(src, destBase, options) {
  let destPath = src;
  if (options.flatten) {
    destPath = path.basename(destPath);
  }
  if ('ext' in options) {
    destPath = destPath.replace(extDotRe[options.extDot], options.ext);
  }
  const dest = options.rename(destBase, destPath, options);
  return {
    src: src.replace(pathSeparatorRe, '/'),
    dest: dest.replace(pathSeparatorRe, '/')
  };
}

/**
 * Add a mapping entry to the files collection.
 */
function addMapping(files, fileByDest, mapping) {
  if (fileByDest[mapping.dest]) {
    fileByDest[mapping.dest].src.push(mapping.src);
  } else {
    const entry = { src: [mapping.src], dest: mapping.dest };
    files.push(entry);
    fileByDest[mapping.dest] = entry;
  }
}

/**
 * Set the current working directory.
 */
file.setBase = function () {
  const dirpath = resolvePath(...arguments);
  process.chdir(dirpath);
};

/**
 * Match filepaths against patterns.
 */
file.match = function (options, patterns, filepaths) {
  if (grunt.util.kindOf(options) !== 'object') {
    filepaths = patterns;
    patterns = options;
    options = {};
  }
  if (patterns == null || filepaths == null) { return []; }
  if (!Array.isArray(patterns)) { patterns = [patterns]; }
  if (!Array.isArray(filepaths)) { filepaths = [filepaths]; }
  if (patterns.length === 0 || filepaths.length === 0) { return []; }
  return processPatterns(patterns, pattern => {
    return file.minimatch.match(filepaths, pattern, options);
  });
};

/**
 * Determine if any pattern matches.
 */
file.isMatch = function () {
  return file.match.apply(file, arguments).length > 0;
};

/**
 * Expand glob patterns into filepaths.
 */
file.expand = function () {
  const args = grunt.util.toArray(arguments);
  const options = grunt.util.kindOf(args[0]) === 'object' ? args.shift() : {};
  const patterns = Array.isArray(args[0]) ? args[0] : args;
  if (patterns.length === 0) { return []; }
  const matches = processPatterns(patterns, pattern => {
    return file.glob.sync(pattern, options);
  });
  return applyFilter(matches, options);
};

/**
 * Expand file mappings.
 */
file.expandMapping = function (patterns, destBase, options) {
  options = grunt.util._.defaults({}, options, {
    extDot: 'first',
    rename: (destBase, destPath) => path.join(destBase || '', destPath)
  });
  const files = [];
  const fileByDest = {};
  file.expand(options, patterns).forEach(src => {
    const mapping = buildDestPath(src, destBase, options);
    if (options.cwd) {
      src = path.join(options.cwd, src);
    }
    addMapping(files, fileByDest, { src: src.replace(pathSeparatorRe, '/'), dest: mapping.dest });
  });
  return files;
};

/**
 * Create a directory recursively.
 */
file.mkdir = function (dirpath, mode) {
  if (grunt.option('no-write')) { return; }
  try {
    mkdirp(dirpath, { mode });
  } catch (e) {
    throw grunt.util.error(`Unable to create directory "${dirpath}" (Error code: ${e.code}).`, e);
  }
};

/**
 * Recursively traverse a directory.
 */
file.recurse = function recurse(rootdir, callback, subdir) {
  const abspath = subdir ? path.join(rootdir, subdir) : rootdir;
  fs.readdirSync(abspath).forEach(filename => {
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
 * Read a file with optional encoding.
 */
file.read = function (filepath, options = {}) {
  grunt.verbose.write(`Reading ${filepath}...`);
  try {
    let contents = fs.readFileSync(String(filepath));
    if (options.encoding !== null) {
      contents = iconv.decode(contents, options.encoding || file.defaultEncoding, { stripBOM: !file.preserveBOM });
    }
    grunt.verbose.ok();
    return contents;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error(`Unable to read "${filepath}" file (Error code: ${e.code}).`, e);
  }
};

/**
 * Read and parse JSON.
 */
file.readJSON = function (filepath, options) {
  const src = file.read(filepath, options);
  grunt.verbose.write(`Parsing ${filepath}...`);
  try {
    const result = JSON.parse(src);
    grunt.verbose.ok();
    return result;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error(`Unable to parse "${filepath}" file (${e.message}).`, e);
  }
};

/**
 * Read and parse YAML.
 */
file.readYAML = function (filepath, options = {}, yamlOptions = {}) {
  const src = file.read(filepath, options);
  grunt.verbose.write(`Parsing ${filepath}...`);
  try {
    const result = yamlOptions.unsafeLoad ? YAML.load(src) : YAML.safeLoad(src);
    grunt.verbose.ok();
    return result;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error(`Unable to parse "${filepath}" file (${e.message}).`, e);
  }
};

/**
 * Write data to a file.
 */
file.write = function (filepath, contents, options = {}) {
  const nowrite = grunt.option('no-write');
  grunt.verbose.write(`${nowrite ? 'Not actually writing' : 'Writing'} ${filepath}...`);
  file.mkdir(path.dirname(filepath));
  try {
    if (!Buffer.isBuffer(contents)) {
      contents = iconv.encode(contents, options.encoding || file.defaultEncoding);
    }
    if (!nowrite) {
      const writeOpts = 'mode' in options ? { mode: options.mode } : {};
      fs.writeFileSync(filepath, contents, writeOpts);
    }
    grunt.verbose.ok();
    return true;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error(`Unable to write "${filepath}" file (Error code: ${e.code}).`, e);
  }
};

/**
 * Copy files or directories.
 */
file.copy = function copy(srcpath, destpath, options) {
  if (file.isDir(srcpath)) {
    file.mkdir(destpath);
    fs.readdirSync(srcpath).forEach(child => {
      copy(path.join(srcpath, child), path.join(destpath, child), options);
    });
  } else {
    file._copy(srcpath, destpath, options);
  }
};

/**
 * Internal copy with optional processing.
 */
file._copy = function (srcpath, destpath, options = {}) {
  const shouldProcess = options.process && options.noProcess !== true &&
    !(options.noProcess && file.isMatch(options.noProcess, srcpath));
  const readWriteOpts = shouldProcess ? options : { encoding: null };
  let contents = file.read(srcpath, readWriteOpts);
  if (shouldProcess) {
    grunt.verbose.write('Processing source...');
    try {
      contents = options.process(contents, srcpath, destpath);
      grunt.verbose.ok();
    } catch (e) {
      grunt.verbose.error();
      throw grunt.util.error(`Error while processing "${srcpath}" file.`, e);
    }
  }
  if (contents === false) {
    grunt.verbose.writeln('Write aborted.');
  } else {
    file.write(destpath, contents, readWriteOpts);
  }
};

/**
 * Delete a file or directory.
 */
file.delete = function (filepath, options) {
  const target = String(filepath);
  const nowrite = grunt.option('no-write');
  const opts = options || { force: grunt.option('force') || false };
  grunt.verbose.write(`${nowrite ? 'Not actually deleting' : 'Deleting'} ${target}...`);
  if (!file.exists(target)) {
    grunt.verbose.error();
    grunt.log.warn('Cannot delete nonexistent file.');
    return false;
  }
  if (!opts.force) {
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
    throw grunt.util.error(`Unable to delete "${target}" file (${e.message}).`, e);
  }
};

/**
 * Check existence of a path.
 */
file.exists = function () {
  const filepath = resolvePath(...arguments);
  return fs.existsSync(filepath);
};

/**
 * Check if a path is a symbolic link.
 */
file.isLink = function () {
  const filepath = resolvePath(...arguments);
  try {
    return fs.lstatSync(filepath).isSymbolicLink();
  } catch (e) {
    if (e.code === 'ENOENT') {
      return false;
    }
    throw grunt.util.error(`Unable to read "${filepath}" file (Error code: ${e.code}).`, e);
  }
};

/**
 * Check if a path is a directory.
 */
file.isDir = function () {
  const filepath = resolvePath(...arguments);
  return file.exists(filepath) && fs.statSync(filepath).isDirectory();
};

/**
 * Check if a path is a file.
 */
file.isFile = function () {
  const filepath = resolvePath(...arguments);
  return file.exists(filepath) && fs.statSync(filepath).isFile();
};

/**
 * Determine if a path is absolute.
 */
file.isPathAbsolute = function () {
  const filepath = resolvePath(...arguments);
  return path.isAbsolute(filepath);
};

/**
 * Compare multiple paths for equivalence.
 */
file.arePathsEquivalent = function (first) {
  const base = path.resolve(first);
  for (let i = 1; i < arguments.length; i++) {
    if (base !== path.resolve(arguments[i])) {
      return false;
    }
  }
  return true;
};

/**
 * Verify descendant paths are within an ancestor.
 */
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

/**
 * Check if a path is the current working directory.
 */
file.isPathCwd = function () {
  const filepath = resolvePath(...arguments);
  try {
    return file.arePathsEquivalent(fs.realpathSync(process.cwd()), fs.realpathSync(filepath));
  } catch (e) {
    return false;
  }
};

/**
 * Check if a path is inside the current working directory.
 */
file.isPathInCwd = function () {
  const filepath = resolvePath(...arguments);
  try {
    return file.doesPathContain(fs.realpathSync(process.cwd()), fs.realpathSync(filepath));
  } catch (e) {
    return false;
  }
};