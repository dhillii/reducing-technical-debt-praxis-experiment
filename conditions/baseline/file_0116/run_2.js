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
// ENVIRONMENT UTILITIES
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

// ============================================================================
// SILENT MODE & VERSION
// ============================================================================

Common.determineSilentCLI = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const silentLongOpt = process.argv.indexOf('--silent');
  const silentShortOpt = process.argv.indexOf('-s');

  const isSilentMode = process.env.PM2_SILENT ||
    (variadicArgsDashesPos > -1 &&
      silentLongOpt > -1 && silentLongOpt < variadicArgsDashesPos &&
      silentShortOpt > -1 && silentShortOpt < variadicArgsDashesPos) ||
    (variadicArgsDashesPos === -1 && (silentLongOpt > -1 || silentShortOpt > -1));

  if (isSilentMode) {
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
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const versionIndex = process.argv.indexOf('-v');

  if (versionIndex > -1 && versionIndex < variadicArgsDashesPos) {
    console.log(pkg.version);
    process.exit(0);
  }
};

// ============================================================================
// RELOAD LOCK
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
    // Ignore read errors
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
// CONFIG FILE HANDLING
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
  return Object.keys(Common.knownConfigFileExtensions).map(ext => name + ext);
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
// APP CONFIGURATION PREPARATION
// ============================================================================

function validateScriptPath(app) {
  if (!app.script) {
    return new Error('No script path - aborting');
  }
  return null;
}

function resolveScriptPath(app, cwd) {
  app.pm_exec_path = path.resolve(cwd, app.script);

  if (!fs.existsSync(app.pm_exec_path)) {
    const resolvedPath = which(app.script);
    if (resolvedPath) {
      app.pm_exec_path = typeof resolvedPath === 'string' ? resolvedPath : resolvedPath.toString();
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
    } catch (e) {
      // Ignore
    }
    delete app.disable_source_map_support;
  }
}

function filterEnvironment(envObj, filterConfig) {
  if (filterConfig === true) return {};

  if (typeof filterConfig === 'string') {
    const filtered = { ...envObj };
    delete filtered[filterConfig];
    return filtered;
  }

  const newEnv = {};
  const allowedKeys = Object.keys(envObj).filter(key =>
    !filterConfig.some(filter => key.includes(filter))
  );
  allowedKeys.forEach(key => {
    newEnv[key] = envObj[key];
  });
  return newEnv;
}

function setupEnvironment(app, opts) {
  let env = {};

  if (cst.PM2_PROGRAMMATIC || process.env.pm_id) {
    Common.safeExtend(env, process.env);
  } else {
    env = process.env;
  }

  const filteredEnv = app.filter_env && app.filter_env.length > 0
    ? filterEnvironment(process.env, app.filter_env)
    : env;

  app.env = Object.assign({}, filteredEnv, app.env || {});
}

function setupLogFiles(app, cwd, formattedAppName) {
  const logFileTypes = ['log', 'out', 'error', 'pid'];

  logFileTypes.forEach(fileType => {
    const fileKey = fileType + '_file';
    const logFile = app[fileKey];
    const ext = fileType === 'pid' ? 'pid' : 'log';
    const isStdFile = !['log', 'pid'].includes(fileType);

    let resolvedFile = logFile ? resolveHome(logFile) : null;
    let pathSegments = null;

    if ((fileType === 'log' && typeof resolvedFile === 'boolean' && resolvedFile) ||
        (fileType !== 'log' && !resolvedFile)) {
      pathSegments = [cst[`DEFAULT_${ext.toUpperCase()}_PATH`],
        formattedAppName + (isStdFile ? `-${fileType}` : '') + `.${ext}`];
    } else if ((fileType !== 'log' || (fileType === 'log' && resolvedFile)) &&
               resolvedFile !== 'NULL' && resolvedFile !== '/dev/null') {
      pathSegments = [cwd, resolvedFile];

      const dir = path.dirname(path.resolve(cwd, resolvedFile));
      if (!fs.existsSync(dir)) {
        Common.printError(cst.PREFIX_MSG_WARNING + `Folder does not exist: ${dir}`);
        Common.printOut(cst.PREFIX_MSG + `Creating folder: ${dir}`);
        try {
          require('mkdirp').sync(dir);
        } catch (err) {
          Common.printError(cst.PREFIX_MSG_ERR + `Could not create folder: ${path.dirname(resolvedFile)}`);
          throw new Error('Could not create folder');
        }
      }
    }

    const pathKey = `pm_${isStdFile ? fileType.substr(0, 3) + '_' : ''}${ext}_path`;

    if (resolvedFile !== 'NULL' && resolvedFile !== '/dev/null') {
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
}

Common.prepareAppConf = function(opts, app) {
  const scriptError = validateScriptPath(app);
  if (scriptError) return scriptError;

  let cwd = app.cwd ? path.resolve(app.cwd) : null;
  if (cwd) process.env.PWD = app.cwd;

  app.node_args = app.node_args || [];

  if (app.port && app.env) {
    app.env.PORT = app.port;
  }

  cwd = cwd && cwd[0] !== '/' ? path.resolve(process.cwd(), cwd) : cwd;
  cwd = cwd || opts.cwd;

  const scriptError2 = resolveScriptPath(app, cwd);
  if (scriptError2) return scriptError2;

  enableSourceMapSupport(app);
  delete app.script;

  setupEnvironment(app, opts);
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

  Common.printOut(cst.PREFIX_MSG + chalk.green.bold('Setting Node to v%s (path=%s)'),
    nodeVersion,
    nvmNodePath);

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

Common.sink.resolveInterpreter = function(app) {
  const noInterpreter = !app.exec_interpreter;
  const extName = path.extname(app.pm_exec_path);
  const betterInterpreter = extItps[extName];

  // Bun support
  if (noInterpreter && (extName === '.js' || extName === '.ts') && cst.IS_BUN === true) {
    app.exec_interpreter = process.exec