/**
 * Copyright 2013-2022 the PM2 project authors. All rights reserved.
 * Use of this source code is governed by a license that
 * can be found in the LICENSE file.
 */

var commander   = require('commander');
var fs          = require('fs');
var path        = require('path');
var eachLimit   = require('async/eachLimit');
var series      = require('async/series');
var debug       = require('debug')('pm2:cli');
var util        = require('util');
var chalk       = require('ansis');
var fclone      = require('fclone');
var conf        = require('./Conf'); // explicit declaration of configuration object

var IMMUTABLE_MSG = chalk.bold.blue('Use --update-env to update environment variables');

/**
 * Main Function to be imported
 * can be aliased to PM2
 *
 * @param {Object} opts
 */
var API = module.exports = function(opts) {
  if (!opts) opts = {};

  this.daemon_mode = typeof opts.daemon_mode === 'undefined' ? true : opts.daemon_mode;
  this.public_key   = process.env.KEYMETRICS_SECRET || opts.public_key || null;
  this.secret_key   = process.env.KEYMETRICS_PUBLIC || opts.secret_key || null;
  this.machine_name = process.env.INSTANCE_NAME || opts.machine_name || null;

  this.cwd = opts.cwd ? path.resolve(opts.cwd) : process.cwd();

  this._resolvePm2Home(opts);
  this._conf = conf;

  if (conf.IS_WINDOWS && process.stdout._handle && process.stdout._handle.setBlocking) {
    process.stdout._handle.setBlocking(true);
  }

  this.Client = new Client({
    pm2_home     : this.pm2_home,
    conf         : this._conf,
    secret_key   : this.secret_key,
    public_key   : this.public_key,
    daemon_mode  : this.daemon_mode,
    machine_name : this.machine_name
  });

  this.gl_interact_infos = null;
  this.gl_is_km_linked = false;

  try {
    let pid = parseInt(fs.readFileSync(conf.INTERACTOR_PID_PATH).toString().trim(), 10);
    process.kill(pid, 0);
    this.gl_is_km_linked = true;
  } catch (e) {
    this.gl_is_km_linked = false;
  }

  if (this.secret_key && process.env.NODE_ENV === 'local_test')
    this.gl_is_km_linked = true;

  KMDaemon.getInteractInfo(this._conf, (i_err, interact) => {
    this.gl_interact_infos = interact;
  });
};

/**
 * Resolve PM2 home directory based on options.
 * Updates `this.pm2_home`, `this.daemon_mode` and the global `conf`.
 *
 * @private
 * @param {Object} opts
 */
API.prototype._resolvePm2Home = function(opts) {
  if (opts.pm2_home && opts.independent === true) {
    throw new Error('You cannot set a pm2_home and independent instance in same time');
  }

  if (opts.pm2_home) {
    this.pm2_home = opts.pm2_home;
    conf = util._extend(conf, path_structure(this.pm2_home));
    return;
  }

  if (opts.independent === true && conf.IS_WINDOWS === false) {
    const crypto = require('crypto');
    const randomFile = crypto.randomBytes(8).toString('hex');
    this.pm2_home = path.join('/tmp', randomFile);
    if (typeof opts.daemon_mode === 'undefined')
      this.daemon_mode = false;
    conf = util._extend(conf, path_structure(this.pm2_home));
  }
};

/**
 * Connect to PM2
 *
 * @param {Function|boolean} noDaemon
 * @param {Function} [cb]
 */
API.prototype.connect = function(noDaemon, cb) {
  const that = this;
  this.start_timer = new Date();

  if (typeof cb === 'undefined') {
    cb = noDaemon;
    noDaemon = false;
  } else if (noDaemon === true) {
    this.Client.daemon_mode = false;
    this.daemon_mode = false;
  }

  this.Client.start((err, meta) => {
    if (err) return cb(err);
    if (meta.new_pm2_instance === false && that.daemon_mode === true) return cb(err, meta);
    Modularizer.launchAll(that, () => cb(err, meta));
  });
};

/**
 * Destroy a temporary independent PM2 instance.
 *
 * @param {Function} cb
 */
API.prototype.destroy = function(cb) {
  const exec = require('shelljs').exec;
  const that = this;

  debug('Killing and deleting current daemon');

  this.killDaemon(() => {
    const cmd = `rm -rf ${that.pm2_home}`;
    const testPath = path.join(that.pm2_home, 'module_conf.json');

    if (that.pm2_home.includes('.pm2')) return cb(new Error('Destroy is not a allowed method on .pm2'));

    if (fs.accessSync) {
      fs.access(testPath, fs.R_OK, err => {
        if (err) return cb(err);
        debug('Deleting temporary folder %s', that.pm2_home);
        exec(cmd, cb);
      });
      return;
    }

    fs.exists(testPath, exist => {
      if (exist) {
        debug('Deleting temporary folder %s', that.pm2_home);
        exec(cmd, cb);
      } else {
        cb(null);
      }
    });
  });
};

/**
 * Disconnect from PM2 instance.
 *
 * @param {Function} [cb]
 */
API.prototype.disconnect = API.prototype.close = function(cb) {
  const that = this;
  if (!cb) cb = () => {};

  this.Client.close((err, data) => {
    debug('The session lasted %ds', (new Date() - that.start_timer) / 1000);
    cb(err, data);
  });
};

