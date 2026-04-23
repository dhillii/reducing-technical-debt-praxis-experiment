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
 * Flatten patterns and apply inclusion/exclusion logic.
 */
function processPatterns(patterns, matcher) {
  let result = [];
  grunt.util._.flattenDeep(patterns).forEach(pattern => {
    const isExclusion = pattern.indexOf('!') === 0;
    if (isExclusion) pattern = pattern.slice(1);
    const matches = matcher(pattern);
    result = isExclusion
      ? grunt.util._.difference(result, matches)
      : grunt.util._.union(result, matches);
  });
  return result;
}

/**
 * Resolve options and patterns for expand-like functions.
 */
function resolveExpandArgs(args) {
  const argsArray = grunt.util.toArray(args);
  const options = grunt.util.kindOf(argsArray[0]) === 'object' ? argsArray.shift() : {};
  const patterns = Array.isArray(argsArray[0]) ? argsArray[0] : argsArray;
  return { options, patterns };
}

/**
 * Apply a filter to a list of filepaths.
 */
function applyFilter(matches, options) {
  if (!options.filter) return matches;
  return matches.filter(filepath => {
    const fullPath = path.join(options.cwd || '', filepath);
    try {
      if (typeof options.filter === 'function') {
        return options.filter(fullPath);
      }
      return fs.statSync(fullPath)[options.filter]();
    } catch (_) {
      return false;
    }
  });
}

/**
 * Set the working directory.
 */
file.setBase = function () {
  const dirpath = path.join.apply(path, arguments);
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
  if (patterns == null || filepaths == null) return [];
  if (!Array.isArray(patterns)) patterns = [patterns];
  if (!Array.isArray(filepaths)) filepaths = [filepaths];
  if (patterns.length === 0 || filepaths.length === 0) return [];
  return processPatterns(patterns, pattern =>
    file.minimatch.match(filepaths, pattern, options)
  );
};

file.isMatch = function () {
  return file.match.apply(file, arguments).length > 0;
};

/**
 * Expand glob patterns into filepaths.
 */
file.expand = function () {
  const { options, patterns } = resolveExpandArgs(arguments);
  if (patterns.length === 0) return [];
  const matches = processPatterns(patterns, pattern =>
    file.glob.sync(pattern, options)
  );
  return applyFilter(matches, options);
};

/**
 * Compute destination path for expandMapping.
 */
function computeDestPath(src, options) {
  let destPath = src;
  if (options.flatten) destPath = path.basename(destPath);
  if ('ext' in options) destPath = destPath.replace(extDotRe[options.extDot], options.ext);
  return destPath;
}

/**
 * Add or update a file mapping entry.
 */
function addFileMapping(files, fileByDest, src, dest) {
  if (fileByDest[dest]) {
    fileByDest[dest].src.push(src);
  } else {
    const entry = { src: [src], dest };
    files.push(entry);
    fileByDest[dest] = entry;
  }
}

/**
 * Build a files mapping object.
 */
file.expandMapping = function (patterns, destBase, options) {
  options = grunt.util._.defaults({}, options, {
    extDot: 'first',
    rename: (base, destPath) => path.join(base || '', destPath),
  });
  const files = [];
  const fileByDest = {};
  file.expand(options, patterns).forEach(src => {
    const destPath = computeDestPath(src, options);
    const dest = options.rename(destBase, destPath, options);
    const normalizedDest = dest.replace(pathSeparatorRe, '/');
    const normalizedSrc = (options.cwd ? path.join(options.cwd, src) : src).replace(pathSeparatorRe, '/');
    addFileMapping(files, fileByDest, normalizedSrc, normalizedDest);
  });
  return files;
};

file.mkdir = function (dirpath, mode) {
  if (grunt.option('no-write')) return;
  try {
    mkdirp(dirpath, { mode });
  } catch (e) {
    throw grunt.util.error(
      `Unable to create directory "${dirpath}" (Error code: ${e.code}).`,
      e
    );
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
      recurse(rootdir, callback, unixifyPath(path.join(subdir || '', filename)));
    } else {
      callback(unixifyPath(filepath), rootdir, subdir, filename);
    }
  });
};

file.defaultEncoding = 'utf8';
file.preserveBOM = false;

file.read = function (filepath, options = {}) {
  grunt.verbose.write(`Reading ${filepath}...`);
  try {
    let contents = fs.readFileSync(String(filepath));
    if (options.encoding !== null) {
      contents = iconv.decode(
        contents,
        options.encoding || file.defaultEncoding,
        { stripBOM: !file.preserveBOM }
      );
    }
    grunt.verbose.ok();
    return contents;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error(
      `Unable to read "${filepath}" file (Error code: ${e.code}).`,
      e
    );
  }
};

file.readJSON = function (filepath, options) {
  const src = file.read(filepath, options);
  grunt.verbose.write(`Parsing ${filepath}...`);
  try {
    const result = JSON.parse(src);
    grunt.verbose.ok();
    return result;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error(
      `Unable to parse "${filepath}" file (${e.message}).`,
      e
    );
  }
};

file.readYAML = function (filepath, options = {}, yamlOptions = {}) {
  const src = file.read(filepath, options);
  grunt.verbose.write(`Parsing ${filepath}...`);
  try {
    const result = yamlOptions.unsafeLoad ? YAML.load(src) : YAML.safeLoad(src);
    grunt.verbose.ok();
    return result;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error(
      `Unable to parse "${filepath}" file (${e.message}).`,
      e
    );
  }
};

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
    throw grunt.util.error(
      `Unable to write "${filepath}" file (Error code: ${e.code}).`,
      e
    );
  }
};

/**
 * Validate deletion constraints.
 */
function canDelete(filepath, options) {
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
  return true;
}

/**
 * Delete a file or directory.
 */
file.delete = function (filepath, options) {
  filepath = String(filepath);
  const nowrite = grunt.option('no-write');
  if (!options) options = { force: grunt.option('force') || false };
  grunt.verbose.write(`${nowrite ? 'Not actually deleting' : 'Deleting'} ${filepath}...`);
  if (!canDelete(filepath, options)) return false;
  try {
    if (!nowrite) rimraf.sync(filepath);
    grunt.verbose.ok();
    return true;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error(
      `Unable to delete "${filepath}" file (${e.message}).`,
      e
    );
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
    if (e.code === 'ENOENT') return false;
    throw grunt.util.error(
      `Unable to read "${filepath}" file (Error code: ${e.code}).`,
      e
    );
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
  first = path.resolve(first);
  for (let i = 1; i < arguments.length; i++) {
    if (first !== path.resolve(arguments[i])) return false;
  }
  return true;
};

file.doesPathContain = function (ancestor) {
  ancestor = path.resolve(ancestor);
  for (let i = 1; i < arguments.length; i++) {
    const relative = path.relative(path.resolve(arguments[i]), ancestor);
    if (relative === '' || /\w+/.test(relative)) return false;
  }
  return true;
};

file.isPathCwd = function () {
  const filepath = path.join.apply(path, arguments);
  try {
    return file.arePathsEquivalent(
      fs.realpathSync(process.cwd()),
      fs.realpathSync(filepath)
    );
  } catch (_) {
    return false;
  }
};

file.isPathInCwd = function () {
  const filepath = path.join.apply(path, arguments);
  try {
    return file.doesPathContain(
      fs.realpathSync(process.cwd()),
      fs.realpathSync(filepath)
    );
  } catch (_) {
    return false;
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
 * Internal copy implementation with optional processing.
 */
file._copy = function (srcpath, destpath, options = {}) {
  const shouldProcess =
    options.process &&
    options.noProcess !== true &&
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