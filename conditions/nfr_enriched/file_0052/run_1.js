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
const unixifyPath = function(filepath) {
  if (win32) {
    return filepath.replace(/\\/g, '/');
  }
  return filepath;
};

// Change the current base path (ie, CWD) to the specified path.
file.setBase = function() {
  const dirpath = path.join.apply(path, arguments);
  process.chdir(dirpath);
};

// Check if pattern is an exclusion pattern (starts with !)
const isExclusionPattern = (pattern) => pattern.indexOf('!') === 0;

// Remove exclusion marker from pattern
const removeExclusionMarker = (pattern) => pattern.slice(1);

// Apply exclusion logic to result set
const applyExclusion = (result, matches) => grunt.util._.difference(result, matches);

// Apply inclusion logic to result set
const applyInclusion = (result, matches) => grunt.util._.union(result, matches);

// Process a single pattern and update result set
const processSinglePattern = (pattern, result, fn) => {
  const exclusion = isExclusionPattern(pattern);
  const processedPattern = exclusion ? removeExclusionMarker(pattern) : pattern;
  const matches = fn(processedPattern);
  
  return exclusion ? applyExclusion(result, matches) : applyInclusion(result, matches);
};

// Process specified wildcard glob patterns or filenames against a
// callback, excluding and uniquing files in the result set.
const processPatterns = function(patterns, fn) {
  let result = [];
  grunt.util._.flattenDeep(patterns).forEach(function(pattern) {
    result = processSinglePattern(pattern, result, fn);
  });
  return result;
};

// Validate match function arguments
const validateMatchArguments = (patterns, filepaths) => {
  if (patterns == null || filepaths == null) {
    return false;
  }
  if (patterns.length === 0 || filepaths.length === 0) {
    return false;
  }
  return true;
};

// Normalize match arguments to arrays
const normalizeMatchArguments = (patterns, filepaths) => {
  const normalizedPatterns = Array.isArray(patterns) ? patterns : [patterns];
  const normalizedFilepaths = Array.isArray(filepaths) ? filepaths : [filepaths];
  return { patterns: normalizedPatterns, filepaths: normalizedFilepaths };
};

// Match a filepath or filepaths against one or more wildcard patterns. Returns
// all matching filepaths.
file.match = function(options, patterns, filepaths) {
  let opts = options;
  let pats = patterns;
  let fps = filepaths;
  
  if (grunt.util.kindOf(opts) !== 'object') {
    fps = pats;
    pats = opts;
    opts = {};
  }
  
  if (!validateMatchArguments(pats, fps)) {
    return [];
  }
  
  const normalized = normalizeMatchArguments(pats, fps);
  
  return processPatterns(normalized.patterns, function(pattern) {
    return file.minimatch.match(normalized.filepaths, pattern, opts);
  });
};

// Match a filepath or filepaths against one or more wildcard patterns. Returns
// true if any of the patterns match.
file.isMatch = function() {
  return file.match.apply(file, arguments).length > 0;
};

// Apply filter to matches if filter option is provided
const applyFilterToMatches = (matches, options) => {
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
  
  if (patterns.length === 0) {
    return [];
  }
  
  const matches = processPatterns(patterns, function(pattern) {
    return file.glob.sync(pattern, options);
  });
  
  return applyFilterToMatches(matches, options);
};

const pathSeparatorRe = /[\/\\]/g;

// The "ext" option refers to either everything after the first dot (default)
// or everything after the last dot.
const extDotRe = {
  first: /(\.[^\/]*)?$/,
  last: /(\.[^\/\.]*)?$/,
};

// Apply flatten option to destination path
const applyFlattenOption = (destPath, options) => {
  return options.flatten ? path.basename(destPath) : destPath;
};

// Apply extension option to destination path
const applyExtensionOption = (destPath, options) => {
  if ('ext' in options) {
    return destPath.replace(extDotRe[options.extDot], options.ext);
  }
  return destPath;
};

// Normalize path separators to forward slashes
const normalizePath = (filepath) => filepath.replace(pathSeparatorRe, '/');

