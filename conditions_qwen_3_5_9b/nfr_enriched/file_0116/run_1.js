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
  var env = process.env;
  var home = env.HOME;
  var user = env.LOGNAME || env.USER || env.LNAME || env.USERNAME;

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
 * Resolve a file path, handling tilde expansion.
 * @param {string} filepath - Path to resolve
 * @returns {string} Resolved path
 */
function resolveHomePath(filepath) {
  if (filepath[0] === '~') {
    return path.join(getHomeDirectory(), filepath.slice(1));
  }
  return filepath;
}

/**
 * Determine if CLI should run in silent mode based on arguments and environment.
 */
function checkSilentMode() {
  var variadicArgsDashesPos = process.argv.indexOf('--');
  var s1opt = process.argv.indexOf('--silent');
  var s2opt = process.argv.indexOf('-s');

  var isSilent = process.env.PM2_SILENT ||
    (variadicArgsDashesPos > -1 &&
      (s1opt != -1 && s1opt < variadicArgsDashesPos) &&
      (s2opt != -1 && s2opt < variadicArgsDashesPos)) ||
    (variadicArgsDashesPos == -1 && (s1opt > -1 || s2opt > -1));

  if (isSilent) {
    for (var key in console) {
      var code = key.charCodeAt(0);
      if (code >= 97 && code <= 122) {
        console[key] = function() {};
      }
    }
    process.env.PM2_DISCRETE_MODE = true;
  }
}

/**
 * Print the PM2 version and exit.
 */
function printVersion() {
  var variadicArgsDashesPos = process.argv.indexOf('--');

  if (process.argv.indexOf('-v') > -1 && process.argv.indexOf('-v') < variadicArgsDashesPos) {
    console.log(pkg.version);
    process.exit(0);
  }
}

/**
 * Check and manage reload lock file.
 * @returns {number} Lock status or timeout
 */
