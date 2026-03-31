```javascript
/**
 * Copyright 2013-2022 the PM2 project authors. All rights reserved.
 * Use of this source code is governed by a license that
 * can be found in the LICENSE file.
 */

var commander = require('commander');
var fs = require('fs');
var path = require('path');
var eachLimit = require('async/eachLimit');
var series = require('async/series');
var debug = require('debug')('pm2:cli');
var util = require('util');
var chalk = require('ansis');
var fclone = require('fclone');

var IMMUTABLE_MSG = chalk.bold.blue('Use --update-env to update environment variables');

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
var API = module.exports = function(opts) {
  if (!opts) opts = {};
  var that = this;

  this.daemon_mode = typeof(opts.daemon_mode) == 'undefined' ? true : opts.daemon_mode;
  this.pm2_home = conf.PM2_ROOT_PATH;
  this.public_key = process.env.KEYMETRICS_SECRET || opts.public_key || null;
  this.secret_key = process.env.KEYMETRICS_PUBLIC || opts.secret_key || null;
  this.machine_name = process.env.INSTANCE_NAME || opts.machine_name || null;

  this._initializeCwd(opts);
  this._initializePm2Home(opts);
  this._setupClient();
  this._initializeInteractor();
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
  if (opts.pm2_home && opts.independent == true)
    throw new Error('You cannot set a pm2_home and independent instance in same time');

  if (opts.pm2_home) {
    this.pm2_home = opts.pm2_home;
    conf = util._extend(conf, path_structure(this.pm2_home));
  }
  else if (opts.independent == true && conf.IS_WINDOWS === false) {
    this._setupIndependentInstance(opts);
  }

  this._conf = conf;
};

/**
 * Setup independent PM2 instance
 * @private
 */
API.prototype._setupIndependentInstance = function(opts) {
  var crypto = require('crypto');
  var random_file = crypto.randomBytes(8).toString('hex');
  this.pm2_home = path.join('/tmp', random_file);

  if (typeof(opts.daemon_mode) == 'undefined')
    this.daemon_mode = false;

  conf = util._extend(conf, path_structure(this.pm2_home));
};

/**
 * Setup PM2 client
 * @private
 */
API.prototype._setupClient = function() {
  var that = this;

  if (conf.IS_WINDOWS && process.stdout._handle && process.stdout._handle.setBlocking)
    process.stdout._handle.setBlocking(true);

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
API.prototype._initializeInteractor = function() {
  var that = this;
  this.gl_interact_infos = null;
  this.gl_is_km_linked = false;

  try {
    var pid = fs.readFileSync(conf.INTERACTOR_PID_PATH);
    pid = parseInt(pid.toString().trim());
    process.kill(pid, 0);
    that.gl_is_km_linked = true;
  } catch(e) {
    that.gl_is_km_linked = false;
  }

  if (this.secret_key && process.env.NODE_ENV == 'local_test')
    that.gl_is_km_linked = true;

  KMDaemon.getInteractInfo(this._conf, function(i_err, interact) {
    that.gl_interact_infos = interact;
  });
};

/**
 * Connect to PM2
 * Calling this command is now optional
 *
 * @param {Function} cb callback once pm2 is ready for commands
 */
API.prototype.connect = function(noDaemon, cb) {
  var that = this;
  this.start_timer = new Date();

  if (typeof(cb) == 'undefined') {
    cb = noDaemon;
    noDaemon = false;
  } else if (noDaemon === true) {
    this.Client.daemon_mode = false;
    this.daemon_mode = false;
  }

  this.Client.start(function(err, meta) {
    if (err)
      return cb(err);

    if (meta.new_pm2_instance == false && that.daemon_mode === true)
      return cb(err, meta);

    Modularizer.launchAll(that, function(err_mod) {
      return cb(err, meta);
    });
  });
};

/**
 * Cleanup PM2 instance
 *
 * @param {Function} cb callback once cleanup is successful
 */
API.prototype.destroy = function(cb) {
  var exec = require('shelljs').exec;
  var that = this;

  debug('Killing and deleting current daemon');

  this.killDaemon(function() {
    var cmd = 'rm -rf ' + that.pm2_home;
    var test_path = path.join(that.pm2_home, 'module_conf.json');

    if (that.pm2_home.indexOf('.pm2') > -1)
      return cb(new Error('Destroy is not an allowed method on .pm2'));

    that._checkAndDeletePath(test_path, cmd, cb);
  });
};

/**
 * Check path accessibility and delete
 * @private
 */
API.prototype._checkAndDeletePath = function(test_path, cmd, cb) {
  var that = this;

  if (fs.accessSync) {
    fs.access(test_path, fs.R_OK, function(err) {
      if (err) return cb(err);
      debug('Deleting temporary folder %s', that.pm2_home);
      require('shelljs').exec(cmd, cb);
    });
    return false;
  }

  fs.exists(test_path, function(exist) {
    if (exist) {
      debug('Deleting temporary folder %s', that.pm2_home);
      require('shelljs').exec(cmd, cb);
    }
    return cb(null);
  });
};

/**
 * Disconnect from PM2 instance
 * This will allow your software to exit by itself
 *
 * @param {Function} [cb] optional callback once connection closed
 */
API.prototype.disconnect = API.prototype.close = function(cb) {
  var that = this;

  if (!cb) cb = function() {};

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
 * Enable bus allowing to retrieve various process events
 * like logs, restarts, reloads
 *
 * @param {Function} cb callback called with 1st param err and 2nd param the bus
 */
API.prototype.launchBus = function(cb) {
  this.Client.launchBus(cb);
};

/**
 * Exit methods for API
 * @param {Integer} code exit code for terminal
 */
API.prototype.exitCli = function(code) {
  var that = this;

  if (conf.PM2_PROGRAMMATIC && process.env.PM2_USAGE != 'CLI') return false;

  KMDaemon.disconnectRPC(function() {
    that.Client.close(function() {
      code = code || 0;
      that._drainStreamsAndExit(code);
    });
  });
};

/**
 * Drain streams and exit process
 * @private
 */
API.prototype._drainStreamsAndExit = function(code) {
  var that = this;
  var fds = 0;

  function tryToExit() {
    if ((fds & 1) && (fds & 2)) {
      debug('This command took %ds to execute', (new Date() - that.start_timer) / 1000);
      process.exit(code);
    }
  }

  [process.stdout, process.stderr].forEach(function(std) {
    var fd = std.fd;
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
  if (typeof(opts) == "function") {
    cb = opts;
    opts = {};
  }
  if (!opts)
    opts = {};

  var that = this;

  if (util.isArray(opts.watch) && opts.watch.length === 0)
    opts.watch = (opts.rawArgs ? !!~opts.rawArgs.indexOf('--watch') : !!~process.argv.indexOf('--watch')) || false;

  if (Common.isConfigFile(cmd) || (typeof(cmd) === 'object'))
    that._startJson(cmd, opts, 'restartProcessId', cb);
  else {
    that._startScript(cmd, opts, cb);
  }
};

/**
 * Reset process counters
 *
 * @method resetMetaProcess
 */
API.prototype.reset = function(process_name, cb) {
  var that = this;

  function processIds(ids, cb) {
    eachLimit(ids, conf.CONCURRENT_ACTIONS, function(id, next) {
      that.Client.executeRemote('resetMetaProcessId', id, function(err, res) {
        if (err) console.error(err);
        Common.printOut(conf.PREFIX_MSG + 'Resetting meta for process id %d', id);
        return next();
      });
    }, function(err) {
      if (err) return cb(Common.retErr(err));
      return cb ? cb(null, {success:true}) : that.speedList();
    });
  }

  if (process_name == 'all') {
    that.Client.getAllProcessId(function(err, ids) {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(conf.ERROR_EXIT);
      }
      return processIds(ids, cb);
    });
  }
  else if (isNaN(process_name)) {
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
  var that = this;

  Common.printOut('Be sure to have the latest version by doing `npm install pm2@latest -g` before doing this procedure.');

  that.Client.executeRemote('notifyKillPM2', {}, function() {});

  that.getVersion(function(err, new_version) {
    if (!that.gl_is_km_linked && !err && (pkg.version != new_version)) {
      var dt = fs.readFileSync(path.join(__dirname, that._conf.KEYMETRICS_UPDATE));
      console.log(dt.toString());
    }

    that.dump(function(err) {
      debug('Dumping successful', err);
      that.killDaemon(function() {
        debug('------------------ Everything killed', arguments);
        that._performUpdate(cb);
      });
    });
  });

  return false;
};

/**
 * Perform PM2 update
 * @private
 */
API.prototype._performUpdate = function(cb) {
  var that = this;

  this.Client.launchDaemon({interactor:false}, function(err, child) {
    that.Client.launchRPC(function() {
      that.resurrect(function() {
        Common.printOut(chalk.blue.bold('>>>>>>>>>> PM2 updated'));
        Modularizer.launchAll(that, function() {
          KMDaemon.launchAndInteract(that._conf, null, function(err, data, interactor_proc) {
            return cb ? cb(null, {success:true}) : that.speedList();
          });
        });
      });
    });
  });
};

/**
 * Reload an application
 *
 * @param {String} process_name Application Name or All
 * @param {Object} opts         Options
 * @param {Function} cb         Callback
 */
API.prototype.reload = function(process_name, opts, cb) {
  var that = this;

  if (typeof(opts) == "function") {
    cb = opts;
    opts = {};
  }

  var delay = Common.lockReload();

  if (delay > 0 && opts.force != true) {
    Common.printError(conf.PREFIX_MSG_ERR + 'Reload already in progress, please try again in ' + Math.floor((conf.RELOAD_LOCK_TIMEOUT - delay) / 1000) + ' seconds or use --force');
    return cb ? cb(new Error('Reload in progress')) : that.exitCli(conf.ERROR_EXIT);
  }