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

// Normalize \\ paths to / paths.
/**
 * Normalize a filepath to use Unix-style path separators.
 * @param {string} filepath - The filepath to normalize.
 * @returns {string} The normalized filepath.
 */
const unixifyPath = (filepath) => {
  if (win32) {
    return filepath.replace(/\\/g, '/');
  } else {
    return filepath;
  }
};

// Change the current base path (ie, CWD) to the specified path.
/**
 * Change the current working directory to the specified path.
 * @param {...string} args - The path components to join.
 */
file.setBase = (...args) => {
  const dirpath = path.join(...args);
  process.chdir(dirpath);
};

// Process specified wildcard glob patterns or filenames against a
// callback, excluding and uniquing files in the result set.
/**
 * Process a list of glob patterns or filenames, excluding and uniquing files.
 * @param {string|string[]} patterns - The glob patterns or filenames to process.
 * @param {function} fn - The callback function to apply to each pattern.
 * @returns {string[]} The list of unique files matching the patterns.
 */
const processPatterns = (patterns, fn) => {
  const result = [];
  grunt.util._.flattenDeep(patterns).forEach((pattern) => {
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

// Match a filepath or filepaths against one or more wildcard patterns. Returns
// all matching filepaths.
/**
 * Match a list of filepaths against a list of glob patterns.
 * @param {object} options - The options for the match.
 * @param {string|string[]} patterns - The glob patterns to match.
 * @param {string|string[]} filepaths - The filepaths to match.
 * @returns {string[]} The list of matching filepaths.
 */
file.match = (options, patterns, filepaths) => {
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
  return processPatterns(patterns, (pattern) => {
    return file.minimatch.match(filepaths, pattern, options);
  });
};

// Match a filepath or filepaths against one or more wildcard patterns. Returns
// true if any of the patterns match.
/**
 * Check if any of the glob patterns match the filepaths.
 * @param {...*} args - The arguments to pass to file.match.
 * @returns {boolean} True if any of the patterns match, false otherwise.
 */
file.isMatch = (...args) => {
  return file.match(...args).length > 0;
};

// Return an array of all file paths that match the given wildcard patterns.
/**
 * Expand a list of glob patterns into a list of matching filepaths.
 * @param {...*} args - The arguments to pass to file.glob.sync.
 * @returns {string[]} The list of matching filepaths.
 */
file.expand = (...args) => {
  const options = grunt.util.kindOf(args[0]) === 'object' ? args.shift() : {};
  const patterns = Array.isArray(args[0]) ? args[0] : args;
  if (patterns.length === 0) {
    return [];
  }
  const matches = processPatterns(patterns, (pattern) => {
    return file.glob.sync(pattern, options);
  });
  if (options.filter) {
    matches = matches.filter((filepath) => {
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
  last: /(\.[^\/\.]*)?$/,
};

// Build a multi task "files" object dynamically.
/**
 * Expand a list of glob patterns into a list of file mappings.
 * @param {string|string[]} patterns - The glob patterns to expand.
 * @param {string} destBase - The base destination directory.
 * @param {object} options - The options for the expansion.
 * @returns {object[]} The list of file mappings.
 */
file.expandMapping = (patterns, destBase, options) => {
  options = grunt.util._.defaults({}, options, {
    extDot: 'first',
    rename: (destBase, destPath) => {
      return path.join(destBase || '', destPath);
    }
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
    if (options.cwd) {
      src = path.join(options.cwd, src);
    }
    dest = dest.replace(pathSeparatorRe, '/');
    src = src.replace(pathSeparatorRe, '/');
    if (fileByDest[dest]) {
      fileByDest[dest].src.push(src);
    } else {
      files.push({
        src: [src],
        dest: dest,
      });
      fileByDest[dest] = files[files.length - 1];
    }
  });
  return files;
};

// Like mkdir -p. Create a directory and any intermediary directories.
/**
 * Create a directory and its parents if they do not exist.
 * @param {string} dirpath - The directory to create.
 * @param {number} mode - The mode to use for the directory.
 */
file.mkdir = (dirpath, mode) => {
  if (grunt.option('no-write')) {
    return;
  }
  try {
    mkdirp(dirpath, { mode: mode });
  } catch (e) {
    throw grunt.util.error(`Unable to create directory "${dirpath}" (Error code: ${e.code}).`, e);
  }
};

// Recurse into a directory, executing callback for each file.
/**
 * Recursively iterate over a directory and its subdirectories.
 * @param {string} rootdir - The root directory to recurse into.
 * @param {function} callback - The callback function to apply to each file.
 * @param {string} [subdir] - The current subdirectory.
 */
file.recurse = (rootdir, callback, subdir) => {
  const abspath = subdir ? path.join(rootdir, subdir) : rootdir;
  fs.readdirSync(abspath).forEach((filename) => {
    const filepath = path.join(abspath, filename);
    if (fs.statSync(filepath).isDirectory()) {
      file.recurse(rootdir, callback, unixifyPath(path.join(subdir || '', filename || '')));
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
/**
 * Read the contents of a file.
 * @param {string} filepath - The filepath to read.
 * @param {object} options - The options for the read.
 * @returns {string|Buffer} The contents of the file.
 */
file.read = (filepath, options) => {
  if (!options) {
    options = {};
  }
  let contents;
  grunt.verbose.write(`Reading ${filepath}...`);
  try {
    contents = fs.readFileSync(String(filepath));
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

// Read a file, parse its contents, return an object.
/**
 * Read and parse a JSON file.
 * @param {string} filepath - The filepath to read.
 * @param {object} options - The options for the read.
 * @returns {object} The parsed JSON object.
 */
file.readJSON = (filepath, options) => {
  const src = file.read(filepath, options);
  let result;
  grunt.verbose.write(`Parsing ${filepath}...`);
  try {
    result = JSON.parse(src);
    grunt.verbose.ok();
    return result;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error(`Unable to parse "${filepath}" file (${e.message}).`, e);
  }
};

// Read a YAML file, parse its contents, return an object.
/**
 * Read and parse a YAML file.
 * @param {string} filepath - The filepath to read.
 * @param {object} options - The options for the read.
 * @param {object} yamlOptions - The options for the YAML parser.
 * @returns {object} The parsed YAML object.
 */
file.readYAML = (filepath, options, yamlOptions) => {
  if (!options) {
    options = {};
  }
  if (!yamlOptions) {
    yamlOptions = {};
  }

  const src = file.read(filepath, options);
  let result;
  grunt.verbose.write(`Parsing ${filepath}...`);
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
    throw grunt.util.error(`Unable to parse "${filepath}" file (${e.message}).`, e);
  }
};

// Write a file.
/**
 * Write the contents of a file.
 * @param {string} filepath - The filepath to write.
 * @param {string|Buffer} contents - The contents to write.
 * @param {object} options - The options for the write.
 * @returns {boolean} True if the write was successful, false otherwise.
 */
file.write = (filepath, contents, options) => {
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
    throw grunt.util.error(`Unable to write "${filepath}" file (Error code: ${e.code}).`, e);
  }
};

// Read a file, optionally processing its content, then write the output.
// Or read a directory, recursively creating directories, reading files,
// processing content, writing output.
/**
 * Copy a file or directory.
 * @param {string} srcpath - The source filepath or directory.
 * @param {string} destpath - The destination filepath or directory.
 * @param {object} options - The options for the copy.
 */
file.copy = (srcpath, destpath, options) => {
  if (file.isDir(srcpath)) {
    file.mkdir(destpath);
    fs.readdirSync(srcpath).forEach((filepath) => {
      file.copy(path.join(srcpath, filepath), path.join(destpath, filepath), options);
    });
  } else {
    file._copy(srcpath, destpath, options);
  }
};

// Read a file, optionally processing its content, then write the output.
/**
 * Copy a single file.
 * @param {string} srcpath - The source filepath.
 * @param {string} destpath - The destination filepath.
 * @param {object} options - The options for the copy.
 */
file._copy = (srcpath, destpath, options) => {
  if (!options) {
    options = {};
  }
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
      throw grunt.util.error(`Error while processing "${srcpath}" file.`, e);
    }
  }
  if (contents === false) {
    grunt.verbose.writeln('Write aborted.');
  } else {
    file.write(destpath, contents, readWriteOptions);
  }
};

// Delete folders and files recursively
/**
 * Delete a file or directory.
 * @param {string} filepath - The filepath to delete.
 * @param {object} options - The options for the delete.
 * @returns {boolean} True if the delete was successful, false otherwise.
 */
file.delete = (filepath, options) => {
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
    throw grunt.util.error(`Unable to delete "${filepath}" file (${e.message}).`, e);
  }
};

// True if the file path exists.
/**
 * Check if a filepath exists.
 * @param {...string} args - The path components to join.
 * @returns {boolean} True if the filepath exists, false otherwise.
 */
file.exists = (...args) => {
  const filepath = path.join(...args);
  return fs.existsSync(filepath);
};

// True if the file is a symbolic link.
/**
 * Check if a filepath is a symbolic link.
 * @param {...string} args - The path components to join.
 * @returns {boolean} True if the filepath is a symbolic link, false otherwise.
 */
file.isLink = (...args) => {
  const filepath = path.join(...args);
  try {
    return fs.lstatSync(filepath).isSymbolicLink();
  } catch (e) {
    if (e.code === 'ENOENT') {
      return false;
    }
    throw grunt.util.error(`Unable to read "${filepath}" file (Error code: ${e.code}).`, e);
  }
};

// True if the path is a directory.
/**
 * Check if a filepath is a directory.
 * @param {...string} args - The path components to join.
 * @returns {boolean} True if the filepath is a directory, false otherwise.
 */
file.isDir = (...args) => {
  const filepath = path.join(...args);
  return file.exists(filepath) && fs.statSync(filepath).isDirectory();
};

// True if the path is a file.
/**
 * Check if a filepath is a file.
 * @param {...string} args - The path components to join.
 * @returns {boolean} True if the filepath is a file, false otherwise.
 */
file.isFile = (...args) => {
  const filepath = path.join(...args);
  return file.exists(filepath) && fs.statSync(filepath).isFile();
};

// Is a given file path absolute?
/**
 * Check if a filepath is absolute.
 * @param {...string} args - The path components to join.
 * @returns {boolean} True if the filepath is absolute, false otherwise.
 */
file.isPathAbsolute = (...args) => {
  const filepath = path.join(...args);
  return path.isAbsolute(filepath);
};

// Do all the specified paths refer to the same path?
/**
 * Check if multiple filepaths are equivalent.
 * @param {string} first - The first filepath to compare.
 * @param {...string} args - The additional filepaths to compare.
 * @returns {boolean} True if all filepaths are equivalent, false otherwise.
 */
file.arePathsEquivalent = (first, ...args) => {
  first = path.resolve(first);
  for (const arg of args) {
    if (first !== path.resolve(arg)) {
      return false;
    }
  }
  return true;
};

// Are descendant path(s) contained within ancestor path? Note: does not test
// if paths actually exist.
/**
 * Check if a descendant filepath is contained within an ancestor filepath.
 * @param {string} ancestor - The ancestor filepath.
 * @param {...string} args - The descendant filepaths to check.
 * @returns {boolean} True if all descendant filepaths are contained within the ancestor filepath, false otherwise.
 */
file.doesPathContain = (ancestor, ...args) => {
  ancestor = path.resolve(ancestor);
  for (const arg of args) {
    const relative = path.relative(path.resolve(arg), ancestor);
    if (relative === '' || /\w+/.test(relative)) {
      return false;
    }
  }
  return true;
};

// Test to see if a filepath is the CWD.
/**
 * Check if a filepath is the current working directory.
 * @param {...string} args - The path components to join.
 * @returns {boolean} True if the filepath is the current working directory, false otherwise.
 */
file.isPathCwd = (...args) => {
  const filepath = path.join(...args);
  try {
    return file.arePathsEquivalent(fs.realpathSync(process.cwd()), fs.realpathSync(filepath));
  } catch (e) {
    return false;
  }
};

// Test to see if a filepath is contained within the CWD.
/**
 * Check if a filepath is contained within the current working directory.
 * @param {...string} args - The path components to join.
 * @returns {boolean} True if the filepath is contained within the current working directory, false otherwise.
 */
file.isPathInCwd = (...args) => {
  const filepath = path.join(...args);
  try {
    return file.doesPathContain(fs.realpathSync(process.cwd()), fs.realpathSync(filepath));
  } catch (e) {
    return false;
  }
};