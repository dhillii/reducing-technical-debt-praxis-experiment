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
const WIN32 = process.platform === 'win32';
const PATH_SEPARATOR_RE = /[\/\\]/g;
const EXT_DOT_RE = {
  first: /(\.[^\/]*)?$/,
  last: /(\.[^\/\.]*)?$/,
};

// Utility functions
const unixifyPath = (filepath) => {
  return WIN32 ? filepath.replace(/\\/g, '/') : filepath;
};

const processPatterns = (patterns, fn) => {
  const result = [];
  grunt.util._.flattenDeep(patterns).forEach((pattern) => {
    const exclusion = pattern.indexOf('!') === 0;
    const cleanPattern = exclusion ? pattern.slice(1) : pattern;
    const matches = fn(cleanPattern);
    
    if (exclusion) {
      return result.splice(0, result.length, ...grunt.util._.difference(result, matches));
    }
    result.push(...grunt.util._.union([], matches));
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

const isValidInput = (patterns, filepaths) => {
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

const createFileMapping = (src, destBase, options) => {
  let destPath = src;
  
  if (options.flatten) {
    destPath = path.basename(destPath);
  }
  
  if ('ext' in options) {
    destPath = destPath.replace(EXT_DOT_RE[options.extDot], options.ext);
  }
  
  const dest = options.rename(destBase, destPath, options);
  const finalSrc = options.cwd ? path.join(options.cwd, src) : src;
  
  return {
    src: finalSrc.replace(PATH_SEPARATOR_RE, '/'),
    dest: dest.replace(PATH_SEPARATOR_RE, '/'),
  };
};

const handleFileWrite = (filepath, contents, options, nowrite) => {
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
    throw grunt.util.error(`Unable to write "${filepath}" file (Error code: ${e.code}).`, e);
  }
};

const validatePathForDeletion = (filepath, options) => {
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

const readFileWithEncoding = (filepath, options = {}) => {
  grunt.verbose.write(`Reading ${filepath}...`);
  try {
    let contents = fs.readFileSync(String(filepath));
    
    if (options.encoding !== null) {
      contents = iconv.decode(contents, options.encoding || file.defaultEncoding, {
        stripBOM: !file.preserveBOM
      });
    }
    
    grunt.verbose.ok();
    return contents;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error(`Unable to read "${filepath}" file (Error code: ${e.code}).`, e);
  }
};

const parseFile = (filepath, parser, parserName) => {
  grunt.verbose.write(`Parsing ${filepath}...`);
  try {
    const result = parser();
    grunt.verbose.ok();
    return result;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error(`Unable to parse "${filepath}" file (${e.message}).`, e);
  }
};

// Public API
file.setBase = function() {
  const dirpath = path.join.apply(path, arguments);
  process.chdir(dirpath);
};

file.match = function(options, patterns, filepaths) {
  const { options: opts, patterns: pats, filepaths: fps } = normalizeArguments(options, patterns, filepaths);
  
  const normalizedPatterns = ensureArray(pats);
  const normalizedFilepaths = ensureArray(fps);
  
  if (!isValidInput(normalizedPatterns, normalizedFilepaths)) {
    return [];
  }
  
  return processPatterns(normalizedPatterns, (pattern) => {
    return file.minimatch.match(normalizedFilepaths, pattern, opts);
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
  
  const matches = processPatterns(patterns, (pattern) => {
    return file.glob.sync(pattern, options);
  });
  
  return applyFilter(matches, options);
};

file.expandMapping = function(patterns, destBase, options) {
  const opts = grunt.util._.defaults({}, options, {
    extDot: 'first',
    rename: (destBase, destPath) => path.join(destBase || '', destPath)
  });
  
  const files = [];
  const fileByDest = {};
  
  file.expand(opts, patterns).forEach((src) => {
    const mapping = createFileMapping(src, destBase, opts);
    
    if (fileByDest[mapping.dest]) {
      fileByDest[mapping.dest].src.push(mapping.src);
    } else {
      const fileObj = { src: [mapping.src], dest: mapping.dest };
      files.push(fileObj);
      fileByDest[mapping.dest] = fileObj;
    }
  });
  
  return files;
};

file.mkdir = function(dirpath, mode) {
  if (grunt.option('no-write')) return;
  
  try {
    mkdirp(dirpath, { mode });
  } catch (e) {
    throw grunt.util.error(`Unable to create directory "${dirpath}" (Error code: ${e.code}).`, e);
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
  return readFileWithEncoding(filepath, options);
};

file.readJSON = function(filepath, options) {
  const src = file.read(filepath, options);
  return parseFile(filepath, () => JSON.parse(src), 'JSON');
};

file.readYAML = function(filepath, options, yamlOptions) {
  const opts = options || {};
  const yOpts = yamlOptions || {};
  const src = file.read(filepath, opts);
  
  return parseFile(filepath, () => {
    return yOpts.unsafeLoad ? YAML.load(src) : YAML.safeLoad(src);
  }, 'YAML');
};

file.write = function(filepath, contents, options) {
  const opts = options || {};
  const nowrite = grunt.option('no-write');
  
  grunt.verbose.write((nowrite ? 'Not actually writing ' : 'Writing ') + filepath + '...');
  file.mkdir(path.dirname(filepath));
  
  return handleFileWrite(filepath, contents, opts, nowrite);
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
  const opts = options || {};
  const process = opts.process && opts.noProcess !== true &&
    !(opts.noProcess && file.isMatch(opts.noProcess, srcpath));
  
  const readWriteOptions = process ? opts : { encoding: null };
  let contents = file.read(srcpath, readWriteOptions);
  
  if (process) {
    grunt.verbose.write('Processing source...');
    try {
      contents = opts.process(contents, srcpath, destpath);
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
  const opts = options || { force: grunt.option('force') || false };
  
  grunt.verbose.write((nowrite ? 'Not actually deleting ' : 'Deleting ') + filepath + '...');
  
  if (!validatePathForDeletion(filepath, opts)) {
    return false;
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

file.exists = function() {
  const filepath = path.join.apply(path, arguments);
  return fs.existsSync(filepath);
};

file.isLink = function() {
  const filepath = path.join.apply(path, arguments);
  try {
    return fs.lstatSync(filepath).isSymbolicLink();
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw grunt.util.error(`Unable to read "${filepath}" file (Error code: ${e.code}).`, e);
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
  const resolvedFirst = path.resolve(first);
  for (let i = 1; i < arguments.length; i++) {
    if (resolvedFirst !== path.resolve(arguments[i])) return false;
  }
  return true;
};

file.doesPathContain = function(ancestor) {
  const resolvedAncestor = path.resolve(ancestor);
  for (let i = 1; i < arguments.length; i++) {
    const relative = path.relative(path.resolve(arguments[i]), resolvedAncestor);
    if (relative === '' || /\w+/.test(relative)) return false;
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
```