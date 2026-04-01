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
  if (process.env.PM2_SILENT) return true;
  
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
 * Resolve script path
 * @param {string} cwd
 * @param {string} script
 * @returns {string|Error}
 */
function resolveScriptPath(cwd, script) {
  const pm_exec_path = path.resolve(cwd, script);

  if (fs.existsSync(pm_exec_path)) {
    return pm_exec_path;
  }

  const ckd = which(script);
  if (ckd) {
    return typeof(ckd) !== 'string' ? ckd.toString() : ckd;
  }

  return new Error(`Script not found: ${pm_exec_path}`);
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
 * @param {Object} app
 * @param {Object} envObj
 * @returns {Object}
 */
function filterEnv(app, envObj) {
  if (app.filter_env === true) {
    return {};
  }

  if (typeof app.filter_env === 'string') {
    const filtered = Object.assign({}, envObj);
    delete filtered[app.filter_env];
    return filtered;
  }

  const new_env = {};
  const allowedKeys = app.filter_env.reduce((acc, current) =>
    acc.filter(item => !item.includes(current)), Object.keys(envObj));
  
  allowedKeys.forEach(key => new_env[key] = envObj[key]);
  return new_env;
}

/**
 * Build environment for app
 * @param {Object} app
 * @param {Object} opts
 * @returns {Object}
 */
function buildAppEnv(app, opts) {
  let env = {};

  if (cst.PM2_PROGRAMMATIC || process.env.pm_id) {
    Common.safeExtend(env, process.env);
  } else {
    env = process.env;
  }

  const shouldFilter = app.filter_env && app.filter_env.length > 0;
  const filteredEnv = shouldFilter ? filterEnv(app, process.env) : env;

  return [
    {}, filteredEnv, app.env || {}
  ].reduce((e1, e2) => Object.assign(e1, e2));
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

  if (app.cwd) {
    process.env.PWD = app.cwd;
  }

  if (!app.node_args) {
    app.node_args = [];
  }

  if (app.port && app.env) {
    app.env.PORT = app.port;
  }

  const cwd = resolveCwd(app, opts);
  const scriptPathResult = resolveScriptPath(cwd, app.script);

  if (scriptPathResult instanceof Error) {
    return scriptPathResult;
  }

  app.pm_exec_path = scriptPathResult;

  if (app.disable_source_map_support !== true && hasSourceMap(app.pm_exec_path)) {
    app.source_map_support = true;
  }
  delete app.disable_source_map_support;
  delete app.script;

  app.env = buildAppEnv(app, opts);
  app.pm_cwd = cwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch(e) {
    return e;
  }

  Common.sink.determineExecMode(app);

  const formated_app_name = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');

  ['log', 'out', 'error', 'pid'].forEach(function(f){
    processLogFile(f, app, cwd, formated_app_name);
  });

  return app;
};

/**
 * Process log file configuration
 * @param {string} f
 * @param {Object} app
 * @param {string} cwd
 * @param {string} formated_app_name
 */
function processLogFile(f, app, cwd, formated_app_name) {
  const af = app[f + '_file'];
  const ext = (f === 'pid' ? 'pid' : 'log');
  const isStd = !~['log', 'pid'].indexOf(f);
  
  if (!af) {
    return handleMissingLogFile(f, app, cwd, formated_app_name, ext, isStd);
  }

  const resolvedAf = resolveHome(af);
  handleExistingLogFile(f, app, cwd, resolvedAf, ext, isStd);
}

/**
 * Handle missing log file
 * @param {string} f
 * @param {Object} app
 * @param {string} cwd
 * @param {string} formated_app_name
 * @param {string} ext
 * @param {boolean} isStd
 */
function handleMissingLogFile(f, app, cwd, formated_app_name, ext, isStd) {
  if (f === 'log') {
    const ps = [cst['DEFAULT_' + ext.toUpperCase() + '_PATH'], formated_app_name + (isStd ? '-' + f : '') + '.' + ext];
    setLogPath(app, f, ext, isStd, ps);
  } else {
    setLogPath(app, f, ext, isStd, null);
  }
}

/**
 * Handle existing log file
 * @param {string} f
 * @param {Object} app
 * @param {string} cwd
 * @param {string} af
 * @param {string} ext
 * @param {boolean} isStd
 */
function handleExistingLogFile(f, app, cwd, af, ext, isStd) {
  if (af === 'NULL' || af === '/dev/null') {
    setNullLogPath(app, f, ext, isStd);
    return;
  }

  const ps = [cwd, af];
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

  setLogPath(app, f, ext, isStd, ps);
}

/**
 * Set log path
 * @param {Object} app
 * @param {string} f
 * @param {string} ext
 * @param {boolean} isStd
 * @param {Array} ps
 */
function setLogPath(app, f, ext, isStd, ps) {
  const pathKey = 'pm_' + (isStd ? f.substr(0, 3) + '_' : '') + ext + '_path';
  
  if (ps) {
    app[pathKey] = path.resolve.apply(null, ps);
  } else {
    setNullLogPath(app, f, ext, isStd);
  }
  
  delete app[f + '_file'];
}

/**
 * Set null log path
 * @param {Object} app
 * @param {string} f
 * @param {string} ext
 * @param {boolean} isStd
 */
function setNullLogPath(app, f, ext, isStd) {
  const pathKey = 'pm_' + (isStd ? f.substr(0, 3) + '_' : '') + ext + '_path';
  
  if (path.sep === '\\') {
    app[pathKey] = '\\\\.\\NUL';
  } else {
    app[pathKey] = '/dev/null';
  }
  
  delete app[f + '_file'];
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
  if (typeof (filename) !== 'string')
    return null;

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
  if (!e)
    return new Error('Unidentified error');
  if (e instanceof Error)
    return e;
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
 * Handle alias (fork <=> fork_mode, cluster <=> cluster_mode)
 */
Common.sink.determineExecMode = function(app) {
  if (app.exec_mode) {
    app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');
  }

  const hasInstances = app.instances >= 1 || app.instances === 0 || app.instances === -1;
  const isNodeOrBun = app.exec_interpreter.includes('node') === true || app.exec_interpreter.includes('bun') === true;

  if (!app.exec_mode && hasInstances && isNodeOrBun) {
    app.exec_mode = 'cluster_mode';
  } else if (!app.exec_mode) {
    app.exec_mode = 'fork_mode';
  }

  if (typeof app.instances === 'undefined') {
    app.instances = 1;
  }
};

/**
 * Check if cluster mode is set
 * @param {Object} app
 * @returns {boolean}
 */
function isClusterMode(app) {
  return app.exec_mode && app.exec_mode.indexOf('cluster') > -1;
}

/**
 * Check if NVM path is available
 * @returns {string|null}
 */
function getNvmPath() {
  return cst.IS_WINDOWS ? process.env.NVM_HOME : process.env.NVM_DIR;
}

/**
 * Get node path for NVM
 * @param {string} node_version
 * @returns {string}
 */
function getNodePathForNvm(node_version) {
  if (cst.IS_WINDOWS) {
    return '/v' + node_version + '/node.exe';
  }

  if (semver.satisfies(node_version, '>= 0.12.0')) {
    return '/versions/node/v' + node_version + '/bin/node';
  }

  return '/v' + node_version + '/bin/node';
}

/**
 * Get NVM command
 * @param {string} nvm_path
 * @param {string} node_version
 * @returns {string}
 */
function getNvmCommand(nvm_path, node_version) {
  const nvm_bin = path.join(nvm_path, 'nvm.' + (cst.IS_WINDOWS ? 'exe' : 'sh'));
  
  if (cst.IS_WINDOWS) {
    return nvm_bin + ' install ' + node_version;
  }

  return '. ' + nvm_bin + ' ; nvm install ' + node_version;
}

/**
 * Resolve Node interpreter with NVM
 * @param {Object} app
 * @param {string} nvm_path
 */
function resolveNodeWithNvm(app, nvm_path) {
  const node_version = app.exec_interpreter.split('@')[1];
  const path_to_node = getNodePathForNvm(node_version);
  let nvm_node_path = path.join(nvm_path, path_to_node);

  try {
    fs.accessSync(nvm_node_path);
  } catch(e) {
    installNodeVersion(nvm_path, node_version, nvm_node_path);
    nvm_node_path = updateNodePathForWindows(nvm_node_path);
  }

  Common.printOut(cst.PREFIX_MSG + chalk.green.bold('Setting Node to v%s (path=%s)'),
                  node_version,
                  nvm_node_path);

  app.exec_interpreter = nvm_node_path;
}

/**
 * Install Node version via NVM
 * @param {string} nvm_path
 * @param {string} node_version
 * @param {string} nvm_node_path
 */
function installNodeVersion(nvm_path, node_version, nvm_node_path) {
  Common.printOut(cst.PREFIX_MSG + 'Installing Node v%s', node_version);
  
  const nvm_cmd = getNvmCommand(nvm_path, node_version);
  Common.printOut(cst.PREFIX_MSG + 'Executing: %s', nvm_cmd);

  execSync(nvm_cmd, {
    cwd: path.resolve(process.cwd()),
    env: process.env,
    maxBuffer: 20 * 1024 * 1024
  });
}

/**
 * Update node path for Windows architecture
 * @param {string} nvm_node_path
 * @returns {string}
 */
function updateNodePathForWindows(nvm_node_path) {
  if (!cst.IS_WINDOWS) {
    return nvm_node_path;
  }

  return nvm_node_path.replace(/node/, 'node' + process.arch.slice(1));
}

const resolveNodeInterpreter = function(app) {
  if (isClusterMode(app)) {
    Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('Choosing the Node.js version in cluster mode is not supported'));
    return false;
  }

  const nvm_path = getNvmPath();
  
  if (!nvm_path) {
    handleMissingNvm();
    return;
  }

  resolveNodeWithNvm(app, nvm_path);
};

/**
 * Handle missing NVM
 */
function handleMissingNvm() {
  Common.printError(cst.PREFIX_MSG_ERR + chalk.red('NVM is not available in PATH'));
  Common.printError(cst.PREFIX_MSG_ERR + chalk.red('Fallback to node in PATH'));
  
  const msg = cst.IS_WINDOWS
    ? 'https://github.com/coreybutler/nvm-windows/releases/'
    : '$ curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash';
  
  Common.printOut(cst.PREFIX_MSG_ERR + chalk.bold('Install NVM:\n' + msg));
}

/**
 * Check if interpreter is python
 * @param {string} interpreter
 * @returns {boolean}
 */
function isPythonInterpreter(interpreter) {
  return interpreter.indexOf('python') > -1;
}

/**
 * Resolve python interpreter
 * @param {Object} app
 * @param {string} betterInterpreter
 */
function resolvePythonInterpreter(app, betterInterpreter) {
  if (betterInterpreter !== 'python') {
    return;
  }

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
 * @param {Object} app
 * @returns {boolean}
 */
function isBinaryInterpreter(app) {
  return isBinary(app.pm_exec_path);
}

/**
 * Resolve interpreter
 */
Common.sink.resolveInterpreter = function(app) {
  const noInterpreter = !app.exec_interpreter;
  const extName = path.extname(app.pm_exec_path);
  const betterInterpreter = extItps[extName];

  if (noInterpreter && (extName === '.js' || extName === '.ts') && cst.IS_BUN === true) {
    app.exec_interpreter = process.execPath;
    return;
  }

  if (noInterpreter && betterInterpreter) {
    app.exec_interpreter = betterInterpreter;
    resolvePythonInterpreter(app, betterInterpreter);
    return;
  }

  if (noInterpreter) {
    app.exec_interpreter = isBinaryInterpreter(app) ? 'none' : process.execPath;
    return;
  }

  if (app.exec_interpreter.indexOf('node@') > -1) {
    resolveNodeInterpreter(app);
  }

  if (isPythonInterpreter(app.exec_interpreter)) {
    app.env.PYTHONUNBUFFERED = '1';
  }

  if (app.exec_interpreter === 'lsc') {
    app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/lsc');
  }

  if (app.exec_interpreter === 'coffee') {
    app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/coffee');
  }

  if (app.exec_interpreter === 'none' || which(app.exec_interpreter) !== null) {
    return;
  }

  if (app.exec_interpreter === 'node') {
    Common.warn(`Using builtin node.js version on version ${process.version}`);
    app.exec_interpreter = cst.BUILTIN_NODE_PATH;
    return;
  }

  throw new Error(`Interpreter ${app.exec_interpreter} is NOT AVAILABLE in PATH. (type 'which ${app.exec_interpreter}' to double check.)`);
};

Common.deepCopy = Common.serialize = Common.clone = function(obj) {
  if (obj === null || obj === undefined) return {};
  return fclone(obj);
};

/**
 * Check if should suppress output
 * @returns {boolean}
 */
function shouldSuppressOutput() {
  return process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true';
}

Common.errMod = function(msg) {
  if (shouldSuppressOutput()) return false;
  if (msg instanceof Error)
    return console.error(msg.message);
  return console.error(`${cst.PREFIX_MSG_MOD_ERR}${msg}`);
};

Common.err = function(msg) {
  if (shouldSuppressOutput()) return false;
  if (msg instanceof Error)
    return console.error(`${cst.PREFIX_MSG_ERR}${msg.message}`);
  return console.error(`${cst.PREFIX_MSG_ERR}${msg}`);
};

Common.printError = function(msg) {
  if (shouldSuppressOutput()) return false;
  if (msg instanceof Error)
    return console.error(msg.message);
  return console.error.apply(console, arguments);
};

Common.log = function(msg) {
  if (shouldSuppressOutput()) return false;
  return console.log(`${cst.PREFIX_MSG}${msg}`);
};

Common.info = function(msg) {
  if (shouldSuppressOutput()) return false;
  return console.log(`${cst.PREFIX_MSG_INFO}${msg}`);
};

Common.warn = function(msg) {
  if (shouldSuppressOutput()) return false;
  return console.log(`${cst.PREFIX_MSG_WARNING}${msg}`);
};

Common.logMod = function(msg) {
  if (shouldSuppressOutput()) return false;
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
    if (source[new_key] !== '[object Object]')
      destination[new_key] = source[new_key];
  });

  return destination;
};

