var fs        = require('fs');
var path      = path || require('path');
var os        = require('os');
var util      = util || require('util');
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

function getHomeDir() {
  const env = process.env;
  const user = env.LOGNAME || env.USER || env.LNAME || env.USERNAME;

  if (process.platform === 'win32') {
    return env.USERPROFILE || env.HOMEDRIVE + env.HOMEPATH || env.HOME || null;
  }

  if (process.platform === 'darwin') {
    return env.HOME || (user ? `/Users/${user}` : null);
  }

  if (process.platform === 'linux') {
    return env.HOME || (process.getuid() === 0 ? '/root' : (user ? `/home/${user}` : null));
  }

  return env.HOME || null;
}

function resolveHomePath(filepath) {
  if (filepath && filepath[0] === '~') {
    return path.join(getHomeDir(), filepath.slice(1));
  }
  return filepath;
}

function isSilentArgPresent(argIndex, variadicArgsDashesPos) {
  return argIndex !== -1 && (variadicArgsDashesPos === -1 || argIndex < variadicArgsDashesPos);
}

Common.determineSilentCLI = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const silentOptIndex = process.argv.indexOf('--silent');
  const shortSilentOptIndex = process.argv.indexOf('-s');

  const shouldSilence = process.env.PM2_SILENT ||
    (variadicArgsDashesPos > -1 &&
      (isSilentArgPresent(silentOptIndex, variadicArgsDashesPos) ||
       isSilentArgPresent(shortSilentOptIndex, variadicArgsDashesPos))) ||
    (variadicArgsDashesPos === -1 && (silentOptIndex > -1 || shortSilentOptIndex > -1));

  if (!shouldSilence) return;

  for (const key of Object.keys(console)) {
    const code = key.charCodeAt(0);
    if (code >= 97 && code <= 122) {
      console[key] = () => {};
    }
  }
  process.env.PM2_DISCRETE_MODE = true;
};

Common.printVersion = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const versionIndex = process.argv.indexOf('-v');

  if (versionIndex > -1 && isSilentArgPresent(versionIndex, variadicArgsDashesPos)) {
    console.log(pkg.version);
    process.exit(0);
  }
};

