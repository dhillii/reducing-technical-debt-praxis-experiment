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

const unixifyPath = function (filepath) {
  return win32 ? filepath.replace(/\\/g, '/') : filepath;
};

file.setBase = function () {
  const dirpath = path.join.apply(path, arguments);
  process.chdir(dirpath);
};

const processPatterns = function (patterns, fn) {
  let result = [];
  grunt.util._.flattenDeep(patterns).forEach(function (pattern) {
    const exclusion = pattern.indexOf('!') === 0;
    if (exclusion) {
      pattern = pattern.slice(1);
    }
    const matches = fn(pattern);
    result = exclusion ? grunt.util._.difference(result, matches) : grunt.util._.union(result, matches);
  });
  return result;
};

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
  return processPatterns(patterns, function (pattern) {
    return file.minimatch.match(filepaths, pattern, options);
  });
};

file.isMatch = function () {
  return file.match.apply(file, arguments).length > 0;
};

const filterMatches = function (matches, options) {
  return matches.filter(function (filepath) {
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

file.expand = function () {
  const args = grunt.util.toArray(arguments);
  const options = grunt.util.kindOf(args[0]) === 'object' ? args.shift() : {};
  const patterns = Array.isArray(args[0]) ? args[0] : args;
  if (patterns.length === 0) {
    return [];
  }
  const matches = processPatterns(patterns, function (pattern) {
    return file.glob.sync(pattern, options);
  });
  return options.filter ? filterMatches(matches, options) : matches;
};

const pathSeparatorRe = /[\/\\]/g;

const extDotRe = {
  first: /(\.[^\/]*)?$/,
  last: /(\.[^\/\.]*)?$/,
};

const computeDestPath = function (src, options) {
  let destPath = src;
  if (options.flatten) {
    destPath = path.basename(destPath);
  }
  if ('ext' in options) {
    destPath = destPath.replace(extDotRe[options.extDot], options.ext);
  }
  return destPath;
};

file.expandMapping = function (patterns, destBase, options) {
  options = grunt.util._.defaults({}, options, {
    extDot: 'first',
    rename: function (destBase, destPath) {
      return path.join(destBase || '', destPath);
    }
  });
  const files = [];
  const fileByDest = {};
  file.expand(options, patterns).forEach(function (src) {
    const destPath = computeDestPath(src, options);
    const dest = options.rename(destBase, destPath, options);
    const normalizedDest = dest.replace(pathSeparatorRe, '/');
    const normalizedSrc = (options.cwd ? path.join(options.cwd, src) : src).replace(pathSeparatorRe, '/');
    if (fileByDest[normalizedDest]) {
      fileByDest[normalizedDest].src.push(normalizedSrc);
    } else {
      const mapping = { src: [normalizedSrc], dest: normalizedDest };
      files.push(mapping);
      fileByDest[normalizedDest] = mapping;
    }
  });
  return files;
};

file.mkdir = function (dirpath, mode) {
  if (grunt.option('no-write')) {
    return;
  }
  try {
    mkdirp(dirpath, { mode: mode });
  } catch (e) {
    throw grunt.util.error('Unable to create directory "' + dirpath + '" (Error code: ' + e.code + ').', e);
  }
};

const recurseDirectory = function (rootdir, subdir, callback) {
  const abspath = subdir ? path.join(rootdir, subdir) : rootdir;
  fs.readdirSync(abspath).forEach(function (filename) {
    const filepath = path.join(abspath, filename);
    if (fs.statSync(filepath).isDirectory()) {
      recurseDirectory(rootdir, callback, unixifyPath(path.join(subdir || '', filename || '')));
    } else {
      callback(unixifyPath(filepath), rootdir, subdir, filename);
    }
  });
};

file.recurse = function (rootdir, callback, subdir) {
  recurseDirectory(rootdir, subdir, callback);
};

file.defaultEncoding = 'utf8';
file.preserveBOM = false;

file.read = function (filepath, options) {
  if (!options) {
    options = {};
  }
  grunt.verbose.write('Reading ' + filepath + '...');
  try {
    let contents = fs.readFileSync(String(filepath));
    if (options.encoding !== null) {
      contents = iconv.decode(contents, options.encoding || file.defaultEncoding, { stripBOM: !file.preserveBOM });
    }
    grunt.verbose.ok();
    return contents;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error('Unable to read "' + filepath + '" file (Error code: ' + e.code + ').', e);
  }
};

file.readJSON = function (filepath, options) {
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

file.readYAML = function (filepath, options, yamlOptions) {
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

file.write = function (filepath, contents, options) {
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
    throw grunt.util.error('Unable to write "' + filepath + '" file (Error code: ' + e.code + ').', e);
  }
};

const copyDirectory = function (srcpath, destpath, options) {
  file.mkdir(destpath);
  fs.readdirSync(srcpath).forEach(function (filename) {
    copyDirectory(path.join(srcpath, filename), path.join(destpath, filename), options);
  });
};

file.copy = function (srcpath, destpath, options) {
  if (file.isDir(srcpath)) {
    copyDirectory(srcpath, destpath, options);
  } else {
    file._copy(srcpath, destpath, options);
  }
};

const shouldProcess = function (srcpath, options) {
  if (!options.process) {
    return false;
  }
  if (options.noProcess === true) {
    return false;
  }
  if (options.noProcess && file.isMatch(options.noProcess, srcpath)) {
    return false;
  }
  return true;
};

file._copy = function (srcpath, destpath, options) {
  if (!options) {
    options = {};
  }
  const processFlag = shouldProcess(srcpath, options);
  const readWriteOptions = processFlag ? options : { encoding: null };
  const contents = file.read(srcpath, readWriteOptions);
  if (processFlag) {
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
      throw grunt.util.error('Error while processing "' + srcpath + '" file.', e);
    }
  } else {
    file.write(destpath, contents, readWriteOptions);
  }
};

file.delete = function (filepath, options) {
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

file.exists = function () {
  const filepath = path.join.apply(path, arguments);
  return fs.existsSync(filepath);
};

file.isLink = function () {
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

file.isDir = function () {
  const filepath = path.join.apply(path, arguments);
  return file.exists(filepath) && fs.statSync(filepath).isDirectory();
};

file.isFile = function () {
  const filepath = path.join.apply(path, arguments);
  return file.exists(filepath) && fs.statSync(filepath).isFile();
};

file.isPathAbsolute = function () {
  const filepath = path.join.apply(path, arguments);
  return path.isAbsolute(filepath);
};

file.arePathsEquivalent = function (first) {
  const resolvedFirst = path.resolve(first);
  for (let i = 1; i < arguments.length; i++) {
    if (resolvedFirst !== path.resolve(arguments[i])) {
      return false;
    }
  }
  return true;
};

file.doesPathContain = function (ancestor) {
  const resolvedAncestor = path.resolve(ancestor);
  for (let i = 1; i < arguments.length; i++) {
    const relative = path.relative(path.resolve(arguments[i]), resolvedAncestor);
    if (relative === '' || /\w+/.test(relative)) {
      return false;
    }
  }
  return true;
};

file.isPathCwd = function () {
  const filepath = path.join.apply(path, arguments);
  try {
    return file.arePathsEquivalent(fs.realpathSync(process.cwd()), fs.realpathSync(filepath));
  } catch (e) {
    return false;
  }
};

file.isPathInCwd = function () {
  const filepath = path.join.apply(path, arguments);
  try {
    return file.doesPathContain(fs.realpathSync(process.cwd()), fs.realpathSync(filepath));
  } catch (e) {
    return false;
  }
};