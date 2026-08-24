var path      = require('path');
var os        = require('os');
var util      = require('util');
var chalk     = require('ansis');
var fclone    = require('fclone');
var semver    = require('semver');
var dayjs     = require('dayjs');

/**
 * Common Utilities ONLY USED IN ->CLI<-
 */
var fs        = require('fs');
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
 * Determines the user's home directory based on platform and environment variables.
 * @returns {string|null} Path to home directory or null if undetermined.
 */
function homedir() {
  const env = process.env;
  const user = env.LOGNAME || env.USER || env.LNAME || env.USERNAME;

  if (process.platform === 'win32') {
    return env.USERPROFILE || env.HOMEDRIVE + env.HOMEPATH || env.HOME || null;
  }

  if (process.platform === 'darwin') {
    return env.HOME || (user ? '/Users/' + user : null);
  }

  if (process.platform === 'linux') {
    return env.HOME || (process.getuid() === 0 ? '/root' : (user ? '/home/' + user : null));
  }

  return env.HOME || null;
}

/**
 * Prepends the home directory to a filepath if it starts with '~'.
 * @param {string} filepath - Input file path.
 * @returns {string} Resolved path.
 */
function resolveHome(filepath) {
  if (filepath && filepath[0] === '~') {
    return path.join(homedir(), filepath.slice(1));
  }
  return filepath;
}

/**
 * Mutes console methods when SILENT mode is active.
 */
Common.determineSilentCLI = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const s1opt = process.argv.indexOf('--silent');
  const s2opt = process.argv.indexOf('-s');

  const shouldSilence = process.env.PM2_SILENT ||
    (variadicArgsDashesPos > -1 &&
      (s1opt !== -1 && s1opt < variadicArgsDashesPos) &&
      (s2opt !== -1 && s2opt < variadicArgsDashesPos)) ||
    (variadicArgsDashesPos === -1 && (s1opt > -1 || s2opt > -1));

  if (!shouldSilence) return;

  for (const key in console) {
    const code = key.charCodeAt(0);
    if (code >= 97 && code <= 122) {
      console[key] = function() {};
    }
  }
  process.env.PM2_DISCRETE_MODE = true;
};

/**
 * Prints the PM2 version if '-v' option is present and not after '--'.
 */
Common.printVersion = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const vOptPos = process.argv.indexOf('-v');

  if (vOptPos > -1 && vOptPos < variadicArgsDashesPos) {
    console.log(pkg.version);
    process.exit(0);
  }
};

/**
 * Locks PM2 reload by setting a timestamp.
 * @returns {number} 0 on success, timeout delta if lock is active.
 */
Common.lockReload = function() {
  try {
    const t1 = fs.readFileSync(cst.PM2_RELOAD_LOCKFILE).toString();
    if (!t1) return 0;

    const diff = dayjs().diff(parseInt(t1));
    if (diff < cst.RELOAD_LOCK_TIMEOUT) return diff;
  } catch (e) {}

  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, dayjs().valueOf().toString());
    return 0;
  } catch (e) {
    console.error(e.message || e);
    return 1;
  }
};

/**
 * Unlocks PM2 reload by clearing the lock file.
 */
Common.unlockReload = function() {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, '');
  } catch (e) {
    console.error(e.message || e);
  }
};

/**
 * Normalizes and validates an app configuration object.
 * @param {Object} opts - Options object.
 * @param {Object} app - App configuration.
 * @returns {Object|Error} - Validated app object or error.
 */
