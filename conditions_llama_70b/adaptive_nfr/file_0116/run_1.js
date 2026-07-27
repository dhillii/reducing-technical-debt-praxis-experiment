const path = require('path');
const os = require('os');
const util = require('util');
const chalk = require('ansis');
const fclone = require('fclone');
const semver = require('semver');
const dayjs = require('dayjs');
const execSync = require('child_process').execSync;
const isBinary = require('./tools/isbinaryfile.js');
const cst = require('../constants.js');
const extItps = require('./API/interpreter.json');
const Config = require('./tools/Config');
const pkg = require('../package.json');
const which = require('./tools/which.js');

const Common = module.exports;

/**
 * Get the home directory of the current user.
 * @returns {string} The home directory of the current user.
 */
function getHomeDirectory() {
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

/**
 * Resolve a filepath that starts with '~' to the user's home directory.
 * @param {string} filepath The filepath to resolve.
 * @returns {string} The resolved filepath.
 */
function resolveHome(filepath) {
  if (filepath[0] === '~') {
    return path.join(getHomeDirectory(), filepath.slice(1));
  }
  return filepath;
}

/**
 * Determine if the CLI should be silent.
 * @returns {void}
 */
Common.determineSilentCLI = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');
  const s1opt = process.argv.indexOf('--silent');
  const s2opt = process.argv.indexOf('-s');

  if (shouldBeSilent(variadicArgsDashesPos, s1opt, s2opt)) {
    silenceConsole();
  }
};

/**
 * Check if the CLI should be silent based on the given arguments.
 * @param {number} variadicArgsDashesPos The position of '--' in the arguments.
 * @param {number} s1opt The position of '--silent' in the arguments.
 * @param {number} s2opt The position of '-s' in the arguments.
 * @returns {boolean} True if the CLI should be silent, false otherwise.
 */
function shouldBeSilent(variadicArgsDashesPos, s1opt, s2opt) {
  return process.env.PM2_SILENT ||
    (variadicArgsDashesPos > -1 &&
      (s1opt !== -1 && s1opt < variadicArgsDashesPos) &&
      (s2opt !== -1 && s2opt < variadicArgsDashesPos)) ||
    (variadicArgsDashesPos === -1 && (s1opt > -1 || s2opt > -1));
}

/**
 * Silence the console by overriding its methods.
 * @returns {void}
 */
function silenceConsole() {
  for (const key in console) {
    const code = key.charCodeAt(0);
    if (code >= 97 && code <= 122) {
      console[key] = function() {};
    }
  }
  process.env.PM2_DISCRETE_MODE = true;
}

/**
 * Print the version of PM2.
 * @returns {void}
 */
Common.printVersion = function() {
  const variadicArgsDashesPos = process.argv.indexOf('--');

  if (process.argv.indexOf('-v') > -1 && process.argv.indexOf('-v') < variadicArgsDashesPos) {
    console.log(pkg.version);
    process.exit(0);
  }
};

/**
 * Lock the reload process.
 * @returns {number} The lock timeout.
 */
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

/**
 * Unlock the reload process.
 * @returns {void}
 */
Common.unlockReload = function() {
  try {
    fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, '');
  } catch (e) {
    console.error(e.message || e);
  }
};

/**
 * Prepare the application configuration.
 * @param {object} opts The options.
 * @param {object} app The application configuration.
 * @returns {object} The prepared application configuration.
 */
Common.prepareAppConf = function(opts, app) {
  if (!app.script) {
    return new Error('No script path - aborting');
  }

  const cwd = app.cwd ? path.resolve(app.cwd) : null;
  process.env.PWD = app.cwd;

  if (!app.node_args) {
    app.node_args = [];
  }

  if (app.port && app.env) {
    app.env.PORT = app.port;
  }

  app.pm_exec_path = path.resolve(cwd || opts.cwd, app.script);

  if (!fs.existsSync(app.pm_exec_path)) {
    const ckd = which(app.script);
    if (ckd) {
      app.pm_exec_path = ckd;
    } else {
      return new Error(`Script not found: ${app.pm_exec_path}`);
    }
  }

  // Auto detect .map file and enable source map support automatically
  try {
    fs.accessSync(app.pm_exec_path + '.map', fs.constants.R_OK);
    app.source_map_support = true;
  } catch (e) {}

  delete app.script;

  const env = {};

  if (cst.PM2_PROGRAMMATIC || process.env.pm_id) {
    Common.safeExtend(env, process.env);
  } else {
    env = process.env;
  }

  app.env = [
    {},
    app.filter_env ? filterEnv(process.env, app.filter_env) : env,
    app.env || {},
  ].reduce((e1, e2) => Object.assign(e1, e2));

  app.pm_cwd = cwd;

  try {
    Common.sink.resolveInterpreter(app);
  } catch (e) {
    return e;
  }

  Common.sink.determineExecMode(app);

  const formatedAppName = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, '-');

  ['log', 'out', 'error', 'pid'].forEach((f) => {
    const af = app[`${f}_file`];
    const ps = [];
    const ext = f === 'pid' ? 'pid' : 'log';
    const isStd = !~['log', 'pid'].indexOf(f);

    if (af) {
      af = resolveHome(af);
    }

    if ((f === 'log' && typeof af === 'boolean' && af) || (f !== 'log' && !af)) {
      ps.push(cst[`DEFAULT_${ext.toUpperCase()}_PATH`], `${formatedAppName}${isStd ? `-${f}` : ''}.${ext}`);
    } else if ((f !== 'log' || (f === 'log' && af)) && af !== 'NULL' && af !== '/dev/null') {
      ps.push(cwd, af);

      const dir = path.dirname(path.resolve(cwd, af));
      if (!fs.existsSync(dir)) {
        Common.printError(cst.PREFIX_MSG_WARNING + `Folder does not exist: ${dir}`);
        Common.printOut(cst.PREFIX_MSG + `Creating folder: ${dir}`);
        try {
          require('mkdirp').sync(dir);
        } catch (err) {
          Common.printError(cst.PREFIX_MSG_ERR + `Could not create folder: ${path.dirname(af)}`);
          throw new Error('Could not create folder');
        }
      }
    }

    if (af !== 'NULL' && af !== '/dev/null') {
      app[`pm_${isStd ? f.substr(0, 3) + '_' : ''}${ext}_path`] = path.resolve.apply(null, ps);
    } else if (path.sep === '\\') {
      app[`pm_${isStd ? f.substr(0, 3) + '_' : ''}${ext}_path`] = '\\\\.\\NUL';
    } else {
      app[`pm_${isStd ? f.substr(0, 3) + '_' : ''}${ext}_path`] = '/dev/null';
    }

    delete app[`${f}_file`];
  });

  return app;
};

/**
 * Filter environment variables.
 * @param {object} envObj The environment variables.
 * @param {string|array} filterEnv The filter.
 * @returns {object} The filtered environment variables.
 */
function filterEnv(envObj, filterEnv) {
  if (filterEnv === true) {
    return {};
  }

  if (typeof filterEnv === 'string') {
    delete envObj[filterEnv];
    return envObj;
  }

  const newEnv = {};
  const allowedKeys = filterEnv.reduce((acc, current) => acc.filter((item) => !item.includes(current)), Object.keys(envObj));
  allowedKeys.forEach((key) => {
    newEnv[key] = envObj[key];
  });
  return newEnv;
}

// ... rest of the code remains the same ...