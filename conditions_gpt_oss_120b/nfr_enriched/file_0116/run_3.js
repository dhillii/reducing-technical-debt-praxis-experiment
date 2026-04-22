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
const Common = (module.exports = {});

/* -------------------------------------------------------------------------- */
/* Helper utilities                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the home directory based on platform and environment variables.
 */
function getHomeDir() {
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
    return (
      home ||
      (process.getuid && process.getuid() === 0 ? '/root' : user ? '/home/' + user : null)
    );
  }
  return home || null;
}

/**
 * Resolve a path that may start with '~' to an absolute path.
 */
function resolveHome(filepath) {
  if (filepath[0] === '~') {
    return path.join(getHomeDir(), filepath.slice(1));
  }
  return filepath;
}

/**
 * Determine whether silent mode should be activated.
 */
function shouldSilenceConsole() {
  const args = process.argv;
  const dashPos = args.indexOf('--');
  const silentLong = args.indexOf('--silent');
  const silentShort = args.indexOf('-s');

  const beforeDash = dashPos > -1;
  const silentBeforeDash =
    (silentLong !== -1 && silentLong < dashPos) ||
    (silentShort !== -1 && silentShort < dashPos);
  const silentAfterDash = dashPos === -1 && (silentLong !== -1 || silentShort !== -1);

  return (
    process.env.PM2_SILENT ||
    (beforeDash && silentBeforeDash) ||
    (!beforeDash && silentAfterDash)
  );
}

/**
 * Replace all console methods with no‑ops.
 */
function silenceConsole() {
  for (const key in console) {
    const code = key.charCodeAt(0);
    if (code >= 97 && code <= 122) {
      console[key] = () => {};
    }
  }
}

/**
 * Read the reload lock file and return the elapsed diff (ms) if still valid.
 */
function readReloadLock() {
  try {
    const content = fs.readFileSync(cst.PM2_RELOAD_LOCKFILE, 'utf8').trim();
    if (content) {
      const diff = dayjs().diff(parseInt(content, 10));
      if (diff < cst.RELOAD_LOCK_TIMEOUT) {
        return diff;
      }
    }
  } catch (_) {}
  return null;
}

/**
 * Write the current timestamp to the reload lock file.
 */
function writeReloadLock() {
  try {
    const now = dayjs().valueOf().toString();
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, now);
    return 0;
  } catch (e) {
    console.error(e.message || e);
    return null;
  }
}

/**
 * Validate that the app object contains a script path.
 */
function validateAppScript(app) {
  if (!app.script) {
    return new Error('No script path - aborting');
  }
  return null;
}

/**
 * Resolve the working directory for the app.
 */
function resolveAppCwd(app, opts) {
  if (app.cwd) {
    const cwd = path.resolve(app.cwd);
    process.env.PWD = app.cwd;
    return cwd;
  }
  return opts.cwd;
}

/**
 * Resolve the absolute path to the executable script.
 */
function resolveExecPath(app, cwd) {
  const execPath = path.resolve(cwd, app.script);
  app.pm_exec_path = execPath;
}

/**
 * Ensure the script exists; if not, try to locate it in $PATH.
 */
function ensureScriptExists(app) {
  if (fs.existsSync(app.pm_exec_path)) {
    return null;
  }
  const found = which(app.script);
  if (found) {
    app.pm_exec_path = typeof found === 'string' ? found : found.toString();
    return null;
  }
  return new Error(`Script not found: ${app.pm_exec_path}`);
}

/**
 * Enable source‑map support when a .map file is present.
 */
function enableSourceMap(app) {
  if (app.disable_source_map_support === true) return;
  try {
    fs.accessSync(app.pm_exec_path + '.map', fs.constants.R_OK);
    app.source_map_support = true;
  } catch (_) {}
  delete app.disable_source_map_support;
}

/**
 * Build the final environment object for the app.
 */