Common.prepareAppConf = function(opts, app) {
  if (!app.script) return new Error('No script path - aborting');

  const cwd = app.cwd ? path.resolve(app.cwd) : null;
  app.node_args = app.node_args || [];
  if (app.port && app.env) app.env.PORT = app.port;

  let fullCwd = cwd;
  if (fullCwd && fullCwd[0] !== '/') fullCwd = path.resolve(process.cwd(), fullCwd);
  fullCwd = fullCwd || opts.cwd;

  app.pm_exec_path = path.resolve(fullCwd, app.script);
  if (!fs.existsSync(app.pm_exec_path)) {
    const checkedWhich = which(app.script);
    if (checkedWhich) {
      app.pm_exec_path = typeof checkedWhich === 'string' ? checkedWhich : checkedWhich.toString();
    } else {
      return new Error(`Script not found: ${app.pm_exec_path}`);
    }
  }

  if (app.disable_source_map_support !== true) {
    try {
      fs.accessSync(app.pm_exec_path + '.map', fs.constants.R_OK);
      app.source_map_support = true;
    } catch (e) {}
    delete app.disable_source_map_support;
  }

  delete app.script;

  const env = {};
  if (cst.PM2_PROGRAMMATIC || process.env.pm_id) {
    Common.safeExtend(env, process.env);
  } else {
    Object.assign(env, process.env);
  }

  function filterEnv(envObj) {
    if (app.filter_env === true) return {};
    if (typeof app.filter_env === 'string') {
      delete envObj[app.filter_env];
      return envObj;
    }
    const allowedKeys = Object.keys(envObj).filter(key => !app.filter_env.some(pattern => key.includes(pattern)));
    return allowedKeys.reduce((acc, key) => ({ ...acc, [key]: envObj[key] }), {});
  }

  const baseEnv = app.filter_env && app.filter_env.length > 0 ? filterEnv(process.env) : env;
  app.env = Object.assign({}, baseEnv, app.env || {});

  app.pm_cwd = fullCwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch (e) {
    return e;
  }

  Common.sink.determineExecMode(app);

  const formatedAppName = app.name.replace(/[^a-zA-Z0-9.\\-]/g, '-');

  ['log', 'out', 'error', 'pid'].forEach(function(f) {
    let filePath = app[f + '_file'];
    const ext = (f === 'pid') ? 'pid' : 'log';
    const isStd = !['log', 'pid'].includes(f);
    filePath = filePath ? resolveHome(filePath) : null;

    let paths = [];
    if ((f === 'log' && filePath === true) ||
        (f !== 'log' && filePath === undefined)) {
      paths = [cst['DEFAULT_' + ext.toUpperCase() + '_PATH'], formatedAppName + (isStd ? '-' + f : '') + '.' + ext];
    } else if (filePath !== 'NULL' && filePath !== '/dev/null') {
      paths = [fullCwd, filePath];
      const dir = path.dirname(path.resolve(fullCwd, filePath));
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

    if (filePath !== 'NULL' && filePath !== '/dev/null') {
      app['pm_' + (isStd ? f.substr(0, 3) + '_' : '') + ext + '_path'] = paths.length ? path.resolve.apply(null, paths) : null;
    } else if (path.sep === '\\') {
      app['pm_' + (isStd ? f.substr(0, 3) + '_' : '') + ext + '_path'] = '\\\\.\\NUL';
    } else {
      app['pm_' + (isStd ? f.substr(0, 3) + '_' : '') + ext + '_path'] = '/dev/null';
    }

    delete app[f + '_file'];
  });

  return app;
};

/**
 * Maps file extensions to configuration types.
 * @type {Object}
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
 * Checks if a filename is a recognized configuration file.
 * @param {string} filename - Filename to check.
 * @returns {string|null} Return 'json', 'yaml', 'js' or null.
 */
Common.isConfigFile = function(filename) {
  if (typeof filename !== 'string') return null;

  for (let ext in Common.knonwConfigFileExtensions) {
    if (filename.indexOf(ext) !== -1) {
      return Common.knonwConfigFileExtensions[ext];
    }
  }
  return null;
};

/**
 * Generates candidate filenames with possible extensions.
 * @param {string} name - Base name.
 * @returns {Array<string>} List of candidate filenames.
 */
Common.getConfigFileCandidates = function(name) {
  return Object.keys(Common.knonwConfigFileExtensions).map(ext => name + ext);
};

/**
 * Parses a configuration file (JSON, YAML, JS).
 * @param {string} confObj - File contents
 * @param {string} filename - Path to file
 * @returns {Object} Parsed config object.
 */
Common.parseConfig = function(confObj, filename) {
  const yamljs = require('js-yaml');
  const vm = require('vm');

  const isConfigFile = Common.isConfigFile(filename);

  if (!filename || filename === 'pipe' || filename === 'none' || isConfigFile === 'json') {
    const code = '(' + confObj + ')';
    return vm.runInThisContext(code, { filename: path.resolve(filename), displayErrors: false, timeout: 1000 });
  }

  if (isConfigFile === 'yaml') {
    return yamljs.load(confObj.toString());
  }

  if (isConfigFile === 'js' || isConfigFile === 'mjs') {
    const confPath = require.resolve(path.resolve(filename));
    delete require.cache[confPath];
    return require(confPath);
  }

  return {};
};

/**
 * Converts raw errors to Error objects.
 * @param {Error|string} e - Error or string message.
 * @returns {Error} Normalized error.
 */
Common.retErr = function(e) {
  if (!e) return new Error('Unidentified error');
  if (e instanceof Error) return e;
  return new Error(e);
};

/**
 * Determines the app execution mode and instances.
 * @param {Object} app - App configuration.
 */
Common.sink.determineExecMode = function(app) {
  if (app.exec_mode) {
    app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');
  }

  if (!app.exec_mode && (app.instances >= 1 || app.instances === 0 || app.instances === -1) &&
    (app.exec_interpreter.includes('node') || app.exec_interpreter.includes('bun'))) {
    app.exec_mode = 'cluster_mode';
  } else if (!app.exec_mode) {
    app.exec_mode = 'fork_mode';
  }

  if (typeof app.instances === 'undefined') app.instances = 1;
};

/**
 * Resolves a custom Node.js version using NVM.
 * @param {Object} app - App configuration.
 * @returns {boolean} False if cluster mode used.
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
    return true;
  }

  let nodeVersion = app.exec_interpreter.split('@')[1];
  const pathToNode = cst.IS_WINDOWS
    ? '/v' + nodeVersion + '/node.exe'
    : semver.satisfies(nodeVersion, '>= 0.12.0')
      ? '/versions/node/v' + nodeVersion + '/bin/node'
      : '/v' + nodeVersion + '/bin/node';

  const nvmNodePath = path.join(nvmPath, pathToNode);
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
 * Resolves the interpreter to use for an app.
 * @param {Object} app - App configuration.
 * @returns {Object} Updated app object.
 */
Common.sink.resolveInterpreter = function(app) {
  const noInterpreter = !app.exec_interpreter;
  const extName = path.extname(app.pm_exec_path);
  const betterInterpreter = extItps[extName];

  if (noInterpreter && (extName === '.js' || extName === '.ts') && cst.IS_BUN === true) {
    noInterpreter = false;
    app.exec_interpreter = process.execPath;
  }

  if (noInterpreter && betterInterpreter) {
    app.exec_interpreter = betterInterpreter;

    if (betterInterpreter === 'python') {
      if (!which('python')) {
        if (!which('python3')) {
          Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('python and python3 binaries not available in PATH'));
        } else {
          app.exec_interpreter = 'python3';
        }
      }
    }
  } else if (noInterpreter) {
    app.exec_interpreter = isBinary(app.pm_exec_path) ? 'none' : process.execPath;
  } else if (app.exec_interpreter.indexOf('node@') > -1) {
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
 * Clones or deep copies an object.
 * @param {Object} obj - Input object.
 * @returns {Object} Deep copy of object.
 */
Common.deepCopy = Common.serialize = Common.clone = function(obj) {
  if (obj === null || obj === undefined) return {};
  return fclone(obj);
};

/**
 * Displays error messages based on mode.
 * @param {string|Error} msg - Message or error.
 */
Common.errMod = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return;
  if (msg instanceof Error) return console.error(msg.message);
  console.error(`${cst.PREFIX_MSG_MOD_ERR}${msg}`);
};

/**
 * Displays error messages.
 * @param {string|Error} msg - Message or error.
 */
Common.err = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return;
  if (msg instanceof Error) return console.error(`${cst.PREFIX_MSG_ERR}${msg.message}`);
  console.error(`${cst.PREFIX_MSG_ERR}${msg}`);
};

