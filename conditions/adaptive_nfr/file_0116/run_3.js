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
 * Check if silent flag is set before variadic args separator
 */
function isSilentFlagSet() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const s1opt = process.argv.indexOf('--silent');
  const s2opt = process.argv.indexOf('-s');
  
  if (variadicArgsDashesPos > -1) {
    const s1Valid = s1opt !== -1 && s1opt < variadicArgsDashesPos;
    const s2Valid = s2opt !== -1 && s2opt < variadicArgsDashesPos;
    return s1Valid && s2Valid;
  }
  
  return s1opt > -1 || s2opt > -1;
}

Common.determineSilentCLI = function() {
  if (process.env.PM2_SILENT || isSilentFlagSet()) {
    for (const key in console) {
      const code = key.charCodeAt(0);
      if (code >= 97 && code <= 122) {
        console[key] = function(){};
      }
    }
    process.env.PM2_DISCRETE_MODE = true;
  }
}

Common.printVersion = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const vIndex = process.argv.indexOf('-v');

  if (vIndex > -1 && vIndex < variadicArgsDashesPos) {
    console.log(pkg.version);
    process.exit(0);
  }
}

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

/**
 * Resolve app paths and replace missing values with defaults.
 * @method prepareAppConf
 * @param app {Object}
 * @param {} cwd
 * @param {} outputter
 * @return app
 */

/**
 * Check if script path is missing
 */
function isScriptMissing(app) {
  return !app.script;
}

/**
 * Resolve CWD path
 */
function resolveCwdPath(cwd) {
  if (!cwd) return cwd;
  if (cwd[0] !== '/') {
    return path.resolve(process.cwd(), cwd);
  }
  return cwd;
}

/**
 * Check if resolved script path exists
 */
function scriptPathExists(scriptPath) {
  return fs.existsSync(scriptPath);
}

/**
 * Try to resolve script from PATH
 */
function resolveScriptFromPath(script) {
  const resolved = which(script);
  if (!resolved) return null;
  return typeof resolved === 'string' ? resolved : resolved.toString();
}

/**
 * Check if source map file exists
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
 * Filter environment variables based on filter_env config
 */
function filterEnv(envObj, filterConfig) {
  if (filterConfig === true) {
    return {};
  }

  if (typeof filterConfig === 'string') {
    const filtered = Object.assign({}, envObj);
    delete filtered[filterConfig];
    return filtered;
  }

  const newEnv = {};
  const allowedKeys = Object.keys(envObj).filter(item => 
    !filterConfig.some(current => item.includes(current))
  );
  allowedKeys.forEach(key => newEnv[key] = envObj[key]);
  return newEnv;
}

/**
 * Determine if should use programmatic env
 */
function shouldUseProgrammaticEnv() {
  return cst.PM2_PROGRAMMATIC || process.env.pm_id;
}

/**
 * Build environment object for app
 */
function buildAppEnv(app, opts) {
  let env = {};

  if (shouldUseProgrammaticEnv()) {
    Common.safeExtend(env, process.env);
  } else {
    env = process.env;
  }

  const baseEnv = app.filter_env && app.filter_env.length > 0 
    ? filterEnv(process.env, app.filter_env)
    : env;

  return [
    {},
    baseEnv,
    app.env || {}
  ].reduce((e1, e2) => Object.assign(e1, e2));
}

/**
 * Format app name for file paths
 */
function formatAppName(name) {
  return name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');
}

/**
 * Determine log file path configuration
 */
function determineLogFilePath(f, af, cwd, formatedAppName) {
  const ext = f === 'pid' ? 'pid' : 'log';
  const isStd = !['log', 'pid'].includes(f);

  if ((f === 'log' && typeof af === 'boolean' && af) || (f !== 'log' && !af)) {
    return [cst['DEFAULT_' + ext.toUpperCase() + '_PATH'], formatedAppName + (isStd ? '-' + f : '') + '.' + ext];
  }

  if ((f !== 'log' || (f === 'log' && af)) && af !== 'NULL' && af !== '/dev/null') {
    return [cwd, af];
  }

  return null;
}

/**
 * Create directory if it doesn't exist
 */
function ensureDirectoryExists(dir) {
  if (fs.existsSync(dir)) {
    return true;
  }

  Common.printError(cst.PREFIX_MSG_WARNING + 'Folder does not exist: ' + dir);
  Common.printOut(cst.PREFIX_MSG + 'Creating folder: ' + dir);
  
  try {
    require('mkdirp').sync(dir);
    return true;
  } catch (err) {
    Common.printError(cst.PREFIX_MSG_ERR + 'Could not create folder: ' + dir);
    throw new Error('Could not create folder');
  }
}

