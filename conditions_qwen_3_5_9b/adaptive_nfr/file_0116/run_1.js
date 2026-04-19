```javascript
/**
 * Copyright 2013-2022 the PM2 project authors. All rights reserved.
 * Use of this source code is governed by a license that
 * can be found in the LICENSE file.
 */

/**
 * Common Utilities ONLY USED IN ->CLI<-
 */

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
 * Determine the home directory based on platform and environment variables.
 * @returns {string|null} Home directory path or null
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
 * Resolve a filepath that may start with a tilde (~) to an absolute path.
 * @param {string} filepath - The filepath to resolve
 * @returns {string} Resolved absolute path
 */
function resolveHome(filepath) {
  if (filepath[0] === '~') {
    return path.join(homedir(), filepath.slice(1));
  }
  return filepath;
}

/**
 * Determine if the CLI should run in silent mode based on environment and arguments.
 */
Common.determineSilentCLI = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const s1opt = process.argv.indexOf('--silent');
  const s2opt = process.argv.indexOf('-s');

  const isSilentByEnv = process.env.PM2_SILENT;
  const isAfterDashes = variadicArgsDashesPos > -1;
  const s1BeforeDashes = isAfterDashes && s1opt !== -1 && s1opt < variadicArgsDashesPos;
  const s2BeforeDashes = isAfterDashes && s2opt !== -1 && s2opt < variadicArgsDashesPos;
  const s1OrS2Present = variadicArgsDashesPos === -1 && (s1opt > -1 || s2opt > -1);

  if (isSilentByEnv || (s1BeforeDashes && s2BeforeDashes) || s1OrS2Present) {
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
 * Print the PM2 version and exit if version flag is present.
 */
Common.printVersion = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const versionIndex = process.argv.indexOf('-v');

  if (versionIndex > -1 && versionIndex < variadicArgsDashesPos) {
    console.log(pkg.version);
    process.exit(0);
  }
};

/**
 * Check and manage reload lock file to prevent concurrent reloads.
 * @returns {number} Diff in milliseconds or 0 if unlocked
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
 * Unlock the reload lock file.
 */
Common.unlockReload = function() {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, '');
  } catch (e) {
    console.error(e.message || e);
  }
};

/**
 * Prepare application configuration by resolving paths and setting defaults.
 * @param {Object} opts - Options object
 * @param {Object} app - Application configuration object
 * @returns {Object|Error} Prepared app object or error
 */
Common.prepareAppConf = function(opts, app) {
  if (!app.script) {
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

  if (cwd && cwd[0] !== '/') {
    cwd = path.resolve(process.cwd(), cwd);
  }

  cwd = cwd || opts.cwd;

  app.pm_exec_path = path.resolve(cwd, app.script);

  if (!fs.existsSync(app.pm_exec_path)) {
    const ckd = which(app.script);
    if (ckd && typeof ckd !== 'string') {
      ckd = ckd.toString();
      app.pm_exec_path = ckd;
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

  let env = {};

  if (cst.PM2_PROGRAMMATIC || process.env.pm_id) {
    Common.safeExtend(env, process.env);
  } else {
    env = process.env;
  }

  const filterEnv = function(envObj) {
    if (app.filter_env === true) {
      return {};
    }

    if (typeof app.filter_env === 'string') {
      delete envObj[app.filter_env];
      return envObj;
    }

    const new_env = {};
    const allowedKeys = app.filter_env.reduce((acc, current) =>
      acc.filter(item => !item.includes(current)), Object.keys(envObj));
    allowedKeys.forEach(key => new_env[key] = envObj[key]);
    return new_env;
  };

  app.env = [
    {},
    (app.filter_env && app.filter_env.length > 0) ? filterEnv(process.env) : env,
    app.env || {}
  ].reduce(function(e1, e2) {
    return Object.assign(e1, e2);
  });

  app.pm_cwd = cwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch (e) {
    return e;
  }

  Common.sink.determineExecMode(app);

  const formated_app_name = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');

  ['log', 'out', 'error', 'pid'].forEach(function(f) {
    const af = app[f + '_file'];
    const isStd = !~['log', 'pid'].indexOf(f);
    let resolvedAf = af;

    if (af) {
      resolvedAf = resolveHome(af);
    }

    const shouldUseDefaultPath = (f === 'log' && typeof af === 'boolean' && af) || (f !== 'log' && !af);
    const shouldUseCustomPath = (f !== 'log' || (f === 'log' && af)) && af !== 'NULL' && af !== '/dev/null';

    if (shouldUseDefaultPath) {
      const ps = [cst['DEFAULT_' + (f === 'pid' ? 'PID' : 'LOG') + '_PATH'], formated_app_name + (isStd ? '-' + f : '') + '.' + (f === 'pid' ? 'pid' : 'log')];
      app['pm_' + (isStd ? f.substr(0, 3) + '_' : '') + (f === 'pid' ? 'pid' : 'log') + '_path'] = path.resolve.apply(null, ps);
    } else if (shouldUseCustomPath) {
      const dir = path.dirname(path.resolve(cwd, resolvedAf));
      if (!fs.existsSync(dir)) {
        Common.printError(cst.PREFIX_MSG_WARNING + 'Folder does not exist: ' + dir);
        Common.printOut(cst.PREFIX_MSG + 'Creating folder: ' + dir);
        try {
          require('mkdirp').sync(dir);
        } catch (err) {
          Common.printError(cst.PREFIX_MSG_ERR + 'Could not create folder: ' + path.dirname(resolvedAf));
          throw new Error('Could not create folder');
        }
      }
      app['pm_' + (isStd ? f.substr(0, 3) + '_' : '') + (f === 'pid' ? 'pid' : 'log') + '_path'] = path.resolve.apply(null, [cwd, resolvedAf]);
    } else if (path.sep === '\\') {
      app['pm_' + (isStd ? f.substr(0, 3) + '_' : '') + (f === 'pid' ? 'pid' : 'log') + '_path'] = '\\\\.\\NUL';
    } else {
      app['pm_' + (isStd ? f.substr(0, 3) + '_' : '') + (f === 'pid' ? 'pid' : 'log') + '_path'] = '/dev/null';
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
 * Check if filename is a configuration file.
 * @param {string} filename - The filename to check
 * @returns {string|null} Extension type or null if not a config file
 */
Common.isConfigFile = function(filename) {
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

/**
 * Get all possible config file candidates for a given name.
 * @param {string} name - The base name
 * @returns {string[]} Array of candidate filenames
 */
Common.getConfigFileCandidates = function(name) {
  return Object.keys(Common.knonwConfigFileExtensions).map((extension) => name + extension);
};

/**
 * Parse a config file with support for JS, JSON, JSON5, and YAML formats.
 * @param {string} confString - Contents of the config file
 * @param {string} filename - Path to the config file
 * @returns {Object} Parsed config object
 */
Common.parseConfig = function(confObj, filename) {
  const yamljs = require('js-yaml');
  const vm = require('vm');

  const isConfigFile = Common.isConfigFile(filename);

  if (!filename || filename === 'pipe' || filename === 'none' || isConfigFile === 'json') {
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
 * Convert various error types to a standard Error object.
 * @param {Error|string} e - Error object or message
 * @returns {Error} Standard Error object
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
 * Determine if cron restart should be enabled and configure it.
 * @param {Object} app - Application configuration
 * @returns {Error|null} Error if cron pattern is invalid, null otherwise
 */
Common.sink.determineCron = function(app) {
  if (app.cron_restart === 0 || app.cron_restart === '0') {
    Common.printOut(cst.PREFIX_MSG + 'disabling cron restart');
    return null;
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

  return null;
};

/**
 * Handle alias conversion for fork and cluster modes.
 * @param {Object} app - Application configuration
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
 * Resolve the Node.js interpreter path based on NVM configuration.
 * @param {Object} app - Application configuration
 * @returns {boolean} Success status
 */
function resolveNodeInterpreter(app) {
  if (app.exec_mode && app.exec_mode.indexOf('cluster') > -1) {
    Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('Choosing the Node.js version in cluster mode is not supported'));
    return false;
  }

  const nvm_path = cst.IS_WINDOWS ? process.env.NVM_HOME : process.env.NVM_DIR;

  if (!nvm_path) {
    Common.printError(cst.PREFIX_MSG_ERR + chalk.red('NVM is not available in PATH'));
    Common.printError(cst.PREFIX_MSG_ERR + chalk.red('Fallback to node in PATH'));
    const msg = cst.IS_WINDOWS
      ? 'https://github.com/coreybutler/nvm-windows/releases/'
      : '$ curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash';
    Common.printOut(cst.PREFIX_MSG_ERR + chalk.bold('Install NVM:\n' + msg));
    return false;
  }

  const node_version = app.exec_interpreter.split('@')[1];
  let path_to_node;

  if (cst.IS_WINDOWS) {
    path_to_node = '/v' + node_version + '/node.exe';
  } else if (semver.satisfies(node_version, '>= 0.12.0')) {
    path_to_node = '/versions/node/v' + node_version + '/bin/node';
  } else {
    path_to_node = '/v' + node_version + '/bin/node';
  }

  const nvm_node_path = path.join(nvm_path, path_to_node);

  try {
    fs.accessSync(nvm_node_path);
  } catch (e) {
    Common.printOut(cst.PREFIX_MSG + 'Installing Node v%s', node_version);
    const nvm_bin = path.join(nvm_path, 'nvm.' + (cst.IS_WINDOWS ? 'exe' : 'sh'));
    const nvm_cmd = cst.IS_WINDOWS
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
 * Resolve the interpreter for the application based on file extension and configuration.
 * @param {Object} app - Application configuration
 * @returns {Object} The app object with resolved interpreter
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
 * Deep copy an object using fclone.
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
 * Print error message based on environment settings.
 * @param {Error|string} msg - Error message or object
 * @returns {boolean} Whether error was printed
 */
Common.errMod = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') {
    return false;
  }
  if (msg instanceof Error) {
    return console.error(msg.message);
  }
  return console.error(`${cst.PREFIX_MSG_MOD_ERR}${msg}`);
};

/**
 * Print error message based on environment settings.
 * @param {Error|string} msg - Error message or object
 * @returns {boolean} Whether error was printed
 */
Common.err = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') {
    return false;
  }
  if (msg instanceof Error) {
    return console.error(`${cst.PREFIX_MSG_ERR}${msg.message}`);
  }
  return console.error(`${cst.PREFIX_MSG_ERR}${msg}`);
};

/**
 * Print error message with console.apply for variable arguments.
 * @param {Error|string} msg - Error message or object
 * @returns {boolean} Whether error was printed
 */
Common.printError = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') {
    return false;
  }
  if (msg instanceof Error) {
    return console.error(msg.message);
  }
  return console.error.apply(console, arguments);
};

/**
 * Print log message with prefix.
 * @param {string} msg - Message to log
 */
Common.log = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') {
    return false;
  }
  return console.log(`${cst.PREFIX_MSG}${msg}`);
};

/**
 * Print info message with prefix.
 * @param {string} msg - Message to log
 */
Common.info = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') {
    return false;
  }
  return console.log(`${cst.PREFIX_MSG_INFO}${msg}`);
};

/**
 * Print warning message with prefix.
 * @param {string} msg - Message to log
 */
Common.warn = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') {
    return false;
  }
  return console.log(`${cst.PREFIX_MSG_WARNING}${msg}`);
};

/**
 * Print module log message with prefix.
 * @param {string} msg - Message to log
 */
Common.logMod = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') {
    return false;
  }
  return console.log(`${cst.PREFIX_MSG_MOD}${msg}`);
};

/**
 * Print output message with prefix.
 * @param {...*} args - Arguments to log
 * @returns {boolean} Whether output was printed
 */
Common.printOut = function() {
  if (process.env.PM2_SILENT === 'true' || process.env.PM2_PROGRAMMATIC === 'true') {
    return false;
  }
  return console.log.apply(console, arguments);
};

/**
 * Extend destination object with source object properties.
 * @param {Object} destination - Destination object
 * @param {Object} source - Source object
 * @returns {Object} Extended destination object
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
 * Safely extend environment object while ignoring PM2 internal variables.
 * @param {Object} origin - Origin environment object
 * @param {Object} add - Additional environment object
 * @returns {Object} Extended origin object
 */
Common.safeExtend = function(origin, add) {
  if (!add || typeof add !== 'object') {
    return origin;
  }

  const keysToIgnore = [
    'name', 'exec_mode', 'env', 'args', 'pm_cwd', 'exec_interpreter', 'pm_exec_path',
    'node_args', 'pm_out_log_path', 'pm_err_log_path', 'pm_pid_path', 'pm_id', 'status',
    'pm_uptime', 'created_at', 'windowsHide', 'username', 'merge_logs', 'kill_retry_time',
    'prev_restart_delay', 'instance_var', 'unstable_restarts', 'restart_time', 'axm_actions',
    'pmx_module', 'command', 'watch', 'filter_env', 'versioning', 'vizion_runing', 'MODULE_DEBUG',
    'pmx', 'axm_options', 'created_at', 'watch', 'vizion', 'axm_dynamic', 'axm_monitor',
    'instances', 'automation', 'autostart', 'autorestart', 'stop_exit_codes', 'unstable_restart',
    'treekill', 'exit_code', 'vizion'
  ];

  const keys = Object.keys(add);
  const i = keys.length;

  while (i--) {
    if (keysToIgnore.indexOf(keys[i]) === -1 && add[keys[i]] !== '[object Object]') {
      origin[keys[i]] = add[keys[i]];
    }
  }

  return origin;
};

/**
 * Merge environment variables from app configuration and deployment configuration.
 * @param {Object} app_env - Application environment object
 * @param {string} env_name - Environment name
 * @param {Object} deploy_conf - Deployment configuration object
 * @returns {Object} Merged environment object
 */
Common.mergeEnvironmentVariables = function(app_env, env_name, deploy_conf) {
  const app = fclone(app_env);

  const new_conf = {
    env: {}
  };

  for (const key in app.env) {
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

  const res = {
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
 * Resolve application attributes including paths, options, and environment.
 * @param {Object} opts - Options object
 * @param {Object} opts.cwd - Current working directory
 * @param {Object} opts.pm2_home - PM2 home directory
 * @param {Object} appConf - Application configuration
 * @returns {Object} Resolved application object
 */
Common.resolveAppAttributes = function(opts, conf) {
  const conf_copy = fclone(conf);

  const app = Common.prepareAppConf(opts, conf_copy);

  if (app instanceof Error) {
    throw new Error(app.message);
  }

  return app;
};

/**
 * Verify and validate application configurations.
 * @param {Array} appConfs - Array of application configurations
 * @returns {Array} Verified configurations
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

    if (app.script && app.script.indexOf(' ') > -1 && cst.IS_WINDOWS === false) {
      const _script = app.script;

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

      const passwd = require('./tools/passwd.js');
      let users;

      try {
        users = passwd.getUsers();
      } catch (e) {
        Common.printError(e);
        return new Error(e);
      }

      const user_info = users[app.uid || app.user];

      if (!user_info) {
        Common.printError(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
        return new Error(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
      }

      app.env.HOME = user_info.homedir;
      app.uid = parseInt(user_info.userId);

      if (app.gid) {
        let groups;

        try {
          groups = passwd.getGroups();
        } catch (e) {
          Common.printError(e);
          return new Error(e);
        }

        const group_info = groups[app.gid];

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

    if (app.exec_mode !== 'cluster_mode' && !app.instances && typeof app.merge_logs === 'undefined') {
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
      ret.errors.forEach(function(err) {
        warn(err);
      });
      return new Error(ret.errors);
    }

    verifiedConf.push(ret.config);
  }

  return verifiedConf;
};

/**
 * Get the current username from the operating system.
 * @returns {string} Current username
 */
Common.getCurrentUsername = function() {
  let current_user = '';

  if (os.userInfo) {
    try {
      current_user = os.userInfo().username;
    } catch (err) {
      // For the case of unhandled error for uv_os_get_passwd
    }
  }

  if (current_user === '') {
    current_user = process.env.USER || process.env.LNAME || process.env.USERNAME || process.env.SUDO_USER || process.env.C9_USER || process.env.LOGNAME;
  }

  return current_user;
};

/**
 * Render an application name from the script path if not provided.
 * @param {Object} conf - Application configuration
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
 * Show warning message.
 * @param {string} warning - Warning message
 */
function warn(warning) {
  Common.printOut(cst.PREFIX_MSG_WARNING + warning);
}
```