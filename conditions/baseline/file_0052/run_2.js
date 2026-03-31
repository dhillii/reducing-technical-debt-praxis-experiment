```javascript
'use strict';

const grunt = require('../grunt');
const fs = require('fs');
const path = require('path');
const YAML = require('js-yaml');
const rimraf = require('rimraf');
const iconv = require('iconv-lite');
const mkdirp = require('mkdirp').sync;

const file = module.exports = {};

// External libs
file.glob = require('glob');
file.minimatch = require('minimatch');
file.findup = require('findup-sync');

// Constants
const IS_WIN32 = process.platform === 'win32';
const PATH_SEPARATOR_RE = /[\/\\]/g;
const EXT_DOT_RE = {
  first: /(\.[^\/]*)?$/,
  last: /(\.[^\/\.]*)?$/,
};

// Utility functions
const unixifyPath = (filepath) => {
  return IS_WIN32 ? filepath.replace(/\\/g, '/') : filepath;
};

const joinPaths = (...args) => path.join.apply(path, args);

const processPatterns = (patterns, fn) => {
  const result = [];
  grunt.util._.flattenDeep(patterns).forEach((pattern) => {
    const exclusion = pattern.indexOf('!') === 0;
    const cleanPattern = exclusion ? pattern.slice(1) : pattern;
    const matches = fn(cleanPattern);
    
    if (exclusion) {
      result = grunt.util._.difference(result, matches);
    } else {
      result = grunt.util._.union(result, matches);
    }
  });
  return result;
};

const normalizeArguments = (options, patterns, filepaths) => {
  if (grunt.util.kindOf(options) !== 'object') {
    return { options: {}, patterns: options, filepaths: patterns };
  }
  return { options, patterns, filepaths };
};

const ensureArray = (value) => Array.isArray(value) ? value : [value];

const validatePatterns = (patterns, filepaths) => {
  return patterns != null && filepaths != null && patterns.length > 0 && filepaths.length > 0;
};

const applyFilter = (matches, options) => {
  if (!options.filter) return matches;
  
  return matches.filter((filepath) => {
    const fullPath = path.join(options.cwd || '', filepath);
    try {
      return typeof options.filter === 'function'
        ? options.filter(fullPath)
        : fs.statSync(fullPath)[options.filter]();
    } catch (e) {
      return false;
    }
  });
};

const handleFileError = (action, filepath, error) => {
  throw grunt.util.error(
    `Unable to ${action} "${filepath}" file (Error code: ${error.code}).`,
    error
  );
};

const handleParseError = (filepath, error) => {
  throw grunt.util.error(
    `Unable to parse "${filepath}" file (${error.message}).`,
    error
  );
};

// File operations
file.setBase = function() {
  process.chdir(joinPaths.apply(null, arguments));
};

file.match = function(options, patterns, filepaths) {
  const { options: opts, patterns: pats, filepaths: fps } = normalizeArguments(options, patterns, filepaths);
  
  if (!validatePatterns(ensureArray(pats), ensureArray(fps))) {
    return [];
  }
  
  return processPatterns(pats, (pattern) => {
    return file.minimatch.match(fps, pattern, opts);
  });
};

file.isMatch = function() {
  return file.match.apply(file, arguments).length > 0;
};

file.expand = function() {
  const args = grunt.util.toArray(arguments);
  const options = grunt.util.kindOf(args[0]) === 'object' ? args.shift() : {};
  const patterns = Array.isArray(args[0]) ? args[0] : args;
  
  if (patterns.length === 0) return [];
  
  let matches = processPatterns(patterns, (pattern) => {
    return file.glob.sync(pattern, options);
  });
  
  matches = applyFilter(matches, options);
  return matches;
};

file.expandMapping = function(patterns, destBase, options) {
  options = grunt.util._.defaults({}, options, {
    extDot: 'first',
    rename: (destBase, destPath) => path.join(destBase || '', destPath)
  });
  
  const files = [];
  const fileByDest = {};
  
  file.expand(options, patterns).forEach((src) => {
    let destPath = src;
    
    if (options.flatten) {
      destPath = path.basename(destPath);
    }
    
    if ('ext' in options) {
      destPath = destPath.replace(EXT_DOT_RE[options.extDot], options.ext);
    }
    
    let dest = options.rename(destBase, destPath, options);
    let srcPath = options.cwd ? path.join(options.cwd, src) : src;
    
    dest = dest.replace(PATH_SEPARATOR_RE, '/');
    srcPath = srcPath.replace(PATH_SEPARATOR_RE, '/');
    
    if (fileByDest[dest]) {
      fileByDest[dest].src.push(srcPath);
    } else {
      const fileMapping = { src: [srcPath], dest };
      files.push(fileMapping);
      fileByDest[dest] = fileMapping;
    }
  });
  
  return files;
};

file.mkdir = function(dirpath, mode) {
  if (grunt.option('no-write')) return;
  
  try {
    mkdirp(dirpath, { mode });
  } catch (e) {
    handleFileError('create directory', dirpath, e);
  }
};

file.recurse = function recurse(rootdir, callback, subdir) {
  const abspath = subdir ? path.join(rootdir, subdir) : rootdir;
  
  fs.readdirSync(abspath).forEach((filename) => {
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
  options = options || {};
  grunt.verbose.write(`Reading ${filepath}...`);
  
  try {
    let contents = fs.readFileSync(String(filepath));
    
    if (options.encoding !== null) {
      contents = iconv.decode(
        contents,
        options.encoding || file.defaultEncoding,
        { stripBOM: !file.preserveBOM }
      );
    }
    
    grunt.verbose.ok();
    return contents;
  } catch (e) {
    grunt.verbose.error();
    handleFileError('read', filepath, e);
  }
};

file.readJSON = function(filepath, options) {
  const src = file.read(filepath, options);
  grunt.verbose.write(`Parsing ${filepath}...`);
  
  try {
    const result = JSON.parse(src);
    grunt.verbose.ok();
    return result;
  } catch (e) {
    grunt.verbose.error();
    handleParseError(filepath, e);
  }
};

file.readYAML = function(filepath, options, yamlOptions) {
  options = options || {};
  yamlOptions = yamlOptions || {};
  
  const src = file.read(filepath, options);
  grunt.verbose.write(`Parsing ${filepath}...`);
  
  try {
    const result = yamlOptions.unsafeLoad ? YAML.load(src) : YAML.safeLoad(src);
    grunt.verbose.ok();
    return result;
  } catch (e) {
    grunt.verbose.error();
    handleParseError(filepath, e);
  }
};

file.write = function(filepath, contents, options) {
  options = options || {};
  const nowrite = grunt.option('no-write');
  
  grunt.verbose.write((nowrite ? 'Not actually writing ' : 'Writing ') + filepath + '...');
  file.mkdir(path.dirname(filepath));
  
  try {
    if (!Buffer.isBuffer(contents)) {
      contents = iconv.encode(contents, options.encoding || file.defaultEncoding);
    }
    
    if (!nowrite) {
      const writeOptions = 'mode' in options ? { mode: options.mode } : {};
      fs.writeFileSync(filepath, contents, writeOptions);
    }
    
    grunt.verbose.ok();
    return true;
  } catch (e) {
    grunt.verbose.error();
    handleFileError('write', filepath, e);
  }
};

file.copy = function copy(srcpath, destpath, options) {
  if (file.isDir(srcpath)) {
    file.mkdir(destpath);
    fs.readdirSync(srcpath).forEach((filepath) => {
      copy(path.join(srcpath, filepath), path.join(destpath, filepath), options);
    });
  } else {
    file._copy(srcpath, destpath, options);
  }
};

file._copy = function(srcpath, destpath, options) {
  options = options || {};
  
  const shouldProcess = options.process && options.noProcess !== true &&
    !(options.noProcess && file.isMatch(options.noProcess, srcpath));
  
  const readWriteOptions = shouldProcess ? options : { encoding: null };
  let contents = file.read(srcpath, readWriteOptions);
  
  if (shouldProcess) {
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

file.delete = function(filepath, options) {
  filepath = String(filepath);
  const nowrite = grunt.option('no-write');
  options = options || { force: grunt.option('force') || false };
  
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

// Path checking functions
file.exists = function() {
  return fs.existsSync(joinPaths.apply(null, arguments));
};

file.isLink = function() {
  const filepath = joinPaths.apply(null, arguments);
  try {
    return fs.lstatSync(filepath).isSymbolicLink();
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    handleFileError('read', filepath, e);
  }
};

file.isDir = function() {
  const filepath = joinPaths.apply(null, arguments);
  return file.exists(filepath) && fs.statSync(filepath).isDirectory();
};

file.isFile = function() {
  const filepath = joinPaths.apply(null, arguments);
  return file.exists(filepath) && fs.statSync(filepath).isFile();
};

file.isPathAbsolute = function() {
  return path.isAbsolute(joinPaths.apply(null, arguments));
};

file.arePathsEquivalent = function(first) {
  first = path.resolve(first);
  for (let i = 1; i < arguments.length; i++) {
    if (first !== path.resolve(arguments[i])) return false;
  }
  return true;
};

file.doesPathContain = function(ancestor) {
  ancestor = path.resolve(ancestor);
  for (let i = 1; i < arguments.length; i++) {
    const relative = path.relative(path.resolve(arguments[i]), ancestor);
    if (relative === '' || /\w+/.test(relative)) return false;
  }
  return true;
};

file.isPathCwd = function() {
  const filepath = joinPaths.apply(null, arguments);
  try {
    return file.arePathsEquivalent(
      fs.realpathSync(process.cwd()),
      fs.realpathSync(filepath)
    );
  } catch (e) {
    return false;
  }
};

file.isPathInCwd = function() {
  const filepath = joinPaths.apply(null, arguments);
  try {
    return file.doesPathContain(
      fs.realpathSync(process.cwd()),
      fs.realpathSync(filepath)
    );
  } catch (e) {
    return false;
  }
};
```