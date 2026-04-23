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

/* ---------- Helper Functions ---------- */

/**
 * Resolve the home directory across platforms.
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
 * Expand a leading '~' to the user home directory.
 */
function resolveHome(filepath) {
  if (filepath[0] === '~') {
    return path.join(homedir(), filepath.slice(1));
  }
  return filepath;
}

/**
 * Determine if silent mode should be activated.
 */
function isSilentModeEnabled() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const s1opt = process.argv.indexOf('--silent');
  const s2opt = process.argv.indexOf('-s');

  const afterDashes = variadicArgsDashesPos > -1;
  const beforeDashes = (s1opt !== -1 && s1opt < variadicArgsDashesPos) ||
                       (s2opt !== -1 && s2opt < variadicArgsDashesPos);

  return process.env.PM2_SILENT ||
    (afterDashes && beforeDashes) ||
    (!afterDashes && (s1opt > -1 || s2opt > -1));
}

/**
 * Disable console output when silent mode is active.
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
 * Resolve the absolute execution path of the script.
 */
function resolveExecPath(app, cwd) {
  app.pm_exec_path = path.resolve(cwd, app.script);
  return app.pm_exec_path;
}

/**
 * Ensure the script exists; try to locate it in $PATH if missing.
 */
function ensureScriptExists(app) {
  if (fs.existsSync(app.pm_exec_path)) return true;

  const resolved = which(app.script);
  if (resolved) {
    app.pm_exec_path = typeof resolved === 'string' ? resolved : resolved.toString();
    return true;
  }
  return new Error(`Script not found: ${app.pm_exec_path}`);
}

/**
 * Enable source map support when a .map file is present.
 */
function maybeEnableSourceMap(app) {
  if (app.disable_source_map_support === true) return;
  try {
    fs.accessSync(app.pm_exec_path + '.map', fs.constants.R_OK);
    app.source_map_support = true;
  } catch (_) {}
  delete app.disable_source_map_support;
}

/**
 * Build the environment object for the app.
 */
function buildAppEnv(app) {
  const env = {};

  // Preserve or copy process env based on PM2_PROGRAMMATIC flag
  if (cst.PM2_PROGRAMMATIC || process.env.pm_id) {
    Common.safeExtend(env, process.env);
  } else {
    Object.assign(env, process.env);
  }

  /**
   * Filter environment variables according to app.filter_env.
   */
  function filterEnv(sourceEnv) {
    if (app.filter_env === true) return {};

    if (typeof app.filter_env === 'string') {
      delete sourceEnv[app.filter_env];
      return sourceEnv;
    }

    const allowed = Object.keys(sourceEnv).filter(key => {
      return !app.filter_env.some(disallowed => key.includes(disallowed));
    });
    const filtered = {};
    allowed.forEach(k => (filtered[k] = sourceEnv[k]));
    return filtered;
  }

  const baseEnv = (app.filter_env && app.filter_env.length > 0) ? filterEnv(process.env) : env;
  app.env = Object.assign({}, baseEnv, app.env || {});
}

/**
 * Resolve interpreter and execution mode for the app.
 */
function resolveInterpreterAndExecMode(app) {
  try {
    Common.sink.resolveInterpreter(app);
  } catch (e) {
    throw e;
  }
  Common.sink.determineExecMode(app);
}

/**
 * Configure log, out, error, and pid file paths.
 */
function configureLogPaths(app, cwd) {
  const formattedName = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');

  ['log', 'out', 'error', 'pid'].forEach(type => {
    const fileKey = `${type}_file`;
    const ext = type === 'pid' ? 'pid' : 'log';
    const isStd = !['log', 'pid'].includes(type);
    let targetPath = null;

    let fileValue = app[fileKey];
    if (fileValue) fileValue = resolveHome(fileValue);

    if ((type === 'log' && typeof fileValue === 'boolean' && fileValue) ||
        (type !== 'log' && !fileValue)) {
      targetPath = path.join(
        cst[`DEFAULT_${ext.toUpperCase()}_PATH`],
        `${formattedName}${isStd ? '-' + type : ''}.${ext}`
      );
    } else if (fileValue && fileValue !== 'NULL' && fileValue !== '/dev/null') {
      targetPath = path.resolve(cwd, fileValue);
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        Common.printError(`${cst.PREFIX_MSG_WARNING}Folder does not exist: ${dir}`);
        Common.printOut(`${cst.PREFIX_MSG}Creating folder: ${dir}`);
        try {
          require('mkdirp').sync(dir);
        } catch (err) {
          Common.printError(`${cst.PREFIX_MSG_ERR}Could not create folder: ${path.dirname(fileValue)}`);
          throw new Error('Could not create folder');
        }
      }
    }

    if (fileValue !== 'NULL' && fileValue !== '/dev/null') {
      if (targetPath) {
        const prop = `pm_${isStd ? type.substr(0, 3) + '_' : ''}${ext}_path`;
        app[prop] = targetPath;
      }
    } else {
      const nullPath = path.sep === '\\' ? '\\\\.\\NUL' : '/dev/null';
      const prop = `pm_${isStd ? type.substr(0, 3) + '_' : ''}${ext}_path`;
      app[prop] = nullPath;
    }

    delete app[fileKey];
  });
}

