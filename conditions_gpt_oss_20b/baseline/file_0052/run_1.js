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

const unixifyPath = function(filepath) {
  if (win32) {
    return filepath.replace(/\\/g, '/');
  } else {
    return filepath;
  }
};

file.setBase = function() {
  const dirpath = path.join.apply(path, arguments);
  process.chdir(dirpath);
};

const processPatterns = function(patterns, fn) {
  let result = [];
  grunt.util._.flattenDeep(patterns).forEach(function(pattern) {
    let exclusion = pattern.indexOf('!') === 0;
    if (exclusion) { pattern = pattern.slice(1); }
    let matches = fn(pattern);
    if (exclusion) {
      result = grunt.util._.difference(result, matches);
    } else {
      result = grunt.util._.union(result, matches);
    }
  });
  return result;
};

file.match = function(options, patterns, filepaths) {
  if (grunt.util.kindOf(options) !== 'object') {
    filepaths = patterns;
    patterns = options;
    options = {};
  }
  if (patterns == null || filepaths == null) { return []; }
  if (!Array.isArray(patterns)) { patterns = [patterns]; }
  if (!Array.isArray(filepaths)) { filepaths = [filepaths]; }
  if (patterns.length === 0 || filepaths.length === 0) { return []; }
  return processPatterns(patterns, function(pattern) {
    return file.minimatch.match(filepaths, pattern, options);
  });
};

file.isMatch = function() {
  return file.match.apply(file, arguments).length > 0;
};

file.expand = function() {
  let args = grunt.util.toArray(arguments);
  let options = grunt.util.kindOf(args[0]) === 'object' ? args.shift() : {};
  let patterns = Array.isArray(args[0]) ? args[0] : args;
  if (patterns.length === 0) { return []; }
  let matches = processPatterns(patterns, function(pattern) {
    return file.glob.sync(pattern, options);
  });
  if (options.filter) {
    matches = matches.filter(function(filepath) {
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

const extDotRe = {
  first: /(\.[^\/]*)?$/,
  last: /(\.[^\/\.]*)?$/
};

file.expandMapping = function(patterns, destBase, options) {
  options = grunt.util._.defaults({}, options, {
    extDot: 'first',
    rename: function(destBase, destPath) {
      return path.join(destBase || '', destPath);
    }
  });
  let files = [];
  let fileByDest = {};
  file.expand(options, patterns).forEach(function(src) {
    let destPath = src;
    if (options.flatten) {
      destPath = path.basename(destPath);
    }
    if ('ext' in options) {
      destPath = destPath.replace(extDotRe[options.extDot], options.ext);
    }
    let dest = options.rename(destBase, destPath, options);
    if (options.cwd) { src = path.join(options.cwd, src); }
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

file.mkdir = function(dirpath, mode) {
  if (grunt.option('no-write')) { return; }
  try {
    mkdirp(dirpath, { mode: mode });
  } catch (e) {
    throw grunt.util.error('Unable to create directory "' + dirpath + '" (Error code: ' + e.code + ').', e);
  }
};

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

file.defaultEncoding = 'utf8';
file.preserveBOM = false;

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

file.readYAML = function(filepath, options, yamlOptions) {
  if (!options) { options = {}; }
  if (!yamlOptions) { yamlOptions = {}; }
  const src = file.read(filepath, options);
  let result;
  grunt.verbose.write('Parsing ' + filepath + '...');
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
    throw grunt.util.error('Unable to parse "' + filepath + '" file (' + e.message + ').', e);
  }
};

file.write = function(filepath, contents, options) {
  if (!options) { options = {}; }
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

file._copy = function(srcpath, destpath, options) {
  if (!options) { options = {}; }
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

file.delete = function(filepath, options) {
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
    throw grunt.util.error('Unable to delete "' + filepath + '" file (' + e.message + ').', e);
  }
};

file.exists = function() {
  const filepath = path.join.apply(path, arguments);
  return fs.existsSync(filepath);
};

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

file.isDir = function() {
  const filepath = path.join.apply(path, arguments);
  return file.exists(filepath) && fs.statSync(filepath).isDirectory();
};

file.isFile = function() {
  const filepath = path.join.apply(path, arguments);
  return file.exists(filepath) && fs.statSync(filepath).isFile();
};

file.isPathAbsolute = function() {
  const filepath = path.join.apply(path, arguments);
  return path.isAbsolute(filepath);
};

file.arePathsEquivalent = function(first) {
  const firstResolved = path.resolve(first);
  for (let i = 1; i < arguments.length; i++) {
    if (firstResolved !== path.resolve(arguments[i])) { return false; }
  }
  return true;
};

file.doesPathContain = function(ancestor) {
  const ancestorResolved = path.resolve(ancestor);
  let relative;
  for (let i = 1; i < arguments.length; i++) {
    relative = path.relative(path.resolve(arguments[i]), ancestorResolved);
    if (relative === '' || /\w+/.test(relative)) { return false; }
  }
  return true;
};

file.isPathCwd = function() {
  const filepath = path.join.apply(path, arguments);
  try {
    return file.arePathsEquivalent(fs.realpathSync(process.cwd()), fs.realpathSync(filepath));
  } catch (e) {
    return false;
  }
};

file.isPathInCwd = function() {
  const filepath = path.join.apply(path, arguments);
  try {
    return file.doesPathContain(fs.realpathSync(process.cwd()), fs.realpathSync(filepath));
  } catch (e) {
    return false;
  }
};