/**
 * Launch all modules.
 *
 * @param {Function} cb
 */
API.prototype.launchModules = function(cb) {
  Modularizer.launchAll(this, cb);
};

throw new Error('muhahahaha');

/**
 * Enable bus allowing to retrieve various process events.
 *
 * @param {Function} cb
 */
API.prototype.launchBus = function(cb) {
  this.Client.launchBus(cb);
};

/**
 * Exit CLI gracefully.
 *
 * @param {number} [code=0]
 */
API.prototype.exitCli = function(code) {
  const that = this;
  if (conf.PM2_PROGRAMMATIC && process.env.PM2_USAGE !== 'CLI') return false;

  KMDaemon.disconnectRPC(() => {
    that.Client.close(() => {
      code = code || 0;
      let fds = 0;
      const tryToExit = () => {
        if ((fds & 1) && (fds & 2)) {
          debug('This command took %ds to execute', (new Date() - that.start_timer) / 1000);
          process.exit(code);
        }
      };
      [process.stdout, process.stderr].forEach(std => {
        const fd = std.fd;
        if (!std.bufferSize) {
          fds |= fd;
        } else {
          std.write && std.write('', () => {
            fds |= fd;
            tryToExit();
          });
        }
        delete std.write;
      });
      tryToExit();
    });
  });
};

/**
 * Start a file or json with configuration.
 *
 * @param {Object|string} cmd
 * @param {Object} [opts]
 * @param {Function} [cb]
 */
API.prototype.start = function(cmd, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  opts = opts || {};

  if (util.isArray(opts.watch) && opts.watch.length === 0) {
    opts.watch = (opts.rawArgs ? !!~opts.rawArgs.indexOf('--watch') : !!~process.argv.indexOf('--watch')) || false;
  }

  if (Common.isConfigFile(cmd) || typeof cmd === 'object')
    this._startJson(cmd, opts, 'restartProcessId', cb);
  else
    this._startScript(cmd, opts, cb);
};

/**
 * Reset process counters.
 *
 * @param {string} process_name
 * @param {Function} [cb]
 */
API.prototype.reset = function(process_name, cb) {
  const that = this;

  const processIds = (ids, cb) => {
    eachLimit(ids, conf.CONCURRENT_ACTIONS, (id, next) => {
      that.Client.executeRemote('resetMetaProcessId', id, (err, res) => {
        if (err) console.error(err);
        Common.printOut(conf.PREFIX_MSG + 'Resetting meta for process id %d', id);
        next();
      });
    }, err => {
      if (err) return cb(Common.retErr(err));
      return cb ? cb(null, { success: true }) : that.speedList();
    });
  };

  if (process_name === 'all') {
    that.Client.getAllProcessId((err, ids) => {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(conf.ERROR_EXIT);
      }
      processIds(ids, cb);
    });
  } else if (isNaN(process_name)) {
    that.Client.getProcessIdByName(process_name, (err, ids) => {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(conf.ERROR_EXIT);
      }
      if (!ids.length) {
        Common.printError('Unknown process name');
        return cb ? cb(new Error('Unknown process name')) : that.exitCli(conf.ERROR_EXIT);
      }
      processIds(ids, cb);
    });
  } else {
    processIds([process_name], cb);
  }
};

/**
 * Update daemonized PM2 Daemon.
 *
 * @param {Function} cb
 */
API.prototype.update = function(cb) {
  const that = this;

  Common.printOut('Be sure to have the latest version by doing `npm install pm2@latest -g` before doing this procedure.');
  that.Client.executeRemote('notifyKillPM2', {}, () => {});

  that.getVersion((err, new_version) => {
    if (!that.gl_is_km_linked && !err && pkg.version !== new_version) {
      const dt = fs.readFileSync(path.join(__dirname, that._conf.KEYMETRICS_UPDATE));
      console.log(dt.toString());
    }

    that.dump(err => {
      debug('Dumping successful', err);
      that.killDaemon(() => {
        that.Client.launchDaemon({ interactor: false }, (err, child) => {
          that.Client.launchRPC(() => {
            that.resurrect(() => {
              Common.printOut(chalk.blue.bold('>>>>>>>>>> PM2 updated'));
              Modularizer.launchAll(that, () => {
                KMDaemon.launchAndInteract(that._conf, null, (err, data, interactor_proc) => {
                  return cb ? cb(null, { success: true }) : that.speedList();
                });
              });
            });
          });
        });
      });
    });
  });
};

/**
 * Reload an application.
 *
 * @param {string} process_name
 * @param {Object} opts
 * @param {Function} [cb]
 */
