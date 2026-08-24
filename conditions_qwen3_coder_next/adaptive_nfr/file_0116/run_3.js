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
 * Determine correct home directory based on platform and environment.
 * @returns {string|null} home directory path
 */
function homedir() {
  const env = process.env;
  const home = env.HOME;
  const user = env.LOGNAME || env.USER || env.LNAME || env.USERNAME;

  switch (process.platform) {
    case 'win32':
      return env.USERPROFILE || env.HOMEDRIVE + env.HOMEPATH || home || null;
    case 'darwin':
      return home || (user ? '/Users/' + user : null);
    case 'linux':
      return home || (process.getuid() === 0 ? '/root' : (user ? '/home/' + user : null));
    default:
      return home || null;
  }
}

/**
 * Resolve ~ in file paths to actual user home directory.
 * @param {string} filepath path possibly containing ~
 * @returns {string} resolved path
 */
function resolveHome(filepath) {
  if (filepath[0] === '~') {
    return path.join(homedir(), filepath.slice(1));
  }
  return filepath;
}

/**
 * Silence CLI output if silent flags found.
 */
Common.determineSilentCLI = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const s1opt = process.argv.indexOf('--silent');
  const s2opt = process.argv.indexOf('-s');

  if (isSilentCLI()) {
    for (const key in console) {
      const code = key.charCodeAt(0);
      if (code >= 97 && code <= 122) {
        console[key] = function() {};
      }
    }
    process.env.PM2_DISCRETE_MODE = true;
  }

  function isSilentCLI() {
    if (process.env.PM2_SILENT) return true;
    if (variadicArgsDashesPos === -1) return s1opt !== -1 || s2opt !== -1;
    if (s1opt === -1 || s2opt === -1) return false;
    const bothBeforeDash = s1opt < variadicArgsDashesPos && s2opt < variadicArgsDashesPos;
    const bothAfterDash = s1opt > variadicArgsDashesPos && s2opt > variadicArgsDashesPos;
    return bothBeforeDash || (s1opt < variadicArgsDashesPos && s2opt < variadicArgsDashesPos);
  }
};

/**
 * Print version if -v flag present before -- delimiter.
 */
Common.printVersion = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const vFlagPos = process.argv.indexOf('-v');

  if (vFlagPos > -1 && vFlagPos < variadicArgsDashesPos) {
    console.log(pkg.version);
    process.exit(0);
  }
};

/**
 * Attempt to acquire reload lock; return elapsed time if locked within timeout.
 * @returns {number} time elapsed since last lock or 0 if unlocked
 */
Common.lockReload = function() {
  try {
    const t1 = fs.readFileSync(cst.PM2_RELOAD_LOCKFILE).toString();
    if (!t1 || t1 === '') return 0;

    const diff = dayjs().diff(parseInt(t1));
    if (diff < cst.RELOAD_LOCK_TIMEOUT) return diff;
  } catch (e) {}

  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, dayjs().valueOf().toString());
    return 0;
  } catch (e) {
    console.error(e.message || e);
    return 0;
  }
};

/**
 * Release reload lock.
 */
Common.unlockReload = function() {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, '');
  } catch (e) {
    console.error(e.message || e);
  }
};

/**
 * Validate app configuration and prepare resolved fields.
 * @param {Object} opts PM2 options
 * @param {Object} app app configuration object
 * @returns {Object|Error} app or Error
 */
