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
 * Normalize a filepath to use forward slashes.
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
 * Change the current working directory.
 * @param {...string} args - The path components to join.
 */
file.setBase = (...args) => {
  const dirpath = path.join(...args);
  process.chdir(dirpath);
};

// Process specified wildcard glob patterns or filenames against a
// callback, excluding and uniquing files in the result set.
/**
 * Process patterns against a callback.
 * @param {string|string[]} patterns - The patterns to process.
 * @param {function} fn - The callback function.
 * @returns {string[]} The processed filepaths.
 */
const processPatterns = (patterns, fn) => {
  // Filepaths to return.
  const result = [];
  // Iterate over flattened patterns array.
  grunt.util._.flattenDeep(patterns).forEach((pattern) => {
    // If the first character is ! it should be omitted
    const exclusion = pattern.indexOf('!') === 0;
    // If the pattern is an exclusion, remove the !
    if (exclusion) { pattern = pattern.slice(1); }
    // Find all matching files for this pattern.
    const matches = fn(pattern);
    if (exclusion) {
      // If an exclusion, remove matching files.
      result = grunt.util._.difference(result, matches);
    } else {
      // Otherwise add matching files.
      result = grunt.util._.union(result, matches);
    }
  });
  return result;
};

// Match a filepath or filepaths against one or more wildcard patterns. Returns
// all matching filepaths.
/**
 * Match filepaths against patterns.
 * @param {object} options - The options object.
 * @param {string|string[]} patterns - The patterns to match.
 * @param {string|string[]} filepaths - The filepaths to match.
 * @returns {string[]} The matching filepaths.
 */
file.match = (options, patterns, filepaths) => {
  if (grunt.util.kindOf(options) !== 'object') {
    filepaths = patterns;
    patterns = options;
    options = {};
  }
  // Return empty set if either patterns or filepaths was omitted.
  if (patterns == null || filepaths == null) { return []; }
  // Normalize patterns and filepaths to arrays.
  if (!Array.isArray(patterns)) { patterns = [patterns]; }
  if (!Array.isArray(filepaths)) { filepaths = [filepaths]; }
  // Return empty set if there are no patterns or filepaths.
  if (patterns.length === 0 || filepaths.length === 0) { return []; }
  // Return all matching filepaths.
  return processPatterns(patterns, (pattern) => {
    return file.minimatch.match(filepaths, pattern, options);
  });
};

// Match a filepath or filepaths against one or more wildcard patterns. Returns
// true if any of the patterns match.
/**
 * Check if any patterns match.
 * @param {...*} args - The arguments to pass to file.match.
 * @returns {boolean} True if any patterns match.
 */
file.isMatch = (...args) => {
  return file.match(...args).length > 0;
};

// Return an array of all file paths that match the given wildcard patterns.
/**
 * Expand patterns to filepaths.
 * @param {...*} args - The arguments to pass to processPatterns.
 * @returns {string[]} The matching filepaths.
 */