function buildAppEnv(app) {
  const baseEnv = {};

  // Preserve PM2 internal env only when appropriate
  if (cst.PM2_PROGRAMMATIC || process.env.pm_id) {
    Common.safeExtend(baseEnv, process.env);
  } else {
    Object.assign(baseEnv, process.env);
  }

  /**
   * Filter environment variables according to app.filter_env.
   */
  function filterEnv(envObj) {
    if (app.filter_env === true) return {};

    if (typeof app.filter_env === 'string') {
      delete envObj[app.filter_env];
      return envObj;
    }

    const allowed = Object.keys(envObj).filter((key) => {
      return !app.filter_env.some((pattern) => key.includes(pattern));
    });
    const filtered = {};
    allowed.forEach((k) => (filtered[k] = envObj[k]));
    return filtered;
  }

  const filteredEnv =
    app.filter_env && app.filter_env.length > 0 ? filterEnv(process.env) : baseEnv;

  app.env = Object.assign({}, filteredEnv, app.env || {});
}

/**
 * Format the application name to be filesystem‑safe.
 */
function formatAppName(app) {
  if (!app.name) return;
  app.name = app.name.replace(/[^a-zA-Z0-9.\-]/g, '-');
}

/**
 * Resolve log, out, error and pid file paths.
 */
function resolveLogPaths(app, cwd) {
  const formattedName = app.name.replace(/[^a-zA-Z0-9.\-]/g, '-');

  ['log', 'out', 'error', 'pid'].forEach((type) => {
    const fileKey = `${type}_file`;
    const ext = type === 'pid' ? 'pid' : 'log';
    const isStd = !['log', 'pid'].includes(type);
    let target = app[fileKey];

    if (target) target = resolveHome(target);

    let paths;
    if ((type === 'log' && typeof target === 'boolean' && target) || (type !== 'log' && !target)) {
      paths = [
        cst[`DEFAULT_${ext.toUpperCase()}_PATH`],
        `${formattedName}${isStd ? '-' + type : ''}.${ext}`,
      ];
    } else if (target && target !== 'NULL' && target !== '/dev/null') {
      paths = [cwd, target];
      const dir = path.dirname(path.resolve(cwd, target));
      if (!fs.existsSync(dir)) {
        Common.printError(`${cst.PREFIX_MSG_WARNING}Folder does not exist: ${dir}`);
        Common.printOut(`${cst.PREFIX_MSG}Creating folder: ${dir}`);
        try {
          require('mkdirp').sync(dir);
        } catch (err) {
          Common.printError(`${cst.PREFIX_MSG_ERR}Could not create folder: ${path.dirname(target)}`);
          throw new Error('Could not create folder');
        }
      }
    }

    if (target !== 'NULL' && target !== '/dev/null') {
      if (paths) {
        const prop = `pm_${isStd ? type.substr(0, 3) + '_' : ''}${ext}_path`;
        app[prop] = path.resolve(...paths);
      }
    } else {
      const nullPath = path.sep === '\\' ? '\\\\.\\NUL' : '/dev/null';
      const prop = `pm_${isStd ? type.substr(0, 3) + '_' : ''}${ext}_path`;
      app[prop] = nullPath;
    }

    delete app[fileKey];
  });
}

/* -------------------------------------------------------------------------- */
/* Public API – CLI utilities                                                 */
/* -------------------------------------------------------------------------- */

Common.determineSilentCLI = function () {
  if (!shouldSilenceConsole()) return;
  silenceConsole();
  process.env.PM2_DISCRETE_MODE = true;
};

Common.printVersion = function () {
  const dashPos = process.argv.indexOf('--');
  const vPos = process.argv.indexOf('-v');
  if (vPos > -1 && (dashPos === -1 || vPos < dashPos)) {
    console.log(pkg.version);
    process.exit(0);
  }
};

Common.lockReload = function () {
  const diff = readReloadLock();
  if (diff !== null) return diff;
  return writeReloadLock();
};

Common.unlockReload = function () {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, '');
  } catch (e) {
    console.error(e.message || e);
  }
};

/**
 * Resolve app paths and replace missing values with defaults.
 * @param {Object} opts
 * @param {Object} app
 * @returns {Object|Error}
 */
