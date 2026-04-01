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

// Apply exclusion or union operation on result set
const applyPatternOperation = function(result, matches, isExclusion) {
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
    result = applyPatternOperation(result, matches, exclusion);
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
const normalizePatternArguments = function(patterns, filepaths) {
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

  const normalized = normalizePatternArguments(pats, fps);
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
  const options = grunt.util.kindOf(args[0]) === 'object' ? args.shift() : {};
  const patterns = Array.isArray(args[0]) ? args[0] : args;

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

// Process destination path with flatten and extension options
const processDestinationPath = function(srcPath, options) {
  let destPath = srcPath;

  if (options.flatten) {
    destPath = path.basename(destPath);
  }

  if ('ext' in options) {
    destPath = destPath.replace(extDotRe[options.extDot], options.ext);
  }

  return destPath;
};

// Create or update file mapping entry
const createOrUpdateFileMapping = function(files, fileByDest, src, dest) {
  if (fileByDest[dest]) {
    fileByDest[dest].src.push(src);
  } else {
    const fileEntry = {
      src: [src],
      dest: dest,
    };
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
    let destPath = processDestinationPath(src, opts);
    let srcPath = src;

    const dest = opts.rename(destBase, destPath, opts);

    if (opts.cwd) {
      srcPath = path.join(opts.cwd, srcPath);
    }

    const normalizedDest = dest.replace(pathSeparatorRe, '/');
    const normalizedSrc = srcPath.replace(pathSeparatorRe, '/');

    createOrUpdateFileMapping(files, fileByDest, normalizedSrc, normalizedDest);
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
const decodeFileContents = function(buffer, options) {
  if (options.encoding !== null) {
    return iconv.decode(buffer, options.encoding || file.defaultEncoding, {stripBOM: !file.preserveBOM});
  }
  return buffer;
};

// Read a file, return its contents.
file.read = function(filepath, options) {
  const opts = options || {};
  grunt.verbose.write('Reading ' + filepath + '...');
  try {
    const contents = fs.readFileSync(String(filepath));
    const decodedContents = decodeFileContents(contents, opts);
    grunt.verbose.ok();
    return decodedContents;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Unable to read "' + filepath + '" file (Error code: ' + e.code + ').', e);
  }
};

// Parse JSON file contents
const parseJSONContents = function(src, filepath) {
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
  return parseJSONContents(src, filepath);
};

// Parse YAML file contents
const parseYAMLContents = function(src, filepath, yamlOptions) {
  grunt.verbose.write('Parsing ' + filepath + '...');
  try {
    const result = yamlOptions.unsafeLoad ? YAML.load(src) : YAML.safeLoad(src);
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
  return parseYAMLContents(src, filepath, ymlOpts);
};

// Encode file contents with proper encoding handling
const encodeFileContents = function(contents, options) {
  if (!Buffer.isBuffer(contents)) {
    return iconv.encode(contents, options.encoding || file.defaultEncoding);
  }
  return contents;
};

// Get write options based on provided options
const getWriteOptions = function(options) {
  if ('mode' in options) {
    return { mode: options.mode };
  }
  return {};
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
      fs.writeFileSync(filepath, encodedContents, getWriteOptions(opts));
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
const shouldProcessFile = function(options, srcpath) {
  return options.process && options.noProcess !== true &&
    !(options.noProcess && file.isMatch(options.noProcess, srcpath));
};

// Process file contents if needed
const processFileContents = function(contents, options, srcpath, destpath) {
  if (!options.process) {
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
  const opts = options || {};
  const process = shouldProcessFile(opts, srcpath);
  const readWriteOptions = process ? opts : {encoding: null};

  let contents = file.read(srcpath, readWriteOptions);
  contents = processFileContents(contents, opts, srcpath, destpath);

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

  if (!validateDeletePreconditions(normalizedPath, opts)) {
    return false;
  }

  try {
    if (!nowrite) {
      rimraf.sync(normalizedPath);
    }
    grunt.verbose.ok();
    return true;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Unable to delete "' + normalizedPath + '" file (' + e.message + ').', e);
  }
};

// True if the file path exists.
file.exists = function() {
  const filepath = path.join.apply(path, arguments);
  return fs.existsSync(filepath);
};