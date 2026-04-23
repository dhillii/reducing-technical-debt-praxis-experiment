```javascript
/**
 * Copyright 2013-2022 the PM2 project authors. All rights reserved.
 * Use of this source code is governed by a license that
 * can be found in the LICENSE file.
 */

/**
 * Common Utilities ONLY USED IN ->CLI<-
 */

var fs        = require('fs');
var path      = require('path');
var os        = require('os');
var util      = require('util');
var chalk     = require('ansis');
var fclone    = require('fclone');
var semver    = require('semver');
var dayjs     = require('dayjs');
var execSync  = require('child_process').execSync;
var isBinary  = require('./tools/isbinaryfile.js');
var cst       = require('../constants.js');
var extItps   = require('./API/interpreter.json');
var Config    = require('./tools/Config');
var pkg       = require('../package.json');
var which     = require('./tools/which.js');
var Common = module.exports;

/**
 * Determine the home directory based on platform and environment variables.
 * @returns {string|null} Home directory path or null
 */
function getHomeDirectory() {
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

/**
 * Resolve a file path that may start with ~ to the absolute home path.
 * @param {string} filepath - The file path to resolve
 * @returns {string} Resolved absolute path
 */
function resolveHomePath(filepath) {
  if (filepath[0] === '~') {
    return path.join(getHomeDirectory(), filepath.slice(1));
  }
  return filepath;
}

/**
 * Determine if the CLI should run in silent mode based on arguments and environment.
 */
function checkSilentMode() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const s1opt = process.argv.indexOf('--silent');
  const s2opt = process.argv.indexOf('-s');

  const isSilent = process.env.PM2_SILENT ||
    (variadicArgsDashesPos > -1 &&
      (s1opt != -1 && s1opt < variadicArgsDashesPos) &&
      (s2opt != -1 && s2opt < variadicArgsDashesPos)) ||
    (variadicArgsDashesPos == -1 && (s1opt > -1 || s2opt > -1));

  if (isSilent) {
    for (const key in console) {
      const code = key.charCodeAt(0);
      if (code >= 97 && code <= 122) {
        console[key] = () => {};
      }
    }
    process.env.PM2_DISCRETE_MODE = true;
  }
}

/**
 * Print the PM2 version and exit.
 */
function printVersion() {
  const variadicArgsDashesPos = process.argv.indexOf('--');

  if (process.argv.indexOf('-v') > -1 && process.argv.indexOf('-v') < variadicArgsDashesPos) {
    console.log(pkg.version);
    process.exit(0);
  }
}

/**
 * Check and manage reload lock file to prevent concurrent reloads.
 * @returns {number} Time difference in ms or 0 if unlocked
 */
function checkReloadLock() {
  try {
    const t1 = fs.readFileSync(cst.PM2_RELOAD_LOCKFILE).toString();

    if (t1 && t1 !== '') {
      const diff = dayjs().diff(parseInt(t1));
      if (diff < cst.RELOAD_LOCK_TIMEOUT) {
        return diff;
      }
    }
  } catch (e) {}

  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, dayjs().valueOf().toString());
    return 0;
  } catch (e) {
    console.error(e.message || e);
  }
  return 0;
}

/**
 * Clear the reload lock file.
 */
function clearReloadLock() {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, '');
  } catch (e) {
    console.error(e.message || e);
  }
}

/**
 * Prepare application configuration by resolving paths, validating script, and setting defaults.
 * @param {Object} opts - Options object containing cwd
 * @param {Object} app - Application configuration object
 * @returns {Object|Error} Prepared app object or Error if validation fails
 */
function prepareApplicationConfiguration(opts, app) {
  if (!app.script) {
    return new Error('No script path - aborting');
  }

  let cwd = null;

  if (app.cwd) {
    cwd = path.resolve(app.cwd);
    process.env.PWD = app.cwd;
  }

  if (!app.node_args) {
    app.node_args = [];
  }

  if (app.port && app.env) {
    app.env.PORT = app.port;
  }

  cwd = resolveCwd(cwd, opts);
  app.pm_exec_path = path.resolve(cwd, app.script);

  if (!fs.existsSync(app.pm_exec_path)) {
    const resolvedPath = resolveScriptPath(app.script);
    if (!resolvedPath) {
      return new Error(`Script not found: ${app.pm_exec_path}`);
    }
    app.pm_exec_path = resolvedPath;
  }

  enableSourceMapSupport(app);
  delete app.script;

  setupEnvironment(app);
  resolveInterpreter(app);
  determineExecMode(app);
  setupLogFiles(app, cwd);

  return app;
}

/**
 * Resolve the working directory path.
 * @param {string|null} cwd - Current working directory
 * @param {Object} opts - Options object
 * @returns {string} Resolved working directory
 */
function resolveCwd(cwd, opts) {
  if (cwd && cwd[0] !== '/') {
    cwd = path.resolve(process.cwd(), cwd);
  }
  return cwd || opts.cwd;
}

/**
 * Resolve script path if it doesn't exist in the expected location.
 * @param {string} script - Script name
 * @returns {string|null} Resolved script path or null
 */
function resolveScriptPath(script) {
  const ckd = which(script);
  if (ckd && typeof ckd !== 'string') {
    ckd = ckd.toString();
  }
  return ckd || null;
}

/**
 * Enable source map support if .map file exists.
 * @param {Object} app - Application configuration
 */
function enableSourceMapSupport(app) {
  if (app.disable_source_map_support !== true) {
    try {
      fs.accessSync(app.pm_exec_path + '.map', fs.constants.R_OK);
      app.source_map_support = true;
    } catch (e) {}
    delete app.disable_source_map_support;
  }
}

/**
 * Setup environment variables for the application.
 * @param {Object} app - Application configuration
 */
function setupEnvironment(app) {
  const env = {};

  if (cst.PM2_PROGRAMMATIC || process.env.pm_id) {
    Common.safeExtend(env, process.env);
  } else {
    env = process.env;
  }

  if (app.filter_env === true) {
    env = {};
  } else if (typeof app.filter_env === 'string') {
    delete env[app.filter_env];
  } else if (app.filter_env && app.filter_env.length > 0) {
    const filteredEnv = filterEnvironment(env, app.filter_env);
    env = filteredEnv;
  }

  app.env = mergeEnvironmentLayers(env, app.env || {});
}

/**
 * Filter environment variables based on exclusion list.
 * @param {Object} envObj - Environment object
 * @param {Array} exclusions - Keys to exclude
 * @returns {Object} Filtered environment
 */
function filterEnvironment(envObj, exclusions) {
  const newEnv = {};
  const allowedKeys = Object.keys(envObj).filter(key => !exclusions.some(ex => key.includes(ex)));
  allowedKeys.forEach(key => {
    newEnv[key] = envObj[key];
  });
  return newEnv;
}

/**
 * Merge multiple environment layers with later ones taking precedence.
 * @param {Object} e1 - First environment layer
 * @param {Object} e2 - Second environment layer
 * @returns {Object} Merged environment
 */
function mergeEnvironmentLayers(e1, e2) {
  return Object.assign(e1, e2);
}

/**
 * Setup log file paths for the application.
 * @param {Object} app - Application configuration
 * @param {string} cwd - Current working directory
 */
function setupLogFiles(app, cwd) {
  const logFields = ['log', 'out', 'error', 'pid'];

  logFields.forEach(field => {
    const af = app[field + '_file'];
    const isStd = !['log', 'pid'].includes(field);
    const resolvedPath = resolveLogFilePath(field, af, cwd);
    const ext = field === 'pid' ? 'pid' : 'log';

    if (resolvedPath) {
      app['pm_' + (isStd ? field.substr(0, 3) + '_' : '') + ext + '_path'] = resolvedPath;
    } else if (path.sep === '\\') {
      app['pm_' + (isStd ? field.substr(0, 3) + '_' : '') + ext + '_path'] = '\\\\.\\NUL';
    } else {
      app['pm_' + (isStd ? field.substr(0, 3) + '_' : '') + ext + '_path'] = '/dev/null';
    }

    delete app[field + '_file'];
  });
}

/**
 * Resolve log file path based on configuration.
 * @param {string} field - Log field name
 * @param {string|boolean|null} af - File path or boolean
 * @param {string} cwd - Current working directory
 * @returns {string|null} Resolved log file path or null
 */
function resolveLogFilePath(field, af, cwd) {
  if (af === 'NULL' || af === '/dev/null') {
    return null;
  }

  if (field === 'log' && typeof af === 'boolean' && af) {
    return null;
  }

  if (!af) {
    return null;
  }

  const resolvedPath = resolveHomePath(af);
  const dir = path.dirname(path.resolve(cwd, resolvedPath));

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

  return resolvedPath;
}

/**
 * Known configuration file extensions and their types.
 */
Common.knownConfigFileExtensions = {
  '.json': 'json',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.config.js': 'js',
  '.config.cjs': 'js',
  '.config.mjs': 'mjs'
};

/**
 * Check if filename is a configuration file.
 * @param {string} filename - File name to check
 * @returns {string|null} Configuration type or null
 */
function isConfigurationFile(filename) {
  if (typeof filename !== 'string') {
    return null;
  }

  for (const extension in Common.knownConfigFileExtensions) {
    if (filename.indexOf(extension) !== -1) {
      return Common.knownConfigFileExtensions[extension];
    }
  }

  return null;
}

/**
 * Get all possible configuration file candidates for a given name.
 * @param {string} name - Application name
 * @returns {Array} Array of candidate file paths
 */
function getConfigFileCandidates(name) {
  return Object.keys(Common.knownConfigFileExtensions).map(extension => name + extension);
}

/**
 * Parse configuration file content based on file type.
 * @param {string} confString - Contents of the config file
 * @param {string} filename - Path to the config file
 * @returns {Object} Parsed configuration object
 */
function parseConfigurationFile(confString, filename) {
  const yamljs = require('js-yaml');
  const vm = require('vm');

  const fileType = isConfigurationFile(filename);

  if (!filename || filename === 'pipe' || filename === 'none' || fileType === 'json') {
    const code = '(' + confString + ')';
    const sandbox = {};

    return vm.runInThisContext(code, sandbox, {
      filename: path.resolve(filename),
      displayErrors: false,
      timeout: 1000
    });
  } else if (fileType === 'yaml') {
    return yamljs.load(confString.toString());
  } else if (fileType === 'js' || fileType === 'mjs') {
    const confPath = require.resolve(path.resolve(filename));
    delete require.cache[confPath];
    return require(confPath);
  }

  return {};
}

/**
 * Convert error or string to Error object.
 * @param {Error|string} e - Error or message
 * @returns {Error} Error object
 */
function createError(e) {
  if (!e) {
    return new Error('Unidentified error');
  }
  if (e instanceof Error) {
    return e;
  }
  return new Error(e);
}

/**
 * Common sink object for application-specific operations.
 */
Common.sink = {};

/**
 * Determine if cron restart should be enabled.
 * @param {Object} app - Application configuration
 * @returns {Error|null} Error if cron pattern is invalid, null otherwise
 */
function determineCronRestart(app) {
  if (app.cron_restart === 0 || app.cron_restart === '0') {
    Common.printOut(cst.PREFIX_MSG + 'disabling cron restart');
    return null;
  }

  if (app.cron_restart) {
    const Croner = require('croner');

    try {
      Common.printOut(cst.PREFIX_MSG + 'cron restart at ' + app.cron_restart);
      Croner(app.cron_restart);
      return null;
    } catch (ex) {
      return new Error(`Cron pattern error: ${ex.message}`);
    }
  }

  return null;
}

/**
 * Determine the execution mode for the application.
 * @param {Object} app - Application configuration
 */
function determineExecutionMode(app) {
  if (app.exec_mode) {
    app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');
  }

  if (!app.exec_mode &&
    (app.instances >= 1 || app.instances === 0 || app.instances === -1) &&
    (app.exec_interpreter.includes('node') === true || app.exec_interpreter.includes('bun') === true)) {
    app.exec_mode = 'cluster_mode';
  } else if (!app.exec_mode) {
    app.exec_mode = 'fork_mode';
  }

  if (typeof app.instances === 'undefined') {
    app.instances = 1;
  }
}

/**
 * Resolve Node.js interpreter path, including NVM support.
 * @param {Object} app - Application configuration
 * @returns {boolean} Success status
 */
function resolveNodeInterpreter(app) {
  if (app.exec_mode && app.exec_mode.indexOf('cluster') > -1) {
    Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('Choosing the Node.js version in cluster mode is not supported'));
    return false;
  }

  const nvmPath = cst.IS_WINDOWS ? process.env.NVM_HOME : process.env.NVM_DIR;

  if (!nvmPath) {
    Common.printError(cst.PREFIX_MSG_ERR + chalk.red('NVM is not available in PATH'));
    Common.printError(cst.PREFIX_MSG_ERR + chalk.red('Fallback to node in PATH'));
    const msg = cst.IS_WINDOWS
      ? 'https://github.com/coreybutler/nvm-windows/releases/'
      : '$ curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash';
    Common.printOut(cst.PREFIX_MSG_ERR + chalk.bold('Install NVM:\n' + msg));
    return false;
  }

  const nodeVersion = app.exec_interpreter.split('@')[1];
  let nodePath;

  if (cst.IS_WINDOWS) {
    nodePath = '/v' + nodeVersion + '/node.exe';
  } else if (semver.satisfies(nodeVersion, '>= 0.12.0')) {
    nodePath = '/versions/node/v' + nodeVersion + '/bin/node';
  } else {
    nodePath = '/v' + nodeVersion + '/bin/node';
  }

  const nvmNodePath = path.join(nvmPath, nodePath);

  try {
    fs.accessSync(nvmNodePath);
  } catch (e) {
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

    if (cst.IS_WINDOWS) {
      nvmNodePath = nvmNodePath.replace(/node/, 'node' + process.arch.slice(1));
    }
  }

  Common.printOut(cst.PREFIX_MSG + chalk.green.bold('Setting Node to v%s (path=%s)'),
    nodeVersion,
    nvmNodePath);

  app.exec_interpreter = nvmNodePath;
  return true;
}

/**
 * Resolve the interpreter for the application based on file extension and configuration.
 * @param {Object} app - Application configuration
 * @returns {Object} Application configuration with resolved interpreter
 */
function resolveApplicationInterpreter(app) {
  const noInterpreter = !app.exec_interpreter;
  const extName = path.extname(app.pm_exec_path);
  const betterInterpreter = extItps[extName];

  // Bun support
  if (noInterpreter && (extName === '.js' || extName === '.ts') && cst.IS_BUN === true) {
    noInterpreter = false;
    app.exec_interpreter = process.execPath;
  }

  // No interpreter defined and correspondance in schema hashmap
  if (noInterpreter && betterInterpreter) {
    app.exec_interpreter = betterInterpreter;

    if (betterInterpreter === 'python') {
      const pythonPath = which('python');
      if (pythonPath === null) {
        const python3Path = which('python3');
        if (python3Path === null) {
          Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('python and python3 binaries not available in PATH'));
        } else {
          app.exec_interpreter = 'python3';
        }
      }
    }
  }
  // Else if no Interpreter detect if process is binary
  else if (noInterpreter) {
    app.exec_interpreter = isBinary(app.pm_exec_path) ? 'none' : process.execPath;
  }
  else if (app.exec_interpreter.indexOf('node@') > -1) {
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

  if (app.exec_interpreter !== 'none' && which(app.exec_interpreter) === null) {
    if (app.exec_interpreter === 'node') {
      Common.warn(`Using builtin node.js version on version ${process.version}`);
      app.exec_interpreter = cst.BUILTIN_NODE_PATH;
    } else {
      throw new Error(`Interpreter ${app.exec_interpreter} is NOT AVAILABLE in PATH. (type 'which ${app.exec_interpreter}' to double check.)`);
    }
  }

  return app;
}

/**
 * Deep copy an object using fclone.
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
function deepClone(obj) {
  if (obj === null || obj === undefined) {
    return {};
  }
  return fclone(obj);
}

/**
 * Print error message to console.
 * @param {Error|string} msg - Error or message
 * @returns {boolean} False if silent mode, true otherwise
 */
function printError(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') {
    return false;
  }
  if (msg instanceof Error) {
    return console.error(msg.message);
  }
  return console.error.apply(console, arguments);
}

/**
 * Print warning message to console.
 * @param {string} msg - Warning message
 * @returns {boolean} False if silent mode, true otherwise
 */
function printWarning(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') {
    return false;
  }
  return console.log(`${cst.PREFIX_MSG_WARNING}${msg}`);
}

/**
 * Print info message to console.
 * @param {string} msg - Info message
 * @returns {boolean} False if silent mode, true otherwise
 */
function printInfo(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') {
    return false;
  }
  return console.log(`${cst.PREFIX_MSG_INFO}${msg}`);
}

/**
 * Print log message to console.
 * @param {string} msg - Log message
 * @returns {boolean} False if silent mode, true otherwise
 */
function printLog(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') {
    return false;
  }
  return console.log(`${cst.PREFIX_MSG}${msg}`);
}

/**
 * Print module log message to console.
 * @param {string} msg - Module log message
 * @returns {boolean} False if silent mode, true otherwise
 */
function printModuleLog(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') {
    return false;
  }
  return console.log(`${cst.PREFIX_MSG_MOD}${msg}`);
}

/**
 * Print output message to console.
 * @returns {boolean} False if silent mode, true otherwise
 */
function printOutput() {
  if (process.env.PM2_SILENT === 'true' || process.env.PM2_PROGRAMMATIC === 'true') {
    return false;
  }
  return console.log.apply(console, arguments);
}

/**
 * Extend destination object with source object properties.
 * @param {Object} destination - Destination object
 * @param {Object} source - Source object
 * @returns {Object} Extended destination object
 */
function extendObject(destination, source) {
  if (typeof destination !== 'object') {
    destination = {};
  }
  if (!source || typeof source !== 'object') {
    return destination;
  }

  Object.keys(source).forEach(newKey => {
    if (source[newKey] !== '[object Object]') {
      destination[newKey] = source[newKey];
    }
  });

  return destination;
}

/**
 * Safely extend environment object while ignoring PM2 internal variables.
 * @param {Object} origin - Origin environment object
 * @param {Object} add - Additional environment variables
 * @returns {Object} Extended environment object
 */
function safeExtendEnvironment(origin, add) {
  if (!add || typeof add !== 'object') {
    return origin;
  }

  const keysToIgnore = [
    'name', 'exec_mode', 'env', 'args', 'pm_cwd', 'exec_interpreter',
    'pm_exec_path', 'node_args', 'pm_out_log_path', 'pm_err_log_path',
    'pm_pid_path', 'pm_id', 'status', 'pm_uptime', 'created_at',
    'windowsHide', 'username', 'merge_logs', 'kill_retry_time',
    'prev_restart_delay', 'instance_var', 'unstable_restarts',
    'restart_time', 'axm_actions', 'pmx_module', 'command', 'watch',
    'filter_env', 'versioning', 'vizion_runing', 'MODULE_DEBUG',
    'pmx', 'axm_options', 'created_at', 'watch', 'vizion',
    'axm_dynamic', 'axm_monitor', 'instances', 'automation',
    'autostart', 'autorestart', 'stop_exit_codes', 'unstable_restart',
    'treekill', 'exit_code', 'vizion'
  ];

  const keys = Object.keys(add);
  const i = keys.length;

  while (i--) {
    const key = keys[i];
    if (keysToIgnore.indexOf(key) === -1 && add[key] !== '[object Object]') {
      origin[key] = add[key];
    }
  }

  return origin;
}

/**
 * Merge environment variables from app configuration and deployment configuration.
 * @param {Object} appEnv - Application environment
 * @param {string} envName - Environment name
 * @param {Object} deployConf - Deployment configuration
 * @returns {Object} Merged environment configuration
 */
function mergeEnvironmentVariables(appEnv, envName, deployConf) {
  const app = deepClone(appEnv);

  const newConf = {
    env: {}
  };

  // Stringify possible object
  for (const key in app.env) {
    if (typeof app.env[key] === 'object') {
      app.env[key] = JSON.stringify(app.env[key]);
    }
  }

  Object.assign(newConf, app);

  if (envName) {
    // First merge variables from deploy.production.env object as least priority.
    if (deployConf && deployConf[envName] && deployConf[envName]['env']) {
      Object.assign(newConf.env, deployConf[envName]['env']);
    }

    Object.assign(newConf.env, app.env);

    // Then, last and highest priority, merge the app.env_production object.
    if ('env_' + envName in app) {
      Object.assign(newConf.env, app['env_' + envName]);
    } else {
      printWarning(chalk.bold('Environment [%s] is not defined in process file'), envName);
    }
  }

  delete newConf.exec_mode;

  const res = {
    current_conf: {}
  };

  Object.assign(res, newConf.env);
  Object.assign(res.current_conf, newConf);

  // Force resolution of node interpreter
  if (app.exec_interpreter && app.exec_interpreter.indexOf('@') > -1) {
    resolveNodeInterpreter(app);
    res.current_conf.exec_interpreter = app.exec_interpreter;
  }

  return res;
}

/**
 * Resolve application attributes by preparing and validating configuration.
 * @param {Object} opts - Options object
 * @param {Object} conf - Application configuration
 * @returns {Object} Prepared application configuration
 */
function resolveApplicationAttributes(opts, conf) {
  const confCopy = deepClone(conf);
  const app = prepareApplicationConfiguration(opts, confCopy);

  if (app instanceof Error) {
    throw new Error(app.message);
  }

  return app;
}

/**
 * Verify and validate application configurations.
 * @param {Array} appConfs - Array of application configurations
 * @returns {Array} Verified configurations
 */
function verifyConfigurations(appConfs) {
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

    // JSON conf: alias cmd to script
    if (app.cmd && !app.script) {
      app.script = app.cmd;
      delete app.cmd;
    }

    // JSON conf: alias command to script
    if (app.command && !app.script) {
      app.script = app.command;
      delete app.command;
    }

    if (!app.env) {
      app.env = {};
    }

    renderApplicationName(app);

    if (app.execute_command === true) {
      app.exec_mode = 'fork';
      delete app.execute_command;
    }

    app.username = getCurrentUsername();

    // Handle scripts with spaces
    if (app.script && app.script.indexOf(' ') > -1 && cst.IS_WINDOWS === false) {
      const _script = app.script;

      if (which('bash')) {
        app.script = 'bash';
        app.args = ['-c', _script];
        if (!app.name) {
          app.name = _script;
        }
      } else if (which('sh')) {
        app.script = 'sh';
        app.args = ['-c', _script];
        if (!app.name) {
          app.name = _script;
        }
      } else {
        printWarning('bash or sh not available in $PATH, keeping script as is');
      }
    }

    // Add log_date_format by default
    if (app.time || process.env.ASZ_MODE) {
      app.log_date_format = 'YYYY-MM-DDTHH:mm:ss';
    }

    // Check and resolve UID/GID
    if (app.uid || app.gid || app.user) {
      if (cst.IS_WINDOWS === true) {
        printError(cst.PREFIX_MSG_ERR + '--uid and --git does not works on windows');
        return new Error('--uid and --git does not works on windows');
      }

      if (process.env.NODE_ENV !== 'test' && process.getuid && process.getuid() !== 0) {
        printError(cst.PREFIX_MSG_ERR + 'To use --uid and --gid please run pm2 as root');
        return new Error('To use UID and GID please run PM2 as root');
      }

      const passwd = require('./tools/passwd.js');
      let users;

      try {
        users = passwd.getUsers();
      } catch (e) {
        printError(e);
        return new Error(e);
      }

      const userInfo = users[app.uid || app.user];
      if (!userInfo) {
        printError(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
        return new Error(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
      }

      app.env.HOME = userInfo.homedir;
      app.uid = parseInt(userInfo.userId);

      // Resolve group id if gid is specified
      if (app.gid) {
        let groups;
        try {
          groups = passwd.getGroups();
        } catch (e) {
          printError(e);
          return new Error(e);
        }
        const groupInfo = groups[app.gid];
        if (!groupInfo) {
          printError(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
          return new Error(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
        }
        app.gid = parseInt(groupInfo.id);
      } else {
        app.gid = parseInt(userInfo.groupId);
      }
    }

    // PM2.io specific options
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

    // Instances params
    if (app.instances === 'max') {
      app.instances = 0;
    }

    if (typeof app.instances === 'string') {
      app.instances = parseInt(app.instances) || 0;
    }

    if (app.exec_mode !== 'cluster_mode' && !app.instances && typeof app.merge_logs === 'undefined') {
      app.merge_logs = true;
    }

    // Check cron restart
    if (app.cron_restart) {
      const cronError = determineCronRestart(app);
      if (cronError instanceof Error) {
        return cronError;
      }
    }

    // Validate configuration
    const validation = Config.validateJSON(app);
    if (validation.errors && validation.errors.length > 0) {
      validation.errors.forEach(err => printWarning(err));
      return new Error(validation.errors);
    }

    verifiedConf.push(validation.config);
  }

  return verifiedConf;
}

/**
 * Get the current username of the user running PM2.
 * @returns {string} Current username
 */
function getCurrentUsername() {
  let current_user = '';

  if (os.userInfo) {
    try {
      current_user = os.userInfo().username;
    } catch (err) {
      // For the case of unhandled error for uv_os_get_passwd
    }
  }

  if (current_user === '') {
    current_user = process.env.USER || process.env.LNAME || process.env.USERNAME ||
      process.env.SUDO_USER || process.env.C9_USER || process.env.LOGNAME;
  }

  return current_user;
}

/**
 * Render an application name from script path if not existing.
 * @param {Object} conf - Application configuration
 */
function renderApplicationName(conf) {
  if (!conf.name && conf.script) {
    conf.name = conf.script !== undefined ? path.basename(conf.script) : 'undefined';
    const lastDot = conf.name.lastIndexOf('.');
    if (lastDot > 0) {
      conf.name = conf.name.slice(0, lastDot);
    }
  }
}

/**
 * Print warning message using the printOutput function.
 * @param {string} warning - Warning message
 */
function printWarningMessage(warning) {
  printOutput(cst.PREFIX_MSG_WARNING + warning);
}

// Export all functions to Common
Common.determineSilentCLI = checkSilentMode;
Common.printVersion = printVersion;
Common.lockReload = checkReloadLock;
Common.unlockReload = clearReloadLock;
Common.prepareAppConf = prepareApplicationConfiguration;
Common.isConfigFile = isConfigurationFile;
Common.getConfigFileCandidates = getConfigFileCandidates;
Common.parseConfig = parseConfigurationFile;
Common.retErr = createError;
Common.sink.determineCron = determineCronRestart;
Common.sink.determineExecMode = determineExecutionMode;
Common.sink.resolveInterpreter = resolveApplicationInterpreter;
Common.deepCopy = deepClone;
Common.errMod = printError;
Common.err = printError;
Common.printError = printError;
Common.log = printLog;
Common.info = printInfo;
Common.warn = printWarning;
Common.logMod = printModuleLog;
Common.printOut = printOutput;
Common.extend = extendObject;
Common.safeExtend = safeExtendEnvironment;
Common.mergeEnvironmentVariables = mergeEnvironmentVariables;
Common.resolveAppAttributes = resolveApplicationAttributes;
Common.verifyConfs = verifyConfigurations;
Common.getCurrentUsername = getCurrentUsername;
Common.renderApplicationName = renderApplicationName;
```