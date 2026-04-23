const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');
const chalk = require('ansis');
const fclone = require('fclone');
const semver = require('semver');
const dayjs = require('dayjs');
const execSync = require('child_process').execSync;
const isBinary = require('./tools/isbinaryfile.js');
const cst = require('../constants.js');
const extItps = require('./API/interpreter.json');
const Config = require('./tools/Config');
const pkg = require('../package.json');
const which = require('./tools/which.js');

const Common = module.exports;

/**
 * Get the home directory of the current user.
 * @returns {string} The home directory.
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
 * Resolve a filepath that starts with '~' to the user's home directory.
 * @param {string} filepath The filepath to resolve.
 * @returns {string} The resolved filepath.
 */
function resolveHome(filepath) {
  if (filepath[0] === '~') {
    return path.join(getHomeDirectory(), filepath.slice(1));
  }
  return filepath;
}

/**
 * Determine if the CLI should be silent.
 * @returns {void}
 */
Common.determineSilentCLI = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const s1opt = process.argv.indexOf('--silent');
  const s2opt = process.argv.indexOf('-s');

  if (process.env.PM2_SILENT || (variadicArgsDashesPos > -1 &&
       (s1opt !== -1 && s1opt < variadicArgsDashesPos) &&
       (s2opt !== -1 && s2opt < variadicArgsDashesPos)) ||
      (variadicArgsDashesPos === -1 && (s1opt > -1 || s2opt > -1))) {
    for (const key in console) {
      const code = key.charCodeAt(0);
      if (code >= 97 && code <= 122) {
        console[key] = function() {};
      }
    }
    process.env.PM2_DISCRETE_MODE = true;
  }
};

/**
 * Print the version of PM2.
 * @returns {void}
 */
Common.printVersion = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');

  if (process.argv.indexOf('-v') > -1 && process.argv.indexOf('-v') < variadicArgsDashesPos) {
    console.log(pkg.version);
    process.exit(0);
  }
};

/**
 * Lock the reload process.
 * @returns {number} The lock timeout.
 */
Common.lockReload = function() {
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
};

/**
 * Unlock the reload process.
 * @returns {void}
 */
Common.unlockReload = function() {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, '');
  } catch (e) {
    console.error(e.message || e);
  }
};

/**
 * Prepare the application configuration.
 * @param {Object} opts The options.
 * @param {Object} app The application configuration.
 * @returns {Object} The prepared application configuration.
 */
