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

/**
 * Get home directory based on platform
 * @returns {string|null}
 */
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

/**
 * Resolve home directory path (~)
 * @param {string} filepath
 * @returns {string}
 */
function resolveHome(filepath) {
  if (filepath[0] === '~') {
    return path.join(homedir(), filepath.slice(1));
  }
  return filepath;
}

/**
 * Determine if CLI should be silent
 */
Common.determineSilentCLI = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const s1opt = process.argv.indexOf('--silent');
  const s2opt = process.argv.indexOf('-s');

  const isSilentMode = process.env.PM2_SILENT || 
    (variadicArgsDashesPos > -1 &&
     (s1opt !== -1 && s1opt < variadicArgsDashesPos) &&
     (s2opt !== -1 && s2opt < variadicArgsDashesPos)) ||
    (variadicArgsDashesPos === -1 && (s1opt > -1 || s2opt > -1));

  if (isSilentMode) {
    disableConsoleOutput();
    process.env.PM2_DISCRETE_MODE = true;
  }
};

/**
 * Disable all console output methods
 */
function disableConsoleOutput() {
  for (const key in console) {
    const code = key.charCodeAt(0);
    if (code >= 97 && code <= 122) {
      console[key] = function(){};
    }
  }
}

/**
 * Print version if requested
 */
Common.printVersion = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');

  if (process.argv.indexOf('-v') > -1 && process.argv.indexOf('-v') < variadicArgsDashesPos) {
    console.log(pkg.version);
    process.exit(0);
  }
};

/**
 * Lock reload mechanism
 * @returns {number}
 */
