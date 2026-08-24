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

function resolveHome(filepath) {
  if (filepath[0] === '~') {
    return path.join(homedir(), filepath.slice(1));
  }
  return filepath;
}

Common.determineSilentCLI = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const s1opt = process.argv.indexOf('--silent');
  const s2opt = process.argv.indexOf('-s');

  if (process.env.PM2_SILENT ||
      (variadicArgsDashesPos > -1 &&
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

Common.printVersion = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const vIndex = process.argv.indexOf('-v');

  if (vIndex > -1 && vIndex < variadicArgsDashesPos) {
    console.log(pkg.version);
    process.exit(0);
  }
};

Common.lockReload = function() {
  try {
    const t1 = fs.readFileSync(cst.PM2_RELOAD_LOCKFILE).toString();

    if (t1 && t1 !== '') {
      const diff = dayjs().diff(parseInt(t1));
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
 * @param opts {Object}
 * @param app {Object}
 * @return app|Error
 */
Common.prepareAppConf = function(opts, app) {
  if (!app.script) return new Error('No script path - aborting');

  let cwd = app.cwd ? path.resolve(app.cwd) : null;
  process.env.PWD = app.cwd;

  app.node_args ??= [];

  if (app.port && app.env) app.env.PORT = app.port;

  cwd &&= cwd[0] !== '/' ? path.resolve(process.cwd(), cwd) : cwd;
  cwd = cwd || opts.cwd;

  app.pm_exec_path = path.resolve(cwd, app.script);

  if (!fs.existsSync(app.pm_exec_path)) {
    const checkedAlias = which(app.script);
    if (checkedAlias) {
      app.pm_exec_path = typeof checkedAlias === 'string' ? checkedAlias : String(checkedAlias);
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

  const env = Common.sink.isProgrammaticStart() ? Common.safeExtend({}, process.env) : process.env;
  app.env = Common.mergeEnvironmentBlocks(env, app.filter_env, app.env);

  app.pm_cwd = cwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch (e) {
    return e;
  }

  Common.sink.determineExecMode(app);

  const formated_app_name = app.name.replace(/[^a-zA-Z0-9\.\-]/g, '-');

  Common.resolveLogPidPaths(app, cwd, formated_app_name);

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
 * Check if filename is a configuration file
 * @param {string} filename
 * @return {mixed} null if not conf file, json or yaml if conf
 */
Common.isConfigFile = function(filename) {
  if (typeof filename !== 'string') return null;

  for (const extension in Common.knonwConfigFileExtensions) {
    if (filename.indexOf(extension) !== -1) {
      return Common.knonwConfigFileExtensions[extension];
    }
  }

  return null;
};

Common.getConfigFileCandidates = function(name) {
  return Object.keys(Common.knonwConfigFileExtensions).map(extension => name + extension);
};

/**
 * Parses a config file like ecosystem.config.js. Supported formats: JS, JSON, JSON5, YAML.
 * @param {string} confString  contents of the config file
 * @param {string} filename    path to the config file
 * @return {Object} config object
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

Common.retErr = function(e) {
  if (!e) return new Error('Unidentified error');
  if (e instanceof Error) return e;
  return new Error(e);
};

Common.sink = {};

Common.sink.isProgrammaticStart = function() {
  return cst.PM2_PROGRAMMATIC || process.env.pm_id;
};

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
 * Handle exec_mode aliases (fork <=> fork_mode, cluster <=> cluster_mode)
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
  app.instances ??= 1;
};

var resolveNodeInterpreter = function(app) {
  if (app.exec_mode && app.exec_mode.indexOf('cluster') > -1) {
    Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('Choosing the Node.js version in cluster mode is not supported'));
    return;
  }

  const nvm_path = cst.IS_WINDOWS ? process.env.NVM_HOME : process.env.NVM_DIR;
  if (!nvm_path) {
    Common.printError(cst.PREFIX_MSG_ERR + chalk.red('NVM is not available in PATH'));
    Common.printError(cst.PREFIX_MSG_ERR + chalk.red('Fallback to node in PATH'));
    const msg = cst.IS_WINDOWS
      ? 'https://github.com/coreybutler/nvm-windows/releases/'
      : '$ curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash';
    Common.printOut(cst.PREFIX_MSG_ERR + chalk.bold('Install NVM:\n' + msg));
    return;
  }

  const node_version = app.exec_interpreter.split('@')[1];
  const path_to_node = cst.IS_WINDOWS
    ? `/v${node_version}/node.exe`
    : semver.satisfies(node_version, '>= 0.12.0')
      ? `/versions/node/v${node_version}/bin/node`
      : `/v${node_version}/bin/node`;
  let nvm_node_path = path.join(nvm_path, path_to_node);

  try {
    fs.accessSync(nvm_node_path);
  } catch (e) {
    Common.printOut(cst.PREFIX_MSG + 'Installing Node v%s', node_version);
    const nvm_bin = path.join(nvm_path, 'nvm.' + (cst.IS_WINDOWS ? 'exe' : 'sh'));
    const nvm_cmd = cst.IS_WINDOWS
      ? `${nvm_bin} install ${node_version}`
      : `. ${nvm_bin} ; nvm install ${node_version}`;

    Common.printOut(cst.PREFIX_MSG + 'Executing: %s', nvm_cmd);

    execSync(nvm_cmd, {
      cwd: path.resolve(process.cwd()),
      env: process.env,
      maxBuffer: 20 * 1024 * 1024
    });

    if (cst.IS_WINDOWS) {
      nvm_node_path = nvm_node_path.replace(/node/, `node${process.arch.slice(1)}`);
    }
  }

  Common.printOut(cst.PREFIX_MSG + chalk.green.bold('Setting Node to v%s (path=%s)'),
                  node_version,
                  nvm_node_path);

  app.exec_interpreter = nvm_node_path;
};

/**
 * Resolve interpreter for the app
 */
Common.sink.resolveInterpreter = function(app) {
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
};

Common.deepCopy = Common.serialize = Common.clone = function(obj) {
  if (obj === null || obj === undefined) return {};
  return fclone(obj);
};

Common.errMod = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) return console.error(msg.message);
  return console.error(`${cst.PREFIX_MSG_MOD_ERR}${msg}`);
};

Common.err = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) return console.error(`${cst.PREFIX_MSG_ERR}${msg.message}`);
  return console.error(`${cst.PREFIX_MSG_ERR}${msg}`);
};

Common.printError = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) return console.error(msg.message);
  return console.error.apply(console, arguments);
};

Common.log = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG}${msg}`);
};

Common.info = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG_INFO}${msg}`);
};