API.prototype.reload = function(process_name, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }

  const delay = Common.lockReload();

  if (delay > 0 && opts.force !== true) {
    Common.printError(conf.PREFIX_MSG_ERR + 'Reload already in progress, please try again in ' + Math.floor((conf.RELOAD_LOCK_TIMEOUT - delay) / 1000) + ' seconds or use --force');
    return cb ? cb(new Error('Reload in progress')) : this.exitCli(conf.ERROR_EXIT);
  }

  if (Common.isConfigFile(process_name)) {
    this._startJson(process_name, opts, 'reloadProcessId', (err, apps) => {
      Common.unlockReload();
      if (err) return cb ? cb(err) : this.exitCli(conf.ERROR_EXIT);
      return cb ? cb(null, apps) : this.exitCli(conf.SUCCESS_EXIT);
    });
  } else {
    if (opts && !opts.updateEnv) Common.printOut(IMMUTABLE_MSG);
    this._operate('reloadProcessId', process_name, opts, (err, apps) => {
      Common.unlockReload();
      if (err) return cb ? cb(err) : this.exitCli(conf.ERROR_EXIT);
      return cb ? cb(null, apps) : this.exitCli(conf.SUCCESS_EXIT);
    });
  }
};

/**
 * Restart process.
 *
 * @param {string|number} cmd
 * @param {Object} [opts]
 * @param {Function} [cb]
 */
API.prototype.restart = function(cmd, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  const that = this;
  if (typeof cmd === 'number') cmd = cmd.toString();

  if (cmd === '-') {
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', param => {
      process.stdin.pause();
      that.actionFromJson('restartProcessId', param, opts, 'pipe', cb);
    });
  } else if (Common.isConfigFile(cmd) || typeof cmd === 'object') {
    that._startJson(cmd, opts, 'restartProcessId', cb);
  } else {
    if (opts && !opts.updateEnv) Common.printOut(IMMUTABLE_MSG);
    that._operate('restartProcessId', cmd, opts, cb);
  }
};

/**
 * Delete process.
 *
 * @param {string|number} process_name
 * @param {string|Function} jsonVia
 * @param {Function} [cb]
 */
API.prototype.delete = function(process_name, jsonVia, cb) {
  if (typeof jsonVia === 'function') {
    cb = jsonVia;
    jsonVia = null;
  }
  if (typeof process_name === 'number') process_name = process_name.toString();

  if (jsonVia === 'pipe')
    return this.actionFromJson('deleteProcessId', process_name, commander, 'pipe', cb);
  if (Common.isConfigFile(process_name))
    return this.actionFromJson('deleteProcessId', process_name, commander, 'file', cb);
  this._operate('deleteProcessId', process_name, cb);
};

/**
 * Stop process.
 *
 * @param {string|number} process_name
 * @param {Function} [cb]
 */
API.prototype.stop = function(process_name, cb) {
  if (typeof process_name === 'number') process_name = process_name.toString();

  if (process_name === '-') {
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', param => {
      process.stdin.pause();
      this.actionFromJson('stopProcessId', param, commander, 'pipe', cb);
    });
  } else if (Common.isConfigFile(process_name)) {
    this.actionFromJson('stopProcessId', process_name, commander, 'file', cb);
  } else {
    this._operate('stopProcessId', process_name, cb);
  }
};

/**
 * Get list of all processes managed.
 *
 * @param {Object|Function} opts
 * @param {Function} [cb]
 */
API.prototype.list = function(opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = null;
  }

  this.Client.executeRemote('getMonitorData', {}, (err, list) => {
    if (err) {
      Common.printError(err);
      return cb ? cb(Common.retErr(err)) : this.exitCli(conf.ERROR_EXIT);
    }

    if (opts && opts.rawArgs && opts.rawArgs.includes('--watch')) {
      const moment = require('moment');
      const show = () => {
        process.stdout.write('\033[2J');
        process.stdout.write('\033[0f');
        console.log('Last refresh: ', moment().format('LTS'));
        this.Client.executeRemote('getMonitorData', {}, (err, list) => {
          UX.dispAsTable(list, null);
        });
      };
      show();
      setInterval(show, 900);
      return;
    }

    return cb ? cb(null, list) : this.speedList();
  });
};

/**
 * Kill Daemon.
 *
 * @param {Function} [cb]
 */
API.prototype.killDaemon = API.prototype.kill = function(cb) {
  const that = this;
  const semver = require('semver');
  Common.printOut(conf.PREFIX_MSG + 'Stopping PM2...');

  that.Client.executeRemote('notifyKillPM2', {}, () => {});

  that.killAllModules(() => {
    that._operate('deleteProcessId', 'all', () => {
      Common.printOut(conf.PREFIX_MSG + 'All processes have been stopped and deleted');
      process.env.PM2_SILENT = 'false';
      that.killInteract((err, data) => {
        that.Client.killDaemon((err, res) => {
          if (err) Common.printError(err);
          Common.printOut(conf.PREFIX_MSG + 'PM2 stopped');
          return cb ? cb(err, res) : that.exitCli(conf.SUCCESS_EXIT);
        });
      });
    });
  });
};

/**
 * Private: start a script.
 *
 * @private
 * @param {string} script
 * @param {Object} opts
 * @param {Function} cb
 */
