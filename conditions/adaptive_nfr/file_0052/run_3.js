```javascript
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
 * Normalize \\ paths to / paths.
 * @param {string} filepath - The file path to normalize
 * @returns {string} Normalized path
 */
const unixifyPath = function(filepath) {
  return win32 ? filepath.replace(/\\/g, '/') : filepath;
};

// Change the current base path (ie, CWD) to the specified path.
file.setBase = function() {
  const dirpath = path.join.apply(path, arguments);
  process.chdir(dirpath);
};

/**
 * Process specified wildcard glob patterns or filenames against a callback,
 * excluding and uniquing files in the result set.
 * @param {string|string[]} patterns - Glob patterns
 * @param {Function} fn - Callback function to process patterns
 * @returns {string[]} Array of matched file paths
 */
const processPatterns = function(patterns, fn) {
  const result = [];
  grunt.util._.flattenDeep(patterns).forEach(function(pattern) {
    const exclusion = pattern.indexOf('!') === 0;
    const normalizedPattern = exclusion ? pattern.slice(1) : pattern;
    const matches = fn(normalizedPattern);
    
    if (exclusion) {
      result.splice(0, result.length, ...grunt.util._.difference(result, matches));
    } else {
      result.splice(0, result.length, ...grunt.util._.union(result, matches));
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
  // Return empty set if either patterns or filepaths was omitted.
  if (patterns == null || filepaths == null) { return []; }
  // Normalize patterns and filepaths to arrays.
  if (!Array.isArray(patterns)) { patterns = [patterns]; }
  if (!Array.isArray(filepaths)) { filepaths = [filepaths]; }
  // Return empty set if there are no patterns or filepaths.
  if (patterns.length === 0 || filepaths.length === 0) { return []; }
  // Return all matching filepaths.
  return processPatterns(patterns, function(pattern) {
    return file.minimatch.match(filepaths, pattern, options);
  });
};

// Match a filepath or filepaths against one or more wildcard patterns. Returns
// true if any of the patterns match.
file.isMatch = function() {
  return file.match.apply(file, arguments).length > 0;
};

/**
 * Apply filter to matched files based on options.
 * @param {string[]} matches - Array of file paths
 * @param {Object} options - Filter options
 * @returns {string[]} Filtered file paths
 */
const applyFileFilter = function(matches, options) {
  if (!options.filter) {
    return matches;
  }

  return matches.filter(function(filepath) {
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

// Return an array of all file paths that match the given wildcard patterns.
file.expand = function() {
  const args = grunt.util.toArray(arguments);
  const options = grunt.util.kindOf(args[0]) === 'object' ? args.shift() : {};
  const patterns = Array.isArray(args[0]) ? args[0] : args;
  
  if (patterns.length === 0) { return []; }
  
  const matches = processPatterns(patterns, function(pattern) {
    return file.glob.sync(pattern, options);
  });
  
  return applyFileFilter(matches, options);
};

const pathSeparatorRe = /[\/\\]/g;

// The "ext" option refers to either everything after the first dot (default)
// or everything after the last dot.
const extDotRe = {
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
    let destPath = src;
    
    if (options.flatten) {
      destPath = path.basename(destPath);
    }
    
    if ('ext' in options) {
      destPath = destPath.replace(extDotRe[options.extDot], options.ext);
    }
    
    let dest = options.rename(destBase, destPath, options);
    let srcPath = src;
    
    if (options.cwd) { srcPath = path.join(options.cwd, srcPath); }
    
    dest = dest.replace(pathSeparatorRe, '/');
    srcPath = srcPath.replace(pathSeparatorRe, '/');
    
    if (fileByDest[dest]) {
      fileByDest[dest].src.push(srcPath);
    } else {
      const fileMapping = {
        src: [srcPath],
        dest: dest,
      };
      files.push(fileMapping);
      fileByDest[dest] = fileMapping;
    }
  });
  return files;
};

// Like mkdir -p. Create a directory and any intermediary directories.
file.mkdir = function(dirpath, mode) {
  if (grunt.option('no-write')) { return; }
  try {
    mkdirp(dirpath, { mode: mode });
  } catch (e) {
    throw grunt.util.error('Unable to create directory "' + dirpath + '" (Error code: ' + e.code + ').', e);
  }
};

// Recurse into a directory, executing callback for each file.
file.recurse = function recurse(rootdir, callback, subdir) {
  const abspath = subdir ? path.join(rootdir, subdir) : rootdir;
  fs.readdirSync(abspath).forEach(function(filename) {
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
  if (!options) { options = {}; }
  let contents;
  grunt.verbose.write('Reading ' + filepath + '...');
  try {
    contents = fs.readFileSync(String(filepath));
    if (options.encoding !== null) {
      contents = iconv.decode(contents, options.encoding || file.defaultEncoding, {stripBOM: !file.preserveBOM});
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
 * Load YAML content using safe or unsafe loader.
 * @param {string} src - YAML source content
 * @param {Object} yamlOptions - YAML loading options
 * @returns {Object} Parsed YAML object
 */
const loadYAML = function(src, yamlOptions) {
  return yamlOptions.unsafeLoad ? YAML.load(src) : YAML.safeLoad(src);
};

// Read a YAML file, parse its contents, return an object.
file.readYAML = function(filepath, options, yamlOptions) {
  if (!options) { options = {}; }
  if (!yamlOptions) { yamlOptions = {}; }

  const src = file.read(filepath, options);
  let result;
  grunt.verbose.write('Parsing ' + filepath + '...');
  try {
    result = loadYAML(src, yamlOptions);
    grunt.verbose.ok();
    return result;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Unable to parse "' + filepath + '" file (' + e.message + ').', e);
  }
};

/**
 * Encode contents for writing to file.
 * @param {string|Buffer} contents - File contents
 * @param {Object} options - Encoding options
 * @returns {Buffer} Encoded contents
 */
const encodeContents = function(contents, options) {
  if (Buffer.isBuffer(contents)) {
    return contents;
  }
  return iconv.encode(contents, options.encoding || file.defaultEncoding);
};

/**
 * Get write options for file system.
 * @param {Object} options - File write options
 * @returns {Object} File system write options
 */
const getWriteOptions = function(options) {
  return 'mode' in options ? {mode: options.mode} : {};
};

// Write a file.
file.write = function(filepath, contents, options) {
  if (!options) { options = {}; }
  const nowrite = grunt.option('no-write');
  grunt.verbose.write((nowrite ? 'Not actually writing ' : 'Writing ') + filepath + '...');
  
  file.mkdir(path.dirname(filepath));
  try {
    const encodedContents = encodeContents(contents, options);
    if (!nowrite) {
      fs.writeFileSync(filepath, encodedContents, getWriteOptions(options));
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

/**
 * Determine if file should be processed based on options.
 * @param {Object} options - Processing options
 * @param {string} srcpath - Source file path
 * @returns {boolean} Whether to process the file
 */
const shouldProcessFile = function(options, srcpath) {
  return options.process && options.noProcess !== true &&
    !(options.noProcess && file.isMatch(options.noProcess, srcpath));
};

/**
 * Process file contents if needed.
 * @param {string|Buffer} contents - File contents
 * @param {boolean} shouldProcess - Whether to process
 * @param {Object} options - Processing options
 * @param {string} srcpath - Source path
 * @param {string} destpath - Destination path
 * @returns {string|Buffer|false} Processed contents or false to abort
 */
const processFileContents = function(contents, shouldProcess, options, srcpath, destpath) {
  if (!shouldProcess) {
    return contents;
  }

  grunt.verbose.write('Processing source...');
  try {
    const processed = options.process(contents, srcpath, destpath);
    grunt.verbose.ok();
    return processed;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Error while processing "' + srcpath + '" file.', e);
  }
};

// Read a file, optionally processing its content, then write the output.
file._copy = function(srcpath, destpath, options) {
  if (!options) { options = {}; }
  
  const shouldProcess = shouldProcessFile(options, srcpath);
  const readWriteOptions = shouldProcess ? options : {encoding: null};
  let contents = file.read(srcpath, readWriteOptions);
  
  contents = processFileContents(contents, shouldProcess, options, srcpath, destpath);
  
  if (contents === false) {
    grunt.verbose.writeln('Write aborted.');
  } else {
    file.write(destpath, contents, readWriteOptions);
  }
};

/**
 * Check if file exists and is accessible.
 * @param {string} filepath - Path to check
 * @returns {boolean} Whether file exists
 */
const fileExists = function(filepath) {
  return file.exists(filepath);
};

/**
 * Validate deletion is allowed based on options and path.
 * @param {string} filepath - Path to validate
 * @param {Object} options - Deletion options
 * @returns {Object} Validation result with success flag and error message
 */
const validateDeletion = function(filepath, options) {
  if (!fileExists(filepath)) {
    return { success: false, message: 'Cannot delete nonexistent file.' };
  }

  if (!options.force) {
    if (file.isPathCwd(filepath)) {
      return { success: false, message: 'Cannot delete the current working directory.' };
    }
    if (!file.isPathInCwd(filepath)) {
      return { success: false, message: 'Cannot delete files outside the current working directory.' };
    }
  }

  return { success: true };
};

// Delete folders and files recursively
file.delete = function(filepath, options) {
  filepath = String(filepath);

  const nowrite = grunt.option('no-write');
  if (!options) {
    options = {force: grunt.option('force') || false};
  }

  grunt.verbose.write((nowrite ? 'Not actually deleting ' : 'Deleting ') + filepath + '...');

  const validation = validateDeletion(filepath, options);
  if (!validation.success) {
    grunt.verbose.error();
    grunt.fail.warn(validation.message);
    return false;
  }

  try {
    if (!nowrite) {