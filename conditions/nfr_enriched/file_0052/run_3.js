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

// Platform detection
const isWin32 = process.platform === 'win32';

// Constants
const PATH_SEPARATOR_RE = /[\/\\]/g;
const EXT_DOT_RE = {
  first: /(\.[^\/]*)?$/,
  last: /(\.[^\/\.]*)?$/,
};

// Utility functions
const unixifyPath = (filepath) => {
  return isWin32 ? filepath.replace(/\\/g, '/') : filepath;
};

const normalizeArguments = (options, patterns, filepaths) => {
  if (grunt.util.kindOf(options) !== 'object') {
    return { options: {}, patterns: options, filepaths: patterns };
  }
  return { options, patterns, filepaths };
};

const isValidPatternAndFilepaths = (patterns, filepaths) => {
  return patterns != null && filepaths != null && patterns.length > 0 && filepaths.length > 0;
};

const ensureArray = (value) => {
  return Array.isArray(value) ? value : [value];
};

const processPatterns = (patterns, fn) => {
  const result = [];
  grunt.util._.flattenDeep(patterns).forEach((pattern) => {
    const isExclusion = pattern.indexOf('!') === 0;
    const cleanPattern = isExclusion ? pattern.slice(1) : pattern;
    const matches = fn(cleanPattern);
    
    if (isExclusion) {
      result.splice(0, result.length, ...grunt.util._.difference(result, matches));
    } else {
      result.splice(0, result.length, ...grunt.util._.union(result, matches));
    }
  });
  return result;
};

const applyFileFilter = (matches, options) => {
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

const createFileMappingObject = (src, destPath, options) => {
  let dest = destPath;
  
  if (options.flatten) {
    dest = path.basename(dest);
  }
  
  if ('ext' in options) {
    dest = dest.replace(EXT_DOT_RE[options.extDot], options.ext);
  }
  
  dest = options.rename(options.destBase, dest, options);
  
  if (options.cwd) {
    src = path.join(options.cwd, src);
  }
  
  return {
    src: src.replace(PATH_SEPARATOR_RE, '/'),
    dest: dest.replace(PATH_SEPARATOR_RE, '/'),
  };
};

const handleFileOperation = (operation, filepath, message) => {
  const nowrite = grunt.option('no-write');
  grunt.verbose.write((nowrite ? 'Not actually ' : '') + message + ' ' + filepath + '...');
  
  try {
    if (!nowrite) {
      operation();
    }
    grunt.verbose.ok();
    return true;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error(`Unable to ${message} "${filepath}" file (Error code: ${e.code}).`, e);
  }
};

const parseFile = (filepath, parser, parserName) => {
  const src = file.read(filepath);
  grunt.verbose.write(`Parsing ${filepath}...`);
  
  try {
    const result = parser(src);
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
  
  if (!isValidPatternAndFilepaths(normalizedPatterns, normalizedFilepaths)) {
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
  
  return applyFileFilter(matches, options);
};

file.expandMapping = function(patterns, destBase, options) {
  const opts = grunt.util._.defaults({}, options, {
    extDot: 'first',
    rename: (destBase, destPath) => path.join(destBase || '', destPath),
    destBase,
  });
  
  const files = [];
  const fileByDest = {};
  
  file.expand(opts, patterns).forEach((src) => {
    const mapping = createFileMappingObject(src, src, opts);
    
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
  options = options || {};
  
  grunt.verbose.write(`Reading ${filepath}...`);
  
  try {
    let contents = fs.readFileSync(String(filepath));
    
    if (options.encoding !== null) {
      contents = iconv.decode(contents, options.encoding || file.defaultEncoding, {
        stripBOM: !file.preserveBOM,
      });
    }
    
    grunt.verbose.ok();
    return contents;
  } catch (e) {
    grunt.verbose.error();
    throw grunt.util.error(`Unable to read "${filepath}" file (Error code: ${e.code}).`, e);
  }
};

file.readJSON = function(filepath, options) {
  return parseFile(filepath, (src) => JSON.parse(src), 'JSON');
};

file.readYAML = function(filepath, options, yamlOptions) {
  options = options || {};
  yamlOptions = yamlOptions || {};
  
  const src = file.read(filepath, options);
  
  return parseFile(filepath, (src) => {
    return yamlOptions.unsafeLoad ? YAML.load(src) : YAML.safeLoad(src);
  }, 'YAML');
};

file.write = function(filepath, contents, options) {
  options = options || {};
  const nowrite = grunt.option('no-write');
  
  return handleFileOperation(() => {
    file.mkdir(path.dirname(filepath));
    
    const buffer = Buffer.isBuffer(contents)
      ? contents
      : iconv.encode(contents, options.encoding || file.defaultEncoding);
    
    const writeOptions = 'mode' in options ? { mode: options.mode } : {};
    fs.writeFileSync(filepath, buffer, writeOptions);
  }, filepath, 'writing');
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
  options = options || { force: grunt.option('force') || false };
  
  const nowrite = grunt.option('no-write');
  
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
  
  return handleFileOperation(() => {
    rimraf.sync(filepath);
  }, filepath, 'deleting');
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