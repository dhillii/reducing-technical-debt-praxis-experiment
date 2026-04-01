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
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const s1opt = process.argv.indexOf('--silent');
  const s2opt = process.argv.indexOf('-s');

  if (process.env.PM2_SILENT) {
    return true;
  }

  if (variadicArgsDashesPos > -1) {
    const s1Valid = s1opt !== -1 && s1opt < variadicArgsDashesPos;
    const s2Valid = s2opt !== -1 && s2opt < variadicArgsDashesPos;
    return s1Valid && s2Valid;
  }

  return s1opt > -1 || s2opt > -1;
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

    if (t1 && t1 !== '') {
      const diff = dayjs().diff(parseInt(t1));
      if (diff < cst.RELOAD_LOCK_TIMEOUT) {
        return diff;
      }
    }
  } catch(e) {}

  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, dayjs().valueOf().toString());
    return 0;
  } catch(e) {
    console.error(e.message || e);
  }
};

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
function resolveCwdPath(app, opts) {
  let cwd = null;

  if (app.cwd) {
    cwd = path.resolve(app.cwd);
    process.env.PWD = app.cwd;
  }

  if (cwd && cwd[0] !== '/') {
    cwd = path.resolve(process.cwd(), cwd);
  }

  return cwd || opts.cwd;
}

/**
 * Initialize node args array
 * @param {Object} app
 */
function initializeNodeArgs(app) {
  if (!app.node_args) {
    app.node_args = [];
  }
}

/**
 * Set port in environment
 * @param {Object} app
 */
function setPortInEnv(app) {
  if (app.port && app.env) {
    app.env.PORT = app.port;
  }
}

/**
 * Resolve script path and check existence
 * @param {Object} app
 * @param {string} cwd
 * @returns {Error|null}
 */
function resolveScriptPath(app, cwd) {
  app.pm_exec_path = path.resolve(cwd, app.script);

  if (fs.existsSync(app.pm_exec_path)) {
    return null;
  }

  const ckd = which(app.script);
  if (ckd) {
    app.pm_exec_path = typeof ckd !== 'string' ? ckd.toString() : ckd;
    return null;
  }

  return new Error(`Script not found: ${app.pm_exec_path}`);
}

/**
 * Handle source map support
 * @param {Object} app
 */
function handleSourceMapSupport(app) {
  if (app.disable_source_map_support === true) {
    delete app.disable_source_map_support;
    return;
  }

  try {
    fs.accessSync(app.pm_exec_path + '.map', fs.constants.R_OK);
    app.source_map_support = true;
  } catch(e) {}

  delete app.disable_source_map_support;
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
 * Setup environment variables
 * @param {Object} app
 * @param {Object} opts
 */
function setupEnvironment(app, opts) {
  let env = {};

  if (cst.PM2_PROGRAMMATIC || process.env.pm_id) {
    Common.safeExtend(env, process.env);
  } else {
    env = process.env;
  }

  const filteredEnv = (app.filter_env && app.filter_env.length > 0)
    ? filterEnvironment(process.env, app.filter_env)
    : env;

  app.env = [
    {},
    filteredEnv,
    app.env || {}
  ].reduce((e1, e2) => Object.assign(e1, e2));
}

/**
 * Build log file paths
 * @param {Object} app
 * @param {string} cwd
 * @param {string} formattedAppName
 */
function buildLogFilePaths(app, cwd, formattedAppName) {
  const logTypes = ['log', 'out', 'error', 'pid'];

  logTypes.forEach(f => {
    const af = app[f + '_file'];
    const ext = f === 'pid' ? 'pid' : 'log';
    const isStd = !logTypes.slice(0, 2).includes(f);

    const resolvedAf = af ? resolveHome(af) : af;
    const pathKey = 'pm_' + (isStd ? f.substr(0, 3) + '_' : '') + ext + '_path';

    if (isNullPath(resolvedAf)) {
      app[pathKey] = getNullPath();
    } else if (shouldUseDefaultPath(f, resolvedAf)) {
      const ps = [cst['DEFAULT_' + ext.toUpperCase() + '_PATH'], formattedAppName + (isStd ? '-' + f : '') + '.' + ext];
      app[pathKey] = path.resolve.apply(null, ps);
    } else {
      handleCustomLogPath(app, cwd, resolvedAf, pathKey);
    }

    delete app[f + '_file'];
  });
}

/**
 * Check if path is null path
 * @param {string} filePath
 * @returns {boolean}
 */
function isNullPath(filePath) {
  return filePath === 'NULL' || filePath === '/dev/null';
}

/**
 * Get null path for current platform
 * @returns {string}
 */
function getNullPath() {
  return path.sep === '\\' ? '\\\\.\\NUL' : '/dev/null';
}

/**
 * Check if default path should be used
 * @param {string} f
 * @param {string} af
 * @returns {boolean}
 */
function shouldUseDefaultPath(f, af) {
  return (f === 'log' && typeof af === 'boolean' && af) || (f !== 'log' && !af);
}

/**
 * Handle custom log path creation
 * @param {Object} app
 * @param {string} cwd
 * @param {string} af
 * @param {string} pathKey
 */
function handleCustomLogPath(app, cwd, af, pathKey) {
  const dir = path.dirname(path.resolve(cwd, af));

  if (!fs.existsSync(dir)) {
    Common.printError(cst.PREFIX_MSG_WARNING + 'Folder does not exist: ' + dir);
    Common.printOut(cst.PREFIX_MSG + 'Creating folder: ' + dir);
    try {
      require('mkdirp').sync(dir);
    } catch (err) {
      Common.printError(cst.PREFIX_MSG_ERR + 'Could not create folder: ' + path.dirname(af));
      throw new Error('Could not create folder');
    }
  }

  app[pathKey] = path.resolve(cwd, af);
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

  const cwd = resolveCwdPath(app, opts);

  initializeNodeArgs(app);
  setPortInEnv(app);

  app.pm_exec_path = path.resolve(cwd, app.script);

  const scriptError = resolveScriptPath(app, cwd);
  if (scriptError) {
    return scriptError;
  }

  handleSourceMapSupport(app);
  delete app.script;

  setupEnvironment(app, opts);

  app.pm_cwd = cwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch(e) {
    return e;
  }

  Common.sink.determineExecMode(app);

  const formattedAppName = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');
  buildLogFilePaths(app, cwd, formattedAppName);

  return app;
};

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

    return vm.runInThisContext(code, sandbox, {
      filename: path.resolve(filename),
      displayErrors: false,
      timeout: 1000
    });
  }

  if (isConfigFile === 'yaml') {
    return yamljs.load(confObj.toString());
  }

  if (isConfigFile === 'js' || isConfigFile === 'mjs') {
    const confPath = require.resolve(path.resolve(filename));
    delete require.cache[confPath];
    return require(confPath);
  }
};

Common.retErr = function(e) {
  if (!e) {
    return new Error('Unidentified error');
  }
  if (e instanceof Error) {
    return e;
  }
  return new Error(e);
};

Common.sink = {};

Common.sink.determineCron = function(app) {
  if (app.cron_restart === 0 || app.cron_restart === '0') {
    Common.printOut(cst.PREFIX_MSG + 'disabling cron restart');
    return;
  }

  if (!app.cron_restart) {
    return;
  }

  const Croner = require('croner');