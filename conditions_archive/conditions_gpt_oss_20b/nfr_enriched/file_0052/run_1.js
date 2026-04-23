'use strict';

const grunt = require('../grunt');
const fs = require('fs');
const path = require('path');
const file = module.exports = {};

const glob = require('glob');
const minimatch = require('minimatch');
const findup = require('findup-sync');
const YAML = require('js-yaml');
const rimraf = require('rimraf');
const iconv = require('iconv-lite');
const mkdirp = require('mkdirp').sync;

const win32 = process.platform === 'win32';
const unixifyPath = (filepath) => win32 ? filepath.replace(/\\/g, '/') : filepath;

file.setBase = function (...args) {
  const dirpath = path.join(...args);
  process.chdir(dirpath);
};

const processPatterns = (patterns, fn) => {
  const result = [];
  grunt.util._.flattenDeep(patterns).forEach((pattern) => {
    const exclusion = pattern.startsWith('!');
    if (exclusion) pattern = pattern.slice(1);
    const matches = fn(pattern);
    if (exclusion) {
      result.splice(0, result.length, ...grunt.util._.difference(result, matches));
    } else {
      result.splice(0, result.length, ...grunt.util._.union(result, matches));
    }
  });
  return result;
};

file.match = function (options, patterns, filepaths) {
  if (grunt.util.kindOf(options) !== 'object') {
    filepaths = patterns;
    patterns = options;
    options = {};
  }
  if (!patterns || !filepaths) return [];
  if (!Array.isArray(patterns)) patterns = [patterns];
  if (!Array.isArray(filepaths)) filepaths = [filepaths];
  if (patterns.length === 0 || filepaths.length === 0) return [];
  return processPatterns(patterns, (pattern) => minimatch.match(filepaths, pattern, options));
};

file.isMatch = function () {
  return file.match.apply(file, arguments).length > 0;
};