// Create or update file mapping entry
const createOrUpdateFileMapping = (files, fileByDest, src, dest) => {
  if (fileByDest[dest]) {
    fileByDest[dest].src.push(src);
  } else {
    const fileEntry = { src: [src], dest: dest };
    files.push(fileEntry);
    fileByDest[dest] = fileEntry;
  }
};

// Build a multi task "files" object dynamically.
file.expandMapping = function(patterns, destBase, options) {
  const opts = grunt.util._.defaults({}, options, {
    extDot: 'first',
    rename: function(destBase, destPath) {
      return path.join(destBase || '', destPath);
    }
  });
  
  const files = [];
  const fileByDest = {};
  
  file.expand(opts, patterns).forEach(function(src) {
    let destPath = src;
    destPath = applyFlattenOption(destPath, opts);
    destPath = applyExtensionOption(destPath, opts);
    
    let dest = opts.rename(destBase, destPath, opts);
    
    if (opts.cwd) {
      src = path.join(opts.cwd, src);
    }
    
    dest = normalizePath(dest);
    src = normalizePath(src);
    
    createOrUpdateFileMapping(files, fileByDest, src, dest);
  });
  
  return files;
};

// Like mkdir -p. Create a directory and any intermediary directories.
file.mkdir = function(dirpath, mode) {
  if (grunt.option('no-write')) {
    return;
  }
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

// Decode file contents with proper encoding handling
const decodeFileContents = (contents, options) => {
  if (options.encoding !== null) {
    return iconv.decode(contents, options.encoding || file.defaultEncoding, {stripBOM: !file.preserveBOM});
  }
  return contents;
};

// Read a file, return its contents.
file.read = function(filepath, options) {
  const opts = options || {};
  let contents;
  grunt.verbose.write('Reading ' + filepath + '...');
  try {
    contents = fs.readFileSync(String(filepath));
    contents = decodeFileContents(contents, opts);
    grunt.verbose.ok();
    return contents;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Unable to read "' + filepath + '" file (Error code: ' + e.code + ').', e);
  }
};

// Parse JSON content
const parseJSONContent = (src, filepath) => {
  try {
    return JSON.parse(src);
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Unable to parse "' + filepath + '" file (' + e.message + ').', e);
  }
};

// Read a file, parse its contents, return an object.
file.readJSON = function(filepath, options) {
  const src = file.read(filepath, options);
  grunt.verbose.write('Parsing ' + filepath + '...');
  const result = parseJSONContent(src, filepath);
  grunt.verbose.ok();
  return result;
};

// Parse YAML content
const parseYAMLContent = (src, filepath, yamlOptions) => {
  try {
    if (yamlOptions.unsafeLoad) {
      return YAML.load(src);
    }
    return YAML.safeLoad(src);
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Unable to parse "' + filepath + '" file (' + e.message + ').', e);
  }
};

// Read a YAML file, parse its contents, return an object.
file.readYAML = function(filepath, options, yamlOptions) {
  const opts = options || {};
  const ymlOpts = yamlOptions || {};
  
  const src = file.read(filepath, opts);
  grunt.verbose.write('Parsing ' + filepath + '...');
  const result = parseYAMLContent(src, filepath, ymlOpts);
  grunt.verbose.ok();
  return result;
};

// Encode file contents with proper encoding handling
const encodeFileContents = (contents, options) => {
  if (!Buffer.isBuffer(contents)) {
    return iconv.encode(contents, options.encoding || file.defaultEncoding);
  }
  return contents;
};

// Write a file.
file.write = function(filepath, contents, options) {
  const opts = options || {};
  const nowrite = grunt.option('no-write');
  grunt.verbose.write((nowrite ? 'Not actually writing ' : 'Writing ') + filepath + '...');
  
  file.mkdir(path.dirname(filepath));
  try {
    const encodedContents = encodeFileContents(contents, opts);
    
    if (!nowrite) {
      fs.writeFileSync(filepath, encodedContents, 'mode' in opts ? {mode: opts.mode} : {});
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

// Determine if file should be processed
const shouldProcessFile = (options, srcpath) => {
  return options.process && options.noProcess !== true &&
    !(options.noProcess && file.isMatch(options.noProcess, srcpath));
};

// Process file contents
const processFileContents = (contents, srcpath, destpath, options) => {
  grunt.verbose.write('Processing source...');
  try {
    return options.process(contents, srcpath, destpath);
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Error while processing "' + srcpath + '" file.', e);
  }
};

// Read a file, optionally processing its content, then write the output.
file._copy = function(srcpath, destpath, options) {
  const opts = options || {};
  const process = shouldProcessFile(opts, srcpath);
  const readWriteOptions = process ? opts : {encoding: null};
  
  let contents = file.read(srcpath, readWriteOptions);
  
  if (process) {
    contents = processFileContents(contents, srcpath, destpath, opts);
    grunt.verbose.ok();
  }
  
  if (contents === false) {
    grunt.verbose.writeln('Write aborted.');
  } else {
    file.write(destpath, contents, readWriteOptions);
  }
};

// Check if file exists
const fileExists = (filepath) => file.exists(filepath);

// Check if deletion is allowed
const isDeletionAllowed = (filepath, options) => {
  if (!options.force) {
    if (file.isPathCwd(filepath)) {
      return false;
    }
    if (!file.isPathInCwd(filepath)) {
      return false;
    }
  }
  return true;
};

// Perform actual deletion
const performDeletion = (filepath, nowrite) => {
  if (!nowrite) {
    rimraf.sync(filepath);
  }
};

// Delete folders and files recursively
file.delete = function(filepath, options) {
  const filePath = String(filepath);
  const nowrite = grunt.option('no-write');
  const opts = options || {force: grunt.option('force') || false};
  
  grunt.verbose.write((nowrite ? 'Not actually deleting ' : 'Deleting ') + filePath + '...');
  
  if (!fileExists(filePath)) {
    grunt.verbose.error();
    grunt.log.warn('Cannot delete nonexistent file.');
    return false;
  }
  
  if (!isDeletionAllowed(filePath, opts)) {
    grunt.verbose.error();
    if (file.isPathCwd(filePath)) {
      grunt.fail.warn('Cannot delete the current working directory.');
    } else {
      grunt.fail.warn('Cannot delete files outside the current working directory.');
    }
    return false;
  }
  
  try {
    performDeletion(filePath, nowrite);
    grunt.verbose.ok();
    return true;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Unable to delete "' + filePath + '" file (' + e.message + ').', e);
  }
};

// True if the file path exists.
file.exists = function() {
  const filepath = path.join.apply(path, arguments);
  return fs.existsSync(filepath);
};

// True if the file is a symbolic link.
file.isLink = function() {
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

// True if the path is a directory.
file.isDir = function() {
  const filepath = path.join.apply(path, arguments);
  return file.exists(filepath) && fs.statSync(filepath).isDirectory();
};

// True if the path is a file.
file.isFile = function() {
  const filepath = path.join.apply(path, arguments);
  return file.exists(filepath) && fs.statSync(filepath).isFile();
};

// Is a given file path absolute?
file.isPathAbsolute = function() {
  const filepath = path.join.apply(path, arguments);
  return path.isAbsolute(filepath);
};

// Do all the specified paths refer to the same path?
file.arePathsEquivalent = function(first) {
  const firstResolved = path.resolve(first);
  for (let i = 1; i < arguments.length; i++) {
    if (firstResolved !== path.resolve(arguments[i])) {
      return false;
    }
  }
  return true;
};

// Are descendant path(s) contained within ancestor path? Note: does not test
// if paths actually exist.
file.doesPathContain = function(ancestor) {
  const ancestorResolved = path.resolve(ancestor);
  for (let i = 1; i < arguments.length; i++) {
    const relative = path.relative(path.resolve(arguments[i]), ancestorResolved);
    if (relative === '' || /\w+/.test(relative)) {
      return false;
    }
  }
  return true;
};

// Test to see if a filepath is the CWD.
file.isPathCwd = function() {
  const filepath = path.join.apply(path, arguments);
  try {
    return file.arePathsEquivalent(fs.realpathSync(process.cwd()), fs.realpathSync(filepath));
  } catch (e) {
    return false;
  }
};

// Test to see if a filepath is contained within the CWD.
file.isPathInCwd = function() {
  const filepath = path.join.apply(path, arguments);
  try {
    return file.doesPathContain(fs.realpathSync(process.cwd()), fs.realpathSync(filepath));
  } catch (e) {
    return false;
  }
};