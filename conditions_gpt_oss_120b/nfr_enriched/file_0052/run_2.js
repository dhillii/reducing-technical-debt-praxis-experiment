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
 * Process a list of patterns, handling inclusions and exclusions.
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
 * Apply an optional filter to a list of file paths.
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
 * Compute destination path for a source file based on options.
 */
function computeDestPath(src, destBase, options) {
  let destPath = src;
  if (options.flatten) destPath = path.basename(destPath);
  if ('ext' in options) destPath = destPath.replace(extDotRe[options.extDot], options.ext);
  const dest = options.rename(destBase, destPath, options);
  return {
    src: options.cwd ? path.join(options.cwd, src) : src,
    dest: dest.replace(pathSeparatorRe, '/')
  };
}

/**
 * Add a source-destination mapping to the collection.
 */
function addFileMapping(files, fileByDest, src, dest) {
  const normalizedDest = dest.replace(pathSeparatorRe, '/');
  const normalizedSrc = src.replace(pathSeparatorRe, '/');
  if (fileByDest[normalizedDest]) {
    fileByDest[normalizedDest].src.push(normalizedSrc);
  } else {
    const mapping = { src: [normalizedSrc], dest: normalizedDest };
    files.push(mapping);
    fileByDest[normalizedDest] = mapping;
  }
}

/**
 * Validate delete operation constraints.
 */
function validateDelete(filepath, options) {
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
 * Change the current base path (ie, CWD) to the specified path.
 */
file.setBase = function () {
  const dirpath = path.join.apply(path, arguments);
  process.chdir(dirpath);
};

/**
 * Match a filepath or filepaths against one or more wildcard patterns.
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

/**
 * Return true if any of the patterns match.
 */
file.isMatch = function () {
  return file.match.apply(file, arguments).length > 0;
};

/**
 * Return an array of all file paths that match the given wildcard patterns.
 */
file.expand = function () {
  const args = grunt.util.toArray(arguments);
  const options = grunt.util.kindOf(args[0]) === 'object' ? args.shift() : {};
  const patterns = Array.isArray(args[0]) ? args[0] : args;
  if (patterns.length === 0) return [];
  const matches = processPatterns(patterns, pattern =>
    file.glob.sync(pattern, options)
  );
  return applyFilter(matches, options);
};

/**
 * Build a multi task "files" object dynamically.
 */
file.expandMapping = function (patterns, destBase, options) {
  options = grunt.util._.defaults({}, options, {
    extDot: 'first',
    rename: (destBase, destPath) => path.join(destBase || '', destPath)
  });
  const files = [];
  const fileByDest = {};
  file.expand(options, patterns).forEach(src => {
    const { src: normalizedSrc, dest } = computeDestPath(src, destBase, options);
    addFileMapping(files, fileByDest, normalizedSrc, dest);
  });
  return files;
};

/**
 * Like mkdir -p. Create a directory and any intermediary directories.
 */
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
 * Recurse into a directory, executing callback for each file.
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
 * Read a file, return its contents.
 */
file.read = function (filepath, options) {
  if (!options) options = {};
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

/**
 * Read a file, parse its contents, return an object.
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
    throw grunt.util.error(
      `Unable to parse "${filepath}" file (${e.message}).`,
      e
    );
  }
};

/**
 * Read a YAML file, parse its contents, return an object.
 */
file.readYAML = function (filepath, options, yamlOptions) {
  if (!options) options = {};
  if (!yamlOptions) yamlOptions = {};
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

/**
 * Write a file.
 */
file.write = function (filepath, contents, options) {
  if (!options) options = {};
  const nowrite = grunt.option('no-write');
  grunt.verbose.write(`${nowrite ? 'Not actually writing' : 'Writing'} ${filepath}...`);
  file.mkdir(path.dirname(filepath));
  try {
    if (!Buffer.isBuffer(contents)) {
      contents = iconv.encode(contents, options.encoding || file.defaultEncoding);
    }
    if (!nowrite) {
      fs.writeFileSync(
        filepath,
        contents,
        'mode' in options ? { mode: options.mode } : {}
      );
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
 * Copy files or directories.
 */
file.copy = function copy(srcpath, destpath, options) {
  if (file.isDir(srcpath)) {
    file.mkdir(destpath);
    fs.readdirSync(srcpath).forEach(filepath => {
      copy(path.join(srcpath, filepath), path.join(destpath, filepath), options);
    });
  } else {
    file._copy(srcpath, destpath, options);
  }
};

/**
 * Internal copy implementation with optional processing.
 */
file._copy = function (srcpath, destpath, options) {
  if (!options) options = {};
  const shouldProcess =
    options.process &&
    options.noProcess !== true &&
    !(options.noProcess && file.isMatch(options.noProcess, srcpath));
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
    } catch (e) {
      grunt.verbose.error();
      throw grunt.util.error(`Error while processing "${srcpath}" file.`, e);
    }
  } else {
    file.write(destpath, contents, readWriteOptions);
  }
};

/**
 * Delete folders and files recursively.
 */
file.delete = function (filepath, options) {
  filepath = String(filepath);
  const nowrite = grunt.option('no-write');
  if (!options) options = { force: grunt.option('force') || false };
  grunt.verbose.write(`${nowrite ? 'Not actually deleting' : 'Deleting'} ${filepath}...`);
  if (!validateDelete(filepath, options)) return false;
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

/**
 * True if the file path exists.
 */
file.exists = function () {
  const filepath = path.join.apply(path, arguments);
  return fs.existsSync(filepath);
};

/**
 * True if the file is a symbolic link.
 */
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

/**
 * True if the path is a directory.
 */
file.isDir = function () {
  const filepath = path.join.apply(path, arguments);
  return file.exists(filepath) && fs.statSync(filepath).isDirectory();
};

/**
 * True if the path is a file.
 */
file.isFile = function () {
  const filepath = path.join.apply(path, arguments);
  return file.exists(filepath) && fs.statSync(filepath).isFile();
};

/**
 * Is a given file path absolute?
 */
file.isPathAbsolute = function () {
  const filepath = path.join.apply(path, arguments);
  return path.isAbsolute(filepath);
};

/**
 * Do all the specified paths refer to the same path?
 */
file.arePathsEquivalent = function (first) {
  first = path.resolve(first);
  for (let i = 1; i < arguments.length; i++) {
    if (first !== path.resolve(arguments[i])) return false;
  }
  return true;
};

/**
 * Are descendant path(s) contained within ancestor path? Note: does not test
 * if paths actually exist.
 */
file.doesPathContain = function (ancestor) {
  ancestor = path.resolve(ancestor);
  for (let i = 1; i < arguments.length; i++) {
    const relative = path.relative(path.resolve(arguments[i]), ancestor);
    if (relative === '' || /\w+/.test(relative)) return false;
  }
  return true;
};

/**
 * Test to see if a filepath is the CWD.
 */
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

/**
 * Test to see if a filepath is contained within the CWD.
 */
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