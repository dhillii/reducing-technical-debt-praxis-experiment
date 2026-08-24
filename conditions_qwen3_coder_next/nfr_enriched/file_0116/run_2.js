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
 * Get the user's home directory, platform-aware.
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
 * Resolve tilde to home directory if present.
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
 * Conditionally silence CLI output based on PM2_SILENT or CLI args.
 */
Common.determineSilentCLI = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const s1opt = process.argv.indexOf('--silent');
  const s2opt = process.argv.indexOf('-s');

  const shouldSilence = process.env.PM2_SILENT ||
    (variadicArgsDashesPos > -1 &&
      (s1opt > -1 && s1opt < variadicArgsDashesPos) &&
      (s2opt > -1 && s2opt < variadicArgsDashesPos)) ||
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
 * Print version and exit if -v is present before '--'.
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
 * Lock reboot mechanism to prevent multiple reloads.
 * Returns milliseconds since last lock or 0 if newly acquired.
 */
Common.lockReload = function() {
  try {
    const t1 = fs.readFileSync(cst.PM2_RELOAD_LOCKFILE).toString();
    if (t1) {
      const diff = dayjs().diff(parseInt(t1, 10));
      if (diff < cst.RELOAD_LOCK_TIMEOUT) {
        return diff;
      }
    }
  } catch(e) {}

  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, dayjs().valueOf().toString());
    return 0;
  } catch(e) {
    console.error(e.message || e);
  }
};

/**
 * Release the reload lock.
 */
Common.unlockReload = function() {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, '');
  } catch(e) {
    console.error(e.message || e);
  }
};

/**
 * Validate and normalize app configuration before launched.
 * @param {Object} opts - Options like cwd
 * @param {Object} app - App config object
 * @returns {Object|Error}
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

  app.node_args ??= [];

  if (app.port && app.env) {
    app.env.PORT = app.port;
  }

  cwd && cwd[0] !== '/' && (cwd = path.resolve(process.cwd(), cwd));
  cwd = cwd || opts.cwd;

  app.pm_exec_path = path.resolve(cwd, app.script);

  if (!fs.existsSync(app.pm_exec_path)) {
    const ckd = which(app.script);
    if (ckd) {
      app.pm_exec_path = typeof ckd === 'string' ? ckd : ckd.toString();
    } else {
      return new Error(`Script not found: ${app.pm_exec_path}`);
    }
  }

  if (app.disable_source_map_support !== true) {
    try {
      fs.accessSync(app.pm_exec_path + '.map', fs.constants.R_OK);
      app.source_map_support = true;
    } catch(e) {}
    delete app.disable_source_map_support;
  }

  delete app.script;

  const env = {};
  if (cst.PM2_PROGRAMMATIC || process.env.pm_id) {
    Common.safeExtend(env, process.env);
  } else {
    Object.assign(env, process.env);
  }

  if (app.filter_env) {
    function filterEnv(envObj) {
      if (app.filter_env === true) return {};
      if (typeof app.filter_env === 'string') {
        delete envObj[app.filter_env];
        return envObj;
      }
      const allowedKeys = Object.keys(envObj).filter(k =>
        !app.filter_env.some(pattern => k.includes(pattern))
      );
      return allowedKeys.reduce((acc, k) => { acc[k] = envObj[k]; return acc; }, {});
    }
    env = [ {}, filterEnv(env), app.env || {} ].reduce((a, b) => Object.assign(a, b), {});
  } else {
    env = [ {}, env, app.env || {} ].reduce((a, b) => Object.assign(a, b), {});
  }

  app.pm_cwd = cwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch(e) {
    return e;
  }

  Common.sink.determineExecMode(app);

  const formated_app_name = app.name.replace(/[^a-zA-Z0-9.\-]/g, '-');

  ['log', 'out', 'error', 'pid'].forEach(f => {
    const af = app[f + '_file'];
    const ext = (f === 'pid') ? 'pid' : 'log';
    const isStd = !['log', 'pid'].includes(f);

    if (af) af = resolveHome(af);

    let ps;
    if ((f === 'log' && af === true) || (f !== 'log' && !af)) {
      ps = [cst['DEFAULT_' + ext.toUpperCase() + '_PATH'], formated_app_name + (isStd ? '-' + f : '') + '.' + ext];
    } else if (af && af !== 'NULL' && af !== '/dev/null') {
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
      const key = 'pm_' + (isStd ? f.substr(0, 3) + '_' : '') + ext + '_path';
      app[key] = path.resolve(...ps);
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
 * Map file extensions to config types.
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
 * Detect if a filename is a recognized config file.
 * @param {string} filename
 * @returns {string|null} type or null
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
 * Build candidate filenames with known config extensions.
 * @param {string} name
 * @returns {string[]}
 */
Common.getConfigFileCandidates = function(name) {
  return Object.keys(Common.knonwConfigFileExtensions)
    .map(ext => name + ext);
};

