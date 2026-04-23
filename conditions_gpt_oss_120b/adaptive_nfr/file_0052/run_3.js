'use strict';

const grunt = require('../grunt');

// Nodejs libs.
const fs = require('fs');
const path = require('path');

// The module to be exported.
const file = (module.exports = {});

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

// Normalize \\ paths to / paths.
function unixifyPath(filepath) {
  return win32 ? filepath.replace(/\\/g, '/') : filepath;
}

// Change the current base path (ie, CWD) to the specified path.
file.setBase = function () {
  const dirpath = path.join.apply(path, arguments);
  process.chdir(dirpath);
};

/**
 * Determine if a pattern string is an exclusion (starts with '!').
 * @param {string} pattern
 * @returns {boolean}
 */
function isExclusionPattern(pattern) {
  return pattern.indexOf('!') === 0;
}

/**
 * Remove leading '!' from an exclusion pattern.
 * @param {string} pattern
 * @returns {string}
 */
function stripExclusion(pattern) {
  return pattern.slice(1);
}

// Process specified wildcard glob patterns or filenames against a
// callback, excluding and uniquing files in the result set.
function processPatterns(patterns, fn) {
  let result = [];
  grunt.util._.flattenDeep(patterns).forEach((pattern) => {
    const exclusion = isExclusionPattern(pattern);
    if (exclusion) {
      pattern = stripExclusion(pattern);
    }
    const matches = fn(pattern);
    result = exclusion
      ? grunt.util._.difference(result, matches)
      : grunt.util._.union(result, matches);
  });
  return result;
}

// Match a filepath or filepaths against one or more wildcard patterns. Returns
// all matching filepaths.
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
  return processPatterns(patterns, (pattern) =>
    file.minimatch.match(filepaths, pattern, options)
  );
};

// Match a filepath or filepaths against one or more wildcard patterns. Returns
// true if any of the patterns match.
file.isMatch = function () {
  return file.match.apply(file, arguments).length > 0;
};

// Return an array of all file paths that match the given wildcard patterns.
file.expand = function () {
  const args = grunt.util.toArray(arguments);
  const options = grunt.util.kindOf(args[0]) === 'object' ? args.shift() : {};
  const patterns = Array.isArray(args[0]) ? args[0] : args;
  if (patterns.length === 0) {
    return [];
  }
  let matches = processPatterns(patterns, (pattern) =>
    file.glob.sync(pattern, options)
  );
  if (options.filter) {
    matches = matches.filter((filepath) => {
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
  return matches;
};

const pathSeparatorRe = /[\/\\]/g;

// The "ext" option refers to either everything after the first dot (default)
// or everything after the last dot.
const extDotRe = {
  first: /(\.[^\/]*)?$/,
  last: /(\.[^\/\.]*)?$/,
};

// Build a multi task "files" object dynamically.
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
    const normalizedSrc = options.cwd ? path.join(options.cwd, src) : src;
    const unixDest = dest.replace(pathSeparatorRe, '/');
    const unixSrc = normalizedSrc.replace(pathSeparatorRe, '/');
    if (fileByDest[unixDest]) {
      fileByDest[unixDest].src.push(unixSrc);
    } else {
      const mapping = { src: [unixSrc], dest: unixDest };
      files.push(mapping);
      fileByDest[unixDest] = mapping;
    }
  });
  return files;
};

// Like mkdir -p. Create a directory and any intermediary directories.
file.mkdir = function (dirpath, mode) {
  if (grunt.option('no-write')) {
    return;
  }
  try {
    mkdirp(dirpath, { mode });
  } catch (e) {
    throw grunt.util.error(
      `Unable to create directory "${dirpath}" (Error code: ${e.code}).`,
      e
    );
  }
};

