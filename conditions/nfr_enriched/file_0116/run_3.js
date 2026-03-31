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

const getPlatformHome = () => {
  const env = process.env;
  const home = env.HOME;
  const user = env.LOGNAME || env.USER || env.LNAME || env.USERNAME;

  if (process.platform === 'win32') {
    return env.USERPROFILE || env.HOMEDRIVE + env.HOMEPATH || home || null;
  }

  if (process.platform === 'darwin') {
    return home || (user ? `/Users/${user}` : null);
  }

  if (process.platform === 'linux') {
    return home || (process.getuid() === 0 ? '/root' : (user ? `/home/${user}` : null));
  }

  return home || null;
};

const resolveHome = (filepath) => {
  if (filepath[0] === '~') {
    return path.join(getPlatformHome(), filepath.slice(1));
  }
  return filepath;
};

// ============================================================================
// Console Output Management
// ============================================================================

const shouldSilence = () => process.env.PM2_SILENT === 'true' || process.env.PM2_PROGRAMMATIC === 'true';

const createLogger = (prefix) => (msg) => {
  if (shouldSilence()) return false;
  if (msg instanceof Error) {
    return console.log(`${prefix}${msg.message}`);
  }
  return console.log(`${prefix}${msg}`);
};

const createErrorLogger = (prefix) => (msg) => {
  if (shouldSilence()) return false;
  if (msg instanceof Error) {
    return console.error(`${prefix}${msg.message}`);
  }
  return console.error(`${prefix}${msg}`);
};

Common.log = createLogger(cst.PREFIX_MSG);
Common.info = createLogger(cst.PREFIX_MSG_INFO);
Common.warn = createLogger(cst.PREFIX_MSG_WARNING);
Common.logMod = createLogger(cst.PREFIX_MSG_MOD);
Common.err = createErrorLogger(cst.PREFIX_MSG_ERR);
Common.errMod = createErrorLogger(cst.PREFIX_MSG_MOD_ERR);

Common.printError = function(msg) {
  if (shouldSilence()) return false;
  if (msg instanceof Error) {
    return console.error(msg.message);
  }
  return console.error.apply(console, arguments);
};

Common.printOut = function() {
  if (shouldSilence()) return false;
  return console.log.apply(console, arguments);
};

// ============================================================================
// CLI Argument Processing
// ============================================================================

Common.determineSilentCLI = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const silentLongOpt = process.argv.indexOf('--silent');
  const silentShortOpt = process.argv.indexOf('-s');

  const isSilentFlagSet = process.env.PM2_SILENT ||
    (variadicArgsDashesPos > -1 &&
      silentLongOpt > -1 && silentLongOpt < variadicArgsDashesPos &&
      silentShortOpt > -1 && silentShortOpt < variadicArgsDashesPos) ||
    (variadicArgsDashesPos === -1 && (silentLongOpt > -1 || silentShortOpt > -1));

  if (isSilentFlagSet) {
    Object.keys(console).forEach((key) => {
      const code = key.charCodeAt(0);
      if (code >= 97 && code <= 122) {
        console[key] = () => {};
      }
    });
    process.env.PM2_DISCRETE_MODE = true;
  }
};

Common.printVersion = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const versionIndex = process.argv.indexOf('-v');

  if (versionIndex > -1 && versionIndex < variadicArgsDashesPos) {
    console.log(pkg.version);
    process.exit(0);
  }
};

// ============================================================================
// Reload Lock Management
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
  } catch (e) {
    // Lock file doesn't exist or can't be read
  }

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

Common.knownConfigFileExtensions = {
  '.json': 'json',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.config.js': 'js',
  '.config.cjs': 'js',
  '.config.mjs': 'mjs'
};

Common.isConfigFile = function(filename) {
  if (typeof filename !== 'string') return null;

  for (const extension in Common.knownConfigFileExtensions) {
    if (filename.includes(extension)) {
      return Common.knownConfigFileExtensions[extension];
    }
  }
  return null;
};

Common.getConfigFileCandidates = function(name) {
  return Object.keys(Common.knownConfigFileExtensions).map((ext) => name + ext);
};

