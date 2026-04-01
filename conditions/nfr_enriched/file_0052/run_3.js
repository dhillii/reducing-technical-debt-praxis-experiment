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
const isExclusionPattern = function(pattern) {
  return pattern.indexOf('!') === 0;
};

// Remove exclusion marker from pattern
const removeExclusionMarker = function(pattern) {
  return pattern.slice(1);
};

// Apply exclusion or union logic to result set
const applyPatternLogic = function(result, matches, isExclusion) {
  if (isExclusion) {
    return grunt.util._.difference(result, matches);
  }
  return grunt.util._.union(result, matches);
};

// Process specified wildcard glob patterns or filenames against a
// callback, excluding and uniquing files in the result set.
const processPatterns = function(patterns, fn) {
  let result = [];
  grunt.util._.flattenDeep(patterns).forEach(function(pattern) {
    const exclusion = isExclusionPattern(pattern);
    const normalizedPattern = exclusion ? removeExclusionMarker(pattern) : pattern;
    const matches = fn(normalizedPattern);
    result = applyPatternLogic(result, matches, exclusion);
  });
  return result;
};

// Validate match function arguments
const validateMatchArguments = function(patterns, filepaths) {
  if (patterns == null || filepaths == null) {
    return false;
  }
  if (patterns.length === 0 || filepaths.length === 0) {
    return false;
  }
  return true;
};

// Normalize patterns and filepaths to arrays
const normalizeMatchInputs = function(patterns, filepaths) {
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

  const normalized = normalizeMatchInputs(pats, fps);
  return processPatterns(normalized.patterns, function(pattern) {
    return file.minimatch.match(normalized.filepaths, pattern, opts);
  });
};

// Match a filepath or filepaths against one or more wildcard patterns. Returns
// true if any of the patterns match.
file.isMatch = function() {
  return file.match.apply(file, arguments).length > 0;
};

// Extract options from arguments
const extractExpandOptions = function(args) {
  if (grunt.util.kindOf(args[0]) === 'object') {
    return { options: args.shift(), patterns: args };
  }
  return { options: {}, patterns: args };
};

// Apply filter to matches if specified
const applyExpandFilter = function(matches, options) {
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
  const { options, patterns } = extractExpandOptions(args);

  if (patterns.length === 0) {
    return [];
  }

  const matches = processPatterns(patterns, function(pattern) {
    return file.glob.sync(pattern, options);
  });

  return applyExpandFilter(matches, options);
};

const pathSeparatorRe = /[\/\\]/g;

// The "ext" option refers to either everything after the first dot (default)
// or everything after the last dot.
const extDotRe = {
  first: /(\.[^\/]*)?$/,
  last: /(\.[^\/\.]*)?$/,
};

// Apply extension change if specified
const applyExtensionChange = function(destPath, options) {
  if ('ext' in options) {
    return destPath.replace(extDotRe[options.extDot], options.ext);
  }
  return destPath;
};

// Flatten path if specified
const applyFlattenOption = function(destPath, options) {
  if (options.flatten) {
    return path.basename(destPath);
  }
  return destPath;
};

// Normalize path separators to forward slashes
const normalizePath = function(filepath) {
  return filepath.replace(pathSeparatorRe, '/');
};