Common.prepareAppConf = function(opts, app) {
  if (!app.script) {
    return new Error('No script path - aborting');
  }

  const cwd = app.cwd ? path.resolve(app.cwd) : null;

  if (cwd) process.env.PWD = app.cwd;

  if (!app.node_args) app.node_args = [];

  if (app.port && app.env) app.env.PORT = app.port;

  const resolvedCwd = resolveWorkingDirectory(cwd, opts.cwd);
  app.pm_exec_path = path.resolve(resolvedCwd, app.script);

  if (!fs.existsSync(app.pm_exec_path)) {
    const whichResult = which(app.script);
    if (whichResult) {
      app.pm_exec_path = typeof whichResult === 'string' ? whichResult : whichResult.toString();
    } else {
      return new Error(`Script not found: ${app.pm_exec_path}`);
    }
  }

  if (app.disable_source_map_support !== true) {
    try {
      fs.accessSync(app.pm_exec_path + '.map', fs.constants.R_OK);
      app.source_map_support = true;
    } catch (e) {
      // ignore
    } finally {
      delete app.disable_source_map_support;
    }
  }

  delete app.script;

  const env = shouldCopyInternalEnv() ? Common.safeExtend({}, process.env) : process.env;
  app.env = mergeEnvironments(env, app);

  app.pm_cwd = resolvedCwd;

  try {
    const interpreterResolveResult = Common.sink.resolveInterpreter(app);
    if (interpreterResolveResult instanceof Error) return interpreterResolveResult;
  } catch (e) {
    return e;
  }

  Common.sink.determineExecMode(app);

  resolveLogAndPidPaths(app, resolvedCwd);

  return app;

  /**
   * Determine whether internal PM2 environment variables should be preserved.
   */
  function shouldCopyInternalEnv() {
    return cst.PM2_PROGRAMMATIC || process.env.pm_id;
  }

  /**
   * Merge multiple environment configuration layers.
   */
  function mergeEnvironments(baseEnv, appConfig) {
    function filterEnv(envObj) {
      if (appConfig.filter_env === true) return {};
      if (typeof appConfig.filter_env === 'string') {
        delete envObj[appConfig.filter_env];
        return envObj;
      }
      const deniedKeys = appConfig.filter_env || [];
      return Object.fromEntries(Object.entries(envObj)
        .filter(([k]) => !deniedKeys.some(dk => k.includes(dk))));
    }

    const envLayers = [
      {},
      (appConfig.filter_env && appConfig.filter_env.length > 0) ? filterEnv(baseEnv) : baseEnv,
      appConfig.env || {}
    ];

    return envLayers.reduce((acc, layer) => Object.assign(acc, layer), {});
  }
};

/**
 * Extract and resolve log/pid paths for a given app configuration.
 * @param {Object} app app configuration object
 * @param {string} resolvedCwd cwd already resolved
 */
function resolveLogAndPidPaths(app, resolvedCwd) {
  const appName = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');
  const pathTypeMap = { pid: 'pid', log: 'log' };

  ['log', 'out', 'error', 'pid'].forEach(field => {
    const af = app[field + '_file'];
    if (af) app[field + '_file'] = resolveHome(af);

    const ext = field === 'pid' ? 'pid' : 'log';
    const isStd = !['log', 'pid'].includes(field);

    let resolvedPath;

    if ((field === 'log' && af === true) || (field !== 'log' && af === undefined)) {
      resolvedPath = [cst['DEFAULT_' + ext.toUpperCase() + '_PATH'], appName + (isStd ? '-' + field : '') + '.' + ext];
    } else if (af !== 'NULL' && af !== '/dev/null') {
      const fullAfPath = path.resolve(resolvedCwd, af);
      const dir = path.dirname(fullAfPath);

      if (!fs.existsSync(dir)) {
        Common.printOut(cst.PREFIX_MSG + 'Creating folder: ' + dir);
        try {
          require('mkdirp').sync(dir);
        } catch (err) {
          Common.printError(cst.PREFIX_MSG_ERR + 'Could not create folder: ' + path.dirname(af));
          throw new Error('Could not create folder');
        }
      }

      resolvedPath = [resolvedCwd, af];
    }

    if (af !== 'NULL' && af !== '/dev/null') {
      if (resolvedPath) {
        const pmField = isStd ? field.substr(0, 3) + '_' : '';
        const pmSuffix = ext === 'pid' ? 'pid' : 'log';
        app['pm_' + pmField + pmSuffix + '_path'] = path.resolve.apply(null, resolvedPath);
      }
    } else if (path.sep === '\\') {
      app['pm_' + (isStd ? field.substr(0, 3) + '_' : '') + ext + '_path'] = '\\\\.\\NUL';
    } else {
      app['pm_' + (isStd ? field.substr(0, 3) + '_' : '') + ext + '_path'] = '/dev/null';
    }

    delete app[field + '_file'];
  });
}

/**
 * Set of known configuration file extensions and their types.
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
 * Check if filename is a known config file.
 * @param {string} filename path to check
 * @returns {string|null} 'json', 'yaml', 'js' or null
 */
