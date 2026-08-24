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

/**
 * Get user's home directory in a platform-aware manner.
 * @returns {string|null}
 */
function homedir() {
  const env = process.env;
  const user = env.LOGNAME || env.USER || env.LNAME || env.USERNAME;

  if (process.platform === 'win32') {
    return env.USERPROFILE || env.HOMEDRIVE + env.HOMEPATH || env.HOME || null;
  }

  if (process.platform === 'darwin') {
    return env.HOME || (user ? '/Users/' + user : null);
  }

  if (process.platform === 'linux') {
    return env.HOME || (process.getuid() === 0 ? '/root' : (user ? '/home/' + user : null));
  }

  return env.HOME || null;
}

/**
 * Resolve ~ in file paths to user's home directory.
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
 * Mute console output if silent mode is enabled.
 */
Common.determineSilentCLI = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const s1opt = process.argv.indexOf('--silent');
  const s2opt = process.argv.indexOf('-s');

  const shouldSilence = process.env.PM2_SILENT ||
    (variadicArgsDashesPos > -1 &&
      (s1opt !== -1 && s1opt < variadicArgsDashesPos) &&
      (s2opt !== -1 && s2opt < variadicArgsDashesPos)) ||
    (variadicArgsDashesPos === -1 && (s1opt > -1 || s2opt > -1));

  if (shouldSilence) {
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
 * Print version and exit if -v flag is present before --.
 */
Common.printVersion = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const vIndex = process.argv.indexOf('-v');

  if (vIndex > -1 && vIndex < variadicArgsDashesPos) {
    console.log(pkg.version);
    process.exit(0);
  }
};

/**
 * Attempt to acquire reload lock; return elapsed time if locked, 0 if acquired.
 * @returns {number}
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
 * Release reload lock by clearing lock file content.
 */
Common.unlockReload = function() {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, '');
  } catch (e) {
    console.error(e.message || e);
  }
};

/**
 * Prepare and validate app configuration object.
 * @param {Object} opts
 * @param {Object} app
 * @returns {Object|Error}
 */
