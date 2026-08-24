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

/**
 * Silences console output if PM2_SILENT or related flags are set.
 * Must be called early during CLI initialization.
 */
Common.determineSilentCLI = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const s1opt = process.argv.indexOf('--silent');
  const s2opt = process.argv.indexOf('-s');

  if (process.env.PM2_SILENT ||
      (variadicArgsDashesPos > -1 &&
        ((s1opt !== -1 && s1opt < variadicArgsDashesPos) ||
         (s2opt !== -1 && s2opt < variadicArgsDashesPos))) ||
      (variadicArgsDashesPos === -1 && (s1opt !== -1 || s2opt !== -1))) {
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
 * Outputs version and exits if -v flag present before '--'.
 */
Common.printVersion = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  if (process.argv.indexOf('-v') > -1 && process.argv.indexOf('-v') < variadicArgsDashesPos) {
    console.log(pkg.version);
    process.exit(0);
  }
};

/**
 * Attempts to acquire a reload lock. Returns remaining lock duration if locked, 0 if newly locked, throws on error.
 */
Common.lockReload = function() {
  try {
    const content = fs.readFileSync(cst.PM2_RELOAD_LOCKFILE).toString();

    if (content && content.length > 0) {
      const diff = dayjs().diff(parseInt(content));
      if (diff < cst.RELOAD_LOCK_TIMEOUT) {
        return diff;
      }
    }
  } catch (e) {
    // Ignore: file does not exist or unreadable
  }

  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, dayjs().valueOf().toString());
    return 0;
  } catch (e) {
    console.error(e.message || e);
    throw e;
  }
};

/**
 * Releases the reload lock by clearing the lockfile content.
 */
Common.unlockReload = function() {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, '');
  } catch (e) {
    console.error(e.message || e);
  }
};

/**
 * Normalizes app configuration and prepares runtime attributes.
 * @param {Object} opts  global processing options
 * @param {Object} app   raw app configuration object
 * @returns {Object|Error} normalized app config or Error instance
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

  cwd && (cwd[0] !== '/') && (cwd = path.resolve(process.cwd(), cwd));
  cwd = cwd || opts.cwd;

  app.pm_exec_path = path.resolve(cwd, app.script);

  if (!fs.existsSync(app.pm_exec_path)) {
    const found = which(app.script);
    if (found) {
      app.pm_exec_path = typeof found === 'string' ? found : found.toString();
    } else {
      return new Error(`Script not found: ${app.pm_exec_path}`);
    }
  }

  if (app.disable_source_map_support !== true) {
    try {
      fs.accessSync(app.pm_exec_path + '.map', fs.constants.R_OK);
      app.source_map_support = true;
    } catch (e) {
      // ignore
    }
    delete app.disable_source_map_support;
  }

  delete app.script;

  const env = Common.sink.shouldCopyInternalEnv()
    ? Common.safeExtend({}, process.env)
    : { ...process.env };

  app.env = [
    {},
    (app.filter_env && app.filter_env.length > 0)
      ? Common._filterEnvironment(env, app.filter_env)
      : env,
    app.env || {}
  ].reduce((e1, e2) => Object.assign(e1, e2), {});

  app.pm_cwd = cwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch (e) {
    return e;
  }

  Common.sink.determineExecMode(app);

  const normalizedAppName = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');

  Common._normalizeLogPidPaths(app, cwd, normalizedAppName);

  return app;
};

/**
 * Applies standard log/pid path assignment based on app config.
 */
Common._normalizeLogPidPaths = function(app, cwd, normalizedAppName) {
  const标准化路径定义 = {
    log: { sub: '',  key: 'pm_log_path',  suffix: '.log',  std: false },
    out: { sub: 'out_', key: 'pm_out_log_path', suffix: '.log',  std: true },
    err: { sub: 'err_', key: 'pm_err_log_path', suffix: '.log',  std: true },
    pid: { sub: '',  key: 'pm_pid_path',  suffix: '.pid', std: false }
  };

  Object.keys(标准化路径定义).forEach((t) => {
    const { sub, key, suffix, std } = 标准化路径定义[t];
    const af = app[t + '_file'];
    let finalPath = null;
    if (af) af = resolveHome(af);

    if ((t === 'log' && af === true) || (!af && std)) {
      finalPath = [cst['DEFAULT_LOG_PATH'], normalizedAppName + (std ? '-' + t : '') + suffix];
    } else if (af && af !== 'NULL' && af !== '/dev/null') {
      finalPath = [cwd, af];
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
      app[key] = finalPath ? path.resolve.apply(null, finalPath) : null;
    } else if (path.sep === '\\') {
      app[key] = '\\\\.\\NUL';
    } else {
      app[key] = '/dev/null';
    }

    delete app[t + '_file'];
  });
};

/**
 * Selects environment variables allowed per filter_env rules.
 */