/**
 * Parse config files: JS, YAML, JSON.
 * @param {string} confObj - raw file contents
 * @param {string} filename - path to config file
 * @returns {Object}
 */
Common.parseConfig = function(confObj, filename) {
  const yamljs = require('js-yaml');
  const vm     = require('vm');

  const isConfigFile = Common.isConfigFile(filename);

  if (!filename || filename === 'pipe' || filename === 'none' || isConfigFile === 'json') {
    const code = '(' + confObj + ')';
    return vm.runInThisContext(code, {}, {
      filename: path.resolve(filename),
      displayErrors: false,
      timeout: 1000
    });
  }

  if (isConfigFile === 'yaml') {
    return yamljs.load(confObj.toString());
  }

  if (isConfigFile === 'js' || isConfigFile === 'mjs') {
    const confPath = require.resolve(path.resolve(filename));
    delete require.cache[confPath];
    return require(confPath);
  }
};

/**
 * Normalize error for internal use.
 * @param {Error|string|any} e
 * @returns {Error}
 */
Common.retErr = function(e) {
  if (!e) return new Error('Unidentified error');
  if (e instanceof Error) return e;
  return new Error(e);
};

/**
 * Resolve cron restart pattern.
 * @param {Object} app
 * @returns {Error|void}
 */
Common.sink.determineCron = function(app) {
  if (app.cron_restart === 0 || app.cron_restart === '0') {
    Common.printOut(cst.PREFIX_MSG + 'disabling cron restart');
    return;
  }

  if (!app.cron_restart) return;

  const Croner = require('croner');

  try {
    Common.printOut(cst.PREFIX_MSG + 'cron restart at ' + app.cron_restart);
    Croner(app.cron_restart);
  } catch(ex) {
    return new Error(`Cron pattern error: ${ex.message}`);
  }
};

/**
 * Determine exec mode and cluster/fork defaults.
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

  app.instances ??= 1;
};

/**
 * Resolve specific Node.js version via NVM.
 * @param {Object} app
 * @returns {void|boolean}
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
    return;
  }

  const node_version  = app.exec_interpreter.split('@')[1];
  const path_to_node  = cst.IS_WINDOWS
    ? '/v' + node_version + '/node.exe'
    : semver.satisfies(node_version, '>= 0.12.0')
      ? '/versions/node/v' + node_version + '/bin/node'
      : '/v' + node_version + '/bin/node';
  const nvm_node_path  = path.join(nvm_path, path_to_node);

  try {
    fs.accessSync(nvm_node_path);
  } catch(e) {
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
}

/**
 * Resolve interpreter based on app config and extension.
 * @param {Object} app
 * @returns {Object}
 */
Common.sink.resolveInterpreter = function(app) {
  let noInterpreter = !app.exec_interpreter;
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

Common.deepCopy = Common.serialize = Common.clone = function(obj) {
  if (obj === null || obj === undefined) return {};
  return fclone(obj);
};

Common.errMod = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) return console.error(msg.message);
  console.error(`${cst.PREFIX_MSG_MOD_ERR}${msg}`);
};

Common.err = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) return console.error(`${cst.PREFIX_MSG_ERR}${msg.message}`);
  console.error(`${cst.PREFIX_MSG_ERR}${msg}`);
};

Common.printError = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) return console.error(msg.message);
  console.error.apply(console, arguments);
};

Common.log = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  console.log(`${cst.PREFIX_MSG}${msg}`);
};

Common.info = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  console.log(`${cst.PREFIX_MSG_INFO}${msg}`);
};

Common.warn = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  console.log(`${cst.PREFIX_MSG_WARNING}${msg}`);
};

Common.logMod = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  console.log(`${cst.PREFIX_MSG_MOD}${msg}`);
};

Common.printOut = function() {
  if (process.env.PM2_SILENT === 'true' || process.env.PM2_PROGRAMMATIC === 'true') return false;
  console.log.apply(console, arguments);
};

/**
 * Extend destination with source, non-deep merge.
 */
Common.extend = function(destination, source) {
  if (typeof destination !== 'object') destination = {};
  if (!source || typeof source !== 'object') return destination;

  Object.keys(source).forEach(key => {
    if (String(source[key]) !== '[object Object]') {
      destination[key] = source[key];
    }
  });
  return destination;
};

/**
 * Safely extend env-like object, respecting prohibited keys.
 */
Common.safeExtend = function(origin, add) {
  if (!add || typeof add !== 'object') return origin;

  const keysToIgnore = ['name', 'exec_mode', 'env', 'args', 'pm_cwd', 'exec_interpreter', 'pm_exec_path', 'node_args',
    'pm_out_log_path', 'pm_err_log_path', 'pm_pid_path', 'pm_id', 'status', 'pm_uptime', 'created_at', 'windowsHide',
    'username', 'merge_logs', 'kill_retry_time', 'prev_restart_delay', 'instance_var', 'unstable_restarts',
    'restart_time', 'axm_actions', 'pmx_module', 'command', 'watch', 'filter_env', 'versioning', 'vizion_runing',
    'MODULE_DEBUG', 'pmx', 'axm_options', 'created_at', 'watch', 'vizion', 'axm_dynamic', 'axm_monitor',
    'instances', 'automation', 'autostart', 'autorestart', 'stop_exit_codes', 'unstable_restart', 'treekill',
    'exit_code', 'vizion'];

  Object.keys(add).forEach(key => {
    if (keysToIgnore.indexOf(key) === -1 && String(add[key]) !== '[object Object]') {
      origin[key] = add[key];
    }
  });
  return origin;
};