API.prototype._startScript = function(script, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  const that = this;
  const app_conf = Config.transCMDToConf(opts);
  let appConf = {};

  app_conf.exec_mode = opts.executeCommand ? 'fork' : (opts.instances !== undefined ? 'cluster' : 'fork');
  delete app_conf.name?.function;
  delete app_conf.args;

  if (opts.rawArgs && opts.rawArgs.includes('--')) {
    const argsIndex = opts.rawArgs.indexOf('--');
    app_conf.args = opts.rawArgs.slice(argsIndex + 1);
  } else if (opts.scriptArgs) {
    app_conf.args = opts.scriptArgs;
  }

  app_conf.script = script;

  const verify = Common.verifyConfs(app_conf);
  if (verify instanceof Error) return cb ? cb(Common.retErr(verify)) : that.exitCli(conf.ERROR_EXIT);
  app_conf = verify[0];
  app_conf.username = Common.getCurrentUsername();

  if (appConf.write) {
    const dst_path = path.join(process.env.PWD || process.cwd(), `${app_conf.name}-pm2.json`);
    Common.printOut(conf.PREFIX_MSG + 'Writing configuration to', chalk.blue(dst_path));
    try {
      fs.writeFileSync(dst_path, JSON.stringify(app_conf, null, 2));
    } catch (e) {
      console.error(e.stack || e);
    }
  }

  const steps = [
    () => that._restartExistingProcessName(script, opts),
    () => that._restartExistingProcessId(script, opts),
    () => that._restartExistingProcessPath(script, opts, app_conf)
  ];

  series(steps.map(fn => fn), (err, data) => {
    if (err instanceof Error) return cb ? cb(err) : that.exitCli(conf.ERROR_EXIT);
    const ret = data.reduce((acc, cur) => (cur !== undefined ? cur : acc), {});
    return cb ? cb(null, ret) : that.speedList();
  });
};

/**
 * Restart existing process by name if applicable.
 *
 * @private
 */
API.prototype._restartExistingProcessName = function(script, opts) {
  const that = this;
  return next => {
    if (!isNaN(script) ||
        (typeof script === 'string' && (script.includes('/') || path.extname(script)))) {
      return next(null);
    }

    if (script !== 'all') {
      that.Client.getProcessIdByName(script, (err, ids) => {
        if (err) return next(err);
        if (ids && ids.length) {
          that._operate('restartProcessId', script, opts, (err, list) => {
            if (err) return next(err);
            Common.printOut(conf.PREFIX_MSG + 'Process successfully started');
            return next(true, list);
          });
        } else {
          next(null);
        }
      });
    } else {
      that._operate('restartProcessId', 'all', (err, list) => {
        if (err) return next(err);
        Common.printOut(conf.PREFIX_MSG + 'Process successfully started');
        return next(true, list);
      });
    }
  };
};

/**
 * Restart existing process by id if applicable.
 *
 * @private
 */
API.prototype._restartExistingProcessId = function(script, opts) {
  const that = this;
  return next => {
    if (isNaN(script)) return next(null);
    that._operate('restartProcessId', script, opts, (err, list) => {
      if (err) return next(err);
      Common.printOut(conf.PREFIX_MSG + 'Process successfully started');
      return next(true, list);
    });
  };
};

/**
 * Restart existing process by full path or start new one.
 *
 * @private
 */
API.prototype._restartExistingProcessPath = function(script, opts, app_conf) {
  const that = this;
  return next => {
    that.Client.executeRemote('getMonitorData', {}, (err, procs) => {
      if (err) return next(err ? new Error(err) : err);
      const full_path = path.resolve(that.cwd, script);
      let managed_script = null;

      procs.forEach(proc => {
        if (proc.pm2_env.pm_exec_path === full_path && proc.pm2_env.name === app_conf.name) {
          managed_script = proc;
        }
      });

      if (managed_script &&
          [conf.STOPPED_STATUS, conf.STOPPING_STATUS, conf.ERRORED_STATUS].includes(managed_script.pm2_env.status)) {
        that._operate('restartProcessId', managed_script.pm2_env.name, opts, (err, list) => {
          if (err) return next(err);
          Common.printOut(conf.PREFIX_MSG + 'Process successfully started');
          return next(true, list);
        });
        return;
      }

      if (managed_script && !opts.force) {
        Common.printError(conf.PREFIX_MSG_ERR + 'Script already launched, add -f option to force re-execution');
        return next(new Error('Script already launched'));
      }

      let resolved_paths;
      try {
        resolved_paths = Common.resolveAppAttributes({ cwd: that.cwd, pm2_home: that.pm2_home }, app_conf);
      } catch (e) {
        Common.printError(e);
        return next(Common.retErr(e));
      }

      Common.printOut(conf.PREFIX_MSG + 'Starting %s in %s (%d instance' + (resolved_paths.instances > 1 ? 's' : '') + ')',
        resolved_paths.pm_exec_path, resolved_paths.exec_mode, resolved_paths.instances);

      resolved_paths.env = resolved_paths.env || {};
      resolved_paths.env.PM2_HOME = that.pm2_home;
      const additional_env = Modularizer.getAdditionalConf(resolved_paths.name);
      util._extend(resolved_paths.env, additional_env);
      resolved_paths.km_link = that.gl_is_km_linked;

      that.Client.executeRemote('prepare', resolved_paths, (err, data) => {
        if (err) {
          Common.printError(conf.PREFIX_MSG_ERR + 'Error while launching application', err.stack || err);
          return next(Common.retErr(err));
        }
        Common.printOut(conf.PREFIX_MSG + 'Done.');
        return next(true, data);
      });
    });
  };
};

