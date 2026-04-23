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

// Get home directory based on platform
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

// Resolve home directory path
function resolveHome(filepath) {
  if (filepath[0] === '~') {
    return path.join(homedir(), filepath.slice(1));
  }
  return filepath;
}

// Check if silent flag is present in arguments
function isSilentFlagPresent() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const s1opt = process.argv.indexOf('--silent');
  const s2opt = process.argv.indexOf('-s');

  if (variadicArgsDashesPos > -1) {
    return (s1opt !== -1 && s1opt < variadicArgsDashesPos) ||
           (s2opt !== -1 && s2opt < variadicArgsDashesPos);
  }
  return s1opt > -1 || s2opt > -1;
}

// Disable console output if silent mode is enabled
function disableConsoleOutput() {
  for (const key in console) {
    const code = key.charCodeAt(0);
    if (code >= 97 && code <= 122) {
      console[key] = function(){};
    }
  }
}

Common.determineSilentCLI = function() {
  if (process.env.PM2_SILENT || isSilentFlagPresent()) {
    disableConsoleOutput();
    process.env.PM2_DISCRETE_MODE = true;
  }
};

Common.printVersion = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');

  if (process.argv.indexOf('-v') > -1 && process.argv.indexOf('-v') < variadicArgsDashesPos) {
    console.log(pkg.version);
    process.exit(0);
  }
};

// Read reload lock file and check timeout
function readReloadLockFile() {
  try {
    const content = fs.readFileSync(cst.PM2_RELOAD_LOCKFILE).toString();
    if (content && content !== '') {
      const diff = dayjs().diff(parseInt(content));
      if (diff < cst.RELOAD_LOCK_TIMEOUT) {
        return diff;
      }
    }
  } catch(e) {}
  return null;
}

// Write reload lock file with current timestamp
function writeReloadLockFile() {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, dayjs().valueOf().toString());
    return 0;
  } catch(e) {
    console.error(e.message || e);
  }
}

Common.lockReload = function() {
  const lockStatus = readReloadLockFile();
  if (lockStatus !== null) {
    return lockStatus;
  }
  return writeReloadLockFile();
};

Common.unlockReload = function() {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, '');
  } catch(e) {
    console.error(e.message || e);
  }
};

// Validate script path exists
function validateScriptPath(app) {
  if (!app.script) {
    return new Error('No script path - aborting');
  }
  return null;
}

// Resolve working directory
function resolveWorkingDirectory(app, opts) {
  let cwd = null;

  if (app.cwd) {
    cwd = path.resolve(app.cwd);
    process.env.PWD = app.cwd;
  }

  cwd = cwd && cwd[0] !== '/' ? path.resolve(process.cwd(), cwd) : cwd;
  return cwd || opts.cwd;
}

// Initialize node arguments array
function initializeNodeArgs(app) {
  if (!app.node_args) {
    app.node_args = [];
  }
}

// Set port in environment if specified
function setPortInEnv(app) {
  if (app.port && app.env) {
    app.env.PORT = app.port;
  }
}

// Resolve script execution path
function resolveScriptPath(app, cwd) {
  app.pm_exec_path = path.resolve(cwd, app.script);

  if (!fs.existsSync(app.pm_exec_path)) {
    let resolvedPath = which(app.script);
    if (resolvedPath) {
      if (typeof resolvedPath !== 'string') {
        resolvedPath = resolvedPath.toString();
      }
      app.pm_exec_path = resolvedPath;
    } else {
      return new Error(`Script not found: ${app.pm_exec_path}`);
    }
  }
  return null;
}

// Enable source map support if available
function enableSourceMapSupport(app) {
  if (app.disable_source_map_support !== true) {
    try {
      fs.accessSync(app.pm_exec_path + '.map', fs.constants.R_OK);
      app.source_map_support = true;
    } catch(e) {}
    delete app.disable_source_map_support;
  }
}

// Filter environment variables based on configuration
function filterEnvironmentVariables(app, env) {
  if (app.filter_env === true) {
    return {};
  }

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
    allowedKeys.forEach(key => {
      newEnv[key] = env[key];
    });
    return newEnv;
  }

  return env;
}