Common.prepareAppConf = function(opts, app) {
  // Minimum validation
  if (!app.script) {
    return new Error('No script path - aborting');
  }

  const cwd = app.cwd ? path.resolve(app.cwd) : null;
  process.env.PWD = app.cwd;

  if (!app.node_args) {
    app.node_args = [];
  }

  if (app.port && app.env) {
    app.env.PORT = app.port;
  }

  // CWD option resolving
  if (cwd && cwd[0] !== '/') {
    cwd = path.resolve(process.cwd(), cwd);
  }
  cwd = cwd || opts.cwd;

  // Full path script resolution
  app.pm_exec_path = path.resolve(cwd, app.script);

  // If script does not exist after resolution
  if (!fs.existsSync(app.pm_exec_path)) {
    const ckd = which(app.script);
    if (ckd) {
      app.pm_exec_path = ckd;
    } else {
      // Throw critical error
      return new Error(`Script not found: ${app.pm_exec_path}`);
    }
  }

  // Auto detect .map file and enable source map support automatically
  if (app.disable_source_map_support !== true) {
    try {
      fs.accessSync(app.pm_exec_path + '.map', fs.constants.R_OK);
      app.source_map_support = true;
    } catch (e) {}
    delete app.disable_source_map_support;
  }

  delete app.script;

  // Set current env by first adding the process environment and then extending/replacing it
  // with env specified on command-line or JSON file.
  const env = {};

  // Do not copy internal pm2 environment variables if acting on process
  // is made from a programmatic script started by PM2 or if a pm_id is present in env
  if (cst.PM2_PROGRAMMATIC || process.env.pm_id) {
    Common.safeExtend(env, process.env);
  } else {
    env = process.env;
  }

  /**
   * Filter environment variables.
   * @param {Object} envObj The environment object.
   * @returns {Object} The filtered environment object.
   */
  function filterEnv(envObj) {
    if (app.filter_env === true) {
      return {};
    }

    if (typeof app.filter_env === 'string') {
      delete envObj[app.filter_env];
      return envObj;
    }

    const newEnv = {};
    const allowedKeys = app.filter_env.reduce((acc, current) =>
      acc.filter(item => !item.includes(current)), Object.keys(envObj));
    allowedKeys.forEach(key => newEnv[key] = envObj[key]);
    return newEnv;
  }

  app.env = [
    {}, (app.filter_env && app.filter_env.length > 0) ? filterEnv(process.env) : env, app.env || {}
  ].reduce(function(e1, e2) {
    return Object.assign(e1, e2);
  });

  app.pm_cwd = cwd;

  // Interpreter
  try {
    Common.sink.resolveInterpreter(app);
  } catch (e) {
    return e;
  }

  // Exec mode and cluster stuff
  Common.sink.determineExecMode(app);

  // Scary
  const formatedAppName = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');

  ['log', 'out', 'error', 'pid'].forEach(function(f) {
    const af = app[f + '_file'], ps, ext = (f === 'pid' ? 'pid' : 'log'), isStd = !~['log', 'pid'].indexOf(f);
    if (af) af = resolveHome(af);

    if ((f === 'log' && typeof af === 'boolean' && af) || (f !== 'log' && !af)) {
      ps = [cst['DEFAULT_' + ext.toUpperCase() + '_PATH'], formatedAppName + (isStd ? '-' + f : '') + '.' + ext];
    } else if ((f !== 'log' || (f === 'log' && af)) && af !== 'NULL' && af !== '/dev/null') {
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

    // PM2 paths
    if (af !== 'NULL' && af !== '/dev/null') {
      ps && (app['pm_' + (isStd ? f.substr(0, 3) + '_' : '') + ext + '_path'] = path.resolve.apply(null, ps));
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
 * Known config file extensions.
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
 * Check if a filename is a configuration file.
 * @param {string} filename The filename to check.
 * @returns {string|null} The configuration type or null if not a configuration file.
 */
Common.isConfigFile = function(filename) {
  if (typeof filename !== 'string') {
    return null;
  }

  for (const extension in Common.knownConfigFileExtensions) {
    if (filename.indexOf(extension) !== -1) {
      return Common.knownConfigFileExtensions[extension];
    }
  }

  return null;
};

/**
 * Get config file candidates.
 * @param {string} name The name to get candidates for.
 * @returns {string[]} The config file candidates.
 */
Common.getConfigFileCandidates = function(name) {
  return Object.keys(Common.knownConfigFileExtensions).map((extension) => name + extension);
};

/**
 * Parse a config file.
 * @param {string} confString The config file contents.
 * @param {string} filename The config file path.
 * @returns {Object} The parsed config object.
 */
Common.parseConfig = function(confObj, filename) {
  const yamljs = require('js-yaml');
  const vm = require('vm');

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
  } else if (isConfigFile === 'yaml') {
    return yamljs.load(confObj.toString());
  } else if (isConfigFile === 'js' || isConfigFile === 'mjs') {
    const confPath = require.resolve(path.resolve(filename));
    delete require.cache[confPath];
    return require(confPath);
  }
};

/**
 * Return an error object.
 * @param {Error|string} e The error to return.
 * @returns {Error} The error object.
 */
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

/**
 * Determine the cron restart.
 * @param {Object} app The application configuration.
 * @returns {void}
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
    } catch (ex) {
      return new Error(`Cron pattern error: ${ex.message}`);
    }
  }
};

/**
 * Determine the execution mode.
 * @param {Object} app The application configuration.
 * @returns {void}
 */
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

/**
 * Resolve the Node.js interpreter.
 * @param {Object} app The application configuration.
 * @returns {boolean} Whether the interpreter was resolved.
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
  } else {
    const nodeVersion = app.exec_interpreter.split('@')[1];
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

      Common.printOut(cst.PREFIX_MSG + chalk.green.bold('Setting Node to v%s (path=%s)'),
        nodeVersion,
        nvmNodePath);

      app.exec_interpreter = nvmNodePath;
    }
  }

  return true;
};

/**
 * Resolve the interpreter.
 * @param {Object} app The application configuration.
 * @returns {Object} The application configuration with the resolved interpreter.
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
      if (which('python') === null) {
        if (which('python3') === null) {
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

  if (app.exec_interpreter !== 'none' && which(app.exec_interpreter) === null) {
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
 * Deep copy an object.
 * @param {Object} obj The object to copy.
 * @returns {Object} The copied object.
 */
Common.deepCopy = Common.serialize = Common.clone = function(obj) {
  if (obj === null || obj === undefined) return {};
  return fclone(obj);
};

/**
 * Print an error message.
 * @param {string|Error} msg The error message.
 * @returns {void}
 */
Common.errMod = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return;
  if (msg instanceof Error) {
    return console.error(msg.message);
  }
  return console.error(`${cst.PREFIX_MSG_MOD_ERR}${msg}`);
};

/**
 * Print an error message.
 * @param {string|Error} msg The error message.
 * @returns {void}
 */
Common.err = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return;
  if (msg instanceof Error) {
    return console.error(`${cst.PREFIX_MSG_ERR}${msg.message}`);
  }
  return console.error(`${cst.PREFIX_MSG_ERR}${msg}`);
};

/**
 * Print an error message.
 * @param {string|Error} msg The error message.
 * @returns {void}
 */
Common.printError = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return;
  if (msg instanceof Error) {
    return console.error(msg.message);
  }
  return console.error.apply(console, arguments);
};

/**
 * Print a log message.
 * @param {string} msg The log message.
 * @returns {void}
 */
Common.log = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return;
  return console.log(`${cst.PREFIX_MSG}${msg}`);
};

