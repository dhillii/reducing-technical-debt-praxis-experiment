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
 * Resolve home directory based on platform.
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
    return home || (process.getuid && process.getuid() === 0 ? '/root' : (user ? '/home/' + user : null));
  }

  return home || null;
}

/**
 * Resolve a path that may start with '~'.
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
 * Determine if CLI should run in silent mode.
 */
Common.determineSilentCLI = function () {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const s1opt = process.argv.indexOf('--silent');
  const s2opt = process.argv.indexOf('-s');

  if (isSilentEnabled(variadicArgsDashesPos, s1opt, s2opt)) {
    silenceConsole();
    process.env.PM2_DISCRETE_MODE = true;
  }
};

/**
 * @private
 * @param {number} dashPos
 * @param {number} s1
 * @param {number} s2
 * @returns {boolean}
 */
function isSilentEnabled(dashPos, s1, s2) {
  if (process.env.PM2_SILENT) return true;

  const beforeDash = dashPos > -1;
  const s1Before = s1 !== -1 && s1 < dashPos;
  const s2Before = s2 !== -1 && s2 < dashPos;

  if (beforeDash && s1Before && s2Before) return true;
  if (!beforeDash && (s1 > -1 || s2 > -1)) return true;

  return false;
}

/**
 * @private
 * Replace console methods with no‑ops.
 */
function silenceConsole() {
  for (const key in console) {
    const code = key.charCodeAt(0);
    if (code >= 97 && code <= 122) {
      console[key] = function () {};
    }
  }
}

/**
 * Print version and exit if '-v' flag is present before '--'.
 */
Common.printVersion = function () {
  const dashPos = process.argv.indexOf('--');
  const vPos = process.argv.indexOf('-v');

  if (vPos > -1 && (dashPos === -1 || vPos < dashPos)) {
    console.log(pkg.version);
    process.exit(0);
  }
};

/**
 * Acquire a reload lock, returning the remaining diff if locked.
 * @returns {number|undefined}
 */