// Prepare environment variables for application
function prepareEnvironmentVariables(app, cwd) {
  let env = {};

  if (cst.PM2_PROGRAMMATIC || process.env.pm_id) {
    Common.safeExtend(env, process.env);
  } else {
    env = process.env;
  }

  const filteredEnv = filterEnvironmentVariables(app, env);

  app.env = [
    {},
    app.filter_env && app.filter_env.length > 0 ? filteredEnv : env,
    app.env || {}
  ].reduce((e1, e2) => Object.assign(e1, e2));
}

// Get formatted application name
function getFormattedAppName(app) {
  return app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');
}

// Resolve log file path
function resolveLogFilePath(fileType, app, cwd, formattedAppName) {
  const isStd = !~['log', 'pid'].indexOf(fileType);
  const ext = fileType === 'pid' ? 'pid' : 'log';
  let af = app[fileType + '_file'];

  if (af) {
    af = resolveHome(af);
  }

  let ps = null;

  if ((fileType === 'log' && typeof af === 'boolean' && af) ||
      (fileType !== 'log' && !af)) {
    ps = [
      cst['DEFAULT_' + ext.toUpperCase() + '_PATH'],
      formattedAppName + (isStd ? '-' + fileType : '') + '.' + ext
    ];
  } else if ((fileType !== 'log' || (fileType === 'log' && af)) &&
             af !== 'NULL' && af !== '/dev/null') {
    ps = [cwd, af];

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
  }

  // Set PM2 paths
  if (af !== 'NULL' && af !== '/dev/null') {
    if (ps) {
      const pathKey = 'pm_' + (isStd ? fileType.substr(0, 3) + '_' : '') + ext + '_path';
      app[pathKey] = path.resolve.apply(null, ps);
    }
  } else if (path.sep === '\\') {
    const pathKey = 'pm_' + (isStd ? fileType.substr(0, 3) + '_' : '') + ext + '_path';
    app[pathKey] = '\\\\.\\NUL';
  } else {
    const pathKey = 'pm_' + (isStd ? fileType.substr(0, 3) + '_' : '') + ext + '_path';
    app[pathKey] = '/dev/null';
  }

  delete app[fileType + '_file'];
}

// Configure log file paths for application
function configureLogFilePaths(app, cwd) {
  const formattedAppName = getFormattedAppName(app);
  const fileTypes = ['log', 'out', 'error', 'pid'];

  fileTypes.forEach(fileType => {
    resolveLogFilePath(fileType, app, cwd, formattedAppName);
  });
}

Common.prepareAppConf = function(opts, app) {
  const scriptError = validateScriptPath(app);
  if (scriptError) {
    return scriptError;
  }

  const cwd = resolveWorkingDirectory(app, opts);

  initializeNodeArgs(app);
  setPortInEnv(app);

  const scriptPathError = resolveScriptPath(app, cwd);
  if (scriptPathError) {
    return scriptPathError;
  }

  enableSourceMapSupport(app);
  delete app.script;

  prepareEnvironmentVariables(app, cwd);

  app.pm_cwd = cwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch(e) {
    return e;
  }

  Common.sink.determineExecMode(app);

  configureLogFilePaths(app, cwd);

  return app;
};

Common.knonwConfigFileExtensions = {
  '.json': 'json',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.config.js': 'js',
  '.config.cjs': 'js',
  '.config.mjs': 'mjs'
};

