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

/* ---------- Helper Functions ---------- */

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
    return home || (process.getuid && process.getuid() === 0 ? '/root' : (user ? '/home/' + user : null));
  }
  return home || null;
}

function resolveHome(filepath) {
  if (filepath[0] === '~') {
    return path.join(homedir(), filepath.slice(1));
  }
  return filepath;
}

/* ---------- Public API ---------- */

Common.determineSilentCLI = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const s1opt = process.argv.indexOf('--silent');
  const s2opt = process.argv.indexOf('-s');

  const shouldSilence = process.env.PM2_SILENT ||
    (variadicArgsDashesPos > -1 &&
      s1opt !== -1 && s1opt < variadicArgsDashesPos &&
      s2opt !== -1 && s2opt < variadicArgsDashesPos) ||
    (variadicArgsDashesPos === -1 && (s1opt > -1 || s2opt > -1));

  if (!shouldSilence) return;

  for (const key in console) {
    const code = key.charCodeAt(0);
    if (code >= 97 && code <= 122) {
      console[key] = function () { };
    }
  }
  process.env.PM2_DISCRETE_MODE = true;
};

Common.printVersion = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const vPos = process.argv.indexOf('-v');

  if (vPos > -1 && (variadicArgsDashesPos === -1 || vPos < variadicArgsDashesPos)) {
    console.log(pkg.version);
    process.exit(0);
  }
};

Common.lockReload = function() {
  try {
    const content = fs.readFileSync(cst.PM2_RELOAD_LOCKFILE, 'utf8').trim();
    if (content) {
      const diff = dayjs().diff(parseInt(content, 10));
      if (diff < cst.RELOAD_LOCK_TIMEOUT) return diff;
    }
  } catch (_) { }

  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, dayjs().valueOf().toString());
    return 0;
  } catch (e) {
    console.error(e.message || e);
  }
};

Common.unlockReload = function() {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, '');
  } catch (e) {
    console.error(e.message || e);
  }
};

/* ---------- Prepare Application Configuration ---------- */

function validateAppScript(app) {
  if (!app.script) return new Error('No script path - aborting');
  return null;
}

function resolveCwd(app, opts) {
  if (app.cwd) {
    const resolved = path.resolve(app.cwd);
    process.env.PWD = app.cwd;
    return resolved;
  }
  return opts.cwd;
}

function ensureAbsoluteCwd(cwd) {
  if (cwd && cwd[0] !== '/' && !path.isAbsolute(cwd)) {
    return path.resolve(process.cwd(), cwd);
  }
  return cwd;
}

function resolveExecPath(app, cwd) {
  app.pm_exec_path = path.resolve(cwd, app.script);
  if (fs.existsSync(app.pm_exec_path)) return;

  const whichPath = which(app.script);
  if (whichPath) {
    app.pm_exec_path = typeof whichPath === 'string' ? whichPath : whichPath.toString();
  } else {
    throw new Error(`Script not found: ${app.pm_exec_path}`);
  }
}

function enableSourceMapSupport(app) {
  if (app.disable_source_map_support === true) return;
  try {
    fs.accessSync(app.pm_exec_path + '.map', fs.constants.R_OK);
    app.source_map_support = true;
  } catch (_) { }
  delete app.disable_source_map_support;
}

function buildEnv(app, opts) {
  let baseEnv = {};

  if (cst.PM2_PROGRAMMATIC || process.env.pm_id) {
    Common.safeExtend(baseEnv, process.env);
  } else {
    baseEnv = { ...process.env };
  }

  function filterEnv(envObj) {
    if (app.filter_env === true) return {};

    if (typeof app.filter_env === 'string') {
      delete envObj[app.filter_env];
      return envObj;
    }

    const allowed = Object.keys(envObj).filter(key => {
      return !app.filter_env.some(pattern => key.includes(pattern));
    });
    const filtered = {};
    allowed.forEach(k => filtered[k] = envObj[k]);
    return filtered;
  }

  const filteredEnv = (app.filter_env && app.filter_env.length > 0) ? filterEnv(process.env) : baseEnv;
  app.env = Object.assign({}, filteredEnv, app.env || {});
}

function formatAppName(app) {
  const sanitized = app.name.replace(/[^a-zA-Z0-9.\-]/g, '-');
  return sanitized;
}

