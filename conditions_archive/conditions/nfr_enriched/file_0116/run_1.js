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

// Helper: Get home directory
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

// Helper: Resolve home directory in filepath
function resolveHome(filepath) {
  if (filepath[0] === '~') {
    return path.join(homedir(), filepath.slice(1));
  }
  return filepath;
}

// Helper: Check if silent mode is enabled
function isSilentModeEnabled() {
  return process.env.PM2_SILENT === 'true' || process.env.PM2_PROGRAMMATIC === 'true';
}

// Helper: Disable console methods for silent mode
function disableConsole() {
  for (const key in console) {
    const code = key.charCodeAt(0);
    if (code >= 97 && code <= 122) {
      console[key] = function(){};
    }
  }
}

// Helper: Check if silent flag is in valid position
function isSilentFlagValid(variadicPos, flagPos) {
  return flagPos > -1 && (variadicPos === -1 || flagPos < variadicPos);
}

Common.determineSilentCLI = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const s1opt = process.argv.indexOf('--silent');
  const s2opt = process.argv.indexOf('-s');

  const hasSilentEnv = process.env.PM2_SILENT;
  const hasSilentFlag = isSilentFlagValid(variadicArgsDashesPos, s1opt) || 
                        isSilentFlagValid(variadicArgsDashesPos, s2opt);

  if (hasSilentEnv || hasSilentFlag) {
    disableConsole();
    process.env.PM2_DISCRETE_MODE = true;
  }
};

Common.printVersion = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const vIndex = process.argv.indexOf('-v');

  if (vIndex > -1 && (variadicArgsDashesPos === -1 || vIndex < variadicArgsDashesPos)) {
    console.log(pkg.version);
    process.exit(0);
  }
};