Common.prepareAppConf = function (opts, app) {
  const scriptError = validateAppScript(app);
  if (scriptError) return scriptError;

  const cwd = resolveAppCwd(app, opts);
  if (!app.node_args) app.node_args = [];

  if (app.port && app.env) app.env.PORT = app.port;

  const finalCwd = cwd && cwd[0] !== '/' ? path.resolve(process.cwd(), cwd) : cwd || opts.cwd;
  resolveExecPath(app, finalCwd);
  const missingScript = ensureScriptExists(app);
  if (missingScript) return missingScript;

  enableSourceMap(app);
  delete app.script;

  buildAppEnv(app);
  app.pm_cwd = finalCwd;

  // Interpreter & exec mode
  try {
    Common.sink.resolveInterpreter(app);
  } catch (e) {
    return e;
  }
  Common.sink.determineExecMode(app);

  formatAppName(app);
  resolveLogPaths(app, finalCwd);

  return app;
};

/* -------------------------------------------------------------------------- */
/* Config file handling                                                       */
/* -------------------------------------------------------------------------- */

Common.knonwConfigFileExtensions = {
  '.json': 'json',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.config.js': 'js',
  '.config.cjs': 'js',
  '.config.mjs': 'mjs',
};

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
  return Object.keys(Common.knonwConfigFileExtensions).map((ext) => name + ext);
};

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
      timeout: 1000,
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

Common.retErr = function (e) {
  if (!e) return new Error('Unidentified error');
  return e instanceof Error ? e : new Error(e);
};

/* -------------------------------------------------------------------------- */
/* Sink – interpreter & cron handling                                         */
/* -------------------------------------------------------------------------- */

Common.sink = {};

Common.sink.determineCron = function (app) {
  if (app.cron_restart == 0 || app.cron_restart == '0') {
    Common.printOut(`${cst.PREFIX_MSG}disabling cron restart`);
    return;
  }
  if (!app.cron_restart) return;

  const Croner = require('croner');
  try {
    Common.printOut(`${cst.PREFIX_MSG}cron restart at ${app.cron_restart}`);
    Croner(app.cron_restart);
  } catch (ex) {
    return new Error(`Cron pattern error: ${ex.message}`);
  }
};

/**
 * Normalize exec_mode aliases and set defaults.
 */
Common.sink.determineExecMode = function (app) {
  if (app.exec_mode) {
    app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');
  }

  const hasClusterCandidate =
    (app.instances >= 1 || app.instances === 0 || app.instances === -1) &&
    (app.exec_interpreter?.includes('node') || app.exec_interpreter?.includes('bun'));

  if (!app.exec_mode) {
    app.exec_mode = hasClusterCandidate ? 'cluster_mode' : 'fork_mode';
  }
  if (typeof app.instances === 'undefined') app.instances = 1;
};

/**
 * Resolve the appropriate interpreter for the app.
 */
Common.sink.resolveInterpreter = function (app) {
  const noInterpreter = !app.exec_interpreter;
  const extName = path.extname(app.pm_exec_path);
  const betterInterpreter = extItps[extName];

  // Bun support
  if (noInterpreter && (extName === '.js' || extName === '.ts') && cst.IS_BUN) {
    app.exec_interpreter = process.execPath;
  }

  // Use known interpreter based on file extension
  if (noInterpreter && betterInterpreter) {
    app.exec_interpreter = betterInterpreter;
    if (betterInterpreter === 'python') {
      if (!which('python')) {
        app.exec_interpreter = which('python3') ? 'python3' : betterInterpreter;
      }
    }
  } else if (noInterpreter) {
    app.exec_interpreter = isBinary(app.pm_exec_path) ? 'none' : process.execPath;
  } else if (app.exec_interpreter.includes('node@')) {
    resolveNodeInterpreter(app);
  }

  if (app.exec_interpreter.includes('python')) app.env.PYTHONUNBUFFERED = '1';
  if (app.exec_interpreter === 'lsc')
    app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/lsc');
  if (app.exec_interpreter === 'coffee')
    app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/coffee');

  if (app.exec_interpreter !== 'none' && which(app.exec_interpreter) == null) {
    if (app.exec_interpreter === 'node') {
      Common.warn(`Using builtin node.js version on version ${process.version}`);
      app.exec_interpreter = cst.BUILTIN_NODE_PATH;
    } else {
      throw new Error(
        `Interpreter ${app.exec_interpreter} is NOT AVAILABLE in PATH. (type 'which ${app.exec_interpreter}' to double check.)`
      );
    }
  }

  return app;
};