Common.lockReload = function () {
  try {
    const content = fs.readFileSync(cst.PM2_RELOAD_LOCKFILE, 'utf8');
    if (content) {
      const diff = dayjs().diff(parseInt(content, 10));
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

/**
 * Release the reload lock.
 */
Common.unlockReload = function () {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, '');
  } catch (e) {
    console.error(e.message || e);
  }
};

/**
 * Prepare application configuration.
 * @param {Object} opts
 * @param {Object} app
 * @returns {Object|Error}
 */
Common.prepareAppConf = function (opts, app) {
  if (!app.script) return new Error('No script path - aborting');

  const cwd = resolveCwd(app, opts);
  app.node_args = app.node_args || [];

  if (app.port && app.env) app.env.PORT = app.port;

  app.pm_exec_path = path.resolve(cwd, app.script);
  const execPathError = resolveExecPath(app);
  if (execPathError) return execPathError;

  maybeEnableSourceMap(app);
  delete app.script;

  const env = resolveEnv(app);
  app.env = mergeEnvs(env, app);
  app.pm_cwd = cwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch (e) {
    return e;
  }

  Common.sink.determineExecMode(app);
  formatAppPaths(app, cwd);
  return app;
};

/**
 * Resolve working directory.
 * @private
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
 * Resolve the executable path, falling back to $PATH.
 * @private
 * @returns {Error|undefined}
 */
function resolveExecPath(app) {
  if (fs.existsSync(app.pm_exec_path)) return;

  const whichPath = which(app.script);
  if (whichPath) {
    app.pm_exec_path = typeof whichPath === 'string' ? whichPath : whichPath.toString();
    return;
  }

  return new Error(`Script not found: ${app.pm_exec_path}`);
}

/**
 * Enable source map support if a .map file exists.
 * @private
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
 * Resolve environment variables based on filter settings.
 * @private
 */
function resolveEnv(app) {
  const baseEnv = cst.PM2_PROGRAMMATIC || process.env.pm_id ? { ...process.env } : {};

  if (app.filter_env === true) return {};

  if (typeof app.filter_env === 'string') {
    const filtered = { ...baseEnv };
    delete filtered[app.filter_env];
    return filtered;
  }

  if (Array.isArray(app.filter_env) && app.filter_env.length > 0) {
    const allowed = Object.keys(baseEnv).filter(key =>
      !app.filter_env.some(pattern => key.includes(pattern))
    );
    const result = {};
    allowed.forEach(k => (result[k] = baseEnv[k]));
    return result;
  }

  return baseEnv;
}

/**
 * Merge environment objects.
 * @private
 */
function mergeEnvs(baseEnv, app) {
  return [ {}, baseEnv, app.env || {} ].reduce((e1, e2) => Object.assign(e1, e2), {});
}

/**
 * Format log, out, error, pid paths.
 * @private
 */
function formatAppPaths(app, cwd) {
  const formattedName = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');

  ['log', 'out', 'error', 'pid'].forEach(f => {
    const fileKey = `${f}_file`;
    let af = app[fileKey];
    const isStd = !~['log', 'pid'].indexOf(f);
    const ext = f === 'pid' ? 'pid' : 'log';

    if (af) af = resolveHome(af);

    const ps = computePath(f, af, isStd, ext, formattedName, cwd);
    assignPath(app, f, isStd, ext, ps);
    delete app[fileKey];
  });
}

/**
 * Compute the appropriate path array.
 * @private
 */
function computePath(f, af, isStd, ext, name, cwd) {
  const defaultPath = cst[`DEFAULT_${ext.toUpperCase()}_PATH`];
  if ((f === 'log' && typeof af === 'boolean' && af) || (f !== 'log' && !af)) {
    return [ defaultPath, `${name}${isStd ? '-' + f : ''}.${ext}` ];
  }

  if (af && af !== 'NULL' && af !== '/dev/null') {
    const dir = path.dirname(path.resolve(cwd, af));
    if (!fs.existsSync(dir)) {
      Common.printError(`${cst.PREFIX_MSG_WARNING}Folder does not exist: ${dir}`);
      Common.printOut(`${cst.PREFIX_MSG}Creating folder: ${dir}`);
      try {
        require('mkdirp').sync(dir);
      } catch (err) {
        Common.printError(`${cst.PREFIX_MSG_ERR}Could not create folder: ${path.dirname(af)}`);
        throw new Error('Could not create folder');
      }
    }
    return [ cwd, af ];
  }

  return null;
}

/**
 * Assign resolved path to the app object.
 * @private
 */
function assignPath(app, f, isStd, ext, ps) {
  if (ps) {
    app[`pm_${isStd ? f.substr(0, 3) + '_' : ''}${ext}_path`] = path.resolve(...ps);
  } else if (path.sep === '\\') {
    app[`pm_${isStd ? f.substr(0, 3) + '_' : ''}${ext}_path`] = '\\\\.\\NUL';
  } else {
    app[`pm_${isStd ? f.substr(0, 3) + '_' : ''}${ext}_path`] = '/dev/null';
  }
}

/**
 * Known configuration file extensions.
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
 * @param {string} filename
 * @returns {string|null}
 */
Common.isConfigFile = function (filename) {
  if (typeof filename !== 'string') return null;
  for (const extension in Common.knonwConfigFileExtensions) {
    if (filename.includes(extension)) return Common.knonwConfigFileExtensions[extension];
  }
  return null;
};

Common.getConfigFileCandidates = function (name) {
  return Object.keys(Common.knonwConfigFileExtensions).map(ext => name + ext);
};

/**
 * Parse a configuration file.
 * @param {string|Buffer} confObj
 * @param {string} filename
 * @returns {Object}
 */
Common.parseConfig = function (confObj, filename) {
  const yamljs = require('js-yaml');
  const vm = require('vm');
  const type = Common.isConfigFile(filename);

  if (!filename || filename === 'pipe' || filename === 'none' || type === 'json') {
    const code = '(' + confObj + ')';
    return vm.runInThisContext(code, {}, {
      filename: path.resolve(filename),
      displayErrors: false,
      timeout: 1000
    });
  }

  if (type === 'yaml') return yamljs.load(confObj.toString());

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
  if (isCronDisabled(app)) return;

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
 * @private
 */
function isCronDisabled(app) {
  return app.cron_restart == 0 || app.cron_restart == '0';
}

/**
 * Resolve execution mode aliases and defaults.
 * @param {Object} app
 */
Common.sink.determineExecMode = function (app) {
  if (app.exec_mode) app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');

  if (!app.exec_mode && shouldDefaultToCluster(app)) {
    app.exec_mode = 'cluster_mode';
  } else if (!app.exec_mode) {
    app.exec_mode = 'fork_mode';
  }

  if (typeof app.instances === 'undefined') app.instances = 1;
};

/**
 * @private
 */
function shouldDefaultToCluster(app) {
  const instancesOk = app.instances >= 1 || app.instances === 0 || app.instances === -1;
  const interpreterOk = app.exec_interpreter?.includes('node') || app.exec_interpreter?.includes('bun');
  return instancesOk && interpreterOk;
}

/**
 * Resolve Node interpreter via NVM if needed.
 * @param {Object} app
 * @returns {boolean|undefined}
 */
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
  const nodePath = buildNodePath(nodeVersion, nvmPath);
  try {
    fs.accessSync(nodePath);
  } catch (_) {
    installNodeVersion(nodeVersion, nvmPath);
  }

  Common.printOut(`${cst.PREFIX_MSG}${chalk.green.bold('Setting Node to v%s (path=%s)')}`, nodeVersion, nodePath);
  app.exec_interpreter = nodePath;
}

/**
 * @private
 */
function buildNodePath(version, nvmPath) {
  if (cst.IS_WINDOWS) return path.join(nvmPath, `/v${version}/node.exe`);
  return semver.satisfies(version, '>=0.12.0')
    ? path.join(nvmPath, `/versions/node/v${version}/bin/node`)
    : path.join(nvmPath, `/v${version}/bin/node`);
}

/**
 * @private
 */
function installNodeVersion(version, nvmPath) {
  Common.printOut(`${cst.PREFIX_MSG}Installing Node v%s`, version);
  const nvmBin = path.join(nvmPath, `nvm.${cst.IS_WINDOWS ? 'exe' : 'sh'}`);
  const nvmCmd = cst.IS_WINDOWS
    ? `${nvmBin} install ${version}`
    : `. ${nvmBin} ; nvm install ${version}`;

  Common.printOut(`${cst.PREFIX_MSG}Executing: %s`, nvmCmd);
  execSync(nvmCmd, {
    cwd: path.resolve(process.cwd()),
    env: process.env,
    maxBuffer: 20 * 1024 * 1024
  });

  if (cst.IS_WINDOWS) {
    const nodePath = path.join(nvmPath, `/v${version}/node.exe`);
    return nodePath.replace(/node/, `node${process.arch.slice(1)}`);
  }
}

/**
 * Resolve interpreter for the app.
 * @param {Object} app
 * @returns {Object}
 */
Common.sink.resolveInterpreter = function (app) {
  const noInterpreter = !app.exec_interpreter;
  const extName = path.extname(app.pm_exec_path);
  const betterInterpreter = extItps[extName];

  if (noInterpreter && (extName === '.js' || extName === '.ts') && cst.IS_BUN) {
    app.exec_interpreter = process.execPath;
  }

  if (noInterpreter && betterInterpreter) {
    app.exec_interpreter = betterInterpreter;
    maybeAdjustPython(app);
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

/**
 * @private
 */
function maybeAdjustPython(app) {
  if (app.exec_interpreter === 'python' && which('python') == null) {
    if (which('python3') != null) app.exec_interpreter = 'python3';
    else Common.printError(`${cst.PREFIX_MSG_WARNING}${chalk.bold.yellow('python and python3 binaries not available in PATH')}`);
  }
}

/**
 * Deep copy / clone utilities.
 */
Common.deepCopy = Common.serialize = Common.clone = function (obj) {
  if (obj === null || obj === undefined) return {};
  return fclone(obj);
};

/**
 * Error handling utilities.
 */
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

/**
 * Raw extend utility.
 * @param {Object} destination
 * @param {Object} source
 * @returns {Object}
 */
Common.extend = function (destination, source) {
  if (typeof destination !== 'object') destination = {};
  if (!source || typeof source !== 'object') return destination;

  Object.keys(source).forEach(key => {
    if (source[key] != '[object Object]') destination[key] = source[key];
  });

  return destination;
};

/**
 * Safe extend, ignoring PM2 internal keys.
 * @param {Object} origin
 * @param {Object} add
 * @returns {Object}
 */
Common.safeExtend = function (origin, add) {
  if (!add || typeof add !== 'object') return origin;

  const keysToIgnore = [
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
    if (!keysToIgnore.includes(key) && add[key] != '[object Object]') {
      origin[key] = add[key];
    }
  });
  return origin;
};

/**
 * Merge environment variables from various sources.
 * @param {Object} app_env
 * @param {string} env_name
 * @param {Object} deploy_conf
 * @returns {Object}
 */
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
      Common.printOut(`${cst.PREFIX_MSG_WARNING}${chalk.bold(`Environment [${env_name}] is not defined in process file`)}`);
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

/**
 * Resolve application attributes before preparation.
 * @param {Object} opts
 * @param {Object} conf
 * @returns {Object}
 */
Common.resolveAppAttributes = function (opts, conf) {
  const confCopy = fclone(conf);
  const app = Common.prepareAppConf(opts, confCopy);
  if (app instanceof Error) throw new Error(app.message);
  return app;
};

/**
 * Verify and normalize configuration objects.
 * @param {Array|Object} appConfs
 * @returns {Array}
 */
Common.verifyConfs = function (appConfs) {
  if (!appConfs || appConfs.length === 0) return [];

  const list = [].concat(appConfs);
  const verified = [];

  for (const rawApp of list) {
    const app = normalizeApp(rawApp);
    const cronResult = app.cron_restart ? Common.sink.determineCron(app) : null;
    if (cronResult instanceof Error) return cronResult;

    const validation = Config.validateJSON(app);
    if (validation.errors?.length) {
      validation.errors.forEach(err => warn(err));
      return new Error(validation.errors);
    }

    verified.push(validation.config);
  }

  return verified;
};

/**
 * @private
 * Normalize a single app configuration.
 * @param {Object} rawApp
 * @returns {Object}
 */
function normalizeApp(rawApp) {
  const app = { ...rawApp };

  if (app.exec_mode) app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');

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

  if (app.execute_command) {
    app.exec_mode = 'fork';
    delete app.execute_command;
  }

  app.username = Common.getCurrentUsername();

  handleScriptWithSpaces(app);
  addLogDateFormat(app);
  resolveUidGid(app);
  applyDeepMonitoring(app);
  applyAutomationFlags(app);
  normalizeInstances(app);
  maybeEnableMergeLogs(app);

  return app;
}

/**
 * @private
 */
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

/**
 * @private
 */
function addLogDateFormat(app) {
  if (app.time || process.env.ASZ_MODE) app.log_date_format = 'YYYY-MM-DDTHH:mm:ss';
}

/**
 * @private
 */
function resolveUidGid(app) {
  if (!app.uid && !app.gid && !app.user) return;

  if (cst.IS_WINDOWS) {
    Common.printError(`${cst.PREFIX_MSG_ERR}--uid and --git does not works on windows`);
    throw new Error('--uid and --git does not works on windows');
  }

  if (process.env.NODE_ENV !== 'test' && process.getuid && process.getuid() !== 0) {
    Common.printError(`${cst.PREFIX_MSG_ERR}To use --uid and --gid please run pm2 as root`);
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

/**
 * @private
 */
function applyDeepMonitoring(app) {
  if (process.env.PM2_DEEP_MONITORING) app.deep_monitoring = true;
}

/**
 * @private
 */
function applyAutomationFlags(app) {
  if (app.automation === false) app.pmx = false;
  if (app.disable_trace) {
    app.trace = false;
    delete app.disable_trace;
  }
}

/**
 * @private
 */
function normalizeInstances(app) {
  if (app.instances === 'max') app.instances = 0;
  if (typeof app.instances === 'string') app.instances = parseInt(app.instances, 10) || 0;
}

/**
 * @private
 */
function maybeEnableMergeLogs(app) {
  if (app.exec_mode !== 'cluster_mode' && !app.instances && typeof app.merge_logs === 'undefined') {
    app.merge_logs = true;
  }
}

/**
 * Get current username.
 * @returns {string}
 */
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

/**
 * Render an application name if missing.
 * @param {Object} conf
 */
Common.renderApplicationName = function (conf) {
  if (!conf.name && conf.script) {
    conf.name = path.basename(conf.script || 'undefined');
    const lastDot = conf.name.lastIndexOf('.');
    if (lastDot > 0) conf.name = conf.name.slice(0, lastDot);
  }
};

/**
 * Show warnings.
 * @param {string} warning
 */
function warn(warning) {
  Common.printOut(`${cst.PREFIX_MSG_WARNING}${warning}`);
}