```javascript
/**
 * Copyright 2013-2022 the PM2 project authors. All rights reserved.
 * Use of this source code is governed by a license that
 * can be found in the LICENSE file.
 */

var commander   = require('commander');
var fs          = require('fs');
var path        = require('path');
var eachLimit       = require('async/eachLimit');
var series       = require('async/series');
var debug       = require('debug')('pm2:cli');
var util        = require('util');
var chalk       = require('ansis');
var fclone      = require('fclone');

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

  var conf = require('./conf');

  this.daemon_mode = typeof(opts.daemon_mode) == 'undefined' ? true : opts.daemon_mode;
  this.pm2_home    = conf.PM2_ROOT_PATH;
  this.public_key   = process.env.KEYMETRICS_SECRET || opts.public_key || null;
  this.secret_key   = process.env.KEYMETRICS_PUBLIC || opts.secret_key || null;
  this.machine_name = process.env.INSTANCE_NAME || opts.machine_name || null

  /**
   * CWD resolution
   */
  this.cwd         = process.cwd();
  if (opts.cwd) {
    this.cwd = path.resolve(opts.cwd);
  }

  /**
   * PM2 HOME resolution
   */
  this._initializePM2Home(opts, conf);

  this._conf = conf;

  this._setupWindowsStdout();

  this.Client = new Client({
    pm2_home : that.pm2_home,
    conf     : this._conf,
    secret_key : this.secret_key,
    public_key : this.public_key,
    daemon_mode : this.daemon_mode,
    machine_name : this.machine_name
  });

  this.gl_interact_infos = null;
  this.gl_is_km_linked = false;

  this._checkKMLink();

  // For testing purposes
  if (this.secret_key && process.env.NODE_ENV == 'local_test')
    that.gl_is_km_linked = true;

  KMDaemon.getInteractInfo(this._conf, function(i_err, interact) {
    that.gl_interact_infos = interact;
  });
};

/**
 * Initialize PM2 home directory configuration
 * @private
 */
API.prototype._initializePM2Home = function(opts, conf) {
  var path_structure = require('./path_structure');

  if (opts.pm2_home && opts.independent == true) {
    throw new Error('You cannot set a pm2_home and independent instance in same time');
  }

  if (opts.pm2_home) {
    this.pm2_home = opts.pm2_home;
    conf = util._extend(conf, path_structure(this.pm2_home));
    return;
  }

  this._initializeIndependentInstance(opts, conf, path_structure);
};

/**
 * Initialize independent PM2 instance
 * @private
 */
API.prototype._initializeIndependentInstance = function(opts, conf, path_structure) {
  if (opts.independent !== true || conf.IS_WINDOWS === true) {
    return;
  }

  var crypto = require('crypto');
  var random_file = crypto.randomBytes(8).toString('hex');
  this.pm2_home = path.join('/tmp', random_file);

  if (typeof(opts.daemon_mode) == 'undefined') {
    this.daemon_mode = false;
  }

  conf = util._extend(conf, path_structure(this.pm2_home));
};

/**
 * Setup Windows stdout handling
 * @private
 */
API.prototype._setupWindowsStdout = function() {
  if (!this._conf.IS_WINDOWS) {
    return;
  }

  if (process.stdout._handle && process.stdout._handle.setBlocking) {
    process.stdout._handle.setBlocking(true);
  }
};

/**
 * Check if KM is linked
 * @private
 */
API.prototype._checkKMLink = function() {
  var that = this;

  try {
    var pid = fs.readFileSync(this._conf.INTERACTOR_PID_PATH);
    pid = parseInt(pid.toString().trim());
    process.kill(pid, 0);
    that.gl_is_km_linked = true;
  } catch(e) {
    that.gl_is_km_linked = false;
  }
};

//////////////////////////
// Load all API methods //
//////////////////////////

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
    // Backward compatibility with PM2 1.x
    this.Client.daemon_mode = false;
    this.daemon_mode = false;
  }

  this.Client.start(function(err, meta) {
    if (err)
      return cb(err);

    if (meta.new_pm2_instance == false && that.daemon_mode === true)
      return cb(err, meta);

    // If new pm2 instance has been popped
    // Launch all modules
    Modularizer.launchAll(that, function(err_mod) {
      return cb(err, meta);
    });
  });
}

/**
 * Usefull when custom PM2 created with independent flag set to true
 * This will cleanup the newly created instance
 * by removing folder, killing PM2 and so on
 *
 * @param {Function} cb callback once cleanup is successfull
 */
API.prototype.destroy = function(cb) {
  var exec = require('shelljs').exec;
  var that = this;

  debug('Killing and deleting current deamon');

  this.killDaemon(function() {
    var cmd = 'rm -rf ' + that.pm2_home;
    var test_path = path.join(that.pm2_home, 'module_conf.json');
    var test_path_2 = path.join(that.pm2_home, 'pm2.pid');

    if (that.pm2_home.indexOf('.pm2') > -1)
      return cb(new Error('Destroy is not a allowed method on .pm2'));

    that._destroyWithAccessCheck(test_path, cmd, cb);
  });
};

/**
 * Destroy with access check
 * @private
 */
API.prototype._destroyWithAccessCheck = function(test_path, cmd, cb) {
  var that = this;
  var exec = require('shelljs').exec;

  if (fs.accessSync) {
    fs.access(test_path, fs.R_OK, function(err) {
      if (err) return cb(err);
      debug('Deleting temporary folder %s', that.pm2_home);
      exec(cmd, cb);
    });
    return false;
  }

  // Support for Node 0.10
  fs.exists(test_path, function(exist) {
    if (exist) {
      debug('Deleting temporary folder %s', that.pm2_home);
      exec(cmd, cb);
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
  var that = this;
  var conf = this._conf;

  // Do nothing if PM2 called programmatically (also in speedlist)
  if (conf.PM2_PROGRAMMATIC && process.env.PM2_USAGE != 'CLI') return false;

  KMDaemon.disconnectRPC(function() {
    that.Client.close(function() {
      code = code || 0;
      that._performSafeExit(code);
    });
  });
};

/**
 * Perform safe exit with stream draining
 * @private
 */
API.prototype._performSafeExit = function(code) {
  var that = this;
  var fds = 0;

  /**
   * Check if both stdout and stderr are drained
   */
  var tryToExit = function() {
    if ((fds & 1) && (fds & 2)) {
      debug('This command took %ds to execute', (new Date() - that.start_timer) / 1000);
      process.exit(code);
    }
  };

  [process.stdout, process.stderr].forEach(function(std) {
    var fd = std.fd;
    if (!std.bufferSize) {
      // bufferSize equals 0 means current stream is drained.
      fds = fds | fd;
    } else {
      // Appends nothing to the std queue, but will trigger `tryToExit` event on `drain`.
      std.write && std.write('', function() {
        fds = fds | fd;
        tryToExit();
      });
    }
    // Does not write anything more.
    delete std.write;
  });
  tryToExit();
};

////////////////////////////
// Application management //
////////////////////////////

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
  var conf = this._conf;

  /**
   * Process reset for given IDs
   */
  var processIds = function(ids, cb) {
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
  };

  if (process_name == 'all') {
    that._resetAllProcesses(processIds, cb);
  }
  else if (isNaN(process_name)) {
    that._resetProcessByName(process_name, processIds, cb);
  } else {
    processIds([process_name], cb);
  }
};

/**
 * Reset all processes
 * @private
 */
API.prototype._resetAllProcesses = function(processIds, cb) {
  var that = this;
  var conf = this._conf;

  that.Client.getAllProcessId(function(err, ids) {
    if (err) {
      Common.printError(err);
      return cb ? cb(Common.retErr(err)) : that.exitCli(conf.ERROR_EXIT);
    }
    return processIds(ids, cb);
  });
};

/**
 * Reset process by name
 * @private
 */
API.prototype._resetProcessByName = function(process_name, processIds, cb) {
  var that = this;
  var conf = this._conf;

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
};

/**
 * Update daemonized PM2 Daemon
 *
 * @param {Function} cb callback when pm2 has been upgraded
 */
API.prototype.update = function(cb) {
  var that = this;
  var conf = this._conf;

  Common.printOut('Be sure to have the latest version by doing `npm install pm2@latest -g` before doing this procedure.');

  // Dump PM2 processes
  that.Client.executeRemote('notifyKillPM2', {}, function() {});

  that.getVersion(function(err, new_version) {
    // If not linked to keymetrics, and update pm2 to latest, display motd.update
    if (!that.gl_is_km_linked && !err && (pkg.version != new_version)) {
      var dt = fs.readFileSync(path.join(__dirname, that._conf.KEYMETRICS_UPDATE));
      console.log(dt.toString());
    }

    that.dump(function(err) {
      debug('Dumping successfull', err);
      that.killDaemon(function() {
        debug('------------------ Everything killed', arguments);
        that.Client.launchDaemon({interactor:false}, function(err, child) {
          that.Client.launchRPC(function() {
            that.resurrect(function() {
              Common.printOut(chalk.blue.bold('>>>>>>>>>> PM2 updated'));
              Modularizer.launchAll(that, function() {
                KMDaemon.launchAndInteract(that._conf, null, function(err, data, interactor_proc) {
                  // Interactor error can be skipped here
                  return cb ? cb(null, {success:true}) : that.speedList();
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
  var that = this;
  var conf = this._conf;

  if (typeof(opts) == "function") {
    cb = opts;
    opts = {};
  }

  var delay = Common.lockReload();

  if (delay > 0 && opts.force != true) {
    Common.printError(conf.PREFIX_MSG_ERR + 'Reload already in progress, please try again in ' + Math.floor((conf.RELOAD_LOCK_TIMEOUT - delay) / 1000) + ' seconds or use --force');
    return cb ? cb(new Error('Reload in progress')) : that.exitCli(conf.ERROR_EXIT);
  }

  if (Common.isConfigFile(process_name)) {
    that._reloadFromJson(process_name, opts, cb);
  } else {
    that._reloadFromName(process_name, opts, cb);
  }
};

/**
 * Reload from JSON file
 * @private
 */
API.prototype._reloadFromJson = function(process_name, opts, cb) {
  var that = this;
  var conf = this._conf;

  that._startJson(process_name, opts, 'reloadProcessId', function(err, apps) {
    Common.unlockReload();
    if (err)
      return cb ? cb(err) : that.exitCli(conf.ERROR_EXIT);
    return cb ? cb(null, apps) : that.exitCli(conf.SUCCESS_EXIT);
  });
};

/**
 * Reload from process name
 * @private
 */
API.prototype._reloadFromName = function(process_name, opts, cb) {
  var that = this;
  var conf = this._conf;

  if (opts && !opts.updateEnv)
    Common.printOut(IMMUTABLE_MSG);

  that._operate('reloadProcessId', process_name, opts, function(err, apps) {
    Common.unlockReload();

    if (err)
      return cb ? cb(err) : that.exitCli(conf.ERROR_EXIT);
    return cb ? cb(null, apps) : that.exitCli(conf.SUCCESS_EXIT);
  });
};

/**
 * Restart process
 *
 * @param {String} cmd   Application Name / Process id / JSON application file / 'all'
 * @param {Object} opts  Extra options to be updated
 * @param {Function} cb  Callback
 */
API.prototype.restart = function(cmd, opts, cb) {
  if (typeof(opts) == "function") {
    cb = opts;
    opts = {};
  }
  var that = this;

  if (typeof(cmd) === 'number')
    cmd = cmd.toString();

  if (cmd == "-") {
    that._restartFromPipe(opts, cb);
  }
  else if (Common.isConfigFile(cmd) || typeof(cmd) === 'object')
    that._startJson(cmd, opts, 'restartProcessId', cb);
  else {
    that._restartFromName(cmd, opts, cb);
  }
};

/**
 * Restart from piped JSON
 * @private
 */
API.prototype._restartFromPipe = function(opts, cb) {
  var that = this;

  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', function (param) {
    process.stdin.pause();
    that.actionFromJson('restartProcessId', param, opts, 'pipe', cb);
  });
};

/**
 * Restart from process name
 * @private
 */
API.prototype._restartFromName = function(cmd, opts, cb) {
  var that = this;

  if (opts && !opts.updateEnv)
    Common.printOut(IMMUTABLE_MSG);
  that._operate('restartProcessId', cmd, opts, cb);
};

/**
 * Delete process
 *
 * @param {String} process_name Application Name / Process id / Application file / 'all'
 * @param {Function} cb Callback
 */
API.prototype.delete = function(process_name, jsonVia, cb) {
  var that = this;

  if (typeof(jsonVia) === "function") {
    cb = jsonVia;
    jsonVia = null;
  }
  if (typeof(process_name) === "number") {
    process_name = process_name.toString();
  }

  if (jsonVia == 'pipe')
    return that.actionFromJson('deleteProcessId', process_name, commander, 'pipe', cb);
  if (Common.isConfigFile(process_name))
    return that.actionFromJson('deleteProcessId', process_name, commander, 'file', cb);
  else
    that._operate('deleteProcessId', process_name, cb);
};

/**
 * Stop process
 *
 * @param {String} process_name Application Name / Process id / Application file / 'all'
 * @param {Function} cb Callback
 */
API.prototype.stop = function(process_name, cb) {
  var that = this;

  if (typeof(process_name) === 'number')
    process_name = process_name.toString();

  if (process_name == "-") {
    that._stopFromPipe(cb);
  }
  else if (Common.isConfigFile(process_name))
    that.actionFromJson('stopProcessId', process_name, commander, 'file', cb);
  else
    that._operate('stopProcessId', process_name, cb);
};

/**
 * Stop from piped JSON
 * @private
 */
API.prototype._stopFromPipe = function(cb) {
  var that = this;

  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', function (param) {
    process.stdin.pause();
    that.actionFromJson('stopProcessId', param, commander, 'pipe', cb);
  });
};

/**
 * Get list of all processes managed
 *
 * @param {Function} cb Callback
 */
API.prototype.list = function(opts, cb) {
  var that = this;
  var conf = this._conf;

  if (typeof(opts) == 'function') {
    cb = opts;
    opts = null;
  }

  that.Client.executeRemote('getMonitorData', {}, function(err, list) {
    if (err) {
      Common.printError(err);
      return cb ? cb(Common.retErr(err)) : that.exitCli(conf.ERROR_EXIT);
    }

    if (that._shouldWatchList(opts)) {
      that._watchList(opts);
      return false;
    }

    return cb ? cb(null, list) : that.speedList();
  });
};

/**
 * Check if list should be watched
 * @private
 */
API.prototype._shouldWatchList = function(opts) {
  return opts && opts.rawArgs && opts.rawArgs.indexOf('--watch') > -1;
};

/**
 * Watch list with interval refresh
 * @private
 */
API.prototype._watchList = function(opts) {
  var that = this;
  var moment = require('moment');

  var show = function() {
    process.stdout.write('\033[2J');
    process.stdout.write('\033[0f');
    console.log('Last refresh: ', moment().format('LTS'));
    that.Client.executeRemote('getMonitorData', {}, function(err, list) {
      UX.dispAsTable(list, null);
    });
  };

  show();
  setInterval(show, 900);
};

/**
 * Kill Daemon
 *
 * @param {Function} cb Callback
 */
API.prototype.killDaemon = API.prototype.kill = function(cb) {
  var that = this;
  var conf = this._conf;

  var semver = require('semver');
  Common.printOut(conf.PREFIX_MSG + 'Stopping PM2...');

  that.Client.executeRemote('notifyKillPM2', {}, function() {});

  that.killAllModules(function() {
    that._operate('deleteProcessId', 'all', function(err, list) {
      Common.printOut(conf.PREFIX_MSG + 'All processes have been stopped and deleted');
      process.env.PM2_SILENT = 'false';

      that.killInteract(function(err, data) {
        that.Client.killDaemon(function(err, res) {
          if (err) Common.printError(err);
          Common.printOut(conf.PREFIX_MSG + 'PM2 stopped');
          return cb ? cb(err, res) : that.exitCli(conf.SUCCESS_EXIT);
        });
      });
    });
  });
};

/////////////////////
// Private methods //
/////////////////////

/**
 * Method to START / RESTART a script
 *
 * @private
 * @param {string} script script name (will be resolved according to location)
 */
API.prototype._startScript = function(script, opts, cb) {
  if (typeof opts == "function") {
    cb = opts;
    opts = {};
  }
  var that = this;
  var conf = this._conf;

  var app_conf = Config.transCMDToConf(opts);
  var appConf = {};

  that._setExecMode(app_conf, opts);

  if (typeof app_conf.name == 'function'){
    delete app_conf.name;
  }

  delete app_conf.args;

  that._setScriptArgs(app_conf, opts);

  app_conf.script = script;

  if ((appConf = Common.verifyConfs(app_conf)) instanceof Error)
    return cb ? cb(Common.retErr(appConf)) : that.exitCli(conf.ERROR_EXIT);

  app_conf = appConf[0];

  app_conf.username = Common.getCurrentUsername();

  that._writeConfigIfNeeded(appConf, cb);

  series([
    that._restartExistingProcessName.bind(that, script, opts),
    that._restartExistingProcessId.bind(that, script, opts),
    that._restartExistingProcessPath.bind(that, script, app_conf, opts)
  ], function(err, data) {

    if (err instanceof Error)
      return cb ? cb(err) : that.exitCli(conf.ERROR_EXIT);

    var ret = {};
    data.forEach(function(_dt) {
      if (_dt !== undefined)
        ret = _dt;
    });

    return cb ? cb(null, ret) : that.speedList();
  });
};

/**
 * Set execution mode
 * @private
 */
API.prototype._setExecMode = function(app_conf, opts) {
  if (!!opts.executeCommand)
    app_conf.exec_mode = 'fork';
  else if (opts.instances !== undefined)
    app_conf.exec_mode = 'cluster';
  else
    app_conf.exec_mode = 'fork';
};

/**
 * Set script arguments
 * @private
 */
API.prototype._setScriptArgs = function(app_conf, opts) {
  var argsIndex;

  if (opts.rawArgs && (argsIndex = opts.rawArgs.indexOf('--')) >= 0) {
    app_conf.args = opts.rawArgs.slice(argsIndex + 1);
  }
  else if (opts.scriptArgs) {
    app_conf.args = opts.scriptArgs;
  }
};

/**
 * Write config if needed
 * @private
 */
API.prototype._writeConfigIfNeeded = function(appConf, cb) {
  var conf = this._conf;

  if (!appConf.write) {
    return;
  }

  var dst_path = path.join(process.env.PWD || process.cwd(), appConf.name + '-pm2.json');
  Common.printOut(conf.PREFIX_MSG + 'Writing configuration to', chalk.blue(dst_path));
  // pretty JSON
  try {
    fs.writeFileSync(dst_path, JSON.stringify(appConf, null, 2));
  } catch (e) {
    console.error(e.stack || e);
  }
};

/**
 * Restart existing process by name
 * @private
 */
API.prototype._restartExistingProcessName = function(script, opts, cb) {
  var that = this;
  var conf = this._conf;

  if (!that._isProcessNameCandidate(script)) {
    return cb(null);
  }

  if (script === 'all') {
    that._restartAllProcesses(opts, cb);
  } else {
    that._restartProcessByName(script, opts, cb);
  }
};

/**
 * Check if script is a process name candidate
 * @private
 */
API.prototype._isProcessNameCandidate = function(script) {
  if (!isNaN(script)) return false;
  if (typeof script === 'string' && script.indexOf('/') != -1) return false;
  if (typeof script === 'string' && path.extname(script) !== '') return false;
  return true;
};

/**
 * Restart all processes
 * @private
 */
API.prototype._restartAllProcesses = function(opts, cb) {
  var that = this;
  var conf = this._conf;

  that._operate('restartProcessId', 'all', opts, function(err, list) {
    if (err) return cb(err);
    Common.printOut(conf.PREFIX_MSG + 'Process successfully started');
    return cb(true, list);
  });
};

/**
 * Restart process by name
 * @private
 */
API.prototype._restartProcessByName = function(script, opts, cb) {
  var that = this;
  var conf = this._conf;

  that.Client.getProcessIdByName(script, function(err, ids) {
    if (err && cb) return cb(err);
    if (ids.length > 0) {
      that._operate('restartProcessId', script, opts, function(err, list) {
        if (err) return cb(err);
        Common.printOut(conf.PREFIX_MSG + 'Process successfully started');
        return cb(true, list);
      });
    }
    else return cb(null);
  });
};

/**
 * Restart existing process by ID
 * @private
 */
API.prototype._restartExistingProcessId = function(script, opts, cb) {
  var that = this;
  var conf = this._conf;

  if (isNaN(script)) return cb(null);

  that._operate('restartProcessId', script, opts, function(err, list) {
    if (err) return cb(err);
    Common.printOut(conf.PREFIX_MSG + 'Process successfully started');
    return cb(true, list);
  });
};

/**
 * Restart existing process by path
 * @private
 */
API.prototype._restartExistingProcessPath = function(script, app_conf, opts, cb) {
  var that = this;
  var conf = this._conf;

  that.Client.executeRemote('getMonitorData', {}, function(err, procs) {
    if (err) return cb ? cb(new Error(err)) : that.exitCli(conf.ERROR_EXIT);

    var managed_script = that._findManagedScript(procs, script, app_conf);

    if (that._shouldRestartManagedScript(managed_script, opts)) {
      that._performManagedScriptRestart(managed_script, opts, cb);
      return false;
    }

    if (managed_script && !opts.force) {
      Common.printError(conf.PREFIX_MSG_ERR + 'Script already launched, add -f option to force re-execution');
      return cb(new Error('Script already launched'));
    }

    that._launchNewScript(script, app_conf, opts, cb);
  });
};

/**
 * Find managed script in process list
 * @private
 */
API.prototype._findManagedScript = function(procs, script, app_conf) {
  var full_path = path.resolve(this.cwd, script);
  var managed_script = null;

  procs.forEach(function(proc) {
    if (proc.pm2_env.pm_exec_path == full_path &&
        proc.pm2_env.name == app_conf.name)
      managed_script = proc;
  });

  return managed_script;
};

/**
 * Check if managed script should be restarted
 * @private
 */
API.prototype._shouldRestartManagedScript = function(managed_script, opts) {
  if (!managed_script) return false;

  var conf = this._conf;
  var isStopped = managed_script.pm2_env.status == conf.STOPPED_STATUS;
  var isStopping = managed_script.pm2_env.status == conf.STOPPING_STATUS;
  var isErrored = managed_script.pm2_env.status == conf.ERRORED_STATUS;

  return isStopped || isStopping || isErrored;
};

/**
 * Perform managed script restart
 * @private
 */
API.prototype._performManagedScriptRestart = function(managed_script, opts, cb) {
  var that = this;
  var conf = this._conf;
  var app_name = managed_script.pm2_env.name;

  that._operate('restartProcessId', app_name, opts, function(err, list) {
    if (err) return cb ? cb(new Error(err)) : that.exitCli(conf.ERROR_EXIT);
    Common.printOut(conf.PREFIX_MSG + 'Process successfully started');
    return cb(true, list);
  });
};

/**
 * Launch new script
 * @private
 */
API.prototype._launchNewScript = function(script, app_conf, opts, cb) {
  var that = this;
  var conf = this._conf;

  var resolved_paths = null;

  try {
    resolved_paths = Common.resolveAppAttributes({
      cwd      : that.cwd,
      pm2_home : that.pm2_home
    }, app_conf);
  } catch(e) {
    Common.printError(e);
    return cb(Common.retErr(e));
  }

  Common.printOut(conf.PREFIX_MSG + 'Starting %s in %s (%d instance' + (resolved_paths.instances > 1 ? 's' : '') + ')',
                  resolved_paths.pm_exec_path, resolved_paths.exec_mode, resolved_paths.instances);

  if (!resolved_paths.env) resolved_paths.env = {};

  // Set PM2 HOME in case of child process using PM2 API
  resolved_paths.env['PM2_HOME'] = that.pm2_home;

  var additional_env = Modularizer.getAdditionalConf(resolved_paths.name);
  util._extend(resolved_paths.env, additional_env);

  // Is KM linked?
  resolved_paths.km_link = that.gl_is_km_linked;

  that.Client.executeRemote('prepare', resolved_paths, function(err, data) {
    if (err) {
      Common.printError(conf.PREFIX_MSG_ERR + 'Error while launching application', err.stack || err);
      return cb(Common.retErr(err));
    }

    Common.printOut(conf.PREFIX_MSG + 'Done.');
    return cb(true, data);
  });
};

/**
 * Method to start/restart/reload processes from a JSON file
 * It will start app not started
 * Can receive only option to skip applications
 *
 * @private
 */
API.prototype._startJson = function(file, opts, action, pipe, cb) {
  var config     = {};
  var appConf    = {};
  var deployConf = {};
  var apps_info  = [];
  var that = this;
  var conf = this._conf;

  if (typeof(cb) === 'undefined' && typeof(pipe) === 'function') {
    cb = pipe;
  }

  if (typeof(file) === 'object') {
    config = file;
  } else if (pipe === 'pipe') {
    config = Common.parseConfig(file, 'pipe');
  } else {
    that._loadJsonConfig(file, function(err, loadedConfig) {
      if (err) return cb ? cb(err) : that.exitCli(conf.ERROR_EXIT);
      config = loadedConfig;
      that._processJsonConfig(config, appConf, deployConf, apps_info, opts, action, cb);
    });
    return;
  }

  that._processJsonConfig(config, appConf, deployConf, apps_info, opts, action, cb);
};

/**
 * Load JSON configuration file
 * @private
 */
API.prototype._loadJsonConfig = function(file, callback) {
  var that = this;
  var conf = this._conf;
  var data = null;

  var isAbsolute = that._resolveAbsolutePath(file);
  var file_path = isAbsolute ? file : path.join(that.cwd, file);

  debug('Resolved filepath %s', file_path);

  try {
    data = fs.readFileSync(file_path);
  } catch(e) {
    Common.printError(conf.PREFIX_MSG_ERR + 'File ' + file +' not found');
    return callback(Common.retErr(e));
  }

  try {
    var config = Common.parseConfig(data, file);
    callback(null, config);
  } catch(e) {
    Common.printError(conf.PREFIX_MSG_ERR + 'File ' + file + ' malformated');
    console.error(e);
    callback(Common.retErr(e));
  }
};

/**
 * Resolve absolute path
 * @private
 */
API.prototype._resolveAbsolutePath = function(file) {
  if (typeof path.isAbsolute === 'function') {
    return path.isAbsolute(file);
  } else {
    return require('./tools/IsAbsolute.js')(file);
  }
};

/**
 * Process JSON configuration
 * @private
 */
API.prototype._processJsonConfig = function(config, appConf, deployConf, apps_info, opts, action, cb) {
  var that = this;
  var conf = this._conf;

  if (config.deploy)
    deployConf = config.deploy;

  if (config.apps)
    appConf = config.apps;
  else if (config.pm2)
    appConf = config.pm2;
  else
    appConf = config;

  if (!Array.isArray(appConf))
    appConf = [appConf];

  if ((appConf = Common.verifyConfs(appConf)) instanceof Error)
    return cb ? cb(appConf) : that.exitCli(conf.ERROR_EXIT);

  process.env.PM2_JSON_PROCESSING = true;

  that._executeJsonAction(appConf, deployConf, apps_info, opts, action, cb);
};

/**
 * Execute JSON action
 * @private
 */
API.prototype._executeJsonAction = function(appConf, deployConf, apps_info, opts, action, cb) {
  var that = this;
  var conf = this._conf;

  var apps_name = [];
  var proc_list = {};

  that._prepareAppsList(appConf, opts, apps_name);

  that.Client.executeRemote('getMonitorData', {}, function(err, raw_proc_list) {
    if (err) {
      Common.printError(err);
      return cb ? cb(Common.retErr(err)) : that.exitCli(conf.ERROR_EXIT);
    }

    raw_proc_list.forEach(function(proc) {
      proc_list[proc.name] = proc;
    });

    that._processExistingApps(Object.keys(proc_list), appConf, deployConf, apps_info, opts, action, apps_name, function(err) {
      if (err) return cb ? cb(Common.retErr(err)) : that.exitCli(conf.ERROR_EXIT);
      if (apps_name.length > 0 && action != 'start')
        Common.printOut(conf.PREFIX_MSG_WARNING + 'Applications %s not running, starting...', apps_name.join(', '));
      
      that._startMissingApps(appConf, deployConf, apps_info, opts, apps_name, function(err, apps) {
        apps_info = apps_info.concat(apps);
        return cb ? cb(err, apps_info) : that.speedList(err ? 1 : 0);
      });
    });
  });
};

/**
 * Prepare apps list
 * @private
 */
API.prototype._prepareAppsList = function(appConf, opts, apps_name) {
  appConf.forEach(function(app) {
    if (opts.only && opts.only != app.name)
      return false;
    if (!app.watch && opts.watch && opts.watch === true)
      app.watch = true;
    if (!app.ignore_watch && opts.ignore_watch)
      app.ignore_watch = opts.ignore_watch;
    if (opts.instances && typeof(opts.instances) === 'number')
      app.instances = opts.instances;
    if (opts.uid)
      app.uid = opts.uid;
    if (opts.gid)
      app.gid = opts.gid;
    if (app.append_env_to_name && opts.env)
      app.name += ('-' + opts.env);
    app.username = Common.getCurrentUsername();
    apps_name.push(app.name);
  });
};

/**
 * Process existing apps
 * @private
 */
API.prototype._processExistingApps = function(proc_names, appConf, deployConf, apps_info, opts, action, apps_name, callback) {
  var that = this;
  var conf = this._conf;

  eachLimit(proc_names, conf.CONCURRENT_ACTIONS, function(proc_name, next) {
    if (apps_name.indexOf(proc_name) == -1)
      return next();

    if (!that._isValidAction(action))
      throw new Error('Wrong action called');

    var apps = appConf.filter(function(app) {
      return app.name == proc_name;
    });

    var envs = apps.map(function(app){
      return Common.mergeEnvironmentVariables(app, opts.env, deployConf);
    });

    var env = envs.reduce(function(e1, e2){
      return util._extend(e1, e2);
    });

    env.updateEnv = true;

    that._operate(action, proc_name, env, function(err, ret) {
      if (err) Common.printError(err);

      apps_info = apps_info.concat(ret);

      that.Client.notifyGod(action, proc_name);
      apps_name.splice(apps_name.indexOf(proc_name), 1);
      return next();
    });

  }, callback);
};

/**
 * Check if action is valid
 * @private
 */
API.prototype._isValidAction = function(action) {
  return action == 'reloadProcessId' ||
         action == 'softReloadProcessId' ||
         action == 'restartProcessId';
};

/**
 * Start missing apps
 * @private
 */
API.prototype._startMissingApps = function(appConf, deployConf, apps_info, opts, app_name_to_start, cb) {
  var that = this;
  var conf = this._conf;
  var apps_to_start = [];
  var apps_started = [];

  appConf.forEach(function(app, i) {
    if (app_name_to_start.indexOf(app.name) != -1) {
      apps_to_start.push(appConf[i]);
    }
  });

  eachLimit(apps_to_start, conf.CONCURRENT_ACTIONS, function(app, next) {
    that._prepareAppForStart(app, opts);

    var resolved_paths = null;

    try {
      resolved_paths = Common.resolveAppAttributes({
        cwd      : that.cwd,
        pm2_home : that.pm2_home
      }, app);
    } catch (e) {
      return next();
    }

    if (!resolved_paths.env) resolved_paths.env = {};

    resolved_paths.env['PM2_HOME'] = that.pm2_home;

    var additional_env = Modularizer.getAdditionalConf(resolved_paths.name);
    util._extend(resolved_paths.env, additional_env);

    resolved_paths.env = Common.mergeEnvironmentVariables(resolved_paths, opts.env, deployConf);

    delete resolved_paths.env.current_conf;

    resolved_paths.km_link = that.gl_is_km_linked;

    that.Client.executeRemote('prepare', resolved_paths, function(err, data) {
      if (err) {
        Common.printError(conf.PREFIX_MSG_ERR + 'Process failed to launch %s', err.message ? err.message : err);
        return next();
      }
      if (data.length === 0) {
        Common.printError(conf.PREFIX_MSG_ERR + 'Process config loading failed', data);
        return next();
      }

      Common.printOut(conf.PREFIX_MSG + 'App [%s] launched (%d instances)', data[0].pm2_env.name, data.length);
      apps_started = apps_started.concat(data);
      next();
    });

  }, function(err) {
    return cb ? cb(err || null, apps_started) : that.speedList();
  });
};

/**
 * Prepare app for start
 * @private
 */
API.prototype._prepareAppForStart = function(app, opts) {
  if (opts.cwd)
    app.cwd = opts.cwd;
  if (opts.force_name)
    app.name = opts.force_name;
  if (opts.started_as_module)
    app.pmx_module = true;

  if (app.script === 'serve') {
    app.script = path.resolve(__dirname, 'API', 'Serve.js');
  }
};

/**
 * Apply a RPC method on the json file
 * @private
 * @method actionFromJson
 * @param {string} action RPC Method
 * @param {object} options
 * @param {string|object} file file
 * @param {string} jsonVia action type (=only 'pipe' ?)
 * @param {Function}
 */
API.prototype.actionFromJson = function(action, file, opts, jsonVia, cb) {
  var appConf = {};
  var ret_processes = [];
  var that = this;
  var conf = this._conf;

  if (typeof file == 'object') {
    cb = typeof jsonVia == 'function' ? jsonVia : cb;
    appConf = file;
  }
  else if (jsonVia == 'file') {
    that._loadActionJsonFile(file, function(err, config) {
      if (err) return cb ? cb(err) : that.exitCli(conf.ERROR_EXIT);
      appConf = config;
      that._executeActionFromJson(action, appConf, opts, ret_processes, cb);
    });
    return;
  } else if (jsonVia == 'pipe') {
    appConf = Common.parseConfig(file, 'pipe');
  } else {
    Common.printError('Bad call to actionFromJson, jsonVia should be one of file, pipe');
    return that.exitCli(conf.ERROR_EXIT);
  }

  that._executeActionFromJson(action, appConf, opts, ret_processes, cb);
};

/**
 * Load action JSON file
 * @private
 */
API.prototype._loadActionJsonFile = function(file, callback) {
  var that = this;
  var conf = this._conf;

  try {
    var data = fs.readFileSync(file);
    var appConf = Common.parseConfig(data, file);
    callback(null, appConf);
  } catch(e) {
    if (e.code === 'ENOENT') {
      Common.printError(conf.PREFIX_MSG_ERR + 'File ' + file +' not found');
    } else {
      Common.printError(conf.PREFIX_MSG_ERR + 'File ' + file + ' malformated');
      console.error(e);
    }
    callback(Common.retErr(e));
  }
};

/**
 * Execute action from JSON
 * @private
 */
API.prototype._executeActionFromJson = function(action, appConf, opts, ret_processes, cb) {
  var that = this;
  var conf = this._conf;

  if (appConf.apps)
    appConf = appConf.apps;

  if (!Array.isArray(appConf))
    appConf = [appConf];

  if ((appConf = Common.verifyConfs(appConf)) instanceof Error)
    return cb ? cb(appConf) : that.exitCli(conf.ERROR_EXIT);

  eachLimit(appConf, conf.CONCURRENT_ACTIONS, function(proc, next1) {
    var name = proc.name || path.basename(proc.script);

    if (opts.only && opts.only != name)
      return process.nextTick(next1);

    var new_env = opts && opts.env 
      ? Common.mergeEnvironmentVariables(proc, opts.env)
      : Common.mergeEnvironmentVariables(proc);

    that.Client.getProcessIdByName(name, function(err, ids) {
      if (err) {
        Common.printError(err);
        return next1();
      }
      if (!ids) return next1();

      that._executeActionOnIds(action, ids, name, new_env, ret_processes, function() {
        return next1(null, ret_processes);
      });
    });
  }, function(err) {
    if (cb) return cb(null, ret_processes);
    else return that.speedList();
  });
};

/**
 * Execute action on process IDs
 * @private
 */
API.prototype._executeActionOnIds = function(action, ids, name, new_env, ret_processes, callback) {
  var that = this;
  var conf = this._conf;

  eachLimit(ids, conf.CONCURRENT_ACTIONS, function(id, next2) {
    var opts = that._buildActionOptions(action, id, new_env);

    that.Client.executeRemote(action, opts, function(err, res) {
      ret_processes.push(res);
      if (err) {
        Common.printError(err);
        return next2();
      }

      that._notifyGodOfAction(action, id);

      Common.printOut(conf.PREFIX_MSG + '[%s](%d) \u2713', name, id);
      return next2();
    });
  }, callback);
};

/**
 * Build action options
 * @private
 */
API.prototype._buildActionOptions = function(action, id, new_env) {
  if (action == 'restartProcessId') {
    return {id : id, env : new_env};
  } else {
    return id;
  }
};

/**
 * Notify god of action
 * @private
 */
API.prototype._notifyGodOfAction = function(action, id) {
  var that = this;

  if (action == 'restartProcessId') {
    that.Client.notifyGod('restart', id);
  } else if (action == 'deleteProcessId') {
    that.Client.notifyGod('delete', id);
  } else if (action == 'stopProcessId') {
    that.Client.notifyGod('stop', id);
  }
};

/**
 * Main function to operate with PM2 daemon
 *
 * @param {String} action_name  Name of action (restartProcessId, deleteProcessId, stopProcessId)
 * @param {String} process_name can be 'all', a id integer or process name
 * @param {Object} envs         object with CLI options / environment
 */
API.prototype._operate = function(action_name, process_name, envs, cb) {
  var that = this;
  var conf = this._conf;
  var update_env = false;
  var ret = [];

  if (!envs)
    envs = {};

  if (typeof(envs) == 'function'){
    cb = envs;
    envs = {};
  }

  if (envs.updateEnv === true)
    update_env = true;

  var concurrent_actions = envs.parallel || conf.CONCURRENT_ACTIONS;

  if (!process.env.PM2_JSON_PROCESSING || envs.commands) {
    envs = that._handleAttributeUpdate(envs);
  }

  if (!envs.current_conf) {
    var _conf = fclone(envs);
    envs = {
      current_conf : _conf
    }

    envs.current_conf.km_link = that.gl_is_km_linked;
  }

  that._routeOperateAction(action_name, process_name, envs, update_env, concurrent_actions, ret, cb);
};

/**
 * Route operate action to appropriate handler
 * @private
 */
API.prototype._routeOperateAction = function(action_name, process_name, envs, update_env, concurrent_actions, ret, cb) {
  var that = this;

  if (process_name == 'all') {
    that._operateOnAll(action_name, process_name, envs, update_env, concurrent_actions, ret, cb);
  }
  else if (that._isRegexPattern(process_name)) {
    that._operateOnRegex(action_name, process_name, envs, update_env, concurrent_actions, ret, cb);
  }
  else if (isNaN(process_name)) {
    that._operateOnName(action_name, process_name, envs, update_env, concurrent_actions, ret, cb);
  } else {
    that._operateOnId(action_name, process_name, envs, update_env, concurrent_actions, ret, cb);
  }
};

/**
 * Check if process name is regex pattern
 * @private
 */
API.prototype._isRegexPattern = function(process_name) {
  return !isNaN(process_name) === false && 
         process_name[0] === '/' && 
         process_name[process_name.length - 1] === '/';
};

/**
 * Operate on all processes
 * @private
 */
API.prototype._operateOnAll = function(action_name, process_name, envs, update_env, concurrent_actions, ret, cb) {
  var that = this;
  var conf = this._conf;

  that.Client.getAllProcessId(function(err, ids) {
    if (err) {
      Common.printError(err);
      return cb ? cb(Common.retErr(err)) : that.exitCli(conf.ERROR_EXIT);
    }
    if (!ids || ids.length === 0) {
      Common.printError(conf.PREFIX_MSG_WARNING + 'No process found');
      return cb ? cb(new Error('process name not found')) : that.exitCli(conf.ERROR_EXIT);
    }

    that._processIds(action_name, process_name, ids, envs, update_env, concurrent_actions, ret, cb);
  });
};

/**
 * Operate on regex pattern
 * @private
 */
API.prototype._operateOnRegex = function(action_name, process_name, envs, update_env, concurrent_actions, ret, cb) {
  var that = this;
  var conf = this._conf;
  var regex = new RegExp(process_name.replace(/\//g, ''));

  that.Client.executeRemote('getMonitorData', {}, function(err, list) {
    if (err) {
      Common.printError('Error retrieving process list: ' + err);
      return cb(err);
    }
    var found_proc = [];
    list.forEach(function(proc) {
      if (regex.test(proc.pm2_env.name)) {
        found_proc.push(proc.pm_id);
      }
    });

    if (found_proc.length === 0) {
      Common.printError(conf.PREFIX_MSG_WARNING + 'No process found');
      return cb ? cb(new Error('process name not found')) : that.exitCli(conf.ERROR_EXIT);
    }

    that._processIds(action_name, process_name, found_proc, envs, update_env, concurrent_actions, ret, cb);
  });
};

/**
 * Operate on process name
 * @private
 */
API.prototype._operateOnName = function(action_name, process_name, envs, update_env, concurrent_actions, ret, cb) {
  var that = this;
  var conf = this._conf;

  var allow_module_restart = action_name == 'restartProcessId' ? true : false;

  that.Client.getProcessIdByName(process_name, allow_module_restart, function(err, ids) {
    if (err) {
      Common.printError(err);
      return cb ? cb(Common.retErr(err)) : that.exitCli(conf.ERROR_EXIT);
    }
    if (!ids || ids.length === 0) {
      Common.printError(conf.PREFIX_MSG_ERR + 'Process %s not found', process_name);
      return cb ? cb(new Error('process name not found')) : that.exitCli(conf.ERROR_EXIT);
    }

    var additional_env = Modularizer.getAdditionalConf(process_name);
    util._extend(envs, additional_env);

    that._processIds(action_name, process_name, ids, envs, update_env, concurrent_actions, ret, cb);
  });
};

/**
 * Operate on process ID
 * @private
 */
API.prototype._operateOnId = function(action_name, process_name, envs, update_env, concurrent_actions, ret, cb) {
  var that = this;

  that.Client.getProcessIdByName(process_name, function(err, ids) {
    if (ids.length > 0)
      return that._processIds(action_name, process_name, ids, envs, update_env, concurrent_actions, ret, cb);
    return that._processIds(action_name, process_name, [process_name], envs, update_env, concurrent_actions, ret, cb);
  });
};

/**
 * Process IDs with action
 * @private
 */
API.prototype._processIds = function(action_name, process_name, ids, envs, update_env, concurrent_actions, ret, cb) {
  var that = this;
  var conf = this._conf;

  Common.printOut(conf.PREFIX_MSG + 'Applying action %s on app [%s](ids: %s)', action_name, process_name, ids);

  if (action_name == 'deleteProcessId')
    concurrent_actions = 10;

  eachLimit(ids, concurrent_actions, function(id, next) {
    var opts = that._buildProcessOptions(action_name, id, envs, update_env);

    that.Client.executeRemote(action_name, opts, function(err, res) {
      if (err) {
        Common.printError(conf.PREFIX_MSG_ERR + 'Process %s not found', id);
        return next('Process not found');
      }

      that._notifyGodOfProcessAction(action_name, id);

      if (!Array.isArray(res))
        res = [res];

      res.forEach(function(proc) {
        Common.printOut(conf.PREFIX_MSG + '[%s](%d) \u2713', proc.pm2_env ? proc.pm2_env.name : process_name, id);

        if (!proc.pm2_env) return false;

        ret.push({
          name         : proc.pm2_env.name,
          pm_id        : proc.pm2_env.pm_id,
          status       : proc.pm2_env.status,
          restart_time : proc.pm2_env.restart_time,
          pm2_env : {
            name         : proc.pm2_env.name,
            pm_id        : proc.pm2_env.pm_id,
            status       : proc.pm2_env.status,
            restart_time : proc.pm2_env.restart_time,
            env          : proc.pm2_env.env
          }
        });
      });

      return next();
    });
  }, function(err) {
    if (err) return cb ? cb(Common.retErr(err)) : that.exitCli(conf.ERROR_EXIT);
    return cb ? cb(null, ret) : that.speedList();
  });
};

/**
 * Build process options
 * @private
 */
API.prototype._buildProcessOptions = function(action_name, id, envs, update_env) {
  var conf = this._conf;

  if (action_name == 'restartProcessId' ||
      action_name == 'reloadProcessId' ||
      action_name == 'softReloadProcessId') {
    var new_env = {};

    if (update_env === true) {
      if (conf.PM2_PROGRAMMATIC == true)
        new_env = Common.safeExtend({}, process.env);
      else
        new_env = util._extend({}, process.env);

      Object.keys(envs).forEach(function(k) {
        new_env[k] = envs[k];
      });
    }
    else {
      new_env = envs;
    }

    return {
      id  : id,
      env : new_env
    };
  }
  else {
    return id;
  }
};

/**
 * Notify god of process action
 * @private
 */
API.prototype._notifyGodOfProcessAction = function(action_name, id) {
  var that = this;

  if (action_name == 'restartProcessId') {
    that.Client.notifyGod('restart', id);
  } else if (action_name == 'deleteProcessId') {
    that.Client.notifyGod('delete', id);
  } else if (action_name == 'stopProcessId') {
    that.Client.notifyGod('stop', id);
  } else if (action_name == 'reloadProcessId') {
    that.Client.notifyGod('reload', id);
  } else if (action_name == 'softReloadProcessId') {
    that.Client.notifyGod('graceful reload', id);
  }
};

/**
 * Converts CamelCase Commander.js arguments
 * to Underscore
 * (nodeArgs -> node_args)
 */
API.prototype._handleAttributeUpdate = function(opts) {
  var conf = Config.transCMDToConf(opts);
  var that = this;

  if (typeof(conf.name) != 'string')
    delete conf.name;

  var argsIndex = 0;
  if (opts.rawArgs && (argsIndex = opts.rawArgs.indexOf('--')) >= 0) {
    conf.args = opts.rawArgs.slice(argsIndex + 1);
  }

  var appConf = Common.verifyConfs(conf)[0];

  if (appConf instanceof Error) {
    Common.printError('Error while transforming CamelCase args to underscore');
    return appConf;
  }

  if (argsIndex == -1)
    delete appConf.args;
  if (appConf.name == 'undefined')
    delete appConf.name;

  delete appConf.exec_mode;

  if (util.isArray(appConf.watch) && appConf.watch.length === 0) {
    if (!~opts.rawArgs.indexOf('--watch'))
      delete appConf.watch
  }

  that._deleteDefaultValues(appConf);

  return appConf;
};

/**
 * Delete default values from app config
 * @private
 */
API.prototype._deleteDefaultValues = function(appConf) {
  if (appConf.treekill === true)
    delete appConf.treekill;
  if (appConf.pmx === true)
    delete appConf.pmx;
  if (appConf.vizion === true)
    delete appConf.vizion;
  if (appConf.automation === true)
    delete appConf.automation;
  if (appConf.autorestart === true)
    delete appConf.autorestart;
};

API.prototype.getProcessIdByName = function(name, cb) {
  var that = this;
  var conf = this._conf;

  this.Client.getProcessIdByName(name, function(err, id) {
    if (err) {
      Common.printError(err);
      return cb ? cb(Common.retErr(err)) : that.exitCli(conf.ERROR_EXIT);
    }
    console.log(id);
    return cb ? cb(null, id) : that.exitCli(conf.SUCCESS_EXIT);
  });
};

/**
 * Description
 * @method jlist
 * @param {} debug
 * @return
 */
API.prototype.jlist = function(debug) {
  var that = this;
  var conf = this._conf;

  that.Client.executeRemote('getMonitorData', {}, function(err, list) {
    if (err) {
      Common.printError(err);
      that.exitCli(conf.ERROR_EXIT);
    }

    if (debug) {
      process.stdout.write(util.inspect(list, false, null, false));
    }
    else {
      process.stdout.write(JSON.stringify(list));
    }

    that.exitCli(conf.SUCCESS_EXIT);

  });
};

var gl_retry = 0;

/**
 * Description
 * @method speedList
 * @return
 */
API.prototype.speedList = function(code) {
  var that = this;
  var conf = this._conf;

  // Do nothing if PM2 called programmatically and not called from CLI (also in exitCli)
  if (conf.PM2_PROGRAMMATIC && process.env.PM2_USAGE != 'CLI') return false;

  that.Client.executeRemote('getMonitorData', {}, function(err, list) {
    if (err) {
      if (gl_retry == 0) {
        gl_retry += 1;
        return setTimeout(that.speedList.bind(that), 1400);
      }
      console.error('Error retrieving process list: %s.\nA process seems to be on infinite loop, retry in 5 seconds',err);
      return that.exitCli(conf.ERROR_EXIT);
    }
    
    that._displayProcessList(list, code);
  });
};

/**
 * Display process list
 * @private
 */
API.prototype._displayProcessList = function(list, code) {
  var that = this;
  var conf = this._conf;

  if (process.stdout.isTTY === false) {
    UX.miniDisplay(list);
  }
  else if (commander.miniList && !commander.silent) {
    UX.miniDisplay(list);
  }
  else if (!commander.silent) {
    if (that.gl_interact_infos) {
      Common.printOut(chalk.green.bold('●') + ' Agent Online | Dashboard Access: ' + chalk.bold('https://app.keymetrics.io/#/r/%s') + ' | Server name: %s', that.gl_interact_infos.public_key, that.gl_interact_infos.machine_name);
    }
    UX.dispAsTable(list, commander);
    Common.printOut(chalk.white.italic(' Use `pm2 show <id|name>` to get more details about an app'));
  }

  that._handlePostListDisplay(code);
};

/**
 * Handle post list display actions
 * @private
 */
API.prototype._handlePostListDisplay = function(code) {
  var that = this;
  var conf = this._conf;

  if (that.Client.daemon_mode == false) {
    Common.printOut('[--no-daemon] Continue to stream logs');
    Common.printOut('[--no-daemon] Exit on target PM2 exit pid=' + fs.readFileSync(conf.PM2_PID_FILE_PATH).toString());
    global._auto_exit = true;
    return that.streamLogs('all', 0, false, 'HH:mm:ss', false);
  }
  else if (commander.attach === true) {
    return that.streamLogs('all', 0, false, null, false);
  }
  else {
    return that.exitCli(code ? code : conf.SUCCESS_EXIT);
  }
};

/**
 * Scale up/down a process
 * @method scale
 */
API.prototype.scale = function(app_name, number, cb) {
  var that = this;
  var conf = this._conf;

  /**
   * Add processes
   */
  var addProcs = function(proc, value, cb) {
    (function ex(proc, number) {
      if (number-- === 0) return cb();
      Common.printOut(conf.PREFIX_MSG + 'Scaling up application');
      that.Client.executeRemote('duplicateProcessId', proc.pm2_env.pm_id, ex.bind(this, proc, number));
    })(proc, number);
  };

  /**
   * Remove processes
   */
  var rmProcs = function(procs, value, cb) {
    var i = 0;

    (function ex(procs, number) {
      if (number++ === 0) return cb();
      that._operate('deleteProcessId', procs[i++].pm2_env.pm_id, ex.bind(this, procs, number));
    })(procs, number);
  };

  var end = function() {
    return cb ? cb(null, {success:true}) : that.speedList();
  };

  this.Client.getProcessByName(app_name, function(err, procs) {
    if (err) {
      Common.printError(err);
      return cb ? cb(Common.retErr(err)) : that.exitCli(conf.ERROR_EXIT);
    }

    if (!procs || procs.length === 0) {
      Common.printError(conf.PREFIX_MSG_ERR + 'Application %s not found', app_name);
      return cb ? cb(new Error('App not found')) : that.exitCli(conf.ERROR_EXIT);
    }

    that._performScale(number, procs, addProcs, rmProcs, end, cb);
  });
};

/**
 * Perform scale operation
 * @private
 */
API.prototype._performScale = function(number, procs, addProcs, rmProcs, end, cb) {
  var that = this;
  var conf = this._conf;
  var proc_number = procs.length;

  if (typeof(number) === 'string' && number.indexOf('+') >= 0) {
    number = parseInt(number, 10);
    return addProcs(procs[0], number, end);
  }
  else if (typeof(number) === 'string' && number.indexOf('-') >= 0) {
    number = parseInt(number, 10);
    return rmProcs(procs[0], number, end);
  }
  else {
    number = parseInt(number, 10);
    number = number - proc_number;

    if (number < 0)
      return rmProcs(procs, number, end);
    else if (number > 0)
      return addProcs(procs[0], number, end);
    else {
      Common.printError(conf.PREFIX_MSG_ERR + 'Nothing to do');
      return cb ? cb(new Error('Same process number')) : that.exitCli(conf.ERROR_EXIT);
    }
  }
};

/**
 * Description
 * @method describeProcess
 * @param {} pm2_id
 * @return
 */
API.prototype.describe = function(pm2_id, cb) {
  var that = this;
  var conf = this._conf;

  var found_proc = [];

  that.Client.executeRemote('getMonitorData', {}, function(err, list) {
    if (err) {
      Common.printError('Error retrieving process list: ' + err);
      that.exitCli(conf.ERROR_EXIT);
    }

    list.forEach(function(proc) {
      if ((!isNaN(pm2_id)    && proc.pm_id == pm2_id) ||
          (typeof(pm2_id) === 'string' && proc.name  == pm2_id)) {
        found_proc.push(proc);
      }
    });

    if (found_proc.length === 0) {
      Common.printError(conf.PREFIX_MSG_WARNING + '%s doesn\'t exist', pm2_id);
      return cb ? cb(null, []) : that.exitCli(conf.ERROR_EXIT);
    }

    if (!cb) {
      found_proc.forEach(function(proc) {
        UX.describeTable(proc);
      });
    }

    return cb ? cb(null, found_proc) : that.exitCli(conf.SUCCESS_EXIT);
  });
};

/**
 * API method to perform a deep update of PM2
 * @method deepUpdate
 */
API.prototype.deepUpdate = function(cb) {
  var that = this;
  var conf = this._conf;

  Common.printOut(conf.PREFIX_MSG + 'Updating PM2...');

  var exec = require('shelljs').exec;
  var child = exec("npm i -g pm2@latest; pm2 update", {async : true});

  child.stdout.on('end', function() {
    Common.printOut(conf.PREFIX_MSG + 'PM2 successfully updated');
    cb ? cb(null, {success:true}) : that.exitCli(conf.SUCCESS_EXIT);
  });
};
```