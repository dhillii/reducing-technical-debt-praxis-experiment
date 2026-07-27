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

function isSilentModeEnabled() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const s1opt = process.argv.indexOf('--silent');
  const s2opt = process.argv.indexOf('-s');

  return process.env.PM2_SILENT || 
    (variadicArgsDashesPos > -1 &&
     (s1opt !== -1 && s1opt < variadicArgsDashesPos) &&
     (s2opt !== -1 && s2opt < variadicArgsDashesPos)) ||
    (variadicArgsDashesPos === -1 && (s1opt > -1 || s2opt > -1));
}

function disableConsoleOutput() {
  for (const key in console) {
    const code = key.charCodeAt(0);
    if (code >= 97 && code <= 122) {
      console[key] = function(){};
    }
  }
  process.env.PM2_DISCRETE_MODE = true;
}

Common.determineSilentCLI = function() {
  if (isSilentModeEnabled()) {
    disableConsoleOutput();
  }
};

Common.printVersion = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');

  if (process.argv.indexOf('-v') > -1 && process.argv.indexOf('-v') < variadicArgsDashesPos) {
    console.log(pkg.version);
    process.exit(0);
  }
};

function readReloadLockFile() {
  try {
    const content = fs.readFileSync(cst.PM2_RELOAD_LOCKFILE).toString();
    if (content && content !== '') {
      const diff = dayjs().diff(parseInt(content));
      if (diff < cst.RELOAD_LOCK_TIMEOUT) {
        return diff;
      }
    }
  } catch(e) {}
  return null;
}

function writeReloadLockFile() {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, dayjs().valueOf().toString());
    return 0;
  } catch(e) {
    console.error(e.message || e);
  }
}

Common.lockReload = function() {
  const lockDiff = readReloadLockFile();
  if (lockDiff !== null) {
    return lockDiff;
  }
  return writeReloadLockFile();
};

Common.unlockReload = function() {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, '');
  } catch(e) {
    console.error(e.message || e);
  }
};

function validateAppScript(app) {
  if (!app.script) {
    return new Error('No script path - aborting');
  }
  return null;
}

function resolveCwd(app, opts) {
  let cwd = null;

  if (app.cwd) {
    cwd = path.resolve(app.cwd);
    process.env.PWD = app.cwd;
  }

  cwd && (cwd[0] !== '/') && (cwd = path.resolve(process.cwd(), cwd));
  cwd = cwd || opts.cwd;

  return cwd;
}

function resolveScriptPath(app, cwd) {
  app.pm_exec_path = path.resolve(cwd, app.script);

  if (!fs.existsSync(app.pm_exec_path)) {
    let ckd = which(app.script);
    if (ckd) {
      if (typeof(ckd) !== 'string') {
        ckd = ckd.toString();
      }
      app.pm_exec_path = ckd;
    } else {
      return new Error(`Script not found: ${app.pm_exec_path}`);
    }
  }
  return null;
}

function enableSourceMapSupport(app) {
  if (app.disable_source_map_support !== true) {
    try {
      fs.accessSync(app.pm_exec_path + '.map', fs.constants.R_OK);
      app.source_map_support = true;
    } catch(e) {}
    delete app.disable_source_map_support;
  }
}

function filterEnvironmentVariables(app, envObj) {
  if (app.filter_env === true) {
    return {};
  }

  if (typeof app.filter_env === 'string') {
    delete envObj[app.filter_env];
    return envObj;
  }

  const newEnv = {};
  const allowedKeys = app.filter_env.reduce((acc, current) =>
    acc.filter(item => !item.includes(current)), Object.keys(envObj));
  allowedKeys.forEach(key => newEnv[key] = envObj[key]);
  return newEnv;
}

function buildAppEnvironment(app, opts) {
  let env = {};

  if (cst.PM2_PROGRAMMATIC || process.env.pm_id) {
    Common.safeExtend(env, process.env);
  } else {
    env = process.env;
  }

  const filteredEnv = (app.filter_env && app.filter_env.length > 0) 
    ? filterEnvironmentVariables(app, process.env) 
    : env;

  app.env = [
    {}, filteredEnv, app.env || {}
  ].reduce(function(e1, e2) {
    return Object.assign(e1, e2);
  });
}