Common.parseConfig = function(confObj, filename) {
  const yamljs = require('js-yaml');
  const vm = require('vm');
  const configType = Common.isConfigFile(filename);

  if (!filename || filename === 'pipe' || filename === 'none' || configType === 'json') {
    const code = `(${confObj})`;
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
// Environment Variable Filtering
// ============================================================================

const createEnvFilter = (filterConfig) => {
  if (filterConfig === true) {
    return {};
  }

  if (typeof filterConfig === 'string') {
    return (envObj) => {
      const filtered = { ...envObj };
      delete filtered[filterConfig];
      return filtered;
    };
  }

  return (envObj) => {
    const filtered = {};
    const allowedKeys = Object.keys(envObj).filter(
      (key) => !filterConfig.some((pattern) => key.includes(pattern))
    );
    allowedKeys.forEach((key) => {
      filtered[key] = envObj[key];
    });
    return filtered;
  };
};

// ============================================================================
// Application Configuration Preparation
// ============================================================================

Common.prepareAppConf = function(opts, app) {
  if (!app.script) {
    return new Error('No script path - aborting');
  }

  let cwd = app.cwd ? path.resolve(app.cwd) : null;
  if (cwd) {
    process.env.PWD = app.cwd;
  }

  app.node_args = app.node_args || [];

  if (app.port && app.env) {
    app.env.PORT = app.port;
  }

  cwd = cwd && cwd[0] !== '/' ? path.resolve(process.cwd(), cwd) : cwd;
  cwd = cwd || opts.cwd;

  app.pm_exec_path = path.resolve(cwd, app.script);

  if (!fs.existsSync(app.pm_exec_path)) {
    const resolvedPath = which(app.script);
    if (resolvedPath) {
      app.pm_exec_path = typeof resolvedPath === 'string' ? resolvedPath : resolvedPath.toString();
    } else {
      return new Error(`Script not found: ${app.pm_exec_path}`);
    }
  }

  // Source map support
  if (app.disable_source_map_support !== true) {
    try {
      fs.accessSync(`${app.pm_exec_path}.map`, fs.constants.R_OK);
      app.source_map_support = true;
    } catch (e) {
      // Source map not found
    }
    delete app.disable_source_map_support;
  }

  delete app.script;

  // Environment setup
  let env = {};
  if (cst.PM2_PROGRAMMATIC || process.env.pm_id) {
    Common.safeExtend(env, process.env);
  } else {
    env = process.env;
  }

  const envFilter = createEnvFilter(app.filter_env);
  const filteredEnv = app.filter_env ? envFilter(process.env) : env;

  app.env = Object.assign({}, filteredEnv, app.env || {});
  app.pm_cwd = cwd;

  // Interpreter resolution
  try {
    Common.sink.resolveInterpreter(app);
  } catch (e) {
    return e;
  }

  // Execution mode
  Common.sink.determineExecMode(app);

  // Log file paths
  const formattedAppName = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');
  setupLogPaths(app, cwd, formattedAppName);

  return app;
};

const setupLogPaths = (app, cwd, formattedAppName) => {
  const logTypes = ['log', 'out', 'error', 'pid'];

  logTypes.forEach((logType) => {
    const fileKey = `${logType}_file`;
    const isStdLog = !['log', 'pid'].includes(logType);
    const ext = logType === 'pid' ? 'pid' : 'log';
    let filePath = app[fileKey];

    if (filePath) {
      filePath = resolveHome(filePath);
    }

    let pathSegments;

    if ((logType === 'log' && typeof filePath === 'boolean' && filePath) ||
        (logType !== 'log' && !filePath)) {
      pathSegments = [
        cst[`DEFAULT_${ext.toUpperCase()}_PATH`],
        `${formattedAppName}${isStdLog ? `-${logType}` : ''}.${ext}`
      ];
    } else if ((logType !== 'log' || (logType === 'log' && filePath)) &&
               filePath !== 'NULL' && filePath !== '/dev/null') {
      pathSegments = [cwd, filePath];

      const dir = path.dirname(path.resolve(cwd, filePath));
      if (!fs.existsSync(dir)) {
        Common.printError(`${cst.PREFIX_MSG_WARNING}Folder does not exist: ${dir}`);
        Common.printOut(`${cst.PREFIX_MSG}Creating folder: ${dir}`);
        try {
          require('mkdirp').sync(dir);
        } catch (err) {
          Common.printError(`${cst.PREFIX_MSG_ERR}Could not create folder: ${path.dirname(filePath)}`);
          throw new Error('Could not create folder');
        }
      }
    }

    const pathKey = `pm_${isStdLog ? logType.substr(0, 3) + '_' : ''}${ext}_path`;

    if (filePath !== 'NULL' && filePath !== '/dev/null') {
      if (pathSegments) {
        app[pathKey] = path.resolve(...pathSegments);
      }
    } else if (path.sep === '\\') {
      app[pathKey] = '\\\\.\\NUL';
    } else {
      app[pathKey] = '/dev/null';
    }

    delete app[fileKey];
  });
};

// ============================================================================
// Execution Mode & Interpreter Resolution
// ============================================================================

Common.sink.determineExecMode = function(app) {
  if (app.exec_mode) {
    app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');
  }

  const isNodeLike = app.exec_interpreter &&
    (app.exec_interpreter.includes('node') || app.exec_interpreter.includes('bun'));
  const hasInstances = app.instances >= 1 || app.instances === 0 || app.instances === -1;

  if (!app.exec_mode && hasInstances && isNodeLike) {
    app.exec_mode = 'cluster_mode';
  } else if (!app.exec_mode) {
    app.exec_mode = 'fork_mode';
  }

  app.instances = typeof app.instances === 'undefined' ? 1 : app.instances;
};

Common.sink.determineCron = function(app) {
  if (app.cron_restart === 0 || app.cron_restart === '0') {
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

const resolveNodeInterpreter = (app) => {
  if (app.exec_mode && app.exec_mode.includes('cluster')) {
    Common.printError(`${cst.PREFIX_MSG_WARNING}${chalk.bold.yellow('Choosing the Node.js version in cluster mode is not supported')}`);
    return false;
  }

  const nvmPath = cst.IS_WINDOWS ? process.env.NVM_HOME : process.env.NVM_DIR;

  if (!nvmPath) {
    Common.printError(`${cst.PREFIX_MSG_ERR}${chalk.red('NVM is not available in PATH')}`);
    Common.printError(`${cst.PREFIX_MSG_ERR}${chalk.red('Fallback to node