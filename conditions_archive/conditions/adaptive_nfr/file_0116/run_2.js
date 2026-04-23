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
 * Attempt to resolve script from PATH
 * @param {string} script
 * @returns {string|null}
 */
function resolveScriptFromPath(script) {
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

  const cwd = resolveCwd(app, opts);

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
    const resolvedPath = resolveScriptFromPath(app.script);
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

  const env = {};

  if (cst.PM2_PROGRAMMATIC || process.env.pm_id) {
    Common.safeExtend(env, process.env);
  } else {
    Object.assign(env, process.env);
  }

  const envToUse = (app.filter_env && app.filter_env.length > 0)
    ? filterEnvironment(process.env, app.filter_env)
    : env;

  app.env = [
    {}, envToUse, app.env || {}
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
 * Process and configure log file paths
 * @param {string} fileType
 * @param {Object} app
 * @param {string} cwd
 * @param {string} formatedName
 */
function processLogFile(fileType, app, cwd, formatedName) {
  let af = app[fileType + '_file'];
  const ext = fileType === 'pid' ? 'pid' : 'log';
  const isStd = !~['log', 'pid'].indexOf(fileType);

  if (af) {
    af = resolveHome(af);
  }

  const shouldUseDefault = (fileType === 'log' && typeof af === 'boolean' && af) ||
                           (fileType !== 'log' && !af);

  if (shouldUseDefault) {
    const ps = [cst['DEFAULT_' + ext.toUpperCase() + '_PATH'], formatedName + (isStd ? '-' + fileType : '') + '.' + ext];
    setLogPath(app, fileType, ext, isStd, ps);
    return;
  }

  if (fileType !== 'log' || (fileType === 'log' && af)) {
    if (af === 'NULL' || af === '/dev/null') {
      setNullLogPath(app, fileType, ext, isStd);
      return;
    }

    const ps = [cwd, af];
    createLogDirectory(cwd, af);
    setLogPath(app, fileType, ext, isStd, ps);
    return;
  }

  setNullLogPath(app, fileType, ext, isStd);
  delete app[fileType + '_file'];
}

/**
 * Set log file path
 * @param {Object} app
 * @param {string} fileType
 * @param {string} ext
 * @param {boolean} isStd
 * @param {Array} pathParts
 */
function setLogPath(app, fileType, ext, isStd, pathParts) {
  const pathKey = 'pm_' + (isStd ? fileType.substr(0, 3) + '_' : '') + ext + '_path';
  app[pathKey] = path.resolve.apply(null, pathParts);
  delete app[fileType + '_file'];
}

/**
 * Set null log path
 * @param {Object} app
 * @param {string} fileType
 * @param {string} ext
 * @param {boolean} isStd
 */
function setNullLogPath(app, fileType, ext, isStd) {
  const pathKey = 'pm_' + (isStd ? fileType.substr(0, 3) + '_' : '') + ext + '_path';
  app[pathKey] = path.sep === '\\' ? '\\\\.\\NUL' : '/dev/null';
  delete app[fileType + '_file'];
}

/**
 * Create log directory if it doesn't exist
 * @param {string} cwd
 * @param {string} af
 */
function createLogDirectory(cwd, af) {
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

  try {
    Common.printOut(cst.PREFIX_MSG + 'cron restart at ' + app.cron_restart);
    Croner(app.cron_restart);
  } catch(ex) {
    return new Error(`Cron pattern error: ${ex.message}`);
  }
};

/**
 * Check if instances should default to cluster mode
 * @param {Object} app
 * @returns {boolean}
 */
function shouldUseClusterMode(app) {
  const hasValidInstances = app.instances >= 1 || app.instances === 0 || app.instances === -1;
  const isNodeOrBun = app.exec_interpreter.includes('node') === true ||
                      app.exec_interpreter.includes('bun') === true;

  return hasValidInstances && isNodeOrBun;
}

/**
 * Handle alias (fork <=> fork_mode, cluster <=> cluster_mode)
 */
Common.sink.determineExecMode = function(app) {
  if (app.exec_mode) {
    app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');
  }

  if (!app.exec_mode && shouldUseClusterMode(app)) {
    app.exec_mode = 'cluster_mode';
  } else if (!app.exec_mode) {
    app.exec_mode = 'fork_mode';
  }

  if (typeof app.instances === 'undefined') {
    app.instances = 1;
  }
};

/**
 * Check if cluster mode is enabled
 * @param {Object} app
 * @returns {boolean}
 */
function isClusterMode(app) {
  return app.exec_mode && app.exec_mode.indexOf('cluster') > -1;
}

/**
 * Get NVM path based on platform
 * @returns {string|null}
 */
function getNvmPath() {
  return cst.IS_WINDOWS ? process.env.NVM_HOME : process.env.NVM_DIR;
}

/**
 * Get path to node binary in NVM
 * @param {string} nodeVersion
 * @returns {string}
 */
function getNvmNodePath(nvmPath, nodeVersion) {
  if (cst.IS_WINDOWS) {
    return '/v' + nodeVersion + '/node.exe';
  }

  if (semver.satisfies(nodeVersion, '>= 0.12.0')) {
    return '/versions/node/v' + nodeVersion + '/bin/node';
  }

  return '/v' + nodeVersion + '/bin/node';
}

/**
 * Install Node version via NVM
 * @param {string} nvmPath
 * @param {string} nodeVersion
 */
function installNodeViaNvm(nvmPath, nodeVersion) {
  Common.printOut(cst.PREFIX_MSG + 'Installing Node v%s', nodeVersion);

  const nvmBin = path.join(nvmPath, 'nvm.' + (cst.IS_WINDOWS ? 'exe' : 'sh'));
  const nvmCmd = cst.IS_WINDOWS
    ? nvmBin + ' install ' + nodeVersion
    : '. ' + nvmBin + ' ; nvm install ' + nodeVersion;

  Common.printOut(cst.PREFIX_MSG + 'Executing: %s', nvmCmd);

  execSync(nvmCmd, {
    cwd: path.resolve(process.cwd()),
    env: process.env,
    maxBuffer: 20 * 1024 * 1024
  });
}

/**
 * Adjust node path for Windows architecture
 * @param {string} nodePath
 * @returns {string}
 */
function adjustNodePathForWindows(nodePath) {
  if (!cst.IS_WINDOWS) {
    return nodePath;
  }
  return nodePath.replace(/node/, 'node' + process.arch.slice(1));
}

const resolveNodeInterpreter = function(app) {
  if (isClusterMode(app)) {
    Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('Choosing the Node.js version in cluster mode is not supported'));
    return false;
  }

  const nvmPath = getNvmPath();

  if (!nvmPath) {
    Common.printError(cst.PREFIX_MSG_ERR + chalk.red('NVM is not available in PATH'));
    Common.printError(cst.PREFIX_MSG_ERR + chalk.red('Fallback to node in PATH'));
    const msg = cst.IS_WINDOWS
      ? 'https://github.com/coreybutler/nvm-windows/releases/'
      : '$ curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash';
    Common.printOut(cst.PREFIX_MSG_ERR + chalk.bold('Install NVM:\n' + msg));
    return;
  }

  const nodeVersion = app.exec_interpreter.split('@')[1];
  const pathToNode = getNvmNodePath(nvmPath, nodeVersion);
  let nvmNodePath = path.join(nvmPath, pathToNode);

  try {
    fs.accessSync(nvmNodePath);
  } catch(e) {
    installNodeViaNvm(nvmPath, nodeVersion);
    nvmNodePath = adjustNodePathForWindows(nvmNodePath);
  }

  Common.printOut(cst.PREFIX_MSG + chalk.green.bold('Setting Node to v%s (path=%s)'),
                  nodeVersion,
                  nvmNodePath);

  app.exec_interpreter = nvmNodePath;
};

/**
 * Check if interpreter is python
 * @param {string} interpreter
 * @returns {boolean}
 */
function isPythonInterpreter(interpreter) {
  return interpreter === 'python';
}

/**
 * Resolve python interpreter availability
 * @param {Object} app
 */
function resolvePythonInterpreter(app) {
  if (which('python') !== null) {
    return;
  }

  if (which('python3') === null) {
    Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('python and python3 binaries not available in PATH'));
    return;
  }

  app.exec_interpreter = 'python3';
}