/**
 * Set log file path on app config
 */
function setLogFilePath(app, f, ps, af, isStd, ext) {
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

Common.prepareAppConf = function(opts, app) {
  if (isScriptMissing(app)) {
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

  cwd = resolveCwdPath(cwd);
  cwd = cwd || opts.cwd;

  app.pm_exec_path = path.resolve(cwd, app.script);

  if (!scriptPathExists(app.pm_exec_path)) {
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

  app.env = buildAppEnv(app, opts);

  app.pm_cwd = cwd;
  
  try {
    Common.sink.resolveInterpreter(app);
  } catch(e) {
    return e;
  }

  Common.sink.determineExecMode(app);

  const formated_app_name = formatAppName(app.name);

  ['log', 'out', 'error', 'pid'].forEach(function(f) {
    let af = app[f + '_file'];
    const ext = f === 'pid' ? 'pid' : 'log';
    const isStd = !['log', 'pid'].includes(f);
    
    if (af) {
      af = resolveHome(af);
    }

    const ps = determineLogFilePath(f, af, cwd, formated_app_name);
    
    if (ps && f !== 'log' && af !== 'NULL' && af !== '/dev/null') {
      const dir = path.dirname(path.resolve(cwd, af));
      ensureDirectoryExists(dir);
    }

    setLogFilePath(app, f, ps, af, isStd, ext);
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
}

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
}

/**
 * Check if config is JSON format
 */
function isJsonConfig(filename, isConfigFile) {
  return !filename || filename === 'pipe' || filename === 'none' || isConfigFile === 'json';
}

/**
 * Check if config is YAML format
 */
function isYamlConfig(isConfigFile) {
  return isConfigFile === 'yaml';
}

/**
 * Check if config is JS/MJS format
 */
function isJsConfig(isConfigFile) {
  return isConfigFile === 'js' || isConfigFile === 'mjs';
}

/**
 * Parse JSON config
 */
function parseJsonConfig(confObj, filename) {
  const vm = require('vm');
  const code = '(' + confObj + ')';
  const sandbox = {};

  return vm.runInThisContext(code, sandbox, {
    filename: path.resolve(filename),
    displayErrors: false,
    timeout: 1000
  });
}

/**
 * Parse YAML config
 */
function parseYamlConfig(confObj) {
  const yamljs = require('js-yaml');
  return yamljs.load(confObj.toString());
}

/**
 * Parse JS/MJS config
 */
function parseJsConfig(filename) {
  const confPath = require.resolve(path.resolve(filename));
  delete require.cache[confPath];
  return require(confPath);
}

/**
 * Parses a config file like ecosystem.config.js. Supported formats: JS, JSON, JSON5, YAML.
 * @param {string} confString  contents of the config file
 * @param {string} filename    path to the config file
 * @return {Object} config object
 */
Common.parseConfig = function(confObj, filename) {
  const configType = Common.isConfigFile(filename);

  if (isJsonConfig(filename, configType)) {
    return parseJsonConfig(confObj, filename);
  }
  
  if (isYamlConfig(configType)) {
    return parseYamlConfig(confObj);
  }
  
  if (isJsConfig(configType)) {
    return parseJsConfig(filename);
  }
};

Common.retErr = function(e) {
  if (!e)
    return new Error('Unidentified error');
  if (e instanceof Error)
    return e;
  return new Error(e);
}

Common.sink = {};

/**
 * Check if cron restart is disabled
 */
function isCronDisabled(cronRestart) {
  return cronRestart === 0 || cronRestart === '0';
}

/**
 * Validate cron pattern
 */
function validateCronPattern(pattern) {
  const Croner = require('croner');
  try {
    Croner(pattern);
    return null;
  } catch(ex) {
    return new Error(`Cron pattern error: ${ex.message}`);
  }
}

Common.sink.determineCron = function(app) {
  if (isCronDisabled(app.cron_restart)) {
    Common.printOut(cst.PREFIX_MSG + 'disabling cron restart');
    return;
  }

  if (app.cron_restart) {
    Common.printOut(cst.PREFIX_MSG + 'cron restart at ' + app.cron_restart);
    const error = validateCronPattern(app.cron_restart);
    if (error) {
      return error;
    }
  }
};

/**
 * Check if interpreter is node or bun
 */
function isNodeOrBunInterpreter(interpreter) {
  return interpreter.includes('node') === true || interpreter.includes('bun') === true;
}

/**
 * Check if should use cluster mode
 */
function shouldUseClusterMode(app) {
  return !app.exec_mode &&
    (app.instances >= 1 || app.instances === 0 || app.instances === -1) &&
    isNodeOrBunInterpreter(app.exec_interpreter);
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
 * Check if cluster mode is used
 */
function isClusterMode(execMode) {
  return execMode && execMode.indexOf('cluster') > -1;
}

/**
 * Get NVM path based on platform
 */
function getNvmPath() {
  return cst.IS_WINDOWS ? process.env.NVM_HOME : process.env.NVM_DIR;
}

/**
 * Print NVM not available message
 */
function printNvmNotAvailable() {
  Common.printError(cst.PREFIX_MSG_ERR + chalk.red('NVM is not available in PATH'));
  Common.printError(cst.PREFIX_MSG_ERR + chalk.red('Fallback to node in PATH'));
  const msg = cst.IS_WINDOWS
    ? 'https://github.com/coreybutler/nvm-windows/releases/'
    : '$ curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash';
  Common.printOut(cst.PREFIX_MSG_ERR + chalk.bold('Install NVM:\n' + msg));
}

/**
 * Get path to node binary in NVM
 */
function getNvmNodePath(nodeVersion) {
  return cst.IS_WINDOWS
    ? '/v' + nodeVersion + '/node.exe'
    : semver.satisfies(nodeVersion, '>= 0.12.0')
      ? '/versions/node/v' + nodeVersion + '/bin/node'
      : '/v' + nodeVersion + '/bin/node';
}

/**
 * Check if node version is installed in NVM
 */
function nvmNodeExists(nvmPath, nodeVersion) {
  const pathToNode = getNvmNodePath(nodeVersion);
  const nvmNodePath = path.join(nvmPath, pathToNode);
  try {
    fs.accessSync(nvmNodePath);
    return true;
  } catch(e) {
    return false;
  }
}

/**
 * Install node version via NVM
 */
function installNodeViaNvm(nvmPath, nodeVersion) {
  const nvm_bin = path.join(nvmPath, 'nvm.' + (cst.IS_WINDOWS ? 'exe' : 'sh'));
  const nvm_cmd = cst.IS_WINDOWS
    ? nvm_bin + ' install ' + nodeVersion
    : '. ' + nvm_bin + ' ; nvm install ' + nodeVersion;

  Common.printOut(cst.PREFIX_MSG + 'Executing: %s', nvm_cmd);

  execSync(nvm_cmd, {
    cwd: path.resolve(process.cwd()),
    env: process.env,
    maxBuffer: 20 * 1024 * 1024
  });
}

/**
 * Get final NVM node path after installation
 */
function getFinalNvmNodePath(nvmPath, nodeVersion) {
  let pathToNode = getNvmNodePath(nodeVersion);
  let nvmNodePath = path.join(nvmPath, pathToNode);

  if (cst.IS_WINDOWS) {
    nvmNodePath = nvmNodePath.replace(/node/, 'node' + process.arch.slice(1));
  }

  return nvmNodePath;
}

const resolveNodeInterpreter = function(app) {
  if (isClusterMode(app.exec_mode)) {
    Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('Choosing the Node.js version in cluster mode is not supported'));
    return false;
  }

  const nvm_path = getNvmPath();
  if (!nvm_path) {
    printNvmNotAvailable();
    return;
  }

  const node_version = app.exec_interpreter.split('@')[1];
  
  if (!nvmNodeExists(nvm_path, node_version)) {
    Common.printOut(cst.PREFIX_MSG + 'Installing Node v%s', node_version);
    installNodeViaNvm(nvm_path, node_version);
  }

  const nvm_node_path = getFinalNvmNodePath(nvm_path, node_version);
  Common.printOut(cst.PREFIX_MSG + chalk.green.bold('Setting Node to v%s (path=%s)'),
                  node_version,
                  nvm_node_path);

  app.exec_interpreter = nvm_node_path;
};

/**
 * Check if interpreter is not defined
 */
function noInterpreterDefined(app) {
  return !app.exec_interpreter;
}

/**
 * Check if should use Bun
 */
function shouldUseBun(extName) {
  return (extName === '.js' || extName === '.ts') && cst.IS_BUN === true;
}

/**
 * Check if should use Python
 */
function shouldUsePython(interpreter) {
  return interpreter === 'python';
}

/**
 * Check if Python is available
 */
function isPythonAvailable() {
  return which('python') !== null;
}

/**
 * Check if Python3 is available
 */
function isPython3Available() {
  return which('python3') !== null;
}

/**
 * Check if interpreter uses Python
 */
function usesPythonInterpreter(interpreter) {
  return interpreter.indexOf('python') > -1;
}

/**
 * Check if interpreter is node@ version
 */
function isNodeVersionInterpreter(interpreter) {
  return interpreter.indexOf('node@') > -1;
}

/**
 * Check if interpreter is available in PATH
 */
function isInterpreterAvailable(interpreter) {
  return which(interpreter) !== null;
}

/**
 * Check if interpreter is none
 */
function isNoneInterpreter(interpreter) {
  return interpreter === 'none';
}

/**
 * Check if interpreter is node
 */
function isNodeInterpreter(interpreter) {
  return interpreter === 'node';
}

/**
 * Check if interpreter is lsc
 */
function isLscInterpreter(interpreter) {
  return interpreter === 'lsc';
}

/**
 * Check if interpreter is coffee
 */
function isCoffeeInterpreter(interpreter) {
  return interpreter === 'coffee';
}

/**
 * Resolve interpreter
 */
Common.sink.resolveInterpreter = function(app) {
  const noInterpreter = noInterpreterDefined(app);
  const extName = path.extname(app.pm_exec_path);
  const betterInterpreter = extItps[extName];

  if (noInterpreter && shouldUseBun(extName)) {
    app.exec_interpreter = process.execPath;
    return app;
  }

  if (noInterpreter && betterInterpreter) {
    app.exec_interpreter = betterInterpreter;

    if (shouldUsePython(betterInterpreter)) {
      if (!isPythonAvailable()) {
        if (!isPython3Available()) {
          Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('python and python3 binaries not available in PATH'));
        } else {
          app.exec_interpreter = 'python3';
        }
      }
    }
    return app;
  }

  if (noInterpreter) {
    app.exec_interpreter = isBinary(app.pm_exec_path) ? 'none' : process.execPath;
    return app;
  }

  if (isNodeVersionInterpreter(app.exec_interpreter)) {
    resolveNodeInterpreter(app);
    return app;
  }

  if (usesPythonInterpreter(app.exec_interpreter)) {
    app.env.PYTHONUNBUFFERED = '1';
  }

  if (isLscInterpreter(app.exec_interpreter)) {
    app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/lsc');
    return app;
  }

  if (isCoffeeInterpreter(app.exec_interpreter)) {
    app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/coffee');
    return app;
  }

  if (!isNoneInterpreter(app.exec_interpreter) && !isInterpreterAvailable(app.exec_interpreter)) {
    if (isNodeInterpreter(app.exec_interpreter)) {
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
  if (msg instanceof Error)
    return console.error(msg.message);
  return console.error(`${cst.PREFIX_MSG_MOD_ERR}${msg}`);
}

Common.err = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error)
    return console.error(`${cst.PREFIX_MSG_ERR}${msg.message}`);
  return console.error(`${cst.PREFIX_MSG_ERR}${msg}`);
}

Common.printError = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error)
    return console.error(msg.message);
  return console.error.apply(console, arguments);
};

Common.log = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG}${msg}`);
}

Common.info = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG_INFO}${msg}`);
}

