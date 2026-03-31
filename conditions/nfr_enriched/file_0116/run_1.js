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

const getPlatformHomeDir = () => {
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

const homedir = getPlatformHomeDir;

const resolveHome = (filepath) => {
  if (filepath[0] === '~') {
    return path.join(homedir(), filepath.slice(1));
  }
  return filepath;
};

// ============================================================================
// Console Output Management
// ============================================================================

const shouldSilence = () => process.env.PM2_SILENT === 'true' || process.env.PM2_PROGRAMMATIC === 'true';

const createLogFunction = (prefix) => (msg) => {
  if (shouldSilence()) return false;
  if (msg instanceof Error) {
    return console.log(`${prefix}${msg.message}`);
  }
  return console.log(`${prefix}${msg}`);
};

const createErrorFunction = (prefix) => (msg) => {
  if (shouldSilence()) return false;
  if (msg instanceof Error) {
    return console.error(`${prefix}${msg.message}`);
  }
  return console.error(`${prefix}${msg}`);
};

Common.printError = (msg) => {
  if (shouldSilence()) return false;
  if (msg instanceof Error) return console.error(msg.message);
  return console.error.apply(console, arguments);
};

Common.printOut = function() {
  if (shouldSilence()) return false;
  return console.log.apply(console, arguments);
};

Common.err = createErrorFunction(cst.PREFIX_MSG_ERR);
Common.errMod = createErrorFunction(cst.PREFIX_MSG_MOD_ERR);
Common.log = createLogFunction(cst.PREFIX_MSG);
Common.logMod = createLogFunction(cst.PREFIX_MSG_MOD);
Common.info = createLogFunction(cst.PREFIX_MSG_INFO);
Common.warn = createLogFunction(cst.PREFIX_MSG_WARNING);

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

const readReloadLock = () => {
  try {
    return fs.readFileSync(cst.PM2_RELOAD_LOCKFILE).toString();
  } catch (e) {
    return null;
  }
};

const writeReloadLock = (content) => {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, content);
    return true;
  } catch (e) {
    Common.printError(e.message || e);
    return false;
  }
};

Common.lockReload = function() {
  const lockContent = readReloadLock();

  if (lockContent) {
    const diff = dayjs().diff(parseInt(lockContent));
    if (diff < cst.RELOAD_LOCK_TIMEOUT) {
      return diff;
    }
  }

  writeReloadLock(dayjs().valueOf().toString());
  return 0;
};

Common.unlockReload = function() {
  writeReloadLock('');
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
// Interpreter Resolution
// ============================================================================

const resolvePythonInterpreter = () => {
  if (which('python') !== null) return 'python';
  if (which('python3') !== null) return 'python3';
  Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('python and python3 binaries not available in PATH'));
  return null;
};

const resolveNodeInterpreter = (app) => {
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
    Common.printOut(cst.PREFIX_MSG_ERR + chalk.bold(`Install NVM:\n${msg}`));
    return;
  }

  const nodeVersion = app.exec_interpreter.split('@')[1];
  const pathToNode = cst.IS_WINDOWS
    ? `/v${nodeVersion}/node.exe`
    : semver.satisfies(nodeVersion, '>= 0.12.0')
      ? `/versions/node/v${nodeVersion}/bin/node`
      : `/v${nodeVersion}/bin/node`;

  let nvmNodePath = path.join(nvmPath, pathToNode);

  try {
    fs.accessSync(nvmNodePath);
  } catch (e) {
    Common.printOut(cst.PREFIX_MSG + 'Installing Node v%s', nodeVersion);
    const nvmBin = path.join(nvmPath, `nvm.${cst.IS_WINDOWS ? 'exe' : 'sh'}`);
    const nvmCmd = cst.IS_WINDOWS
      ? `${nvmBin} install ${nodeVersion}`
      : `. ${nvmBin} ; nvm install ${nodeVersion}`;

    Common.printOut(cst.PREFIX_MSG + 'Executing: %s', nvmCmd);

    execSync(nvmCmd, {
      cwd: path.resolve(process.cwd()),
      env: process.env,
      maxBuffer: 20 * 1024 * 1024
    });

    if (cst.IS_WINDOWS) {
      nvmNodePath = nvmNodePath.replace(/node/, `node${process.arch.slice(1)}`);
    }
  }

  Common.printOut(cst.PREFIX_MSG + chalk.green.bold('Setting Node to v%s (path=%s)'), nodeVersion, nvmNodePath);
  app.exec_interpreter = nvmNodePath;
};

Common.sink = {};

Common.sink.resolveInterpreter = function(app) {
  const noInterpreter = !app.exec_interpreter;
  const extName = path.extname(app.pm_exec_path);
  const betterInterpreter = extItps[extName];

  // Bun support
  if (noInterpreter && (extName === '.js' || extName === '.ts') && cst.IS_BUN === true) {
    app.exec_interpreter = process.execPath;
    return app;
  }

  // No interpreter defined and correspondence in schema hashmap
  if (noInterpreter && betterInterpreter) {
    app.exec_interpreter = betterInterpreter;

    if (betterInterpreter === 'python') {
      const pythonInterpreter = resolvePythonInterpreter();
      if (pythonInterpreter) {
        app.exec_interpreter = pythonInterpreter;
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

  const interpreterAliases = {
    'lsc': path.resolve(__dirname, '../node_modules/.bin/lsc'),
    'coffee': path.resolve(__dirname, '../node_modules/.bin/coffee')
  };

  if (interpreterAliases[app.exec_interpreter]) {
    app.exec_interpreter = interpreterAliases[app.exec_interpreter];
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

Common.sink.determineExecMode = function(app) {
  if (app.exec_mode) {
    app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');
  }

  const hasInstances = app.instances >= 1 || app.instances === 0 || app.instances === -1;
  const isNodeOrBun = app.exec_interpreter.includes('node') || app.exec_interpreter.includes('bun');

  if (!app.exec_mode && hasInstances && isNodeOrBun) {
    app.exec_mode = 'cluster_mode';
  } else if (!app.exec_mode) {
    app.exec_mode = 'fork_mode';
  }

  if (typeof app.instances === 'undefined') {
    app.instances = 1;
  }
};

Common.sink.determineCron = function(app) {
  if (app.cron_restart === 0 || app.cron_restart === '0') {
    Common.printOut(cst.PREFIX_MSG + 'disabling cron restart');
    return;
  }

  if (app.cron_restart) {
    const Croner = require('croner');

    try {
      Common.printOut(cst.PREFIX_MSG + `cron restart at ${app.cron_restart}`);
      Croner(app.cron_restart);
    } catch (ex) {
      return new Error(`Cron pattern error: ${ex.message}`);
    }
  }
};

// ============================================================================
// App Configuration Preparation
// ============================================================================

const filterEnvironment = (app, envObj) => {
  if (app.filter_env === true) return {};

  if (typeof app.filter_env === 'string') {
    const filtered = { ...envObj };
    delete filtered[app.filter_env];
    return filtered;
  }

  const newEnv = {};
  const allowedKeys = Object.keys(envObj).filter(
    (key) => !app.filter_env.some((filter) => key.includes(filter))
  );
  allowedKeys.forEach((key) => {
    newEnv[key] = envObj[key];
  });
  return newEnv;
};

const resolveAppPaths = (app, cwd) => {
  app.pm_exec_path = path.resolve(cwd, app.script);

  if (!fs.existsSync(app.pm_exec_path)) {
    const cmdPath = which(app.script);
    if (cmdPath) {
      app.pm_exec_path = typeof cmdPath === 'string' ? cmdPath : cmd