Common.isConfigFile = function (filename) {
  if (typeof filename !== 'string') {
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

Common.sink.determineExecMode = function(app) {
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
};

// Check if cluster mode is being used
function isClusterMode(app) {
  return app.exec_mode && app.exec_mode.indexOf('cluster') > -1;
}

// Get NVM path based on platform
function getNvmPath() {
  return cst.IS_WINDOWS ? process.env.NVM_HOME : process.env.NVM_DIR;
}

// Print NVM installation instructions
function printNvmInstallationInstructions() {
  Common.printError(cst.PREFIX_MSG_ERR + chalk.red('NVM is not available in PATH'));
  Common.printError(cst.PREFIX_MSG_ERR + chalk.red('Fallback to node in PATH'));
  const msg = cst.IS_WINDOWS
    ? 'https://github.com/coreybutler/nvm-windows/releases/'
    : '$ curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash';
  Common.printOut(cst.PREFIX_MSG_ERR + chalk.bold('Install NVM:\n' + msg));
}

// Get path to node binary in NVM
function getNvmNodePath(nvmPath, nodeVersion) {
  const pathToNode = cst.IS_WINDOWS
    ? '/v' + nodeVersion + '/node.exe'
    : semver.satisfies(nodeVersion, '>= 0.12.0')
        ? '/versions/node/v' + nodeVersion + '/bin/node'
        : '/v' + nodeVersion + '/bin/node';
  return path.join(nvmPath, pathToNode);
}

// Install Node version via NVM
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

// Adjust node path for Windows architecture
function adjustNodePathForWindows(nvmNodePath) {
  if (cst.IS_WINDOWS) {
    return nvmNodePath.replace(/node/, 'node' + process.arch.slice(1));
  }
  return nvmNodePath;
}

const resolveNodeInterpreter = function(app) {
  if (isClusterMode(app)) {
    Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('Choosing the Node.js version in cluster mode is not supported'));
    return false;
  }

  const nvmPath = getNvmPath();
  if (!nvmPath) {
    printNvmInstallationInstructions();
    return;
  }

  const nodeVersion = app.exec_interpreter.split('@')[1];
  let nvmNodePath = getNvmNodePath(nvmPath, nodeVersion);

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

// Check if interpreter is defined
function hasInterpreter(app) {
  return !!app.exec_interpreter;
}

// Get file extension
function getFileExtension(app) {
  return path.extname(app.pm_exec_path);
}

// Get better interpreter from extension mapping
function getBetterInterpreter(extName) {
  return extItps[extName];
}

// Handle Bun support
function handleBunSupport(app, extName) {
  if (!hasInterpreter(app) && (extName === '.js' || extName === '.ts') && cst.IS_BUN === true) {
    app.exec_interpreter = process.execPath;
    return true;
  }
  return false;
}

// Handle Python interpreter
function handlePythonInterpreter(app) {
  if (which('python') === null) {
    if (which('python3') === null) {
      Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('python and python3 binaries not available in PATH'));
    } else {
      app.exec_interpreter = 'python3';
    }
  }
}

// Resolve interpreter based on file extension
function resolveInterpreterByExtension(app, extName, betterInterpreter) {
  if (!hasInterpreter(app) && betterInterpreter) {
    app.exec_interpreter = betterInterpreter;

    if (betterInterpreter === 'python') {
      handlePythonInterpreter(app);
    }
  } else if (!hasInterpreter(app)) {
    app.exec_interpreter = isBinary(app.pm_exec_path) ? 'none' : process.execPath;
  }
}

// Handle special interpreter cases
function handleSpecialInterpreters(app) {
  if (app.exec_interpreter === 'lsc') {
    app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/lsc');
  }

  if (app.exec_interpreter === 'coffee') {
    app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/coffee');
  }
}

// Validate interpreter availability
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

Common.sink.resolveInterpreter = function(app) {
  const extName = getFileExtension(app);
  const betterInterpreter = getBetterInterpreter(extName);

  if (handleBunSupport(app, extName)) {
    return app;
  }

  resolveInterpreterByExtension(app, extName, betterInterpreter);

  if (app.exec_interpreter.indexOf('node@') > -1) {
    resolveNodeInterpreter(app);
  }

  if (app.exec_interpreter.indexOf('python') > -1) {
    app.env.PYTHONUNBUFFERED = '1';
  }

  handleSpecialInterpreters(app);
  validateInterpreterAvailability(app);

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

Common.extend = function(destination, source) {
  if (typeof destination !== 'object') {
    destination = {};
  }
  if (!source || typeof source !== 'object') {
    return destination;
  }

  Object.keys(source).forEach(function(newKey) {
    if (source[newKey] !== '[object Object]') {
      destination[newKey] = source[newKey];
    }
  });

  return destination;
};

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

// Stringify object values in environment
function stringifyEnvObjects(env) {
  for (const key in env) {
    if (typeof env[key] === 'object') {
      env[key] = JSON.stringify(env[key]);
    }
  }
}

// Merge environment variables from deploy configuration
function mergeDeployEnvironment(newConf, app, envName, deployConf) {
  if (deployConf && deployConf[envName] && deployConf[envName]['env']) {
    Object.assign(newConf.env, deployConf[envName]['env']);
  }

  Object.assign(newConf.env, app.env);

  if ('env_' + envName in app) {
    Object.assign(newConf.env, app['env_' + envName]);
  } else {
    Common.printOut(cst.PREFIX_MSG_WARNING + chalk.bold('Environment [%s] is not defined in process file'), envName);
  }
}

// Resolve node interpreter if specified with version
function resolveNodeInterpreterIfNeeded(app, res) {
  if (app.exec_interpreter && app.exec_interpreter.indexOf('@') > -1) {
    resolveNodeInterpreter(app);
    res.current_conf.exec_interpreter = app.exec_interpreter;
  }
}

Common.mergeEnvironmentVariables = function(appEnv, envName, deployConf) {
  const app = fclone(appEnv);

  const newConf = {
    env: {}
  };

  stringifyEnvObjects(app.env);
  Object.assign(newConf, app);

  if (envName) {
    mergeDeployEnvironment(newConf, app, envName, deployConf);
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

Common.resolveAppAttributes = function(opts, conf) {
  const confCopy = fclone(conf);

  const app = Common.prepareAppConf(opts, confCopy);
  if (app instanceof Error) {
    throw new Error(app.message);
  }
  return app;
};

// Handle script with spaces on non-Windows platforms
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
      warn('bash or sh not available in $PATH, keeping script as is');
    }
  }
}

// Set log date format if time option is enabled
function setLogDateFormat(app) {
  if (app.time || process.env.ASZ_MODE) {
    app.log_date_format = 'YYYY-MM-DDTHH:mm:ss';
  }
}

// Validate UID/GID on non-Windows platforms
function validateUidGid(app) {
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

// Get user information from passwd
function getUserInfo(app) {
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

  return userInfo;
}

// Get group information from passwd
function getGroupInfo(app) {
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

  return groupInfo;
}

// Set user and group information
function setUserAndGroupInfo(app, userInfo) {
  app.env.HOME = userInfo.homedir;
  app.uid = parseInt(userInfo.userId);

  if (app.gid) {
    const groupInfo = getGroupInfo(app);
    if (groupInfo instanceof Error) {
      return groupInfo;
    }
    app.gid = parseInt(groupInfo.id);
  } else {
    app.gid = parseInt(userInfo.groupId);
  }

  return null;
}

// Handle UID/GID configuration
function handleUidGidConfig(app) {
  if (!app.uid && !app.gid && !app.user) {
    return null;
  }

  const uidGidError = validateUidGid(app);
  if (uidGidError) {
    return uidGidError;
  }

  const userInfo = getUserInfo(app);
  if (userInfo instanceof Error) {
    return userInfo;
  }

  return setUserAndGroupInfo(app, userInfo);
}

// Handle instances configuration
function handleInstancesConfig(app) {
  if (app.instances === 'max') {
    app.instances = 0;
  }

  if (typeof app.instances === 'string') {
    app.instances = parseInt(app.instances) || 0;
  }

  if (app.exec_mode !== 'cluster_mode' &&
      !app.instances &&
      typeof app.merge_logs === 'undefined') {
    app.merge_logs = true;
  }
}

// Validate configuration using Config module
function validateConfiguration(app) {
  const ret = Config.validateJSON(app);
  if (ret.errors && ret.errors.length > 0) {
    ret.errors.forEach(err => warn(err));
    return new Error(ret.errors);
  }
  return ret.config;
}

// Process single application configuration
function processAppConfig(app) {
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
  setLogDateFormat(app);

  const uidGidError = handleUidGidConfig(app);
  if (uidGidError) {
    return uidGidError;
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

  handleInstancesConfig(app);

  if (app.cron_restart) {
    const cronError = Common.sink.determineCron(app);
    if (cronError instanceof Error) {
      return cronError;
    }
  }

  return validateConfiguration(app);
}

Common.verifyConfs = function(appConfs) {
  if (!appConfs || appConfs.length === 0) {
    return [];
  }

  appConfs = [].concat(appConfs);

  const verifiedConf = [];

  for (let i = 0; i < appConfs.length; i++) {
    const result = processAppConfig(appConfs[i]);
    if (result instanceof Error) {
      return result;
    }
    verifiedConf.push(result);
  }

  return verifiedConf;
};

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

Common.renderApplicationName = function(conf) {
  if (!conf.name && conf.script) {
    conf.name = conf.script !== undefined ? path.basename(conf.script) : 'undefined';
    const lastDot = conf.name.lastIndexOf('.');
    if (lastDot > 0) {
      conf.name = conf.name.slice(0, lastDot);
    }
  }
};

// Print warning message
function warn(warning) {
  Common.printOut(cst.PREFIX_MSG_WARNING + warning);
}