Common.warn = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG_WARNING}${msg}`);
}

Common.logMod = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG_MOD}${msg}`);
}

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
    if (source[new_key] != '[object Object]')
      destination[new_key] = source[new_key];
  });

  return destination;
};

/**
 * This is useful when starting script programmatically
 */
Common.safeExtend = function(origin, add){
  if (!add || typeof add != 'object') return origin;

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
 * Check if environment name is defined in app config
 */
function hasEnvironmentConfig(app, envName) {
  return ('env_' + envName) in app;
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
 * Merge deploy environment variables
 */
function mergeDeployEnv(newConf, deployConf, envName) {
  if (deployConf && deployConf[envName] && deployConf[envName]['env']) {
    Object.assign(newConf.env, deployConf[envName]['env']);
  }
}

/**
 * Merge app environment variables
 */
function mergeAppEnv(newConf, app, envName) {
  Object.assign(newConf.env, app.env);

  if (hasEnvironmentConfig(app, envName)) {
    Object.assign(newConf.env, app['env_' + envName]);
  } else {
    Common.printOut(cst.PREFIX_MSG_WARNING + chalk.bold('Environment [%s] is not defined in process file'), envName);
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
Common.mergeEnvironmentVariables = function(app_env, env_name, deploy_conf) {
  const app = fclone(app_env);

  const new_conf = {
    env : {}
  }

  stringifyEnvObjects(app.env);

  Object.assign(new_conf, app);

  if (env_name) {
    mergeDeployEnv(new_conf, deploy_conf, env_name);
    mergeAppEnv(new_conf, app, env_name);
  }

  delete new_conf.exec_mode

  const res = {
    current_conf: {}
  }

  Object.assign(res, new_conf.env);
  Object.assign(res.current_conf, new_conf);

  resolveNodeInterpreterIfNeeded(app, res);

  return res
}

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
}

/**
 * Check if app has uid/gid/user config
 */
function hasUserConfig(app) {
  return app.uid || app.gid || app.user;
}

/**
 * Check if running on Windows
 */
function isWindows() {
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
  const userKey = app.uid || app.user;
  const userInfo = users[userKey];
  
  if (!userInfo) {
    Common.printError(`${cst.PREFIX_MSG_ERR} User ${userKey} cannot be found`);
    return null;
  }
  
  return userInfo;
}

/**
 * Get group info from passwd
 */
function getGroupInfo(groups, gid) {
  const groupInfo = groups[gid];
  
  if (!groupInfo) {
    Common.printError(`${cst.PREFIX_MSG_ERR} Group ${gid} cannot be found`);
    return null;
  }
  
  return groupInfo;
}

/**
 * Apply user/group configuration to app
 */
function applyUserGroupConfig(app, userInfo, groups) {
  app.env.HOME = userInfo.homedir;
  app.uid = parseInt(userInfo.userId);

  if (app.gid) {
    const groupInfo = getGroupInfo(groups, app.gid);
    if (!groupInfo) {
      return new Error(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
    }
    app.gid = parseInt(groupInfo.id);
  } else {
    app.gid = parseInt(userInfo.groupId);
  }

  return null;
}

/**
 * Validate user/group configuration
 */
function validateUserGroupConfig(app) {
  if (isWindows()) {
    Common.printError(cst.PREFIX_MSG_ERR + '--uid and --git does not works on windows');
    return new Error('--uid and --git does not works on windows');
  }

  if (!isRunningAsRoot()) {
    Common.printError(cst.PREFIX_MSG_ERR + 'To use --uid and --gid please run pm2 as root');
    return new Error('To use UID and GID please run PM2 as root');
  }

  return null;
}

/**
 * Load user/group info from passwd
 */
function loadUserGroupInfo() {
  const passwd = require('./tools/passwd.js');
  
  try {
    const users = passwd.getUsers();
    const groups = passwd.getGroups();
    return { users, groups };
  } catch(e) {
    Common.printError(e);
    return null;
  }
}

/**
 * Check if script has spaces and needs shell wrapper
 */
function scriptHasSpaces(script) {
  return script && script.indexOf(' ') > -1 && cst.IS_WINDOWS === false;
}

/**
 * Get shell command for script
 */
function getShellCommand(script) {
  if (which('bash')) {
    return { shell: 'bash', args: ['-c', script] };
  }
  
  if (which('sh')) {
    return { shell: 'sh', args: ['-c', script] };
  }
  
  return null;
}

/**
 * Apply shell wrapper to script
 */
function applyShellWrapper(app, script) {
  const shellCmd = getShellCommand(script);
  
  if (!shellCmd) {
    warn('bash or sh not available in $PATH, keeping script as is');
    return;
  }

  app.script = shellCmd.shell;
  app.args = shellCmd.args;
  if (!app.name) {
    app.name = script;
  }
}

/**
 * Check if should add log date format
 */
function shouldAddLogDateFormat(app) {
  return app.time || process.env.ASZ_MODE;
}

/**
 * Check if instances is max
 */
function isInstancesMax(instances) {
  return instances === 'max';
}

/**
 * Check if instances is string
 */
function isInstancesString(instances) {
  return typeof instances === 'string';
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

    if (scriptHasSpaces(app.script)) {
      applyShellWrapper(app, app.script);
    }

    if (shouldAddLogDateFormat(app)) {
      app.log_date_format = 'YYYY-MM-DDTHH:mm:ss';
    }

    if (hasUserConfig(app)) {
      const validationError = validateUserGroupConfig(app);
      if (validationError) {
        return validationError;
      }

      const userGroupInfo = loadUserGroupInfo();
      if (!userGroupInfo) {
        return new Error('Failed to load user/group information');
      }

      const userInfo = getUserInfo(userGroupInfo.users, app);
      if (!userInfo) {
        return new Error(`User ${app.uid || app.user} cannot be found`);
      }

      const groupError = applyUserGroupConfig(app, userInfo, userGroupInfo.groups);
      if (groupError) {
        return groupError;
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
      ret.errors.forEach(function(err) { warn(err) });
      return new Error(ret.errors);
    }

    verifiedConf.push(ret.config);
  }

  return verifiedConf;
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
}

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
}

/**
 * Show warnings
 * @param {String} warning
 */
function warn(warning){
  Common.printOut(cst.PREFIX_MSG_WARNING + warning);
}