Common.lockReload = function() {
  try {
    const lockContent = fs.readFileSync(cst.PM2_RELOAD_LOCKFILE).toString();

    if (lockContent && lockContent !== '') {
      const diff = dayjs().diff(parseInt(lockContent));
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

/**
 * Unlock reload mechanism
 */
Common.unlockReload = function() {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, '');
  } catch(e) {
    console.error(e.message || e);
  }
};

/**
 * Validate script path exists
 * @param {Object} app
 * @returns {Error|null}
 */
function validateScriptPath(app) {
  if (!app.script)
    return new Error('No script path - aborting');
  return null;
}

/**
 * Resolve working directory
 * @param {Object} app
 * @param {Object} opts
 * @returns {string}
 */
function resolveWorkingDirectory(app, opts) {
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
 * Initialize node arguments array
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
function setPortInEnvironment(app) {
  if (app.port && app.env) {
    app.env.PORT = app.port;
  }
}

/**
 * Resolve script execution path
 * @param {Object} app
 * @param {string} cwd
 * @returns {Error|null}
 */
function resolveScriptPath(app, cwd) {
  app.pm_exec_path = path.resolve(cwd, app.script);

  if (!fs.existsSync(app.pm_exec_path)) {
    let resolvedPath = which(app.script);
    
    if (resolvedPath) {
      if (typeof resolvedPath !== 'string')
        resolvedPath = resolvedPath.toString();
      app.pm_exec_path = resolvedPath;
    } else {
      return new Error(`Script not found: ${app.pm_exec_path}`);
    }
  }

  return null;
}

/**
 * Enable source map support if available
 * @param {Object} app
 */
function enableSourceMapSupport(app) {
  if (app.disable_source_map_support !== true) {
    try {
      fs.accessSync(app.pm_exec_path + '.map', fs.constants.R_OK);
      app.source_map_support = true;
    } catch(e) {}
    delete app.disable_source_map_support;
  }
}

/**
 * Filter environment variables based on configuration
 * @param {Object} app
 * @param {Object} baseEnv
 * @returns {Object}
 */
function filterEnvironmentVariables(app, baseEnv) {
  if (app.filter_env === true)
    return {};

  if (typeof app.filter_env === 'string') {
    const filtered = Object.assign({}, baseEnv);
    delete filtered[app.filter_env];
    return filtered;
  }

  if (Array.isArray(app.filter_env) && app.filter_env.length > 0) {
    const filtered = {};
    const allowedKeys = Object.keys(baseEnv).filter(key =>
      !app.filter_env.some(pattern => key.includes(pattern))
    );
    allowedKeys.forEach(key => filtered[key] = baseEnv[key]);
    return filtered;
  }

  return baseEnv;
}

/**
 * Prepare environment variables
 * @param {Object} app
 * @param {Object} opts
 * @returns {Object}
 */
function prepareEnvironment(app, opts) {
  let env = {};

  if (cst.PM2_PROGRAMMATIC || process.env.pm_id)
    Common.safeExtend(env, process.env);
  else
    env = process.env;

  const filteredEnv = (app.filter_env && app.filter_env.length > 0) 
    ? filterEnvironmentVariables(app, process.env)
    : env;

  return [
    {},
    filteredEnv,
    app.env || {}
  ].reduce((e1, e2) => Object.assign(e1, e2));
}

/**
 * Configure log file paths
 * @param {Object} app
 * @param {string} cwd
 * @param {string} formattedName
 */
function configureLogPaths(app, cwd, formattedName) {
  const logFileTypes = ['log', 'out', 'error', 'pid'];

  logFileTypes.forEach(fileType => {
    const fileKey = fileType + '_file';
    let filePath = app[fileKey];
    const isStdFile = !['log', 'pid'].includes(fileType);
    const extension = fileType === 'pid' ? 'pid' : 'log';

    if (filePath) {
      filePath = resolveHome(filePath);
    }

    let pathSegments;

    if ((fileType === 'log' && typeof filePath === 'boolean' && filePath) || 
        (fileType !== 'log' && !filePath)) {
      pathSegments = [
        cst['DEFAULT_' + extension.toUpperCase() + '_PATH'],
        formattedName + (isStdFile ? '-' + fileType : '') + '.' + extension
      ];
    } else if ((fileType !== 'log' || (fileType === 'log' && filePath)) && 
               filePath !== 'NULL' && filePath !== '/dev/null') {
      pathSegments = [cwd, filePath];
      ensureLogDirectory(cwd, filePath);
    }

    setLogPath(app, pathSegments, cwd, filePath, fileType, isStdFile, extension);
    delete app[fileKey];
  });
}

/**
 * Ensure log directory exists
 * @param {string} cwd
 * @param {string} filePath
 */
function ensureLogDirectory(cwd, filePath) {
  const dir = path.dirname(path.resolve(cwd, filePath));
  if (!fs.existsSync(dir)) {
    Common.printError(cst.PREFIX_MSG_WARNING + 'Folder does not exist: ' + dir);
    Common.printOut(cst.PREFIX_MSG + 'Creating folder: ' + dir);
    try {
      require('mkdirp').sync(dir);
    } catch (err) {
      Common.printError(cst.PREFIX_MSG_ERR + 'Could not create folder: ' + path.dirname(filePath));
      throw new Error('Could not create folder');
    }
  }
}

/**
 * Set log file path in app configuration
 * @param {Object} app
 * @param {Array} pathSegments
 * @param {string} cwd
 * @param {string} filePath
 * @param {string} fileType
 * @param {boolean} isStdFile
 * @param {string} extension
 */
function setLogPath(app, pathSegments, cwd, filePath, fileType, isStdFile, extension) {
  const pathKey = 'pm_' + (isStdFile ? fileType.substr(0, 3) + '_' : '') + extension + '_path';

  if (filePath !== 'NULL' && filePath !== '/dev/null') {
    if (pathSegments) {
      app[pathKey] = path.resolve.apply(null, pathSegments);
    }
  } else if (path.sep === '\\') {
    app[pathKey] = '\\\\.\\NUL';
  } else {
    app[pathKey] = '/dev/null';
  }
}

/**
 * Resolve app paths and replace missing values with defaults.
 * @param {Object} opts
 * @param {Object} app
 * @returns {Object|Error}
 */
Common.prepareAppConf = function(opts, app) {
  const scriptError = validateScriptPath(app);
  if (scriptError) return scriptError;

  const cwd = resolveWorkingDirectory(app, opts);
  initializeNodeArgs(app);
  setPortInEnvironment(app);

  const scriptError2 = resolveScriptPath(app, cwd);
  if (scriptError2) return scriptError2;

  enableSourceMapSupport(app);
  delete app.script;

  app.env = prepareEnvironment(app, opts);
  app.pm_cwd = cwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch(e) {
    return e;
  }

  Common.sink.determineExecMode(app);

  const formattedAppName = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');
  configureLogPaths(app, cwd, formattedAppName);

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
 * @returns {string|null}
 */
Common.isConfigFile = function (filename) {
  if (typeof filename !== 'string')
    return null;

  for (const extension in Common.knonwConfigFileExtensions) {
    if (filename.indexOf(extension) !== -1) {
      return Common.knonwConfigFileExtensions[extension];
    }
  }

  return null;
};

/**
 * Get configuration file candidates
 * @param {string} name
 * @returns {Array}
 */
Common.getConfigFileCandidates = function (name) {
  return Object.keys(Common.knonwConfigFileExtensions).map((extension) => name + extension);
};

/**
 * Parses a config file like ecosystem.config.js. Supported formats: JS, JSON, JSON5, YAML.
 * @param {string} confObj contents of the config file
 * @param {string} filename path to the config file
 * @returns {Object} config object
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
  else if (isConfigFile === 'yaml') {
    return yamljs.load(confObj.toString());
  }
  else if (isConfigFile === 'js' || isConfigFile === 'mjs') {
    const confPath = require.resolve(path.resolve(filename));
    delete require.cache[confPath];
    return require(confPath);
  }
};

/**
 * Wrap error in Error object
 * @param {Error|string} e
 * @returns {Error}
 */
Common.retErr = function(e) {
  if (!e)
    return new Error('Unidentified error');
  if (e instanceof Error)
    return e;
  return new Error(e);
};

Common.sink = {};

/**
 * Determine cron restart schedule
 * @param {Object} app
 * @returns {Error|undefined}
 */
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
 * Determine execution mode (fork or cluster)
 * @param {Object} app
 */
Common.sink.determineExecMode = function(app) {
  if (app.exec_mode)
    app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');

  const hasInstances = app.instances >= 1 || app.instances === 0 || app.instances === -1;
  const isNodeOrBun = app.exec_interpreter.includes('node') === true || 
                      app.exec_interpreter.includes('bun') === true;

  if (!app.exec_mode && hasInstances && isNodeOrBun) {
    app.exec_mode = 'cluster_mode';
  } else if (!app.exec_mode) {
    app.exec_mode = 'fork_mode';
  }

  if (typeof app.instances === 'undefined')
    app.instances = 1;
};

/**
 * Get NVM path based on platform
 * @returns {string|null}
 */
function getNvmPath() {
  return cst.IS_WINDOWS ? process.env.NVM_HOME : process.env.NVM_DIR;
}

/**
 * Get Node.js path for NVM
 * @param {string} nodeVersion
 * @returns {string}
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
 * Get NVM command for installation
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
 * Install Node.js version via NVM
 * @param {string} nvmPath
 * @param {string} nodeVersion
 * @param {string} nvmNodePath
 * @returns {string}
 */
function installNodeViaNvm(nvmPath, nodeVersion, nvmNodePath) {
  const nvmBin = path.join(nvmPath, 'nvm.' + (cst.IS_WINDOWS ? 'exe' : 'sh'));
  const nvmCmd = getNvmInstallCommand(nvmBin, nodeVersion);

  Common.printOut(cst.PREFIX_MSG + 'Installing Node v%s', nodeVersion);
  Common.printOut(cst.PREFIX_MSG + 'Executing: %s', nvmCmd);

  execSync(nvmCmd, {
    cwd: path.resolve(process.cwd()),
    env: process.env,
    maxBuffer: 20 * 1024 * 1024
  });

  let finalPath = nvmNodePath;
  if (cst.IS_WINDOWS) {
    finalPath = nvmNodePath.replace(/node/, 'node' + process.arch.slice(1));
  }

  return finalPath;
}

/**
 * Resolve Node.js interpreter via NVM
 * @param {Object} app
 */
const resolveNodeInterpreter = function(app) {
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
  const pathToNode = getNodePathForNvm(nodeVersion);
  let nvmNodePath = path.join(nvmPath, pathToNode);

  try {
    fs.accessSync(nvmNodePath);
  } catch(e) {
    nvmNodePath = installNodeViaNvm(nvmPath, nodeVersion, nvmNodePath);
  }

  Common.printOut(cst.PREFIX_MSG + chalk.green.bold('Setting Node to v%s (path=%s)'),
                  nodeVersion,
                  nvmNodePath);

  app.exec_interpreter = nvmNodePath;
};

/**
 * Resolve Python interpreter
 * @param {Object} app
 */
function resolvePythonInterpreter(app) {
  if (which('python') === null) {
    if (which('python3') === null) {
      Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('python and python3 binaries not available in PATH'));
    } else {
      app.exec_interpreter = 'python3';
    }
  }
}

/**
 * Resolve interpreter for script
 * @param {Object} app
 * @returns {Object}
 */
Common.sink.resolveInterpreter = function(app) {
  const noInterpreter = !app.exec_interpreter;
  const extName = path.extname(app.pm_exec_path);
  const betterInterpreter = extItps[extName];

  // Bun support
  if (noInterpreter && (extName === '.js' || extName === '.ts') && cst.IS_BUN === true) {
    app.exec_interpreter = process.execPath;
  }
  // No interpreter defined and correspondence in schema hashmap
  else if (noInterpreter && betterInterpreter) {
    app.exec_interpreter = betterInterpreter;

    if (betterInterpreter === 'python') {
      resolvePythonInterpreter(app);
    }
  }
  // Else if no Interpreter detect if process is binary
  else if (noInterpreter) {
    app.exec_interpreter = isBinary(app.pm_exec_path) ? 'none' : process.execPath;
  }
  else if (app.exec_interpreter.indexOf('node@') > -1) {
    resolveNodeInterpreter(app);
  }

  if (app.exec_interpreter.indexOf('python') > -1)
    app.env.PYTHONUNBUFFERED = '1';

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
    }
    else {
      throw new Error(`Interpreter ${app.exec_interpreter} is NOT AVAILABLE in PATH. (type 'which ${app.exec_interpreter}' to double check.)`);
    }
  }

  return app;
};