function resolveLogPaths(app, cwd, formattedAppName) {
  const logFileTypes = ['log', 'out', 'error', 'pid'];

  logFileTypes.forEach(function(f) {
    const af = app[f + '_file'];
    const ext = (f === 'pid' ? 'pid' : 'log');
    const isStd = !~['log', 'pid'].indexOf(f);
    let resolvedFile = af ? resolveHome(af) : null;

    let ps;
    if ((f === 'log' && typeof resolvedFile === 'boolean' && resolvedFile) || 
        (f !== 'log' && !resolvedFile)) {
      ps = [cst['DEFAULT_' + ext.toUpperCase() + '_PATH'], 
            formattedAppName + (isStd ? '-' + f : '') + '.' + ext];
    } else if ((f !== 'log' || (f === 'log' && resolvedFile)) && 
               resolvedFile !== 'NULL' && resolvedFile !== '/dev/null') {
      ps = [cwd, resolvedFile];

      const dir = path.dirname(path.resolve(cwd, resolvedFile));
      if (!fs.existsSync(dir)) {
        Common.printError(cst.PREFIX_MSG_WARNING + 'Folder does not exist: ' + dir);
        Common.printOut(cst.PREFIX_MSG + 'Creating folder: ' + dir);
        try {
          require('mkdirp').sync(dir);
        } catch (err) {
          Common.printError(cst.PREFIX_MSG_ERR + 'Could not create folder: ' + path.dirname(resolvedFile));
          throw new Error('Could not create folder');
        }
      }
    }

    if (resolvedFile !== 'NULL' && resolvedFile !== '/dev/null') {
      ps && (app['pm_' + (isStd ? f.substr(0, 3) + '_' : '') + ext + '_path'] = 
             path.resolve.apply(null, ps));
    } else if (path.sep === '\\') {
      app['pm_' + (isStd ? f.substr(0, 3) + '_' : '') + ext + '_path'] = '\\\\.\\NUL';
    } else {
      app['pm_' + (isStd ? f.substr(0, 3) + '_' : '') + ext + '_path'] = '/dev/null';
    }
    delete app[f + '_file'];
  });
}

Common.prepareAppConf = function(opts, app) {
  const validationError = validateAppScript(app);
  if (validationError) {
    return validationError;
  }

  if (!app.node_args) {
    app.node_args = [];
  }

  if (app.port && app.env) {
    app.env.PORT = app.port;
  }

  const cwd = resolveCwd(app, opts);
  const scriptError = resolveScriptPath(app, cwd);
  if (scriptError) {
    return scriptError;
  }

  enableSourceMapSupport(app);
  delete app.script;

  buildAppEnvironment(app, opts);
  app.pm_cwd = cwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch(e) {
    return e;
  }

  Common.sink.determineExecMode(app);

  const formattedAppName = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');
  resolveLogPaths(app, cwd, formattedAppName);

  return app;
};

Common.knonwConfigFileExtensions = {
  '.json': 'json',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.config.js': 'js',
  '.config.cjs': 'js',
  '.config.mjs': 'mjs'
};

Common.isConfigFile = function (filename) {
  if (typeof (filename) !== 'string') {
    return null;
  }

  for (const extension in Common.knonwConfigFileExtensions) {
    if (filename.indexOf(extension) !== -1) {
      return Common.knonwConfigFileExtensions[extension];
    }
  }

  return null;
};

Common.getConfigFileCandidates = function (name) {
  return Object.keys(Common.knonwConfigFileExtensions).map((extension) => name + extension);
};

Common.parseConfig = function(confObj, filename) {
  const yamljs = require('js-yaml');
  const vm     = require('vm');

  const isConfigFile = Common.isConfigFile(filename);

  if (!filename ||
      filename === 'pipe' ||
      filename === 'none' ||
      isConfigFile === 'json') {
    const code = '(' + confObj + ')';
    const sandbox = {};

    return vm.runInThisContext(code, sandbox, {
      filename: path.resolve(filename),
      displayErrors: false,
      timeout: 1000
    });
  }
  else if (isConfigFile === 'yaml') {
    return yamljs.load(confObj.toString());
  }
  else if (isConfigFile === 'js' || isConfigFile === 'mjs') {
    const confPath = require.resolve(path.resolve(filename));
    delete require.cache[confPath];
    return require(confPath);
  }
};

Common.retErr = function(e) {
  if (!e) {
    return new Error('Unidentified error');
  }
  if (e instanceof Error) {
    return e;
  }
  return new Error(e);
};

Common.sink = {};

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
    } catch(ex) {
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
      (app.exec_interpreter.includes('node') === true || app.exec_interpreter.includes('bun') === true)) {
    app.exec_mode = 'cluster_mode';
  } else if (!app.exec_mode) {
    app.exec_mode = 'fork_mode';
  }
  if (typeof app.instances === 'undefined') {
    app.instances = 1;
  }
};

function getNodeVersionFromInterpreter(app) {
  return app.exec_interpreter.split('@')[1];
}

