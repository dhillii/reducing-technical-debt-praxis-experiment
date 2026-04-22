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

/* -------------------------------------------------------------------------- */
/* Helper predicates                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Detect if the current platform is Windows.
 * @returns {boolean}
 */
function isWindows() {
  return process.platform === 'win32';
}

/**
 * Detect if the current platform is macOS.
 * @returns {boolean}
 */
function isDarwin() {
  return process.platform === 'darwin';
}

/**
 * Detect if the current platform is Linux.
 * @returns {boolean}
 */
function isLinux() {
  return process.platform === 'linux';
}

/**
 * Determine if silent mode should be enabled.
 * @returns {boolean}
 */
function shouldEnableSilent() {
  const argv = process.argv;
  const env = process.env;
  const dashPos = argv.indexOf('--');
  const silentLong = argv.indexOf('--silent');
  const silentShort = argv.indexOf('-s');

  const beforeDash = dashPos > -1;
  const hasLong = silentLong !== -1;
  const hasShort = silentShort !== -1;

  if (env.PM2_SILENT) return true;

  if (beforeDash) {
    const longValid = hasLong && silentLong < dashPos;
    const shortValid = hasShort && silentShort < dashPos;
    return longValid && shortValid;
  }

  return hasLong || hasShort;
}

/**
 * Determine if version flag should be printed.
 * @returns {boolean}
 */
function shouldPrintVersion() {
  const argv = process.argv;
  const dashPos = argv.indexOf('--');
  const vPos = argv.indexOf('-v');
  return vPos !== -1 && (dashPos === -1 || vPos < dashPos);
}

/**
 * Check if a path starts with a tilde.
 * @param {string} filepath
 * @returns {boolean}
 */
function isTildePath(filepath) {
  return filepath[0] === '~';
}

/**
 * Check if a value is a non‑empty string.
 * @param {*} val
 * @returns {boolean}
 */
function isNonEmptyString(val) {
  return typeof val === 'string' && val !== '';
}

/**
 * Check if a value is a plain object.
 * @param {*} val
 * @returns {boolean}
 */
function isPlainObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

/* -------------------------------------------------------------------------- */
/* Core utilities                                                             */
/* -------------------------------------------------------------------------- */

function homedir() {
  const env = process.env;
  const home = env.HOME;
  const user = env.LOGNAME || env.USER || env.LNAME || env.USERNAME;

  if (isWindows()) {
    return env.USERPROFILE || env.HOMEDRIVE + env.HOMEPATH || home || null;
  }

  if (isDarwin()) {
    return home || (user ? '/Users/' + user : null);
  }

  if (isLinux()) {
    return home || (process.getuid && process.getuid() === 0 ? '/root' : (user ? '/home/' + user : null));
  }

  return home || null;
}

/**
 * Resolve a path that may start with `~`.
 * @param {string} filepath
 * @returns {string}
 */
function resolveHome(filepath) {
  if (isTildePath(filepath)) {
    return path.join(homedir(), filepath.slice(1));
  }
  return filepath;
}

/* -------------------------------------------------------------------------- */
/* Silent CLI handling                                                       */
/* -------------------------------------------------------------------------- */

Common.determineSilentCLI = function () {
  if (!shouldEnableSilent()) return;

  for (const key in console) {
    const code = key.charCodeAt(0);
    if (code >= 97 && code <= 122) {
      console[key] = function () { };
    }
  }
  process.env.PM2_DISCRETE_MODE = true;
};

/* -------------------------------------------------------------------------- */
/* Version printing                                                            */
/* -------------------------------------------------------------------------- */

Common.printVersion = function () {
  if (shouldPrintVersion()) {
    console.log(pkg.version);
    process.exit(0);
  }
};

/* -------------------------------------------------------------------------- */
/* Reload lock handling                                                       */
/* -------------------------------------------------------------------------- */

