```javascript
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
    this.Client.executeRemote('getVersion', {}, (err, res) => {
      if (cb) {
        return cb(err, res);
      }
      this.exitCli(err ? cst.ERROR_EXIT : cst.SUCCESS_EXIT);
    });
  };

  /**
   * Install pm2-sysmonit
   */
  CLI.prototype.launchSysMonitoring = function(cb) {
    if (!this.shouldLaunchSysMonitoring()) {
      return cb ? cb(null) : null;
    }

    const filepath = this.getSysMonitFilePath();
    if (!filepath) {
      return cb ? cb(null) : null;
    }

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

  CLI.prototype.shouldLaunchSysMonitoring = function() {
    return !(this.pm2_configuration && this.pm2_configuration.sysmonit !== 'true') &&
           !process.env.TRAVIS &&
           global.it !== 'function' &&
           cst.IS_WINDOWS !== true;
  };

  CLI.prototype.getSysMonitFilePath = function() {
    try {
      return path.dirname(require.resolve('pm2-sysmonit'));
    } catch (e) {
      return null;
    }
  };

  /**
   * Show application environment
   * @method env
   * @callback cb
   */
  CLI.prototype.env = function(app_id, cb) {
    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      if (err) {
        return this.handleError(cb, err);
      }
      const app = list.find(l => l.pm_id === app_id);
      if (!app) {
        Common.err(`Modules with id ${app_id} not found`);
        return this.handleError(cb, new Error(`Modules with id ${app_id} not found`));
      }
      this.printEnv(app);
      return this.exitCli(cst.SUCCESS_EXIT);
    });
  };

  CLI.prototype.printEnv = function(app) {
    const env = Common.safeExtend({}, app.pm2_env);
    Object.keys(env).forEach(key => {
      console.log(`${key}: ${chalk.green(env[key])}`);
    });
  };

  CLI.prototype.handleError = function(cb, err) {
    Common.printError(cst.PREFIX_MSG_ERR + err);
    return cb ? cb(err) : this.exitCli(cst.ERROR_EXIT);
  };

  /**
   * Get version of the daemonized PM2
   * @method report
   */
  CLI.prototype.report = function() {
    this.Client.executeRemote('getReport', {}, (err, report) => {
      if (err) {
        return this.handleError(null, err);
      }
      this.printReport(report);
      this.Client.executeRemote('getMonitorData', {}, (err, list) => {
        if (err) {
          return this.handleError(null, err);
        }
        this.printList(list);
        this.printLogs();
      });
    });
  };

  CLI.prototype.printReport = function(report) {
    console.log();
    console.log();
    console.log();
    console.log('```');
    fmt.title('PM2 report');
    fmt.field('Date', new Date());
    fmt.sep();

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

    fmt.sep();
    fmt.title(chalk.bold.blue('CLI'));
    fmt.field('local pm2', pkg.version);
    fmt.field('node version', process.versions.node);
    fmt.field('node path', process.env['_'] || 'not found');
    fmt.field('argv', process.argv);
    fmt.field('argv0', process.argv0);
    fmt.field('user', process.env.USER || process.env.LNAME || process.env.USERNAME);
    if (cst.IS_WINDOWS === false && process.geteuid) {
      fmt.field('uid', process.geteuid());
    }
    if (cst.IS_WINDOWS === false && process.getegid) {
      fmt.field('gid', process.getegid());
    }

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
  };

  CLI.prototype.printList = function(list) {
    fmt.sep();
    fmt.title(chalk.bold.blue('PM2 list'));
    UX.list(list, this.gl_interact_infos);
  };

  CLI.prototype.printLogs = function() {
    fmt.sep();
    fmt.title(chalk.bold.blue('Daemon logs'));
    const Log = require('./Log');
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
      this.exitCli(cst.SUCCESS_EXIT);
    });
  };

  CLI.prototype.getPID = function(app_name, cb) {
    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      if (err) {
        return this.handleError(cb, err);
      }
      const pids = list.filter(app => app_name === null || app_name === app.name).map(app => app.pid);
      if (cb) {
        return cb(null, pids);
      }
      Common.printOut(pids.join('\n'));
      this.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * Create PM2 memory snapshot
   * @method profile
   * @param {String} type
   * @param {Number} time
   * @param {Function} cb
   */
  CLI.prototype.profile = function(type, time, cb) {
    const cmd = this.getProfileCmd(type);
    if (!cmd) {
      return this.handleError(cb, new Error('Invalid profile type'));
    }
    const file = path.join(process.cwd(), dayjs().format('dd-HH:mm:ss') + cmd.ext);
    time = time || 10000;

    console.log(`Starting ${cmd.action} profiling for ${time}ms...`);
    this.Client.executeRemote(cmd.action, {
      pwd: file,
      timeout: time
    }, (err) => {
      if (err) {
        console.error(err);
        return this.exitCli(1);
      }
      console.log(`Profile done in ${file}`);
      return cb ? cb.apply(null, arguments) : this.exitCli(cst.SUCCESS_EXIT);
    });
  };

  CLI.prototype.getProfileCmd = function(type) {
    if (type === 'cpu') {
      return {
        ext: '.cpuprofile',
        action: 'profileCPU'
      };
    }
    if (type === 'mem') {
      return {
        ext: '.heapprofile',
        action: 'profileMEM'
      };
    }
    return null;
  };

  // ... rest of the code remains the same ...
```