/* ---------- Exported Functions ---------- */

Common.determineSilentCLI = function () {
  if (isSilentModeEnabled()) {
    silenceConsole();
    process.env.PM2_DISCRETE_MODE = true;
  }
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
  try {
    const content = fs.readFileSync(cst.PM2_RELOAD_LOCKFILE).toString();
    if (content) {
      const diff = dayjs().diff(parseInt(content));
      if (diff < cst.RELOAD_LOCK_TIMEOUT) return diff;
    }
  } catch (_) {}

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

/**
 * Prepare application configuration before launching.
 */
Common.prepareAppConf = function (opts, app) {
  const scriptError = validateAppScript(app);
  if (scriptError) return scriptError;

  const cwd = resolveCwd(app, opts);
  resolveExecPath(app, cwd);
  const scriptCheck = ensureScriptExists(app);
  if (scriptCheck instanceof Error) return scriptCheck;

  maybeEnableSourceMap(app);
  buildAppEnv(app);
  app.pm_cwd = cwd;

  resolveInterpreterAndExecMode(app);
  configureLogPaths(app, cwd);
  return app;
};

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
  return Object.keys(Common.knonwConfigFileExtensions).map(ext => name + ext);
};

Common.parseConfig = function (confObj, filename) {
  const yamljs = require('js-yaml');
  const vm = require('vm');
  const type = Common.isConfigFile(filename);

  if (!filename || filename === 'pipe' || filename === 'none' || type === 'json') {
    const code = '(' + confObj + ')';
    return vm.runInThisContext(code, {}, {
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

Common.sink = {};

Common.sink.determineCron = function (app) {
  if (app.cron_restart == 0 || app.cron_restart == '0') {
    Common.printOut(`${cst.PREFIX_MSG}disabling cron restart`);
    return;
  }
  if (app.cron_restart) {
    const Croner = require('croner');
    try {
      Common.printOut(`${cst.PREFIX_MSG}cron restart at ${app.cron_restart}`);
      Croner(app.cron_restart);
    } catch (ex) {
      return new Error(`Cron pattern error: ${ex.message}`);
    }
  }
};

/**
 * Resolve execution mode aliases and defaults.
 */
Common.sink.determineExecMode = function (app) {
  if (app.exec_mode) app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');

  if (!app.exec_mode &&
    (app.instances >= 1 || app.instances === 0 || app.instances === -1) &&
    (app.exec_interpreter?.includes('node') || app.exec_interpreter?.includes('bun'))) {
    app.exec_mode = 'cluster_mode';
  } else if (!app.exec_mode) {
    app.exec_mode = 'fork_mode';
  }
  if (typeof app.instances === 'undefined') app.instances = 1;
};

const resolveNodeInterpreter = function (app) {
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
  const nodePath = cst.IS_WINDOWS
    ? `/v${nodeVersion}/node.exe`
    : semver.satisfies(nodeVersion, '>= 0.12.0')
      ? `/versions/node/v${nodeVersion}/bin/node`
      : `/v${nodeVersion}/bin/node`;
  let nvmNodePath = path.join(nvmPath, nodePath);

  try {
    fs.accessSync(nvmNodePath);
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

    if (cst.IS_WINDOWS) nvmNodePath = nvmNodePath.replace(/node/, `node${process.arch.slice(1)}`);
  }

  Common.printOut(`${cst.PREFIX_MSG}${chalk.green.bold('Setting Node to v%s (path=%s)')}`, nodeVersion, nvmNodePath);
  app.exec_interpreter = nvmNodePath;
};

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
        app.exec_interpreter = which('python3') ? 'python3' : null;
        if (!app.exec_interpreter) {
          Common.printError(`${cst.PREFIX_MSG_WARNING}${chalk.bold.yellow('python and python3 binaries not available in PATH')}`);
        }
      }
    }
  } else if (noInterpreter) {
    app.exec_interpreter = isBinary(app.pm_exec_path) ? 'none' : process.execPath;
  } else if (app.exec_interpreter.includes('node@')) {
    resolveNodeInterpreter(app);
  }

  if (app.exec_interpreter.includes('python')) app.env.PYTHONUNBUFFERED = '1';
  if (app.exec_interpreter === 'lsc') app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/lsc');
  if (app.exec_interpreter === 'coffee') app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/coffee');

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
  return msg instanceof Error ? console.error(`${cst.PREFIX_MSG_ERR}${msg.message}`) : console.error(`${cst.PREFIX_MSG_ERR}${msg}`);
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
    'treekill', 'exit_code', 'vizion',
  ];
  Object.keys(add).forEach(key => {
    if (!ignore.includes(key) && add[key] != '[object Object]') {
      origin[key] = add[key];
    }
  });
  return origin;
};

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
    if (deploy_conf?.[env_name]?.env) Object.assign(result.env, deploy_conf[env_name].env);
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

