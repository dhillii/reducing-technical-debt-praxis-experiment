'use strict';

const grunt = require('../grunt');

// Nodejs libs.
const fs = require('fs');
const path = require('path');

// External libs.
const file = module.exports = {};

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
const unixifyPath = (filepath) => (win32 ? filepath.replace(/\\/g, '/') : filepath);

/**
 * Change the current base path (i.e., CWD) to the specified path.
 * @param {...string} args
 */
file.setBase = (...args) => {
  const dirpath = path.join(...args);
  process.chdir(dirpath);
};

/**
 * Process specified wildcard glob patterns or filenames against a callback,
 * excluding and uniquing files in the result set.
 * @param {Array<string>} patterns
 * @param {(pattern:string)=>Array<string>} fn
 * @returns {Array<string>}
 */
const processPatterns = (patterns, fn) => {
  const result = [];
  grunt.util._.flattenDeep(patterns).forEach((pattern) => {
    const exclusion = pattern.startsWith('!');
    if (exclusion) pattern = pattern.slice(1);
    const matches = fn(pattern);
    if (exclusion) {
      // Remove matching files.
      result.splice(0, result.length, ...grunt.util._.difference(result, matches));
    } else {
      // Add matching files.
      result.splice(0, result.length, ...grunt.util._.union(result, matches));
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
file.match = (optionsOrPatterns, patterns, filepaths) => {
  let options = {};
  if (grunt.util.kindOf(optionsOrPatterns) !== 'object') {
    filepaths = patterns;
    patterns = optionsOrPatterns;
  } else {
    options = optionsOrPatterns;
  }
  if (!patterns || !filepaths) return [];
  if (!Array.isArray(patterns)) patterns = [patterns];
  if (!Array.isArray(filepaths)) filepaths = [filepaths];
  if (patterns.length === 0 || filepaths.length === 0) return [];
  return processPatterns(patterns, (pattern) =>
    file.minimatch.match(filepaths, pattern, options)
  );
};

/**
 * Match a filepath or filepaths against one or more wildcard patterns.
 * Returns true if any of the patterns match.
 * @returns {boolean}
 */
file.isMatch = () => file.match.apply(file, arguments).length > 0;

/**
 * Return an array of all file paths that match the given wildcard patterns.
 * @returns {Array<string>}
 */
file.expand = () => {
  const args = grunt.util.toArray(arguments);
  const options = grunt.util.kindOf(args[0]) === 'object' ? args.shift() : {};
  const patterns = Array.isArray(args[0]) ? args[0] : args;
  if (patterns.length === 0) return [];
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

/**
 * Build a multi task "files" object dynamically.
 * @param {Array<string>} patterns
 * @param {string} destBase
 * @param {Object} [options]
 * @returns {Array<Object>}
 */
file.expandMapping = (patterns, destBase, options = {}) => {
  const opts = grunt.util._.defaults(
    {},
    options,
    {
      extDot: 'first',
      rename: (destBase, destPath) => path.join(destBase || '', destPath),
    }
  );
  const files = [];
  const fileByDest = {};

  file.expand(opts, patterns).forEach((src) => {
    let destPath = src;
    if (opts.flatten) destPath = path.basename(destPath);
    if ('ext' in opts) destPath = destPath.replace(extDotRe[opts.extDot], opts.ext);
    const dest = opts.rename(destBase, destPath, opts);
    if (opts.cwd) src = path.join(opts.cwd, src);
    const normDest = dest.replace(pathSeparatorRe, '/');
    const normSrc = src.replace(pathSeparatorRe, '/');
    if (fileByDest[normDest]) {
      fileByDest[normDest].src.push(normSrc);
    } else {
      const mapping = { src: [normSrc], dest: normDest };
      files.push(mapping);
      fileByDest[normDest] = mapping;
    }
  });
  return files;
};

/**
 * Like mkdir -p. Create a directory and any intermediary directories.
 * @param {string} dirpath
 * @param {number} [mode]
 */
file.mkdir = (dirpath, mode) => {
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
 * @param {string} rootdir
 * @param {(filepath:string, rootdir:string, subdir:string, filename:string)=>void} callback
 * @param {string} [subdir]
 */
file.recurse = (rootdir, callback, subdir = '') => {
  const abspath = subdir ? path.join(rootdir, subdir) : rootdir;
  fs.readdirSync(abspath).forEach((filename) => {
    const filepath = path.join(abspath, filename);
    if (fs.statSync(filepath).isDirectory()) {
      file.recurse(rootdir, callback, unixifyPath(path.join(subdir, filename)));
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
file.read = (filepath, options = {}) => {
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
 * @param {string} filepath
 * @param {Object} [options]
 * @returns {Object}
 */
file.readJSON = (filepath, options) => {
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
 * @param {string} filepath
 * @param {Object} [options]
 * @param {Object} [yamlOptions]
 * @returns {Object}
 */
file.readYAML = (filepath, options = {}, yamlOptions = {}) => {
  const src = file.read(filepath, options);
  grunt.verbose.write(`Parsing ${filepath}...`);
  try {
    const result = yamlOptions.unsafeLoad
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

/**
 * Write a file.
 * @param {string} filepath
 * @param {string|Buffer} contents
 * @param {Object} [options]
 * @returns {boolean}
 */
file.write = (filepath, contents, options = {}) => {
  const nowrite = grunt.option('no-write');
  grunt.verbose.write(
    `${nowrite ? 'Not actually writing ' : 'Writing '} ${filepath}...`
  );
  file.mkdir(path.dirname(filepath));
  try {
    if (!Buffer.isBuffer(contents)) {
      contents = iconv.encode(
        contents,
        options.encoding || file.defaultEncoding
      );
    }
    if (!nowrite) {
      fs.writeFileSync(filepath, contents, 'mode' in options ? { mode: options.mode } : {});
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
 * Copy a directory or file, optionally processing its content.
 * @param {string} srcpath
 * @param {string} destpath
 * @param {Object} [options]
 */
file.copy = (srcpath, destpath, options) => {
  if (file.isDir(srcpath)) {
    file.mkdir(destpath);
    fs.readdirSync(srcpath).forEach((filepath) => {
      file.copy(
        path.join(srcpath, filepath),
        path.join(destpath, filepath),
        options
      );
    });
  } else {
    file._copy(srcpath, destpath, options);
  }
};

/**
 * Internal copy helper for files.
 * @param {string} srcpath
 * @param {string} destpath
 * @param {Object} [options]
 */
file._copy = (srcpath, destpath, options = {}) => {
  const process =
    options.process &&
    options.noProcess !== true &&
    !(options.noProcess && file.isMatch(options.noProcess, srcpath));
  const readWriteOptions = process ? options : { encoding: null };
  const contents = file.read(srcpath, readWriteOptions);
  if (process) {
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
 * @param {string} filepath
 * @param {Object} [options]
 * @returns {boolean}
 */
file.delete = (filepath, options = {}) => {
  filepath = String(filepath);
  const nowrite = grunt.option('no-write');
  const opts = { force: grunt.option('force') || false, ...options };
  grunt.verbose.write(`${nowrite ? 'Not actually deleting ' : 'Deleting '} ${filepath}...`);
  if (!file.exists(filepath)) {
    grunt.verbose.error();
    grunt.log.warn('Cannot delete nonexistent file.');
    return false;
  }
  if (!opts.force) {
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
 * @returns {boolean}
 */
file.exists = (...args) => {
  const filepath = path.join(...args);
  return fs.existsSync(filepath);
};

/**
 * True if the file is a symbolic link.
 * @returns {boolean}
 */
file.isLink = (...args) => {
  const filepath = path.join(...args);
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
 * @returns {boolean}
 */
file.isDir = (...args) => {
  const filepath = path.join(...args);
  return file.exists(filepath) && fs.statSync(filepath).isDirectory();
};

/**
 * True if the path is a file.
 * @returns {boolean}
 */
file.isFile = (...args) => {
  const filepath = path.join(...args);
  return file.exists(filepath) && fs.statSync(filepath).isFile();
};

/**
 * Is a given file path absolute?
 * @returns {boolean}
 */
file.isPathAbsolute = (...args) => {
  const filepath = path.join(...args);
  return path.isAbsolute(filepath);
};

/**
 * Do all the specified paths refer to the same path?
 * @returns {boolean}
 */
file.arePathsEquivalent = (first, ...rest) => {
  const resolvedFirst = path.resolve(first);
  return rest.every((p) => resolvedFirst === path.resolve(p));
};

/**
 * Are descendant path(s) contained within ancestor path?
 * @returns {boolean}
 */
file.doesPathContain = (ancestor, ...descendants) => {
  const resolvedAncestor = path.resolve(ancestor);
  return descendants.every((desc) => {
    const relative = path.relative(path.resolve(desc), resolvedAncestor);
    return relative === '' || !/\w+/.test(relative);
  });
};

/**
 * Test to see if a filepath is the CWD.
 * @returns {boolean}
 */
file.isPathCwd = (...args) => {
  const filepath = path.join(...args);
  try {
    return file.arePathsEquivalent(
      fs.realpathSync(process.cwd()),
      fs.realpathSync(filepath)
    );
  } catch (e) {
    return false;
  }
};

/**
 * Test to see if a filepath is contained within the CWD.
 * @returns {boolean}
 */
file.isPathInCwd = (...args) => {
  const filepath = path.join(...args);
  try {
    return file.doesPathContain(
      fs.realpathSync(process.cwd()),
      fs.realpathSync(filepath)
    );
  } catch (e) {
    return false;
  }
};