Common.isConfigFile = function(filename) {
  if (typeof filename !== 'string') return null;

  for (const ext in Common.knonwConfigFileExtensions) {
    if (filename.indexOf(ext) !== -1) {
      return Common.knonwConfigFileExtensions[ext];
    }
  }

  return null;
};

/**
 * Generate candidate paths by appending config extensions to filename.
 * @param {string} name basename
 * @returns {string[]} candidate paths
 */
Common.getConfigFileCandidates = function(name) {
  return Object.keys(Common.knonwConfigFileExtensions).map(ext => name + ext);
};

/**
 * Parse configuration string/file into runtime-usable config object.
 * @param {string} confObj configuration file content
 * @param {string} filename original filename
 * @returns {Object} parsed configuration
 */
Common.parseConfig = function(confObj, filename) {
  const yamljs = require('js-yaml');
  const vm = require('vm');
  const isConfigFile = Common.isConfigFile(filename);

  if (isConfigFile === 'json' || !filename || filename === 'pipe' || filename === 'none') {
    const code = '(' + confObj + ')';
    return vm.runInThisContext(code, {
      filename: path.resolve(filename),
      displayErrors: false,
      timeout: 1000
    });
  }

  if (isConfigFile === 'yaml') {
    return yamljs.load(confObj.toString());
  }

  if (isConfigFile === 'js' || isConfigFile === 'mjs') {
    const configPath = require.resolve(path.resolve(filename));
    delete require.cache[configPath];
    return require(configPath);
  }
};

/**
 * Normalize error-like values into an Error object.
 * @param {any} e potential error value
 * @returns {Error} Error object
 */
Common.retErr = function(e) {
  if (!e) return new Error('Unidentified error');
  if (e instanceof Error) return e;
  return new Error(e);
};

Common.sink = {};

/**
 * Validate and set cron restart behavior if applicable.
 * @param {Object} app app configuration
 * @returns {void|Error}
 */
Common.sink.determineCron = function(app) {
  if (app.cron_restart === 0 || app.cron_restart === '0') {
    Common.printOut(cst.PREFIX_MSG + 'disabling cron restart');
    return;
  }

  if (!app.cron_restart) return;

  try {
    const Croner = require('croner');
    Common.printOut(cst.PREFIX_MSG + 'cron restart at ' + app.cron_restart);
    Croner(app.cron_restart);
  } catch (ex) {
    return new Error(`Cron pattern error: ${ex.message}`);
  }
};

/**
 * Resolve execution mode based on app configuration.
 * @param {Object} app app instance config
 */
Common.sink.determineExecMode = function(app) {
  if (app.exec_mode) {
    app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');
  }

  if (!app.exec_mode &&
      (app.instances >= 1 || app.instances === 0 || app.instances === -1) &&
      (app.exec_interpreter.includes('node') || app.exec_interpreter.includes('bun'))) {
    app.exec_mode = 'cluster_mode';
  } else if (!app.exec_mode) {
    app.exec_mode = 'fork_mode';
  }

  if (typeof app.instances === 'undefined') app.instances = 1;
};

/**
 * Resolve Node.js version via NVM for specified interpreter version string.
 * @param {Object} app app instance
 * @returns {boolean} false if cluster mode or NVM unavailable
 */
var resolveNodeInterpreter = function(app) {
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
  const pathSuffix = getNvmNodePathSuffix(nodeVersion);
  const nvmNodePath = path.join(nvmPath, pathSuffix);

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
      const archSuffix = ['32', '64'][process.arch === 'x64' ? 1 : 0];
      app.exec_interpreter = nvmNodePath.replace(/node/, 'node' + process.arch.slice(1));
    }
  }

  Common.printOut(cst.PREFIX_MSG + chalk.green.bold('Setting Node to v%s (path=%s)'),
                  nodeVersion,
                  nvmNodePath);
  app.exec_interpreter = nvmNodePath;

  /**
   * Determine correct NVM path suffix for requested Node version.
   * @param {string} nodeVersion requested version
   * @returns {string} relative path within NVM
   */
  function getNvmNodePathSuffix(nodeVersion) {
    const suffixes = {
      windows: '/v' + nodeVersion + '/node.exe',
      standard: '/versions/node/v' + nodeVersion + '/bin/node'
    };

    if (cst.IS_WINDOWS) return suffixes.windows;
    return semver.satisfies(nodeVersion, '>= 0.12.0') ? suffixes.standard : '/v' + nodeVersion + '/bin/node';
  }
};

