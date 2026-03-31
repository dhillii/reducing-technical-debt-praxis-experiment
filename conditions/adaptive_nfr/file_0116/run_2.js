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
// ERROR HANDLING
// ============================================================================

Common.retErr = function(e) {
  if (!e)
    return new Error('Unidentified error');
  if (e instanceof Error)
    return e;
  return new Error(e);
};

// ============================================================================
// INTERPRETER & EXECUTION MODE
// ============================================================================

Common.sink = {};

Common.sink.determineCron = function(app) {
  if (app.cron_restart == 0 || app.cron_restart == '0') {
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

  var isNodeLike = app.exec_interpreter && 
    (app.exec_interpreter.includes('node') || app.exec_interpreter.includes('bun'));
  var hasInstances = app.instances >= 1 || app.instances === 0 || app.instances === -1;

  if (!app.exec_mode && hasInstances && isNodeLike) {
    app.exec_mode = 'cluster_mode';
  } else if (!app.exec_mode) {
    app.exec_mode = 'fork_mode';
  }

  if (typeof app.instances === 'undefined')
    app.instances = 1;
};

var resolveNodeInterpreter = function(app) {
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
  var path_to_node = _getNodePath(node_version);
  var nvm_node_path = path.join(nvm_path, path_to_node);

  try {
    fs.accessSync(nvm_node_path);
  } catch(e) {
    _installNodeVersion(nvm_path, node_version);
    if (cst.IS_WINDOWS)
      nvm_node_path = nvm_node_path.replace(/node/, 'node' + process.arch.slice(1));
  }

  Common.printOut(cst.PREFIX_MSG + chalk.green.bold('Setting Node to v%s (path=%s)'),
                  node_version, nvm_node_path);
  app.exec_interpreter = nvm_node_path;
};

function _getNodePath(node_version) {
  if (cst.IS_WINDOWS) {
    return '/v' + node_version + '/node.exe';
  }
  return semver.satisfies(node_version, '>= 0.12.0')
    ? '/versions/node/v' + node_version + '/bin/node'
    : '/v' + node_version + '/bin/node';
}

function _installNodeVersion(nvm_path, node_version) {
  Common.printOut(cst.PREFIX_MSG + 'Installing Node v%s', node_version);
  var nvm_bin = path.join(nvm_path, 'nvm.' + (cst.IS_WINDOWS ? 'exe' : 'sh'));
  var nvm_cmd = cst.IS_WINDOWS
    ? nvm_bin + ' install ' + node_version
    : '. ' + nvm_bin + ' ; nvm install ' + node_version;

  Common.printOut(cst.PREFIX_MSG + 'Executing: %s', nvm_cmd);
  execSync(nvm_cmd, {
    cwd: path.resolve(process.cwd()),
    env: process.env,
    maxBuffer: 20 * 1024 * 1024
  });
}

Common.sink.resolveInterpreter = function(app) {
  var noInterpreter = !app.exec_interpreter;
  var extName = path.extname(app.pm_exec_path);
  var betterInterpreter = extItps[extName];

  if (noInterpreter && (extName === '.js' || extName === '.ts') && cst.IS_BUN === true) {
    noInterpreter = false;
    app.exec_interpreter = process.execPath;
  }

  if (noInterpreter && betterInterpreter) {
    app.exec_interpreter = betterInterpreter;
    _resolvePythonInterpreter(app);
  }
  else if (noInterpreter) {
    app.exec_interpreter = isBinary(app.pm_exec_path) ? 'none' : process.execPath;
  }
  else if (app.exec_interpreter.indexOf('node@') > -1) {
    resolveNodeInterpreter(app);
  }

  if (app.exec_interpreter.indexOf('python') > -1)
    app.env.PYTHONUNBUFFERED = '1';

  _resolveSpecialInterpreters(app);
  _validateInterpreterExists(app);

  return app;
};

function _resolvePythonInterpreter(app) {
  if (app.exec_interpreter === 'python') {
    if (which('python') === null) {
      if (which('python3') === null) {
        Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow('python and python3 binaries not available in PATH'));
      } else {
        app.exec_interpreter = 'python3';
      }
    }
  }
}

function _resolveSpecialInterpreters(app) {
  var interpreterMap = {
    'lsc': path.resolve(__dirname, '../node_modules/.bin/lsc'),
    'coffee': path.resolve(__dirname, '../node_modules/.bin/coffee')
  };

  if (interpreterMap[app.exec_interpreter]) {
    app.exec_interpreter = interpreterMap[app.exec_interpreter];
  }
}

function _validateInterpreterExists(app) {
  if (app.exec_interpreter === 'none' || which(app.exec_interpreter) !== null)
    return;

  if (app.exec_interpreter === 'node') {
    Common.warn(`Using builtin node.js version on version ${process.version}`);
    app.exec_interpreter = cst.BUILTIN_NODE_PATH;
  } else {
    throw new Error(`Interpreter ${app.exec_interpreter} is NOT AVAILABLE in PATH. (type 'which ${app.exec_interpreter}' to double check.)`);
  }
}

// ============================================================================
// APP CONFIGURATION PREPARATION
// ============================================================================

Common.prepareAppConf = function(opts, app) {
  if (!app.script)
    return new Error('No script path - aborting');

  var cwd = _resolveCwd(app, opts);
  app.pm_exec_path = path.resolve(cwd, app.script);

  if (!fs.existsSync(app.pm_exec_path)) {
    var ckd = which(app.script);
    if (ckd) {
      app.pm_exec_path = typeof ckd === 'string' ? ckd : ckd.toString();
    } else {
      return new Error(`Script not found: ${app.pm_exec_path}`);
    }
  }

  _handleSourceMap(app);
  delete app.script;

  app.env = _buildEnvironment(app, cwd);
  app.pm_cwd = cwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch(e) {
    return e;
  }

  Common.sink.determineExecMode(app);
  _setupLogFiles(app, cwd);

  return app;
};

function _resolveCwd(app, opts) {
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
  return cwd || opts.cwd;
}

function _handleSourceMap(app) {
  if (app.disable_source_map_support !== true) {
    try {
      fs.accessSync(app.pm_exec_path + '.map', fs.constants.R_OK);
      app.source_map_support = true;
    } catch(e) {}