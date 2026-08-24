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

function homedir() {
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

function resolveHome(filepath) {
  if (filepath[0] === '~') {
    return path.join(homedir(), filepath.slice(1));
  }
  return filepath;
}

/**
 * Determine if CLI should run in silent mode based on arguments and environment.
 * @method determineSilentCLI
 */
Common.determineSilentCLI = function() {
  var variadicArgsDashesPos = process.argv.indexOf('--');
  var s1opt = process.argv.indexOf('--silent');
  var s2opt = process.argv.indexOf('-s');

  if (process.env.PM2_SILENT) {
    enableSilentMode();
    return;
  }

  if (variadicArgsDashesPos === -1) {
    if (s1opt > -1 || s2opt > -1) {
      enableSilentMode();
    }
    return;
  }

  if (s1opt > -1 && s1opt < variadicArgsDashesPos &&
      s2opt > -1 && s2opt < variadicArgsDashesPos) {
    enableSilentMode();
  }
};

/**
 * Enable silent mode by replacing console methods and setting discrete mode.
 */
function enableSilentMode() {
  for (var key in console) {
    var code = key.charCodeAt(0);
    if (code >= 97 && code <= 122) {
      console[key] = function() {};
    }
  }
  process.env.PM2_DISCRETE_MODE = true;
}

/**
 * Print version and exit if -v flag is present before '--'.
 * @method printVersion
 */
Common.printVersion = function() {
  var variadicArgsDashesPos = process.argv.indexOf('--');

  if (process.argv.indexOf('-v') > -1 &&
      process.argv.indexOf('-v') < variadicArgsDashesPos) {
    console.log(pkg.version);
    process.exit(0);
  }
};

/**
 * Attempt to acquire reload lock.
 * @method lockReload
 * @returns {number} 0 if lock acquired, otherwise time difference in ms.
 */
Common.lockReload = function() {
  try {
    var t1 = fs.readFileSync(cst.PM2_RELOAD_LOCKFILE).toString();

    if (t1 && t1 !== '') {
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
};

/**
 * Release reload lock.
 * @method unlockReload
 */
Common.unlockReload = function() {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, '');
  } catch (e) {
    console.error(e.message || e);
  }
};

/**
 * Resolve app paths and replace missing values with defaults.
 * @method prepareAppConf
 * @param {Object} opts Options object
 * @param {Object} app Application configuration object
 * @returns {Object|Error} Updated app object or Error
 */
Common.prepareAppConf = function(opts, app) {
  if (!app.script) {
    return new Error('No script path - aborting');
  }

  var cwd = app.cwd ? path.resolve(app.cwd) : null;
  process.env.PWD = app.cwd;

  if (!app.node_args) {
    app.node_args = [];
  }

  if (app.port && app.env) {
    app.env.PORT = app.port;
  }

  if (cwd && cwd[0] !== '/') {
    cwd = path.resolve(process.cwd(), cwd);
  }
  cwd = cwd || opts.cwd;

  app.pm_exec_path = path.resolve(cwd, app.script);

  if (!fs.existsSync(app.pm_exec_path)) {
    var ckd = which(app.script);
    if (ckd) {
      app.pm_exec_path = typeof ckd === 'string' ? ckd : ckd.toString();
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

  var env = {};
  if (cst.PM2_PROGRAMMATIC || process.env.pm_id) {
    Common.safeExtend(env, process.env);
  } else {
    env = process.env;
  }

  app.env = [
    {},
    (app.filter_env && app.filter_env.length > 0) ? filterEnv(env) : env,
    app.env || {}
  ].reduce(function(e1, e2) {
    return Object.assign(e1, e2);
  }, {});

  app.pm_cwd = cwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch (e) {
    return e;
  }

  Common.sink.determineExecMode(app);

  var formated_app_name = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');

  ['log', 'out', 'error', 'pid'].forEach(function(f) {
    var af = app[f + '_file'];
    var ps;
    var ext = (f === 'pid' ? 'pid' : 'log');
    var isStd = !~['log', 'pid'].indexOf(f);

    if (af) af = resolveHome(af);

    if ((f === 'log' && typeof af === 'boolean' && af) || (f !== 'log' && !af)) {
      ps = [cst['DEFAULT_' + ext.toUpperCase() + '_PATH'], formated_app_name + (isStd ? '-' + f : '') + '.' + ext];
    } else if ((f !== 'log' || (f === 'log' && af)) && af !== 'NULL' && af !== '/dev/null') {
      ps = [cwd, af];

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
    }

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
 * Filter environment variables based on app.filter_env setting.
 * @param {Object} envObj Environment object
 * @returns {Object} Filtered environment object
 */
function filterEnv(envObj) {
  if (app.filter_env === true) {
    return {};
  }

  if (typeof app.filter_env === 'string') {
    delete envObj[app.filter_env];
    return envObj;
  }

  var new_env = {};
  var allowedKeys = app.filter_env.reduce(function(acc, current) {
    return acc.filter(function(item) {
      return !item.includes(current);
    });
  }, Object.keys(envObj));

  allowedKeys.forEach(function(key) {
    new_env[key] = envObj[key];
  });

  return new_env;
}

/**
 * Known configuration file extensions and their types.
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
 * Check if filename is a configuration file.
 * @param {string} filename File path
 * @returns {string|null} Type ('json', 'yaml', 'js') or null
 */
Common.isConfigFile = function(filename) {
  if (typeof filename !== 'string') {
    return null;
  }

  for (var extension in Common.knonwConfigFileExtensions) {
    if (filename.indexOf(extension) !== -1) {
      return Common.knonwConfigFileExtensions[extension];
    }
  }

  return null;
};

/**
 * Generate candidate filenames with known config extensions.
 * @param {string} name Base filename
 * @returns {string[]} Array of candidate filenames
 */
Common.getConfigFileCandidates = function(name) {
  return Object.keys(Common.knonwConfigFileExtensions).map(function(extension) {
    return name + extension;
  });
};

/**
 * Parse configuration file content.
 * @param {string} confObj Configuration content
 * @param {string} filename File path
 * @returns {Object} Parsed configuration object
 */
Common.parseConfig = function(confObj, filename) {
  var yamljs = require('js-yaml');
  var vm = require('vm');

  var isConfigFile = Common.isConfigFile(filename);

  if (!filename ||
      filename === 'pipe' ||
      filename === 'none' ||
      isConfigFile === 'json') {
    var code = '(' + confObj + ')';
    var sandbox = {};

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
    var confPath = require.resolve(path.resolve(filename));
    delete require.cache[confPath];
    return require(confPath);
  }
};

/**
 * Return error or create new error if input is not an Error.
 * @param {Error|string} e Input error
 * @returns {Error} Error object
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

/**
 * Handle cron restart configuration.
 * @method determineCron
 * @param {Object} app Application configuration
 * @returns {Error|undefined} Error if invalid cron pattern, otherwise undefined
 */
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
  } catch (ex) {
    return new Error(`Cron pattern error: ${ex.message}`);
  }
};

/**
 * Determine execution mode (cluster/fork).
 * @method determineExecMode
 * @param {Object} app Application configuration
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
 * Resolve Node.js interpreter using NVM.
 * @param {Object} app Application configuration
 * @returns {boolean} false if cluster mode, otherwise undefined
 */
var resolveNodeInterpreter = function(app) {
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
    return;
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
};

/**
 * Resolve interpreter for application.
 * @method resolveInterpreter
 * @param {Object} app Application configuration
 * @returns {Object} Updated app object
 */
Common.sink.resolveInterpreter = function(app) {
  var noInterpreter = !app.exec_interpreter;
  var extName = path.extname(app.pm_exec_path);
  var betterInterpreter = extItps[extName];

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
 * Deep copy/serialize/clone utility.
 * @param {Object} obj Object to clone
 * @returns {Object} Cloned object
 */
Common.deepCopy = Common.serialize = Common.clone = function(obj) {
  if (obj === null || obj === undefined) return {};
  return fclone(obj);
};

/**
 * Print module error message.
 * @param {string|Error} msg Message or error
 */
Common.errMod = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) return console.error(msg.message);
  return console.error(`${cst.PREFIX_MSG_MOD_ERR}${msg}`);
};

/**
 * Print error message.
 * @param {string|Error} msg Message or error
 */
Common.err = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) return console.error(`${cst.PREFIX_MSG_ERR}${msg.message}`);
  return console.error(`${cst.PREFIX_MSG_ERR}${msg}`);
};

/**
 * Print error message using console.error.
 * @param {string|Error} msg Message or error
 */
Common.printError = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) return console.error(msg.message);
  return console.error.apply(console, arguments);
};