/**
 * Deep copy object
 * @param {Object} obj
 * @returns {Object}
 */
Common.deepCopy = Common.serialize = Common.clone = function(obj) {
  if (obj === null || obj === undefined) return {};
  return fclone(obj);
};

/**
 * Print module error
 * @param {string|Error} msg
 * @returns {boolean}
 */
Common.errMod = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error)
    return console.error(msg.message);
  return console.error(`${cst.PREFIX_MSG_MOD_ERR}${msg}`);
};

/**
 * Print error
 * @param {string|Error} msg
 * @returns {boolean}
 */
Common.err = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error)
    return console.error(`${cst.PREFIX_MSG_ERR}${msg.message}`);
  return console.error(`${cst.PREFIX_MSG_ERR}${msg}`);
};

/**
 * Print error message
 * @returns {boolean}
 */
Common.printError = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error)
    return console.error(msg.message);
  return console.error.apply(console, arguments);
};

/**
 * Print log message
 * @param {string} msg
 * @returns {boolean}
 */
Common.log = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG}${msg}`);
};

/**
 * Print info message
 * @param {string} msg
 * @returns {boolean}
 */
Common.info = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG_INFO}${msg}`);
};

/**
 * Print warning message
 * @param {string} msg
 * @returns {boolean}
 */
