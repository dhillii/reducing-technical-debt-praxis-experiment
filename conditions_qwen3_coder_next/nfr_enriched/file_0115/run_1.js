/***************************
 *
 * Extra methods
 *
 **************************/

var cst = require('../../constants.js');
var Common = require('../Common.js');
var UX = require('./UX');
var chalk = require('ansis');
var path = require('path');
var fs = require('fs');
var fmt = require('../tools/fmt.js');
var dayjs = require('dayjs');
var pkg = require('../../package.json');
const copyDirSync = require('../tools/copydirSync.js');

/**
 * Extract array of monitored processes matching the given app identifier
 * @param {Array} list - Full list of processes from monitor data
 * @param {String|Number} app_id - Process ID or name to filter by
 * @returns {Array} Matching process entries
 */
function filterProcessesById(list, app_id) {
  return list.filter(proc => proc.pm_id === app_id);
}

/**
 * Format and print environment variables for a process
 * @param {Object} pm2Env - PM2 environment object
 */
function printProcessEnvironment(pm2Env) {
  Object.keys(pm2Env).forEach(key => {
    console.log(`${key}: ${chalk.green(pm2Env[key])}`);
  });
}

module.exports = function(CLI) {
  /**
   * Get version of the daemonized PM2
   */
  CLI.prototype.getVersion = function(cb) {
    this.Client.executeRemote('getVersion', {}, (err) => {
      return cb ? cb.apply(null, arguments) : this.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * Launch pm2-sysmonit if conditions allow
   */
  CLI.prototype.launchSysMonitoring = function(cb) {
    if (this.shouldSkipSysMonitoring()) {
      return cb ? cb(null) : null;
    }

    const filepath = this.getSysmonitPath();
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

  /**
   * Determine if sysmonit launching should be skipped
   * @returns {Boolean}
   */
  CLI.prototype.shouldSkipSysMonitoring = function() {
    const isConfigured = this.pm2_configuration && this.pm2_configuration.sysmonit !== 'true';
    const isCI = process.env.TRAVIS;
    const isTest = global.it === 'function';
    const isWindows = cst.IS_WINDOWS === true;

    return isConfigured || isCI || isTest || isWindows;
  };

  /**
   * Get path to installed pm2-sysmonit module
   * @returns {String|null} Absolute path if installed, null otherwise
   */
  CLI.prototype.getSysmonitPath = function() {
    try {
      return path.dirname(require.resolve('pm2-sysmonit'));
    } catch (e) {
      return null;
    }
  };

  /**
   * Display environment variables for a specified application
   */
  CLI.prototype.env = function(app_id, cb) {
    let printed = 0;

    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      if (err) {
        return cb ? cb(err) : this.exitCli(cst.ERROR_EXIT);
      }

      const matchingProcesses = filterProcessesById(list, app_id);

      matchingProcesses.forEach(proc => {
        printed++;
        const env = Common.safeExtend({}, proc.pm2_env);
        printProcessEnvironment(env);
      });

      if (printed === 0) {
        Common.err(`Modules with id ${app_id} not found`);
        return cb ? cb() : this.exitCli(cst.ERROR_EXIT);
      }

      return cb ? cb() : this.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * Show comprehensive system and PM2 report
   */
  CLI.prototype.report = function() {
    const that = this;
    const Log = require('./Log');

    that.Client.executeRemote('getReport', {}, (err, report) => {
      console.log('\n\n```\n');
      fmt.title('PM2 report');
      fmt.field('Date', new Date());
      fmt.sep();

      if (report && !err) {
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
        fmt.sep();
        fmt.title(chalk.bold.blue('PM2 list'));
        UX.list(list, that.gl_interact_infos);

        fmt.sep();
        fmt.title(chalk.bold.blue('Daemon logs'));
        Log.tail([{
          path: cst.PM2_LOG_FILE_PATH,
          app_name: 'PM2',
          type: 'PM2'
        }], 20, false, () => {
          console.log('```\n\n');
          console.log(chalk.bold.green('Please copy/paste the above report in your issue on https://github.com/Unitech/pm2/issues'));
          that.exitCli(cst.SUCCESS_EXIT);
        });
      });
    });
  };

  /**
   * Get PIDs for specified app name
   */
  CLI.prototype.getPID = function(app_name, cb) {
    if (typeof(app_name) === 'function') {
      cb = app_name;
      app_name = null;
    }

    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + err);
        return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
      }

      const pids = list.reduce((acc, app) => {
        if (!app_name || app_name === app.name) {
          acc.push(app.pid);
        }
        return acc;
      }, []);

      if (!cb) {
        Common.printOut(pids.join("\n"));
        return this.exitCli(cst.SUCCESS_EXIT);
      }
      return cb(null, pids);
    });
  };

  /**
   * Launch CPU/MEM profiling session
   */
  CLI.prototype.profile = function(type, time, cb) {
    const cmd = this.getProfileCommand(type);
    const file = path.join(process.cwd(), dayjs().format('dd-HH:mm:ss') + cmd.ext);
    time = time || 10000;

    console.log(`Starting ${cmd.action} profiling for ${time}ms...`);
    this.Client.executeRemote(cmd.action, {
      pwd: file,
      timeout: time
    }, function(err) {
      if (err) {
        console.error(err);
        return this.exitCli(1);
      }
      console.log(`Profile done in ${file}`);
      return cb ? cb.apply(null, arguments) : this.exitCli(cst.SUCCESS_EXIT);
    }.bind(this));
  };

  /**
   * Get profiling configuration object for given type
   */
  CLI.prototype.getProfileCommand = function(type) {
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
    throw new Error('Unsupported profiling type: ' + type);
  };

  /**
   * Highlight markdown content with formatting
   */
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
        } else if (!isInner && l.startsWith('```')) {
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
   * Create new project from template boilerplate
   */
  CLI.prototype.boilerplate = function(cb) {
    const i = 0;
    const projects = [];
    const enquirer = require('enquirer');
    const forEach = require('async/forEach');

    const samplesPath = path.join(__dirname, '../templates/sample-apps');

    fs.readdir(samplesPath, (err, items) => {
      forEach(items, (app, next) => {
        const fp = path.join(samplesPath, app);
        fs.readFile(path.join(fp, 'package.json'), (err, dt) => {
          const meta = JSON.parse(dt);
          meta.fullpath = fp;
          meta.folder_name = app;
          projects.push(meta);
          next();
        });
      }, () => {
        const prompt = new enquirer.Select({
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
            basicMDHighlight(fs.readFileSync(path.join(p.fullpath, 'README.md')).toString());
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
      });
    });
  };

  /**
   * Send line to application stdin
   */
  CLI.prototype.sendLineToStdin = function(pm_id, line, separator, cb) {
    const that = this;

    if (!cb && typeof(separator) == 'function') {
      cb = separator;
      separator = null;
    }

    const packet = {
      pm_id: pm_id,
      line: line + (separator || '\n')
    };

    that.Client.executeRemote('sendLineToStdin', packet, function(err, res) {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }
      return cb ? cb(null, res) : that.speedList();
    });
  };

  /**
   * Attach interactive stdin to process
   */
  CLI.prototype.attach = function(pm_id, separator, cb) {
    const that = this;
    const readline = require('readline');

    if (isNaN(pm_id)) {
      Common.printError('pm_id must be a process number (not a process name)');
      return cb ? cb(Common.retErr('pm_id must be number')) : that.exitCli(cst.ERROR_EXIT);
    }

    if (typeof(separator) == 'function') {
      cb = separator;
      separator = null;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.on('close', function() {
      return cb ? cb() : that.exitCli(cst.SUCCESS_EXIT);
    });

    that.Client.launchBus(function(err, bus, socket) {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }

      bus.on('log:*', function(type, packet) {
        if (packet.process.pm_id !== parseInt(pm_id)) {
          return;
        }
        process.stdout.write(packet.data);
      });
    });

    rl.on('line', function(line) {
      that.sendLineToStdin(pm_id, line, separator, function() {});
    });
  };

  /**
   * Send structured data to a process
   */
  CLI.prototype.sendDataToProcessId = function(proc_id, packet, cb) {
    const that = this;

    if (typeof proc_id === 'object' && typeof packet === 'function') {
      cb = packet;
      packet = proc_id;
    } else {
      packet.id = proc_id;
    }

    that.Client.executeRemote('sendDataToProcessId', packet, function(err, res) {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }
      Common.printOut('successfully sent data to process');
      return cb ? cb(null, res) : that.speedList();
    });
  };

  /**
   * Execute custom action on process via PMX
   */
  CLI.prototype.msgProcess = function(opts, cb) {
    this.Client.executeRemote('msgProcess', opts, cb);
  };

  /**
   * Trigger custom action on target application
   */
  CLI.prototype.trigger = function(pm_id, action_name, params, cb) {
    if (typeof(params) === 'function') {
      cb = params;
      params = null;
    }
    const cmd = {
      msg: action_name
    };
    const that = this;
    let counter = 0;
    let process_wait_count = 0;
    const results = [];

    if (params) {
      cmd.opts = params;
    }
    if (isNaN(pm_id)) {
      cmd.name = pm_id;
    } else {
      cmd.id = pm_id;
    }

    this.launchBus(function(err, bus) {
      bus.on('axm:reply', function(ret) {
        if (ret.process.name == pm_id || ret.process.pm_id == pm_id || ret.process.namespace == pm_id || pm_id == 'all') {
          results.push(ret);
          Common.printOut('[%s:%s:%s]=%j', ret.process.name, ret.process.pm_id, ret.process.namespace, ret.data.return);
          if (++counter == process_wait_count) {
            return cb ? cb(null, results) : that.exitCli(cst.SUCCESS_EXIT);
          }
        }
      });

      that.msgProcess(cmd, function(err, data) {
        if (err) {
          Common.printError(err);
          return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
        }

        if (data.process_count == 0) {
          Common.printError('Not any process has received a command (offline or unexistent)');
          return cb ? cb(Common.retErr('Unknown process')) : that.exitCli(cst.ERROR_EXIT);
        }

        process_wait_count = data.process_count;
        Common.printOut(chalk.bold('%s processes have received command %s'),
          data.process_count, action_name);
      });
    });
  };

  /**
   * Send signal to process by name
   */
  CLI.prototype.sendSignalToProcessName = function(signal, process_name, cb) {
    this.Client.executeRemote('sendSignalToProcessName', {
      signal: signal,
      process_name: process_name
    }, function(err, list) {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
      }
      Common.printOut('successfully sent signal %s to process name %s', signal, process_name);
      return cb ? cb(null, list) : this.speedList();
    });
  };

  /**
   * Send signal to process by ID
   */
  CLI.prototype.sendSignalToProcessId = function(signal, process_id, cb) {
    this.Client.executeRemote('sendSignalToProcessId', {
      signal: signal,
      process_id: process_id
    }, function(err, list) {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
      }
      Common.printOut('successfully sent signal %s to process id %s', signal, process_id);
      return cb ? cb(null, list) : this.speedList();
    });
  };

  /**
   * Launch autoinstaller for service detection
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
   * Create static file server process
   */
  CLI.prototype.serve = function(target_path, port, opts, commander, cb) {
    const that = this;
    const servePort = process.env.PM2_SERVE_PORT || port || 8080;
    const servePath = path.resolve(process.env.PM2_SERVE_PATH || target_path || '.');

    const filepath = path.resolve(path.dirname(module.filename), './Serve.js');

    if (typeof commander.name === 'string') {
      opts.name = commander.name;
    } else {
      opts.name = 'static-page-server-' + servePort;
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

    this.start(filepath, opts, function(err, res) {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + 'Error while trying to serve : ' + err.message || err);
        return cb ? cb(err) : that.speedList(cst.ERROR_EXIT);
      }
      Common.printOut(cst.PREFIX_MSG + 'Serving ' + servePath + ' on port ' + servePort);
      return cb ? cb(null, res) : that.speedList();
    });
  };

  /**
   * Ping PM2 daemon
   */
  CLI.prototype.ping = function(cb) {
    this.Client.executeRemote('ping', {}, (err, res) => {
      if (err) {
        Common.printError(err);
        return cb ? cb(new Error(err)) : this.exitCli(cst.ERROR_EXIT);
      }
      Common.printOut(res);
      return cb ? cb(null, res) : this.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * Execute remote command by proxying to local method
   */
  CLI.prototype.remote = function(command, opts, cb) {
    this[command](opts.name, function(err_cmd, ret) {
      if (err_cmd) {
        console.error(err_cmd);
      }
      console.log('Command %s finished', command);
      return cb(err_cmd, ret);
    });
  };

  /**
   * Execute remote command v2 with dynamic arguments
   */
  CLI.prototype.remoteV2 = function(command, opts, cb) {
    if (this[command].length === 1) {
      return this[command](cb);
    }

    opts.args.push(cb);
    return this[command].apply(this, opts.args);
  };

  /**
   * Generate sample configuration file
   */
  CLI.prototype.generateSample = function(mode) {
    let templatePath;

    if (mode === 'simple') {
      templatePath = path.join(cst.TEMPLATE_FOLDER, cst.APP_CONF_TPL_SIMPLE);
    } else {
      templatePath = path.join(cst.TEMPLATE_FOLDER, cst.APP_CONF_TPL);
    }

    const sample = fs.readFileSync(templatePath);
    const dt = sample.toString();
    const f_name = 'ecosystem.config.js';
    const pwd = process.env.PWD || process.cwd();

    try {
      fs.writeFileSync(path.join(pwd, f_name), dt);
    } catch (e) {
      console.error(e.stack || e);
      return this.exitCli(cst.ERROR_EXIT);
    }
    Common.printOut('File %s generated', path.join(pwd, f_name));
    this.exitCli(cst.SUCCESS_EXIT);
  };

  /**
   * Launch interactive dashboard
   */
  CLI.prototype.dashboard = function(cb) {
    const that = this;
    const Dashboard = require('./Dashboard');

    if (cb) {
      return cb(new Error('Dashboard cant be called programmatically'));
    }

    Dashboard.init();

    this.Client.launchBus(function(err, bus) {
      if (err) {
        console.error('Error launchBus: ' + err);
        that.exitCli(cst.ERROR_EXIT);
      }
      bus.on('log:*', function(type, data) {
        Dashboard.log(type, data);
      });
    });

    process.on('SIGINT', function() {
      this.Client.disconnectBus(function() {
        process.exit(cst.SUCCESS_EXIT);
      });
    });

    function refreshDashboard() {
      that.Client.executeRemote('getMonitorData', {}, function(err, list) {
        if (err) {
          console.error('Error retrieving process list: ' + err);
          that.exitCli(cst.ERROR_EXIT);
        }

        Dashboard.refresh(list);

        setTimeout(function() {
          refreshDashboard();
        }, 800);
      });
    }

    refreshDashboard();
  };

  /**
   * Launch interactive monitor view
   */
  CLI.prototype.monit = function(cb) {
    const that = this;
    const Monit = require('./Monit.js');

    if (cb) {
      return cb(new Error('Monit cant be called programmatically'));
    }

    Monit.init();

    function launchMonitor() {
      that.Client.executeRemote('getMonitorData', {}, function(err, list) {
        if (err) {
          console.error('Error retrieving process list: ' + err);
          that.exitCli(cst.ERROR_EXIT);
        }

        Monit.refresh(list);

        setTimeout(function() {
          launchMonitor();
        }, 400);
      });
    }

    launchMonitor();
  };

  /**
   * Enable V8 inspector on process
   */
  CLI.prototype.inspect = function(app_name, cb) {
    const that = this;
    this.trigger(app_name, 'internal:inspect', function(err, res) {
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
    });
  };
};