/**
 * Check if interpreter is binary
 * @param {string} interpreter
 * @returns {boolean}
 */
function isBinaryInterpreter(interpreter) {
  return interpreter === 'none';
}

/**
 * Check if interpreter needs special path resolution
 * @param {string} interpreter
 * @returns {boolean}
 */
function needsPathResolution(interpreter) {
  return interpreter === 'lsc' || interpreter === 'coffee';
}

/**
 * Get resolved path for special interpreters
 * @param {string} interpreter
 * @returns {string}
 */
function getSpecialInterpreterPath(interpreter) {
  return path.resolve(__dirname, '../node_modules/.bin/' + interpreter);
}

/**
 * Check if interpreter is available in PATH
 * @param {string} interpreter
 * @returns {boolean}
 */
function isInterpreterAvailable(interpreter) {
  return which(interpreter) !== null;
}

/**
 * Resolve interpreter
 */
Common.sink.resolveInterpreter = function(app) {
  let noInterpreter = !app.exec_interpreter;
  const extName = path.extname(app.pm_exec_path);
  const betterInterpreter = extItps[extName];

  if (noInterpreter && (extName === '.js' || extName === '.ts') && cst.IS_BUN === true) {
    noInterpreter = false;
    app.exec_interpreter = process.execPath;
  }

  if (noInterpreter && betterInterpreter) {
    app.exec_interpreter = betterInterpreter;

    if (isPythonInterpreter(betterInterpreter)) {
      resolvePythonInterpreter(app);
    }
  } else if (noInterpreter) {
    app.exec_interpreter = isBinary(app.pm_exec_path) ? 'none' : process.execPath;
  } else if (app.exec_interpreter.indexOf('node@') > -1) {
    resolveNodeInterpreter(app);
  }

  if (app.exec_interpreter.indexOf('python') > -1) {
    app.env.PYTHONUNBUFFERED = '1';
  }

  if (needsPathResolution(app.exec_interpreter)) {
    app.exec_interpreter = getSpecialInterpreterPath(app.exec_interpreter);
  }

  if (!isInterpreterAvailable(app.exec_interpreter)) {
    if (app.exec_interpreter === 'node') {
      Common.warn(`Using builtin node.js version on version ${process.version}`);
      app.exec_interpreter = cst.BUILTIN_NODE_PATH;
    } else {
      throw new Error(`Interpreter ${app.exec_interpreter} is NOT AVAILABLE in PATH. (type 'which ${app.exec_interpreter}' to double check.)`);
    }
  }

  return app;
};