Common.prepareAppConf = function(opts, app) {
  if (!app.script) {
    return new Error('No script path - aborting');
  }

  let cwd = app.cwd ? path.resolve(app.cwd) : null;
  if (cwd && cwd[0] !== '/') cwd = path.resolve(process.cwd(), cwd);
  cwd = cwd || opts.cwd;

  app.pm_exec_path = path.resolve(cwd, app.script);

  if (!fs.existsSync(app.pm_exec_path)) {
    const checkedPath = which(app.script);
    if (checkedPath) {
      app.pm_exec_path = typeof checkedPath === 'string' ? checkedPath : checkedPath.toString();
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

  const env = (cst.PM2_PROGRAMMATIC || process.env.pm_id)
    ? Common.safeExtend({}, process.env)
    : process.env;

  app.env = [ {}, Common.filterEnv(app, env), app.env || {} ]
    .reduce((e1, e2) => Object.assign(e1, e2), {});

  app.pm_cwd = cwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch (e) {
    return e;
  }

  Common.sink.determineExecMode(app);

  const formatedAppName = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');

  ['log', 'out', 'error', 'pid'].forEach(function(f) {
    const af = app[f + '_file'];
    const ext = (f === 'pid' ? 'pid' : 'log');
    const isStd = !['log', 'pid'].includes(f);
    let ps;

    if (af) af = resolveHome(af);

    if ((f === 'log' && af === true) || (f !== 'log' && !af)) {
      ps = [cst['DEFAULT_' + ext.toUpperCase() + '_PATH'], formatedAppName + (isStd ? '-' + f : '') + '.' + ext];
    } else if ((f !== 'log' || af) && af !== 'NULL' && af !== '/dev/null') {
      ps = [cwd, af];
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
 * Filter environment variables based on app.filter_env configuration.
 * @param {Object} app
 * @param {Object} envObj
 * @returns {Object}
 */
Common.filterEnv = function(app, envObj) {
  if (app.filter_env === true) return {};

  if (typeof app.filter_env === 'string') {
    const filtered = { ...envObj };
    delete filtered[app.filter_env];
    return filtered;
  }

  if (!Array.isArray(app.filter_env) || app.filter_env.length === 0) {
    return envObj;
  }

  const allowedKeys = Object.keys(envObj).filter(key =>
    !app.filter_env.some(pattern => key.includes(pattern))
  );

  const newEnv = {};
  allowedKeys.forEach(key => { newEnv[key] = envObj[key]; });
  return newEnv;
};

/**
 * Known config file extensions and their types.
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
 * Determine if a filename corresponds to a config file.
 * @param {string} filename
 * @returns {string|null}
 */
Common.isConfigFile = function(filename) {
  if (typeof filename !== 'string') return null;

  for (const ext in Common.knonwConfigFileExtensions) {
    if (filename.indexOf(ext) !== -1) {
      return Common.knonwConfigFileExtensions[ext];
    }
  }

  return null;
};

/**
 * Generate candidate config file paths for a base name.
 * @param {string} name
 * @returns {string[]}
 */
Common.getConfigFileCandidates = function(name) {
  return Object.keys(Common.knonwConfigFileExtensions)
    .map(ext => name + ext);
};

/**
 * Parse config file content (JS, JSON, YAML).
 * @param {string} confObj
 * @param {string} filename
 * @returns {Object}
 */
Common.parseConfig = function(confObj, filename) {
  const yamljs = require('js-yaml');
  const vm = require('vm');

  const isConfigFile = Common.isConfigFile(filename);

  if (!filename || filename === 'pipe' || filename === 'none' || isConfigFile === 'json') {
    const code = '(' + confObj + ')';
    return vm.runInThisContext(code, {}, {
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
 * Normalize error input into an Error instance.
 * @param {*} e
 * @returns {Error}
 */
Common.retErr = function(e) {
  if (!e) return new Error('Unidentified error');
  if (e instanceof Error) return e;
  return new Error(e);
};

/**
 * Determine cron restart configuration.
 * @param {Object} app
 * @returns {Error|void}
 */
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
 * Resolve exec mode (cluster/fork) and default instances.
 * @param {Object} app
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

  if (typeof app.instances === 'undefined') {
    app.instances = 1;
  }
};

/**
 * Resolve Node.js interpreter version via NVM.
 * @param {Object} app
 * @returns {void|false}
 */
function resolveNodeInterpreter(app) {
  if (app.exec_mode && app.exec_mode.indexOf('cluster') > -1) {
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
  const pathToNode = cst.IS_WINDOWS
    ? '/v' + nodeVersion + '/node.exe'
    : semver.satisfies(nodeVersion, '>= 0.12.0')
      ? '/versions/node/v' + nodeVersion + '/bin/node'
      : '/v' + nodeVersion + '/bin/node';

  const nvmNodePath = path.join(nvmPath, pathToNode);

  try {
    fs.accessSync(nvmNodePath);
  } catch (e) {
    Common.printOut(cst.PREFIX_MSG + 'Installing Node v%s', nodeVersion);
    const nvmBin = path.join(nvmPath, 'nvm.' + (cst.IS_WINDOWS ? 'exe' : 'sh'));
    const nvmCmd = cst.IS_WINDOWS
      ? nvmBin + ' install ' + nodeVersion
      : '. ' + nvmBin + ' ; nvm install ' + nodeVersion;

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

  Common.printOut(cst.PREFIX_MSG + chalk.green.bold('Setting Node to v%s (path=%s)'),
                  nodeVersion,
                  nvmNodePath);

  app.exec_interpreter = nvmNodePath;
}

/**
 * Resolve interpreter for the app.
 * @param {Object} app
 * @returns {Object}
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

  return app;
};

/**
 * Deep copy / clone utility.
 * @param {*} obj
 * @returns {Object}
 */
Common.deepCopy = Common.serialize = Common.clone = function(obj) {
  if (obj === null || obj === undefined) return {};
  return fclone(obj);
};

/**
 * Print error message for module-related operations.
 * @param {string|Error} msg
 */
Common.errMod = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) return console.error(msg.message);
  return console.error(`${cst.PREFIX_MSG_MOD_ERR}${msg}`);
};

/**
 * Print general error message.
 * @param {string|Error} msg
 */
Common.err = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) return console.error(`${cst.PREFIX_MSG_ERR}${msg.message}`);
  return console.error(`${cst.PREFIX_MSG_ERR}${msg}`);
};

/**
 * Print error message to stderr.
 * @param {string} msg
 */
Common.printError = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) return console.error(msg.message);
  return console.error.apply(console, arguments);
};

/**
 * Print info message to stdout.
 * @param {string} msg
 */
Common.log = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG}${msg}`);
};

/**
 * Print info message with prefix.
 * @param {string} msg
 */
Common.info = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG_INFO}${msg}`);
};

/**
 * Print warning message.
 * @param {string} msg
 */
Common.warn = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG_WARNING}${msg}`);
};

/**
 * Print module-related message.
 * @param {string} msg
 */
Common.logMod = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log(`${cst.PREFIX_MSG_MOD}${msg}`);
};

/**
 * Print output to stdout.
 * @param {...*} args
 */
Common.printOut = function() {
  if (process.env.PM2_SILENT === 'true' || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log.apply(console, arguments);
};

/**
 * Shallow extend destination with source.
 * @param {Object} destination
 * @param {Object} source
 * @returns {Object}
 */
Common.extend = function(destination, source) {
  if (typeof destination !== 'object') destination = {};
  if (!source || typeof source !== 'object') return destination;

  Object.keys(source).forEach(function(newKey) {
    if (source[newKey] !== '[object Object]') {
      destination[newKey] = source[newKey];
    }
  });

  return destination;
};

/**
 * Extend origin with add, ignoring PM2 internal keys.
 * @param {Object} origin
 * @param {Object} add
 * @returns {Object}
 */
Common.safeExtend = function(origin, add) {
  if (!add || typeof add !== 'object') return origin;

  const keysToIgnore = [
    'name', 'exec_mode', 'env', 'args', 'pm_cwd', 'exec_interpreter',
    'pm_exec_path', 'node_args', 'pm_out_log_path', 'pm_err_log_path',
    'pm_pid_path', 'pm_id', 'status', 'pm_uptime', 'created_at',
    'windowsHide', 'username', 'merge_logs', 'kill_retry_time',
    'prev_restart_delay', 'instance_var', 'unstable_restarts',
    'restart_time', 'axm_actions', 'pmx_module', 'command', 'watch',
    'filter_env', 'versioning', 'vizion_runing', 'MODULE_DEBUG',
    'pmx', 'axm_options', 'created_at', 'watch', 'vizion',
    'axm_dynamic', 'axm_monitor', 'instances', 'automation',
    'autostart', 'autorestart', 'stop_exit_codes', 'unstable_restart',
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
 * Merge environment variables from deploy config and app-specific envs.
 * @param {Object} app_env
 * @param {string} env_name
 * @param {Object} deploy_conf
 * @returns {Object}
 */
Common.mergeEnvironmentVariables = function(app_env, env_name, deploy_conf) {
  const app = fclone(app_env);

  for (const key in app.env) {
    if (typeof app.env[key] === 'object') {
      app.env[key] = JSON.stringify(app.env[key]);
    }
  }

  const newConf = { env: {} };
  Object.assign(newConf, app);

  if (env_name) {
    if (deploy_conf && deploy_conf[env_name] && deploy_conf[env_name].env) {
      Object.assign(newConf.env, deploy_conf[env_name].env);
    }

    Object.assign(newConf.env, app.env);

    if ('env_' + env_name in app) {
      Object.assign(newConf.env, app['env_' + env_name]);
    } else {
      Common.printOut(cst.PREFIX_MSG_WARNING + chalk.bold('Environment [%s] is not defined in process file'), env_name);
    }
  }

  delete newConf.exec_mode;

  const res = { current_conf: {} };
  Object.assign(res, newConf.env);
  Object.assign(res.current_conf, newConf);

  if (app.exec_interpreter && app.exec_interpreter.indexOf('@') > -1) {
    resolveNodeInterpreter(app);
    res.current_conf.exec_interpreter = app.exec_interpreter;
  }

  return res;
};

/**
 * Resolve and validate app attributes before process initialization.
 * @param {Object} opts
 * @param {Object} conf
 * @returns {Object}
 */
Common.resolveAppAttributes = function(opts, conf) {
  const confCopy = fclone(conf);
  const app = Common.prepareAppConf(opts, confCopy);

  if (app instanceof Error) {
    throw new Error(app.message);
  }

  return app;
};

/**
 * Validate and normalize app configurations.
 * @param {Array} appConfs
 * @returns {Array|Error}
 */
Common.verifyConfs = function(appConfs) {
  if (!appConfs || appConfs.length === 0) return [];

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
      const script = app.script;
      if (which('bash')) {
        app.script = 'bash';
        app.args = ['-c', script];
        if (!app.name) app.name = script;
      } else if (which('sh')) {
        app.script = 'sh';
        app.args = ['-c', script];
        if (!app.name) app.name = script;
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
      const ret = Common.sink.determineCron(app);
      if (ret instanceof Error) return ret;
    }

    const validation = Config.validateJSON(app);
    if (validation.errors && validation.errors.length > 0) {
      validation.errors.forEach(err => warn(err));
      return new Error(validation.errors);
    }

    verifiedConf.push(validation.config);
  }

  return verifiedConf;
};

/**
 * Get current OS username.
 * @returns {string}
 */
Common.getCurrentUsername = function() {
  let current_user = '';

  if (os.userInfo) {
    try {
      current_user = os.userInfo().username;
    } catch (err) {
      // Ignore unhandled error for uv_os_get_passwd
    }
  }

  if (current_user === '') {
    current_user = process.env.USER || process.env.LNAME ||
                   process.env.USERNAME || process.env.SUDO_USER ||
                   process.env.C9_USER || process.env.LOGNAME;
  }

  return current_user;
};

/**
 * Auto-generate app name from script if missing.
 * @param {Object} conf
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
 * Print warning message.
 * @param {string} warning
 */
function warn(warning) {
  Common.printOut(cst.PREFIX_MSG_WARNING + warning);
}