file.expand = function () {
  const args = grunt.util.toArray(arguments);
  const options = grunt.util.kindOf(args[0]) === 'object' ? args.shift() : {};
  const patterns = Array.isArray(args[0]) ? args[0] : args;
  if (patterns.length === 0) return [];
  const matches = processPatterns(patterns, (pattern) => glob.sync(pattern, options));
  if (options.filter) {
    return matches.filter((filepath) => {
      const fullPath = path.join(options.cwd || '', filepath);
      try {
        if (typeof options.filter === 'function') {
          return options.filter(fullPath);
        }
        return fs.statSync(fullPath)[options.filter]();
      } catch (_) {
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

file.expandMapping = function (patterns, destBase, options) {
  options = grunt.util._.defaults({}, options, {
    extDot: 'first',
    rename: (destBase, destPath) => path.join(destBase || '', destPath)
  });
  const files = [];
  const fileByDest = {};

  const addMapping = (src, dest) => {
    if (fileByDest[dest]) {
      fileByDest[dest].src.push(src);
    } else {
      const mapping = { src: [src], dest };
      files.push(mapping);
      fileByDest[dest] = mapping;
    }
  };

  const processSrc = (src) => {
    let destPath = src;
    if (options.flatten) destPath = path.basename(destPath);
    if ('ext' in options) {
      destPath = destPath.replace(extDotRe[options.extDot], options.ext);
    }
    const dest = options.rename(destBase, destPath, options);
    if (options.cwd) src = path.join(options.cwd, src);
    const normalizedDest = dest.replace(pathSeparatorRe, '/');
    const normalizedSrc = src.replace(pathSeparatorRe, '/');
    addMapping(normalizedSrc, normalizedDest);
  };

  file.expand(options, patterns).forEach(processSrc);
  return files;
};

file.mkdir = function (dirpath, mode) {
  if (grunt.option('no-write')) return;
  try {
    mkdirp(dirpath, { mode });
  } catch (e) {
    throw grunt.util.error(`Unable to create directory "${dirpath}" (Error code: ${e.code}).`, e);
  }
};

const recurseDir = (rootdir, callback, subdir = '') => {
  const abspath = subdir ? path.join(rootdir, subdir) : rootdir;
  fs.readdirSync(abspath).forEach((filename) => {
    const filepath = path.join(abspath, filename);
    if (fs.statSync(filepath).isDirectory()) {
      recurseDir(rootdir, callback, unixifyPath(path.join(subdir, filename)));
    } else {
      callback(unixifyPath(filepath), rootdir, subdir, filename);
    }
  });
};

file.recurse = function (rootdir, callback, subdir) {
  recurseDir(rootdir, callback, subdir);
};

file.defaultEncoding = 'utf8';
file.preserveBOM = false;

file.read = function (filepath, options = {}) {
  const { encoding = null } = options;
  grunt.verbose.write(`Reading ${filepath}...`);
  try {
    let contents = fs.readFileSync(String(filepath));
    if (encoding !== null) {
      contents = iconv.decode(contents, encoding || file.defaultEncoding, { stripBOM: !file.preserveBOM });
    }
    grunt.verbose.ok();
    return contents;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error(`Unable to read "${filepath}" file (Error code: ${e.code}).`, e);
  }
};

file.readJSON = function (filepath, options) {
  const src = file.read(filepath, options);
  grunt.verbose.write(`Parsing ${filepath}...`);
  try {
    const result = JSON.parse(src);
    grunt.verbose.ok();
    return result;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error(`Unable to parse "${filepath}" file (${e.message}).`, e);
  }
};

file.readYAML = function (filepath, options = {}, yamlOptions = {}) {
  const src = file.read(filepath, options);
  grunt.verbose.write(`Parsing ${filepath}...`);
  try {
    const result = yamlOptions.unsafeLoad ? YAML.load(src) : YAML.safeLoad(src);
    grunt.verbose.ok();
    return result;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error(`Unable to parse "${filepath}" file (${e.message}).`, e);
  }
};

file.write = function (filepath, contents, options = {}) {
  const nowrite = grunt.option('no-write');
  grunt.verbose.write(`${nowrite ? 'Not actually writing ' : 'Writing '}${filepath}...`);
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

const copyFile = (srcpath, destpath, options = {}) => {
  const process = options.process && options.noProcess !== true &&
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

file.copy = function (srcpath, destpath, options = {}) {
  if (file.isDir(srcpath)) {
    file.mkdir(destpath);
    fs.readdirSync(srcpath).forEach((filepath) => {
      const src = path.join(srcpath, filepath);
      const dest = path.join(destpath, filepath);
      file.copy(src, dest, options);
    });
  } else {
    copyFile(srcpath, destpath, options);
  }
};

file.delete = function (filepath, options = {}) {
  filepath = String(filepath);
  const nowrite = grunt.option('no-write');
  if (!options.force) options.force = grunt.option('force') || false;
  grunt.verbose.write(`${nowrite ? 'Not actually deleting ' : 'Deleting '}${filepath}...`);
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
    if (!nowrite) rimraf.sync(filepath);
    grunt.verbose.ok();
    return true;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error(`Unable to delete "${filepath}" file (${e.message}).`, e);
  }
};

file.exists = function (...args) {
  const filepath = path.join(...args);
  return fs.existsSync(filepath);
};

file.isLink = function (...args) {
  const filepath = path.join(...args);
  try {
    return fs.lstatSync(filepath).isSymbolicLink();
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw grunt.util.error(`Unable to read "${filepath}" file (Error code: ${e.code}).`, e);
  }
};

file.isDir = function (...args) {
  const filepath = path.join(...args);
  return file.exists(filepath) && fs.statSync(filepath).isDirectory();
};

file.isFile = function (...args) {
  const filepath = path.join(...args);
  return file.exists(filepath) && fs.statSync(filepath).isFile();
};

file.isPathAbsolute = function (...args) {
  const filepath = path.join(...args);
  return path.isAbsolute(filepath);
};

file.arePathsEquivalent = function (first, ...rest) {
  const firstResolved = path.resolve(first);
  return rest.every((p) => firstResolved === path.resolve(p));
};

file.doesPathContain = function (ancestor, ...rest) {
  const ancestorResolved = path.resolve(ancestor);
  return rest.every((p) => {
    const relative = path.relative(path.resolve(p), ancestorResolved);
    return relative === '' || !/\w+/.test(relative);
  });
};

file.isPathCwd = function (...args) {
  const filepath = path.join(...args);
  try {
    return file.arePathsEquivalent(fs.realpathSync(process.cwd()), fs.realpathSync(filepath));
  } catch (_) {
    return false;
  }
};

file.isPathInCwd = function (...args) {
  const filepath = path.join(...args);
  try {
    return file.doesPathContain(fs.realpathSync(process.cwd()), fs.realpathSync(filepath));
  } catch (_) {
    return false;
  }
};