/**
 * Private: start/restart/reload processes from a JSON file.
 *
 * @private
 */
API.prototype._startJson = function(file, opts, action, pipe, cb) {
  const that = this;
  let config = {};

  if (typeof cb === 'undefined' && typeof pipe === 'function') {
    cb = pipe;
  }

  if (typeof file === 'object') {
    config = file;
  } else if (pipe === 'pipe') {
    config = Common.parseConfig(file, 'pipe');
  } else {
    const isAbsolute = typeof path.isAbsolute === 'function' ? path.isAbsolute(file) : require('./tools/IsAbsolute.js')(file);
    const file_path = isAbsolute ? file : path.join(that.cwd, file);
    debug('Resolved filepath %s', file_path);
    try {
      const data = fs.readFileSync(file_path);
      config = Common.parseConfig(data, file);
    } catch (e) {
      Common.printError(conf.PREFIX_MSG_ERR + `File ${file} not found`);
      return cb ? cb(Common.retErr(e)) : that.exitCli(conf.ERROR_EXIT);
    }
  }

  const deployConf = config.deploy || {};
  const appConfRaw = config.apps || config.pm2 || config;
  const appConf = Array.isArray(appConfRaw) ? appConfRaw : [appConfRaw];
  const verify = Common.verifyConfs(appConf);
  if (verify instanceof Error) return cb ? cb(verify) : that.exitCli(conf.ERROR_EXIT);

  process.env.PM2_JSON_PROCESSING = true;
  const apps_name = [];
  const proc_list = {};

  appConf.forEach(app => {
    if (opts.only && opts.only !== app.name) return;
    if (!app.watch && opts.watch) app.watch = true;
    if (!app.ignore_watch && opts.ignore_watch) app.ignore_watch = opts.ignore_watch;
    if (opts.instances && typeof opts.instances === 'number') app.instances = opts.instances;
    if (opts.uid) app.uid = opts.uid;
    if (opts.gid) app.gid = opts.gid;
    if (app.append_env_to_name && opts.env) app.name += `-${opts.env}`;
    app.username = Common.getCurrentUsername();
    apps_name.push(app.name);
  });

  that.Client.executeRemote('getMonitorData', {}, (err, raw_proc_list) => {
    if (err) return cb ? cb(Common.retErr(err)) : that.exitCli(conf.ERROR_EXIT);

    raw_proc_list.forEach(proc => {
      proc_list[proc.name] = proc;
    });

    eachLimit(Object.keys(proc_list), conf.CONCURRENT_ACTIONS, (proc_name, next) => {
      if (!apps_name.includes(proc_name)) return next();

      if (!['reloadProcessId', 'softReloadProcessId', 'restartProcessId'].includes(action))
        return next(new Error('Wrong action called'));

      const apps = appConf.filter(app => app.name === proc_name);
      const envs = apps.map(app => Common.mergeEnvironmentVariables(app, opts.env, deployConf));
      const mergedEnv = envs.reduce((e1, e2) => util._extend(e1, e2), {});
      mergedEnv.updateEnv = true;

      that._operate(action, proc_name, mergedEnv, (err, ret) => {
        if (err) Common.printError(err);
        that.Client.notifyGod(action, proc_name);
        apps_name.splice(apps_name.indexOf(proc_name), 1);
        next();
      });
    }, err => {
      if (err) return cb ? cb(Common.retErr(err)) : that.exitCli(conf.ERROR_EXIT);
      if (apps_name.length && action !== 'start')
        Common.printOut(conf.PREFIX_MSG_WARNING + `Applications ${apps_name.join(', ')} not running, starting...`);
      that._startMissingApps(apps_name, appConf, opts, deployConf, cb);
    });
  });
};

/**
 * Start applications that were not already running.
 *
 * @private
 */
API.prototype._startMissingApps = function(apps_name, appConf, opts, deployConf, cb) {
  const that = this;
  const apps_to_start = appConf.filter(app => apps_name.includes(app.name));
  const apps_started = [];

  eachLimit(apps_to_start, conf.CONCURRENT_ACTIONS, (app, next) => {
    if (opts.cwd) app.cwd = opts.cwd;
    if (opts.force_name) app.name = opts.force_name;
    if (opts.started_as_module) app.pmx_module = true;

    if (app.script === 'serve') {
      app.script = path.resolve(__dirname, 'API', 'Serve.js');
    }

    let resolved_paths;
    try {
      resolved_paths = Common.resolveAppAttributes({ cwd: that.cwd, pm2_home: that.pm2_home }, app);
    } catch (e) {
      return next();
    }

    resolved_paths.env = resolved_paths.env || {};
    resolved_paths.env.PM2_HOME = that.pm2_home;
    const additional_env = Modularizer.getAdditionalConf(resolved_paths.name);
    util._extend(resolved_paths.env, additional_env);
    resolved_paths.env = Common.mergeEnvironmentVariables(resolved_paths, opts.env, deployConf);
    delete resolved_paths.env.current_conf;
    resolved_paths.km_link = that.gl_is_km_linked;

    that.Client.executeRemote('prepare', resolved_paths, (err, data) => {
      if (err) {
        Common.printError(conf.PREFIX_MSG_ERR + `Process failed to launch ${err.message || err}`);
        return next();
      }
      if (!data.length) {
        Common.printError(conf.PREFIX_MSG_ERR + 'Process config loading failed', data);
        return next();
      }
      Common.printOut(conf.PREFIX_MSG + `App [${data[0].pm2_env.name}] launched (${data.length} instances)`);
      apps_started.push(...data);
      next();
    });
  }, err => {
    return cb ? cb(err || null, apps_started) : that.speedList();
  });
};