/* -------------------------------------------------------------------------- */
/* Misc utilities                                                             */
/* -------------------------------------------------------------------------- */

Common.deepCopy = Common.serialize = Common.clone = function (obj) {
  if (obj === null || obj === undefined) return {};
  return fclone(obj);
};

Common.errMod = function (msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return msg instanceof Error ? console.error(msg.message) : console.error(`${cst.PREFIX_MSG_MOD_ERR}${msg}`);
};

Common.err = function (msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return msg instanceof Error
    ? console.error(`${cst.PREFIX_MSG_ERR}${msg.message}`)
    : console.error(`${cst.PREFIX_MSG_ERR}${msg}`);
};

Common.printError = function (msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return msg instanceof Error ? console.error(msg.message) : console.error.apply(console, arguments);
};

Common.log = function (msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  console.log(`${cst.PREFIX_MSG}${msg}`);
};

Common.info = function (msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  console.log(`${cst.PREFIX_MSG_INFO}${msg}`);
};

Common.warn = function (msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  console.log(`${cst.PREFIX_MSG_WARNING}${msg}`);
};

Common.logMod = function (msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  console.log(`${cst.PREFIX_MSG_MOD}${msg}`);
};

Common.printOut = function () {
  if (process.env.PM2_SILENT === 'true' || process.env.PM2_PROGRAMMATIC === 'true') return false;
  console.log.apply(console, arguments);
};

/* -------------------------------------------------------------------------- */
/* Object merging utilities                                                   */
/* -------------------------------------------------------------------------- */

Common.extend = function (destination, source) {
  if (typeof destination !== 'object' || destination === null) destination = {};
  if (!source || typeof source !== 'object') return destination;

  Object.keys(source).forEach((key) => {
    if (source[key] != '[object Object]') destination[key] = source[key];
  });
  return destination;
};

Common.safeExtend = function (origin, add) {
  if (!add || typeof add !== 'object') return origin;
  const ignore = [
    'name',
    'exec_mode',
    'env',
    'args',
    'pm_cwd',
    'exec_interpreter',
    'pm_exec_path',
    'node_args',
    'pm_out_log_path',
    'pm_err_log_path',
    'pm_pid_path',
    'pm_id',
    'status',
    'pm_uptime',
    'created_at',
    'windowsHide',
    'username',
    'merge_logs',
    'kill_retry_time',
    'prev_restart_delay',
    'instance_var',
    'unstable_restarts',
    'restart_time',
    'axm_actions',
    'pmx_module',
    'command',
    'watch',
    'filter_env',
    'versioning',
    'vizion_runing',
    'MODULE_DEBUG',
    'pmx',
    'axm_options',
    'watch',
    'vizion',
    'axm_dynamic',
    'axm_monitor',
    'instances',
    'automation',
    'autostart',
    'autorestart',
    'stop_exit_codes',
    'unstable_restart',
    'treekill',
    'exit_code',
    'vizion',
  ];
  Object.keys(add).forEach((key) => {
    if (!ignore.includes(key) && add[key] != '[object Object]') {
      origin[key] = add[key];
    }
  });
  return origin;
};

/* -------------------------------------------------------------------------- */
/* Environment merging for deployments                                         */
/* -------------------------------------------------------------------------- */

