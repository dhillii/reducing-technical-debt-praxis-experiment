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
 * Build log file path configuration
 * @param {string} fileType
 * @param {string} cwd
 * @param {string} formattedAppName
 * @returns {Object}
 */
function buildLogFilePath(fileType, cwd, formattedAppName) {
  const isStd = !~['log', 'pid'].indexOf(fileType);
  const ext = fileType === 'pid' ? 'pid' : 'log';

  return {
    isStd,
    ext,
    defaultPath: cst['DEFAULT_' + ext.toUpperCase() + '_PATH'],
    suffix: isStd ? '-' + fileType : '',
    extension: ext
  };
}

/**
 * Resolve log file path
 * @param {string} af
 * @param {string} cwd
 * @param {Object} pathConfig
 * @returns {string|null}
 */
function resolveLogFilePath(af, cwd, pathConfig) {
  if (!af) {
    return null;
  }

  if (af === 'NULL' || af === '/dev/null') {
    return null;
  }

  return path.resolve(cwd, af);
}

/**
 * Get final log file path
 * @param {string} af
 * @param {string} cwd
 * @param {string} formattedAppName
 * @param {Object} pathConfig
 * @returns {string}
 */
function getFinalLogPath(af, cwd, formattedAppName, pathConfig) {
  if (af === 'NULL' || af === '/dev/null') {
    return path.sep === '\\' ? '\\\\.\\NUL' : '/dev/null';
  }

  const resolvedPath = resolveLogFilePath(af, cwd, pathConfig);
  if (resolvedPath) {
    return resolvedPath;
  }

  const ps = [pathConfig.defaultPath, formattedAppName + pathConfig.suffix + '.' + pathConfig.extension];
  return path.resolve.apply(null, ps);
}

/**
 * Ensure log directory exists
 * @param {string} af
 * @param {string} cwd
 * @throws {Error}
 */
