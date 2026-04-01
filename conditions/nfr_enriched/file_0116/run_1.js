```javascript
/**
 * Copyright 2013-2022 the PM2 project authors. All rights reserved.
 * Use of this source code is governed by a license that
 * can be found in the LICENSE file.
 */

/**
 * Common Utilities ONLY USED IN ->CLI<-
 */

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

// Helper: Get home directory
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

// Helper: Resolve home directory in filepath
function resolveHome(filepath) {
  if (filepath[0] === '~') {
    return path.join(homedir(), filepath.slice(1));
  }
  return filepath;
}

// Helper: Check if silent mode is enabled
function isSilentModeEnabled() {
  return process.env.PM2_SILENT === 'true' || process.env.PM2_PROGRAMMATIC === 'true';
}

// Helper: Disable console methods for silent mode
function disableConsole() {
  for (const key in console) {
    const code = key.charCodeAt(0);
    if (code >= 97 && code <= 122) {
      console[key] = function(){};
    }
  }
}

// Helper: Check if silent flag is in valid position
function isSilentFlagValid(variadicPos, flagPos) {
  return flagPos > -1 && (variadicPos === -1 || flagPos < variadicPos);
}

Common.determineSilentCLI = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const s1opt = process.argv.indexOf('--silent');
  const s2opt = process.argv.indexOf('-s');

  const hasSilentEnv = process.env.PM2_SILENT;
  const hasSilentFlag = isSilentFlagValid(variadicArgsDashesPos, s1opt) || 
                        isSilentFlagValid(variadicArgsDashesPos, s2opt);

  if (hasSilentEnv || hasSilentFlag) {
    disableConsole();
    process.env.PM2_DISCRETE_MODE = true;
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

Common.lockReload = function() {
  try {
    const t1 = fs.readFileSync(cst.PM2_RELOAD_LOCKFILE).toString();

    if (t1 && t1 !== '') {
      const diff = dayjs().diff(parseInt(t1));
      if (diff < cst.RELOAD_LOCK_TIMEOUT)
        return diff;
    }
  } catch(e) {}

  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, dayjs().valueOf().toString());
    return 0;
  } catch(e) {
    console.error(e.message || e);
  }
};

Common.unlockReload = function() {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, '');
  } catch(e) {
    console.error(e.message || e);
  }
};

// Helper: Validate app has script
function validateAppScript(app) {
  if (!app.script)
    return new Error('No script path - aborting');
  return null;
}

// Helper: Resolve working directory
function resolveWorkingDirectory(app, opts) {
  let cwd = null;

  if (app.cwd) {
    cwd = path.resolve(app.cwd);
    process.env.PWD = app.cwd;
  }

  cwd = cwd && cwd[0] !== '/' ? path.resolve(process.cwd(), cwd) : cwd;
  return cwd || opts.cwd;
}

// Helper: Initialize node args
function initializeNodeArgs(app) {
  if (!app.node_args) {
    app.node_args = [];
  }
}

// Helper: Set port in environment
function setPortInEnv(app) {
  if (app.port && app.env) {
    app.env.PORT = app.port;
  }
}

// Helper: Resolve script path
function resolveScriptPath(app, cwd) {
  app.pm_exec_path = path.resolve(cwd, app.script);

  if (!fs.existsSync(app.pm_exec_path)) {
    let ckd = which(app.script);
    if (ckd) {
      if (typeof(ckd) !== 'string')
        ckd = ckd.toString();
      app.pm_exec_path = ckd;
    } else {
      return new Error(`Script not found: ${app.pm_exec_path}`);
    }
  }
  return null;
}

// Helper: Handle source map support
function handleSourceMapSupport(app) {
  if (app.disable_source_map_support !== true) {
    try {
      fs.accessSync(app.pm_exec_path + '.map', fs.constants.R_OK);
      app.source_map_support = true;
    } catch(e) {}
    delete app.disable_source_map_support;
  }
}

// Helper: Filter environment variables
function filterEnvironmentVariables(app, env) {
  if (app.filter_env === true)
    return {};

  if (typeof app.filter_env === 'string') {
    const filtered = Object.assign({}, env);
    delete filtered[app.filter_env];
    return filtered;
  }

  if (Array.isArray(app.filter_env) && app.filter_env.length > 0) {
    const newEnv = {};
    const allowedKeys = Object.keys(env).filter(key => 
      !app.filter_env.some(filter => key.includes(filter))
    );
    allowedKeys.forEach(key => newEnv[key] = env[key]);
    return newEnv;
  }

  return env;
}

// Helper: Prepare environment variables
function prepareEnvironmentVariables(app, cwd) {
  let env = {};

  if (cst.PM2_PROGRAMMATIC || process.env.pm_id)
    Common.safeExtend(env, process.env);
  else
    env = process.env;

  const filteredEnv = app.filter_env ? filterEnvironmentVariables(app, process.env) : env;

  app.env = Object.assign({}, filteredEnv, app.env || {});
}

// Helper: Format application name
function formatApplicationName(name) {
  return name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');
}

// Helper: Resolve log file path
function resolveLogFilePath(app, cwd, formattedName, fileType, isStdFile) {
  const fileKey = fileType + '_file';
  const af = app[fileKey];
  const ext = fileType === 'pid' ? 'pid' : 'log';
  const isStd = !~['log', 'pid'].indexOf(fileType);

  let resolvedPath = af ? resolveHome(af) : null;

  if ((fileType === 'log' && typeof resolvedPath === 'boolean' && resolvedPath) || 
      (fileType !== 'log' && !resolvedPath)) {
    const ps = [cst['DEFAULT_' + ext.toUpperCase() + '_PATH'], 
                formattedName + (isStd ? '-' + fileType : '') + '.' + ext];
    resolvedPath = path.resolve.apply(null, ps);
  } else if ((fileType !== 'log' || (fileType === 'log' && resolvedPath)) && 
             resolvedPath !== 'NULL' && resolvedPath !== '/dev/null') {
    const dir = path.dirname(path.resolve(cwd, resolvedPath));
    if (!fs.existsSync(dir)) {
      Common.printError(cst.PREFIX_MSG_WARNING + 'Folder does not exist: ' + dir);
      Common.printOut(cst.PREFIX_MSG + 'Creating folder: ' + dir);
      try {
        require('mkdirp').sync(dir);
      } catch (err) {
        Common.printError(cst.PREFIX_MSG_ERR + 'Could not create folder: ' + path.dirname(resolvedPath));
        throw new Error('Could not create folder');
      }
    }
    resolvedPath = path.resolve(cwd, resolvedPath);
  }

  // Set PM2 paths
  const pathKey = 'pm_' + (isStd ? fileType.substr(0, 3) + '_' : '') + ext + '_path';
  if (resolvedPath !== 'NULL' && resolvedPath !== '/dev/null') {
    app[pathKey] = resolvedPath;
  } else if (path.sep === '\\') {
    app[pathKey] = '\\\\.\\NUL';
  } else {
    app[pathKey] = '/dev/null';
  }

  delete app[fileKey];
}

// Helper: Setup log file paths
function setupLogFilePaths(app, cwd) {
  const formattedName = formatApplicationName(app.name);
  ['log', 'out', 'error', 'pid'].forEach(fileType => {
    resolveLogFilePath(app, cwd, formattedName, fileType, true);
  });
}

/**
 * Resolve app paths and replace missing values with defaults.
 * @method prepareAppConf
 * @param app {Object}
 * @param {} cwd
 * @param {} outputter
 * @return app
 */
Common.prepareAppConf = function(opts, app) {
  const scriptError = validateAppScript(app);
  if (scriptError) return scriptError;

  const cwd = resolveWorkingDirectory(app, opts);
  
  initializeNodeArgs(app);
  setPortInEnv(app);

  const scriptError2 = resolveScriptPath(app, cwd);
  if (scriptError2) return scriptError2;

  handleSourceMapSupport(app);
  delete app.script;

  prepareEnvironmentVariables(app, cwd);

  app.pm_cwd = cwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch(e) {
    return e;
  }

  Common.sink.determineExecMode(app);
  setupLogFilePaths(app, cwd);

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
Common.isConfigFile = function (filename) {
  if (typeof (filename) !== 'string')
    return null;

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

/**
 * Parses a config file like ecosystem.config.js. Supported formats: JS, JSON, JSON5, YAML.
 * @param {string} confString  contents of the config file
 * @param {string} filename    path to the config file
 * @return {Object} config object
 */
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
  if (!e)
    return new Error('Unidentified error');
  if (e instanceof Error)
    return e;
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

/**
 * Handle alias (fork <=> fork_mode, cluster <=> cluster_mode)
 */
Common.sink.determineExecMode = function(app) {
  if (app.exec_mode)
    app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');

  const hasNodeOrBun = app.exec_interpreter && 
                       (app.exec_interpreter.includes('node') || 
                        app.exec_interpreter.includes('bun'));
  const hasInstances = app.instances >= 1 || app.instances === 0 || app.instances === -1;

  if (!app.exec_mode && hasInstances && hasNodeOrBun) {
    app.exec_mode = 'cluster_mode';