Common.warn = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG_WARNING}${msg}`);
};

Common.logMod = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG_MOD}${msg}`);
};

Common.printOut = function() {
  if (process.env.PM2_SILENT === 'true' || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log.apply(console, arguments);
};

/**
 * Raw extend
 */
Common.extend = function(destination, source) {
  if (typeof destination !== 'object') destination = {};
  if (!source || typeof source !== 'object') return destination;

  Object.keys(source).forEach(key => {
    if (source[key] !== '[object Object]') destination[key] = source[key];
  });

  return destination;
};

/**
 * This is useful when starting script programmatically
 */
Common.safeExtend = function(origin, add) {
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
    if (keysToIgnore.indexOf(key) === -1 && add[key] !== '[object Object]') {
      origin[key] = add[key];
    }
  });
  return origin;
};

/**
 * Merge environment blocks with priority: deploy conf < app.env < app.env_production|staging etc.
 */
Common.mergeEnvironmentBlocks = function(baseEnv, filterConfig, overrideEnv) {
  let env = baseEnv;
  if (Array.isArray(filterConfig) && filterConfig.length > 0) {
    env = filterEnvironmentObject(env, filterConfig);
  }

  const merged = Object.assign({}, env, overrideEnv || {});

  return merged;
};

/**
 * Filter environment object based on allowed/rejected keys
 */