/**
 * Resolve interpreter for app based on script extension or user specification.
 * @param {Object} app app configuration
 * @returns {Object} modified app
 */
Common.sink.resolveInterpreter = function(app) {
  const noInterpreter = !app.exec_interpreter;
  const extName = path.extname(app.pm_exec_path);
  const betterInterpreter = extItps[extName];

  if (noInterpreter && (extName === '.js' || extName === '.ts') && cst.IS_BUN === true) {
    app.exec_interpreter = process.execPath;
  } else if (noInterpreter && betterInterpreter) {
    app.exec_interpreter = betterInterpreter;
    if (betterInterpreter === 'python') {
      resolvePythonInterpreter(app);
    }
  } else if (noInterpreter) {
    app.exec_interpreter = isBinary(app.pm_exec_path) ? 'none' : process.execPath;
  } else if (app.exec_interpreter.indexOf('node@') > -1) {
    resolveNodeInterpreter(app);
  }

  if (app.exec_interpreter.indexOf('python') > -1) app.env.PYTHONUNBUFFERED = '1';

  if (app.exec_interpreter === 'lsc') {
    app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/lsc');
  }

  if (app.exec_interpreter === 'coffee') {
    app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/coffee');
  }

  if (app.exec_interpreter !== 'none' && !which(app.exec_interpreter)) {
    if (app.exec_interpreter === 'node') {
      Common.warn(`Using builtin node.js version on version ${process.version}`);
      app.exec_interpreter = cst.BUILTIN_NODE_PATH;
    } else {
      throw new Error(`Interpreter ${app.exec_interpreter} is NOT AVAILABLE in PATH. (type 'which ${app.exec_interpreter}' to double check.)`);
    }
  }

  return app;
};

/**
 * Resolve python interpreter when default detection fails.
 * @param {Object} app app configuration
 */
function resolvePythonInterpreter(app) {
  if (!which('python')) {
    if (!which('python3')) {
      Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('python and python3 binaries not available in PATH'));
    } else {
      app.exec_interpreter = 'python3';
    }
  }
}

/**
 * Clone data using fclone.
 * @param {Object} obj data to clone
 * @returns {Object} deep copy
 */
Common.deepCopy = Common.serialize = Common.clone = function(obj) {
  if (obj === null || obj === undefined) return {};
  return fclone(obj);
};

/**
 * Output error message to stderr if not silenced.
 * @param {string|Error} msg message or error object
 * @returns {void|false}
 */
Common.errMod = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) return console.error(msg.message);
  return console.error(`${cst.PREFIX_MSG_MOD_ERR}${msg}`);
};

/**
 * Output error message prefixed with common prefix if not silenced.
 * @param {string|Error} msg message or error object
 * @returns {void|false}
 */
Common.err = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) return console.error(`${cst.PREFIX_MSG_ERR}${msg.message}`);
  return console.error(`${cst.PREFIX_MSG_ERR}${msg}`);
};

/**
 * Print error to stderr if not silenced.
 * @param {any} msg message or arguments for console.error
 * @returns {void|false}
 */
Common.printError = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) return console.error(msg.message);
  return console.error.apply(console, arguments);
};

/**
 * Print info to stdout if not silenced.
 * @param {string} msg message
 * @returns {void|false}
 */
Common.log = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG}${msg}`);
};

/**
 * Print info prefixed with INFO tag if not silenced.
 * @param {string} msg message
 * @returns {void|false}
 */
Common.info = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG_INFO}${msg}`);
};

/**
 * Print warning prefixed with WARNING tag if not silenced.
 * @param {string} msg message
 * @returns {void|false}
 */
Common.warn = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG_WARNING}${msg}`);
};

/**
 * Print module message if not silenced.
 * @param {string} msg message
 * @returns {void|false}
 */
Common.logMod = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG_MOD}${msg}`);
};

/**
 * Print arbitrary data to stdout if not silenced.
 * @param {...any} args arguments for console.log
 * @returns {void|false}
 */