// Recurse into a directory, executing callback for each file.
file.recurse = function recurse(rootdir, callback, subdir) {
  const abspath = subdir ? path.join(rootdir, subdir) : rootdir;
  fs.readdirSync(abspath).forEach((filename) => {
    const filepath = path.join(abspath, filename);
    if (fs.statSync(filepath).isDirectory()) {
      recurse(
        rootdir,
        callback,
        unixifyPath(path.join(subdir || '', filename || ''))
      );
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
file.read = function (filepath, options) {
  if (!options) {
    options = {};
  }
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

// Read a file, parse its contents, return an object.
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
 * Determine if yamlOptions request unsafe loading.
 * @param {object} yamlOptions
 * @returns {boolean}
 */
function shouldUnsafeLoad(yamlOptions) {
  return !!yamlOptions.unsafeLoad;
}

// Read a YAML file, parse its contents, return an object.
file.readYAML = function (filepath, options, yamlOptions) {
  if (!options) {
    options = {};
  }
  if (!yamlOptions) {
    yamlOptions = {};
  }
  const src = file.read(filepath, options);
  grunt.verbose.write(`Parsing ${filepath}...`);
  try {
    const result = shouldUnsafeLoad(yamlOptions)
      ? YAML.load(src)
      : YAML.safeLoad(src);
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

// Write a file.
file.write = function (filepath, contents, options) {
  if (!options) {
    options = {};
  }
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

// Read a file, optionally processing its content, then write the output.
// Or read a directory, recursively creating directories, reading files,
// processing content, writing output.
file.copy = function copy(srcpath, destpath, options) {
  if (file.isDir(srcpath)) {
    file.mkdir(destpath);
    fs.readdirSync(srcpath).forEach((filepath) => {
      copy(
        path.join(srcpath, filepath),
        path.join(destpath, filepath),
        options
      );
    });
  } else {
    file._copy(srcpath, destpath, options);
  }
};

// Read a file, optionally processing its content, then write the output.
file._copy = function (srcpath, destpath, options) {
  if (!options) {
    options = {};
  }
  const processFlag =
    options.process &&
    options.noProcess !== true &&
    !(options.noProcess && file.isMatch(options.noProcess, srcpath));
  const readWriteOptions = processFlag ? options : { encoding: null };
  const contents = file.read(srcpath, readWriteOptions);
  let finalContents = contents;
  if (processFlag) {
    grunt.verbose.write('Processing source...');
    try {
      finalContents = options.process(contents, srcpath, destpath);
      grunt.verbose.ok();
    } catch (e) {
      grunt.verbose.error();
      throw grunt.util.error(`Error while processing "${srcpath}" file.`, e);
    }
  }
  if (finalContents === false) {
    grunt.verbose.writeln('Write aborted.');
  } else {
    file.write(destpath, finalContents, readWriteOptions);
  }
};

// Delete folders and files recursively
file.delete = function (filepath, options) {
  const target = String(filepath);
  const nowrite = grunt.option('no-write');
  if (!options) {
    options = { force: grunt.option('force') || false };
  }
  grunt.verbose.write(`${nowrite ? 'Not actually deleting' : 'Deleting'} ${target}...`);
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
    throw grunt.util.error(
      `Unable to delete "${target}" file (${e.message}).`,
      e
    );
  }
};

// True if the file path exists.
file.exists = function () {
  const filepath = path.join.apply(path, arguments);
  return fs.existsSync(filepath);
};

// True if the file is a symbolic link.
file.isLink = function () {
  const filepath = path.join.apply(path, arguments);
  try {
    return fs.lstatSync(filepath).isSymbolicLink();
  } catch (e) {
    if (e.code === 'ENOENT') {
      return false;
    }
    throw grunt.util.error(
      `Unable to read "${filepath}" file (Error code: ${e.code}).`,
      e
    );
  }
};

// True if the path is a directory.
file.isDir = function () {
  const filepath = path.join.apply(path, arguments);
  return file.exists(filepath) && fs.statSync(filepath).isDirectory();
};

// True if the path is a file.
file.isFile = function () {
  const filepath = path.join.apply(path, arguments);
  return file.exists(filepath) && fs.statSync(filepath).isFile();
};

// Is a given file path absolute?
file.isPathAbsolute = function () {
  const filepath = path.join.apply(path, arguments);
  return path.isAbsolute(filepath);
};

/**
 * Determine if all provided paths resolve to the same absolute path.
 * @param {string} first
 * @param {...string} others
 * @returns {boolean}
 */
function areAllPathsEqual(first, ...others) {
  const base = path.resolve(first);
  return others.every((p) => base === path.resolve(p));
}

// Do all the specified paths refer to the same path?
file.arePathsEquivalent = function (first) {
  return areAllPathsEqual(first, ...Array.prototype.slice.call(arguments, 1));
};

/**
 * Determine if a descendant path is contained within an ancestor path.
 * @param {string} ancestor
 * @param {string} descendant
 * @returns {boolean}
 */
function isDescendant(ancestor, descendant) {
  const relative = path.relative(path.resolve(descendant), ancestor);
  return !(relative === '' || /\w+/.test(relative));
}

// Are descendant path(s) contained within ancestor path? Note: does not test
// if paths actually exist.
file.doesPathContain = function (ancestor) {
  const base = path.resolve(ancestor);
  return Array.prototype.slice
    .call(arguments, 1)
    .every((p) => isDescendant(base, p));
};

// Test to see if a filepath is the CWD.
file.isPathCwd = function () {
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
file.isPathInCwd = function () {
  const filepath = path.join.apply(path, arguments);
  try {
    return file.doesPathContain(
      fs.realpathSync(process.cwd()),
      fs.realpathSync(filepath)
    );
  } catch (e) {
    return false;
  }
};