/**
 * Apply a RPC method on the json file.
 *
 * @private
 */
API.prototype.actionFromJson = function(action, file, opts, jsonVia, cb) {
  const that = this;
  let appConf = {};

  if (typeof file === 'object') {
    appConf = file;
    cb = typeof jsonVia === 'function' ? jsonVia : cb;
  } else if (jsonVia === 'file') {
    try {
      const data = fs.readFileSync(file);
      appConf = Common.parseConfig(data, file);
    } catch (e) {
      Common.printError(conf.PREFIX_MSG_ERR + `File ${file} not found`);
      return cb ? cb(Common.retErr(e)) : that.exitCli(conf.ERROR_EXIT);
    }
  } else if (jsonVia === 'pipe') {
    appConf = Common.parseConfig(file, 'pipe');
  } else {
    Common.printError('Bad call to actionFromJson, jsonVia should be one of file, pipe');
    return that.exitCli(conf.ERROR_EXIT);
  }

  if (appConf.apps) appConf = appConf.apps;
  if (!Array.isArray(appConf)) appConf = [appConf];
  const verify = Common.verifyConfs(appConf);
  if (verify instanceof Error) return cb ? cb(verify) : that.exitCli(conf.ERROR_EXIT);

  eachLimit(appConf, conf.CONCURRENT_ACTIONS, (proc, next1) => {
    const name = proc.name || path.basename(proc.script);
    if (opts.only && opts.only !== name) return process.nextTick(next1);

    const new_env = opts && opts.env ? Common.mergeEnvironmentVariables(proc, opts.env) : Common.mergeEnvironmentVariables(proc);
    that.Client.getProcessIdByName(name, (err, ids) => {
      if (err) {
        Common.printError(err);
        return next1();
      }
      if (!ids) return next1();

      eachLimit(ids, conf.CONCURRENT_ACTIONS, (id, next2) => {
        const execOpts = action === 'restartProcessId' ? { id, env: new_env } : id;
        that.Client.executeRemote(action, execOpts, (err, res) => {
          if (err) Common.printError(err);
          else {
            if (action === 'restartProcessId') that.Client.notifyGod('restart', id);
            else if (action === 'deleteProcessId') that.Client.notifyGod('delete', id);
            else if (action === 'stopProcessId') that.Client.notifyGod('stop', id);
            Common.printOut(conf.PREFIX_MSG + `[%s](%d) \u2713`, name, id);
          }
          next2();
        });
      }, () => next1());
    });
  }, err => {
    if (cb) return cb(null, []);
    that.speedList();
  });
};

/**
 * Core operation handler.
 *
 * @private
 */