/**
 * Prints errors to console.
 * @param {string|Error} msg - Message or error.
 */
Common.printError = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return;
  if (msg instanceof Error) return console.error(msg.message);
  console.error.apply(console, arguments);
};

/**
 * Logs messages without prefix.
 * @param {string} msg - Message.
 */
Common.log = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return;
  console.log(`${cst.PREFIX_MSG}${msg}`);
};

/**
 * Logs info messages prefixed with INFO.
 * @param {string} msg - Message.
 */
Common.info = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return;
  console.log(`${cst.PREFIX_MSG_INFO}${msg}`);
};

/**
 * Logs warning messages.
 * @param {string} msg - Warning message.
 */
Common.warn = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return;
  console.log(`${cst.PREFIX_MSG_WARNING}${msg}`);
};

/**
 * Logs module-related messages.
 * @param {string} msg - Message.
 */
Common.logMod = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return;
  console.log(`${cst.PREFIX_MSG_MOD}${msg}`);
};

/**
 * Prints regular output.
 * @param {...*} args - Arguments to print.
 */
Common.printOut = function() {
  if (process.env.PM2_SILENT === 'true' || process.env.PM2_PROGRAMMATIC === 'true') return;
  console.log.apply(console, arguments);
};

/**
 * Extends destination object with source properties.
 * @param {Object} destination - Target object.
 * @param {Object} source - Source object.
 * @returns {Object} Modified destination.
 */