function resolveLogPath(app, cwd, type, isStd) {
  const ext = type === 'pid' ? 'pid' : 'log';
  const defaultBase = cst['DEFAULT_' + ext.toUpperCase() + '_PATH'];
  const fileKey = `${type}_file`;
  let target = app[fileKey];

  if (target) target = resolveHome(target);

  if ((type === 'log' && typeof target === 'boolean' && target) ||
    (type !== 'log' && !target)) {
    return path.resolve(defaultBase, `${formatAppName(app)}${isStd ? '-' + type : ''}.${ext}`);
  }

  if (target && target !== 'NULL' && target !== '/dev/null') {
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
    return path.resolve(cwd, target);
  }

  // Null device handling
  if (path.sep === '\\') return '\\\\.\\NUL';
  return '/dev/null';
}

function assignLogPaths(app, cwd) {
  ['log', 'out', 'error', 'pid'].forEach(type => {
    const isStd = !['log', 'pid'].includes(type);
    const resolved = resolveLogPath(app, cwd, type, isStd);
    const prop = `pm_${isStd ? type.substr(0, 3) + '_' : ''}${type === 'pid' ? 'pid' : 'log'}_path`;
    app[prop] = resolved;
    delete app[`${type}_file`];
  });
}

Common.prepareAppConf = function(opts, app) {
  const scriptError = validateAppScript(app);
  if (scriptError) return scriptError;

  const cwdRaw = resolveCwd(app, opts);
  const cwd = ensureAbsoluteCwd(cwdRaw);
  app.cwd = cwd;

  if (!Array.isArray(app.node_args)) app.node_args = [];

  if (app.port && app.env) app.env.PORT = app.port;

  resolveExecPath(app, cwd);
  enableSourceMapSupport(app);
  delete app.script;

  buildEnv(app, opts);
  app.pm_cwd = cwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch (e) {
    return e;
  }

  Common.sink.determineExecMode(app);
  assignLogPaths(app, cwd);
  return app;
};

/* ---------- Config File Helpers ---------- */

Common.knonwConfigFileExtensions = {
  '.json': 'json',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.config.js': 'js',
  '.config.cjs': 'js',
  '.config.mjs': 'mjs'
};