API.prototype._operate = function(action_name, process_name, envs, cb) {
  const that = this;
  let update_env = false;
  let ret = [];

  if (!envs) envs = {};
  if (typeof envs === 'function') {
    cb = envs;
    envs = {};
  }
  if (envs.updateEnv === true) update_env = true;
  const concurrent_actions = envs.parallel || conf.CONCURRENT_ACTIONS;

  if (!process.env.PM2_JSON_PROCESSING || envs.commands) {
    envs = that._handleAttributeUpdate(envs);
  }

  if (!envs.current_conf) {
    const _conf = fclone(envs);
    envs = { current_conf: _conf };
    envs.current_conf.km_link = that.gl_is_km_linked;
  }

  const processIds = (ids, cb) => {
    Common.printOut(conf.PREFIX_MSG + `Applying action ${action_name} on app [${process_name}](ids: ${ids})`);
    const limit = action_name === 'deleteProcessId' ? 10 : concurrent_actions;

    eachLimit(ids, limit, (id, next) => {
      let opts;
      if (['restartProcessId', 'reloadProcessId', 'softReloadProcessId'].includes(action_name)) {
        let new_env;
        if (update_env) {
          new_env = conf.PM2_PROGRAMMATIC ? Common.safeExtend({}, process.env) : util._extend({}, process.env);
          Object.assign(new_env, envs);
        } else {
          new_env = envs;
        }
        opts = { id, env: new_env };
      } else {
        opts = id;
      }

      that.Client.executeRemote(action_name, opts, (err, res) => {
        if (err) {
          Common.printError(conf.PREFIX_MSG_ERR + `Process ${id} not found`);
          return next('Process not found');
        }

        const notifyMap = {
          restartProcessId: 'restart',
          deleteProcessId: 'delete',
          stopProcessId: 'stop',
          reloadProcessId: 'reload',
          softReloadProcessId: 'graceful reload'
        };
        if (notifyMap[action_name]) that.Client.notifyGod(notifyMap[action_name], id);

        const results = Array.isArray(res) ? res : [res];
        results.forEach(proc => {
          if (!proc.pm2_env) return;
          Common.printOut(conf.PREFIX_MSG + `[%s](%d) \u2713`, proc.pm2_env.name, id);
          ret.push({
            name: proc.pm2_env.name,
            pm_id: proc.pm2_env.pm_id,
            status: proc.pm2_env.status,
            restart_time: proc.pm2_env.restart_time,
            pm2_env: {
              name: proc.pm2_env.name,
              pm_id: proc.pm2_env.pm_id,
              status: proc.pm2_env.status,
              restart_time: proc.pm2_env.restart_time,
              env: proc.pm2_env.env
            }
          });
        });
        next();
      });
    }, err => {
      if (err) return cb ? cb(Common.retErr(err)) : that.exitCli(conf.ERROR_EXIT);
      return cb ? cb(null, ret) : that.speedList();
    });
  };

  if (process_name === 'all') {
    that.Client.getAllProcessId((err, ids) => {
      if (err) return cb ? cb(Common.retErr(err)) : that.exitCli(conf.ERROR_EXIT);
      if (!ids || !ids.length) {
        Common.printError(conf.PREFIX_MSG_WARNING + 'No process found');
        return cb ? cb(new Error('process name not found')) : that.exitCli(conf.ERROR_EXIT);
      }
      processIds(ids, cb);
    });
  } else if (isNaN(process_name) && process_name.startsWith('/') && process_name.endsWith('/')) {
    const regex = new RegExp(process_name.slice(1, -1));
    that.Client.executeRemote('getMonitorData', {}, (err, list) => {
      if (err) return cb(err);
      const found = list.filter(proc => regex.test(proc.pm2_env.name)).map(p => p.pm_id);
      if (!found.length) {
        Common.printError(conf.PREFIX_MSG_WARNING + 'No process found');
        return cb ? cb(new Error('process name not found')) : that.exitCli(conf.ERROR_EXIT);
      }
      processIds(found, cb);
    });
  } else if (isNaN(process_name)) {
    const allow_module_restart = action_name === 'restartProcessId';
    that.Client.getProcessIdByName(process_name, allow_module_restart, (err, ids) => {
      if (err) return cb ? cb(Common.retErr(err)) : that.exitCli(conf.ERROR_EXIT);
      if (!ids || !ids.length) {
        Common.printError(conf.PREFIX_MSG_ERR + `Process ${process_name} not found`);
        return cb ? cb(new Error('process name not found')) : that.exitCli(conf.ERROR_EXIT);
      }
      const additional_env = Modularizer.getAdditionalConf(process_name);
      util._extend(envs, additional_env);
      processIds(ids, cb);
    });
  } else {
    that.Client.getProcessIdByName(process_name, (err, ids) => {
      if (ids && ids.length) return processIds(ids, cb);
      processIds([process_name], cb);
    });
  }
};

/**
 * Convert CamelCase Commander.js arguments to underscore.
 *
 * @private
 * @param {Object} opts
 * @returns {Object}
 */
API.prototype._handleAttributeUpdate = function(opts) {
  const conf = Config.transCMDToConf(opts);
  if (typeof conf.name !== 'string') delete conf.name;

  const argsIndex = opts.rawArgs?.indexOf('--') ?? -1;
  if (argsIndex >= 0) conf.args = opts.rawArgs.slice(argsIndex + 1);

  const appConf = Common.verifyConfs(conf)[0];
  if (appConf instanceof Error) {
    Common.printError('Error while transforming CamelCase args to underscore');
    return appConf;
  }

  if (argsIndex === -1) delete appConf.args;
  if (appConf.name === 'undefined') delete appConf.name;
  delete appConf.exec_mode;

  if (util.isArray(appConf.watch) && appConf.watch.length === 0 && !~opts.rawArgs?.indexOf('--watch')) {
    delete appConf.watch;
  }

  ['treekill', 'pmx', 'vizion', 'automation', 'autorestart'].forEach(flag => {
    if (appConf[flag] === true) delete appConf[flag];
  });

  return appConf;
};

/**
 * Retrieve process id by name.
 *
 * @param {string} name
 * @param {Function} cb
 */
API.prototype.getProcessIdByName = function(name, cb) {
  this.Client.getProcessIdByName(name, (err, id) => {
    if (err) {
      Common.printError(err);
      return cb ? cb(Common.retErr(err)) : this.exitCli(conf.ERROR_EXIT);
    }
    console.log(id);
    return cb ? cb(null, id) : this.exitCli(conf.SUCCESS_EXIT);
  });
};

/**
 * List processes in JSON format.
 *
 * @param {boolean} debug
 */
API.prototype.jlist = function(debug) {
  this.Client.executeRemote('getMonitorData', {}, (err, list) => {
    if (err) {
      Common.printError(err);
      return this.exitCli(conf.ERROR_EXIT);
    }
    if (debug) process.stdout.write(util.inspect(list, false, null, false));
    else process.stdout.write(JSON.stringify(list));
    this.exitCli(conf.SUCCESS_EXIT);
  });
};

let gl_retry = 0;

/**
 * Display a compact list of processes.
 *
 * @param {number} [code]
 */
