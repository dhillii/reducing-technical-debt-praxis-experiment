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

/**
 * Disable console methods for silent mode
 */
function disableConsole() {
  for (const key in console) {
    const code = key.charCodeAt(0);
    if (code >= 97 && code <= 122) {
      console[key] = function(){};
    }
  }
}

Common.determineSilentCLI = function() {
  if (!isSilentModeEnabled()) {
    return;
  }

  disableConsole();
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
 * Write reload lock file with current timestamp
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
 */
function isScriptMissing(app) {
  return !app.script;
}

/**
 * Resolve CWD path
 */
function resolveCwd(app, opts) {
  let cwd = null;

  if (app.cwd) {
    cwd = path.resolve(app.cwd);
    process.env.PWD = app.cwd;
  }

  cwd = cwd && cwd[0] !== '/' ? path.resolve(process.cwd(), cwd) : cwd;
  return cwd || opts.cwd;
}

/**
 * Initialize node args array
 */
function initializeNodeArgs(app) {
  if (!app.node_args) {
    app.node_args = [];
  }
}

/**
 * Set port in environment
 */
function setPortInEnv(app) {
  if (app.port && app.env) {
    app.env.PORT = app.port;
  }
}

/**
 * Resolve script path
 */
function resolveScriptPath(app, cwd) {
  app.pm_exec_path = path.resolve(cwd, app.script);

  if (fs.existsSync(app.pm_exec_path)) {
    return true;
  }

  const ckd = which(app.script);
  if (ckd) {
    app.pm_exec_path = typeof ckd !== 'string' ? ckd.toString() : ckd;
    return true;
  }

  return false;
}

/**
 * Check and enable source map support
 */
function enableSourceMapSupport(app) {
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
 * Initialize environment variables
 */
function initializeEnv(app) {
  const env = {};

  if (cst.PM2_PROGRAMMATIC || process.env.pm_id) {
    Common.safeExtend(env, process.env);
  } else {
    return process.env;
  }

  return env;
}

/**
 * Filter environment variables based on filter_env setting
 */
function filterEnv(envObj, filterEnv) {
  if (filterEnv === true) {
    return {};
  }

  if (typeof filterEnv === 'string') {
    const filtered = Object.assign({}, envObj);
    delete filtered[filterEnv];
    return filtered;
  }

  const newEnv = {};
  const allowedKeys = filterEnv.reduce((acc, current) =>
    acc.filter(item => !item.includes(current)), Object.keys(envObj));
  allowedKeys.forEach(key => newEnv[key] = envObj[key]);
  return newEnv;
}

/**
 * Merge environment configurations
 */
function mergeEnvConfigs(app, env) {
  const baseEnv = (app.filter_env && app.filter_env.length > 0) ? filterEnv(process.env, app.filter_env) : env;
  return [
    {},
    baseEnv,
    app.env || {}
  ].reduce((e1, e2) => Object.assign(e1, e2));
}

/**
 * Process log file paths
 */
function processLogFilePaths(app, cwd, formatedAppName) {
  ['log', 'out', 'error', 'pid'].forEach(function(f) {
    let af = app[f + '_file'];
    const ext = (f === 'pid' ? 'pid' : 'log');
    const isStd = !~['log', 'pid'].indexOf(f);

    if (af) {
      af = resolveHome(af);
    }

    let ps = null;

    if (shouldUseDefaultPath(f, af)) {
      ps = [cst['DEFAULT_' + ext.toUpperCase() + '_PATH'], formatedAppName + (isStd ? '-' + f : '') + '.' + ext];
    } else if (shouldUseCustomPath(f, af)) {
      ps = [cwd, af];
      ensureLogDirectory(cwd, af);
    }

    setLogPath(app, ps, cwd, af, f, isStd, ext);
    delete app[f + '_file'];
  });
}

/**
 * Check if default path should be used
 */
function shouldUseDefaultPath(f, af) {
  return (f === 'log' && typeof af === 'boolean' && af) || (f !== 'log' && !af);
}

/**
 * Check if custom path should be used
 */
function shouldUseCustomPath(f, af) {
  return (f !== 'log' || (f === 'log' && af)) && af !== 'NULL' && af !== '/dev/null';
}

/**
 * Ensure log directory exists
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
 */
function setLogPath(app, ps, cwd, af, f, isStd, ext) {
  if (af !== 'NULL' && af !== '/dev/null') {
    if (ps) {
      app['pm_' + (isStd ? f.substr(0, 3) + '_' : '') + ext + '_path'] = path.resolve.apply(null, ps);
    }
  } else if (path.sep === '\\') {
    app['pm_' + (isStd ? f.substr(0, 3) + '_' : '') + ext + '_path'] = '\\\\.\\NUL';
  } else {
    app['pm_' + (isStd ? f.substr(0, 3) + '_' : '') + ext + '_path'] = '/dev/null';
  }
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

  initializeNodeArgs(app);
  setPortInEnv(app);

  app.pm_exec_path = path.resolve(cwd, app.script);

  if (!resolveScriptPath(app, cwd)) {
    return new Error(`Script not found: ${app.pm_exec_path}`);
  }

  enableSourceMapSupport(app);
  delete app.script;

  const env = initializeEnv(app);
  app.env = mergeEnvConfigs(app, env);
  app.pm_cwd = cwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch(e) {
    return e;
  }

  Common.sink.determineExecMode(app);

  const formated_app_name = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');
  processLogFilePaths(app, cwd, formated_app_name);

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

  try {
    Common.printOut(cst.PREFIX_MSG + 'cron restart at ' + app.cron_restart);
    Croner(app.cron_restart);
  } catch(ex) {
    return new Error(`Cron pattern error: ${ex.message}`);
  }
};

/**
 * Check if cluster mode is selected
 */
function isClusterMode(app) {
  return app.exec_mode && app.exec_mode.indexOf('cluster') > -1;
}

/**
 * Check if interpreter is node or bun
 */
function isNodeOrBunInterpreter(app) {
  return app.exec_interpreter.includes('node') === true || app.exec_interpreter.includes('bun') === true;
}

/**
 * Check if should use cluster mode
 */
function shouldUseClusterMode(app) {
  return !app.exec_mode &&
    (app.instances >= 1 || app.instances === 0 || app.instances === -1) &&
    isNodeOrBunInterpreter(app);
}

/**
 * Handle alias (fork <=> fork_mode, cluster <=> cluster_mode)
 */
Common.sink.determineExecMode = function(app) {
  if (app.exec_mode) {
    app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');
  }

  if (shouldUseClusterMode(app)) {
    app.exec_mode = 'cluster_mode';
  } else if (!app.exec_mode) {
    app.exec_mode = 'fork_mode';
  }

  if (typeof app.instances === 'undefined') {
    app.instances = 1;
  }
};

/**
 * Check if NVM path is available
 */
function getNvmPath() {
  return cst.IS_WINDOWS ? process.env.NVM_HOME : process.env.NVM_DIR;
}

/**
 * Print NVM installation instructions
 */
function printNvmInstallInstructions() {
  const msg = cst.IS_WINDOWS
    ? 'https://github.com/coreybutler/nvm-windows/releases/'
    : '$ curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash';
  Common.printOut(cst.PREFIX_MSG_ERR + chalk.bold('Install NVM:\n' + msg));
}

/**
 * Get node path for NVM
 */
function getNodePathForNvm(nodeVersion) {
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
 */
function installNodeViaNvm(nvmPath, nodeVersion) {
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
 */
function adjustNodePathForWindows(nvmNodePath) {
  if (!cst.IS_WINDOWS) {
    return nvmNodePath;
  }

  return nvmNodePath.replace(/node/, 'node' + process.arch.slice(1));
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
    printNvmInstallInstructions();
    return;
  }

  const nodeVersion = app.exec_interpreter.split('@')[1];
  const pathToNode = getNodePathForNvm(nodeVersion);
  let nvmNodePath = path.join(nvmPath, pathToNode);

  try {
    fs.accessSync(nvmNodePath);
  } catch(e) {
    Common.printOut(cst.PREFIX_MSG + 'Installing Node v%s', nodeVersion);
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
 */
function isPythonInterpreter(interpreter) {
  return interpreter === 'python';
}

/**
 * Check if python is available
 */
function isPythonAvailable() {
  return which('python') !== null;
}

/**
 * Check if python3 is available
 */
function isPython3Available() {
  return which('python3') !== null;
}

/**
 * Check if interpreter is binary
 */
function isBinaryInterpreter(app) {
  return isBinary(app.pm_exec_path);
}

/**
 * Check if interpreter needs node@ resolution
 */
function needsNodeResolution(interpreter) {
  return interpreter.indexOf('node@') > -1;
}

/**
 * Check if interpreter is in PATH
 */
function isInterpreterInPath(interpreter) {
  return which(interpreter) !== null;
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
  } else if (noInterpreter && betterInterpreter) {
    app.exec_interpreter = betterInterpreter;

    if (isPythonInterpreter(betterInterpreter)) {
      if (!isPythonAvailable()) {
        if (!isPython3Available()) {
          Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('python and python3 binaries not available in PATH'));
        } else {
          app.exec_interpreter = 'python3';
        }
      }
    }
  } else if (noInterpreter) {
    app.exec_interpreter = isBinaryInterpreter(app) ? 'none' : process.execPath;
  } else if (needsNodeResolution(app.exec_interpreter)) {
    resolveNodeInterpreter(app);
  }

  if (app.exec_interpreter.indexOf('python') > -1) {
    app.env.PYTHONUNBUFFERED = '1';
  }

  if (app.exec_interpreter === 'lsc') {
    app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/lsc');
  }

  if (app.exec_interpreter === 'coffee') {
    app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/coffee');
  }

  if (app.exec_interpreter === 'none') {
    return app;
  }

  if (!isInterpreterInPath(app.exec_interpreter)) {
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

Common.errMod = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) {
    return console.error(msg.message);
  }
  return console.error(`${cst.PREFIX_MSG_MOD_ERR}${msg}`);
};

Common.err = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) {
    return console.error(`${cst.PREFIX_MSG_ERR}${msg.message}`);
  }
  return console.error(`${cst.PREFIX_MSG_ERR}${msg}`);
};

Common.printError = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) {
    return console.error(msg.message);
  }
  return console.error.apply(console, arguments);
};