function ensureLogDirectory(af, cwd) {
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
    const pathResolved = resolveScriptFromPath(app.script);
    if (pathResolved) {
      app.pm_exec_path = pathResolved;
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

  if (cst.PM2_PROGRAMMATIC || process.env.pm_id) {
    Common.safeExtend(env, process.env);
  } else {
    env = process.env;
  }

  const hasFilterEnv = app.filter_env && app.filter_env.length > 0;
  const baseEnv = hasFilterEnv ? filterEnvironment(process.env, app.filter_env) : env;

  app.env = [
    {}, baseEnv, app.env || {}
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

  const formattedAppName = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');

  ['log', 'out', 'error', 'pid'].forEach(function(f) {
    const af = app[f + '_file'];
    const pathConfig = buildLogFilePath(f, cwd, formattedAppName);
    const resolvedAf = af ? resolveHome(af) : null;

    if ((f === 'log' && typeof resolvedAf === 'boolean' && resolvedAf) || (f !== 'log' && !resolvedAf)) {
      const ps = [pathConfig.defaultPath, formattedAppName + pathConfig.suffix + '.' + pathConfig.extension];
      const finalPath = path.resolve.apply(null, ps);
      app['pm_' + (pathConfig.isStd ? f.substr(0, 3) + '_' : '') + pathConfig.ext + '_path'] = finalPath;
    } else if (f !== 'log' || (f === 'log' && resolvedAf)) {
      if (resolvedAf !== 'NULL' && resolvedAf !== '/dev/null') {
        ensureLogDirectory(resolvedAf, cwd);
        const finalPath = getFinalLogPath(resolvedAf, cwd, formattedAppName, pathConfig);
        app['pm_' + (pathConfig.isStd ? f.substr(0, 3) + '_' : '') + pathConfig.ext + '_path'] = finalPath;
      } else {
        const nullPath = path.sep === '\\' ? '\\\\.\\NUL' : '/dev/null';
        app['pm_' + (pathConfig.isStd ? f.substr(0, 3) + '_' : '') + pathConfig.ext + '_path'] = nullPath;
      }
    } else {
      const nullPath = path.sep === '\\' ? '\\\\.\\NUL' : '/dev/null';
      app['pm_' + (pathConfig.isStd ? f.substr(0, 3) + '_' : '') + pathConfig.ext + '_path'] = nullPath;
    }

    delete app[f + '_file'];
  });

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
 * Check if cluster mode is requested
 * @param {Object} app
 * @returns {boolean}
 */
function shouldUseClusterMode(app) {
  return (app.instances >= 1 || app.instances === 0 || app.instances === -1) &&
         (app.exec_interpreter.includes('node') === true || app.exec_interpreter.includes('bun') === true);
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
 * Check if cluster mode is active
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
 * Get NVM command to install node version
 * @param {string} nvmBin
 * @param {string} nodeVersion
 * @returns {string}
 */
function getNvmInstallCommand(nvmBin, nodeVersion) {
  if (cst.IS_WINDOWS) {
    return nvmBin + ' install ' + nodeVersion;
  }

  return '. ' + nvmBin + ' ; nvm install ' + nodeVersion;
}

/**
 * Adjust NVM node path for Windows architecture
 * @param {string} nvmNodePath
 * @returns {string}
 */
function adjustNvmPathForWindows(nvmNodePath) {
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
    Common.printOut(cst.PREFIX_MSG + 'Installing Node v%s', nodeVersion);
    const nvmBin = path.join(nvmPath, 'nvm.' + (cst.IS_WINDOWS ? 'exe' : 'sh'));
    const nvmCmd = getNvmInstallCommand(nvmBin, nodeVersion);

    Common.printOut(cst.PREFIX_MSG + 'Executing: %s', nvmCmd);

    execSync(nvmCmd, {
      cwd: path.resolve(process.cwd()),
      env: process.env,
      maxBuffer: 20 * 1024 * 1024
    });

    nvmNodePath = adjustNvmPathForWindows(nvmNodePath);
  }

  Common.printOut(cst.PREFIX_MSG + chalk.green.bold('Setting Node to v%s (path=%s)'),
                  nodeVersion,
                  nvmNodePath);

  app.exec_interpreter = nvmNodePath;
};

/**
 * Check if interpreter is node with version specifier
 * @param {Object} app
 * @returns {boolean}
 */
function isNodeVersionSpecified(app) {
  return app.exec_interpreter && app.exec_interpreter.indexOf('node@') > -1;
}

/**
 * Check if interpreter is python
 * @param {Object} app
 * @returns {boolean}
 */
function isPythonInterpreter(app) {
  return app.exec_interpreter && app.exec_interpreter.indexOf('python') > -1;
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

    if (betterInterpreter === 'python') {
      resolvePythonInterpreter(app);
    }
  } else if (noInterpreter) {
    app.exec_interpreter = isBinary(app.pm_exec_path) ? 'none' : process.execPath;
  } else if (isNodeVersionSpecified(app)) {
    resolveNodeInterpreter(app);
  }

  if (isPythonInterpreter(app)) {
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
Common.safeExtend = function(origin, add) {
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
function stringifyEnvObjects(env) {
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
 * @param {Object} app_env The app object.
 * @param {string} env_name The given environment name.
 * @param {Object} deploy_conf Deployment configuration object (from JSON file or whatever).
 * @returns {Object} The app.env variables object.
 */
Common.mergeEnvironmentVariables = function(app_env, env_name, deploy_conf) {
  const app = fclone(app_env);

  const newConf = {
    env: {}
  };

  stringifyEnvObjects(app.env);
  Object.assign(newConf, app);

  if (!env_name) {
    const res = {
      current_conf: {}
    };
    Object.assign(res, newConf.env);
    Object.assign(res.current_conf, newConf);
    return res;
  }

  if (deploy_conf && deploy_conf[env_name] && deploy_conf[env_name]['env']) {
    Object.assign(newConf.env, deploy_conf[env_name]['env']);
  }

  Object.assign(newConf.env, app.env);

  if (isEnvironmentDefined(app, env_name)) {
    Object.assign(newConf.env, app['env_' + env_name]);
  } else {
    Common.printOut(cst.PREFIX_MSG_WARNING + chalk.bold('Environment [%s] is not defined in process file'), env_name);
  }

  delete newConf.exec_mode;

  const res = {
    current_conf: {}
  };

  Object.assign(res, newConf.env);
  Object.assign(res.current_conf, newConf);

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

/**
 * Check if app has script with spaces on non-Windows
 * @param {Object} app
 * @returns {boolean}
 */
function hasScriptWithSpaces(app) {
  return app.script && app.script.indexOf(' ') > -1 && cst.IS_WINDOWS === false;
}

/**
 * Resolve script with spaces using shell
 * @param {Object} app
 */
function resolveScriptWithSpaces(app) {
  const script = app.script;

  if (which('bash')) {
    app.script = 'bash';
    app.args = ['-c', script];
    if (!app.name) {
      app.name = script;
    }
    return;
  }

  if (which('sh')) {
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
 * Resolve user information
 * @param {Object} app
 * @param {Object} users
 * @returns {Error|null}
 */
function resolveUserInfo(app, users) {
  const userInfo = users[app.uid || app.user];
  if (!userInfo) {
    Common.printError(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
    return new Error(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
  }

  app.env.HOME = userInfo.homedir;
  app.uid = parseInt(userInfo.userId);

  return null;
}

/**
 * Resolve group information
 * @param {Object} app
 * @param {Object} groups
 * @param {Object} userInfo
 * @returns {Error|null}
 */
function resolveGroupInfo(app, groups, userInfo) {
  if (!app.gid) {
    app.gid = parseInt(userInfo.groupId);
    return null;
  }

  const groupInfo = groups[app.gid];
  if (!groupInfo) {
    Common.printError(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
    return new Error(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
  }

  app.gid = parseInt(groupInfo.id);
  return null;
}

/**
 * Process UID/GID configuration
 * @param {Object} app
 * @returns {Error|null}
 */
function processUidGidConfig(app) {
  const prereqError = validateUidGidPrerequisites(app);
  if (prereqError) {
    return prereqError;
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
  if (userError) {
    return userError;
  }

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
 * Check if cron restart is configured
 * @param {Object} app
 * @returns {boolean}
 */
function hasCronRestart(app) {
  return app.cron_restart;
}

/**
 * Check if instances should use merge_logs
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

    if (hasScriptWithSpaces(app)) {
      resolveScriptWithSpaces(app);
    }

    if (app.time || process.env.ASZ_MODE) {
      app.log_date_format = 'YYYY-MM-DDTHH:mm:ss';
    }

    if (hasUidGidConfig(app)) {
      const uidGidError = processUidGidConfig(app);
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

    if (app.instances === 'max') {
      app.instances = 0;
    }

    if (typeof app.instances === 'string') {
      app.instances = parseInt(app.instances) || 0;
    }

    if (shouldMergeLogs(app)) {
      app.merge_logs = true;
    }

    if (hasCronRestart(app)) {
      const cronError = Common.sink.determineCron(app);
      if (cronError instanceof Error) {
        return cronError;
      }
    }

    const validationResult = Config.validateJSON(app);
    if (validationResult.errors && validationResult.errors.length > 0) {
      validationResult.errors.forEach(function(err) {
        warn(err);
      });
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
Common.getCurrentUsername = function() {
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