Common.printOut = function() {
  if (process.env.PM2_SILENT === 'true' || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log.apply(console, arguments);
};

/**
 * Shallow extend destination object with source's keys.
 * @param {Object} destination target object
 * @param {Object|null|undefined} source source object
 * @returns {Object} extended destination
 */
Common.extend = function(destination, source) {
  if (typeof destination !== 'object') destination = {};
  if (!source || typeof source !== 'object') return destination;

  Object.keys(source).forEach(newKey => {
    if (source[newKey] !== '[object Object]') {
      destination[newKey] = source[newKey];
    }
  });

  return destination;
};

/**
 * Merge environment configurations safely by preserving non-PM2 variables.
 * @param {Object} origin target env
 * @param {Object|null|undefined} add source env
 * @returns {Object} merged env
 */
Common.safeExtend = function(origin, add) {
  if (!add || typeof add !== 'object') return origin;

  const keysToIgnore = [
    'name', 'exec_mode', 'env', 'args', 'pm_cwd', 'exec_interpreter', 'pm_exec_path',
    'node_args', 'pm_out_log_path', 'pm_err_log_path', 'pm_pid_path', 'pm_id',
    'status', 'pm_uptime', 'created_at', 'windowsHide', 'username', 'merge_logs',
    'kill_retry_time', 'prev_restart_delay', 'instance_var', 'unstable_restarts',
    'restart_time', 'axm_actions', 'pmx_module', 'command', 'watch', 'filter_env',
    'versioning', 'vizion_runing', 'MODULE_DEBUG', 'pmx', 'axm_options', 'created_at',
    'watch', 'vizion', 'axm_dynamic', 'axm_monitor', 'instances', 'automation',
    'autostart', 'autorestart', 'stop_exit_codes', 'unstable_restart', 'treekill',
    'exit_code', 'vizion'
  ];

  for (let i = add.length ? add.length : Object.keys(add).length; i-- > 0;) {
    const keys = Object.keys(add);
    const key = keys[i];
    if (keysToIgnore.indexOf(key) === -1 && add[key] !== '[object Object]') {
      origin[key] = add[key];
    }
  }
  return origin;
};

/**
 * Merge app.env with environment-specific overrides.
 * @param {Object} app_env base env
 * @param {string} envName environment name (e.g. production)
 * @param {Object} deployConf deployment configuration
 * @returns {Object} merged configuration
 */
Common.mergeEnvironmentVariables = function(app_env, envName, deployConf) {
  const app = fclone(app_env);

  for (const key in app.env) {
    if (typeof app.env[key] === 'object') {
      app.env[key] = JSON.stringify(app.env[key]);
    }
  }

  const newConf = Object.assign({}, app);

  if (envName) {
    if (deployConf && deployConf[envName] && deployConf[envName].env) {
      Object.assign(newConf.env, deployConf[envName].env);
    }

    Object.assign(newConf.env, app.env);

    const envKey = 'env_' + envName;
    if (envKey in app) {
      Object.assign(newConf.env, app[envKey]);
    } else {
      Common.printOut(cst.PREFIX_MSG_WARNING + chalk.bold('Environment [%s] is not defined in process file'), envName);
    }
  }

  delete newConf.exec_mode;

  return {
    current_conf: {},
    ...newConf.env
  };
};

/**
 * Resolve and validate app attributes before starting.
 * @param {Object} opts PM2 options
 * @param {Object} conf app configuration
 * @returns {Object} resolved app config
 * @throws {Error} on validation failure
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
 * Validate an array of app configurations.
 * @param {Array} appConfs app configuration array
 * @returns {Array} validated configuration list
 */
Common.verifyConfs = function(appConfs) {
  if (!appConfs || appConfs.length === 0) return [];

  appConfs = [].concat(appConfs);
  const verifiedConf = [];

  for (let i = 0; i < appConfs.length; i++) {
    let app = appConfs[i];

    app.exec_mode = app.exec_mode?.replace(/^(fork|cluster)$/, '$1_mode');

    if (app.cmd && !app.script) {
      app.script = app.cmd;
      delete app.cmd;
    }

    if (app.command && !app.script) {
      app.script = app.command;
      delete app.command;
    }

    app.env = app.env || {};

    Common.renderApplicationName(app);

    if (app.execute_command === true) {
      app.exec_mode = 'fork';
      delete app.execute_command;
    }

    app.username = Common.getCurrentUsername();

    if (app.script && app.script.indexOf(' ') > -1 && cst.IS_WINDOWS === false) {
      resolveScriptWithShell(app);
    }

    if (app.time || process.env.ASZ_MODE) {
      app.log_date_format = 'YYYY-MM-DDTHH:mm:ss';
    }

    resolveUserAndGroupSettings(app);

    if (process.env.PM2_DEEP_MONITORING) app.deep_monitoring = true;
    if (app.automation === false) app.pmx = false;
    if (app.disable_trace) {
      app.trace = false;
      delete app.disable_trace;
    }

    if (app.instances === 'max') app.instances = 0;
    if (typeof app.instances === 'string') app.instances = parseInt(app.instances) || 0;

    if (app.exec_mode !== 'cluster_mode' &&
        !app.instances &&
        typeof app.merge_logs === 'undefined') {
      app.merge_logs = true;
    }

    if (app.cron_restart) {
      const ret = Common.sink.determineCron(app);
      if (ret instanceof Error) return ret;
    }

    const configValidation = Config.validateJSON(app);
    if (configValidation.errors && configValidation.errors.length > 0) {
      configValidation.errors.forEach(err => Common.warn(err));
      return new Error(configValidation.errors);
    }

    verifiedConf.push(configValidation.config);
  }

  return verifiedConf;
};

/**
 * Resolve app script execution via shell when containing spaces.
 * @param {Object} app app configuration
 */
function resolveScriptWithShell(app) {
  const bashPath = which('bash');
  const shPath = which('sh');
  const script = app.script;

  if (bashPath) {
    app.script = 'bash';
    app.args = ['-c', script];
  } else if (shPath) {
    app.script = 'sh';
    app.args = ['-c', script];
  } else {
    Common.warn('bash or sh not available in $PATH, keeping script as is');
  }

  if (!app.name) app.name = script;
}

/**
 * Resolve user and group settings for POSIX platforms.
 * @param {Object} app app configuration
 */
function resolveUserAndGroupSettings(app) {
  if (app.uid || app.gid || app.user) {
    if (cst.IS_WINDOWS) {
      Common.printError(cst.PREFIX_MSG_ERR + '--uid and --git does not works on windows');
      return new Error('--uid and --git does not works on windows');
    }

    if (process.env.NODE_ENV !== 'test' && process.getuid && process.getuid() !== 0) {
      Common.printError(cst.PREFIX_MSG_ERR + 'To use --uid and --gid please run pm2 as root');
      return new Error('To use UID and GID please run PM2 as root');
    }

    const passwd = require('./tools/passwd.js');

    try {
      const users = passwd.getUsers();
      const userInfo = users[app.uid || app.user];

      if (!userInfo) {
        Common.printError(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
        return new Error(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
      }

      app.env.HOME = userInfo.homedir;
      app.uid = parseInt(userInfo.userId);

      if (app.gid) {
        const groups = passwd.getGroups();
        const groupInfo = groups[app.gid];

        if (!groupInfo) {
          Common.printError(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
          return new Error(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
        }

        app.gid = parseInt(groupInfo.id);
      } else {
        app.gid = parseInt(userInfo.groupId);
      }
    } catch (e) {
      Common.printError(e);
      return new Error(e);
    }
  }
}

/**
 * Get current system username.
 * @returns {string} username string
 */
Common.getCurrentUsername = function() {
  let username = '';

  if (os.userInfo) {
    try {
      username = os.userInfo().username;
    } catch (err) {
      // handle unhandled error case
    }
  }

  if (!username) {
    username = process.env.USER || process.env.LNAME ||
               process.env.USERNAME || process.env.SUDO_USER ||
               process.env.C9_USER || process.env.LOGNAME;
  }

  return username;
};

/**
 * Generate default name from script basename if missing.
 * @param {Object} conf app configuration
 */
Common.renderApplicationName = function(conf) {
  if (!conf.name && conf.script) {
    conf.name = path.basename(conf.script);
    const lastDot = conf.name.lastIndexOf('.');
    if (lastDot > 0) {
      conf.name = conf.name.slice(0, lastDot);
    }
  }
};