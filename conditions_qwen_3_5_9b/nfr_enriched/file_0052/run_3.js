```javascript
'use strict';

var grunt = require('../grunt');

// Nodejs libs.
var fs = require('fs');
var path = require('path');

// The module to be exported.
var file = module.exports = {};

// External libs.
file.glob = require('glob');
file.minimatch = require('minimatch');
file.findup = require('findup-sync');
var YAML = require('js-yaml');
var rimraf = require('rimraf');
var iconv = require('iconv-lite');
var mkdirp = require('mkdirp').sync;

// Windows?
var win32 = process.platform === 'win32';

// Normalize \\ paths to / paths.
const unixifyPath = (filepath) => {
  if (win32) {
    return filepath.replace(/\\/g, '/');
  }
  return filepath;
};

// Change the current base path (ie, CWD) to the specified path.
file.setBase = (dirpath) => {
  process.chdir(path.join.apply(path, arguments));
};

// Process specified wildcard glob patterns or filenames against a
// callback, excluding and uniquing files in the result set.
const processPatterns = (patterns, fn) => {
  const result = [];
  grunt.util._.flattenDeep(patterns).forEach((pattern) => {
    const exclusion = pattern.indexOf('!') === 0;
    if (exclusion) {
      pattern = pattern.slice(1);
      result = grunt.util._.difference(result, fn(pattern));
    } else {
      result = grunt.util._.union(result, fn(pattern));
    }
  });
  return result;
};

// Match a filepath or filepaths against one or more wildcard patterns. Returns
// all matching filepaths.
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
file.isMatch = () => {
  return file.match.apply(file, arguments).length > 0;
};

// Return an array of all file paths that match the given wildcard patterns.
file.expand = (options, patterns) => {
  if (!Array.isArray(patterns)) {
    patterns = [patterns];
  }
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
        }
        return fs.statSync(filepath)[options.filter]();
      } catch (e) {
        return false;
      }
    });
  }
  return matches;
};

// Build a multi task "files" object dynamically.
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
file.mkdir = (dirpath, mode) => {
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
file.read = (filepath, options) => {
  if (!options) {
    options = {};
  }
  grunt.verbose.write('Reading ' + filepath + '...');
  try {
    const contents = fs.readFileSync(String(filepath));
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
file.readJSON = (filepath, options) => {
  const src = file.read(filepath, options);
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

// Read a YAML file, parse its contents, return an object.
file.readYAML = (filepath, options, yamlOptions) => {
  if (!options) {
    options = {};
  }
  if (!yamlOptions) {
    yamlOptions = {};
  }
  const src = file.read(filepath, options);
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

// Write a file.
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
      fs.writeFileSync(filepath, contents, 'mode' in options ? {mode: options.mode} : {});
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
file._copy = (srcpath, destpath, options) => {
  if (!options) {
    options = {};
  }
  const process = options.process && options.noProcess !== true &&
    !(options.noProcess && file.isMatch(options.noProcess, srcpath));
  const readWriteOptions = process ? options : {encoding: null};
  const contents = file.read(srcpath, readWriteOptions);
  if (process) {
    grunt.verbose.write('Processing source...');
    try {
      contents = options.process(contents, srcpath, destpath);
      grunt.verbose.ok();
    } catch (e) {
      grunt.verbose.error();
      throw grunt.util.error('Error while processing "' + srcpath + '" file.', e);
    }
  }
  if (contents === false) {
    grunt.verbose.writeln('Write aborted.');
  } else {
    file.write(destpath, contents, readWriteOptions);
  }
};

// Delete folders and files recursively
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
  try {
    if (!nowrite) {
      rimraf.sync(filepath);
    }
    grunt.verbose.ok();
    return true;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Unable to delete "' + filepath + '" file (' + e.message + ').', e);
  }
};

// True if the file path exists.
file.exists = () => {
  const filepath = path.join.apply(path, arguments);
  return fs.existsSync(filepath);
};

// True if the file is a symbolic link.
file.isLink = () => {
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
file.isDir = () => {
  const filepath = path.join.apply(path, arguments);
  return file.exists(filepath) && fs.statSync(filepath).isDirectory();
};

// True if the path is a file.
file.isFile = () => {
  const filepath = path.join.apply(path, arguments);
  return file.exists(filepath) && fs.statSync(filepath).isFile();
};

// Is a given file path absolute?
file.isPathAbsolute = () => {
  const filepath = path.join.apply(path, arguments);
  return path.isAbsolute(filepath);
};

// Do all the specified paths refer to the same path?
file.arePathsEquivalent = (first) => {
  first = path.resolve(first);
  for (let i = 1; i < arguments.length; i++) {
    if (first !== path.resolve(arguments[i])) {
      return false;
    }
  }
  return true;
};

// Are descendant path(s) contained within ancestor path? Note: does not test
// if paths actually exist.
file.doesPathContain = (ancestor) => {
  ancestor = path.resolve(ancestor);
  for (let i = 1; i < arguments.length; i++) {
    const relative = path.relative(path.resolve(arguments[i]), ancestor);
    if (relative === '' || /\w+/.test(relative)) {
      return false;
    }
  }
  return true;
};

// Test to see if a filepath is the CWD.
file.isPathCwd = () => {
  const filepath = path.join.apply(path, arguments);
  try {
    return file.arePathsEquivalent(fs.realpathSync(process.cwd()), fs.realpathSync(filepath));
  } catch (e) {
    return false;
  }
};

// Test to see if a filepath is contained within the CWD.
file.isPathInCwd = () => {
  const filepath = path.join.apply(path, arguments);
  try {
    return file.doesPathContain(fs.realpathSync(process.cwd()), fs.realpathSync(filepath));
  } catch (e) {
    return false;
  }
};
```