function checkReloadLock() {
  try {
    var t1 = fs.readFileSync(cst.PM2_RELOAD_LOCKFILE).toString();

    if (t1 && t1 != '') {
      var diff = dayjs().diff(parseInt(t1));
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
 * Prepare application configuration with defaults and validation.
 * @param {Object} opts - Options object
 * @param {Object} app - Application configuration
 * @returns {Object|Error} Prepared app or error
 */
function prepareApplicationConfiguration(opts, app) {
  if (!app.script) {
    return new Error('No script path - aborting');
  }

  var cwd = null;

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
    var resolvedPath = resolveScriptPath(app.script);
    if (!resolvedPath) {
      return new Error(`Script not found: ${app.pm_exec_path}`);
    }
    app.pm_exec_path = resolvedPath;
  }

  enableSourceMapSupport(app);
  delete app.script;

  var env = prepareEnvironment(app, opts);
  app.env = mergeEnvironment(env, app.env);

  app.pm_cwd = cwd;
  Common.sink.resolveInterpreter(app);
  Common.sink.determineExecMode(app);

  var formated_app_name = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');
  setupLogFiles(app, cwd, formated_app_name);

  return app;
}

/**
 * Resolve working directory with defaults.
 * @param {string|null} cwd - Current working directory
 * @param {Object} opts - Options object
 * @returns {string} Resolved working directory
 */
function resolveCwd(cwd, opts) {
  if (cwd && cwd[0] != '/') {
    cwd = path.resolve(process.cwd(), cwd);
  }
  return cwd || opts.cwd;
}

/**
 * Resolve script path, checking PATH if not found.
 * @param {string} script - Script name
 * @returns {string|null} Resolved script path or null
 */
function resolveScriptPath(script) {
  var ckd = which(script);
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
  if (app.disable_source_map_support != true) {
    try {
      fs.accessSync(app.pm_exec_path + '.map', fs.constants.R_OK);
      app.source_map_support = true;
    } catch (e) {}
    delete app.disable_source_map_support;
  }
}

/**
 * Prepare environment variables with proper precedence.
 * @param {Object} app - Application configuration
 * @param {Object} opts - Options object
 * @returns {Object} Prepared environment
 */
function prepareEnvironment(app, opts) {
  var env = {};

  if (cst.PM2_PROGRAMMATIC || process.env.pm_id) {
    Common.safeExtend(env, process.env);
  } else {
    env = process.env;
  }

  if (app.filter_env && app.filter_env.length > 0) {
    env = filterEnvironment(env, app.filter_env);
  }

  return env;
}

/**
 * Filter environment variables based on filter_env configuration.
 * @param {Object} envObj - Environment object
 * @param {Array|string} filterEnv - Filter configuration
 * @returns {Object} Filtered environment
 */
function filterEnvironment(envObj, filterEnv) {
  if (filterEnv === true) {
    return {};
  }

  if (typeof filterEnv === 'string') {
    delete envObj[filterEnv];
    return envObj;
  }

  var new_env = {};
  var allowedKeys = filterEnv.reduce((acc, current) =>
    acc.filter(item => !item.includes(current)), Object.keys(envObj));
  allowedKeys.forEach(key => new_env[key] = envObj[key]);
  return new_env;
}

/**
 * Merge environment objects with proper precedence.
 * @param {Object} baseEnv - Base environment
 * @param {Object} appEnv - Application environment
 * @returns {Object} Merged environment
 */
function mergeEnvironment(baseEnv, appEnv) {
  return [
    {},
    (appEnv && appEnv.filter_env && appEnv.filter_env.length > 0)
      ? filterEnvironment(process.env, appEnv.filter_env)
      : baseEnv,
    appEnv || {}
  ].reduce(function(e1, e2) {
    return Object.assign(e1, e2);
  });
}

/**
 * Setup log file paths for the application.
 * @param {Object} app - Application configuration
 * @param {string} cwd - Current working directory
 * @param {string} appName - Formatted application name
 */
function setupLogFiles(app, cwd, appName) {
  ['log', 'out', 'error', 'pid'].forEach(function(f) {
    var af = app[f + '_file'];
    var isStd = !~['log', 'pid'].indexOf(f);
    af = resolveHomePath(af);

    var ps = determineLogPath(f, af, cwd, appName, isStd);
    var logPath = setupLogPath(ps, cwd, af);

    if (af !== 'NULL' && af !== '/dev/null') {
      app['pm_' + (isStd ? f.substr(0, 3) + '_' : '') + 'path'] = logPath;
    } else if (path.sep === '\\') {
      app['pm_' + (isStd ? f.substr(0, 3) + '_' : '') + 'path'] = '\\\\.\\NUL';
    } else {
      app['pm_' + (isStd ? f.substr(0, 3) + '_' : '') + 'path'] = '/dev/null';
    }
    delete app[f + '_file'];
  });
}

/**
 * Determine the log file path based on configuration.
 * @param {string} f - Log type
 * @param {string} af - Absolute file path
 * @param {string} cwd - Current working directory
 * @param {string} appName - Application name
 * @param {boolean} isStd - Is standard output
 * @returns {Array} Path components
 */
function determineLogPath(f, af, cwd, appName, isStd) {
  if ((f == 'log' && typeof af == 'boolean' && af) ||
      (f != 'log' && !af)) {
    return [cst['DEFAULT_' + (f == 'pid' ? 'PID' : 'LOG').toUpperCase() + '_PATH'],
            appName + (isStd ? '-' + f : '') + '.' + (f == 'pid' ? 'pid' : 'log')];
  } else if ((f != 'log' || (f == 'log' && af)) &&
             af !== 'NULL' && af !== '/dev/null') {
    return [cwd, af];
  }
  return null;
}

/**
 * Setup and create log directory if needed.
 * @param {Array} ps - Path components
 * @param {string} cwd - Current working directory
 * @param {string} af - Absolute file path
 * @returns {string} Resolved log path
 */
function setupLogPath(ps, cwd, af) {
  var dir = path.dirname(path.resolve(cwd, af));
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
  return path.resolve.apply(null, ps);
}

/**
 * Known configuration file extensions.
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
 * @returns {string|null} File type or null
 */
function isConfigurationFile(filename) {
  if (typeof filename !== 'string') {
    return null;
  }

  for (var extension in Common.knownConfigFileExtensions) {
    if (filename.indexOf(extension) !== -1) {
      return Common.knownConfigFileExtensions[extension];
    }
  }

  return null;
}

/**
 * Get configuration file candidates for an application.
 * @param {string} name - Application name
 * @returns {Array} Array of candidate file paths
 */
function getConfigFileCandidates(name) {
  return Object.keys(Common.knownConfigFileExtensions).map(function(extension) {
    return name + extension;
  });
}

/**
 * Parse configuration file based on its type.
 * @param {Object} confObj - Configuration object
 * @param {string} filename - Path to configuration file
 * @returns {Object} Parsed configuration
 */
function parseConfigurationFile(confObj, filename) {
  var yamljs = require('js-yaml');
  var vm = require('vm');

  var fileType = isConfigurationFile(filename);

  if (!filename ||
      filename == 'pipe' ||
      filename == 'none' ||
      fileType == 'json') {
    var code = '(' + confObj + ')';
    var sandbox = {};

    return vm.runInThisContext(code, sandbox, {
      filename: path.resolve(filename),
      displayErrors: false,
      timeout: 1000
    });
  } else if (fileType == 'yaml') {
    return yamljs.load(confObj.toString());
  } else if (fileType == 'js' || fileType == 'mjs') {
    var confPath = require.resolve(path.resolve(filename));
    delete require.cache[confPath];
    return require(confPath);
  }
}

/**
 * Convert error to Error instance.
 * @param {Error|string} e - Error object or message
 * @returns {Error} Error instance
 */
function convertToError(e) {
  if (!e) {
    return new Error('Unidentified error');
  }
  if (e instanceof Error) {
    return e;
  }
  return new Error(e);
}

/**
 * Common sink object for internal operations.
 */
Common.sink = {};

/**
 * Configure cron restart for the application.
 * @param {Object} app - Application configuration
 * @returns {Error|null} Error if cron pattern is invalid
 */
function configureCronRestart(app) {
  if (app.cron_restart == 0 || app.cron_restart == '0') {
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
 * Determine execution mode for the application.
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

  if (typeof app.instances == 'undefined') {
    app.instances = 1;
  }
}

/**
 * Resolve Node.js interpreter path.
 * @param {Object} app - Application configuration
 * @returns {boolean} Success status
 */
function resolveNodeInterpreter(app) {
  if (app.exec_mode && app.exec_mode.indexOf('cluster') > -1) {
    Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('Choosing the Node.js version in cluster mode is not supported'));
    return false;
  }

  var nvm_path = cst.IS_WINDOWS ? process.env.NVM_HOME : process.env.NVM_DIR;
  if (!nvm_path) {
    Common.printError(cst.PREFIX_MSG_ERR + chalk.red('NVM is not available in PATH'));
    Common.printError(cst.PREFIX_MSG_ERR + chalk.red('Fallback to node in PATH'));
    var msg = cst.IS_WINDOWS
      ? 'https://github.com/coreybutler/nvm-windows/releases/'
      : '$ curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash';
    Common.printOut(cst.PREFIX_MSG_ERR + chalk.bold('Install NVM:\n' + msg));
    return false;
  }

  var node_version = app.exec_interpreter.split('@')[1];
  var path_to_node = cst.IS_WINDOWS
    ? '/v' + node_version + '/node.exe'
    : semver.satisfies(node_version, '>= 0.12.0')
        ? '/versions/node/v' + node_version + '/bin/node'
        : '/v' + node_version + '/bin/node';
  var nvm_node_path = path.join(nvm_path, path_to_node);

  try {
    fs.accessSync(nvm_node_path);
  } catch (e) {
    Common.printOut(cst.PREFIX_MSG + 'Installing Node v%s', node_version);
    var nvm_bin = path.join(nvm_path, 'nvm.' + (cst.IS_WINDOWS ? 'exe' : 'sh'));
    var nvm_cmd = cst.IS_WINDOWS
      ? nvm_bin + ' install ' + node_version
      : '. ' + nvm_bin + ' ; nvm install ' + node_version;

    Common.printOut(cst.PREFIX_MSG + 'Executing: %s', nvm_cmd);

    execSync(nvm_cmd, {
      cwd: path.resolve(process.cwd()),
      env: process.env,
      maxBuffer: 20 * 1024 * 1024
    });

    if (cst.IS_WINDOWS) {
      nvm_node_path = nvm_node_path.replace(/node/, 'node' + process.arch.slice(1));
    }
  }

  Common.printOut(cst.PREFIX_MSG + chalk.green.bold('Setting Node to v%s (path=%s)'),
                  node_version,
                  nvm_node_path);

  app.exec_interpreter = nvm_node_path;
  return true;
}

/**
 * Resolve the interpreter for the application.
 * @param {Object} app - Application configuration
 * @returns {Object} Application configuration
 */
function resolveApplicationInterpreter(app) {
  var noInterpreter = !app.exec_interpreter;
  var extName = path.extname(app.pm_exec_path);
  var betterInterpreter = extItps[extName];

  // Bun support
  if (noInterpreter && (extName == '.js' || extName == '.ts') && cst.IS_BUN === true) {
    noInterpreter = false;
    app.exec_interpreter = process.execPath;
  }

  // No interpreter defined and correspondance in schema hashmap
  if (noInterpreter && betterInterpreter) {
    app.exec_interpreter = betterInterpreter;

    if (betterInterpreter == "python") {
      if (which('python') == null) {
        if (which('python3') == null) {
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

  if (app.exec_interpreter == 'lsc') {
    app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/lsc');
  }

  if (app.exec_interpreter == 'coffee') {
    app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/coffee');
  }

  if (app.exec_interpreter != 'none' && which(app.exec_interpreter) == null) {
    if (app.exec_interpreter == 'node') {
      Common.warn(`Using builtin node.js version on version ${process.version}`);
      app.exec_interpreter = cst.BUILTIN_NODE_PATH;
    } else {
      throw new Error(`Interpreter ${app.exec_interpreter} is NOT AVAILABLE in PATH. (type 'which ${app.exec_interpreter}' to double check.)`);
    }
  }

  return app;
}

/**
 * Deep copy an object.
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
Common.deepCopy = Common.serialize = Common.clone = function(obj) {
  if (obj === null || obj === undefined) {
    return {};
  }
  return fclone(obj);
};

/**
 * Print error message based on environment.
 * @param {string|Error} msg - Error message or object
 * @returns {boolean} Whether error was printed
 */
function printErrorMessage(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') {
    return false;
  }
  if (msg instanceof Error) {
    return console.error(msg.message);
  }
  return console.error(`${cst.PREFIX_MSG_MOD_ERR}${msg}`);
}

/**
 * Print error message based on environment.
 * @param {string|Error} msg - Error message or object
 * @returns {boolean} Whether error was printed
 */
function printError(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') {
    return false;
  }
  if (msg instanceof Error) {
    return console.error(`${cst.PREFIX_MSG_ERR}${msg.message}`);
  }
  return console.error(`${cst.PREFIX_MSG_ERR}${msg}`);
}

/**
 * Print log message based on environment.
 * @param {string} msg - Message to print
 * @returns {boolean} Whether message was printed
 */
function printLog(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') {
    return false;
  }
  return console.log(`${cst.PREFIX_MSG}${msg}`);
}

/**
 * Print info message based on environment.
 * @param {string} msg - Message to print
 * @returns {boolean} Whether message was printed
 */
function printInfo(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') {
    return false;
  }
  return console.log(`${cst.PREFIX_MSG_INFO}${msg}`);
}

/**
 * Print warning message based on environment.
 * @param {string} msg - Message to print
 * @returns {boolean} Whether message was printed
 */
function printWarning(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') {
    return false;
  }
  return console.log(`${cst.PREFIX_MSG_WARNING}${msg}`);
}

/**
 * Print module log message based on environment.
 * @param {string} msg - Message to print
 * @returns {boolean} Whether message was printed
 */
function printModuleLog(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') {
    return false;
  }
  return console.log(`${cst.PREFIX_MSG_MOD}${msg}`);
}

