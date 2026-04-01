```javascript
/**
 * Copyright 2013-2022 the PM2 project authors. All rights reserved.
 * Use of this source code is governed by a license that
 * can be found in the LICENSE file.
 */

/**
 * Common Utilities ONLY USED IN ->CLI<-
 */

const fs        = require('fs');
const path      = require('path');
const os        = require('os');
const util      = require('util');
const chalk     = require('ansis');
const fclone    = require('fclone');
const semver    = require('semver');
const dayjs     = require('dayjs');
const execSync  = require('child_process').execSync;
const isBinary  = require('./tools/isbinaryfile.js');
const cst       = require('../constants.js');
const extItps   = require('./API/interpreter.json');
const Config    = require('./tools/Config');
const pkg       = require('../package.json');
const which     = require('./tools/which.js');
const Common = module.exports;

function homedir() {
  const env = process.env;
  const home = env.HOME;
  const user = env.LOGNAME || env.USER || env.LNAME || env.USERNAME;

  if (process.platform === 'win32') {
    return env.USERPROFILE || env.HOMEDRIVE + env.HOMEPATH || home || null;
  }

  if (process.platform === 'darwin') {
    return home || (user ? '/Users/' + user : null);
  }

  if (process.platform === 'linux') {
    return home || (process.getuid() === 0 ? '/root' : (user ? '/home/' + user : null));
  }

  return home || null;
}

function resolveHome(filepath) {
  if (filepath[0] === '~') {
    return path.join(homedir(), filepath.slice(1));
  }
  return filepath;
}

/**
 * Check if silent mode should be enabled
 * @returns {boolean}
 */
function isSilentModeEnabled() {
  if (process.env.PM2_SILENT) {
    return true;
  }

  const variadicArgsDashesPos = process.argv.indexOf('--');
  const s1opt = process.argv.indexOf('--silent');
  const s2opt = process.argv.indexOf('-s');

  if (variadicArgsDashesPos === -1) {
    return s1opt > -1 || s2opt > -1;
  }

  const s1Valid = s1opt !== -1 && s1opt < variadicArgsDashesPos;
  const s2Valid = s2opt !== -1 && s2opt < variadicArgsDashesPos;

  return s1Valid && s2Valid;
}

Common.determineSilentCLI = function() {
  if (!isSilentModeEnabled()) {
    return;
  }

  for (const key in console) {
    const code = key.charCodeAt(0);
    if (code >= 97 && code <= 122) {
      console[key] = function(){};
    }
  }
  process.env.PM2_DISCRETE_MODE = true;
};

Common.printVersion = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const vIndex = process.argv.indexOf('-v');

  if (vIndex > -1 && vIndex < variadicArgsDashesPos) {
    console.log(pkg.version);
    process.exit(0);
  }
};

Common.lockReload = function() {
  try {
    const t1 = fs.readFileSync(cst.PM2_RELOAD_LOCKFILE).toString();

    if (!t1 || t1 === '') {
      return writeReloadLock();
    }

    const diff = dayjs().diff(parseInt(t1));
    if (diff < cst.RELOAD_LOCK_TIMEOUT) {
      return diff;
    }

    return writeReloadLock();
  } catch(e) {
    return writeReloadLock();
  }
};

/**
 * Write reload lock file
 * @returns {number}
 */
function writeReloadLock() {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, dayjs().valueOf().toString());
    return 0;
  } catch(e) {
    console.error(e.message || e);
  }
}

Common.unlockReload = function() {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, '');
  } catch(e) {
    console.error(e.message || e);
  }
};

/**
 * Check if script path is missing
 * @param {Object} app
 * @returns {boolean}
 */
function isScriptMissing(app) {
  return !app.script;
}

/**
 * Resolve CWD path
 * @param {Object} app
 * @param {Object} opts
 * @returns {string}
 */
function resolveCwd(app, opts) {
  let cwd = app.cwd ? path.resolve(app.cwd) : null;

  if (cwd && cwd[0] !== '/') {
    cwd = path.resolve(process.cwd(), cwd);
  }

  return cwd || opts.cwd;
}

/**
 * Check if script exists at resolved path
 * @param {string} execPath
 * @returns {boolean}
 */
function scriptExists(execPath) {
  return fs.existsSync(execPath);
}

/**
 * Resolve script path using which command
 * @param {string} script
 * @returns {string|null}
 */
function resolveScriptViaWhich(script) {
  const ckd = which(script);
  if (!ckd) {
    return null;
  }
  return typeof ckd !== 'string' ? ckd.toString() : ckd;
}

/**
 * Check if source map file exists
 * @param {string} execPath
 * @returns {boolean}
 */
function hasSourceMap(execPath) {
  try {
    fs.accessSync(execPath + '.map', fs.constants.R_OK);
    return true;
  } catch(e) {
    return false;
  }
}

/**
 * Filter environment variables based on filter_env setting
 * @param {Object} envObj
 * @param {*} filterEnv
 * @returns {Object}
 */
function filterEnvironment(envObj, filterEnv) {
  if (filterEnv === true) {
    return {};
  }

  if (typeof filterEnv === 'string') {
    const filtered = Object.assign({}, envObj);
    delete filtered[filterEnv];
    return filtered;
  }

  const newEnv = {};
  const allowedKeys = Object.keys(envObj).filter(item =>
    !filterEnv.some(current => item.includes(current))
  );
  allowedKeys.forEach(key => {
    newEnv[key] = envObj[key];
  });

  return newEnv;
}

/**
 * Should use programmatic environment
 * @returns {boolean}
 */
function shouldUseProgrammaticEnv() {
  return cst.PM2_PROGRAMMATIC || process.env.pm_id;
}

/**
 * Resolve app paths and replace missing values with defaults.
 * @method prepareAppConf
 * @param app {Object}
 * @param {} cwd
 * @param {} outputter
 * @return app
 */
Common.prepareAppConf = function(opts, app) {
  if (isScriptMissing(app)) {
    return new Error('No script path - aborting');
  }

  let cwd = resolveCwd(app, opts);

  if (app.cwd) {
    process.env.PWD = app.cwd;
  }

  if (!app.node_args) {
    app.node_args = [];
  }

  if (app.port && app.env) {
    app.env.PORT = app.port;
  }

  app.pm_exec_path = path.resolve(cwd, app.script);

  if (!scriptExists(app.pm_exec_path)) {
    const resolvedPath = resolveScriptViaWhich(app.script);
    if (resolvedPath) {
      app.pm_exec_path = resolvedPath;
    } else {
      return new Error(`Script not found: ${app.pm_exec_path}`);
    }
  }

  if (app.disable_source_map_support !== true && hasSourceMap(app.pm_exec_path)) {
    app.source_map_support = true;
  }
  delete app.disable_source_map_support;
  delete app.script;

  let env = {};

  if (shouldUseProgrammaticEnv()) {
    Common.safeExtend(env, process.env);
  } else {
    env = process.env;
  }

  const filteredEnv = app.filter_env && app.filter_env.length > 0
    ? filterEnvironment(process.env, app.filter_env)
    : env;

  app.env = [
    {}, filteredEnv, app.env || {}
  ].reduce(function(e1, e2) {
    return Object.assign(e1, e2);
  });

  app.pm_cwd = cwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch(e) {
    return e;
  }

  Common.sink.determineExecMode(app);

  const formated_app_name = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');

  ['log', 'out', 'error', 'pid'].forEach(function(f) {
    processLogFile(f, app, cwd, formated_app_name);
  });

  return app;
};

/**
 * Process log file configuration
 * @param {string} fileType
 * @param {Object} app
 * @param {string} cwd
 * @param {string} formatedName
 */
function processLogFile(fileType, app, cwd, formatedName) {
  const af = app[fileType + '_file'];
  const ext = fileType === 'pid' ? 'pid' : 'log';
  const isStd = !~['log', 'pid'].indexOf(fileType);

  const resolvedAf = af ? resolveHome(af) : null;

  if (shouldCreateDefaultPath(fileType, resolvedAf)) {
    const ps = [cst['DEFAULT_' + ext.toUpperCase() + '_PATH'], formatedName + (isStd ? '-' + fileType : '') + '.' + ext];
    setLogPath(app, fileType, isStd, ext, ps);
  } else if (shouldUseCustomPath(fileType, resolvedAf)) {
    const ps = [cwd, resolvedAf];
    ensureLogDirectory(cwd, resolvedAf);
    setLogPath(app, fileType, isStd, ext, ps);
  } else {
    setNullLogPath(app, fileType, isStd, ext);
  }

  delete app[fileType + '_file'];
}

/**
 * Check if default log path should be created
 * @param {string} fileType
 * @param {string} af
 * @returns {boolean}
 */
function shouldCreateDefaultPath(fileType, af) {
  if (fileType === 'log' && typeof af === 'boolean' && af) {
    return true;
  }
  return fileType !== 'log' && !af;
}

/**
 * Check if custom log path should be used
 * @param {string} fileType
 * @param {string} af
 * @returns {boolean}
 */
function shouldUseCustomPath(fileType, af) {
  if (!af) {
    return false;
  }
  if (af === 'NULL' || af === '/dev/null') {
    return false;
  }
  if (fileType === 'log' && !af) {
    return false;
  }
  return true;
}

/**
 * Ensure log directory exists
 * @param {string} cwd
 * @param {string} af
 */
function ensureLogDirectory(cwd, af) {
  const dir = path.dirname(path.resolve(cwd, af));
  if (fs.existsSync(dir)) {
    return;
  }

  Common.printError(cst.PREFIX_MSG_WARNING + 'Folder does not exist: ' + dir);
  Common.printOut(cst.PREFIX_MSG + 'Creating folder: ' + dir);

  try {
    require('mkdirp').sync(dir);
  } catch (err) {
    Common.printError(cst.PREFIX_MSG_ERR + 'Could not create folder: ' + path.dirname(af));
    throw new Error('Could not create folder');
  }
}

/**
 * Set log file path
 * @param {Object} app
 * @param {string} fileType
 * @param {boolean} isStd
 * @param {string} ext
 * @param {Array} ps
 */
function setLogPath(app, fileType, isStd, ext, ps) {
  const pathKey = 'pm_' + (isStd ? fileType.substr(0, 3) + '_' : '') + ext + '_path';
  app[pathKey] = path.resolve.apply(null, ps);
}

/**
 * Set null log path
 * @param {Object} app
 * @param {string} fileType
 * @param {boolean} isStd
 * @param {string} ext
 */
function setNullLogPath(app, fileType, isStd, ext) {
  const pathKey = 'pm_' + (isStd ? fileType.substr(0, 3) + '_' : '') + ext + '_path';
  if (path.sep === '\\') {
    app[pathKey] = '\\\\.\\NUL';
  } else {
    app[pathKey] = '/dev/null';
  }
}

/**
 * Definition of known config file extensions with their type
 */
Common.knonwConfigFileExtensions = {
  '.json': 'json',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.config.js': 'js',
  '.config.cjs': 'js',
  '.config.mjs': 'mjs'
};

/**
 * Check if filename is a configuration file
 * @param {string} filename
 * @return {mixed} null if not conf file, json or yaml if conf
 */
Common.isConfigFile = function (filename) {
  if (typeof (filename) !== 'string') {
    return null;
  }

  for (const extension in Common.knonwConfigFileExtensions) {
    if (filename.indexOf(extension) !== -1) {
      return Common.knonwConfigFileExtensions[extension];
    }
  }

  return null;
};

Common.getConfigFileCandidates = function (name) {
  return Object.keys(Common.knonwConfigFileExtensions).map((extension) => name + extension);
};

/**
 * Parses a config file like ecosystem.config.js. Supported formats: JS, JSON, JSON5, YAML.
 * @param {string} confString  contents of the config file
 * @param {string} filename    path to the config file
 * @return {Object} config object
 */
Common.parseConfig = function(confObj, filename) {
  const yamljs = require('js-yaml');
  const vm     = require('vm');

  const isConfigFile = Common.isConfigFile(filename);

  if (!filename || filename === 'pipe' || filename === 'none' || isConfigFile === 'json') {
    const code = '(' + confObj + ')';
    const sandbox = {};

    return vm.runInThisContext(code, sandbox,