Common.mergeEnvironmentVariables = function (app_env, env_name, deploy_conf) {
  const app = fclone(app_env);
  const result = { env: {} };

  // Stringify objects in env
  for (const key in app.env) {
    if (typeof app.env[key] === 'object') {
      app.env[key] = JSON.stringify(app.env[key]);
    }
  }

  Object.assign(result, app);

  if (env_name) {
    if (deploy_conf?.[env_name]?.env) {
      Object.assign(result.env, deploy_conf[env_name].env);
    }
    Object.assign(result.env, app.env);
    if (`env_${env_name}` in app) {
      Object.assign(result.env, app[`env_${env_name}`]);
    } else {
      Common.printOut(`${cst.PREFIX_MSG_WARNING}${chalk.bold(`Environment [${env_name}] is not defined in process file`)}`);
    }
  }

  delete result.exec_mode;

  const res = { current_conf: {} };
  Object.assign(res, result.env);
  Object.assign(res.current_conf, result);

  if (app.exec_interpreter?.includes('@')) {
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
  if (app instanceof Error) throw new Error(app.message);
  return app;
};

/* -------------------------------------------------------------------------- */
/* Configuration verification                                                 */
/* -------------------------------------------------------------------------- */

Common.verifyConfs = function (appConfs) {
  if (!appConfs || appConfs.length === 0) return [];

  const list = [].concat(appConfs);
  const verified = [];

  for (const rawApp of list) {
    const app = normalizeApp(rawApp);
    if (app instanceof Error) return [app];

    const cronResult = app.cron_restart ? Common.sink.determineCron(app) : null;
    if (cronResult instanceof Error) return [cronResult];

    const validation = Config.validateJSON(app);
    if (validation.errors?.length) {
      validation.errors.forEach((e) => warn(e));
      return [new Error(validation.errors)];
    }
    verified.push(validation.config);
  }

  return verified;
};

/**
 * Normalize a raw application configuration.
 */
function normalizeApp(app) {
  // Exec mode alias
  if (app.exec_mode) app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');

  // Alias cmd/command to script
  if (app.cmd && !app.script) {
    app.script = app.cmd;
    delete app.cmd;
  }
  if (app.command && !app.script) {
    app.script = app.command;
    delete app.command;
  }

  // Ensure env object exists
  if (!app.env) app.env = {};

  // Render name if missing
  Common.renderApplicationName(app);

  // Execute command flag
  if (app.execute_command) {
    app.exec_mode = 'fork';
    delete app.execute_command;
  }

  // Username
  app.username = Common.getCurrentUsername();

  // Handle inline commands (e.g., "python script.py --arg")
  handleInlineCommand(app);

  // Log date format
  if (app.time || process.env.ASZ_MODE) app.log_date_format = 'YYYY-MM-DDTHH:mm:ss';

  // UID/GID handling
  const uidGidResult = handleUidGid(app);
  if (uidGidResult instanceof Error) return uidGidResult;

  // PM2.io specific flags
  if (process.env.PM2_DEEP_MONITORING) app.deep_monitoring = true;
  if (app.automation === false) app.pmx = false;
  if (app.disable_trace) {
    app.trace = false;
    delete app.disable_trace;
  }

  // Instances handling
  normalizeInstances(app);

  // Merge logs default for non‑cluster mode
  if (app.exec_mode !== 'cluster_mode' && !app.instances && typeof app.merge_logs === 'undefined') {
    app.merge_logs = true;
  }

  return app;
}

/**
 * Convert inline command strings to bash/sh execution.
 */
function handleInlineCommand(app) {
  if (app.script && app.script.includes(' ') && !cst.IS_WINDOWS) {
    const cmd = app.script;
    if (which('bash')) {
      app.script = 'bash';
      app.args = ['-c', cmd];
    } else if (which('sh')) {
      app.script = 'sh';
      app.args = ['-c', cmd];
    } else {
      warn('bash or sh not available in $PATH, keeping script as is');
    }
    if (!app.name) app.name = cmd;
  }
}

/**
 * Resolve UID/GID, set HOME and numeric IDs.
 */
function handleUidGid(app) {
  if (!app.uid && !app.gid && !app.user) return null;
  if (cst.IS_WINDOWS) {
    Common.printError(`${cst.PREFIX_MSG_ERR}--uid and --git does not works on windows`);
    return new Error('--uid and --git does not works on windows');
  }
  if (process.env.NODE_ENV !== 'test' && process.getuid && process.getuid() !== 0) {
    Common.printError(`${cst.PREFIX_MSG_ERR}To use --uid and --gid please run pm2 as root`);
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
  return null;
}

/**
 * Normalize the instances field (handle "max" and string values).
 */
function normalizeInstances(app) {
  if (app.instances === 'max') app.instances = 0;
  if (typeof app.instances === 'string') app.instances = parseInt(app.instances, 10) || 0;
}

/* -------------------------------------------------------------------------- */
/* Misc helpers                                                                */
/* -------------------------------------------------------------------------- */

Common.getCurrentUsername = function () {
  let current = '';
  if (os.userInfo) {
    try {
      current = os.userInfo().username;
    } catch (_) {}
  }
  if (!current) {
    current =
      process.env.USER ||
      process.env.LNAME ||
      process.env.USERNAME ||
      process.env.SUDO_USER ||
      process.env.C9_USER ||
      process.env.LOGNAME;
  }
  return current;
};

Common.renderApplicationName = function (conf) {
  if (!conf.name && conf.script) {
    conf.name = path.basename(conf.script);
    const dot = conf.name.lastIndexOf('.');
    if (dot > 0) conf.name = conf.name.slice(0, dot);
  }
};

/**
 * Simple warning logger used internally.
 */
function warn(message) {
  Common.printOut(`${cst.PREFIX_MSG_WARNING}${message}`);
}

/* -------------------------------------------------------------------------- */
/* Node interpreter resolution helper                                         */
/* -------------------------------------------------------------------------- */

function resolveNodeInterpreter(app) {
  if (app.exec_mode?.includes('cluster')) {
    Common.printError(`${cst.PREFIX_MSG_WARNING}${chalk.bold.yellow('Choosing the Node.js version in cluster mode is not supported')}`);
    return false;
  }

  const nvmPath = cst.IS_WINDOWS ? process.env.NVM_HOME : process.env.NVM_DIR;
  if (!nvmPath) {
    Common.printError(`${cst.PREFIX_MSG_ERR}${chalk.red('NVM is not available in PATH')}`);
    Common.printError(`${cst.PREFIX_MSG_ERR}${chalk.red('Fallback to node in PATH')}`);
    const msg = cst.IS_WINDOWS
      ? 'https://github.com/coreybutler/nvm-windows/releases/'
      : '$ curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash';
    Common.printOut(`${cst.PREFIX_MSG_ERR}${chalk.bold('Install NVM:\n' + msg)}`);
    return;
  }

  const nodeVersion = app.exec_interpreter.split('@')[1];
  const nodePathSuffix = cst.IS_WINDOWS
    ? `/v${nodeVersion}/node.exe`
    : semver.satisfies(nodeVersion, '>=0.12.0')
    ? `/versions/node/v${nodeVersion}/bin/node`
    : `/v${nodeVersion}/bin/node`;
  let nodePath = path.join(nvmPath, nodePathSuffix);

  try {
    fs.accessSync(nodePath);
  } catch (_) {
    Common.printOut(`${cst.PREFIX_MSG}Installing Node v${nodeVersion}`);
    const nvmBin = path.join(nvmPath, `nvm.${cst.IS_WINDOWS ? 'exe' : 'sh'}`);
    const nvmCmd = cst.IS_WINDOWS
      ? `${nvmBin} install ${nodeVersion}`
      : `. ${nvmBin} ; nvm install ${nodeVersion}`;
    Common.printOut(`${cst.PREFIX_MSG}Executing: ${nvmCmd}`);

    execSync(nvmCmd, {
      cwd: path.resolve(process.cwd()),
      env: process.env,
      maxBuffer: 20 * 1024 * 1024,
    });

    if (cst.IS_WINDOWS) nodePath = nodePath.replace(/node/, 'node' + process.arch.slice(1));
  }

  Common.printOut(
    `${cst.PREFIX_MSG}${chalk.green.bold('Setting Node to v%s (path=%s)')}`,
    nodeVersion,
    nodePath
  );
  app.exec_interpreter = nodePath;
}