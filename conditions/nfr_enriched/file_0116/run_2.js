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

// Get home directory based on platform
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

// Resolve home directory path
function resolveHome(filepath) {
  if (filepath[0] === '~') {
    return path.join(homedir(), filepath.slice(1));
  }
  return filepath;
}

// Check if silent flag is set and disable console output
Common.determineSilentCLI = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const s1opt = process.argv.indexOf('--silent');
  const s2opt = process.argv.indexOf('-s');

  const isSilentFlagSet = process.env.PM2_SILENT ||
    (variadicArgsDashesPos > -1 &&
      (s1opt !== -1 && s1opt < variadicArgsDashesPos) &&
      (s2opt !== -1 && s2opt < variadicArgsDashesPos)) ||
    (variadicArgsDashesPos === -1 && (s1opt > -1 || s2opt > -1));

  if (isSilentFlagSet) {
    for (const key in console) {
      const code = key.charCodeAt(0);
      if (code >= 97 && code <= 122) {
        console[key] = function(){};
      }
    }
    process.env.PM2_DISCRETE_MODE = true;
  }
};

// Print version if -v flag is present
Common.printVersion = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');

  if (process.argv.indexOf('-v') > -1 && process.argv.indexOf('-v') < variadicArgsDashesPos) {
    console.log(pkg.version);
    process.exit(0);
  }
};

// Check and manage reload lock
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

// Clear reload lock
Common.unlockReload = function() {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, '');
  } catch(e) {
    console.error(e.message || e);
  }
};

// Validate script path exists
function validateScriptPath(app) {
  if (!app.script)
    return new Error('No script path - aborting');
  return null;
}

// Resolve script path and check existence
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

// Handle source map support
function handleSourceMapSupport(app) {
  if (app.disable_source_map_support !== true) {
    try {
      fs.accessSync(app.pm_exec_path + '.map', fs.constants.R_OK);
      app.source_map_support = true;
    } catch(e) {}
    delete app.disable_source_map_support;
  }
}

// Filter environment variables based on configuration
function filterEnv(envObj, filterConfig) {
  if (filterConfig === true)
    return {};

  if (typeof filterConfig === 'string') {
    const filtered = Object.assign({}, envObj);
    delete filtered[filterConfig];
    return filtered;
  }

  const newEnv = {};
  const allowedKeys = Object.keys(envObj).filter(item =>
    !filterConfig.some(current => item.includes(current))
  );
  allowedKeys.forEach(key => newEnv[key] = envObj[key]);
  return newEnv;
}

// Prepare environment variables for app
function prepareEnvironment(app, opts) {
  let env = {};

  if (cst.PM2_PROGRAMMATIC || process.env.pm_id)
    Common.safeExtend(env, process.env);
  else
    env = process.env;

  const filteredEnv = (app.filter_env && app.filter_env.length > 0)
    ? filterEnv(process.env, app.filter_env)
    : env;

  app.env = [
    {}, filteredEnv, app.env || {}
  ].reduce((e1, e2) => Object.assign(e1, e2));
}

// Stringify object values in environment
function stringifyEnvObjects(env) {
  for (const key in env) {
    if (typeof env[key] === 'object') {
      env[key] = JSON.stringify(env[key]);
    }
  }
}

// Build log file path configuration
function buildLogFilePath(app, cwd, formattedAppName, fileType, isStd) {
  const fileKey = fileType + '_file';
  const af = app[fileKey] ? resolveHome(app[fileKey]) : null;
  const ext = fileType === 'pid' ? 'pid' : 'log';
  let ps = null;

  if ((fileType === 'log' && typeof af === 'boolean' && af) || (fileType !== 'log' && !af)) {
    ps = [cst['DEFAULT_' + ext.toUpperCase() + '_PATH'], formattedAppName + (isStd ? '-' + fileType : '') + '.' + ext];
  } else if ((fileType !== 'log' || (fileType === 'log' && af)) && af !== 'NULL' && af !== '/dev/null') {
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
    if (ps) {
      app['pm_' + (isStd ? fileType.substr(0, 3) + '_' : '') + ext + '_path'] = path.resolve.apply(null, ps);
    }
  } else if (path.sep === '\\') {
    app['pm_' + (isStd ? fileType.substr(0, 3) + '_' : '') + ext + '_path'] = '\\\\.\\NUL';
  } else {
    app['pm_' + (isStd ? fileType.substr(0, 3) + '_' : '') + ext + '_path'] = '/dev/null';
  }
  delete app[fileKey];
}

// Configure log file paths
function configureLogPaths(app, cwd) {
  const formattedAppName = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');
  const fileTypes = ['log', 'out', 'error', 'pid'];

  fileTypes.forEach(fileType => {
    const isStd = !~['log', 'pid'].indexOf(fileType);
    buildLogFilePath(app, cwd, formattedAppName, fileType, isStd);
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
  const scriptError = validateScriptPath(app);
  if (scriptError) return scriptError;

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

  cwd = (cwd && cwd[0] !== '/') ? path.resolve(process.cwd(), cwd) : cwd;
  cwd = cwd || opts.cwd;

  const scriptPathError = resolveScriptPath(app, cwd);
  if (scriptPathError) return scriptPathError;

  handleSourceMapSupport(app);
  delete app.script;

  prepareEnvironment(app, opts);
  app.pm_cwd = cwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch(e) {
    return e;
  }

  Common.sink.determineExecMode(app);
  configureLogPaths(app, cwd);

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

  const hasInstances = app.instances >= 1 || app.instances === 0 || app.instances === -1;
  const isNodeOrBun = app.exec_interpreter.includes('node') === true || app.exec_interpreter.includes('bun') === true;

  if (!app.exec_mode && hasInstances && isNodeOrBun) {
    app.exec_mode = 'cluster_mode';
  } else if (!app.exec_mode) {
    app.exec_mode = 'fork_mode';
  }

  if (typeof app.instances === 'undefined')
    app.instances = 1;
};

// Resolve Node.js version from NVM
const resolveNodeInterpreter = function(app) {
  if (app.exec_mode && app.exec_mode.indexOf('cluster') > -1) {
    Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('Choosing the Node.js version in cluster mode is not supported'));
    return false;
  }

  const nvmPath = cst.IS_