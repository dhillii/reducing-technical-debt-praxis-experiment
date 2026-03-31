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
// UTILITY FUNCTIONS
// ============================================================================

function getHomedir() {
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
}

function resolveHome(filepath) {
  if (filepath[0] === '~') {
    return path.join(getHomedir(), filepath.slice(1));
  }
  return filepath;
}

function isSilentMode() {
  return process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === 'true';
}

function shouldSilenceConsole() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const s1opt = process.argv.indexOf('--silent');
  const s2opt = process.argv.indexOf('-s');

  const isSilentFlagBefore = (opt) => opt > -1 && (variadicArgsDashesPos === -1 || opt < variadicArgsDashesPos);

  return process.env.PM2_SILENT || (isSilentFlagBefore(s1opt) || isSilentFlagBefore(s2opt));
}

function silenceConsole() {
  for (const key in console) {
    const code = key.charCodeAt(0);
    if (code >= 97 && code <= 122) {
      console[key] = () => {};
    }
  }
  process.env.PM2_DISCRETE_MODE = true;
}

// ============================================================================
// LOGGING FUNCTIONS
// ============================================================================

const createLogger = (prefix) => (msg) => {
  if (isSilentMode()) return false;
  if (msg instanceof Error) {
    return console.error(prefix ? `${prefix}${msg.message}` : msg.message);
  }
  return console.log(prefix ? `${prefix}${msg}` : msg);
};

const createErrorLogger = (prefix) => (msg) => {
  if (isSilentMode()) return false;
  if (msg instanceof Error) {
    return console.error(prefix ? `${prefix}${msg.message}` : msg.message);
  }
  return console.error(prefix ? `${prefix}${msg}` : msg);
};

Common.log = createLogger(cst.PREFIX_MSG);
Common.info = createLogger(cst.PREFIX_MSG_INFO);
Common.warn = createLogger(cst.PREFIX_MSG_WARNING);
Common.logMod = createLogger(cst.PREFIX_MSG_MOD);
Common.err = createErrorLogger(cst.PREFIX_MSG_ERR);
Common.errMod = createErrorLogger(cst.PREFIX_MSG_MOD_ERR);
Common.printError = createErrorLogger('');

Common.printOut = function() {
  if (process.env.PM2_SILENT === 'true' || process.env.PM2_PROGRAMMATIC === 'true') return false;
  return console.log.apply(console, arguments);
};

// ============================================================================
// CLI INITIALIZATION
// ============================================================================

Common.determineSilentCLI = function() {
  if (shouldSilenceConsole()) {
    silenceConsole();
  }
};

Common.printVersion = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const vIndex = process.argv.indexOf('-v');

  if (vIndex > -1 && (variadicArgsDashesPos === -1 || vIndex < variadicArgsDashesPos)) {
    console.log(pkg.version);
    process.exit(0);
  }
};

// ============================================================================
// RELOAD LOCK MANAGEMENT
// ============================================================================

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

Common.unlockReload = function() {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, '');
  } catch (e) {
    console.error(e.message || e);
  }
};

// ============================================================================
// CONFIGURATION FILE HANDLING
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
    if (filename.indexOf(extension) !== -1) {
      return Common.knonwConfigFileExtensions[extension];
    }
  }
  return null;
};

Common.getConfigFileCandidates = function(name) {
  return Object.keys(Common.knonwConfigFileExtensions).map((ext) => name + ext);
};

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

// ============================================================================
// ENVIRONMENT FILTERING
// ============================================================================

function filterEnvironment(envObj, filterConfig) {
  if (filterConfig === true) return {};

  if (typeof filterConfig === 'string') {
    const filtered = { ...envObj };
    delete filtered[filterConfig];
    return filtered;
  }

  const filtered = {};
  const allowedKeys = Object.keys(envObj).filter(
    (key) => !filterConfig.some((pattern) => key.includes(pattern))
  );

  allowedKeys.forEach((key) => {
    filtered[key] = envObj[key];
  });

  return filtered;
}

// ============================================================================
// APP CONFIGURATION PREPARATION
// ============================================================================

function resolveAppCwd(app, opts) {
  let cwd = null;

  if (app.cwd) {
    cwd = path.resolve(app.cwd);
    process.env.PWD = app.cwd;
  }

  if (cwd && cwd[0] !== '/') {
    cwd = path.resolve(process.cwd(), cwd);
  }

  return cwd || opts.cwd;
}