Common.deepCopy = Common.serialize = Common.clone = function(obj) {
  if (obj === null || obj === undefined) return {};
  return fclone(obj);
};

/**
 * Check if silent mode is active
 * @returns {boolean}
 */
function isSilentMode() {
  return process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true';
}

Common.errMod = function(msg) {
  if (isSilentMode()) return false;
  if (msg instanceof Error) {
    return console.error(msg.message);
  }
  return console.error(`${cst.PREFIX_MSG_MOD_ERR}${msg}`);
};

Common.err = function(msg) {
  if (isSilentMode()) return false;
  if (msg instanceof Error) {
    return console.error(`${cst.PREFIX_MSG_ERR}${msg.message}`);
  }
  return console.error(`${cst.PREFIX_MSG_ERR}${msg}`);
};

Common.printError = function(msg) {
  if (isSilentMode()) return false;
  if (msg instanceof Error) {
    return console.error(msg.message);
  }
  return console.error.apply(console, arguments);
};

Common.log = function(msg) {
  if (isSilentMode()) return false;
  return console.log(`${cst.PREFIX_MSG}${msg}`);
};

Common.info = function(msg) {
  if (isSilentMode()) return false;
  return console.log(`${cst.PREFIX_MSG_INFO}${msg}`);
};

Common.warn = function(msg) {
  if (isSilentMode()) return false;
  return console.log(`${cst.PREFIX_MSG_WARNING}${msg}`);
};