/**
 * Print info message.
 * @param {string} msg Message
 */
Common.log = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG}${msg}`);
};

/**
 * Print info message with prefix.
 * @param {string} msg Message
 */
Common.info = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG_INFO}${msg}`);
};

/**
 * Print warning message.
 * @param {string} msg Message
 */
Common.warn = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG_WARNING}${msg}`);
};

/**
 * Print module message.
 * @param {string} msg Message
 */
Common.logMod = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG_MOD}${msg}`);
};

/**
 * Print output message.
 * @param {...*} args Arguments to log
 */
Common.printOut = function() {
  if (process.env.PM2_SILENT === 'true' || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log.apply(console, arguments);
};

/**
 * Raw extend utility.
 * @param {Object} destination Destination object
 * @param {Object} source Source object
 * @returns {Object} Extended object
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
 * Safe extend utility for environment variables.
 * @param {Object} origin Origin object
 * @param {Object} add Object to add
 * @returns {Object} Extended object
 */
Common.safeExtend = function(origin, add) {
  if (!add || typeof add !== 'object') return origin;

  var keysToIgnore = ['name', 'exec_mode', 'env', 'args', 'pm_cwd', 'exec_interpreter', 'pm_exec_path', 'node_args', 'pm_out_log_path', 'pm_err_log_path', 'pm_pid_path', 'pm_id', 'status', 'pm_uptime', 'created_at', 'windowsHide', 'username', 'merge_logs', 'kill_retry_time', 'prev_restart_delay', 'instance_var', 'unstable_restarts', 'restart_time', 'axm_actions', 'pmx_module', 'command', 'watch', 'filter_env', 'versioning', 'vizion_runing', 'MODULE_DEBUG', 'pmx', 'axm_options', 'created_at', 'watch', 'vizion', 'axm_dynamic', 'axm_monitor', 'instances', 'automation', 'autostart', 'autorestart', 'stop_exit_codes', 'unstable_restart', 'treekill', 'exit_code', 'vizion'];

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    if (keysToIgnore.indexOf(keys[i]) === -1 && add[keys[i]] !== '[object Object]') {
      origin[keys[i]] = add[keys[i]];
    }
  }
  return origin;
};