Common.isConfigFile = function (filename) {
  if (typeof filename !== 'string') return null;
  for (const extension in Common.knonwConfigFileExtensions) {
    if (filename.includes(extension)) {
      return Common.knonwConfigFileExtensions[extension];
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
    return vm.runInThisContext(code, {
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

Common.retErr = function (e) {
  if (!e) return new Error('Unidentified error');
  return e instanceof Error ? e : new Error(e);
};

Common.sink = {};

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
  const nodePathSuffix = cst.IS_WINDOWS
    ? `/v${nodeVersion}/node.exe`
    : semver.satisfies(nodeVersion, '>= 0.12.0')
      ? `/versions/node/v${nodeVersion}/bin/node`
      : `/v${nodeVersion}/bin/node`;
  let nodePath = path.join(nvmPath, nodePathSuffix);

  try {
    fs.accessSync(nodePath);
  } catch (_) {
    Common.printOut(cst.PREFIX_MSG + 'Installing Node v%s', nodeVersion);
    const nvmBin = path.join(nvmPath, `nvm.${cst.IS_WINDOWS ? 'exe' : 'sh'}`);
    const nvmCmd = cst.IS_WINDOWS
      ? `${nvmBin} install ${nodeVersion}`
      : `. ${nvmBin} ; nvm install ${nodeVersion}`;

    Common.printOut(cst.PREFIX_MSG + 'Executing: %s', nvmCmd);
    execSync(nvmCmd, { cwd: process.cwd(), env: process.env, maxBuffer: 20 * 1024 * 1024 });

    if (cst.IS_WINDOWS) nodePath = nodePath.replace(/node/, 'node' + process.arch.slice(1));
  }

  Common.printOut(cst.PREFIX_MSG + chalk.green.bold('Setting Node to v%s (path=%s)'), nodeVersion, nodePath);
  app.exec_interpreter = nodePath;
};

Common.sink.resolveInterpreter = function (app) {
  const noInterpreter = !app.exec_interpreter;
  const extName = path.extname(app.pm_exec_path);
  const betterInterpreter = extItps[extName];

  if (noInterpreter && (extName === '.js' || extName === '.ts') && cst.IS_BUN === true) {
    app.exec_interpreter = process.execPath;
  }

  if (noInterpreter && betterInterpreter) {
    app.exec_interpreter = betterInterpreter;
    if (betterInterpreter === 'python') {
      if (!which('python')) {
        app.exec_interpreter = which('python3') ? 'python3' : null;
        if (!app.exec_interpreter) {
          Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('python and python3 binaries not available in PATH'));
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

Common.extend = function (destination, source) {
  if (typeof destination !== 'object' || destination === null) destination = {};
  if (!source || typeof source !== 'object') return destination;

  Object.keys(source).forEach(key => {
    if (source[key] != '[object Object]') destination[key] = source[key];
  });
  return destination;
};

Common.safeExtend = function (origin, add) {
  if (!add || typeof add !== 'object') return origin;
  const keysToIgnore = ['name', 'exec_mode', 'env', 'args', 'pm_cwd', 'exec_interpreter', 'pm_exec_path', 'node_args', 'pm_out_log_path', 'pm_err_log_path', 'pm_pid_path', 'pm_id', 'status', 'pm_uptime', 'created_at', 'windowsHide', 'username', 'merge_logs', 'kill_retry_time', 'prev_restart_delay', 'instance_var', 'unstable_restarts', 'restart_time', 'axm_actions', 'pmx_module', 'command', 'watch', 'filter_env', 'versioning', 'vizion_runing', 'MODULE_DEBUG', 'pmx', 'axm_options', 'created_at', 'watch', 'vizion', 'axm_dynamic', 'axm_monitor', 'instances', 'automation', 'autostart', 'autorestart', 'stop_exit_codes', 'unstable_restart', 'treekill', 'exit_code', 'vizion'];
  const keys = Object.keys(add);
  for (let i = keys.length - 1; i >= 0; i--) {
    const k = keys[i];
    if (!keysToIgnore.includes(k) && add[k] != '[object Object]') {
      origin[k] = add[k];
    }
  }
  return origin;
};

Common.mergeEnvironmentVariables = function (app_env, env_name, deploy_conf) {
  const app = fclone(app_env);
  const new_conf = { env: {} };

  for (const key in app.env) {
    if (typeof app.env[key] === 'object') app.env[key] = JSON.stringify(app.env[key]);
  }

  Object.assign(new_conf, app);

  if (env_name) {
    if (deploy_conf?.[env_name]?.env) Object.assign(new_conf.env, deploy_conf[env_name].env);
    Object.assign(new_conf.env, app.env);
    if (`env_${env_name}` in app) {
      Object.assign(new_conf.env, app[`env_${env_name}`]);
    } else {
      Common.printOut(cst.PREFIX_MSG_WARNING + chalk.bold(`Environment [${env_name}] is not defined in process file`));
    }
  }

  delete new_conf.exec_mode;

  const res = { current_conf: {} };
  Object.assign(res, new_conf.env);
  Object.assign(res.current_conf, new_conf);

  if (app.exec_interpreter?.includes('@')) {
    resolveNodeInterpreter(app);
    res.current_conf.exec_interpreter = app.exec_interpreter;
  }

  return res;
};

Common.resolveAppAttributes = function (opts, conf) {
  const confCopy = fclone(conf);
  const app = Common.prepareAppConf(opts, confCopy);
  if (app instanceof Error) throw new Error(app.message);
  return app;
};

/* ---------- Verification of Configurations ---------- */

function aliasScriptFields(app) {
  if (app.cmd && !app.script) {
    app.script = app.cmd;
    delete app.cmd;
  }
  if (app.command && !app.script) {
    app.script = app.command;
    delete app.command;
  }
}

function ensureAppName(app) {
  if (!app.name && app.script) {
    const base = path.basename(app.script);
    const dot = base.lastIndexOf('.');
    app.name = dot > 0 ? base.slice(0, dot) : base;
  }
}

function handleExecuteCommand(app) {
  if (app.execute_command === true) {
    app.exec_mode = 'fork';
    delete app.execute_command;
  }
}

function setCurrentUser(app) {
  app.username = Common.getCurrentUsername();
}

function handleScriptWithSpaces(app) {
  if (app.script && app.script.includes(' ') && !cst.IS_WINDOWS) {
    const original = app.script;
    if (which('bash')) {
      app.script = 'bash';
      app.args = ['-c', original];
    } else if (which('sh')) {
      app.script = 'sh';
      app.args = ['-c', original];
    } else {
      warn('bash or sh not available in $PATH, keeping script as is');
    }
    if (!app.name) app.name = original;
  }
}

function addLogDateFormat(app) {
  if (app.time || process.env.ASZ_MODE) {
    app.log_date_format = 'YYYY-MM-DDTHH:mm:ss';
  }
}

function resolveUidGid(app) {
  if (!app.uid && !app.gid && !app.user) return;
  if (cst.IS_WINDOWS) {
    Common.printError(cst.PREFIX_MSG_ERR + '--uid and --git does not works on windows');
    throw new Error('--uid and --git does not works on windows');
  }
  if (process.env.NODE_ENV !== 'test' && process.getuid && process.getuid() !== 0) {
    Common.printError(cst.PREFIX_MSG_ERR + 'To use --uid and --gid please run pm2 as root');
    throw new Error('To use UID and GID please run PM2 as root');
  }

  const passwd = require('./tools/passwd.js');
  const users = passwd.getUsers();
  const userInfo = users[app.uid || app.user];
  if (!userInfo) {
    const msg = `${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`;
    Common.printError(msg);
    throw new Error(msg);
  }

  app.env.HOME = userInfo.homedir;
  app.uid = parseInt(userInfo.userId, 10);

  if (app.gid) {
    const groups = passwd.getGroups();
    const groupInfo = groups[app.gid];
    if (!groupInfo) {
      const msg = `${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`;
      Common.printError(msg);
      throw new Error(msg);
    }
    app.gid = parseInt(groupInfo.id, 10);
  } else {
    app.gid = parseInt(userInfo.groupId, 10);
  }
}

function applyDeepMonitoring(app) {
  if (process.env.PM2_DEEP_MONITORING) app.deep_monitoring = true;
}

function handleAutomation(app) {
  if (app.automation === false) app.pmx = false;
}

function handleTrace(app) {
  if (app.disable_trace) {
    app.trace = false;
    delete app.disable_trace;
  }
}

function normalizeInstances(app) {
  if (app.instances === 'max') app.instances = 0;
  if (typeof app.instances === 'string') app.instances = parseInt(app.instances, 10) || 0;
  if (app.exec_mode !== 'cluster_mode' && !app.instances && typeof app.merge_logs === 'undefined') {
    app.merge_logs = true;
  }
}

function processCron(app) {
  if (app.cron_restart) {
    const ret = Common.sink.determineCron(app);
    if (ret instanceof Error) throw ret;
  }
}

function validateAppConfig(app) {
  const ret = Config.validateJSON(app);
  if (ret.errors && ret.errors.length > 0) {
    ret.errors.forEach(err => warn(err));
    throw new Error(ret.errors);
  }
  return ret.config;
}

Common.verifyConfs = function (appConfs) {
  if (!appConfs || appConfs.length === 0) return [];

  const list = [].concat(appConfs);
  const verified = [];

  for (const rawApp of list) {
    const app = { ...rawApp };

    if (app.exec_mode) app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');

    aliasScriptFields(app);
    ensureAppName(app);
    if (!app.env) app.env = {};

    handleExecuteCommand(app);
    setCurrentUser(app);
    handleScriptWithSpaces(app);
    addLogDateFormat(app);
    resolveUidGid(app);
    applyDeepMonitoring(app);
    handleAutomation(app);
    handleTrace(app);
    normalizeInstances(app);
    processCron(app);
    const validated = validateAppConfig(app);
    verified.push(validated);
  }

  return verified;
};

/* ---------- Miscellaneous ---------- */

Common.getCurrentUsername = function () {
  let current_user = '';

  if (os.userInfo) {
    try {
      current_user = os.userInfo().username;
    } catch (_) { }
  }

  if (!current_user) {
    current_user = process.env.USER || process.env.LNAME || process.env.USERNAME || process.env.SUDO_USER || process.env.C9_USER || process.env.LOGNAME;
  }

  return current_user;
};

Common.renderApplicationName = function (conf) {
  if (!conf.name && conf.script) {
    conf.name = path.basename(conf.script);
    const dot = conf.name.lastIndexOf('.');
    if (dot > 0) conf.name = conf.name.slice(0, dot);
  }
};

function warn(warning) {
  Common.printOut(ccst.PREFIX_MSG_WARNING + warning);
}