function getNodePathForVersion(nodeVersion) {
  const isWindows = cst.IS_WINDOWS;
  if (isWindows) {
    return '/v' + nodeVersion + '/node.exe';
  }
  return semver.satisfies(nodeVersion, '>= 0.12.0')
    ? '/versions/node/v' + nodeVersion + '/bin/node'
    : '/v' + nodeVersion + '/bin/node';
}

function getNvmBinPath() {
  const nvmPath = cst.IS_WINDOWS ? process.env.NVM_HOME : process.env.NVM_DIR;
  return path.join(nvmPath, 'nvm.' + (cst.IS_WINDOWS ? 'exe' : 'sh'));
}

function buildNvmInstallCommand(nvmBin, nodeVersion) {
  if (cst.IS_WINDOWS) {
    return nvmBin + ' install ' + nodeVersion;
  }
  return '. ' + nvmBin + ' ; nvm install ' + nodeVersion;
}

function installNodeVersion(nvmPath, nodeVersion) {
  const nvmBin = getNvmBinPath();
  const nvmCmd = buildNvmInstallCommand(nvmBin, nodeVersion);

  Common.printOut(cst.PREFIX_MSG + 'Executing: %s', nvmCmd);

  execSync(nvmCmd, {
    cwd: path.resolve(process.cwd()),
    env: process.env,
    maxBuffer: 20 * 1024 * 1024
  });
}

function adjustNodePathForWindows(nvmNodePath) {
  if (cst.IS_WINDOWS) {
    return nvmNodePath.replace(/node/, 'node' + process.arch.slice(1));
  }
  return nvmNodePath;
}

const resolveNodeInterpreter = function(app) {
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

  const nodeVersion = getNodeVersionFromInterpreter(app);
  const pathToNode = getNodePathForVersion(nodeVersion);
  let nvmNodePath = path.join(nvmPath, pathToNode);

  try {
    fs.accessSync(nvmNodePath);
  } catch(e) {
    Common.printOut(cst.PREFIX_MSG + 'Installing Node v%s', nodeVersion);
    installNodeVersion(nvmPath, nodeVersion);
    nvmNodePath = adjustNodePathForWindows(nvmNodePath);
  }

  Common.printOut(cst.PREFIX_MSG + chalk.green.bold('Setting Node to v%s (path=%s)'),
                  nodeVersion,
                  nvmNodePath);

  app.exec_interpreter = nvmNodePath;
};

function resolvePythonInterpreter(app) {
  if (which('python') === null) {
    if (which('python3') === null) {
      Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('python and python3 binaries not available in PATH'));
    } else {
      app.exec_interpreter = 'python3';
    }
  }
}

function resolveInterpreterFromExtension(app, extName, betterInterpreter) {
  if (!betterInterpreter) {
    app.exec_interpreter = isBinary(app.pm_exec_path) ? 'none' : process.execPath;
    return;
  }

  app.exec_interpreter = betterInterpreter;

  if (betterInterpreter === "python") {
    resolvePythonInterpreter(app);
  }
}

function validateInterpreterAvailability(app) {
  if (app.exec_interpreter === 'none' || which(app.exec_interpreter) !== null) {
    return;
  }

  if (app.exec_interpreter === 'node') {
    Common.warn(`Using builtin node.js version on version ${process.version}`);
    app.exec_interpreter = cst.BUILTIN_NODE_PATH;
  } else {
    throw new Error(`Interpreter ${app.exec_interpreter} is NOT AVAILABLE in PATH. (type 'which ${app.exec_interpreter}' to double check.)`);
  }
}

function resolveSpecialInterpreters(app) {
  if (app.exec_interpreter === 'lsc') {
    app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/lsc');
  }

  if (app.exec_interpreter === 'coffee') {
    app.exec_interpreter = path.resolve(__dirname, '../node_modules/.bin/coffee');
  }
}

Common.sink.resolveInterpreter = function(app) {
  const noInterpreter = !app.exec_interpreter;
  const extName = path.extname(app.pm_exec_path);
  const betterInterpreter = extItps[extName];

  // Bun support
  if (noInterpreter && (extName === '.js' || extName === '.ts') && cst.IS_BUN === true) {
    app.exec_interpreter = process.execPath;
  } else if (noInterpreter && betterInterpreter) {
    resolveInterpreterFromExtension(app, extName, betterInterpreter);
  } else if (noInterpreter) {
    app.exec_interpreter = isBinary(app.pm_exec_path) ? 'none' : process.execPath;
  } else if (app.exec_interpreter.indexOf('node@') > -1) {
    resolveNodeInterpreter(app);
  }

  if (app.exec_interpreter.indexOf('python') > -1) {
    app.env.PYTHONUNBUFFERED = '1';
  }

  resolveSpecialInterpreters(app);
  validateInterpreterAvailability(app);

  return app;
};