/**
 * Merge environment variables from deploy configuration.
 * @param {Object} app_env App environment object
 * @param {string} env_name Environment name
 * @param {Object} deploy_conf Deployment configuration
 * @returns {Object} Merged environment object
 */
Common.mergeEnvironmentVariables = function(app_env, env_name, deploy_conf) {
  var app = fclone(app_env);

  var new_conf = {
    env: {}
  };

  for (var key in app.env) {
    if (typeof app.env[key] === 'object') {
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
};

/**
 * Resolve app attributes before process initialization.
 * @method resolveAppAttributes
 * @param {Object} opts Options object
 * @param {Object} conf Application configuration
 * @returns {Object} Resolved app object
 */
Common.resolveAppAttributes = function(opts, conf) {
  var conf_copy = fclone(conf);

  var app = Common.prepareAppConf(opts, conf_copy);
  if (app instanceof Error) {
    throw new Error(app.message);
  }
  return app;
};

/**
 * Verify application configurations.
 * @method verifyConfs
 * @param {Array} appConfs Array of app configurations
 * @returns {Array} Verified configurations
 */
Common.verifyConfs = function(appConfs) {
  if (!appConfs || appConfs.length === 0) {
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

    Common.renderApplicationName(app);

    if (app.execute_command === true) {
      app.exec_mode = 'fork';
      delete app.execute_command;
    }

    app.username = Common.getCurrentUsername();

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
        warn('bash or sh not available in $PATH, keeping script as is');
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

      if (process.env.NODE_ENV !== 'test' && process.getuid && process.getuid() !== 0) {
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

    var ret;

    if (app.cron_restart) {
      if ((ret = Common.sink.determineCron(app)) instanceof Error) {
        return ret;
      }
    }

    var validation = Config.validateJSON(app);
    if (validation.errors && validation.errors.length > 0) {
      validation.errors.forEach(function(err) { warn(err) });
      return new Error(validation.errors);
    }

    verifiedConf.push(validation.config);
  }

  return verifiedConf;
};

/**
 * Get current username.
 * @returns {string} Username
 */
Common.getCurrentUsername = function() {
  var current_user = '';

  if (os.userInfo) {
    try {
      current_user = os.userInfo().username;
    } catch (err) {
      // For the case of unhandled error for uv_os_get_passwd
      // https://github.com/Unitech/pm2/issues/3184
    }
  }

  if (current_user === '') {
    current_user = process.env.USER || process.env.LNAME || process.env.USERNAME || process.env.SUDO_USER || process.env.C9_USER || process.env.LOGNAME;
  }

  return current_user;
};

/**
 * Render application name if not present.
 * @param {Object} conf Application configuration
 */
Common.renderApplicationName = function(conf) {
  if (!conf.name && conf.script) {
    conf.name = conf.script !== undefined ? path.basename(conf.script) : 'undefined';
    var lastDot = conf.name.lastIndexOf('.');
    if (lastDot > 0) {
      conf.name = conf.name.slice(0, lastDot);
    }
  }
};

/**
 * Show warning message.
 * @param {string} warning Warning message
 */
function warn(warning) {
  Common.printOut(cst.PREFIX_MSG_WARNING + warning);
}