Common.log = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG}${msg}`);
};

Common.info = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG_INFO}${msg}`);
};

Common.warn = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG_WARNING}${msg}`);
};

Common.logMod = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
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
Common.safeExtend = function(origin, add){
  if (!add || typeof add !== 'object') return origin;

  const keysToIgnore = ['name', 'exec_mode', 'env', 'args', 'pm_cwd', 'exec_interpreter', 'pm_exec_path', 'node_args', 'pm_out_log_path', 'pm_err_log_path', 'pm_pid_path', 'pm_id', 'status', 'pm_uptime', 'created_at', 'windowsHide', 'username', 'merge_logs', 'kill_retry_time', 'prev_restart_delay', 'instance_var', 'unstable_restarts', 'restart_time', 'axm_actions', 'pmx_module', 'command', 'watch', 'filter_env', 'versioning', 'vizion_runing', 'MODULE_DEBUG', 'pmx', 'axm_options', 'created_at', 'watch', 'vizion', 'axm_dynamic', 'axm_monitor', 'instances', 'automation', 'autostart', 'autorestart', 'stop_exit_codes', 'unstable_restart', 'treekill', 'exit_code', 'vizion'];

  const keys = Object.keys(add);
  let i = keys.length;

  while (i--) {
    if (keysToIgnore.indexOf(keys[i]) === -1 && add[keys[i]] !== '[object Object]') {
      origin[keys[i]] = add[keys[i]];
    }
  }

  return origin;
};

/**
 * Check if environment name is defined in app
 */
function isEnvNameDefined(app, envName) {
  return 'env_' + envName in app;
}

/**
 * Merge deploy environment variables
 */
function mergeDeployEnv(newConf, deployConf, envName) {
  if (!deployConf || !deployConf[envName] || !deployConf[envName]['env']) {
    return;
  }

  Object.assign(newConf.env, deployConf[envName]['env']);
}

/**
 * Merge app environment variables
 */
function mergeAppEnv(newConf, app, envName) {
  Object.assign(newConf.env, app.env);

  if (isEnvNameDefined(app, envName)) {
    Object.assign(newConf.env, app['env_' + envName]);
  } else {
    Common.printOut(cst.PREFIX_MSG_WARNING + chalk.bold('Environment [%s] is not defined in process file'), envName);
  }
}

/**
 * Stringify object values in environment
 */
function stringifyEnvObjects(env) {
  for (const key in env) {
    if (typeof env[key] === 'object') {
      env[key] = JSON.stringify(env[key]);
    }
  }
}

/**
 * Resolve node interpreter if needed
 */
function resolveNodeInterpreterIfNeeded(app, res) {
  if (!app.exec_interpreter || app.exec_interpreter.indexOf('@') === -1) {
    return;
  }

  resolveNodeInterpreter(app);
  res.current_conf.exec_interpreter = app.exec_interpreter;
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
Common.mergeEnvironmentVariables = function(appEnv, envName, deployConf) {
  const app = fclone(appEnv);

  const newConf = {
    env: {}
  };

  stringifyEnvObjects(app.env);
  Object.assign(newConf, app);

  if (envName) {
    mergeDeployEnv(newConf, deployConf, envName);
    mergeAppEnv(newConf, app, envName);
  }

  delete newConf.exec_mode;

  const res = {
    current_conf: {}
  };

  Object.assign(res, newConf.env);
  Object.assign(res.current_conf, newConf);

  resolveNodeInterpreterIfNeeded(app, res);

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
  const confCopy = fclone(conf);

  const app = Common.prepareAppConf(opts, confCopy);
  if (app instanceof Error) {
    throw new Error(app.message);
  }
  return app;
};

/**
 * Check if app has uid, gid or user
 */
function hasUserConfig(app) {
  return app.uid || app.gid || app.user;
}

/**
 * Check if running on Windows
 */
function isWindowsPlatform() {
  return cst.IS_WINDOWS === true;
}

/**
 * Check if running as root
 */
function isRunningAsRoot() {
  return process.env.NODE_ENV === 'test' || (process.getuid && process.getuid() === 0);
}

/**
 * Get user info from passwd
 */
function getUserInfo(users, app) {
  const userInfo = users[app.uid || app.user];
  if (!userInfo) {
    return null;
  }
  return userInfo;
}

/**
 * Get group info from passwd
 */
function getGroupInfo(groups, app) {
  const groupInfo = groups[app.gid];
  if (!groupInfo) {
    return null;
  }
  return groupInfo;
}

/**
 * Set user environment and uid
 */
function setUserConfig(app, userInfo) {
  app.env.HOME = userInfo.homedir;
  app.uid = parseInt(userInfo.userId);
}

/**
 * Set group gid
 */
function setGroupConfig(app, groupInfo) {
  app.gid = parseInt(groupInfo.id);
}

/**
 * Process user and group configuration
 */
function processUserGroupConfig(app) {
  if (!hasUserConfig(app)) {
    return null;
  }

  if (isWindowsPlatform()) {
    Common.printError(cst.PREFIX_MSG_ERR + '--uid and --git does not works on windows');
    return new Error('--uid and --git does not works on windows');
  }

  if (!isRunningAsRoot()) {
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

  const userInfo = getUserInfo(users, app);
  if (!userInfo) {
    Common.printError(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
    return new Error(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
  }

  setUserConfig(app, userInfo);

  if (!app.gid) {
    app.gid = parseInt(userInfo.groupId);
    return null;
  }

  let groups;

  try {
    groups = passwd.getGroups();
  } catch(e) {
    Common.printError(e);
    return new Error(e);
  }

  const groupInfo = getGroupInfo(groups, app);
  if (!groupInfo) {
    Common.printError(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
    return new Error(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
  }

  setGroupConfig(app, groupInfo);
  return null;
}

/**
 * Check if should enable deep monitoring
 */
function shouldEnableDeepMonitoring() {
  return process.env.PM2_DEEP_MONITORING;
}

/**
 * Check if automation is disabled
 */
function isAutomationDisabled(app) {
  return app.automation === false;
}

/**
 * Check if trace is disabled
 */
function isTraceDisabled(app) {
  return app.disable_trace;
}

/**
 * Check if instances is max
 */
function isInstancesMax(app) {
  return app.instances === 'max';
}

/**
 * Check if instances is string
 */
function isInstancesString(app) {
  return typeof app.instances === 'string';
}

/**
 * Check if should merge logs
 */
function shouldMergeLogs(app) {
  return app.exec_mode !== 'cluster_mode' &&
    !app.instances &&
    typeof app.merge_logs === 'undefined';
}

/**
 * Check if script has spaces
 */
function scriptHasSpaces(app) {
  return app.script && app.script.indexOf(' ') > -1 && cst.IS_WINDOWS === false;
}

/**
 * Check if bash is available
 */
function isBashAvailable() {
  return which('bash');
}

/**
 * Check if sh is available
 */
function isShAvailable() {
  return which('sh');
}

/**
 * Handle script with spaces
 */
function handleScriptWithSpaces(app) {
  const script = app.script;

  if (isBashAvailable()) {
    app.script = 'bash';
    app.args = ['-c', script];
    if (!app.name) {
      app.name = script;
    }
    return;
  }

  if (isShAvailable()) {
    app.script = 'sh';
    app.args = ['-c', script];
    if (!app.name) {
      app.name = script;
    }
    return;
  }

  warn('bash or sh not available in $PATH, keeping script as is');
}

/**
 * Check if should add log date format
 */
function shouldAddLogDateFormat(app) {
  return app.time || process.env.ASZ_MODE;
}

/**
 * Check if cmd alias should be used
 */
function hasCmdAlias(app) {
  return app.cmd && !app.script;
}

/**
 * Check if command alias should be used
 */
function hasCommandAlias(app) {
  return app.command && !app.script;
}

/**
 * Check if execute_command is set
 */
function hasExecuteCommand(app) {
  return app.execute_command === true;
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

    if (hasCmdAlias(app)) {
      app.script = app.cmd;
      delete app.cmd;
    }

    if (hasCommandAlias(app)) {
      app.script = app.command;
      delete app.command;
    }

    if (!app.env) {
      app.env = {};
    }

    Common.renderApplicationName(app);

    if (hasExecuteCommand(app)) {
      app.exec_mode = 'fork';
      delete app.execute_command;
    }

    app.username = Common.getCurrentUsername();

    if (scriptHasSpaces(app)) {
      handleScriptWithSpaces(app);
    }

    if (shouldAddLogDateFormat(app)) {
      app.log_date_format = 'YYYY-MM-DDTHH:mm:ss';
    }

    const userGroupError = processUserGroupConfig(app);
    if (userGroupError instanceof Error) {
      return userGroupError;
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

    if (isInstancesMax(app)) {
      app.instances = 0;
    }

    if (isInstancesString(app)) {
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

    const validationResult = Config.validateJSON(app);
    if (validationResult.errors && validationResult.errors.length > 0) {
      validationResult.errors.forEach(function(err) { warn(err); });
      return new Error(validationResult.errors);
    }

    verifiedConf.push(validationResult.config);
  }

  return verifiedConf;
};

/**
 * Get current username
 * Called on EVERY starting app
 *
 * @returns {String}
 */
Common.getCurrentUsername = function(){
  let currentUser = '';

  if (os.userInfo) {
    try {
      currentUser = os.userInfo().username;
    } catch (err) {
      // For the case of unhandled error for uv_os_get_passwd
      // https://github.com/Unitech/pm2/issues/3184
    }
  }

  if (currentUser === '') {
    currentUser = process.env.USER || process.env.LNAME || process.env.USERNAME || process.env.SUDO_USER || process.env.C9_USER || process.env.LOGNAME;
  }

  return currentUser;
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