/**
 * Print output message based on environment.
 * @returns {boolean} Whether message was printed
 */
function printOutput() {
  if (process.env.PM2_SILENT === 'true' || process.env.PM2_PROGRAMMATIC === 'true') {
    return false;
  }
  return console.log.apply(console, arguments);
}

/**
 * Extend destination object with source properties.
 * @param {Object} destination - Destination object
 * @param {Object} source - Source object
 * @returns {Object} Destination object
 */
function extendObject(destination, source) {
  if (typeof destination !== 'object') {
    destination = {};
  }
  if (!source || typeof source !== 'object') {
    return destination;
  }

  Object.keys(source).forEach(function(new_key) {
    if (source[new_key] != '[object Object]') {
      destination[new_key] = source[new_key];
    }
  });

  return destination;
}

/**
 * Safely extend environment with filtering PM2 internal variables.
 * @param {Object} origin - Origin environment
 * @param {Object} add - Additional environment
 * @returns {Object} Extended environment
 */
function safeExtendEnvironment(origin, add) {
  if (!add || typeof add != 'object') {
    return origin;
  }

  var keysToIgnore = [
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

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    if (keysToIgnore.indexOf(keys[i]) == -1 && add[keys[i]] != '[object Object]') {
      origin[keys[i]] = add[keys[i]];
    }
  }
  return origin;
}