Common.lockReload = function() {
  try {
    const storedTimestampStr = fs.readFileSync(cst.PM2_RELOAD_LOCKFILE).toString();
    if (storedTimestampStr) {
      const diff = dayjs().diff(parseInt(storedTimestampStr));
      if (diff < cst.RELOAD_LOCK_TIMEOUT) return diff;
    }
  } catch (e) {}

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

/**
 * Resolve app paths and replace missing values with defaults.
 * @method prepareAppConf
 * @param {Object} opts Options including cwd
 * @param {Object} app Application configuration object
 * @returns {Object|Error} Updated app config or Error
 */
Common.prepareAppConf = function(opts, app) {
  if (!app.script) return new Error('No script path - aborting');

  const cwd = app.cwd ? path.resolve(app.cwd) : null;
  app.port && app.env && (app.env.PORT = app.port);
  !app.node_args && (app.node_args = []);

  const resolvedCwd = cwd && cwd[0] !== '/' ? path.resolve(process.cwd(), cwd) : cwd || opts.cwd;
  app.pm_exec_path = path.resolve(resolvedCwd, app.script);

  if (!fs.existsSync(app.pm_exec_path)) {
    if (which(app.script)) {
      app.pm_exec_path = which(app.script).toString();
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

  app.env = buildAppEnv(app, process.env);
  app.pm_cwd = resolvedCwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch (e) {
    return e;
  }

  Common.sink.determineExecMode(app);

  const formatedAppName = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');

  ['log', 'out', 'error', 'pid'].forEach(f => {
    const af = app[f + '_file'];
    const ext = f === 'pid' ? 'pid' : 'log';
    const isStd = !['log', 'pid'].includes(f);
    constafs = af ? resolveHomePath(af) : null;

    let filePaths = null;
    if ((f === 'log' && typeof af === 'boolean' && af) ||
        (f !== 'log' && !af)) {
      filePaths = [cst['DEFAULT_' + ext.toUpperCase() + '_PATH'], formatedAppName + (isStd ? '-' + f : '') + '.' + ext];
    } else if (af && af !== 'NULL' && af !== '/dev/null') {
      filePaths = [resolvedCwd, af];
      const dir = path.dirname(path.resolve(resolvedCwd, af));
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
      filePaths && (app['pm_' + (isStd ? f.substr(0, 3) + '_' : '') + ext + '_path'] = path.resolve(...filePaths));
    } else if (path.sep === '\\') {
      app['pm_' + (isStd ? f.substr(0, 3) + '_' : '') + ext + '_path'] = '\\\\.\\NUL';
    } else {
      app['pm_' + (isStd ? f.substr(0, 3) + '_' : '') + ext + '_path'] = '/dev/null';
    }
    delete app[f + '_file'];
  });

  return app;
};

function buildAppEnv(app, baseEnv) {
  function filterEnvironment(envObj) {
    if (app.filter_env === true) return {};
    if (typeof app.filter_env === 'string') {
      delete envObj[app.filter_env];
      return envObj;
    }
    const allowedKeys = Object.keys(envObj).filter(k => !app.filter_env.some(pattern => k.includes(pattern)));
    return allowedKeys.reduce((acc, k) => ({ ...acc, [k]: envObj[k] }), {});
  }

  const base = app.filter_env && app.filter_env.length > 0 ? filterEnvironment(baseEnv) : baseEnv;

  return [ {}, base, app.env || {} ].reduce((acc, item) => Object.assign(acc, item), {});
}

Common.knonwConfigFileExtensions = {
  '.json': 'json',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.config.js': 'js',
  '.config.cjs': 'js',
  '.config.mjs': 'mjs'
};

Common.isConfigFile = function(filename) {
  if (typeof filename !== 'string') return null;

  for (const ext of Object.keys(Common.knonwConfigFileExtensions)) {
    if (filename.includes(ext)) {
      return Common.knonwConfigFileExtensions[ext];
    }
  }

  return null;
};

Common.getConfigFileCandidates = function(name) {
  return Object.keys(Common.knonwConfigFileExtensions).map(ext => name + ext);
};

Common.parseConfig = function(confObj, filename) {
  const yamljs = require('js-yaml');

  const isConfig = Common.isConfigFile(filename);

  if (!filename || filename === 'pipe' || filename === 'none' || isConfig === 'json') {
    const sandbox = {};
    return vm.runInThisContext('(' + confObj + ')', sandbox, {
      filename: path.resolve(filename),
      displayErrors: false,
      timeout: 1000
    });
  } else if (isConfig === 'yaml') {
    return yamljs.load(confObj.toString());
  } else if (isConfig === 'js' || isConfig === 'mjs') {
    const confPath = require.resolve(path.resolve(filename));
    delete require.cache[confPath];
    return require(confPath);
  }
};

Common.retErr = function(e) {
  if (!e) return new Error('Unidentified error');
  if (e instanceof Error) return e;
  return new Error(e);
};

Common.sink = {};

Common.sink.determineCron = function(app) {
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

  app.instances = app.instances || 1;
};

function resolveNodeInterpreterImpl(app) {
  if (app.exec_mode && app.exec_mode.includes('cluster')) {
    Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('Choosing the Node.js version in cluster mode is not supported'));
    return;
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

  const version = app.exec_interpreter.split('@')[1];
  const archPath = semver.satisfies(version, '>= 0.12.0')
    ? `/versions/node/v${version}/bin/node`
    : `/v${version}/bin/node`;
  const nodePath = path.join(nvmPath, cst.IS_WINDOWS ? `/v${version}/node.exe` : archPath);

  try {
    fs.accessSync(nodePath);
  } catch (e) {
    Common.printOut(cst.PREFIX_MSG + 'Installing Node v%s', version);
    const nvmBin = path.join(nvmPath, 'nvm.' + (cst.IS_WINDOWS ? 'exe' : 'sh'));
    const cmd = cst.IS_WINDOWS
      ? `${nvmBin} install ${version}`
      : `. ${nvmBin} ; nvm install ${version}`;

    Common.printOut(cst.PREFIX_MSG + 'Executing: %s', cmd);
    execSync(cmd, {
      cwd: path.resolve(process.cwd()),
      env: process.env,
      maxBuffer: 20 * 1024 * 1024
    });

    if (cst.IS_WINDOWS) {
      const archSfx = process.arch.slice(1);
      app.exec_interpreter = nodePath.replace(/node/, `node${archSfx}`);
    } else {
      app.exec_interpreter = nodePath;
    }
  }

  Common.printOut(cst.PREFIX_MSG + chalk.green.bold('Setting Node to v%s (path=%s)'), version, app.exec_interpreter);
}

Common.sink.resolveInterpreter = function(app) {
  const extName = path.extname(app.pm_exec_path);
  const betterInterpreter = extItps[extName];
  const noInterpreter = !app.exec_interpreter;

  if (noInterpreter && extName === '.js' && extName === '.ts' && cst.IS_BUN) {
    app.exec_interpreter = process.execPath;
  } else if (noInterpreter && betterInterpreter) {
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
    resolveNodeInterpreterImpl(app);
  }

  if (app.exec_interpreter.includes('python')) {
    app.env.PYTHONUNBUFFERED = '1';
  }

  if (app.exec_interpreter === 'lsc') {
    app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/lsc');
  } else if (app.exec_interpreter === 'coffee') {
    app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/coffee');
  } else if (app.exec_interpreter !== 'none' && !which(app.exec_interpreter)) {
    if (app.exec_interpreter === 'node') {
      Common.warn(`Using builtin node.js version on version ${process.version}`);
      app.exec_interpreter = cst.BUILTIN_NODE_PATH;
    } else {
      throw new Error(`Interpreter ${app.exec_interpreter} is NOT AVAILABLE in PATH. (type 'which ${app.exec_interpreter}' to double check.)`);
    }
  }

  return app;
};

Common.deepCopy = Common.serialize = Common.clone = function(obj) {
  if (obj === null || obj === undefined) return {};
  return fclone(obj);
};

function shouldLog() {
  return !process.env.PM2_SILENT && process.env.PM2_PROGRAMMATIC !== 'true';
}

Common.errMod = function(msg) {
  if (!shouldLog()) return false;
  if (msg instanceof Error) return console.error(msg.message);
  return console.error(`${cst.PREFIX_MSG_MOD_ERR}${msg}`);
};

Common.err = function(msg) {
  if (!shouldLog()) return false;
  if (msg instanceof Error) return console.error(`${cst.PREFIX_MSG_ERR}${msg.message}`);
  return console.error(`${cst.PREFIX_MSG_ERR}${msg}`);
};

Common.printError = function(msg) {
  if (!shouldLog()) return false;
  if (msg instanceof Error) return console.error(msg.message);
  return console.error.apply(console, arguments);
};

Common.log = function(msg) {
  if (!shouldLog()) return false;
  return console.log(`${cst.PREFIX_MSG}${msg}`);
};

Common.info = function(msg) {
  if (!shouldLog()) return false;
  return console.log(`${cst.PREFIX_MSG_INFO}${msg}`);
};

Common.warn = function(msg) {
  if (!shouldLog()) return false;
  return console.log(`${cst.PREFIX_MSG_WARNING}${msg}`);
};

Common.logMod = function(msg) {
  if (!shouldLog()) return false;
  return console.log(`${cst.PREFIX_MSG_MOD}${msg}`);
};

Common.printOut = function() {
  if (process.env.PM2_SILENT === 'true' || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log.apply(console, arguments);
};

Common.extend = function(destination, source) {
  destination = typeof destination === 'object' ? destination : {};
  if (!source || typeof source !== 'object') return destination;

  Object.keys(source).forEach(key => {
    if (source[key] !== '[object Object]') {
      destination[key] = source[key];
    }
  });

  return destination;
};

Common.safeExtend = function(origin, add) {
  if (!add || typeof add !== 'object') return origin;

  const keysToIgnore = ['name', 'exec_mode', 'env', 'args', 'pm_cwd', 'exec_interpreter', 'pm_exec_path', 'node_args', 'pm_out_log_path', 'pm_err_log_path', 'pm_pid_path', 'pm_id', 'status', 'pm_uptime', 'created_at', 'windowsHide', 'username', 'merge_logs', 'kill_retry_time', 'prev_restart_delay', 'instance_var', 'unstable_restarts', 'restart_time', 'axm_actions', 'pmx_module', 'command', 'watch', 'filter_env', 'versioning', 'vizion_runing', 'MODULE_DEBUG', 'pmx', 'axm_options', 'created_at', 'watch', 'vizion', 'axm_dynamic', 'axm_monitor', 'instances', 'automation', 'autostart', 'autorestart', 'stop_exit_codes', 'unstable_restart', 'treekill', 'exit_code', 'vizion'];

  Object.keys(add).forEach(key => {
    if (!keysToIgnore.includes(key) && add[key] !== '[object Object]') {
      origin[key] = add[key];
    }
  });

  return origin;
};

Common.mergeEnvironmentVariables = function(appEnv, envName, deployConf) {
  const app = fclone(appEnv);

  for (const key of Object.keys(app.env)) {
    if (typeof app.env[key] === 'object') {
      app.env[key] = JSON.stringify(app.env[key]);
    }
  }

  const newConf = { env: {} };
  Object.assign(newConf, app);

  if (envName) {
    if (deployConf && deployConf[envName] && deployConf[envName].env) {
      Object.assign(newConf.env, deployConf[envName].env);
    }
    Object.assign(newConf.env, app.env);

    const namedEnvKey = 'env_' + envName;
    if (namedEnvKey in app) {
      Object.assign(newConf.env, app[namedEnvKey]);
    } else {
      Common.printOut(cst.PREFIX_MSG_WARNING + chalk.bold('Environment [%s] is not defined in process file'), envName);
    }
  }

  delete newConf.exec_mode;

  const res = { current_conf: {} };
  Object.assign(res, newConf.env);
  Object.assign(res.current_conf, newConf);

  if (app.exec_interpreter && app.exec_interpreter.includes('@')) {
    resolveNodeInterpreterImpl(app);
    res.current_conf.exec_interpreter = app.exec_interpreter;
  }

  return res;
};

Common.resolveAppAttributes = function(opts, conf) {
  const confCopy = fclone(conf);
  const app = Common.prepareAppConf(opts, confCopy);
  if (app instanceof Error) throw new Error(app.message);
  return app;
};

Common.verifyConfs = function(appConfs) {
  if (!appConfs || appConfs.length === 0) return [];

  appConfs = [].concat(appConfs);
  const verifiedConfs = [];

  for (const app of appConfs) {
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

    !app.env && (app.env = {});
    Common.renderApplicationName(app);

    if (app.execute_command) {
      app.exec_mode = 'fork';
      delete app.execute_command;
    }

    app.username = Common.getCurrentUsername();

    if (app.script && app.script.includes(' ') && !cst.IS_WINDOWS) {
      const _script = app.script;
      if (which('bash')) {
        app.script = 'bash';
        app.args = ['-c', _script];
        !app.name && (app.name = _script);
      } else if (which('sh')) {
        app.script = 'sh';
        app.args = ['-c', _script];
        !app.name && (app.name = _script);
      } else {
        Common.warn('bash or sh not available in $PATH, keeping script as is');
      }
    }

    if (app.time || process.env.ASZ_MODE) {
      app.log_date_format = 'YYYY-MM-DDTHH:mm:ss';
    }

    if (app.uid || app.gid || app.user) {
      if (cst.IS_WINDOWS) {
        Common.printError(cst.PREFIX_MSG_ERR + '--uid and --git does not works on windows');
        return new Error('--uid and --git does not works on windows');
      }

      if (process.env.NODE_ENV !== 'test' && process.getuid && process.getuid() !== 0) {
        Common.printError(cst.PREFIX_MSG_ERR + 'To use --uid and --gid please run pm2 as root');
        return new Error('To use UID and GID please run PM2 as root');
      }

      const users = require('./tools/passwd.js').getUsers();
      const userInfo = users[app.uid || app.user];
      if (!userInfo) {
        Common.printError(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
        return new Error(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
      }

      app.env.HOME = userInfo.homedir;
      app.uid = parseInt(userInfo.userId);

      if (app.gid) {
        const groups = require('./tools/passwd.js').getGroups();
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

    if (app.exec_mode !== 'cluster_mode' && !app.instances && app.merge_logs === undefined) {
      app.merge_logs = true;
    }

    if (app.cron_restart) {
      const ret = Common.sink.determineCron(app);
      if (ret instanceof Error) return ret;
    }

    const validation = Config.validateJSON(app);
    if (validation.errors && validation.errors.length > 0) {
      validation.errors.forEach(err => Common.warn(err));
      return new Error(validation.errors.join(', '));
    }

    verifiedConfs.push(validation.config);
  }

  return verifiedConfs;
};

Common.getCurrentUsername = function() {
  try {
    if (os.userInfo) {
      const user = os.userInfo();
      if (user.username) return user.username;
    }
  } catch (e) {
    // Ignore error for uv_os_get_passwd handling
  }

  return process.env.USER || process.env.LNAME || process.env.USERNAME ||
         process.env.SUDO_USER || process.env.C9_USER || process.env.LOGNAME;
};

Common.renderApplicationName = function(conf) {
  if (!conf.name && conf.script) {
    conf.name = path.basename(conf.script);
    const lastDot = conf.name.lastIndexOf('.');
    if (lastDot > 0) {
      conf.name = conf.name.slice(0, lastDot);
    }
  }
};

function warnForOutput(warning) {
  Common.printOut(cst.PREFIX_MSG_WARNING + warning);
}

// Re-export warn for backwards compatibility
Common.warn = warnForOutput;