Common.resolveAppAttributes = function (opts, conf) {
  const copy = fclone(conf);
  const app = Common.prepareAppConf(opts, copy);
  if (app instanceof Error) throw new Error(app.message);
  return app;
};

/* ---------- Verification Helpers ---------- */

/**
 * Normalize raw app configuration (aliases, defaults, etc.).
 */
function normalizeApp(raw) {
  const app = { ...raw };
  if (app.exec_mode) app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');
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
  if (app.execute_command) {
    app.exec_mode = 'fork';
    delete app.execute_command;
  }
  app.username = Common.getCurrentUsername();
  return app;
}

/**
 * Process a normalized app configuration (shell handling, logging, UID/GID, etc.).
 */
function processApp(app) {
  // Handle scripts with spaces (shell execution)
  if (app.script?.includes(' ') && !cst.IS_WINDOWS) {
    if (which('bash')) {
      app.args = ['-c', app.script];
      app.script = 'bash';
    } else if (which('sh')) {
      app.args = ['-c', app.script];
      app.script = 'sh';
    } else {
      warn('bash or sh not available in $PATH, keeping script as is');
    }
    if (!app.name) app.name = app.script;
  }

  // Add default log date format
  if (app.time || process.env.ASZ_MODE) app.log_date_format = 'YYYY-MM-DDTHH:mm:ss';

  // Resolve UID/GID if provided
  if (app.uid || app.gid || app.user) {
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
      Common.printError(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
      return new Error(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
    }
    app.env.HOME = userInfo.homedir;
    app.uid = parseInt(userInfo.userId);
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
        Common.printError(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
        return new Error(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
      }
      app.gid = parseInt(groupInfo.id);
    } else {
      app.gid = parseInt(userInfo.groupId);
    }
  }

  // Deep monitoring flag
  if (process.env.PM2_DEEP_MONITORING) app.deep_monitoring = true;
  if (app.automation === false) app.pmx = false;
  if (app.disable_trace) {
    app.trace = false;
    delete app.disable_trace;
  }

  // Instances handling
  if (app.instances === 'max') app.instances = 0;
  if (typeof app.instances === 'string') app.instances = parseInt(app.instances) || 0;
  if (app.exec_mode !== 'cluster_mode' && !app.instances && typeof app.merge_logs === 'undefined') {
    app.merge_logs = true;
  }

  // Cron handling
  if (app.cron_restart) {
    const cronResult = Common.sink.determineCron(app);
    if (cronResult instanceof Error) return cronResult;
  }

  // Validate configuration
  const validation = Config.validateJSON(app);
  if (validation.errors && validation.errors.length > 0) {
    validation.errors.forEach(err => warn(err));
    return new Error(validation.errors);
  }

  return validation.config;
}

/**
 * Verify and normalize an array of application configurations.
 */
Common.verifyConfs = function (appConfs) {
  if (!appConfs || appConfs.length === 0) return [];

  const list = [].concat(appConfs);
  const verified = [];

  for (const rawApp of list) {
    const normalized = normalizeApp(rawApp);
    const processed = processApp(normalized);
    if (processed instanceof Error) return processed;
    verified.push(processed);
  }

  return verified;
};

/* ---------- Miscellaneous ---------- */

Common.getCurrentUsername = function () {
  let currentUser = '';
  if (os.userInfo) {
    try {
      currentUser = os.userInfo().username;
    } catch (_) {}
  }
  if (!currentUser) {
    currentUser = process.env.USER || process.env.LNAME || process.env.USERNAME ||
      process.env.SUDO_USER || process.env.C9_USER || process.env.LOGNAME;
  }
  return currentUser;
};

Common.renderApplicationName = function (conf) {
  if (!conf.name && conf.script) {
    conf.name = path.basename(conf.script);
    const dotIdx = conf.name.lastIndexOf('.');
    if (dotIdx > 0) conf.name = conf.name.slice(0, dotIdx);
  }
};

function warn(message) {
  Common.printOut(`${cst.PREFIX_MSG_WARNING}${message}`);
}