function filterEnvironmentObject(envObj, filterConfig) {
  if (filterConfig === true) return {};
  if (typeof filterConfig === 'string') {
    const filtered = { ...envObj };
    delete filtered[filterConfig];
    return filtered;
  }

  const allowedKeys = Object.keys(envObj).filter(k => !filterConfig.includes(k));
  return allowedKeys.reduce((acc, key) => {
    acc[key] = envObj[key];
    return acc;
  }, {});
}

/**
 * Extend the app.env object of with the properties taken from the
 * app.env_[envName] and deploy configuration.
 */
Common.mergeEnvironmentVariables = function(app_env, env_name, deploy_conf) {
  const app = fclone(app_env);
  const new_conf = { env: {} };

  for (const key in app.env) {
    if (typeof app.env[key] === 'object') app.env[key] = JSON.stringify(app.env[key]);
  }

  Object.assign(new_conf, app);

  if (env_name) {
    if (deploy_conf && deploy_conf[env_name] && deploy_conf[env_name].env) {
      Object.assign(new_conf.env, deploy_conf[env_name].env);
    }
    Object.assign(new_conf.env, app.env);

    if ('env_' + env_name in app) {
      Object.assign(new_conf.env, app['env_' + env_name]);
    } else {
      Common.printOut(cst.PREFIX_MSG_WARNING + chalk.bold('Environment [%s] is not defined in process file'), env_name);
    }
  }

  delete new_conf.exec_mode;

  const res = { current_conf: {} };
  Object.assign(res, new_conf.env);
  Object.assign(res.current_conf, new_conf);

  if (app.exec_interpreter && app.exec_interpreter.indexOf('@') > -1) {
    resolveNodeInterpreter(app);
    res.current_conf.exec_interpreter = app.exec_interpreter;
  }

  return res;
};

/**
 * Resolve paths for logs and PID files
 */