Common.lockReload = function () {
  try {
    const content = fs.readFileSync(cst.PM2_RELOAD_LOCKFILE, 'utf8');
    if (content) {
      const diff = dayjs().diff(parseInt(content, 10));
      if (diff < cst.RELOAD_LOCK_TIMEOUT) return diff;
    }
  } catch (e) { }

  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, dayjs().valueOf().toString());
    return 0;
  } catch (e) {
    console.error(e.message || e);
  }
};

Common.unlockReload = function () {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, '');
  } catch (e) {
    console.error(e.message || e);
  }
};

/* -------------------------------------------------------------------------- */
/* Application configuration preparation                                      */
/* -------------------------------------------------------------------------- */

/**
 * Validate that the app has a script defined.
 * @param {Object} app
 * @returns {Error|undefined}
 */
function validateAppScript(app) {
  if (!app.script) {
    return new Error('No script path - aborting');
  }
}

/**
 * Resolve the working directory for the app.
 * @param {Object} app
 * @param {Object} opts
 * @returns {string}
 */
function resolveCwd(app, opts) {
  let cwd = null;
  if (app.cwd) {
    cwd = path.resolve(app.cwd);
    process.env.PWD = app.cwd;
  }
  cwd = cwd && cwd[0] !== '/' ? path.resolve(process.cwd(), cwd) : cwd;
  return cwd || opts.cwd;
}

/**
 * Resolve the absolute path to the script.
 * @param {Object} app
 * @param {string} cwd
 */
function resolveExecPath(app, cwd) {
  app.pm_exec_path = path.resolve(cwd, app.script);
}

/**
 * Ensure the script exists or resolve it via PATH.
 * @param {Object} app
 * @returns {Error|undefined}
 */
function ensureScriptExists(app) {
  if (fs.existsSync(app.pm_exec_path)) return;

  const resolved = which(app.script);
  if (resolved) {
    app.pm_exec_path = typeof resolved === 'string' ? resolved : resolved.toString();
    return;
  }

  return new Error(`Script not found: ${app.pm_exec_path}`);
}

/**
 * Enable source‑map support if a .map file is present.
 * @param {Object} app
 */
function enableSourceMap(app) {
  if (app.disable_source_map_support === true) return;
  try {
    fs.accessSync(app.pm_exec_path + '.map', fs.constants.R_OK);
    app.source_map_support = true;
  } catch (e) { }
  delete app.disable_source_map_support;
}

/**
 * Build the environment object for the app.
 * @param {Object} app
 * @param {Object} opts
 * @returns {Object}
 */
function buildAppEnv(app, opts) {
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

    const allowed = Object.keys(envObj).filter(key => {
      return !app.filter_env.some(disallowed => key.includes(disallowed));
    });

    const filtered = {};
    allowed.forEach(k => filtered[k] = envObj[k]);
    return filtered;
  }

  const baseEnv = (app.filter_env && app.filter_env.length > 0) ? filterEnv(process.env) : env;
  return Object.assign({}, baseEnv, app.env || {});
}

/**
 * Resolve log, out, error and pid paths.
 * @param {Object} app
 * @param {string} cwd
 */
function resolveLogPaths(app, cwd) {
  const formattedName = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');

  ['log', 'out', 'error', 'pid'].forEach(type => {
    const fileKey = `${type}_file`;
    const ext = type === 'pid' ? 'pid' : 'log';
    const isStd = !['log', 'pid'].includes(type);
    let target = app[fileKey];
    let parts;

    if (target) target = resolveHome(target);

    if ((type === 'log' && typeof target === 'boolean' && target) || (type !== 'log' && !target)) {
      parts = [cst[`DEFAULT_${ext.toUpperCase()}_PATH`], `${formattedName}${isStd ? '-' + type : ''}.${ext}`];
    } else if (target && target !== 'NULL' && target !== '/dev/null') {
      parts = [cwd, target];
      const dir = path.dirname(path.resolve(cwd, target));
      if (!fs.existsSync(dir)) {
        Common.printError(cst.PREFIX_MSG_WARNING + 'Folder does not exist: ' + dir);
        Common.printOut(cst.PREFIX_MSG + 'Creating folder: ' + dir);
        try {
          require('mkdirp').sync(dir);
        } catch (err) {
          Common.printError(cst.PREFIX_MSG_ERR + 'Could not create folder: ' + path.dirname(target));
          throw new Error('Could not create folder');
        }
      }
    }

    if (target !== 'NULL' && target !== '/dev/null') {
      if (parts) {
        app[`pm_${isStd ? type.substr(0, 3) + '_' : ''}${ext}_path`] = path.resolve(...parts);
      }
    } else if (path.sep === '\\') {
      app[`pm_${isStd ? type.substr(0, 3) + '_' : ''}${ext}_path`] = '\\\\.\\NUL';
    } else {
      app[`pm_${isStd ? type.substr(0, 3) + '_' : ''}${ext}_path`] = '/dev/null';
    }

    delete app[fileKey];
  });
}