Common.warn = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG_WARNING}${msg}`);
};

/**
 * Print module log message
 * @param {string} msg
 * @returns {boolean}
 */
Common.logMod = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG_MOD}${msg}`);
};

/**
 * Print output
 * @returns {boolean}
 */
Common.printOut = function() {
  if (process.env.PM2_SILENT === 'true' || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log.apply(console, arguments);
};

/**
 * Raw extend
 * @param {Object} destination
 * @param {Object} source
 * @returns {Object}
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
 * Safe extend for programmatic usage
 * @param {Object} origin
 * @param {Object} add
 * @returns {Object}
 */
Common.safeExtend = function(origin, add){
  if (!add || typeof add !== 'object') return origin;

  const keysToIgnore = [
    'name', 'exec_mode', 'env', 'args', 'pm_cwd', 'exec_interpreter',
    'pm_exec_path', 'node_args', 'pm_out_log_path', 'pm_err_log_path',
    'pm_pid_path', 'pm_id', 'status', 'pm_uptime', 'created_at',
    'windowsHide', 'username', 'merge_logs', 'kill_retry_time',
    'prev_restart_delay', 'instance_var', 'unstable_restarts',
    'restart_time', 'axm_actions', 'pmx_module', 'command', 'watch',
    'filter_env', 'versioning', 'vizion_runing', 'MODULE_DEBUG', 'pmx',
    'axm_options', 'vizion', 'axm_dynamic', 'axm_monitor', 'instances',
    'automation', 'autostart', 'autorestart', 'stop_exit_codes',
    'unstable_restart', 'treekill', 'exit_code', 'vizion'
  ];

  const keys = Object.keys(add);
  let i = keys.length;
  while (i--) {
    if (keysToIgnore.indexOf(keys[i]) === -1 && add[keys[i]] !== '[object Object]')
      origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

/**
 * Merge environment variables from different sources
 * @param {Object} appEnv
 * @param {string} envName
 * @param {Object} deployConf
 * @returns {Object}
 */
Common.mergeEnvironmentVariables = function(appEnv, envName, deployConf) {
  const app = fclone(appEnv);

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
    if (deployConf && deployConf[envName] && deployConf[envName]['env']) {
      Object.assign(newConf.env, deployConf[envName]['env']);
    }

    Object.assign(newConf.env, app.env);

    if ('env_' + envName in app) {
      Object.assign(newConf.env, app['env_' + envName]);
    }
    else {
      Common.printOut(cst.PREFIX_MSG_WARNING + chalk.bold('Environment [%s] is not defined in process file'), envName);
    }
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
 * Resolve app attributes
 * @param {Object} opts
 * @param {Object} conf
 * @returns {Object}
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
 * Check if script should use shell wrapper
 * @param {Object} app
 * @returns {boolean}
 */
function shouldWrapScriptInShell(app) {
  return app.script && app.script.indexOf(' ') > -1 && cst.IS_WINDOWS === false;
}

/**
 * Wrap script in shell command
 * @param {Object} app
 */
function wrapScriptInShell(app) {
  const originalScript = app.script;

  if (which('bash')) {
    app.script = 'bash';
    app.args = ['-c', originalScript];
    if (!app.name) {
      app.name = originalScript;
    }
  }
  else if (which('sh')) {
    app.script = 'sh';
    app.args = ['-c', originalScript];
    if (!app.name) {
      app.name = originalScript;
    }
  }
  else {
    warn('bash or sh not available in $PATH, keeping script as is');
  }
}

/**
 * Set log date format if needed
 * @param {Object} app
 */
function setLogDateFormat(app) {
  if (app.time || process.env.ASZ_MODE) {
    app.log_date_format = 'YYYY-MM-DDTHH:mm:ss';
  }
}

/**
 * Validate UID/GID configuration
 * @param {Object} app
 * @returns {Error|null}
 */
function validateUidGidConfig(app) {
  if (!app.uid && !app.gid && !app.user) {
    return null;
  }

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
 * @returns {Error|null}
 */
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

/**
 * Resolve group information
 * @param {Object} app
 * @param {Object} userInfo
 * @returns {Error|null}
 */
function resolveGroupInfo(app, userInfo) {
  if (!app.gid) {
    app.gid = parseInt(userInfo.groupId);
    return null;
  }

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

/**
 * Configure instances parameter
 * @param {Object} app
 */
function configureInstances(app) {
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

/**
 * Verify configurations
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

    if (app.exec_mode)
      app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');

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

    Common.renderApplicationName(app);

    if (app.execute_command === true) {
      app.exec_mode = 'fork';
      delete app.execute_command;
    }

    app.username = Common.getCurrentUsername();

    if (shouldWrapScriptInShell(app)) {
      wrapScriptInShell(app);
    }

    setLogDateFormat(app);

    const uidGidError = validateUidGidConfig(app);
    if (uidGidError) return uidGidError;

    if (app.uid || app.gid || app.user) {
      const userError = resolveUserInfo(app);
      if (userError) return userError;

      const passwd = require('./tools/passwd.js');
      const users = passwd.getUsers();
      const userInfo = users[app.uid || app.user];

      const groupError = resolveGroupInfo(app, userInfo);
      if (groupError) return groupError;
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

    configureInstances(app);

    if (app.cron_restart) {
      const cronError = Common.sink.determineCron(app);
      if (cronError instanceof Error)
        return cronError;
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
 * @returns {string}
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
    currentUser = process.env.USER || process.env.LNAME || process.env.USERNAME || 
                  process.env.SUDO_USER || process.env.C9_USER || process.env.LOGNAME;
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
 * @param {string} warning
 */
function warn(warning){
  Common.printOut(cst.PREFIX_MSG_WARNING + warning);
}
```