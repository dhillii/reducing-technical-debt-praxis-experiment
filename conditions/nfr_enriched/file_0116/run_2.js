```javascript
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
const { execSync } = require('child_process');
const isBinary = require('./tools/isbinaryfile.js');
const cst = require('../constants.js');
const extItps = require('./API/interpreter.json');
const Config = require('./tools/Config');
const pkg = require('../package.json');
const which = require('./tools/which.js');

const Common = module.exports;

// ============================================================================
// Platform Detection & Path Resolution
// ============================================================================

const PLATFORM_HANDLERS = {
  win32: () => process.env.USERPROFILE || process.env.HOMEDRIVE + process.env.HOMEPATH || process.env.HOME || null,
  darwin: () => process.env.HOME || (process.env.USER ? '/Users/' + process.env.USER : null),
  linux: () => process.env.HOME || (process.getuid() === 0 ? '/root' : (process.env.USER ? '/home/' + process.env.USER : null))
};

function homedir() {
  const handler = PLATFORM_HANDLERS[process.platform];
  return handler ? handler() : process.env.HOME || null;
}

function resolveHome(filepath) {
  return filepath[0] === '~' ? path.join(homedir(), filepath.slice(1)) : filepath;
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function getArgPosition(arg) {
  return process.argv.indexOf(arg);
}

function isArgBeforeDashes(argPos, dashesPos) {
  return argPos > -1 && (dashesPos === -1 || argPos < dashesPos);
}

Common.determineSilentCLI = function() {
  const dashesPos = getArgPosition('--');
  const silentLongPos = getArgPosition('--silent');
  const silentShortPos = getArgPosition('-s');
  
  const isSilent = process.env.PM2_SILENT ||
    (isArgBeforeDashes(silentLongPos, dashesPos) && isArgBeforeDashes(silentShortPos, dashesPos)) ||
    (dashesPos === -1 && (silentLongPos > -1 || silentShortPos > -1));

  if (isSilent) {
    Object.keys(console).forEach(key => {
      const code = key.charCodeAt(0);
      if (code >= 97 && code <= 122) {
        console[key] = () => {};
      }
    });
    process.env.PM2_DISCRETE_MODE = true;
  }
};

Common.printVersion = function() {
  const versionPos = getArgPosition('-v');
  const dashesPos = getArgPosition('--');
  
  if (isArgBeforeDashes(versionPos, dashesPos)) {
    console.log(pkg.version);
    process.exit(0);
  }
};

// ============================================================================
// File Locking
// ============================================================================

Common.lockReload = function() {
  try {
    const timestamp = fs.readFileSync(cst.PM2_RELOAD_LOCKFILE).toString();
    if (timestamp) {
      const diff = dayjs().diff(parseInt(timestamp));
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

Common.unlockReload = function() {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, '');
  } catch (e) {
    console.error(e.message || e);
  }
};

// ============================================================================
// Configuration File Handling
// ============================================================================

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
  
  for (const extension in Common.knonwConfigFileExtensions) {
    if (filename.includes(extension)) {
      return Common.knonwConfigFileExtensions[extension];
    }
  }
  return null;
};

Common.getConfigFileCandidates = function(name) {
  return Object.keys(Common.knonwConfigFileExtensions).map(ext => name + ext);
};

Common.parseConfig = function(confObj, filename) {
  const yamljs = require('js-yaml');
  const vm = require('vm');
  const configType = Common.isConfigFile(filename);

  if (!filename || filename === 'pipe' || filename === 'none' || configType === 'json') {
    const code = '(' + confObj + ')';
    return vm.runInThisContext(code, {}, {
      filename: path.resolve(filename),
      displayErrors: false,
      timeout: 1000
    });
  }

  if (configType === 'yaml') {
    return yamljs.load(confObj.toString());
  }

  if (configType === 'js' || configType === 'mjs') {
    const confPath = require.resolve(path.resolve(filename));
    delete require.cache[confPath];
    return require(confPath);
  }
};

// ============================================================================
// Error Handling
// ============================================================================

Common.retErr = function(e) {
  if (!e) return new Error('Unidentified error');
  return e instanceof Error ? e : new Error(e);
};

// ============================================================================
// Interpreter Resolution
// ============================================================================

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
    } catch (ex) {
      return new Error(`Cron pattern error: ${ex.message}`);
    }
  }
};

Common.sink.determineExecMode = function(app) {
  if (app.exec_mode) {
    app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');
  }

  const isClusterEligible = (app.instances >= 1 || app.instances === 0 || app.instances === -1) &&
    (app.exec_interpreter.includes('node') || app.exec_interpreter.includes('bun'));

  app.exec_mode = app.exec_mode || (isClusterEligible ? 'cluster_mode' : 'fork_mode');
  app.instances = typeof app.instances === 'undefined' ? 1 : app.instances;
};

function resolveNodeInterpreter(app) {
  if (app.exec_mode && app.exec_mode.includes('cluster')) {
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

  let nvmNodePath = path.join(nvmPath, pathToNode);

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

  Common.printOut(cst.PREFIX_MSG + chalk.green.bold('Setting Node to v%s (path=%s)'), nodeVersion, nvmNodePath);
  app.exec_interpreter = nvmNodePath;
}

function resolvePythonInterpreter(app) {
  if (which('python') === null) {
    if (which('python3') === null) {
      Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('python and python3 binaries not available in PATH'));
    } else {
      app.exec_interpreter = 'python3';
    }
  }
}

function resolveInterpreterPath(app) {
  const interpreterMap = {
    'lsc': path.resolve(__dirname, '../node_modules/.bin/lsc'),
    'coffee': path.resolve(__dirname, '../node_modules/.bin/coffee')
  };

  if (interpreterMap[app.exec_interpreter]) {
    app.exec_interpreter = interpreterMap[app.exec_interpreter];
  }
}

Common.sink.resolveInterpreter = function(app) {
  const noInterpreter = !app.exec_interpreter;
  const extName = path.extname(app.pm_exec_path);
  const betterInterpreter = extItps[extName];

  // Bun support
  if (noInterpreter && (extName === '.js' || extName === '.ts') && cst.IS_BUN === true) {
    app.exec_interpreter = process.execPath;
  }
  // No interpreter defined and correspondence in schema hashmap
  else if (noInterpreter && betterInterpreter) {
    app.exec_interpreter = betterInterpreter;
    if (betterInterpreter === 'python') {
      resolvePythonInterpreter(app);
    }
  }
  // No interpreter detected, check if binary
  else if (noInterpreter) {
    app.exec_interpreter = isBinary(app.pm_exec_path) ? 'none' : process.execPath;
  }
  // Node version specified
  else if (app.exec_interpreter.includes('node@')) {
    resolveNodeInterpreter(app);
  }

  if (app.exec_interpreter.includes('python')) {
    app.env.PYTHONUNBUFFERED = '1';
  }

  resolveInterpreterPath(app);

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

// ============================================================================
// Object Utilities
// ============================================================================

Common.deepCopy = Common.serialize = Common.clone = function(obj) {
  return obj === null || obj === undefined ? {} : fclone(obj);
};

Common.extend = function(destination, source) {
  if (typeof destination !== 'object') {
    destination = {};
  }
  if (!source || typeof source !== 'object') {
    return destination;
  }

  Object.keys(source).forEach(key => {
    if (source[key] !== '[object Object]') {
      destination[key] = source[key];
    }
  });

  return destination;
};

const IGNORED_ENV_KEYS = [
  'name', 'exec_mode', 'env', 'args', 'pm_cwd', 'exec_interpreter', 'pm_exec_path',
  'node_args', 'pm_out_log_path', 'pm_err_log_path', 'pm_pid_path', 'pm_id', 'status',
  'pm_uptime', 'created_at', 'windowsHide', 'username', 'merge_logs', 'kill_retry_time',
  'prev_restart_delay', 'instance_var', 'unstable_restarts', 'restart_time', 'axm_actions',
  'pmx_module', 'command', 'watch', 'filter_env', 'versioning', 'vizion_runing',
  'MODULE_DEBUG', 'pmx', 'axm_options', 'vizion', 'axm_dynamic', 'axm_monitor',
  'instances', 'automation', 'autostart', 'autorestart', 'stop_exit_codes',
  'unstable_restart', 'treekill', 'exit_code'
];

Common.safeExtend = function(origin, add) {
  if (!add || typeof add !== 'object') return origin;

  Object.keys(add).forEach(key => {
    if (!IGNORED_ENV_KEYS.includes(key) && add[key] !== '[object Object]') {
      origin[key] = add[key];
    }
  });

  return origin;
};

// ============================================================================
// Logging Utilities
// ============================================================================

function shouldSilence() {
  return process.env.PM2_SILENT === 'true' || process.env.PM2_PROGRAMMATIC === 'true';
}

function formatMessage(prefix, msg) {
  return msg instanceof Error ? msg.message : `${prefix}${msg}`;
}

Common.errMod = function(msg) {
  if (shouldSilence()) return false;
  return console.error(formatMessage(cst.PREFIX_MSG_MOD_ERR, msg));
};

Common.err = function(msg) {