/**
 * Prepare an application configuration object.
 * @param {Object} opts
 * @param {Object} app
 * @returns {Object|Error}
 */
Common.prepareAppConf = function (opts, app) {
  const validationError = validateAppScript(app);
  if (validationError) return validationError;

  const cwd = resolveCwd(app, opts);
  resolveExecPath(app, cwd);

  const scriptError = ensureScriptExists(app);
  if (scriptError) return scriptError;

  enableSourceMap(app);
  delete app.script;

  app.env = buildAppEnv(app, opts);
  app.pm_cwd = cwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch (e) {
    return e;
  }

  Common.sink.determineExecMode(app);
  resolveLogPaths(app, cwd);

  return app;
};

/* -------------------------------------------------------------------------- */
/* Known configuration file extensions                                         */
/* -------------------------------------------------------------------------- */

Common.knonwConfigFileExtensions = {
  '.json': 'json',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.config.js': 'js',
  '.config.cjs': 'js',
  '.config.mjs': 'mjs'
};

/**
 * Check if a filename is a configuration file.
 * @param {string} filename
 * @returns {string|null}
 */
Common.isConfigFile = function (filename) {
  if (typeof filename !== 'string') return null;
  for (const ext in Common.knonwConfigFileExtensions) {
    if (filename.includes(ext)) {
      return Common.knonwConfigFileExtensions[ext];
    }
  }
  return null;
};

Common.getConfigFileCandidates = function (name) {
  return Object.keys(Common.knonwConfigFileExtensions).map(ext => name + ext);
};

/* -------------------------------------------------------------------------- */
/* Config parsing                                                             */
/* -------------------------------------------------------------------------- */

Common.parseConfig = function (confObj, filename) {
  const yamljs = require('js-yaml');
  const vm = require('vm');
  const type = Common.isConfigFile(filename);

  if (!filename || filename === 'pipe' || filename === 'none' || type === 'json') {
    const code = '(' + confObj + ')';
    const sandbox = {};
    return vm.runInThisContext(code, sandbox, {
      filename: path.resolve(filename),
      displayErrors: false,
      timeout: 1000
    });
  }

  if (type === 'yaml') {
    return yamljs.load(confObj.toString());
  }

  if (type === 'js' || type === 'mjs') {
    const confPath = require.resolve(path.resolve(filename));
    delete require.cache[confPath];
    return require(confPath);
  }
};

/* -------------------------------------------------------------------------- */
/* Error helpers                                                              */
/* -------------------------------------------------------------------------- */

Common.retErr = function (e) {
  if (!e) return new Error('Unidentified error');
  return e instanceof Error ? e : new Error(e);
};

Common.sink = {};

/* -------------------------------------------------------------------------- */
/* Cron handling                                                              */
/* -------------------------------------------------------------------------- */