Common.logMod = function(msg) {
  if (isSilentMode()) return false;
  return console.log(`${cst.PREFIX_MSG_MOD}${msg}`);
};

Common.printOut = function() {
  if (process.env.PM2_SILENT === 'true' || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log.apply(console, arguments);
};

/**
 * Raw extend
 */
Common.extend = function(destination, source) {
  if (typeof destination !== 'object') {
    destination = {};
  }
  if (!source || typeof source !== 'object') {
    return destination;
  }

  Object.keys(source).forEach(function(new_key) {
    if (source[new_key] !== '[object Object]') {
      destination[new_key] = source[new_key];
    }
  });

  return destination;
};

/**
 * This is useful when starting script programmatically
 */
Common.safeExtend = function(origin, add) {
  if (!add || typeof add !== 'object') return origin;

  const keysToIgnore = ['name', 'exec_mode', 'env', 'args', 'pm_cwd', 'exec_interpreter', 'pm_exec_path', 'node_args', 'pm_out_log_path', 'pm_err_log_path', 'pm_pid_path', 'pm_id', 'status', 'pm_uptime', 'created_at', 'windowsHide', 'username', 'merge_logs', 'kill_retry_time', 'prev_restart_delay', 'instance_var', 'unstable_restarts', 'restart_time', 'axm_actions', 'pmx_module', 'command', 'watch', 'filter_env', 'versioning', 'vizion_runing', 'MODULE_DEBUG', 'pmx', 'axm_options', 'created_at', 'watch', 'vizion', 'axm_dynamic', 'axm_monitor', 'instances', 'automation', 'autostart', 'autorestart', 'stop_exit_codes', 'unstable_restart', 'treekill', 'exit_code', 'vizion'];

  const keys = Object.keys(add);
  let i = keys.length;

  while (i--) {
    const key = keys[i];
    if (keysToIgnore.indexOf(key) === -1 && add[key] !== '[object Object]') {
      origin[key] = add[key];
    }
  }

  return origin;
};

/**
 * Check if environment name is defined in app config
 * @param {Object} app
 * @param {string} envName
 * @returns {boolean}
 */
function isEnvironmentDefined(app, envName) {
  return ('env_' + envName) in app;
}

/**
 * Stringify object values in environment
 * @param {Object} env
 */
function stringifyObjectEnv(env) {
  for (const key in env) {
    if (typeof env[key] === 'object') {
      env[key] = JSON.stringify(env[key]);
    }
  }
}

/**
 * Extend the app.env object of with the properties taken from the
 * app.env_[envName] and deploy configuration.
 * Also update current json attributes
 *
 * Used only for Configuration file processing
 *
 * @param {Object} app The app object.
 * @param {string} envName The given environment name.
 * @param {Object} deployConf Deployment configuration object (from JSON file or whatever).
 * @returns {Object} The app.env variables object.
 */
Common.mergeEnvironmentVariables = function(app_env, env_name, deploy_conf) {
  const app = fclone(app_env);

  const new_conf = {
    env: {}
  };

  stringifyObjectEnv(app.env);

  Object.assign(new_conf, app);

  if (!env_name) {
    delete new_conf.exec_mode;
    const res = { current_conf: {} };
    Object.assign(res, new_conf.env);
    Object.assign(res.current_conf, new_conf);
    return res;
  }

  if (deploy_conf && deploy_conf[env_name] && deploy_conf[env_name]['env']) {
    Object.assign(new_conf.env, deploy_conf[env_name]['env']);
  }

  Object.assign(new_conf.env, app.env);

  if (isEnvironmentDefined(app, env_name)) {
    Object.assign(new_conf.env, app['env_' + env_name]);
  } else {
    Common.printOut(cst.PREFIX_MSG_WARNING + chalk.bold('Environment [%s] is not defined in process file'), env_name);
  }

  delete new_conf.exec_mode;

  const res = { current_conf: {} };
  Object.assign(res, new_conf.env);
  Object.assign(res.current_conf, new_conf);

  if (app.exec_interpreter && app.exec_interpreter.indexOf('@') > -1) {
    resolveNodeInterpreter(app);
    res.current_conf.exec_interpreter = app.exec_interpreter;
  }

  return res;
};

/**
 * This function will resolve paths, option and environment
 * CALLED before 'prepare' God call (=> PROCESS INITIALIZATION)
 * @method resolveAppAttributes
 * @param {Object} opts
 * @param {Object} opts.cwd
 * @param {Object} opts.pm2_home
 * @param {Object} appConf application configuration
 * @return app
 */
Common.resolveAppAttributes = function(opts, conf) {
  const conf_copy = fclone(conf);

  const app = Common.prepareAppConf(opts, conf_copy);
  if (app instanceof Error) {
    throw new Error(app.message);
  }
  return app;
};

/**
 * Check if app has valid script
 * @param {Object} app
 * @returns {boolean}
 */
function hasValidScript(app) {
  return app.script && app.script.indexOf(' ') > -1 && cst.IS_WINDOWS === false;
}

/**
 * Configure script with shell wrapper
 * @param {Object} app
 * @param {string} shell
 */
function configureScriptWithShell(app, shell) {
  const _script = app.script;
  app.script = shell;
  app.args = ['-c', _script];
  if (!app.name) {
    app.name = _script;
  }
}

/**
 * Check if UID/GID configuration is present
 * @param {Object} app
 * @returns {boolean}
 */
function hasUidGidConfig(app) {
  return app.uid || app.gid || app.user;
}

/**
 * Validate UID/GID prerequisites
 * @param {Object} app
 * @returns {Error|null}
 */
function validateUidGidPrerequisites(app) {
  if (cst.IS_WINDOWS === true) {
    Common.printError(cst.PREFIX_MSG_ERR + '--uid and --git does not works on windows');
    return new Error('--uid and --git does not works on windows');
  }

  if (process.env.NODE_ENV !== 'test' && process.getuid && process.getuid() !== 0) {
    Common.printError(cst.PREFIX_MSG_ERR + 'To use --uid and --gid please run pm2 as root');
    return new Error('To use UID and GID please run PM2 as root');
  }

  return null;
}

/**
 * Get user information from passwd
 * @param {Object} app
 * @returns {Object|Error}
 */
function getUserInfo(app) {
  const passwd = require('./tools/passwd.js');
  let users;

  try {
    users = passwd.getUsers();
  } catch(e) {
    Common.printError(e);
    return new Error(e);
  }

  const user_info = users[app.uid || app.user];
  if (!user_info) {
    Common.printError(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
    return new Error(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
  }

  return user_info;
}

/**
 * Get group information from passwd
 * @param {string} gid
 * @returns {Object|Error}
 */
function getGroupInfo(gid) {
  const passwd = require('./tools/passwd.js');
  let groups;

  try {
    groups = passwd.getGroups();
  } catch(e) {
    Common.printError(e);
    return new Error(e);
  }

  const group_info = groups[gid];
  if (!group_info) {
    Common.printError(`${cst.PREFIX_MSG_ERR} Group ${gid} cannot be found`);
    return new Error(`${cst.PREFIX_MSG_ERR} Group ${gid} cannot be found`);
  }

  return group_info;
}

/**
 * Configure UID/GID for app
 * @param {Object} app
 * @returns {Error|null}
 */
function configureUidGid(app) {
  const validationError = validateUidGidPrerequisites(app);
  if (validationError) {
    return validationError;
  }

  const user_info = getUserInfo(app);
  if (user_info instanceof Error) {
    return user_info;
  }

  app.env.HOME = user_info.homedir;
  app.uid = parseInt(user_info.userId);

  if (!app.gid) {
    app.gid = parseInt(user_info.groupId);
    return null;
  }

  const group_info = getGroupInfo(app.gid);
  if (group_info instanceof Error) {
    return group_info;
  }

  app.gid = parseInt(group_info.id);
  return null;
}

/**
 * Check if instances should be set to max
 * @param {*} instances
 * @returns {boolean}
 */
function isInstancesMax(instances) {
  return instances === 'max';
}

/**
 * Check if instances is a string number
 * @param {*} instances
 * @returns {boolean}
 */
function isInstancesString(instances) {
  return typeof instances === 'string';
}

/**
 * Check if merge logs should be enabled
 * @param {Object} app
 * @returns {boolean}
 */
function shouldMergeLogs(app) {
  return app.exec_mode !== 'cluster_mode' &&
         !app.instances &&
         typeof app.merge_logs === 'undefined';
}

/**
 * Verify configurations
 * Called on EVERY Operation (start/restart/reload/stop...)
 * @param {Array} appConfs
 * @returns {Array}
 */
Common.verifyConfs = function(appConfs) {
  if (!appConfs || appConfs.length === 0) {
    return [];
  }

  appConfs = [].concat(appConfs);

  const verifiedConf = [];

  for (let i = 0; i < appConfs.length; i++) {
    const app = appConfs[i];

    if (app.exec_mode) {
      app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');
    }

    if (app.cmd && !app.script) {
      app.script = app.cmd;
      delete app.cmd;
    }

    if (app.command && !app.script) {
      app.script = app.command;
      delete app.command;
    }

    if (!app.env) {
      app.env = {};
    }

    Common.renderApplicationName(app);

    if (app.execute_command === true) {
      app.exec_mode = 'fork';
      delete app.execute_command;
    }

    app.username = Common.getCurrentUsername();

    if (hasValidScript(app)) {
      if (which('bash')) {
        configureScriptWithShell(app, 'bash');
      } else if (which('sh')) {
        configureScriptWithShell(app, 'sh');
      } else {
        warn('bash or sh not available in $PATH, keeping script as is');
      }
    }

    if (app.time || process.env.ASZ_MODE) {
      app.log_date_format = 'YYYY-MM-DDTHH:mm:ss';
    }

    if (hasUidGidConfig(app)) {
      const uidGidError = configureUidGid(app);
      if (uidGidError) {
        return uidGidError;
      }
    }

    if (process.env.PM2_DEEP_MONITORING) {
      app.deep_monitoring = true;
    }

    if (app.automation === false) {
      app.pmx = false;
    }

    if (app.disable_trace) {
      app.trace = false;
      delete app.disable_trace;
    }

    if (isInstancesMax(app.instances)) {
      app.instances = 0;
    }

    if (isInstancesString(app.instances)) {
      app.instances = parseInt(app.instances) || 0;
    }

    if (shouldMergeLogs(app)) {
      app.merge_logs = true;
    }

    if (app.cron_restart) {
      const ret = Common.sink.determineCron(app);
      if (ret instanceof Error) {
        return ret;
      }
    }

    const ret = Config.validateJSON(app);
    if (ret.errors && ret.errors.length > 0) {
      ret.errors.forEach(function(err) { warn(err); });
      return new Error(ret.errors);
    }

    verifiedConf.push(ret.config);
  }

  return verifiedConf;
};

/**
 * Get current username
 * Called on EVERY starting app
 *
 * @returns {String}
 */
Common.getCurrentUsername = function() {
  let current_user = '';

  if (os.userInfo) {
    try {
      current_user = os.userInfo().username;
    } catch (err) {
      // For the case of unhandled error for uv_os_get_passwd
      // https://github.com/Unitech/pm2/issues/3184
    }
  }

  if (current_user === '') {
    current_user = process.env.USER || process.env.LNAME || process.env.USERNAME || process.env.SUDO_USER || process.env.C9_USER || process.env.LOGNAME;
  }

  return current_user;
};

/**
 * Render an app name if not existing.
 * @param {Object} conf
 */
Common.renderApplicationName = function(conf) {
  if (!conf.name && conf.script) {
    conf.name = conf.script !== undefined ? path.basename(conf.script) : 'undefined';
    const lastDot = conf.name.lastIndexOf('.');
    if (lastDot > 0) {
      conf.name = conf.name.slice(0, lastDot);
    }
  }
};

/**
 * Show warnings
 * @param {String} warning
 */
function warn(warning) {
  Common.printOut(cst.PREFIX_MSG_WARNING + warning);
}
```