/**
 * Merge environment variables from app configuration.
 * @param {Object} app_env - Application environment
 * @param {string} env_name - Environment name
 * @param {Object} deploy_conf - Deployment configuration
 * @returns {Object} Merged environment
 */
function mergeEnvironmentVariables(app_env, env_name, deploy_conf) {
  var app = fclone(app_env);

  var new_conf = {
    env: {}
  };

  for (var key in app.env) {
    if (typeof app.env[key] == 'object') {
      app.env[key] = JSON.stringify(app.env[key]);
    }
  }

  Object.assign(new_conf, app);

  if (env_name) {
    if (deploy_conf && deploy_conf[env_name] && deploy_conf[env_name]['env']) {
      Object.assign(new_conf.env, deploy_conf[env_name]['env']);
    }

    Object.assign(new_conf.env, app.env);

    if ('env_' + env_name in app) {
      Object.assign(new_conf.env, app['env_' + env_name]);
    } else {
      Common.printOut(cst.PREFIX_MSG_WARNING + chalk.bold('Environment [%s] is not defined in process file'), env_name);
    }
  }

  delete new_conf.exec_mode;

  var res = {
    current_conf: {}
  };

  Object.assign(res, new_conf.env);
  Object.assign(res.current_conf, new_conf);

  if (app.exec_interpreter && app.exec_interpreter.indexOf('@') > -1) {
    resolveNodeInterpreter(app);
    res.current_conf.exec_interpreter = app.exec_interpreter;
  }

  return res;
}

