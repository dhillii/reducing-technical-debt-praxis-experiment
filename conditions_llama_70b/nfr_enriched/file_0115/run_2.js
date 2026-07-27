/***************************
 *
 * Extra methods
 *
 **************************/

const cst = require('../../constants.js');
const Common = require('../Common.js');
const UX = require('./UX');
const chalk = require('ansis');
const path = require('path');
const fs = require('fs');
const fmt = require('../tools/fmt.js');
const dayjs = require('dayjs');
const pkg = require('../../package.json');
const copyDirSync = require('../tools/copydirSync.js');

module.exports = function(CLI) {
  /**
   * Get version of the daemonized PM2
   * @method getVersion
   * @callback cb
   */
  CLI.prototype.getVersion = function(cb) {
    const that = this;
    that.Client.executeRemote('getVersion', {}, (err, res) => {
      return cb ? cb(err, res) : that.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * Install pm2-sysmonit
   */
  CLI.prototype.launchSysMonitoring = function(cb) {
    if (!shouldLaunchSysMonitoring()) return cb ? cb(null) : null;

    const filepath = getSysMonitFilePath();
    if (!filepath) return cb ? cb(null) : null;

    this.start({
      script: filepath
    }, {
      started_as_module: true
    }, (err, res) => {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + 'Error while trying to serve : ' + err.message || err);
        return cb ? cb(err) : this.speedList(cst.ERROR_EXIT);
      }
      return cb ? cb(null) : this.speedList();
    });
  };

  function shouldLaunchSysMonitoring() {
    return !(this.pm2_configuration && this.pm2_configuration.sysmonit != 'true') &&
           !process.env.TRAVIS &&
           global.it !== 'function' &&
           cst.IS_WINDOWS !== true;
  }

  function getSysMonitFilePath() {
    try {
      return path.dirname(require.resolve('pm2-sysmonit'));
    } catch (e) {
      return null;
    }
  }

  /**
   * Show application environment
   * @method env
   * @callback cb
   */
  CLI.prototype.env = function(app_id, cb) {
    const that = this;
    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      const printed = printEnvironment(list, app_id);
      if (printed === 0) {
        Common.err(`Modules with id ${app_id} not found`);
        return cb ? cb(err) : that.exitCli(cst.ERROR_EXIT);
      }
      return cb ? cb(err) : that.exitCli(cst.SUCCESS_EXIT);
    });
  };

  function printEnvironment(list, app_id) {
    let printed = 0;
    list.forEach(l => {
      if (app_id == l.pm_id) {
        printed++;
        const env = Common.safeExtend({}, l.pm2_env);
        Object.keys(env).forEach(key => {
          console.log(`${key}: ${chalk.green(env[key])}`);
        });
      }
    });
    return printed;
  }

  /**
   * Get version of the daemonized PM2
   * @method report
   */
  CLI.prototype.report = function() {
    const that = this;
    const Log = require('./Log');

    that.Client.executeRemote('getReport', {}, (err, report) => {
      printReportHeader();
      printDaemonInfo(report);
      printCLIInfo();
      printSystemInfo();
      printPM2List();
      printDaemonLogs();
    });
  };

  function printReportHeader() {
    console.log();
    console.log();
    console.log();
    console.log('```');
    fmt.title('PM2 report');
    fmt.field('Date', new Date());
    fmt.sep();
  }

  function printDaemonInfo(report) {
    if (report) {
      fmt.title(chalk.bold.blue('Daemon'));
      fmt.field('pm2d version', report.pm2_version);
      fmt.field('node version', report.node_version);
      fmt.field('node path', report.node_path);
      fmt.field('argv', report.argv);
      fmt.field('argv0', report.argv0);
      fmt.field('user', report.user);
      fmt.field('uid', report.uid);
      fmt.field('gid', report.gid);
      fmt.field('uptime', dayjs(new Date()).diff(report.started_at, 'minute') + 'min');
    }
  }

  function printCLIInfo() {
    fmt.sep();
    fmt.title(chalk.bold.blue('CLI'));
    fmt.field('local pm2', pkg.version);
    fmt.field('node version', process.versions.node);
    fmt.field('node path', process.env['_'] || 'not found');
    fmt.field('argv', process.argv);
    fmt.field('argv0', process.argv0);
    fmt.field('user', process.env.USER || process.env.LNAME || process.env.USERNAME);
    if (cst.IS_WINDOWS === false && process.geteuid)
      fmt.field('uid', process.geteuid());
    if (cst.IS_WINDOWS === false && process.getegid)
      fmt.field('gid', process.getegid());
  }

  function printSystemInfo() {
    const os = require('os');
    fmt.sep();
    fmt.title(chalk.bold.blue('System info'));
    fmt.field('arch', os.arch());
    fmt.field('platform', os.platform());
    fmt.field('type', os.type());
    fmt.field('cpus', os.cpus()[0].model);
    fmt.field('cpus nb', Object.keys(os.cpus()).length);
    fmt.field('freemem', os.freemem());
    fmt.field('totalmem', os.totalmem());
    fmt.field('home', os.homedir());
  }

  function printPM2List() {
    that.Client.executeRemote('getMonitorData', {}, (err, list) => {
      fmt.sep();
      fmt.title(chalk.bold.blue('PM2 list'));
      UX.list(list, that.gl_interact_infos);
    });
  }

  function printDaemonLogs() {
    fmt.sep();
    fmt.title(chalk.bold.blue('Daemon logs'));
    Log.tail([{
      path: cst.PM2_LOG_FILE_PATH,
      app_name: 'PM2',
      type: 'PM2'
    }], 20, false, () => {
      console.log('```');
      console.log();
      console.log();
      console.log(chalk.bold.green('Please copy/paste the above report in your issue on https://github.com/Unitech/pm2/issues'));
      console.log();
      console.log();
      that.exitCli(cst.SUCCESS_EXIT);
    });
  }

  CLI.prototype.getPID = function(app_name, cb) {
    const that = this;
    if (typeof app_name === 'function') {
      cb = app_name;
      app_name = null;
    }
    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }
      const pids = getPIDs(list, app_name);
      if (!cb) {
        Common.printOut(pids.join("\n"));
        return that.exitCli(cst.SUCCESS_EXIT);
      }
      return cb(null, pids);
    });
  };

  function getPIDs(list, app_name) {
    const pids = [];
    list.forEach(app => {
      if (!app_name || app_name == app.name)
        pids.push(app.pid);
    });
    return pids;
  }

  /**
   * Create PM2 memory snapshot
   * @method profile
   * @param {String} type
   * @param {Number} time
   * @param {Function} cb
   */
  CLI.prototype.profile = function(type, time, cb) {
    const that = this;
    const dayjs = require('dayjs');
    const cmd = getProfileCommand(type);
    if (!cmd) {
      console.error('Invalid profile type');
      return that.exitCli(cst.ERROR_EXIT);
    }
    const file = path.join(process.cwd(), dayjs().format('dd-HH:mm:ss') + cmd.ext);
    time = time || 10000;
    console.log(`Starting ${cmd.action} profiling for ${time}ms...`);
    that.Client.executeRemote(cmd.action, {
      pwd: file,
      timeout: time
    }, (err) => {
      if (err) {
        console.error(err);
        return that.exitCli(1);
      }
      console.log(`Profile done in ${file}`);
      return cb ? cb.apply(null, arguments) : that.exitCli(cst.SUCCESS_EXIT);
    });
  };

  function getProfileCommand(type) {
    if (type == 'cpu') {
      return {
        ext: '.cpuprofile',
        action: 'profileCPU'
      };
    }
    if (type == 'mem') {
      return {
        ext: '.heapprofile',
        action: 'profileMEM'
      };
    }
    return null;
  }

  // ... rest of the code remains the same ...