function resolveAppScript(app, cwd) {
  app.pm_exec_path = path.resolve(cwd, app.script);

  if (!fs.existsSync(app.pm_exec_path)) {
    let ckd = which(app.script);
    if (ckd) {
      app.pm_exec_path = typeof ckd === 'string' ? ckd : ckd.toString();
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
    } catch (e) {}
    delete app.disable_source_map_support;
  }
}

function setupAppEnvironment(app) {
  let env = {};

  if (cst.PM2_PROGRAMMATIC || process.env.pm_id) {
    Common.safeExtend(env, process.env);
  } else {
    env = process.env;
  }

  const baseEnv = app.filter_env && app.filter_env.length > 0
    ? filterEnvironment(process.env, app.filter_env)
    : env;

  app.env = Object.assign({}, baseEnv, app.env || {});
}

function setupLogFiles(app, cwd, formattedName) {
  const logFileTypes = ['log', 'out', 'error', 'pid'];

  logFileTypes.forEach((fileType) => {
    const fileKey = fileType + '_file';
    const isStdFile = !['log', 'pid'].includes(fileType);
    const ext = fileType === 'pid' ? 'pid' : 'log';
    let filePath = app[fileKey];

    if (filePath) filePath = resolveHome(filePath);

    let pathSegments;

    if ((fileType === 'log' && typeof filePath === 'boolean' && filePath) ||
        (fileType !== 'log' && !filePath)) {
      pathSegments = [
        cst['DEFAULT_' + ext.toUpperCase() + '_PATH'],
        formattedName + (isStdFile ? '-' + fileType : '') + '.' + ext
      ];
    } else if ((fileType !== 'log' || (fileType === 'log' && filePath)) &&
               filePath !== 'NULL' && filePath !== '/dev/null') {
      pathSegments = [cwd, filePath];

      const dir = path.dirname(path.resolve(cwd, filePath));
      if (!fs.existsSync(dir)) {
        Common.printError(cst.PREFIX_MSG_WARNING + 'Folder does not exist: ' + dir);
        Common.printOut(cst.PREFIX_MSG + 'Creating folder: ' + dir);
        try {
          require('mkdirp').sync(dir);
        } catch (err) {
          Common.printError(cst.PREFIX_MSG_ERR + 'Could not create folder: ' + path.dirname(filePath));
          throw new Error('Could not create folder');
        }
      }
    }

    const pathKey = 'pm_' + (isStdFile ? fileType.substr(0, 3) + '_' : '') + ext + '_path';

    if (filePath !== 'NULL' && filePath !== '/dev/null') {
      if (pathSegments) {
        app[pathKey] = path.resolve.apply(null, pathSegments);
      }
    } else if (path.sep === '\\') {
      app[pathKey] = '\\\\.\\NUL';
    } else {
      app[pathKey] = '/dev/null';
    }

    delete app[fileKey];
  });
}

Common.prepareAppConf = function(opts, app) {
  if (!app.script) {
    return new Error('No script path - aborting');
  }

  if (!app.node_args) {
    app.node_args = [];
  }

  if (app.port && app.env) {
    app.env.PORT = app.port;
  }

  const cwd = resolveAppCwd(app, opts);
  const scriptError = resolveAppScript(app, cwd);

  if (scriptError) return scriptError;

  enableSourceMapSupport(app);
  delete app.script;

  setupAppEnvironment(app);

  app.pm_cwd = cwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch (e) {
    return e;
  }

  Common.sink.determineExecMode(app);

  const formattedAppName = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');
  setupLogFiles(app, cwd, formattedAppName);

  return app;
};

// ============================================================================
// INTERPRETER RESOLUTION
// ============================================================================

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

  let nvmNodePath = path.join(nvmPath, pathToNode);

  try {
    fs.accessSync(nvmNodePath);
  } catch (e) {
    Common.printOut(cst.PREFIX_MSG + 'Installing Node v%s', nodeVersion);
    const nvmBin = path.join(nvmPath, 'nvm.' + (cst.IS_WINDOWS ? 'exe' : 'sh'));
    const nvmCmd = cst.IS_WINDOWS
      ? nvmBin + ' install ' + nodeVersion
      :