/**
 * Resolve application attributes and prepare configuration.
 * @param {Object} opts - Options object
 * @param {Object} conf - Application configuration
 * @returns {Object} Prepared application
 */
function resolveApplicationAttributes(opts, conf) {
  var conf_copy = fclone(conf);

  var app = prepareApplicationConfiguration(opts, conf_copy);
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
function verifyApplicationConfigurations(appConfs) {
  if (!appConfs || appConfs.length == 0) {
    return [];
  }

  appConfs = [].concat(appConfs);

  var verifiedConf = [];

  for (var i = 0; i < appConfs.length; i++) {
    var app = appConfs[i];

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

    renderApplicationName(app);

    if (app.execute_command == true) {
      app.exec_mode = 'fork';
      delete app.execute_command;
    }

    app.username = getCurrentUsername();

    if (app.script && app.script.indexOf(' ') > -1 && cst.IS_WINDOWS === false) {
      var _script = app.script;

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

    if (app.time || process.env.ASZ_MODE) {
      app.log_date_format = 'YYYY-MM-DDTHH:mm:ss';
    }

    if (app.uid || app.gid || app.user) {
      if (cst.IS_WINDOWS === true) {
        Common.printError(cst.PREFIX_MSG_ERR + '--uid and --git does not works on windows');
        return new Error('--uid and --git does not works on windows');
      }

      if (process.env.NODE_ENV != 'test' && process.getuid && process.getuid() !== 0) {
        Common.printError(cst.PREFIX_MSG_ERR + 'To use --uid and --gid please run pm2 as root');
        return new Error('To use UID and GID please run PM2 as root');
      }

      var passwd = require('./tools/passwd.js');
      var users;
      try {
        users = passwd.getUsers();
      } catch (e) {
        Common.printError(e);
        return new Error(e);
      }

      var user_info = users[app.uid || app.user];
      if (!user_info) {
        Common.printError(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
        return new Error(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
      }

      app.env.HOME = user_info.homedir;
      app.uid = parseInt(user_info.userId);

      if (app.gid) {
        var groups;
        try {
          groups = passwd.getGroups();
        } catch (e) {
          Common.printError(e);
          return new Error(e);
        }
        var group_info = groups[app.gid];
        if (!group_info) {
          Common.printError(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
          return new Error(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
        }
        app.gid = parseInt(group_info.id);
      } else {
        app.gid = parseInt(user_info.groupId);
      }
    }

    if (process.env.PM2_DEEP_MONITORING) {
      app.deep_monitoring = true;
    }

    if (app.automation == false) {
      app.pmx = false;
    }

    if (app.disable_trace) {
      app.trace = false;
      delete app.disable_trace;
    }

    if (app.instances == 'max') {
      app.instances = 0;
    }

    if (typeof(app.instances) === 'string') {
      app.instances = parseInt(app.instances) || 0;
    }

    if (app.exec_mode != 'cluster_mode' &&
        !app.instances &&
        typeof(app.merge_logs) == 'undefined') {
      app.merge_logs = true;
    }

    var cronError = configureCronRestart(app);
    if (cronError instanceof Error) {
      return cronError;
    }

    var configError = validateConfiguration(app);
    if (configError instanceof Error) {
      return configError;
    }

    verifiedConf.push(app);
  }

  return verifiedConf;
}

/**
 * Validate application configuration.
 * @param {Object} app - Application configuration
 * @returns {Error|null} Error if validation fails
 */
function validateConfiguration(app) {
  var ret = Config.validateJSON(app);
  if (ret.errors && ret.errors.length > 0) {
    ret.errors.forEach(function(err) {
      printWarning(err);
    });
    return new Error(ret.errors);
  }
  return null;
}

/**
 * Get current username from OS or environment.
 * @returns {string} Current username
 */
function getCurrentUsername() {
  var current_user = '';

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
 * Render application name from script path if not provided.
 * @param {Object} conf - Application configuration
 */
function renderApplicationName(conf) {
  if (!conf.name && conf.script) {
    conf.name = conf.script !== undefined ? path.basename(conf.script) : 'undefined';
    var lastDot = conf.name.lastIndexOf('.');
    if (lastDot > 0) {
      conf.name = conf.name.slice(0, lastDot);
    }
  }
}

/**
 * Show warning message.
 * @param {string} warning - Warning message
 */
function showWarning(warning) {
  printOutput(cst.PREFIX_MSG_WARNING + warning);
}
```