// Process a single source file for mapping
const processMappingFile = function(src, destBase, options, fileByDest, files) {
  let destPath = src;
  destPath = applyFlattenOption(destPath, options);
  destPath = applyExtensionChange(destPath, options);

  const dest = normalizePath(options.rename(destBase, destPath, options));
  const normalizedSrc = normalizePath(options.cwd ? path.join(options.cwd, src) : src);

  if (fileByDest[dest]) {
    fileByDest[dest].src.push(normalizedSrc);
  } else {
    const fileMapping = {
      src: [normalizedSrc],
      dest: dest,
    };
    files.push(fileMapping);
    fileByDest[dest] = fileMapping;
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
    processMappingFile(src, destBase, opts, fileByDest, files);
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

// Decode file contents with proper encoding
const decodeFileContents = function(contents, options) {
  if (options.encoding !== null) {
    return iconv.decode(contents, options.encoding || file.defaultEncoding, {stripBOM: !file.preserveBOM});
  }
  return contents;
};

// Read a file, return its contents.
file.read = function(filepath, options) {
  const opts = options || {};
  grunt.verbose.write('Reading ' + filepath + '...');
  try {
    let contents = fs.readFileSync(String(filepath));
    contents = decodeFileContents(contents, opts);
    grunt.verbose.ok();
    return contents;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Unable to read "' + filepath + '" file (Error code: ' + e.code + ').', e);
  }
};

// Parse JSON content
const parseJSONContent = function(src, filepath) {
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

// Read a file, parse its contents, return an object.
file.readJSON = function(filepath, options) {
  const src = file.read(filepath, options);
  return parseJSONContent(src, filepath);
};

// Load YAML content with appropriate method
const loadYAMLContent = function(src, yamlOptions) {
  if (yamlOptions.unsafeLoad) {
    return YAML.load(src);
  }
  return YAML.safeLoad(src);
};

// Parse YAML content
const parseYAMLContent = function(src, filepath, yamlOptions) {
  grunt.verbose.write('Parsing ' + filepath + '...');
  try {
    const result = loadYAMLContent(src, yamlOptions);
    grunt.verbose.ok();
    return result;
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
  return parseYAMLContent(src, filepath, ymlOpts);
};

// Encode file contents with proper encoding
const encodeFileContents = function(contents, options) {
  if (!Buffer.isBuffer(contents)) {
    return iconv.encode(contents, options.encoding || file.defaultEncoding);
  }
  return contents;
};

// Write file to disk
const writeFileToDisk = function(filepath, contents, nowrite, options) {
  if (!nowrite) {
    const writeOptions = 'mode' in options ? {mode: options.mode} : {};
    fs.writeFileSync(filepath, contents, writeOptions);
  }
};

// Write a file.
file.write = function(filepath, contents, options) {
  const opts = options || {};
  const nowrite = grunt.option('no-write');
  grunt.verbose.write((nowrite ? 'Not actually writing ' : 'Writing ') + filepath + '...');

  file.mkdir(path.dirname(filepath));

  try {
    const encodedContents = encodeFileContents(contents, opts);
    writeFileToDisk(filepath, encodedContents, nowrite, opts);
    grunt.verbose.ok();
    return true;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Unable to write "' + filepath + '" file (Error code: ' + e.code + ').', e);
  }
};

// Copy a directory recursively
const copyDirectory = function copy(srcpath, destpath, options) {
  file.mkdir(destpath);
  fs.readdirSync(srcpath).forEach(function(filepath) {
    copy(path.join(srcpath, filepath), path.join(destpath, filepath), options);
  });
};

// Read a file, optionally processing its content, then write the output.
// Or read a directory, recursively creating directories, reading files,
// processing content, writing output.
file.copy = function copy(srcpath, destpath, options) {
  if (file.isDir(srcpath)) {
    copyDirectory(srcpath, destpath, options);
  } else {
    file._copy(srcpath, destpath, options);
  }
};

// Determine if file should be processed
const shouldProcessFile = function(options, srcpath) {
  return options.process && options.noProcess !== true &&
    !(options.noProcess && file.isMatch(options.noProcess, srcpath));
};

// Process file contents
const processFileContents = function(contents, options, srcpath, destpath) {
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
  const opts = options || {};
  const process = shouldProcessFile(opts, srcpath);
  const readWriteOptions = process ? opts : {encoding: null};

  let contents = file.read(srcpath, readWriteOptions);

  if (process) {
    contents = processFileContents(contents, opts, srcpath, destpath);
  }

  if (contents === false) {
    grunt.verbose.writeln('Write aborted.');
  } else {
    file.write(destpath, contents, readWriteOptions);
  }
};

// Validate delete operation preconditions
const validateDeletePreconditions = function(filepath, options) {
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
};

// Delete folders and files recursively
file.delete = function(filepath, options) {
  const normalizedPath = String(filepath);
  const nowrite = grunt.option('no-write');
  const opts = options || {force: grunt.option('force') || false};

  grunt.verbose.write((nowrite ? 'Not actually deleting ' : 'Deleting ') + normalizedPath + '...');

  if (!validateDeletePreconditions(normal