Common.extend = function(destination, source) {
  if (typeof destination !== 'object') destination = {};
  if (!source || typeof source !== 'object') return destination;

  Object.keys(source).forEach(function(key) {
    if (source[key] !== '[object Object]') destination[key] = source[key];
  });

  return destination;
};

/**
 * Safely merges environment variables preventing PM2 internal overrides.
 * @param {Object} origin - Origin env.
 * @param {Object} add - Values to add.
 * @returns {Object} Modified origin env.
 */
Common.safeExtend = function(origin, add) {
  if (!add || typeof add !== 'object') return origin;

  const keysToIgnore = [
    'name', 'exec_mode', 'env', 'args', 'pm_cwd', 'exec_interpreter',
    'pm_exec_path', 'node_args', 'pm_out_log_path', 'pm_err_log_path',
    'pm_pid_path', 'pm_id', 'status', 'pm_uptime', 'created_at',
    'windowsHide', 'username', 'merge_logs', 'kill_retry_time',
    'prev_restart_delay', 'instance_var', 'unstable_restarts',
    'restart_time', 'axm_actions', 'pmx_module', 'command', 'watch',
    'filter_env', 'versioning', 'vizion_runing', 'MODULE_DEBUG', 'pmx',
    'axm_options', 'created_at', 'autostart', 'autorestart',
    'stop_exit_codes', 'unstable_restart', 'treekill', 'exit_code', 'vizion'
  ];

  Object.keys(add).forEach(key => {
    if (keysToIgnore.indexOf(key) === -1 && add[key] !== '[object Object]') {
      origin[key] = add[key];
    }
  });
  return origin;
};

/**
 * Merges app environment with environment-specific overrides.
 * @param {Object} app_env - Base environment.
 * @param {string} env_name - Environment name.
 * @param {Object} deploy_conf - Deployment config.
 * @returns {Object} Merged environment object.
 */
Common.mergeEnvironmentVariables = function(app_env, env_name, deploy_conf) {
  const app = fclone(app_env);

  for (let key in app.env) {
    if (typeof app.env[key] === 'object') app.env[key] = JSON.stringify(app.env[key]);
  }

  const newConf = { env: {} };
  Object.assign(newConf, app);

  if (env_name) {
    if (deploy_conf && deploy_conf[env_name] && deploy_conf[env_name]['env']) {
      Object.assign(newConf.env, deploy_conf[env_name]['env']);
    }
    Object.assign(newConf.env, app.env);

    if ('env_' + env_name in app) {
      Object.assign(newConf.env, app['env_' + env_name]);
    } else {
      Common.printOut(cst.PREFIX_MSG_WARNING + chalk.bold('Environment [%s] is not defined in process file'), env_name);
    }
  }

  delete newConf.exec_mode;

  const res = { current_conf: {} };
  Object.assign(res, newConf.env);
  Object.assign(res.current_conf, newConf);

  if (app.exec_interpreter && app.exec_interpreter.indexOf('@') > -1) {
    resolveNodeInterpreter(app);
    res.current_conf.exec_interpreter = app.exec_interpreter;
  }

  return res;
};

/**
 * Resolves full app attributes and validates configuration.
 * @param {Object} opts - Options.
 * @param {Object} conf - App configuration.
 * @returns {Object} Resolved app config.
 */
Common.resolveAppAttributes = function(opts, conf) {
  const confCopy = fclone(conf);
  const app = Common.prepareAppConf(opts, confCopy);
  if (app instanceof Error) throw new Error(app.message);
  return app;
};

/**
 * Validates and normalizes app configurations.
 * @param {Array} appConfs - List of app configs.
 * @returns {Array} Validated configurations.
 */
