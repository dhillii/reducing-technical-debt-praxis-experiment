```javascript
/**
 * Copyright 2013-2022 the PM2 project authors. All rights reserved.
 * Use of this source code is governed by a license that
 * can be found in the LICENSE file.
 */

/**
 * Common Utilities ONLY USED IN ->CLI<-
 */

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

// ============================================================================
// PLATFORM UTILITIES
// ============================================================================

function homedir() {
  var env = process.env;
  var home = env.HOME;
  var user = env.LOGNAME || env.USER || env.LNAME || env.USERNAME;

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

// ============================================================================
// SILENT MODE & VERSION
// ============================================================================

Common.determineSilentCLI = function() {
  var variadicArgsDashesPos = process.argv.indexOf('--');
  var s1opt = process.argv.indexOf('--silent');
  var s2opt = process.argv.indexOf('-s');

  var isSilentBefore = variadicArgsDashesPos === -1 || 
    (s1opt > -1 && s1opt < variadicArgsDashesPos) ||
    (s2opt > -1 && s2opt < variadicArgsDashesPos);

  if (process.env.PM2_SILENT || isSilentBefore) {
    Object.keys(console).forEach(function(key) {
      var code = key.charCodeAt(0);
      if (code >= 97 && code <= 122) {
        console[key] = function(){};
      }
    });
    process.env.PM2_DISCRETE_MODE = true;
  }
};

Common.printVersion = function() {
  var variadicArgsDashesPos = process.argv.indexOf('--');
  var vIndex = process.argv.indexOf('-v');

  if (vIndex > -1 && vIndex < variadicArgsDashesPos) {
    console.log(pkg.version);
    process.exit(0);
  }
};

// ============================================================================
// RELOAD LOCK
// ============================================================================

Common.lockReload = function() {
  try {
    var t1 = fs.readFileSync(cst.PM2_RELOAD_LOCKFILE).toString();

    if (t1 && t1 !== '') {
      var diff = dayjs().diff(parseInt(t1));
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

// ============================================================================
// CONFIG FILE HANDLING
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
  if (typeof filename !== 'string')
    return null;

  for (let extension in Common.knonwConfigFileExtensions) {
    if (filename.indexOf(extension) !== -1) {
      return Common.knonwConfigFileExtensions[extension];
    }
  }

  return null;
};

Common.getConfigFileCandidates = function(name) {
  return Object.keys(Common.knonwConfigFileExtensions).map((extension) => name + extension);
};

Common.parseConfig = function(confObj, filename) {
  var yamljs = require('js-yaml');
  var vm     = require('vm');
  var isConfigFile = Common.isConfigFile(filename);

  if (!filename || filename === 'pipe' || filename === 'none' || isConfigFile === 'json') {
    var code = '(' + confObj + ')';
    var sandbox = {};
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
    var confPath = require.resolve(path.resolve(filename));
    delete require.cache[confPath];
    return require(confPath);
  }
};

// ============================================================================
// APP CONFIGURATION PREPARATION
// ============================================================================

function filterEnv(app, envObj) {
  if (app.filter_env === true)
    return {};

  if (typeof app.filter_env === 'string') {
    var filtered = Object.assign({}, envObj);
    delete filtered[app.filter_env];
    return filtered;
  }

  var new_env = {};
  var allowedKeys = Object.keys(envObj).filter(key => 
    !app.filter_env.some(pattern => key.includes(pattern))
  );
  allowedKeys.forEach(key => new_env[key] = envObj[key]);
  return new_env;
}

function resolveScriptPath(app, cwd) {
  app.pm_exec_path = path.resolve(cwd, app.script);

  if (!fs.existsSync(app.pm_exec_path)) {
    var ckd = which(app.script);
    if (ckd) {
      app.pm_exec_path = typeof ckd === 'string' ? ckd : ckd.toString();
    } else {
      return new Error(`Script not found: ${app.pm_exec_path}`);
    }
  }

  return null;
}

function resolveSourceMap(app) {
  if (app.disable_source_map_support !== true) {
    try {
      fs.accessSync(app.pm_exec_path + '.map', fs.constants.R_OK);
      app.source_map_support = true;
    } catch(e) {}
    delete app.disable_source_map_support;
  }
}

function resolvePaths(app, cwd, formated_app_name) {
  var pathConfigs = [
    { key: 'log', ext: 'log', isStd: false },
    { key: 'out', ext: 'log', isStd: true },
    { key: 'error', ext: 'log', isStd: true },
    { key: 'pid', ext: 'pid', isStd: false }
  ];

  pathConfigs.forEach(function(config) {
    var af = app[config.key + '_file'];
    if (af) af = resolveHome(af);

    var ps;
    if ((config.key === 'log' && typeof af === 'boolean' && af) || (config.key !== 'log' && !af)) {
      ps = [cst['DEFAULT_' + config.ext.toUpperCase() + '_PATH'], 
            formated_app_name + (config.isStd ? '-' + config.key : '') + '.' + config.ext];
    } else if ((config.key !== 'log' || (config.key === 'log' && af)) && af !== 'NULL' && af !== '/dev/null') {
      ps = [cwd, af];

      var dir = path.dirname(path.resolve(cwd, af));
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
      var pathKey = 'pm_' + (config.isStd ? config.key.substr(0, 3) + '_' : '') + config.ext + '_path';
      ps && (app[pathKey] = path.resolve.apply(null, ps));
    } else if (path.sep === '\\') {
      var pathKey = 'pm_' + (config.isStd ? config.key.substr(0, 3) + '_' : '') + config.ext + '_path';
      app[pathKey] = '\\\\.\\NUL';
    } else {
      var pathKey = 'pm_' + (config.isStd ? config.key.substr(0, 3) + '_' : '') + config.ext + '_path';
      app[pathKey] = '/dev/null';
    }
    delete app[config.key + '_file'];
  });
}

Common.prepareAppConf = function(opts, app) {
  if (!app.script)
    return new Error('No script path - aborting');

  var cwd = null;

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

  cwd = cwd && cwd[0] !== '/' ? path.resolve(process.cwd(), cwd) : cwd;
  cwd = cwd || opts.cwd;

  var scriptError = resolveScriptPath(app, cwd);
  if (scriptError) return scriptError;

  resolveSourceMap(app);
  delete app.script;

  var env = {};
  if (cst.PM2_PROGRAMMATIC || process.env.pm_id)
    Common.safeExtend(env, process.env);
  else
    env = process.env;

  app.env = [
    {}, 
    (app.filter_env && app.filter_env.length > 0) ? filterEnv(app, process.env) : env, 
    app.env || {}
  ].reduce(function(e1, e2) {
    return Object.assign(e1, e2);
  });

  app.pm_cwd = cwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch(e) {
    return e;
  }

  Common.sink.determineExecMode(app);

  var formated_app_name = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');
  resolvePaths(app, cwd, formated_app_name);

  return app;
};

// ============================================================================
// INTERPRETER RESOLUTION
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
    } catch(ex) {
      return new Error(`Cron pattern error: ${ex.message}`);
    }
  }
};

Common.sink.determineExecMode = function(app) {
  if (app.exec_mode)
    app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, '$1_mode');

  if (!app.exec_mode &&
      (app.instances >= 1 || app.instances === 0 || app.instances === -1) &&
      (app.exec_interpreter.includes('node') || app.exec_interpreter.includes('bun'))) {
    app.exec_mode = 'cluster_mode';
  } else if (!app.exec_mode) {
    app.exec_mode = 'fork_mode';
  }
  if (typeof app.instances === 'undefined')
    app.instances = 1;
};

function resolveNodeInterpreter(app) {
  if (app.exec_mode && app.exec_mode.indexOf('cluster') > -1) {
    Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('Choosing the Node.js version in cluster mode is not supported'));
    return false;
  }

  var nvm_path = cst.IS_WINDOWS ? process.env.NVM_HOME : process.env.NVM_DIR;
  if (!nvm_path) {
    Common.printError(cst.PREFIX_MSG_ERR + chalk.red('NVM is not available in PATH'));
    Common.printError(cst.PREFIX_MSG_ERR + chalk.red('Fallback to node in PATH'));
    var msg = cst.IS_WINDOWS
      ? 'https://github.com/coreybutler/nvm-windows/releases/'
      : '$ curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash';
    Common.printOut(cst.PREFIX_MSG_ERR + chalk.bold('Install NVM:\n' + msg));
    return;
  }

  var node_version = app.exec_interpreter.split('@')[1];
  var path_to_node = cst.IS_WINDOWS
    ? '/v' + node_version + '/node.exe'
    : semver.satisfies(node_version, '>= 0.12.0')
        ? '/versions/node/v' + node_version + '/bin/node'
        : '/v' + node_version + '/bin/node';
  var nvm_node_path = path.join(nvm_path, path_to_node);

  try {
    fs.accessSync(nvm_node_path);
  } catch(e) {
    Common.printOut(cst.PREFIX_MSG + 'Installing Node v%s', node_version);
    var nvm_bin = path.join(nvm_path, 'nvm.' + (cst.IS_WINDOWS ? 'exe' : 'sh'));
    var nvm_cmd = cst.IS_WINDOWS
      ? nvm_bin + ' install ' + node_version
      :