/**
 * This is useful when starting script programmatically
 */
Common.safeExtend = function(origin, add){
  if (!add || typeof add !== 'object') return origin;

  const keysToIgnore = ['name', 'exec_mode', 'env', 'args', 'pm_cwd', 'exec_interpreter', 'pm_exec_path', 'node_args', 'pm_out_log_path', 'pm_err_log_path', 'pm_pid_path', 'pm_id', 'status', 'pm_uptime', 'created_at', 'windowsHide', 'username', 'merge_logs', 'kill_retry_time', 'prev_restart_delay', 'instance_var', 'unstable_restarts', 'restart_time', 'axm_actions', 'pmx_module', 'command', 'watch', 'filter_env', 'versioning', 'vizion_runing', 'MODULE_DEBUG', 'pmx', 'axm_options', 'created_at', 'watch', 'vizion', 'axm_dynamic', 'axm_monitor', 'instances', 'automation', 'autostart', 'autorestart', 'stop_exit_codes', 'unstable_restart', 'treekill', 'exit_code', 'vizion'];

  const keys = Object.keys(add);
  let i = keys.length;
  while (i--) {
    if(keysToIgnore.indexOf(keys[i]) === -1 && add[keys[i]] !== '[object Object]')
      origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

/**
 * Stringify object values in env
 * @param {Object} app
 */
function stringifyEnvObjects(app) {
  for (const key in app.env) {
    if (typeof app.env[key] === 'object') {
      app.env[key] = JSON.stringify(app.env[key]);
    }
  }
}

/**
 * Merge deploy environment variables
 * @param {Object} app
 * @param {string} env_name
 * @param {Object} deploy_conf
 */
function mergeDeployEnv(app, env_name, deploy_conf) {
  if (!env_name) {
    return;
  }

  if (deploy_conf && deploy_conf[env_name] && deploy_conf[env_name]['env']) {
    Object.assign(app.env, deploy_conf[env_name]['env']);
  }

  if ('env_' + env_name in app) {
    Object.assign(app.env, app['env_' + env_name]);
  } else {
    Common.printOut(cst.PREFIX_MSG_WARNING + chalk.bold('Environment [%s] is not defined in process file'), env_name);
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
    env : {}
  };

  stringifyEnvObjects(app);
  Object.assign(new_conf, app);
  Object.assign(new_conf.env, app.env);
  mergeDeployEnv(new_conf, env_name, deploy_conf);

  delete new_conf.exec_mode;

  const res = {
    current_conf: {}
  };

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
 * Check if app has uid/gid/user settings
 * @param {Object} app
 * @returns {boolean}
 */
function hasUserSettings(app) {
  return app.uid || app.gid || app.user;
}

/**
 * Check if running on Windows
 * @returns {boolean}
 */
function isWindows() {
  return cst.IS_WINDOWS === true;
}

/**
 * Check if running as root
 * @returns {boolean}
 */
function isRoot() {
  return process.env.NODE_ENV === 'test' || (process.getuid && process.getuid() === 0);
}

/**
 * Resolve user information
 * @param {Object} app
 * @param {Object} users
 * @returns {Error|null}
 */
function resolveUserInfo(app, users) {
  const user_info = users[app.uid || app.user];
  
  if (!user_info) {
    const msg = `${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`;
    Common.printError(msg);
    return new Error(msg);
  }

  app.env.HOME = user_info.homedir;
  app.uid = parseInt(user_info.userId);
  return null;
}

/**
 * Resolve group information
 * @param {Object} app
 * @param {Object} groups
 * @param {Object} user_info
 * @returns {Error|null}
 */
function resolveGroupInfo(app, groups, user_info) {
  if (!app.gid) {
    app.gid = parseInt(user_info.groupId);
    return null;
  }

  const group_info = groups[app.gid];
  
  if (!group_info) {
    const msg = `${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`;
    Common.printError(msg);
    return new Error(msg);
  }

  app.gid = parseInt(group_info.id);
  return null;
}

/**
 * Handle user/group resolution
 * @param {Object} app
 * @returns {Error|null}
 */
function handleUserGroupResolution(app) {
  if (isWindows()) {
    Common.printError(cst.PREFIX_MSG_ERR + '--uid and --git does not works on windows');
    return new Error('--uid and --git does not works on windows');
  }

  if (!isRoot()) {
    Common.printError(cst.PREFIX_MSG_ERR + 'To use --uid and --gid please run pm2 as root');
    return new Error('To use UID and GID please run PM2 as root');
  }

  const passwd = require('./tools/passwd.js');
  let users;
  
  try {
    users = passwd.getUsers();
  } catch(e) {
    Common.printError(e);
    return new Error(e);
  }

  const userError = resolveUserInfo(app, users);
  if (userError) return userError;

  if (!app.gid) {
    return null;
  }

  let groups;
  try {
    groups = passwd.getGroups();
  } catch(e) {
    Common.printError(e);
    return new Error(e);
  }

  return resolveGroupInfo(app, groups, users[app.uid || app.user]);
}

/**
 * Check if should enable deep monitoring
 * @returns {boolean}
 */
function shouldEnableDeepMonitoring() {
  return process.env.PM2_DEEP_MONITORING === 'true';
}

/**
 * Check if automation is disabled
 * @param {Object} app
 * @returns {boolean}
 */
function isAutomationDisabled(app) {
  return app.automation === false;
}

/**
 * Check if trace is disabled
 * @param {Object} app
 * @returns {boolean}
 */
function isTraceDisabled(app) {
  return app.disable_trace === true;
}

/**
 * Normalize instances value
 * @param {Object} app
 */
function normalizeInstances(app) {
  if (app.instances === 'max') {
    app.instances = 0;
  }

  if (typeof(app.instances) === 'string') {
    app.instances = parseInt(app.instances) || 0;
  }
}

/**
 * Check if should enable merge logs
 * @param {Object} app
 * @returns {boolean}
 */
function shouldEnableMergeLogs(app) {
  return app.exec_mode !== 'cluster_mode' &&
         !app.instances &&
         typeof(app.merge_logs) === 'undefined';
}

/**
 * Process app configuration
 * @param {Object} app
 * @returns {Error|null}
 */
function processAppConfig(app) {
  if (app.cron_restart) {
    const ret = Common.sink.determineCron(app);
    if (ret instanceof Error) return ret;
  }

  const ret = Config.validateJSON(app);
  if (ret.errors && ret.errors.length > 0) {
    ret.errors.forEach(function(err) { warn(err); });
    return new Error(ret.errors);
  }

  return null;
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

    handleScriptWithSpaces(app);

    if (app.time || process.env.ASZ_MODE) {
      app.log_date_format = 'YYYY-MM-DDTHH:mm:ss';
    }

    if (hasUserSettings(app)) {
      const userError = handleUserGroupResolution(app);
      if (userError) return [userError];
    }

    if (shouldEnableDeepMonitoring()) {
      app.deep_monitoring = true;
    }

    if (isAutomationDisabled(app)) {
      app.pmx = false;
    }

    if (isTraceDisabled(app)) {
      app.trace = false;
      delete app.disable_trace;
    }

    normalizeInstances(app);

    if (shouldEnableMergeLogs(app)) {
      app.merge_logs = true;
    }

    const configError = processAppConfig(app);
    if (configError) return [configError];

    verifiedConf.push(app);
  }

  return verifiedConf;
};

/**
 * Handle script with spaces
 * @param {Object} app
 */
function handleScriptWithSpaces(app) {
  if (!app.script || app.script.indexOf(' ') === -1 || cst.IS_WINDOWS === true) {
    return;
  }

  const _script = app.script;

  if (which('bash')) {
    app.script = 'bash';
    app.args = ['-c', _script];
    if (!app.name) {
      app.name = _script;
    }
    return;
  }

  if (which('sh')) {
    app.script = 'sh';
    app.args = ['-c', _script];
    if (!app.name) {
      app.name = _script;
    }
    return;
  }

  warn('bash or sh not available in $PATH, keeping script as is');
}

/**
 * Get current username
 * Called on EVERY starting app
 *
 * @returns {String}
 */
Common.getCurrentUsername = function(){
  let current_user = '';

  if (os.userInfo) {
    try {
      current_user = os.userInfo().username;
    } catch (err) {
      // For the case of unhandled error for uv_os_get_passwd
      // https://github.com/Unitech/pm2/issues/3184
    }
  }

  if(current_user === '') {
    current_user = process.env.USER || process.env.LNAME || process.env.USERNAME || process.env.SUDO_USER || process.env.C9_USER || process.env.LOGNAME;
  }

  return current_user;
};

/**
 * Render an app name if not existing.
 * @param {Object} conf
 */
Common.renderApplicationName = function(conf){
  if (!conf.name && conf.script){
    conf.name = conf.script !== undefined ? path.basename(conf.script) : 'undefined';
    const lastDot = conf.name.lastIndexOf('.');
    if (lastDot > 0){
      conf.name = conf.name.slice(0, lastDot);
    }
  }
};

/**
 * Show warnings
 * @param {String} warning
 */
function warn(warning){
  Common.printOut(cst.PREFIX_MSG_WARNING + warning);
}
```