Common.sink.determineCron = function (app) {
  if (app.cron_restart == 0 || app.cron_restart == '0') {
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

/* -------------------------------------------------------------------------- */
/* Exec mode handling                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Determine the execution mode for an app.
 * @param {Object} app
 */
Common.sink.determineExecMode = function (app) {
  if (app.exec_mode) {
    app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');
  }

  const hasInstances = app.instances >= 1 || app.instances === 0 || app.instances === -1;
  const usesNode = app.exec_interpreter && (app.exec_interpreter.includes('node') || app.exec_interpreter.includes('bun'));

  if (!app.exec_mode && hasInstances && usesNode) {
    app.exec_mode = 'cluster_mode';
  } else if (!app.exec_mode) {
    app.exec_mode = 'fork_mode';
  }

  if (typeof app.instances === 'undefined') {
    app.instances = 1;
  }
};

/* -------------------------------------------------------------------------- */
/* Node interpreter resolution                                                */
/* -------------------------------------------------------------------------- */

function resolveNodeInterpreter(app) {
  if (app.exec_mode && app.exec_mode.includes('cluster')) {
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
    return;
  }

  const nodeVersion = app.exec_interpreter.split('@')[1];
  const nodePath = cst.IS_WINDOWS
    ? '/v' + nodeVersion + '/node.exe'
    : semver.satisfies(nodeVersion, '>= 0.12.0')
      ? '/versions/node/v' + nodeVersion + '/bin/node'
      : '/v' + nodeVersion + '/bin/node';
  let nvmNodePath = path.join(nvmPath, nodePath);

  try {
    fs.accessSync(nvmNodePath);
  } catch (e) {
    Common.printOut(cst.PREFIX_MSG + 'Installing Node v%s', nodeVersion);
    const nvmBin = path.join(nvmPath, 'nvm.' + (cst.IS_WINDOWS ? 'exe' : 'sh'));
    const nvmCmd = cst.IS_WINDOWS
      ? `${nvmBin} install ${nodeVersion}`
      : `. ${nvmBin} ; nvm install ${nodeVersion}`;

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

  Common.printOut(cst.PREFIX_MSG + chalk.green.bold('Setting Node to v%s (path=%s)'), nodeVersion, nvmNodePath);
  app.exec_interpreter = nvmNodePath;
}

/* -------------------------------------------------------------------------- */
/* Interpreter resolution                                                     */
/* -------------------------------------------------------------------------- */

Common.sink.resolveInterpreter = function (app) {
  const noInterpreter = !app.exec_interpreter;
  const extName = path.extname(app.pm_exec_path);
  const betterInterpreter = extItps[extName];

  // Bun support
  if (noInterpreter && (extName === '.js' || extName === '.ts') && cst.IS_BUN === true) {
    app.exec_interpreter = process.execPath;
  }

  // Known extension interpreter
  if (noInterpreter && betterInterpreter) {
    app.exec_interpreter = betterInterpreter;
    if (betterInterpreter === 'python') {
      if (!which('python')) {
        if (which('python3')) {
          app.exec_interpreter = 'python3';
        } else {
          Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('python and python3 binaries not available in PATH'));
        }
      }
    }
  } else if (noInterpreter) {
    app.exec_interpreter = isBinary(app.pm_exec_path) ? 'none' : process.execPath;
  } else if (app.exec_interpreter.includes('node@')) {
    resolveNodeInterpreter(app);
  }

  if (app.exec_interpreter.includes('python')) {
    app.env.PYTHONUNBUFFERED = '1';
  }

  if (app.exec_interpreter === 'lsc') {
    app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/lsc');
  }

  if (app.exec_interpreter === 'coffee') {
    app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/coffee');
  }

  if (app.exec_interpreter !== 'none' && which(app.exec_interpreter) == null) {
    if (app.exec_interpreter === 'node') {
      Common.warn(`Using builtin node.js version on version ${process.version}`);
      app.exec_interpreter = cst.BUILTIN_NODE_PATH;
    } else {
      throw new Error(`Interpreter ${app.exec_interpreter} is NOT AVAILABLE in PATH. (type 'which ${app.exec_interpreter}' to double check.)`);
    }
  }

  return app;
};

/* -------------------------------------------------------------------------- */
/* Deep copy utilities                                                        */
/* -------------------------------------------------------------------------- */

Common.deepCopy = Common.serialize = Common.clone = function (obj) {
  if (obj === null || obj === undefined) return {};
  return fclone(obj);
};

/* -------------------------------------------------------------------------- */
/* Logging helpers                                                            */
/* -------------------------------------------------------------------------- */

Common.errMod = function (msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) return console.error(msg.message);
  return console.error(`${cst.PREFIX_MSG_MOD_ERR}${msg}`);
};

Common.err = function (msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) return console.error(`${cst.PREFIX_MSG_ERR}${msg.message}`);
  return console.error(`${cst.PREFIX_MSG_ERR}${msg}`);
};