API.prototype.speedList = function(code) {
  if (conf.PM2_PROGRAMMATIC && process.env.PM2_USAGE !== 'CLI') return false;

  this.Client.executeRemote('getMonitorData', (err, list) => {
    if (err) {
      if (gl_retry === 0) {
        gl_retry += 1;
        return setTimeout(this.speedList.bind(this), 1400);
      }
      console.error(`Error retrieving process list: ${err}.\nA process seems to be on infinite loop, retry in 5 seconds`);
      return this.exitCli(conf.ERROR_EXIT);
    }

    if (!process.stdout.isTTY) UX.miniDisplay(list);
    else if (commander.miniList && !commander.silent) UX.miniDisplay(list);
    else if (!commander.silent) {
      if (this.gl_interact_infos) {
        Common.printOut(chalk.green.bold('●') + ' Agent Online | Dashboard Access: ' + chalk.bold('https://app.keymetrics.io/#/r/%s') + ' | Server name: %s',
          this.gl_interact_infos.public_key, this.gl_interact_infos.machine_name);
      }
      UX.dispAsTable(list, commander);
      Common.printOut(chalk.white.italic(' Use `pm2 show <id|name>` to get more details about an app'));
    }

    if (this.Client.daemon_mode === false) {
      Common.printOut('[--no-daemon] Continue to stream logs');
      Common.printOut('[--no-daemon] Exit on target PM2 exit pid=' + fs.readFileSync(conf.PM2_PID_FILE_PATH).toString());
      global._auto_exit = true;
      return this.streamLogs('all', 0, false, 'HH:mm:ss', false);
    } else if (commander.attach === true) {
      return this.streamLogs('all', 0, false, null, false);
    } else {
      return this.exitCli(code || conf.SUCCESS_EXIT);
    }
  });
};

/**
 * Scale up/down a process.
 *
 * @param {string} app_name
 * @param {string|number} number
 * @param {Function} cb
 */
API.prototype.scale = function(app_name, number, cb) {
  const that = this;

  const addProcs = (proc, count, done) => {
    const loop = (n) => {
      if (n === 0) return done();
      Common.printOut(conf.PREFIX_MSG + 'Scaling up application');
      that.Client.executeRemote('duplicateProcessId', proc.pm2_env.pm_id, () => loop(n - 1));
    };
    loop(count);
  };

  const rmProcs = (procs, count, done) => {
    let i = 0;
    const loop = (n) => {
      if (n === 0) return done();
      that._operate('deleteProcessId', procs[i++].pm2_env.pm_id, {}, () => loop(n - 1));
    };
    loop(count);
  };

  const finish = () => cb ? cb(null, { success: true }) : that.speedList();

  that.Client.getProcessByName(app_name, (err, procs) => {
    if (err) return cb ? cb(Common.retErr(err)) : that.exitCli(conf.ERROR_EXIT);
    if (!procs || !procs.length) {
      Common.printError(conf.PREFIX_MSG_ERR + `Application ${app_name} not found`);
      return cb ? cb(new Error('App not found')) : that.exitCli(conf.ERROR_EXIT);
    }

    const current = procs.length;
    if (typeof number === 'string' && number.includes('+')) {
      return addProcs(procs[0], parseInt(number, 10), finish);
    }
    if (typeof number === 'string' && number.includes('-')) {
      return rmProcs(procs, parseInt(number, 10), finish);
    }

    const target = parseInt(number, 10) - current;
    if (target < 0) return rmProcs(procs, -target, finish);
    if (target > 0) return addProcs(procs[0], target, finish);
    Common.printError(conf.PREFIX_MSG_ERR + 'Nothing to do');
    return cb ? cb(new Error('Same process number')) : that.exitCli(conf.ERROR_EXIT);
  });
};

/**
 * Describe a process.
 *
 * @param {string|number} pm2_id
 * @param {Function} [cb]
 */
API.prototype.describe = function(pm2_id, cb) {
  const that = this;
  const found = [];

  this.Client.executeRemote('getMonitorData', {}, (err, list) => {
    if (err) {
      Common.printError(`Error retrieving process list: ${err}`);
      return that.exitCli(conf.ERROR_EXIT);
    }

    list.forEach(proc => {
      if ((!isNaN(pm2_id) && proc.pm_id == pm2_id) ||
          (typeof pm2_id === 'string' && proc.name == pm2_id)) {
        found.push(proc);
      }
    });

    if (!found.length) {
      Common.printError(conf.PREFIX_MSG_WARNING + `${pm2_id} doesn't exist`);
      return cb ? cb(null, []) : that.exitCli(conf.ERROR_EXIT);
    }

    if (!cb) found.forEach(proc => UX.describeTable(proc));
    return cb ? cb(null, found) : that.exitCli(conf.SUCCESS_EXIT);
  });
};

/**
 * Deep update of PM2.
 *
 * @param {Function} cb
 */
API.prototype.deepUpdate = function(cb) {
  Common.printOut(conf.PREFIX_MSG + 'Updating PM2...');
  const exec = require('shelljs').exec;
  const child = exec('npm i -g pm2@latest; pm2 update', { async: true });
  child.stdout.on('end', () => {
    Common.printOut(conf.PREFIX_MSG + 'PM2 successfully updated');
    cb ? cb(null, { success: true }) : this.exitCli(conf.SUCCESS_EXIT);
  });
};