/**
 * Merge environment variables from deploy config and app-specific env objects.
 * @param {Object} app_env - base environment
 * @param {string} env_name - environment name
 * @param {Object} deploy_conf - deploy configuration
 * @returns {Object}
 */
Common.mergeEnvironmentVariables = function(app_env, env_name, deploy_conf) {
  const app = fclone(app_env);
  const new_conf = { env: {} };
  Object.assign(new_conf, app);

  // Force stringifying non-primitive env values
  for (const key in app.env) {
    if (typeof app.env[key] === 'object') {
      app.env[key] = JSON.stringify(app.env[key]);
    }
  }

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

  const res = Object.assign({}, new_conf.env);
  res.current_conf = Object.assign({}, new_conf);

  if (app.exec_interpreter && app.exec_interpreter.indexOf('@') > -1) {
    resolveNodeInterpreter(app);
    res.current_conf.exec_interpreter = app.exec_interpreter;
  }

  return res;
};

/**
 * Resolve full app attributes (prepare, normalize, validate).
 * @param {Object} opts
 * @param {Object} conf
 * @returns {Object}
 */
Common.resolveAppAttributes = function(opts, conf) {
  const conf_copy = fclone(conf);
  const app = Common.prepareAppConf(opts, conf_copy);
  if (app instanceof Error) throw new Error(app.message);
  return app;
};

/**
 * Validate and normalize list of app configs.
 * @param {Array} appConfs
 * @returns {Array}
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

    // Aliases
    if (app.cmd && !app.script) {
      app.script = app.cmd;
      delete app.cmd;
    }
    if (app.command && !app.script) {
      app.script = app.command;
      delete app.command;
    }

    app.env ??= {};

    Common.renderApplicationName(app);

    if (app.execute_command === true) {
      app.exec_mode = 'fork';
      delete app.execute_command;
    }

    app.username = Common.getCurrentUsername();

    // Bash/SH for rc scripts
    if (app.script && app.script.includes(' ') && !cst.IS_WINDOWS) {
      const _script = app.script;
      if (which('bash')) {
        app.script = 'bash';
        app.args = ['-c', _script];
        app.name ??= _script;
      } else if (which('sh')) {
        app.script = 'sh';
        app.args = ['-c', _script];
        app.name ??= _script;
      } else {
        warn('bash or sh not available in $PATH, keeping script as is');
      }
    }

    if (app.time || process.env.ASZ_MODE) {
      app.log_date_format = 'YYYY-MM-DDTHH:mm:ss';
    }

    // UID/GID handling
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
      } catch(e) {
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
        } catch(e) {
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

    // PM2.io specific
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

    // Instances parsing
    if (app.instances === 'max') {
      app.instances = 0;
    }
    if (typeof app.instances === 'string') {
      app.instances = parseInt(app.instances) || 0;
    }

    if (app.exec_mode !== 'cluster_mode' &&
        app.instances === undefined &&
        app.merge_logs === undefined) {
      app.merge_logs = true;
    }

    // Cron
    if (app.cron_restart) {
      const ret = Common.sink.determineCron(app);
      if (ret instanceof Error) return ret;
    }

    // Final JSON validation
    const ret = Config.validateJSON(app);
    if (ret.errors && ret.errors.length > 0) {
      ret.errors.forEach(err => warn(err));
      return new Error(ret.errors);
    }

    verifiedConf.push(ret.config);
  }

  return verifiedConf;
};

/**
 * Safely retrieve current username.
 * @returns {string}
 */
Common.getCurrentUsername = function() {
  let current_user = '';

  if (os.userInfo) {
    try {
      current_user = os.userInfo().username;
    } catch (err) { }
  }

  if (!current_user) {
    current_user = process.env.USER || process.env.LNAME || process.env.USERNAME ||
      process.env.SUDO_USER || process.env.C9_USER || process.env.LOGNAME;
  }

  return current_user;
};

/**
 * Derive default app name from script.
 * @param {Object} conf
 */
Common.renderApplicationName = function(conf) {
  if (!conf.name && conf.script) {
    conf.name = conf.script ? path.basename(conf.script) : 'undefined';
    const lastDot = conf.name.lastIndexOf('.');
    if (lastDot > 0) {
      conf.name = conf.name.slice(0, lastDot);
    }
  }
};

/**
 * Show warning via printOut.
 * @param {string} warning
 */
function warn(warning) {
  Common.printOut(cst.PREFIX_MSG_WARNING + warning);
}