/**
 * Print an info message.
 * @param {string} msg The info message.
 * @returns {void}
 */
Common.info = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return;
  return console.log(`${cst.PREFIX_MSG_INFO}${msg}`);
};

/**
 * Print a warning message.
 * @param {string} msg The warning message.
 * @returns {void}
 */
Common.warn = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return;
  return console.log(`${cst.PREFIX_MSG_WARNING}${msg}`);
};

/**
 * Print a log message.
 * @param {string} msg The log message.
 * @returns {void}
 */
Common.logMod = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return;
  return console.log(`${cst.PREFIX_MSG_MOD}${msg}`);
};

/**
 * Print a message.
 * @param {...*} args The message arguments.
 * @returns {void}
 */
Common.printOut = function() {
  if (process.env.PM2_SILENT === 'true' || process.env.PM2_PROGRAMMATIC === 'true') return;
  return console.log.apply(console, arguments);
};

/**
 * Extend an object.
 * @param {Object} destination The destination object.
 * @param {Object} source The source object.
 * @returns {Object} The extended object.
 */
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

/**
 * Safely extend an object.
 * @param {Object} origin The origin object.
 * @param {Object} add The object to add.
 * @returns {Object} The extended object.
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
 * Merge environment variables.
 * @param {Object} appEnv The application environment.
 * @param {string} envName The environment name.
 * @param {Object} deployConf The deployment configuration.
 * @returns {Object} The merged environment variables.
 */
Common.mergeEnvironmentVariables = function(appEnv, envName, deployConf) {
  const app = fclone(appEnv);

  const newConf = {
    env: {}
  };

  Object.assign(newConf, app);

  if (envName) {
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

  delete newConf.exec_mode;

  const res = {
    currentConf: {}
  };

  Object.assign(res, newConf.env);
  Object.assign(res.currentConf, newConf);

  if (app.exec_interpreter &&
    app.exec_interpreter.indexOf('@') > -1) {
    resolveNodeInterpreter(app);
    res.currentConf.exec_interpreter = app.exec_interpreter;
  }

  return res;
};

/**
 * Resolve application attributes.
 * @param {Object} opts The options.
 * @param {Object} conf The application configuration.
 * @returns {Object} The resolved application configuration.
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
 * Verify configurations.
 * @param {Array} appConfs The application configurations.
 * @returns {Array} The verified application configurations.
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

    if (app.exec_mode !== 'cluster_mode' &&
      !app.instances &&
      typeof app.merge_logs === 'undefined') {
      app.merge_logs = true;
    }

    let ret;

    if (app.cron_restart) {
      if ((ret = Common.sink.determineCron(app)) instanceof Error) {
        return ret;
      }
    }

    ret = Config.validateJSON(app);
    if (ret.errors && ret.errors.length > 0) {
      ret.errors.forEach(function(err) {
        Common.warn(err);
      });
      return new Error(ret.errors);
    }

    verifiedConf.push(ret.config);
  }

  return verifiedConf;
};

/**
 * Get the current username.
 * @returns {string} The current username.
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
 * Render an application name.
 * @param {Object} conf The application configuration.
 * @returns {void}
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
 * Show a warning message.
 * @param {string} warning The warning message.
 * @returns {void}
 */
function warn(warning) {
  Common.printOut(cst.PREFIX_MSG_WARNING + warning);
}