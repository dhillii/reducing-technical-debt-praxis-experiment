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

    function getVersionCallback(err) {
      if (err) {
        return cb ? cb(err) : that.exitCli(cst.ERROR_EXIT);
      }
      return cb ? cb(null) : that.exitCli(cst.SUCCESS_EXIT);
    }

    that.Client.executeRemote('getVersion', {}, getVersionCallback);
  };

  /**
   * Install pm2-sysmonit
   */
  CLI.prototype.launchSysMonitoring = function(cb) {
    if (!shouldLaunchSysMonitoring()) {
      return cb ? cb(null) : null;
    }

    const filepath = getSysmonitFilePath();

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

  function shouldLaunchSysMonitoring() {
    return !(this.pm2_configuration && this.pm2_configuration.sysmonit != 'true') &&
           !process.env.TRAVIS &&
           global.it !== 'function' &&
           cst.IS_WINDOWS !== true;
  }

  function getSysmonitFilePath() {
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

    function getMonitorDataCallback(err, list) {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + err);
        return cb ? cb(err) : that.exitCli(cst.ERROR_EXIT);
      }

      const printed = list.filter(l => l.pm_id === app_id).length;

      if (printed === 0) {
        Common.err(`Modules with id ${app_id} not found`);
        return cb ? cb(err) : that.exitCli(cst.ERROR_EXIT);
      }

      list.forEach(l => {
        if (l.pm_id === app_id) {
          const env = Common.safeExtend({}, l.pm2_env);
          Object.keys(env).forEach(key => {
            console.log(`${key}: ${chalk.green(env[key])}`);
          });
        }
      });

      return cb ? cb(null) : that.exitCli(cst.SUCCESS_EXIT);
    }

    that.Client.executeRemote('getMonitorData', {}, getMonitorDataCallback);
  };

  /**
   * Get version of the daemonized PM2
   * @method report
   */
  CLI.prototype.report = function() {
    const that = this;

    function getReportCallback(err, report) {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + err);
        return that.exitCli(cst.ERROR_EXIT);
      }

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

      that.Client.executeRemote('getMonitorData', {}, (err, list) => {
        if (err) {
          Common.printError(cst.PREFIX_MSG_ERR + err);
          return that.exitCli(cst.ERROR_EXIT);
        }

        fmt.sep();
        fmt.title(chalk.bold.blue('PM2 list'));
        UX.list(list, that.gl_interact_infos);

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
          that.exitCli(cst.SUCCESS_EXIT);
        });
      });
    }

    that.Client.executeRemote('getReport', {}, getReportCallback);
  };

  CLI.prototype.getPID = function(app_name, cb) {
    const that = this;

    function getMonitorDataCallback(err, list) {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }

      const pids = list.filter(app => !app_name || app_name === app.name).map(app => app.pid);

      if (!cb) {
        Common.printOut(pids.join('\n'));
        return that.exitCli(cst.SUCCESS_EXIT);
      }
      return cb(null, pids);
    }

    that.Client.executeRemote('getMonitorData', {}, getMonitorDataCallback);
  };

  /**
   * Create PM2 memory snapshot
   * @method profile
   * @param {String} type
   * @param {Number} time
   * @param {Function} cb
   */
  CLI.prototype.profile = function(type, time, cb) {
    const that = this;

    function getProfileType() {
      switch (type) {
        case 'cpu':
          return {
            ext: '.cpuprofile',
            action: 'profileCPU'
          };
        case 'mem':
          return {
            ext: '.heapprofile',
            action: 'profileMEM'
          };
        default:
          throw new Error(`Invalid profile type: ${type}`);
      }
    }

    const cmd = getProfileType();
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
      return cb ? cb(null) : that.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * pm2 create command
   * create boilerplate of application for fast try
   * @method boilerplate
   * @param {Function} cb
   */
  CLI.prototype.boilerplate = function(cb) {
    const that = this;

    function getProjects() {
      return new Promise((resolve, reject) => {
        fs.readdir(path.join(__dirname, '../templates/sample-apps'), (err, items) => {
          if (err) {
            reject(err);
          } else {
            const projects = [];
            items.forEach(item => {
              const fp = path.join(__dirname, '../templates/sample-apps', item);
              fs.readFile(path.join(fp, 'package.json'), (err, dt) => {
                if (err) {
                  reject(err);
                } else {
                  const meta = JSON.parse(dt);
                  meta.fullpath = fp;
                  meta.folder_name = item;
                  projects.push(meta);
                }
              });
            });
            resolve(projects);
          }
        });
      });
    }

    getProjects().then(projects => {
      const prompt = new (require('enquirer')).Select({
        name: 'boilerplate',
        message: 'Select a boilerplate',
        choices: projects.map((p, i) => {
          return {
            message: `${chalk.bold.blue(p.name)} ${p.description}`,
            value: `${i}`
          };
        })
      });

      prompt.run()
        .then(answer => {
          const p = projects[parseInt(answer)];
          const mdContent = fs.readFileSync(path.join(p.fullpath, 'README.md')).toString();
          basicMDHighlight(mdContent);
          console.log(chalk.bold(`>> Project copied inside folder ./${p.folder_name}/\n`));
          copyDirSync(p.fullpath, path.join(process.cwd(), p.folder_name));
          this.start(path.join(p.fullpath, 'ecosystem.config.js'), {
            cwd: p.fullpath
          }, () => {
            return cb ? cb.apply(null, arguments) : this.speedList(cst.SUCCESS_EXIT);
          });
        })
        .catch(e => {
          return cb ? cb.apply(null, arguments) : this.speedList(cst.SUCCESS_EXIT);
        });
    }).catch(err => {
      console.error(err);
    });
  };

  function basicMDHighlight(lines) {
    console.log('\n\n+-------------------------------------+');
    console.log(chalk.bold('README.md content:'));
    lines = lines.split('\n');
    let isInner = false;
    lines.forEach(l => {
      if (l.startsWith('#')) {
        console.log(chalk.bold.green(l));
      } else if (isInner || l.startsWith('```')) {
        if (isInner && l.startsWith('```')) {
          isInner = false;
        } else if (isInner === false) {
          isInner = true;
        }
        console.log(chalk.gray(l));
      } else if (l.startsWith('`')) {
        console.log(chalk.gray(l));
      } else {
        console.log(l);
      }
    });
    console.log('+-------------------------------------+');
  }

  /**
   * Description
   * @method sendLineToStdin
   * @param {Number} pm_id
   * @param {String} line
   * @param {String} separator
   * @param {Function} cb
   */
  CLI.prototype.sendLineToStdin = function(pm_id, line, separator, cb) {
    const that = this;

    function sendLineToStdinCallback(err, res) {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }
      return cb ? cb(null, res) : that.speedList();
    }

    const packet = {
      pm_id: pm_id,
      line: line + (separator || '\n')
    };

    that.Client.executeRemote('sendLineToStdin', packet, sendLineToStdinCallback);
  };

  /**
   * Description
   * @method attachToProcess
   */
  CLI.prototype.attach = function(pm_id, separator, cb) {
    const that = this;

    function attachToProcessCallback(err, bus, socket) {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }

      bus.on('log:*', (type, packet) => {
        if (packet.process.pm_id !== parseInt(pm_id)) {
          return;
        }
        process.stdout.write(packet.data);
      });

      const rl = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.on('close', () => {
        return cb ? cb() : that.exitCli(cst.SUCCESS_EXIT);
      });

      rl.on('line', line => {
        that.sendLineToStdin(pm_id, line, separator, () => {});
      });
    }

    that.Client.launchBus(attachToProcessCallback);
  };

  /**
   * Description
   * @method sendDataToProcessId
   * @param {Number} proc_id
   * @param {Object} packet
   * @param {Function} cb
   */
  CLI.prototype.sendDataToProcessId = function(proc_id, packet, cb) {
    const that = this;

    function sendDataToProcessIdCallback(err, res) {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }
      Common.printOut('successfully sent data to process');
      return cb ? cb(null, res) : that.speedList();
    }

    packet.id = proc_id;

    that.Client.executeRemote('sendDataToProcessId', packet, sendDataToProcessIdCallback);
  };

  /**
   * Used for custom actions, allows to trigger function inside an app
   * To expose a function you need to use keymetrics/pmx
   *
   * @method msgProcess
   * @param {Object} opts
   * @param {String} id           process id
   * @param {String} action_name  function name to trigger
   * @param {Object} [opts.opts]  object passed as first arg of the function
   * @param {String} [uuid]       optional unique identifier when logs are emitted
   *
   */
  CLI.prototype.msgProcess = function(opts, cb) {
    const that = this;

    that.Client.executeRemote('msgProcess', opts, cb);
  };

  /**
   * Trigger a PMX custom action in target application
   * Custom actions allows to interact with an application
   *
   * @method trigger
   * @param  {String|Number} pm_id       process id or application name
   * @param  {String}        action_name name of the custom action to trigger
   * @param  {Mixed}         params      parameter to pass to target action
   * @param  {Function}      cb          callback
   */
  CLI.prototype.trigger = function(pm_id, action_name, params, cb) {
    const that = this;

    function triggerCallback(err, res) {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }
      return cb ? cb(null, res) : that.exitCli(cst.SUCCESS_EXIT);
    }

    const cmd = {
      msg: action_name
    };

    if (params) {
      cmd.opts = params;
    }

    if (isNaN(pm_id)) {
      cmd.name = pm_id;
    } else {
      cmd.id = pm_id;
    }

    that.launchBus((err, bus) => {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }

      bus.on('axm:reply', (ret) => {
        if (ret.process.name === pm_id || ret.process.pm_id === pm_id || ret.process.namespace === pm_id || pm_id === 'all') {
          Common.printOut(`[${ret.process.name}:${ret.process.pm_id}:${ret.process.namespace}]=${JSON.stringify(ret.data.return)}`);
        }
      });

      that.msgProcess(cmd, triggerCallback);
    });
  };

  /**
   * Description
   * @method sendSignalToProcessName
   * @param {String} signal
   * @param {String} process_name
   * @param {Function} cb
   */
  CLI.prototype.sendSignalToProcessName = function(signal, process_name, cb) {
    const that = this;

    function sendSignalToProcessNameCallback(err, list) {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }
      Common.printOut(`successfully sent signal ${signal} to process name ${process_name}`);
      return cb ? cb(null, list) : that.speedList();
    }

    that.Client.executeRemote('sendSignalToProcessName', {
      signal: signal,
      process_name: process_name
    }, sendSignalToProcessNameCallback);
  };

  /**
   * Description
   * @method sendSignalToProcessId
   * @param {String} signal
   * @param {Number} process_id
   * @param {Function} cb
   */
  CLI.prototype.sendSignalToProcessId = function(signal, process_id, cb) {
    const that = this;

    function sendSignalToProcessIdCallback(err, list) {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }
      Common.printOut(`successfully sent signal ${signal} to process id ${process_id}`);
      return cb ? cb(null, list) : that.speedList();
    }

    that.Client.executeRemote('sendSignalToProcessId', {
      signal: signal,
      process_id: process_id
    }, sendSignalToProcessIdCallback);
  };

  /**
   * API method to launch a process that will serve directory over http
   */
  CLI.prototype.autoinstall = function(cb) {
    const filepath = path.resolve(path.dirname(module.filename), '../Sysinfo/ServiceDetection/ServiceDetection.js');

    this.start(filepath, (err, res) => {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + 'Error while trying to serve : ' + err.message || err);
        return cb ? cb(err) : this.speedList(cst.ERROR_EXIT);
      }
      return cb ? cb(null) : this.speedList();
    });
  };

  /**
   * API method to launch a process that will serve directory over http
   *
   * @param {Object} opts options
   * @param {String} opts.path path to be served
   * @param {Number} opts.port port on which http will bind
   * @param {Boolean} opts.spa single page app served
   * @param {String} opts.basicAuthUsername basic auth username
   * @param {String} opts.basicAuthPassword basic auth password
   * @param {Object} commander commander object
   * @param {Function} cb optional callback
   */
  CLI.prototype.serve = function(target_path, port, opts, commander, cb) {
    const that = this;

    function serveCallback(err, res) {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + 'Error while trying to serve : ' + err.message || err);
        return cb ? cb(err) : that.speedList(cst.ERROR_EXIT);
      }
      Common.printOut(cst.PREFIX_MSG + `Serving ${target_path} on port ${port}`);
      return cb ? cb(null, res) : that.speedList();
    }

    const servePort = process.env.PM2_SERVE_PORT || port || 8080;
    const servePath = path.resolve(process.env.PM2_SERVE_PATH || target_path || '.');
    const filepath = path.resolve(path.dirname(module.filename), './Serve.js');

    if (typeof commander.name === 'string') {
      opts.name = commander.name;
    } else {
      opts.name = `static-page-server-${servePort}`;
    }

    if (!opts.env) {
      opts.env = {};
    }

    opts.env.PM2_SERVE_PORT = servePort;
    opts.env.PM2_SERVE_PATH = servePath;
    opts.env.PM2_SERVE_SPA = opts.spa;

    if (opts.basicAuthUsername && opts.basicAuthPassword) {
      opts.env.PM2_SERVE_BASIC_AUTH = 'true';
      opts.env.PM2_SERVE_BASIC_AUTH_USERNAME = opts.basicAuthUsername;
      opts.env.PM2_SERVE_BASIC_AUTH_PASSWORD = opts.basicAuthPassword;
    }

    if (opts.monitor) {
      opts.env.PM2_SERVE_MONITOR = opts.monitor;
    }

    opts.cwd = servePath;

    this.start(filepath, opts, serveCallback);
  };

  /**
   * Ping daemon - if PM2 daemon not launched, it will launch it
   * @method ping
   */
  CLI.prototype.ping = function(cb) {
    const that = this;

    function pingCallback(err, res) {
      if (err) {
        Common.printError(err);
        return cb ? cb(new Error(err)) : that.exitCli(cst.ERROR_EXIT);
      }
      Common.printOut(res);
      return cb ? cb(null, res) : that.exitCli(cst.SUCCESS_EXIT);
    }

    that.Client.executeRemote('ping', {}, pingCallback);
  };

  /**
   * Execute remote command
   */
  CLI.prototype.remote = function(command, opts, cb) {
    const that = this;

    function remoteCallback(err_cmd, ret) {
      if (err_cmd) {
        console.error(err_cmd);
      }
      console.log(`Command ${command} finished`);
      return cb(err_cmd, ret);
    }

    that[command](opts.name, remoteCallback);
  };

  /**
   * This remote method allows to pass multiple arguments
   * to PM2
   * It is used for the new scoped PM2 action system
   */
  CLI.prototype.remoteV2 = function(command, opts, cb) {
    const that = this;

    if (that[command].length === 1) {
      return that[command](cb);
    }

    opts.args.push(cb);
    return that[command].apply(this, opts.args);
  };

  /**
   * Description
   * @method generateSample
   * @param {String} mode
   */
  CLI.prototype.generateSample = function(mode) {
    const that = this;

    function generateSampleCallback() {
      const templatePath = mode === 'simple' ? path.join(cst.TEMPLATE_FOLDER, cst.APP_CONF_TPL_SIMPLE) : path.join(cst.TEMPLATE_FOLDER, cst.APP_CONF_TPL);
      const sample = fs.readFileSync(templatePath);
      const dt = sample.toString();
      const f_name = 'ecosystem.config.js';
      const pwd = process.env.PWD || process.cwd();

      try {
        fs.writeFileSync(path.join(pwd, f_name), dt);
      } catch (e) {
        console.error(e.stack || e);
        return that.exitCli(cst.ERROR_EXIT);
      }

      Common.printOut(`File ${path.join(pwd, f_name)} generated`);
      that.exitCli(cst.SUCCESS_EXIT);
    }

    generateSampleCallback();
  };

  /**
   * Description
   * @method dashboard
   */
  CLI.prototype.dashboard = function(cb) {
    const that = this;

    function dashboardCallback() {
      const Dashboard = require('./Dashboard');

      if (cb) {
        return cb(new Error('Dashboard cant be called programmatically'));
      }

      Dashboard.init();

      that.Client.launchBus((err, bus) => {
        if (err) {
          console.error('Error launchBus: ' + err);
          that.exitCli(cst.ERROR_EXIT);
        }

        bus.on('log:*', (type, data) => {
          Dashboard.log(type, data);
        });
      });

      process.on('SIGINT', () => {
        that.Client.disconnectBus(() => {
          process.exit(cst.SUCCESS_EXIT);
        });
      });

      function refreshDashboard() {
        that.Client.executeRemote('getMonitorData', {}, (err, list) => {
          if (err) {
            console.error('Error retrieving process list: ' + err);
            that.exitCli(cst.ERROR_EXIT);
          }

          Dashboard.refresh(list);

          setTimeout(refreshDashboard, 800);
        });
      }

      refreshDashboard();
    }

    dashboardCallback();
  };

  CLI.prototype.monit = function(cb) {
    const that = this;

    function monitCallback() {
      const Monit = require('./Monit.js');

      if (cb) {
        return cb(new Error('Monit cant be called programmatically'));
      }

      Monit.init();

      function launchMonitor() {
        that.Client.executeRemote('getMonitorData', {}, (err, list) => {
          if (err) {
            console.error('Error retrieving process list: ' + err);
            that.exitCli(cst.ERROR_EXIT);
          }

          Monit.refresh(list);

          setTimeout(launchMonitor, 400);
        });
      }

      launchMonitor();
    }

    monitCallback();
  };

  CLI.prototype.inspect = function(app_name, cb) {
    const that = this;

    function inspectCallback(err, res) {
      if (res && res[0]) {
        if (res[0].data.return === '') {
          Common.printOut(`Inspect disabled on ${app_name}`);
        } else {
          Common.printOut(`Inspect enabled on ${app_name} => go to chrome : chrome://inspect !!!`);
        }
      } else {
        Common.printOut(`Unable to activate inspect mode on ${app_name} !!!`);
      }

      that.exitCli(cst.SUCCESS_EXIT);
    }

    that.trigger(app_name, 'internal:inspect', inspectCallback);
  };
};