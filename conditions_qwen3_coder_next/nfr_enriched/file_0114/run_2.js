var commander   = require('commander');
var fs          = require('fs');
var path        = require('path');
var eachLimit   = require('async/eachLimit');
var series      = require('async/series');
var debug       = require('debug')('pm2:cli');
var util        = require('util');
var chalk       = require('ansis');
var fclone      = require('fclone');

var IMMUTABLE_MSG = chalk.bold.blue('Use --update-env to update environment variables');

var path_structure = require('./tools/PathStructure.js');
var Config         = require('./API/Config.js');
var Common         = require('./API/Common.js');
var UX             = require('./API/UX.js');
var Modularizer    = require('./API/Modularizer.js');
var Client         = require('./API/Client.js');
var KMDaemon       = require('./API/KMDaemon.js');
var conf           = require('./conf.js');

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
  this.pm2_home    = conf.PM2_ROOT_PATH;
  this.public_key   = process.env.KEYMETRICS_SECRET || opts.public_key || null;
  this.secret_key   = process.env.KEYMETRICS_PUBLIC || opts.secret_key || null;
  this.machine_name = process.env.INSTANCE_NAME || opts.machine_name || null;

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
  if (opts.pm2_home && opts.independent == true)
    throw new Error('You cannot set a pm2_home and independent instance in same time');

  if (opts.pm2_home) {
    // Override default conf file
    this.pm2_home = opts.pm2_home;
    conf = util._extend(conf, path_structure(this.pm2_home));
  } else if (opts.independent == true && conf.IS_WINDOWS === false) {
    // Create an unique pm2 instance
    this._setupIndependentInstance(opts);
  }

  this._conf = conf;

  if (conf.IS_WINDOWS) {
    // Weird fix, may need to be dropped
    // @todo windows connoisseur double check
    if (process.stdout._handle && process.stdout._handle.setBlocking)
      process.stdout._handle.setBlocking(true);
  }

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

  if (this._checkInteractorPidFile()) {
    that.gl_is_km_linked = true;
  }

  // For testing purposes
  if (this.secret_key && process.env.NODE_ENV == 'local_test')
    that.gl_is_km_linked = true;

  KMDaemon.getInteractInfo(this._conf, function(i_err, interact) {
    that.gl_interact_infos = interact;
  });
};

/**
 * Setup independent PM2 instance
 * Extracted for SRP compliance and reduced complexity
 * @private
 */
API.prototype._setupIndependentInstance = function(opts) {
  var crypto = require('crypto');
  var random_file = crypto.randomBytes(8).toString('hex');
  this.pm2_home = path.join('/tmp', random_file);

  // If we dont explicitly tell to have a daemon
  // It will go as in proc
  if (typeof(opts.daemon_mode) == 'undefined')
    this.daemon_mode = false;

  conf = util._extend(conf, path_structure(this.pm2_home));
};

/**
 * Check interactor pid file validity
 * Extracted for SRP compliance and reduced complexity
 * @private
 * @returns {boolean}
 */
API.prototype._checkInteractorPidFile = function() {
  try {
    var pid = fs.readFileSync(conf.INTERACTOR_PID_PATH);
    pid = parseInt(pid.toString().trim());
    process.kill(pid, 0);
    return true;
  } catch(e) {
    return false;
  }
};