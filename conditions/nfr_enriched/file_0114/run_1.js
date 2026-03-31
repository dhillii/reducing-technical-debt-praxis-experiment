```javascript
/**
 * Copyright 2013-2022 the PM2 project authors. All rights reserved.
 * Use of this source code is governed by a license that
 * can be found in the LICENSE file.
 */

const commander = require('commander');
const fs = require('fs');
const path = require('path');
const eachLimit = require('async/eachLimit');
const series = require('async/series');
const debug = require('debug')('pm2:cli');
const util = require('util');
const chalk = require('ansis');
const fclone = require('fclone');

const IMMUTABLE_MSG = chalk.bold.blue('Use --update-env to update environment variables');

/**
 * Main Function to be imported
 * can be aliased to PM2
 *
 * To use it when PM2 is installed as a module:
 *
 * var PM2 = require('pm2');
 *
 * var pm2 = PM2(<opts>);
 *
 *
 * @param {Object}  opts
 * @param {String}  [opts.cwd=<current>]         override pm2 cwd for starting scripts
 * @param {String}  [opts.pm2_home=[<paths.js>]] pm2 directory for log, pids, socket files
 * @param {Boolean} [opts.independent=false]     unique PM2 instance (random pm2_home)
 * @param {Boolean} [opts.daemon_mode=true]      should be called in the same process or not
 * @param {String}  [opts.public_key=null]       keymetrics bucket public key
 * @param {String}  [opts.secret_key=null]       keymetrics bucket secret key
 * @param {String}  [opts.machine_name=null]     keymetrics instance name
 */
const API = module.exports = function(opts) {
  opts = opts || {};
  const that = this;

  this.daemon_mode = typeof opts.daemon_mode === 'undefined' ? true : opts.daemon_mode;
  this.pm2_home = conf.PM2_ROOT_PATH;
  this.public_key = process.env.KEYMETRICS_SECRET || opts.public_key || null;
  this.secret_key = process.env.KEYMETRICS_PUBLIC || opts.secret_key || null;
  this.machine_name = process.env.INSTANCE_NAME || opts.machine_name || null;

  this._initializeCwd(opts);
  this._initializePm2Home(opts);
  this._setupWindowsCompat();
  this._initializeClient(that);
  this._initializeInteractor(that);
};

/**
 * Initialize current working directory
 * @private
 */
API.prototype._initializeCwd = function(opts) {
  this.cwd = process.cwd();
  if (opts.cwd) {
    this.cwd = path.resolve(opts.cwd);
  }
};

/**
 * Initialize PM2 home directory
 * @private
 */
API.prototype._initializePm2Home = function(opts) {
  if (opts.pm2_home && opts.independent === true) {
    throw new Error('You cannot set a pm2_home and independent instance in same time');
  }

  if (opts.pm2_home) {
    this.pm2_home = opts.pm2_home;
    conf = util._extend(conf, path_structure(this.pm2_home));
  } else if (opts.independent === true && conf.IS_WINDOWS === false) {
    this._setupIndependentInstance();
  }

  this._conf = conf;
};

/**
 * Setup independent PM2 instance
 * @private
 */
API.prototype._setupIndependentInstance = function() {
  const crypto = require('crypto');
  const random_file = crypto.randomBytes(8).toString('hex');
  this.pm2_home = path.join('/tmp', random_file);

  if (typeof this.daemon_mode === 'undefined') {
    this.daemon_mode = false;
  }
  conf = util._extend(conf, path_structure(this.pm2_home));
};

/**
 * Setup Windows compatibility
 * @private
 */
API.prototype._setupWindowsCompat = function() {
  if (conf.IS_WINDOWS && process.stdout._handle && process.stdout._handle.setBlocking) {
    process.stdout._handle.setBlocking(true);
  }
};

/**
 * Initialize PM2 client
 * @private
 */
API.prototype._initializeClient = function(that) {
  this.Client = new Client({
    pm2_home: that.pm2_home,
    conf: this._conf,
    secret_key: this.secret_key,
    public_key: this.public_key,
    daemon_mode: this.daemon_mode,
    machine_name: this.machine_name
  });
};

/**
 * Initialize interactor
 * @private
 */
API.prototype._initializeInteractor = function(that) {
  this.gl_interact_infos = null;
  this.gl_is_km_linked = this._checkKmLink();

  if (this.secret_key && process.env.NODE_ENV === 'local_test') {
    that.gl_is_km_linked = true;
  }

  KMDaemon.getInteractInfo(this._conf, function(i_err, interact) {
    that.gl_interact_infos = interact;
  });
};

/**
 * Check if KM is linked
 * @private
 * @return {Boolean}
 */
API.prototype._checkKmLink = function() {
  try {
    const pid = fs.readFileSync(conf.INTERACTOR_PID_PATH);
    const parsedPid = parseInt(pid.toString().trim());
    process.kill(parsedPid, 0);
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Connect to PM2
 * Calling this command is now optional
 *
 * @param {Function} cb callback once pm2 is ready for commands
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

  this.Client.start(function(err, meta) {
    if (err) return cb(err);

    if (meta.new_pm2_instance === false && that.daemon_mode === true) {
      return cb(err, meta);
    }

    Modularizer.launchAll(that, function(err_mod) {
      return cb(err, meta);
    });
  });
};

/**
 * Usefull when custom PM2 created with independent flag set to true
 * This will cleanup the newly created instance
 * by removing folder, killing PM2 and so on
 *
 * @param {Function} cb callback once cleanup is successfull
 */
API.prototype.destroy = function(cb) {
  const exec = require('shelljs').exec;
  const that = this;

  debug('Killing and deleting current deamon');

  this.killDaemon(function() {
    const cmd = 'rm -rf ' + that.pm2_home;
    const test_path = path.join(that.pm2_home, 'module_conf.json');

    if (that.pm2_home.indexOf('.pm2') > -1) {
      return cb(new Error('Destroy is not a allowed method on .pm2'));
    }

    that._checkAndDeletePath(test_path, cmd, cb);
  });
};

/**
 * Check and delete path
 * @private
 */
API.prototype._checkAndDeletePath = function(test_path, cmd, cb) {
  const that = this;

  if (fs.accessSync) {
    fs.access(test_path, fs.R_OK, function(err) {
      if (err) return cb(err);
      debug('Deleting temporary folder %s', that.pm2_home);
      require('shelljs').exec(cmd, cb);
    });
    return;
  }

  fs.exists(test_path, function(exist) {
    if (exist) {
      debug('Deleting temporary folder %s', that.pm2_home);
      require('shelljs').exec(cmd, cb);
    } else {
      cb(null);
    }
  });
};

/**
 * Disconnect from PM2 instance
 * This will allow your software to exit by itself
 *
 * @param {Function} [cb] optional callback once connection closed
 */
API.prototype.disconnect = API.prototype.close = function(cb) {
  const that = this;
  cb = cb || function() {};

  this.Client.close(function(err, data) {
    debug('The session lasted %ds', (new Date() - that.start_timer) / 1000);
    return cb(err, data);
  });
};

/**
 * Launch modules
 *
 * @param {Function} cb callback once pm2 has launched modules
 */
API.prototype.launchModules = function(cb) {
  Modularizer.launchAll(this, cb);
};

/**
 * Enable bus allowing to retrieve various process event
 * like logs, restarts, reloads
 *
 * @param {Function} cb callback called with 1st param err and 2nb param the bus
 */
API.prototype.launchBus = function(cb) {
  this.Client.launchBus(cb);
};

/**
 * Exit methods for API
 * @param {Integer} code exit code for terminal
 */
API.prototype.exitCli = function(code) {
  const that = this;

  if (conf.PM2_PROGRAMMATIC && process.env.PM2_USAGE !== 'CLI') return false;

  KMDaemon.disconnectRPC(function() {
    that.Client.close(function() {
      code = code || 0;
      that._drainStreamsAndExit(code);
    });
  });
};

/**
 * Drain streams and exit
 * @private
 */
API.prototype._drainStreamsAndExit = function(code) {
  const that = this;
  let fds = 0;

  const tryToExit = () => {
    if ((fds & 1) && (fds & 2)) {
      debug('This command took %ds to execute', (new Date() - that.start_timer) / 1000);
      process.exit(code);
    }
  };

  [process.stdout, process.stderr].forEach(function(std) {
    const fd = std.fd;
    if (!std.bufferSize) {
      fds = fds | fd;
    } else {
      std.write && std.write('', function() {
        fds = fds | fd;
        tryToExit();
      });
    }
    delete std.write;
  });
  tryToExit();
};

/**
 * Start a file or json with configuration
 * @param {Object||String} cmd script to start or json
 * @param {Function} cb called when application has been started
 */
API.prototype.start = function(cmd, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  opts = opts || {};

  const that = this;

  if (util.isArray(opts.watch) && opts.watch.length === 0) {
    opts.watch = (opts.rawArgs ? !!~opts.rawArgs.indexOf('--watch') : !!~process.argv.indexOf('--watch')) || false;
  }

  if (Common.isConfigFile(cmd) || typeof cmd === 'object') {
    that._startJson(cmd, opts, 'restartProcessId', cb);
  } else {
    that._startScript(cmd, opts, cb);
  }
};

/**
 * Reset process counters
 *
 * @method resetMetaProcess
 */
API.prototype.reset = function(process_name, cb) {
  const that = this;

  const processIds = (ids, cb) => {
    eachLimit(ids, conf.CONCURRENT_ACTIONS, function(id, next) {
      that.Client.executeRemote('resetMetaProcessId', id, function(err, res) {
        if (err) console.error(err);
        Common.printOut(conf.PREFIX_MSG + 'Resetting meta for process id %d', id);
        return next();
      });
    }, function(err) {
      if (err) return cb(Common.retErr(err));
      return cb ? cb(null, {success: true}) : that.speedList();
    });
  };

  if (process_name === 'all') {
    that.Client.getAllProcessId(function(err, ids) {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(conf.ERROR_EXIT);
      }
      return processIds(ids, cb);
    });
  } else if (isNaN(process_name)) {
    that.Client.getProcessIdByName(process_name, function(err, ids) {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(conf.ERROR_EXIT);
      }
      if (ids.length === 0) {
        Common.printError('Unknown process name');
        return cb ? cb(new Error('Unknown process name')) : that.exitCli(conf.ERROR_EXIT);
      }
      return processIds(ids, cb);
    });
  } else {
    processIds([process_name], cb);
  }
};

/**
 * Update daemonized PM2 Daemon
 *
 * @param {Function} cb callback when pm2 has been upgraded
 */
API.prototype.update = function(cb) {
  const that = this;

  Common.printOut('Be sure to have the latest version by doing `npm install pm2@latest -g` before doing this procedure.');

  that.Client.executeRemote('notifyKillPM2', {}, function() {});

  that.getVersion(function(err, new_version) {
    if (!that.gl_is_km_linked && !err && (pkg.version !== new_version)) {
      const dt = fs.readFileSync(path.join(__dirname, that._conf.KEYMETRICS_UPDATE));
      console.log(dt.toString());
    }

    that.dump(function(err) {
      debug('Dumping successfull', err);
      that.killDaemon(function() {
        debug('------------------ Everything killed', arguments);
        that.Client.launchDaemon({interactor: false}, function(err, child) {
          that.Client.launchRPC(function() {
            that.resurrect(function() {
              Common.printOut(chalk.blue.bold('>>>>>>>>>> PM2 updated'));
              Modularizer.launchAll(that, function() {
                KMDaemon.launchAndInteract(that._conf, null, function(err, data, interactor_proc) {
                  return cb ? cb(null, {success: true}) : that.speedList();
                });
              });
            });
          });
        });
      });
    });
  });

  return false;
};

/**
 * Reload an application
 *
 * @param {String} process_name Application Name or All
 * @param {Object} opts         Options
 * @param {Function} cb         Callback
 */
API.prototype.reload = function(process_name, opts, cb) {
  const that = this;

  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }

  const delay = Common.lockReload();

  if (delay > 0 && opts.force !== true) {
    Common.printError(conf.PREFIX_MSG_ERR + 'Reload already in progress