Common.deepCopy = Common.serialize = Common.clone = function(obj) {
  if (obj === null || obj === undefined) return {};
  return fclone(obj);
};

Common.errMod = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) {
    return console.error(msg.message);
  }
  return console.error(`${cst.PREFIX_MSG_MOD_ERR}${msg}`);
};

Common.err = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) {
    return console.error(`${cst.PREFIX_MSG_ERR}${msg.message}`);
  }
  return console.error(`${cst.PREFIX_MSG_ERR}${msg}`);
};

Common.printError = function(msg) {
  if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true') return false;
  if (msg instanceof Error) {
    return console.error(msg.message);
  }
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

Common.extend = function(destination, source) {
  if (typeof destination !== 'object') {
    destination = {};
  }
  if (!source || typeof source !== 'object') {
    return destination;
  }

  Object.keys(source).forEach(function(newKey) {
    if (source[newKey] !== '[object Object]') {
      destination[newKey] = source[newKey];
    }
  });

  return destination;
};

Common.safeExtend = function(origin, add) {
  if (!add || typeof add !== 'object') return origin;

  const keysToIgnore = ['name', 'exec_mode', 'env', 'args', 'pm_cwd', 'exec_interpreter', 'pm_exec_path', 'node_args', 'pm_out_log_path', 'pm_err_log_path', 'pm_pid_path', 'pm_id', 'status', 'pm_uptime', 'created_at', 'windowsHide', 'username', 'merge_logs', 'kill_retry_time', 'prev_restart_delay', 'instance_var', 'unstable_restarts', 'restart_time', 'axm_actions', 'pmx_module', 'command', 'watch', 'filter_env', 'versioning', 'vizion_runing', 'MODULE_DEBUG', 'pmx', 'axm_options', 'created_at', 'watch', 'vizion', 'axm_dynamic', 'axm_monitor', 'instances', 'automation', 'autostart', 'autorestart', 'stop_exit_codes', 'unstable_restart', 'treekill', 'exit_code', 'vizion'];

  const keys = Object.keys(add);
  let i = keys.length;
  while (i--) {
    if(keysToIgnore.indexOf(keys[i]) === -1 && add[keys[i]] !== '[object Object]') {
      origin[keys[i]] = add[keys[i]];
    }
  }
  return origin;
};

function mergeDeployEnvironment(newConf, app, envName, deployConf) {
  if (deployConf && deployConf[envName] && deployConf[envName]['env']) {
    Object.assign(newConf.env, deployConf[envName]['env']);
  }

  Object.assign(newConf.env, app.env);

  if ('env_' + envName in app) {
    Object.assign(newConf.env, app['env_' + envName]);
  } else {
    Common.printOut(cst.PREFIX_MSG_WARNING + chalk.bold('Environment [%s] is not defined in process file'), envName);
  }
}

function stringifyObjectEnvValues(app) {
  for (const key in app.env) {
    if (typeof app.env[key] === 'object') {
      app.env[key] = JSON.stringify(app.env[key]);
    }
  }
}

Common.mergeEnvironmentVariables = function(appEnv, envName, deployConf) {
  const app = fclone(appEnv);

  const newConf = {
    env: {}
  };

  stringifyObjectEnvValues(app);
  Object.assign(newConf, app);

  if (envName) {
    mergeDeployEnvironment(newConf, app, envName, deployConf);
  }

  delete newConf.exec_mode;

  const res = {
    current_conf: {}
  };

  Object.assign(res, newConf.env);
  Object.assign(res.current_conf, newConf);

  // #2541 force resolution of node interpreter
  if (app.exec_interpreter &&
      app.exec_interpreter.indexOf('@') > -1) {
    resolveNodeInterpreter(app);
    res.current_conf.exec_interpreter = app.exec_interpreter;
  }

  return res;
};

Common.resolveAppAttributes = function(opts, conf) {
  const confCopy = fclone(conf);

  const app = Common.prepareAppConf(opts, confCopy);
  if (app instanceof Error) {
    throw new Error(app.message);
  }
  return app;
};

function handleScriptWithSpaces(app) {
  if (!app.script || app.script.indexOf(' ') === -1 || cst.IS_WINDOWS === true) {
    return;
  }

  const scriptContent = app.script;

  if (which('bash')) {
    app.script = 'bash';
    app.args = ['-c', scriptContent];
    if (!app.name) {
      app.name = scriptContent;
    }
  } else if (which('sh')) {
    app.script = 'sh';
    app.args = ['-c', scriptContent];
    if (!app.name) {
      app.name = scriptContent;
    }
  } else {
    warn('bash or sh not available in $PATH, keeping script as is');
  }
}

function handleExecuteCommand(app) {
  if (app.execute_command === true) {
    app.exec_mode = 'fork';
    delete app.execute_command;
  }
}

function normalizeScriptAlias(app) {
  if (app.cmd && !app.script) {
    app.script = app.cmd;
    delete app.cmd;
  }
  if (app.command && !app.script) {
    app.script = app.command;
    delete app.command;
  }
}

function handleLogDateFormat(app) {
  if (app.time || process.env.ASZ_MODE) {
    app.log_date_format = 'YYYY-MM-DDTHH:mm:ss';
  }
}

function resolveUserInfo(app, users) {
  const userInfo = users[app.uid || app.user];
  if (!userInfo) {
    Common.printError(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
    return new Error(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
  }

  app.env.HOME = userInfo.homedir;
  app.uid = parseInt(userInfo.userId);
  return null;
}

function resolveGroupInfo(app, groups) {
  if (!app.gid) {
    return null;
  }

  const groupInfo = groups[app.gid];
  if (!groupInfo) {
    Common.printError(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
    return new Error(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
  }

  app.gid = parseInt(groupInfo.id);
  return null;
}

function handleUidGidResolution(app, users) {
  const userError = resolveUserInfo(app, users);
  if (userError) {
    return userError;
  }

  if (app.gid) {
    const passwd = require('./tools/passwd.js');
    let groups;
    try {
      groups = passwd.getGroups();
    } catch(e) {
      Common.printError(e);
      return new Error(e);
    }

    const groupError = resolveGroupInfo(app, groups);
    if (groupError) {
      return groupError;
    }
  } else {
    app.gid = parseInt(users[app.uid || app.user].groupId);
  }

  return null;
}

function validateAndResolveUidGid(app) {
  if (!app.uid && !app.gid && !app.user) {
    return null;
  }

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

  return handleUidGidResolution(app, users);
}

function handleInstancesParam(app) {
  if (app.instances === 'max') {
    app.instances = 0;
  }

  if (typeof(app.instances) === 'string') {
    app.instances = parseInt(app.instances) || 0;
  }

  if (app.exec_mode !== 'cluster_mode' &&
      !app.instances &&
      typeof(app.merge_logs) === 'undefined') {
    app.merge_logs = true;
  }
}

function validateAppConfiguration(app) {
  const ret = Config.validateJSON(app);
  if (ret.errors && ret.errors.length > 0) {
    ret.errors.forEach(function(err) { warn(err); });
    return new Error(ret.errors);
  }
  return ret.config;
}

function processAppConfiguration(app) {
  normalizeScriptAlias(app);

  if (!app.env) {
    app.env = {};
  }

  Common.renderApplicationName(app);
  handleExecuteCommand(app);
  app.username = Common.getCurrentUsername();
  handleScriptWithSpaces(app);
  handleLogDateFormat(app);

  const uidGidError = validateAndResolveUidGid(app);
  if (uidGidError) {
    return uidGidError;
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

  handleInstancesParam(app);

  if (app.cron_restart) {
    const cronError = Common.sink.determineCron(app);
    if (cronError instanceof Error) {
      return cronError;
    }
  }

  return validateAppConfiguration(app);
}

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

    const result = processAppConfiguration(app);
    if (result instanceof Error) {
      return result;
    }

    verifiedConf.push(result);
  }

  return verifiedConf;
};

Common.getCurrentUsername = function() {
  let currentUser = '';

  if (os.userInfo) {
    try {
      currentUser = os.userInfo().username;
    } catch (err) {
      // For the case of unhandled error for uv_os_get_passwd
      // https://github.com/Unitech/pm2/issues/3184
    }
  }

  if(currentUser === '') {
    currentUser = process.env.USER || process.env.LNAME || process.env.USERNAME || process.env.SUDO_USER || process.env.C9_USER || process.env.LOGNAME;
  }

  return currentUser;
};

Common.renderApplicationName = function(conf) {
  if (!conf.name && conf.script) {
    conf.name = conf.script !== undefined ? path.basename(conf.script) : 'undefined';
    const lastDot = conf.name.lastIndexOf('.');
    if (lastDot > 0) {
      conf.name = conf.name.slice(0, lastDot);
    }
  }
};

function warn(warning) {
  Common.printOut(cst.PREFIX_MSG_WARNING + warning);
}