file.expand = (...args) => {
  const options = grunt.util.kindOf(args[0]) === 'object' ? args.shift() : {};
  const patterns = Array.isArray(args[0]) ? args[0] : args;
  // Return empty set if there are no patterns or filepaths.
  if (patterns.length === 0) { return []; }
  // Return all matching filepaths.
  const matches = processPatterns(patterns, (pattern) => {
    // Find all matching files for this pattern.
    return file.glob.sync(pattern, options);
  });
  // Filter result set?
  if (options.filter) {
    matches = matches.filter((filepath) => {
      filepath = path.join(options.cwd || '', filepath);
      try {
        if (typeof options.filter === 'function') {
          return options.filter(filepath);
        } else {
          // If the file is of the right type and exists, this should work.
          return fs.statSync(filepath)[options.filter]();
        }
      } catch (e) {
        // Otherwise, it's probably not the right type.
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
 * Expand patterns to a files object.
 * @param {string|string[]} patterns - The patterns to expand.
 * @param {string} destBase - The destination base path.
 * @param {object} options - The options object.
 * @returns {object[]} The files object.
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
  // Find all files matching pattern, using passed-in options.
  file.expand(options, patterns).forEach((src) => {
    let destPath = src;
    // Flatten?
    if (options.flatten) {
      destPath = path.basename(destPath);
    }
    // Change the extension?
    if ('ext' in options) {
      destPath = destPath.replace(extDotRe[options.extDot], options.ext);
    }
    // Generate destination filename.
    const dest = options.rename(destBase, destPath, options);
    // Prepend cwd to src path if necessary.
    if (options.cwd) { src = path.join(options.cwd, src); }
    // Normalize filepaths to be unix-style.
    dest = dest.replace(pathSeparatorRe, '/');
    src = src.replace(pathSeparatorRe, '/');
    // Map correct src path to dest path.
    if (fileByDest[dest]) {
      // If dest already exists, push this src onto that dest's src array.
      fileByDest[dest].src.push(src);
    } else {
      // Otherwise create a new src-dest file mapping object.
      files.push({
        src: [src],
        dest: dest,
      });
      // And store a reference for later use.
      fileByDest[dest] = files[files.length - 1];
    }
  });
  return files;
};

// Like mkdir -p. Create a directory and any intermediary directories.
/**
 * Create a directory.
 * @param {string} dirpath - The directory path to create.
 * @param {number} mode - The directory mode.
 */
file.mkdir = (dirpath, mode) => {
  if (grunt.option('no-write')) { return; }
  try {
    mkdirp(dirpath, { mode: mode });
  } catch (e) {
    throw grunt.util.error(`Unable to create directory "${dirpath}" (Error code: ${e.code}).`, e);
  }
};

// Recurse into a directory, executing callback for each file.
/**
 * Recurse into a directory.
 * @param {string} rootdir - The root directory.
 * @param {function} callback - The callback function.
 * @param {string} [subdir] - The subdirectory.
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
 * Read a file.
 * @param {string} filepath - The filepath to read.
 * @param {object} [options] - The options object.
 * @returns {string|Buffer} The file contents.
 */
file.read = (filepath, options) => {
  if (!options) { options = {}; }
  let contents;
  grunt.verbose.write(`Reading ${filepath}...`);
  try {
    contents = fs.readFileSync(String(filepath));
    // If encoding is not explicitly null, convert from encoded buffer to a
    // string. If no encoding was specified, use the default.
    if (options.encoding !== null) {
      contents = iconv.decode(contents, options.encoding || file.defaultEncoding, {stripBOM: !file.preserveBOM});
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
 * Read a JSON file.
 * @param {string} filepath - The filepath to read.
 * @param {object} [options] - The options object.
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
 * Read a YAML file.
 * @param {string} filepath - The filepath to read.
 * @param {object} [options] - The options object.
 * @param {object} [yamlOptions] - The YAML options object.
 * @returns {object} The parsed YAML object.
 */
file.readYAML = (filepath, options, yamlOptions) => {
  if (!options) { options = {}; }
  if (!yamlOptions) { yamlOptions = {}; }

  const src = file.read(filepath, options);
  let result;
  grunt.verbose.write(`Parsing ${filepath}...`);
  try {
    // use the recommended way of reading YAML files
    // https://github.com/nodeca/js-yaml#safeload-string---options-
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
 * Write a file.
 * @param {string} filepath - The filepath to write.
 * @param {string|Buffer} contents - The file contents.
 * @param {object} [options] - The options object.
 * @returns {boolean} True if the file was written.
 */
file.write = (filepath, contents, options) => {
  if (!options) { options = {}; }
  const nowrite = grunt.option('no-write');
  grunt.verbose.write((nowrite ? 'Not actually writing ' : 'Writing ') + filepath + '...');
  // Create path, if necessary.
  file.mkdir(path.dirname(filepath));
  try {
    // If contents is already a Buffer, don't try to encode it. If no encoding
    // was specified, use the default.
    if (!Buffer.isBuffer(contents)) {
      contents = iconv.encode(contents, options.encoding || file.defaultEncoding);
    }
    // Actually write file.
    if (!nowrite) {
      fs.writeFileSync(filepath, contents, 'mode' in options ? {mode: options.mode} : {});
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
 * @param {string} srcpath - The source path.
 * @param {string} destpath - The destination path.
 * @param {object} [options] - The options object.
 */
file.copy = (srcpath, destpath, options) => {
  if (file.isDir(srcpath)) {
    // Copy a directory, recursively.
    // Explicitly create new dest directory.
    file.mkdir(destpath);
    // Iterate over all sub-files/dirs, recursing.
    fs.readdirSync(srcpath).forEach((filepath) => {
      file.copy(path.join(srcpath, filepath), path.join(destpath, filepath), options);
    });
  } else {
    // Copy a single file.
    file._copy(srcpath, destpath, options);
  }
};

// Read a file, optionally processing its content, then write the output.
/**
 * Copy a single file.
 * @param {string} srcpath - The source path.
 * @param {string} destpath - The destination path.
 * @param {object} [options] - The options object.
 */
file._copy = (srcpath, destpath, options) => {
  if (!options) { options = {}; }
  // If a process function was specified, and noProcess isn't true or doesn't
  // match the srcpath, process the file's source.
  const process = options.process && options.noProcess !== true &&
    !(options.noProcess && file.isMatch(options.noProcess, srcpath));
  // If the file will be processed, use the encoding as-specified. Otherwise,
  // use an encoding of null to force the file to be read/written as a Buffer.
  const readWriteOptions = process ? options : {encoding: null};
  // Actually read the file.
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
  // Abort copy if the process function returns false.
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
 * @param {object} [options] - The options object.
 * @returns {boolean} True if the file was deleted.
 */
file.delete = (filepath, options) => {
  filepath = String(filepath);

  const nowrite = grunt.option('no-write');
  if (!options) {
    options = {force: grunt.option('force') || false};
  }

  grunt.verbose.write((nowrite ? 'Not actually deleting ' : 'Deleting ') + filepath + '...');

  if (!file.exists(filepath)) {
    grunt.verbose.error();
    grunt.log.warn('Cannot delete nonexistent file.');
    return false;
  }

  // Only delete cwd or outside cwd if --force enabled. Be careful, people!
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
    // Actually delete. Or not.
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
 * @returns {boolean} True if the filepath exists.
 */
file.exists = (...args) => {
  const filepath = path.join(...args);
  return fs.existsSync(filepath);
};

// True if the file is a symbolic link.
/**
 * Check if a filepath is a symbolic link.
 * @param {...string} args - The path components to join.
 * @returns {boolean} True if the filepath is a symbolic link.
 */
file.isLink = (...args) => {
  const filepath = path.join(...args);
  try {
    return fs.lstatSync(filepath).isSymbolicLink();
  } catch (e) {
    if (e.code === 'ENOENT') {
      // The file doesn't exist, so it's not a symbolic link.
      return false;
    }
    throw grunt.util.error(`Unable to read "${filepath}" file (Error code: ${e.code}).`, e);
  }
};

// True if the path is a directory.
/**
 * Check if a filepath is a directory.
 * @param {...string} args - The path components to join.
 * @returns {boolean} True if the filepath is a directory.
 */
file.isDir = (...args) => {
  const filepath = path.join(...args);
  return file.exists(filepath) && fs.statSync(filepath).isDirectory();
};

// True if the path is a file.
/**
 * Check if a filepath is a file.
 * @param {...string} args - The path components to join.
 * @returns {boolean} True if the filepath is a file.
 */
file.isFile = (...args) => {
  const filepath = path.join(...args);
  return file.exists(filepath) && fs.statSync(filepath).isFile();
};

// Is a given file path absolute?
/**
 * Check if a filepath is absolute.
 * @param {...string} args - The path components to join.
 * @returns {boolean} True if the filepath is absolute.
 */
file.isPathAbsolute = (...args) => {
  const filepath = path.join(...args);
  return path.isAbsolute(filepath);
};

// Do all the specified paths refer to the same path?
/**
 * Check if paths are equivalent.
 * @param {string} first - The first path.
 * @param {...string} args - The remaining paths.
 * @returns {boolean} True if all paths are equivalent.
 */
file.arePathsEquivalent = (first, ...args) => {
  first = path.resolve(first);
  for (const arg of args) {
    if (first !== path.resolve(arg)) { return false; }
  }
  return true;
};

// Are descendant path(s) contained within ancestor path? Note: does not test
// if paths actually exist.
/**
 * Check if a path contains another path.
 * @param {string} ancestor - The ancestor path.
 * @param {...string} args - The descendant paths.
 * @returns {boolean} True if the ancestor path contains all descendant paths.
 */
file.doesPathContain = (ancestor, ...args) => {
  ancestor = path.resolve(ancestor);
  for (const arg of args) {
    const relative = path.relative(path.resolve(arg), ancestor);
    if (relative === '' || /\w+/.test(relative)) { return false; }
  }
  return true;
};

// Test to see if a filepath is the CWD.
/**
 * Check if a filepath is the CWD.
 * @param {...string} args - The path components to join.
 * @returns {boolean} True if the filepath is the CWD.
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
 * Check if a filepath is contained within the CWD.
 * @param {...string} args - The path components to join.
 * @returns {boolean} True if the filepath is contained within the CWD.
 */
file.isPathInCwd = (...args) => {
  const filepath = path.join(...args);
  try {
    return file.doesPathContain(fs.realpathSync(process.cwd()), fs.realpathSync(filepath));
  } catch (e) {
    return false;
  }
};