Common.lockReload = function() {
  try {
    const t1 = fs.readFileSync(cst.PM2_RELOAD_LOCKFILE).toString();

    if (t1 && t1 !== '') {
      const diff = dayjs().diff(parseInt(t1));
      if (diff < cst.RELOAD_LOCK_TIMEOUT)
        return diff;
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

// Helper: Validate app has script
function validateAppScript(app) {
  if (!app.script)
    return new Error('No script path - aborting');
  return null;
}

// Helper: Resolve working directory
function resolveWorkingDirectory(app, opts) {
  let cwd = null;

  if (app.cwd) {
    cwd = path.resolve(app.cwd);
    process.env.PWD = app.cwd;
  }

  cwd = cwd && cwd[0] !== '/' ? path.resolve(process.cwd(), cwd) : cwd;
  return cwd || opts.cwd;
}

// Helper: Initialize node args
function initializeNodeArgs(app) {
  if (!app.node_args) {
    app.node_args = [];
  }
}

// Helper: Set port in environment
function setPortInEnv(app) {
  if (app.port && app.env) {
    app.env.PORT = app.port;
  }
}

// Helper: Resolve script path
function resolveScriptPath(app, cwd) {
  app.pm_exec_path = path.resolve(cwd, app.script);

  if (!fs.existsSync(app.pm_exec_path)) {
    let ckd = which(app.script);
    if (ckd) {
      if (typeof(ckd) !== 'string')
        ckd = ckd.toString();
      app.pm_exec_path = ckd;
    } else {
      return new Error(`Script not found: ${app.pm_exec_path}`);
    }
  }
  return null;
}

// Helper: Handle source map support
function handleSourceMapSupport(app) {
  if (app.disable_source_map_support !== true) {
    try {
      fs.accessSync(app.pm_exec_path + '.map', fs.constants.R_OK);
      app.source_map_support = true;
    } catch(e) {}
    delete app.disable_source_map_support;
  }
}

// Helper: Filter environment variables
function filterEnvironmentVariables(app, env) {
  if (app.filter_env === true)
    return {};

  if (typeof app.filter_env === 'string') {
    const filtered = Object.assign({}, env);
    delete filtered[app.filter_env];
    return filtered;
  }

  if (Array.isArray(app.filter_env) && app.filter_env.length > 0) {
    const newEnv = {};
    const allowedKeys = Object.keys(env).filter(key => 
      !app.filter_env.some(filter => key.includes(filter))
    );
    allowedKeys.forEach(key => newEnv[key] = env[key]);
    return newEnv;
  }

  return env;
}

// Helper: Prepare environment variables
function prepareEnvironmentVariables(app, cwd) {
  let env = {};

  if (cst.PM2_PROGRAMMATIC || process.env.pm_id)
    Common.safeExtend(env, process.env);
  else
    env = process.env;

  const filteredEnv = app.filter_env && app.filter_env.length > 0 
    ? filterEnvironmentVariables(app, process.env) 
    : env;

  app.env = Object.assign({}, {}, filteredEnv, app.env || {});
}

// Helper: Format application name
function formatApplicationName(name) {
  return name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');
}

// Helper: Resolve log file path
function resolveLogFilePath(app, cwd, formattedName, fileType, isStdFile) {
  const fileKey = fileType + '_file';
  const af = app[fileKey];
  const ext = fileType === 'pid' ? 'pid' : 'log';
  const isStd = !~['log', 'pid'].indexOf(fileType);

  let resolvedPath = af ? resolveHome(af) : null;

  if ((fileType === 'log' && typeof resolvedPath === 'boolean' && resolvedPath) || 
      (fileType !== 'log' && !resolvedPath)) {
    const ps = [cst['DEFAULT_' + ext.toUpperCase() + '_PATH'], 
                formattedName + (isStd ? '-' + fileType : '') + '.' + ext];
    return { path: ps, resolved: resolvedPath };
  } else if ((fileType !== 'log' || (fileType === 'log' && resolvedPath)) && 
             resolvedPath !== 'NULL' && resolvedPath !== '/dev/null') {
    const ps = [cwd, resolvedPath];
    const dir = path.dirname(path.resolve(cwd, resolvedPath));
    
    if (!fs.existsSync(dir)) {
      Common.printError(cst.PREFIX_MSG_WARNING + 'Folder does not exist: ' + dir);
      Common.printOut(cst.PREFIX_MSG + 'Creating folder: ' + dir);
      try {
        require('mkdirp').sync(dir);
      } catch (err) {
        Common.printError(cst.PREFIX_MSG_ERR + 'Could not create folder: ' + path.dirname(resolvedPath));
        throw new Error('Could not create folder');
      }
    }
    return { path: ps, resolved: resolvedPath };
  }

  return { path: null, resolved: resolvedPath };
}

// Helper: Set log file paths
function setLogFilePaths(app, cwd, formattedName) {
  const fileTypes = ['log', 'out', 'error', 'pid'];

  fileTypes.forEach(fileType => {
    const result = resolveLogFilePath(app, cwd, formattedName, fileType, true);
    const ext = fileType === 'pid' ? 'pid' : 'log';
    const isStd = !~['log', 'pid'].indexOf(fileType);
    const af = app[fileType + '_file'];

    if (af !== 'NULL' && af !== '/dev/null') {
      if (result.path) {
        app['pm_' + (isStd ? fileType.substr(0, 3) + '_' : '') + ext + '_path'] = 
          path.resolve.apply(null, result.path);
      }
    } else if (path.sep === '\\') {
      app['pm_' + (isStd ? fileType.substr(0, 3) + '_' : '') + ext + '_path'] = '\\\\.\\NUL';
    } else {
      app['pm_' + (isStd ? fileType.substr(0, 3) + '_' : '') + ext + '_path'] = '/dev/null';
    }
    delete app[fileType + '_file'];
  });
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
  const scriptError = validateAppScript(app);
  if (scriptError) return scriptError;

  const cwd = resolveWorkingDirectory(app, opts);
  
  initializeNodeArgs(app);
  setPortInEnv(app);

  const scriptError2 = resolveScriptPath(app, cwd);
  if (scriptError2) return scriptError2;

  handleSourceMapSupport(app);
  delete app.script;

  prepareEnvironmentVariables(app, cwd);
  app.pm_cwd = cwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch(e) {
    return e;
  }

  Common.sink.determineExecMode(app);

  const formattedAppName = formatApplicationName(app.name);
  setLogFilePaths(app, cwd, formattedAppName);

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

  if (!filename ||
      filename === 'pipe' ||
      filename === 'none' ||
      isConfigFile === 'json') {
    const code = '(' + confObj + ')';
    const sandbox = {};

    return vm.runInThisContext(code, sandbox, {
      filename: path.resolve(filename),
      displayErrors: false,
      timeout: 1000
    });
  }
  else if (isConfigFile === 'yaml') {
    return yamljs.load(confObj.toString());
  }
  else if (isConfigFile === 'js' || isConfigFile === 'mjs') {
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

  if (app.cron_restart) {
    const Croner = require('croner');

    try {
      Common.printOut(cst.PREFIX_MSG + 'cron restart at ' + app.cron_restart);
      Croner(app.cron_restart);
    } catch(ex) {
      return new Error(`Cron pattern error: ${ex.message}`);
    }
  }
};

/**
 * Handle alias (fork <=> fork_mode, cluster <=> cluster_mode)
 */
Common.sink.determineExecMode = function(app) {
  if (app.exec_mode)
    app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');

  if (!app.exec_mode &&
      (app.instances >= 1 || app.instances === 0 || app.instances === -1) &&
      (app.exec_interpreter.includes('node') === true || app.exec_interpreter.includes('bun') === true)) {
    app.exec_mode = 'cluster_mode';
  } else if (!app.exec_mode) {
    app.exec_mode = 'fork_mode';
  }
  if (typeof app.instances === 'undefined')
    app.instances = 1;
};

// Helper: Get NVM path
function getNvmPath() {
  return cst.IS_WINDOWS ? process.env.NVM_HOME : process.env.NVM_DIR;
}

// Helper: Get node path from NVM
function getNodePathFromNvm(nodeVersion) {
  if (cst.IS_WINDOWS) {
    return '/v' + nodeVersion + '/node.exe';
  }
  return semver.satisfies(nodeVersion, '>= 0.12.0')
    ? '/versions/node/v' + nodeVersion + '/bin/node'
    : '/v' + nodeVersion + '/bin/node';
}

// Helper: Get NVM command
function getNvmCommand(nvmPath, nodeVersion) {
  const nvmBin = path.join(nvmPath, 'nvm.' + (cst.IS_WINDOWS ? 'exe' : 'sh'));
  if (cst.IS_WINDOWS) {
    return nvmBin + ' install ' + nodeVersion;
  }
  return '. ' + nvmBin + ' ; nvm install ' + nodeVersion;
}

// Helper: Install Node version via NVM
function installNodeViaNvm(nvmPath, nodeVersion) {
  const nvmCmd = getNvmCommand(nvmPath, nodeVersion);
  Common.printOut(cst.PREFIX_MSG + 'Executing: %s', nvmCmd);

  execSync(nvmCmd, {
    cwd: path.resolve(process.cwd()),
    env: process.env,
    maxBuffer: 20 * 1024 * 1024
  });
}

// Helper: Adjust node path for Windows architecture
function adjustNodePathForWindows(nvmNodePath) {
  if (cst.IS_WINDOWS)
    return nvmNodePath.replace(/node/, 'node' + process.arch.slice(1));
  return nvmNodePath;
}

// Helper: Resolve Node interpreter with NVM
function resolveNodeInterpreter(app) {
  if (app.exec_mode && app.exec_mode.indexOf('cluster') > -1) {
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
  const pathToNode = getNodePathFromNvm(nodeVersion);
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
}

// Helper: Resolve Python interpreter
function resolvePythonInterpreter(app) {
  if (which('python') === null) {
    if (which('python3') === null) {
      Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('python and python3 binaries not available in PATH'));
    } else {
      app.exec_interpreter = 'python3';
    }
  }
}

// Helper: Resolve interpreter from extension
function resolveInterpreterFromExtension(app, extName, betterInterpreter) {
  if (betterInterpreter) {
    app.exec_interpreter = betterInterpreter;
    if (betterInterpreter === "python") {
      resolvePythonInterpreter(app);
    }
  } else {
    app.exec_interpreter = isBinary(app.pm_exec_path) ? 'none' : process.execPath;
  }
}

// Helper: Handle special interpreters
function handleSpecialInterpreters(app) {
  if (app.exec_interpreter === 'lsc') {
    app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/lsc');
  }

  if (app.exec_interpreter === 'coffee') {
    app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/coffee');
  }
}

// Helper: Validate interpreter availability
function validateInterpreterAvailability(app) {
  if (app.exec_interpreter !== 'none' && which(app.exec_interpreter) === null) {
    if (app.exec_interpreter === 'node') {
      Common.warn(`Using builtin node.js version on version ${process.version}`);
      app.exec_interpreter = cst.BUILTIN_NODE_PATH;
    } else {
      throw new Error(`Interpreter ${app.exec_interpreter} is NOT AVAILABLE in PATH. (type 'which ${app.exec_interpreter}' to double check.)`);
    }
  }
}

/**
 * Resolve interpreter
 */
Common.sink.resolveInterpreter = function(app) {
  const noInterpreter = !app.exec_interpreter;
  const extName = path.extname(app.pm_exec_path);
  const betterInterpreter = extItps[extName];

  // Bun support
  if (noInterpreter && (extName === '.js' || extName === '.ts') && cst.IS_BUN === true) {
    app.exec_interpreter = process.execPath;
  } else if (noInterpreter) {
    resolveInterpreterFromExtension(app, extName, betterInterpreter);
  } else if (app.exec_interpreter.indexOf('node@') > -1) {
    resolveNodeInterpreter(app);
  }

  if (app.exec_interpreter.indexOf('python') > -1)
    app.env.PYTHONUNBUFFERED = '1';

  handleSpecialInterpreters(app);
  validateInterpreterAvailability(app);

  return app;
};

Common.deepCopy = Common.serialize = Common.clone = function(obj) {
  if (obj === null || obj === undefined) return {};
  return fclone(obj);
};

Common.errMod = function(msg) {
  if (isSilentModeEnabled()) return false;
  if (msg instanceof Error)
    return console.error(msg.message);
  return console.error(`${cst.PREFIX_MSG_MOD_ERR}${msg}`);
};

Common.err = function(msg) {
  if (isSilentModeEnabled()) return false;
  if (msg instanceof Error)
    return console.error(`${cst.PREFIX_MSG_ERR}${msg.message}`);
  return console.error(`${cst.PREFIX_MSG_ERR}${msg}`);
};

Common.printError = function(msg) {
  if (isSilentModeEnabled()) return false;
  if (msg instanceof Error)
    return console.error(msg.message);
  return console.error.apply(console, arguments);
};

Common.log = function(msg) {
  if (isSilentModeEnabled()) return false;
  return console.log(`${cst.PREFIX_MSG}${msg}`);
};

Common.info = function(msg) {
  if (isSilentModeEnabled()) return false;
  return console.log(`${cst.PREFIX_MSG_INFO}${msg}`);
};

Common.warn = function(msg) {
  if (isSilentModeEnabled()) return false;
  return console.log(`${cst.PREFIX_MSG_WARNING}${msg}`);
};

Common.logMod = function(msg) {
  if (isSilentModeEnabled()) return false;
  return console.log(`${cst.PREFIX_MSG_MOD}${msg}`);
};

Common.printOut = function() {
  if (isSilentModeEnabled()) return false;
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

  Object.keys(source).forEach(function(newKey) {
    if (source[newKey] !== '[object Object]')
      destination[newKey] = source[newKey];
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

// Helper: Stringify object values in environment
function stringifyEnvObjects(env) {
  for (const key in env) {
    if (typeof env[key] === 'object') {
      env[key] = JSON.stringify(env[key]);
    }
  }
}

// Helper: Merge deploy environment variables
function mergeDeployEnv(newConf, deployConf, envName) {
  if (deployConf && deployConf[envName] && deployConf[envName]['env']) {
    Object.assign(newConf.env, deployConf[envName]['env']);
  }
}

// Helper: Merge app-specific environment variables
function mergeAppEnv(newConf, app, envName) {
  Object.assign(newConf.env, app.env);

  if ('env_' + envName in app) {
    Object.assign(newConf.env, app['env_' + envName]);
  } else {
    Common.printOut(cst.PREFIX_MSG_WARNING + chalk.bold('Environment [%s] is not defined in process file'), envName);
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
Common.mergeEnvironmentVariables = function(appEnv, envName, deployConf) {
  const app = fclone(appEnv);

  const newConf = {
    env : {}
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

  // #2541 force resolution of node interpreter
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
  const confCopy = fclone(conf);

  const app = Common.prepareAppConf(opts, confCopy);
  if (app instanceof Error) {
    throw new Error(app.message);
  }
  return app;
};

// Helper: Normalize exec mode
function normalizeExecMode(app) {
  if (app.exec_mode)
    app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');
}

// Helper: Normalize script property
function normalizeScriptProperty(app) {
  if (app.cmd && !app.script) {
    app.script = app.cmd;
    delete app.cmd;
  }
  if (app.command && !app.script) {
    app.script = app.command;
    delete app.command;
  }
}

// Helper: Initialize environment
function initializeEnvironment(app) {
  if (!app.env) {
    app.env = {};
  }
}

// Helper: Handle execute command flag
function handleExecuteCommand(app) {
  if (app.execute_command === true) {
    app.exec_mode = 'fork';
    delete app.execute_command;
  }
}

// Helper: Handle script with spaces
function handleScriptWithSpaces(app) {
  if (app.script && app.script.indexOf(' ') > -1 && cst.IS_WINDOWS === false) {
    const script = app.script;

    if (which('bash')) {
      app.script = 'bash';
      app.args = ['-c', script];
      if (!app.name) {
        app.name = script;
      }
    } else if (which('sh')) {
      app.script = 'sh';
      app.args = ['-c', script];
      if (!app.name) {
        app.name = script;
      }
    } else {
      Common.warn('bash or sh not available in $PATH, keeping script as is');
    }
  }
}

// Helper: Add log date format
function addLogDateFormat(app) {
  if (app.time || process.env.ASZ_MODE) {
    app.log_date_format = 'YYYY-MM-DDTHH:mm:ss';
  }
}

// Helper: Validate Windows restrictions
function validateWindowsRestrictions(app) {
  if (app.uid || app.gid || app.user) {
    if (cst.IS_WINDOWS === true) {
      Common.printError(cst.PREFIX_MSG_ERR + '--uid and --git does not works on windows');
      return new Error('--uid and --git does not works on windows');
    }
  }
  return null;
}

// Helper: Validate root privileges
function validateRootPrivileges(app) {
  if ((app.uid || app.gid || app.user) && process.env.NODE_ENV !== 'test' && process.getuid && process.getuid() !== 0) {
    Common.printError(cst.PREFIX_MSG_ERR + 'To use --uid and --gid please run pm2 as root');
    return new Error('To use UID and GID please run PM2 as root');
  }
  return null;
}

// Helper: Resolve user information
function resolveUserInfo(app) {
  const passwd = require('./tools/passwd.js');
  let users;
  try {
    users = passwd.getUsers();
  } catch(e) {
    Common.printError(e);
    return new Error(e);
  }

  const userInfo = users[app.uid || app.user];
  if (!userInfo) {
    Common.printError(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
    return new Error(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
  }

  app.env.HOME = userInfo.homedir;
  app.uid = parseInt(userInfo.userId);
  return null;
}

// Helper: Resolve group information
function resolveGroupInfo(app) {
  const passwd = require('./tools/passwd.js');
  let groups;
  try {
    groups = passwd.getGroups();
  } catch(e) {
    Common.printError(e);
    return new Error(e);
  }

  const groupInfo = groups[app.gid];
  if (!groupInfo) {
    Common.printError(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
    return new Error(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
  }

  app.gid = parseInt(groupInfo.id);
  return null;
}

// Helper: Handle UID/GID configuration
function handleUidGidConfig(app) {
  if (!app.uid && !app.gid && !app.user) {
    return null;
  }

  const windowsError = validateWindowsRestrictions(app);
  if (windowsError) return windowsError;

  const rootError = validateRootPrivileges(app);
  if (rootError) return rootError;

  const userError = resolveUserInfo(app);
  if (userError) return userError;

  if (app.gid) {
    const groupError = resolveGroupInfo(app);
    if (groupError) return groupError;
  } else {
    const passwd = require('./tools/passwd.js');
    const users = passwd.getUsers();
    const userInfo = users[app.uid || app.user];
    app.gid = parseInt(userInfo.groupId);
  }

  return null;
}

// Helper: Handle deep monitoring
function handleDeepMonitoring(app) {
  if (process.env.PM2_DEEP_MONITORING) {
    app.deep_monitoring = true;
  }
}

// Helper: Handle automation flag
function handleAutomationFlag(app) {
  if (app.automation === false) {
    app.pmx = false;
  }
}

// Helper: Handle trace flag
function handleTraceFlag(app) {
  if (app.disable_trace) {
    app.trace = false;
    delete app.disable_trace;
  }
}

// Helper: Normalize instances
function normalizeInstances(app) {
  if (app.instances === 'max') {
    app.instances = 0;
  }

  if (typeof(app.instances) === 'string') {
    app.instances = parseInt(app.instances) || 0;
  }

  if (app.exec_mode !== 'cluster_mode' &&
      !app.instances &&
      typeof(app.merge_logs) === 'undefined') {
    app.merge_logs = true;
  }
}

// Helper: Validate cron restart
function validateCronRestart(app) {
  if (app.cron_restart) {
    const ret = Common.sink.determineCron(app);
    if (ret instanceof Error)
      return ret;
  }
  return null;
}

// Helper: Validate configuration
function validateConfiguration(app) {
  const ret = Config.validateJSON(app);
  if (ret.errors && ret.errors.length > 0) {
    ret.errors.forEach(function(err) { Common.warn(err); });
    return new Error(ret.errors);
  }
  return ret.config;
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

    normalizeExecMode(app);
    normalizeScriptProperty(app);
    initializeEnvironment(app);
    Common.renderApplicationName(app);
    handleExecuteCommand(app);

    app.username = Common.getCurrentUsername();

    handleScriptWithSpaces(app);
    addLogDateFormat(app);

    const uidGidError = handleUidGidConfig(app);
    if (uidGidError) return uidGidError;

    handleDeepMonitoring(app);
    handleAutomationFlag(app);
    handleTraceFlag(app);
    normalizeInstances(app);

    const cronError = validateCronRestart(app);
    if (cronError) return cronError;

    const validatedConfig = validateConfiguration(app);
    if (validatedConfig instanceof Error) return validatedConfig;

    verifiedConf.push(validatedConfig);
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

  if(currentUser === '') {
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
```