Common.printError = function (msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) return console.error(msg.message);
  return console.error.apply(console, arguments);
};

Common.log = function (msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG}${msg}`);
};

Common.info = function (msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG_INFO}${msg}`);
};

Common.warn = function (msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG_WARNING}${msg}`);
};

Common.logMod = function (msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG_MOD}${msg}`);
};

Common.printOut = function () {
  if (process.env.PM2_SILENT === 'true' || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log.apply(console, arguments);
};

/* -------------------------------------------------------------------------- */
/* Object extend utilities                                                    */
/* -------------------------------------------------------------------------- */

Common.extend = function (destination, source) {
  if (typeof destination !== 'object') destination = {};
  if (!source || typeof source !== 'object') return destination;

  Object.keys(source).forEach(key => {
    if (source[key] != '[object Object]') destination[key] = source[key];
  });
  return destination;
};

Common.safeExtend = function (origin, add) {
  if (!add || typeof add !== 'object') return origin;

  const ignore = [
    'name', 'exec_mode', 'env', 'args', 'pm_cwd', 'exec_interpreter', 'pm_exec_path',
    'node_args', 'pm_out_log_path', 'pm_err_log_path', 'pm_pid_path', 'pm_id',
    'status', 'pm_uptime', 'created_at', 'windowsHide', 'username', 'merge_logs',
    'kill_retry_time', 'prev_restart_delay', 'instance_var', 'unstable_restarts',
    'restart_time', 'axm_actions', 'pmx_module', 'command', 'watch', 'filter_env',
    'versioning', 'vizion_runing', 'MODULE_DEBUG', 'pmx', 'axm_options',
    'created_at', 'watch', 'vizion', 'axm_dynamic', 'axm_monitor', 'instances',
    'automation', 'autostart', 'autorestart', 'stop_exit_codes', 'unstable_restart',
    'treekill', 'exit_code', 'vizion'
  ];

  Object.keys(add).forEach(key => {
    if (!ignore.includes(key) && add[key] != '[object Object]') {
      origin[key] = add[key];
    }
  });
  return origin;
};

/* -------------------------------------------------------------------------- */
/* Environment merging                                                         */
/* -------------------------------------------------------------------------- */

Common.mergeEnvironmentVariables = function (app_env, env_name, deploy_conf) {
  const app = fclone(app_env);
  const newConf = { env: {} };

  // Stringify objects in env
  Object.keys(app.env).forEach(key => {
    if (isPlainObject(app.env[key])) {
      app.env[key] = JSON.stringify(app.env[key]);
    }
  });

  Object.assign(newConf, app);

  if (env_name) {
    if (deploy_conf && deploy_conf[env_name] && deploy_conf[env_name].env) {
      Object.assign(newConf.env, deploy_conf[env_name].env);
    }
    Object.assign(newConf.env, app.env);
    if (`env_${env_name}` in app) {
      Object.assign(newConf.env, app[`env_${env_name}`]);
    } else {
      Common.printOut(cst.PREFIX_MSG_WARNING + chalk.bold(`Environment [${env_name}] is not defined in process file`));
    }
  }

  delete newConf.exec_mode;

  const res = { current_conf: {} };
  Object.assign(res, newConf.env);
  Object.assign(res.current_conf, newConf);

  if (app.exec_interpreter && app.exec_interpreter.includes('@')) {
    resolveNodeInterpreter(app);
    res.current_conf.exec_interpreter = app.exec_interpreter;
  }

  return res;
};

/* -------------------------------------------------------------------------- */
/* Application attribute resolution                                           */
/* -------------------------------------------------------------------------- */

Common.resolveAppAttributes = function (opts, conf) {
  const copy = fclone(conf);
  const app = Common.prepareAppConf(opts, copy);
  if (app instanceof Error) {
    throw new Error(app.message);
  }
  return app;
};

/* -------------------------------------------------------------------------- */
/* Configuration verification                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Validate and normalize a single app configuration.
 * @param {Object} app
 * @param {Object} opts
 * @returns {Object|Error}
 */
function processSingleApp(app, opts) {
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

  if (!app.env) app.env = {};

  Common.renderApplicationName(app);

  if (app.execute_command === true) {
    app.exec_mode = 'fork';
    delete app.execute_command;
  }

  app.username = Common.getCurrentUsername();

  // Handle inline commands (e.g., "python script.py --arg")
  if (app.script && app.script.includes(' ') && !cst.IS_WINDOWS) {
    const inline = app.script;
    if (which('bash')) {
      app.script = 'bash';
      app.args = ['-c', inline];
    } else if (which('sh')) {
      app.script = 'sh';
      app.args = ['-c', inline];
    } else {
      warn('bash or sh not available in $PATH, keeping script as is');
    }
    if (!app.name) app.name = inline;
  }

  if (app.time || process.env.ASZ_MODE) {
    app.log_date_format = 'YYYY-MM-DDTHH:mm:ss';
  }

  // UID/GID handling
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
    let users;
    try {
      users = passwd.getUsers();
    } catch (e) {
      Common.printError(e);
      return new Error(e);
    }

    const userInfo = users[app.uid || app.user];
    if (!userInfo) {
      const msg = `${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`;
      Common.printError(msg);
      return new Error(msg);
    }

    app.env.HOME = userInfo.homedir;
    app.uid = parseInt(userInfo.userId, 10);

    if (app.gid) {
      let groups;
      try {
        groups = passwd.getGroups();
      } catch (e) {
        Common.printError(e);
        return new Error(e);
      }
      const groupInfo = groups[app.gid];
      if (!groupInfo) {
        const msg = `${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`;
        Common.printError(msg);
        return new Error(msg);
      }
      app.gid = parseInt(groupInfo.id, 10);
    } else {
      app.gid = parseInt(userInfo.groupId, 10);
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
    app.instances = parseInt(app.instances, 10) || 0;
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

  return validation.config;
}

/**
 * Verify an array of application configurations.
 * @param {Array} appConfs
 * @returns {Array}
 */
Common.verifyConfs = function (appConfs) {
  if (!appConfs || appConfs.length === 0) return [];

  const list = [].concat(appConfs);
  const verified = [];

  for (const app of list) {
    const result = processSingleApp(app);
    if (result instanceof Error) return result;
    verified.push(result);
  }

  return verified;
};

/* -------------------------------------------------------------------------- */
/* Username utilities                                                         */
/* -------------------------------------------------------------------------- */

Common.getCurrentUsername = function () {
  let current = '';

  if (os.userInfo) {
    try {
      current = os.userInfo().username;
    } catch (err) { }
  }

  if (!current) {
    current = process.env.USER || process.env.LNAME || process.env.USERNAME ||
      process.env.SUDO_USER || process.env.C9_USER || process.env.LOGNAME;
  }

  return current;
};

/* -------------------------------------------------------------------------- */
/* Application name rendering                                                 */
/* -------------------------------------------------------------------------- */

Common.renderApplicationName = function (conf) {
  if (!conf.name && conf.script) {
    conf.name = path.basename(conf.script);
    const dot = conf.name.lastIndexOf('.');
    if (dot > 0) conf.name = conf.name.slice(0, dot);
  }
};

/* -------------------------------------------------------------------------- */
/* Warning helper                                                             */
/* -------------------------------------------------------------------------- */

function warn(message) {
  Common.printOut(cst.PREFIX_MSG_WARNING + message);
}