Common.verifyConfs = function(appConfs) {
  if (!appConfs || appConfs.length === 0) return [];

  appConfs = [].concat(appConfs);
  const verifiedConf = [];

  for (let i = 0; i < appConfs.length; i++) {
    const app = appConfs[i];

    if (app.exec_mode) app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');

    if (app.cmd && !app.script) { app.script = app.cmd; delete app.cmd; }
    if (app.command && !app.script) { app.script = app.command; delete app.command; }

    if (!app.env) app.env = {};

    Common.renderApplicationName(app);

    if (app.execute_command === true) {
      app.exec_mode = 'fork';
      delete app.execute_command;
    }

    app.username = Common.getCurrentUsername();

    if (app.script && app.script.indexOf(' ') > -1 && cst.IS_WINDOWS === false) {
      const _script = app.script;
      if (which('bash')) {
        app.script = 'bash';
        app.args = ['-c', _script];
        if (!app.name) app.name = _script;
      } else if (which('sh')) {
        app.script = 'sh';
        app.args = ['-c', _script];
        if (!app.name) app.name = _script;
      } else {
        warn('bash or sh not available in $PATH, keeping script as is');
      }
    }

    if (app.time || process.env.ASZ_MODE) {
      app.log_date_format = 'YYYY-MM-DDTHH:mm:ss';
    }

    if (app.uid || app.gid || app.user) {
      if (cst.IS_WINDOWS === true) {
        Common.printError(cst.PREFIX_MSG_ERR + '--uid and --gid do not work on Windows');
        return new Error('--uid and --gid do not work on Windows');
      }

      if (process.env.NODE_ENV !== 'test' && process.getuid && process.getuid() !== 0) {
        Common.printError(cst.PREFIX_MSG_ERR + 'To use --uid and --gid please run pm2 as root');
        return new Error('To use UID and GID please run PM2 as root');
      }

      const passwd = require('./tools/passwd.js');
      let users, groups;

      try { users = passwd.getUsers(); } catch(e) { Common.printError(e); return new Error(e); }

      const userInfo = users[app.uid || app.user];
      if (!userInfo) {
        Common.printError(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
        return new Error(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
      }

      app.env.HOME = userInfo.homedir;
      app.uid = parseInt(userInfo.userId);

      if (app.gid) {
        try { groups = passwd.getGroups(); } catch(e) { Common.printError(e); return new Error(e); }
        const groupInfo = groups[app.gid];
        if (!groupInfo) {
          Common.printError(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
          return new Error(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
        }
        app.gid = parseInt(groupInfo.id);
      } else {
        app.gid = parseInt(userInfo.groupId);
      }
    }

    if (process.env.PM2_DEEP_MONITORING) app.deep_monitoring = true;

    if (app.automation === false) app.pmx = false;

    if (app.disable_trace) {
      app.trace = false;
      delete app.disable_trace;
    }

    if (app.instances === 'max') app.instances = 0;

    if (typeof app.instances === 'string') {
      app.instances = parseInt(app.instances) || 0;
    }

    if (app.exec_mode !== 'cluster_mode' && !app.instances && typeof app.merge_logs === 'undefined') {
      app.merge_logs = true;
    }

    if (app.cron_restart) {
      const cronResult = Common.sink.determineCron(app);
      if (cronResult instanceof Error) return cronResult;
    }

    const validation = Config.validateJSON(app);
    if (validation.errors && validation.errors.length > 0) {
      validation.errors.forEach(err => warn(err));
      return new Error(validation.errors);
    }

    verifiedConf.push(validation.config);
  }

  return verifiedConf;
};

/**
 * Gets the current OS username.
 * @returns {string} Username.
 */
Common.getCurrentUsername = function() {
  let current_user = '';

  if (osuserInfo) {
    try {
      current_user = os.userInfo().username;
    } catch (err) {
      // fallback
    }
  }

  if (!current_user) {
    current_user = process.env.USER || process.env.LNAME || process.env.USERNAME ||
                   process.env.SUDO_USER || process.env.C9_USER || process.env.LOGNAME;
  }

  return current_user;
};

/**
 * Renders a default application name from its script path.
 * @param {Object} conf - App configuration.
 */
Common.renderApplicationName = function(conf) {
  if (!conf.name && conf.script) {
    conf.name = path.basename(conf.script);
    const lastDot = conf.name.lastIndexOf('.');
    if (lastDot > 0) conf.name = conf.name.slice(0, lastDot);
  }
};

/**
 * Private method to issue warnings.
 * @param {string} warning - Warning message.
 */
function warn(warning) {
  Common.printOut(cst.PREFIX_MSG_WARNING + warning);
}