Common.resolveLogPidPaths = function(app, cwd, formated_app_name) {
  ['log', 'out', 'error', 'pid'].forEach(f => {
    let af = app[f + '_file'];
    const ps = [];
    const ext = (f === 'pid' ? 'pid' : 'log');
    const isStd = !~['log', 'pid'].indexOf(f);

    if (af) af = resolveHome(af);

    if ((f === 'log' && typeof af === 'boolean' && af) || (f !== 'log' && !af)) {
      ps.push(cst['DEFAULT_' + ext.toUpperCase() + '_PATH'], formated_app_name + (isStd ? '-' + f : '') + '.' + ext);
    } else if ((f !== 'log' || (f === 'log' && af)) && af !== 'NULL' && af !== '/dev/null') {
      ps.push(cwd, af);

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

    if (af !== 'NULL' && af !== '/dev/null') {
      app['pm_' + (isStd ? f.slice(0, 3) + '_' : '') + ext + '_path'] = path.resolve.apply(null, ps);
    } else if (path.sep === '\\') {
      app['pm_' + (isStd ? f.slice(0, 3) + '_' : '') + ext + '_path'] = '\\\\.\\NUL';
    } else {
      app['pm_' + (isStd ? f.slice(0, 3) + '_' : '') + ext + '_path'] = '/dev/null';
    }
    delete app[f + '_file'];
  });
};

/**
 * Resolve app attributes before final processing
 */
Common.resolveAppAttributes = function(opts, conf) {
  const conf_copy = fclone(conf);
  const app = Common.prepareAppConf(opts, conf_copy);
  if (app instanceof Error) throw new Error(app.message);
  return app;
};

/**
 * Verify and normalize application configurations
 */
Common.verifyConfs = function(appConfs) {
  if (!appConfs || appConfs.length === 0) return [];

  appConfs = [].concat(appConfs);

  return appConfs.map(app => {
    if (app.exec_mode) {
      app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');
    }

    if (app.cmd && !app.script) { app.script = app.cmd; delete app.cmd; }
    if (app.command && !app.script) { app.script = app.command; delete app.command; }

    app.env ??= {};
    Common.renderApplicationName(app);

    if (app.execute_command) {
      app.exec_mode = 'fork';
      delete app.execute_command;
    }

    app.username = Common.getCurrentUsername();

    if (app.script && app.script.indexOf(' ') > -1 && !cst.IS_WINDOWS) {
      const _script = app.script;
      for (const shell of ['bash', 'sh']) {
        if (which(shell)) {
          app.script = shell;
          app.args = ['-c', _script];
          if (!app.name) app.name = _script;
          break;
        }
      }
    }

    if (app.time || process.env.ASZ_MODE) {
      app.log_date_format = 'YYYY-MM-DDTHH:mm:ss';
    }

    if (app.uid || app.gid || app.user) {
      if (cst.IS_WINDOWS) {
        Common.printError(cst.PREFIX_MSG_ERR + '--uid and --gid does not works on windows');
        return new Error('--uid and --gid does not works on windows');
      }

      if (process.env.NODE_ENV !== 'test' && process.getuid && process.getuid() !== 0) {
        Common.printError(cst.PREFIX_MSG_ERR + 'To use --uid and --gid please run pm2 as root');
        return new Error('To use UID and GID please run PM2 as root');
      }

      try {
        const passwd = require('./tools/passwd.js');
        const users = passwd.getUsers();
        const user_info = users[app.uid || app.user];
        if (!user_info) {
          Common.printError(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
          return new Error(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
        }

        app.env.HOME = user_info.homedir;
        app.uid = parseInt(user_info.userId);

        if (app.gid) {
          const groups = passwd.getGroups();
          const group_info = groups[app.gid];
          if (!group_info) {
            Common.printError(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
            return new Error(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
          }
          app.gid = parseInt(group_info.id);
        } else {
          app.gid = parseInt(user_info.groupId);
        }
      } catch (e) {
        Common.printError(e);
        return new Error(e);
      }
    }

    if (process.env.PM2_DEEP_MONITORING) app.deep_monitoring = true;

    if (app.automation === false) app.pmx = false;

    if (app.disable_trace) {
      app.trace = false;
      delete app.disable_trace;
    }

    if (app.instances === 'max') app.instances = 0;
    if (typeof app.instances === 'string') app.instances = parseInt(app.instances) || 0;

    if (app.exec_mode !== 'cluster_mode' && typeof app.merge_logs === 'undefined') {
      app.merge_logs = true;
    }

    if (app.cron_restart) {
      const cronResult = Common.sink.determineCron(app);
      if (cronResult instanceof Error) return cronResult;
    }

    const ret = Config.validateJSON(app);
    if (ret.errors && ret.errors.length > 0) {
      ret.errors.forEach(err => warn(err));
      return new Error(ret.errors);
    }

    return ret.config;
  }).filter(Boolean);
};

/**
 * Get current username
 */
Common.getCurrentUsername = function() {
  let current_user = '';

  if (os.userInfo) {
    try {
      current_user = os.userInfo().username;
    } catch (err) {}
  }

  if (!current_user) {
    current_user = process.env.USER || process.env.LNAME ||
                   process.env.USERNAME || process.env.SUDO_USER ||
                   process.env.C9_USER || process.env.LOGNAME;
  }

  return current_user;
};

/**
 * Render an app name from script if not provided.
 */
Common.renderApplicationName = function(conf) {
  if (!conf.name && conf.script) {
    conf.name = path.basename(conf.script);
    const lastDot = conf.name.lastIndexOf('.');
    if (lastDot > 0) conf.name = conf.name.slice(0, lastDot);
  }
};

/**
 * Show warnings
 */
function warn(warning) {
  Common.printOut(cst.PREFIX_MSG_WARNING + warning);
}