Common._filterEnvironment = function(envObj, filterRules) {
  if (filterRules === true) return {};
  if (typeof filterRules === 'string') {
    delete envObj[filterRules];
    return envObj;
  }

  const allowedKeys = Object.keys(envObj).filter(k => filterRules.every(rule => !k.includes(rule)));
  return allowedKeys.reduce((acc, k) => { acc[k] = envObj[k]; return acc; }, {});
};

/**
 * Detects known config file extensions and returns their types.
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
 * Determines if a filename is a supported config file.
 */
Common.isConfigFile = function (filename) {
  if (typeof filename !== 'string') return null;

  for (const ext in Common.knonwConfigFileExtensions) {
    if (filename.includes(ext)) return Common.knonwConfigFileExtensions[ext];
  }
  return null;
};

/**
 * Returns all candidate config filenames for a base name.
 */
Common.getConfigFileCandidates = function (name) {
  return Object.keys(Common.knonwConfigFileExtensions).map(ext => name + ext);
};

/**
 * Parses a configuration file (JS, JSON, YAML).
 */
Common.parseConfig = function(confObj, filename) {
  const yamljs = require('js-yaml');
  const vm = require('vm');

  const type = Common.isConfigFile(filename);

  if (!filename || ['pipe', 'none'].includes(filename) || type === 'json') {
    const sandbox = {};
    return vm.runInThisContext('(' + confObj + ')', sandbox, {
      filename: path.resolve(filename),
      displayErrors: false,
      timeout: 1000
    });
  } else if (type === 'yaml') {
    return yamljs.load(confObj.toString());
  } else if (['js', 'mjs'].includes(type)) {
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

/**
 * Describes current execution mode and cluster/fork strategy.
 */
Common.sink = {};

/**
 * Validates and sets cron restart pattern or returns Error.
 */
Common.sink.determineCron = function(app) {
  if (app.cron_restart == 0 || app.cron_restart == '0') {
    Common.printOut(cst.PREFIX_MSG + 'disabling cron restart');
    return;
  }

  if (app.cron_restart) {
    try {
      const Croner = require('croner');
      Croner(app.cron_restart);
      Common.printOut(cst.PREFIX_MSG + 'cron restart at ' + app.cron_restart);
    } catch (ex) {
      return new Error(`Cron pattern error: ${ex.message}`);
    }
  }
};

/**
 * Standardizes exec_mode to 'fork_mode' or 'cluster_mode'.
 */
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
  if (typeof app.instances === 'undefined') app.instances = 1;
};

Common.sink.shouldCopyInternalEnv = function() {
  return cst.PM2_PROGRAMMATIC || !!process.env.pm_id;
};

/**
 * Resolves Node version via NVM if versioned interpreter specified.
 */
function resolveNodeInterpreter(app) {
  if (app.exec_mode && app.exec_mode.includes('cluster')) {
    Common.printError(cst.PREFIX_MSG_WARNING +
      chalk.bold.yellow('Choosing the Node.js version in cluster mode is not supported'));
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
}

/**
 * Normalizes interpreter resolution including NVM and file-type fallbacks.
 */
Common.sink.resolveInterpreter = function(app) {
  const noInterpreter = !app.exec_interpreter;
  const extName = path.extname(app.pm_exec_path);
  const betterInterpreter = extItps[extName];

  if (noInterpreter && (extName === '.js' || extName === '.ts') && cst.IS_BUN) {
    app.exec_interpreter = process.execPath;
  } else if (noInterpreter && betterInterpreter) {
    app.exec_interpreter = betterInterpreter;

    if (betterInterpreter === 'python') {
      const python = which('python');
      if (python === null) {
        const python3 = which('python3');
        if (python3 === null) {
          Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('python and python3 binaries not available in PATH'));
        } else {
          app.exec_interpreter = 'python3';
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

  if (app.exec_interpreter !== 'none' && which(app.exec_interpreter) === null) {
    if (app.exec_interpreter === 'node') {
      Common.warn(`Using builtin node.js version on version ${process.version}`);
      app.exec_interpreter = cst.BUILTIN_NODE_PATH;
    } else {
      throw new Error(`Interpreter ${app.exec_interpreter} is NOT AVAILABLE in PATH.`);
    }
  }

  return app;
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
 * Merges source object into destination без вложенных объектов.
 */
Common.extend = function(destination, source) {
  if (typeof destination !== 'object') destination = {};
  if (!source || typeof source !== 'object') return destination;

  Object.keys(source).forEach(new_key => {
    if (source[new_key] !== '[object Object]') {
      destination[new_key] = source[new_key];
    }
  });

  return destination;
};

/**
 * Safely extends origin with add, ignoring PM2-specific keys.
 */
Common.safeExtend = function(origin, add) {
  if (!add || typeof add !== 'object') return origin;

  const keysToIgnore = [
    'name','exec_mode','env','args','pm_cwd','exec_interpreter','pm_exec_path','node_args',
    'pm_out_log_path','pm_err_log_path','pm_pid_path','pm_id','status','pm_uptime','created_at',
    'windowsHide','username','merge_logs','kill_retry_time','prev_restart_delay','instance_var',
    'unstable_restarts','restart_time','axm_actions','pmx_module','command','watch','filter_env',
    'versioning','vizion_runing','MODULE_DEBUG','pmx','axm_options','created_at','watch','vizion',
    'axm_dynamic','axm_monitor','instances','automation','autostart','autorestart',
    'stop_exit_codes','unstable_restart','treekill','exit_code','vizion'
  ];

  Object.keys(add).forEach(key => {
    if (!keysToIgnore.includes(key) && add[key] !== '[object Object]') {
      origin[key] = add[key];
    }
  });

  return origin;
};

/**
 * Merges environment variables from deploy and app-specific env_* blocks.
 */
Common.mergeEnvironmentVariables = function(app_env, env_name, deploy_conf) {
  const app = fclone(app_env);
  const new_conf = {};

  for (const key in app.env) {
    if (typeof app.env[key] === 'object') {
      app.env[key] = JSON.stringify(app.env[key]);
    }
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

  const res = {
    current_conf: {}
  };
  Object.assign(res, new_conf.env);
  Object.assign(res.current_conf, new_conf);

  if (app.exec_interpreter && app.exec_interpreter.includes('@')) {
    resolveNodeInterpreter(app);
    res.current_conf.exec_interpreter = app.exec_interpreter;
  }

  return res;
};

/**
 * Normalizes and validates app configurations before startup.
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
 * Validates and normalizes a list of app configurations.
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

    if (app.script && app.script.includes(' ') && !cst.IS_WINDOWS) {
      Common._normalizeShellScript(app);
    }

    if (app.time || process.env.ASZ_MODE) {
      app.log_date_format = 'YYYY-MM-DDTHH:mm:ss';
    }

    if (app.uid || app.gid || app.user) {
      Common._applyUidGid(app);
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

    if (app.cron_restart) {
      const cronResult = Common.sink.determineCron(app);
      if (cronResult instanceof Error) {
        return cronResult;
      }
    }

    const validated = Config.validateJSON(app);
    if (validated.errors && validated.errors.length > 0) {
      validated.errors.forEach(ex => Common.warn(ex));
      return new Error(validated.errors);
    }

    verifiedConf.push(validated.config);
  }

  return verifiedConf;
};

/**
 * Converts multi-word script into shell wrapper with bash/sh.
 */
Common._normalizeShellScript = function(app) {
  const _script = app.script;

  if (which('bash')) {
    app.script = 'bash';
    app.args = ['-c', _script];
  } else if (which('sh')) {
    app.script = 'sh';
    app.args = ['-c', _script];
  } else {
    warn('bash or sh not available in $PATH, keeping script as is');
    return;
  }

  if (!app.name) {
    app.name = _script;
  }
};

/**
 * Applies uid/gid from user/group ownership rules.
 */
Common._applyUidGid = function(app) {
  if (cst.IS_WINDOWS) {
    Common.printError(cst.PREFIX_MSG_ERR + '--uid and --gid does not work on Windows');
    return;
  }

  if (process.env.NODE_ENV !== 'test' && process.getuid && process.getuid() !== 0) {
    Common.printError(cst.PREFIX_MSG_ERR + 'To use --uid and --gid please run pm2 as root');
    return;
  }

  const { getUsers, getGroups } = require('./tools/passwd.js');

  try {
    const users = getUsers();
    const user_info = users[app.uid || app.user];

    if (!user_info) {
      Common.printError(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
      return;
    }

    app.env.HOME = user_info.homedir;
    app.uid = parseInt(user_info.userId);

    if (app.gid) {
      const groups = getGroups();
      const group_info = groups[app.gid];

      if (!group_info) {
        Common.printError(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
        return;
      }

      app.gid = parseInt(group_info.id);
    } else {
      app.gid = parseInt(user_info.groupId);
    }
  } catch (e) {
    Common.printError(e);
  }
};

/**
 * Gets current OS username using multiple fallback strategies.
 */
Common.getCurrentUsername = function() {
  let username = '';

  try {
    username = os.userInfo().username;
  } catch (err) {
    // ignore
  }

  if (!username) {
    username = process.env.USER || process.env.LNAME || process.env.USERNAME ||
               process.env.SUDO_USER || process.env.C9_USER || process.env.LOGNAME;
  }

  return username;
};

/**
 * Generates default app name from script basename.
 */
Common.renderApplicationName = function(conf) {
  if (!conf.name && conf.script) {
    conf.name = path.basename(conf.script);
    const lastDot = conf.name.lastIndexOf('.');
    if (lastDot > 0) {
      conf.name = conf.name.slice(0, lastDot);
    }
  }
};

/**
 * Displays warning message with standard prefix.
 */
function warn(msg) {
  Common.printOut(cst.PREFIX_MSG_WARNING + msg);
}