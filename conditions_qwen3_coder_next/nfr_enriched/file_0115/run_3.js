/***************************
 *
 * Extra methods
 *
 **************************/

var cst         = require('../../constants.js');
var Common      = require('../Common.js');
var UX          = require('./UX');
var chalk       = require('ansis');
var path        = require('path');
var fs          = require('fs');
var fmt         = require('../tools/fmt.js');
var dayjs      = require('dayjs');
var pkg         = require('../../package.json');
const copyDirSync = require('../tools/copydirSync.js')

module.exports = function(CLI) {
  /**
   * Get version of the daemonized PM2
   * @method getVersion
   * @callback cb
   */
  CLI.prototype.getVersion = function(cb) {
    var that = this;

    that.Client.executeRemote('getVersion', {}, function(err) {
      return cb ? cb.apply(null, arguments) : that.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * Install pm2-sysmonit
   */
  CLI.prototype.launchSysMonitoring = function(cb) {
    if ((this.pm2_configuration && this.pm2_configuration.sysmonit !== 'true') ||
        process.env.TRAVIS ||
        global.it === 'function' ||
        cst.IS_WINDOWS === true) {
      return cb ? cb(null) : null;
    }

    var filepath;

    try {
      filepath = path.dirname(require.resolve('pm2-sysmonit'));
    } catch(e) {
      return cb ? cb(null) : null;
    }

    this.start({
      script: filepath
    }, {
      started_as_module : true
    }, (err, res) => {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + 'Error while trying to serve : ' + (err.message || err));
        return cb ? cb(err) : this.speedList(cst.ERROR_EXIT);
      }
      return cb ? cb(null) : this.speedList();
    });
  };

  /**
   * Show application environment
   * @method env
   * @callback cb
   */
  CLI.prototype.env = function(app_id, cb) {
    var printed = 0;

    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      if (err) {
        Common.err(`Error retrieving process list: ${err}`);
        return cb ? cb.apply(null, arguments) : this.exitCli(cst.ERROR_EXIT);
      }

      list.forEach(l => {
        if (app_id !== l.pm_id) return;

        printed++;
        const env = Common.safeExtend({}, l.pm2_env);
        Object.keys(env).forEach(key => {
          console.log(`${key}: ${chalk.green(env[key])}`);
        });
      });

      if (printed === 0) {
        Common.err(`Modules with id ${app_id} not found`);
        return cb ? cb.apply(null, arguments) : this.exitCli(cst.ERROR_EXIT);
      }
      return cb ? cb.apply(null, arguments) : this.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * Show full diagnostic report
   * @method report
   */
  CLI.prototype.report = function() {
    var that = this;
    var Log = require('./Log');

    that.Client.executeRemote('getReport', {}, function(err, report) {
      displayReportHeader();

      if (report && !err) {
        displayDaemonInfo(report);
      }

      displayCLIInfo();
      displaySystemInfo();

      that.Client.executeRemote('getMonitorData', {}, function(err, list) {
        displayProcessList(list, that.gl_interact_infos);

        displayDaemonLogs(function() {
          console.log('```');
          console.log();
          console.log();
          console.log(chalk.bold.green('Please copy/paste the above report in your issue on https://github.com/Unitech/pm2/issues'));
          that.exitCli(cst.SUCCESS_EXIT);
        });
      });
    });
  };

  /**
   * Helper to display PM2 report header.
   */
  function displayReportHeader() {
    console.log('\n');
    console.log('\n');
    console.log('\n');
    console.log('```');
    fmt.title('PM2 report');
    fmt.field('Date', new Date());
    fmt.sep();
  }

  /**
   * Helper to display daemon-related information.
   */
  function displayDaemonInfo(report) {
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
    fmt.sep();
  }

  /**
   * Helper to display CLI-related information.
   */
  function displayCLIInfo() {
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
    fmt.sep();
  }

  /**
   * Helper to display system-level information.
   */
  function displaySystemInfo() {
    const os = require('os');
    fmt.title(chalk.bold.blue('System info'));
    fmt.field('arch', os.arch());
    fmt.field('platform', os.platform());
    fmt.field('type', os.type());
    fmt.field('cpus', os.cpus()[0].model);
    fmt.field('cpus nb', Object.keys(os.cpus()).length);
    fmt.field('freemem', os.freemem());
    fmt.field('totalmem', os.totalmem());
    fmt.field('home', os.homedir());
    fmt.sep();
  }

  /**
   * Helper to display monitoring data per process.
   */
  function displayProcessList(list, interactInfos) {
    fmt.title(chalk.bold.blue('PM2 list'));
    UX.list(list, interactInfos);
    fmt.sep();
  }

  /**
   * Helper to display PM2 daemon logs.
   */
  function displayDaemonLogs(cb) {
    var Log = require('./Log');
    Log.tail([{
      path     : cst.PM2_LOG_FILE_PATH,
      app_name : 'PM2',
      type     : 'PM2'
    }], 20, false, function() {
      cb && cb();
    });
  }

  CLI.prototype.getPID = function(app_name, cb) {
    var that = this;

    if (typeof(app_name) === 'function') {
      cb = app_name;
      app_name = null;
    }

    this.Client.executeRemote('getMonitorData', {}, function(err, list) {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }

      var pids = list
        .filter(function(app) {
          return !app_name || app_name === app.name;
        })
        .map(function(app) {
          return app.pid;
        });

      if (!cb) {
        Common.printOut(pids.join("\n"));
        return that.exitCli(cst.SUCCESS_EXIT);
      }
      return cb(null, pids);
    });
  };

  /**
   * Generate CPU/Memory profiles for a process.
   * @method profile
   * @param {string} type - 'cpu' or 'mem'
   * @param {number} time - duration in ms
   * @param {function} cb - callback
   */
  CLI.prototype.profile = function(type, time, cb) {
    var that = this;
    var cmd = type === 'cpu' ?
      { ext: '.cpuprofile', action: 'profileCPU' } :
      { ext: '.heapprofile', action: 'profileMEM' };

    var file = path.join(process.cwd(), dayjs().format('dd-HH:mm:ss') + cmd.ext);
    time = time || 10000;

    console.log(`Starting ${cmd.action} profiling for ${time}ms...`);
    that.Client.executeRemote(cmd.action, {
      pwd : file,
      timeout: time
    }, function(err) {
      if (err) {
        console.error(err);
        return that.exitCli(1);
      }
      console.log(`Profile done in ${file}`);
      return cb ? cb.apply(null, arguments) : that.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * Helper to highlight README.md content in CLI output.
   */
  function basicMDHighlight(lines) {
    console.log('\n\n+-------------------------------------+');
    console.log(chalk.bold('README.md content:'));
    var isInner = false;
    lines.split('\n').forEach(function(l) {
      if (l.startsWith('#')) {
        console.log(chalk.bold.green(l));
      } else if ((isInner && l.startsWith('```')) ||
                 (!isInner && l.startsWith('```'))) {
        isInner = !isInner;
        console.log(chalk.gray(l));
      } else if (isInner === true) {
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
   * pm2 create command: generate boilerplate application.
   * @method boilerplate
   */
  CLI.prototype.boilerplate = function(cb) {
    var i = 0;
    var projects = [];
    var enquirer = require('enquirer');
    var forEach = require('async/forEach');

    fs.readdir(path.join(__dirname, '../templates/sample-apps'), (err, items) => {
      if (err) {
        Common.printError(err);
        return cb ? cb(err) : this.speedList(cst.ERROR_EXIT);
      }

      forEach(items, (app, next) => {
        var fp = path.join(__dirname, '../templates/sample-apps', app);
        fs.readFile(path.join(fp, 'package.json'), (err, dt) => {
          if (err) {
            Common.printError(`Failed reading package.json for ${app}: ${err}`);
            return next();
          }

          var meta = JSON.parse(dt);
          meta.fullpath = fp;
          meta.folder_name = app;
          projects.push(meta);
          next();
        });
      }, () => {
        if (projects.length === 0) {
          Common.printError('No sample apps found');
          return cb ? cb(new Error('No sample apps')) : this.speedList(cst.ERROR_EXIT);
        }

        const prompt = new enquirer.Select({
          name: 'boilerplate',
          message: 'Select a boilerplate',
          choices: projects.map((p) => ({
            message: `${chalk.bold.blue(p.name)} ${p.description}`,
            value: `${projects.indexOf(p)}`
          }))
        });

        prompt.run()
          .then(answer => {
            var p = projects[parseInt(answer)];
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
            return cb ? cb(e) : this.speedList(cst.SUCCESS_EXIT);
          });
      });
    });
  };

  /**
   * Send a line to stdin of a process.
   * @method sendLineToStdin
   * @param {number} pm_id - process id
   * @param {string} line - input line
   * @param {string} separator - line separator
   * @param {function} cb - callback
   */
  CLI.prototype.sendLineToStdin = function(pm_id, line, separator, cb) {
    var that = this;

    if (!cb && typeof(separator) === 'function') {
      cb = separator;
      separator = null;
    }

    var packet = {
      pm_id : pm_id,
      line : line + (separator || '\n')
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
   * Attach a REPL to a running process.
   * @method attach
   * @param {number} pm_id - process id
   * @param {string} separator - line separator
   * @param {function} cb - callback
   */
  CLI.prototype.attach = function(pm_id, separator, cb) {
    var that = this;
    var readline = require('readline');

    if (isNaN(pm_id)) {
      Common.printError('pm_id must be a process number (not a process name)');
      return cb ? cb(Common.retErr('pm_id must be number')) : that.exitCli(cst.ERROR_EXIT);
    }

    if (typeof(separator) === 'function') {
      cb = separator;
      separator = null;
    }

    var rl = readline.createInterface({
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
        if (packet.process.pm_id !== parseInt(pm_id)) return;
        process.stdout.write(packet.data);
      });
    });

    rl.on('line', function(line) {
      that.sendLineToStdin(pm_id, line, separator, function() {});
    });
  };

  /**
   * Send structured data to a process.
   * @method sendDataToProcessId
   * @param {Object|string|number} proc_id - process id or packet
   * @param {Object} packet - data packet
   * @param {function} cb - callback
   */
  CLI.prototype.sendDataToProcessId = function(proc_id, packet, cb) {
    var that = this;

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
   * Trigger function in app via pmx.
   * @method msgProcess
   * @param {Object} opts - options
   * @param {function} cb - callback
   */
  CLI.prototype.msgProcess = function(opts, cb) {
    var that = this;

    that.Client.executeRemote('msgProcess', opts, cb);
  };

  /**
   * Trigger PMX custom action in target application.
   * @method trigger
   * @param {string|number} pm_id - process id or app name
   * @param {string} action_name - action to trigger
   * @param {Mixed} params - parameters for action
   * @param {function} cb - callback
   */
  CLI.prototype.trigger = function(pm_id, action_name, params, cb) {
    if (typeof(params) === 'function') {
      cb = params;
      params = null;
    }
    var cmd = {
      msg : action_name,
      opts : params || null
    };
    var counter = 0;
    var process_wait_count = 0;
    var that = this;
    var results = [];

    if (isNaN(pm_id)) {
      cmd.name = pm_id;
    } else {
      cmd.id = pm_id;
    }

    this.launchBus(function(err, bus) {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }

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
   * Send signal to a process by name.
   * @method sendSignalToProcessName
   * @param {string} signal - signal to send
   * @param {string} process_name - process name
   * @param {function} cb - callback
   */
  CLI.prototype.sendSignalToProcessName = function(signal, process_name, cb) {
    var that = this;

    that.Client.executeRemote('sendSignalToProcessName', {
      signal : signal,
      process_name : process_name
    }, function(err, list) {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }
      Common.printOut('successfully sent signal %s to process name %s', signal, process_name);
      return cb ? cb(null, list) : that.speedList();
    });
  };

  /**
   * Send signal to a process by id.
   * @method sendSignalToProcessId
   * @param {string} signal - signal to send
   * @param {number} process_id - process id
   * @param {function} cb - callback
   */
  CLI.prototype.sendSignalToProcessId = function(signal, process_id, cb) {
    var that = this;

    that.Client.executeRemote('sendSignalToProcessId', {
      signal : signal,
      process_id : process_id
    }, function(err, list) {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }
      Common.printOut('successfully sent signal %s to process id %s', signal, process_id);
      return cb ? cb(null, list) : that.speedList();
    });
  };

  /**
   * Launch autoinstall service detection process.
   * @method autoinstall
   */
  CLI.prototype.autoinstall = function (cb) {
    var filepath = path.resolve(path.dirname(module.filename), '../Sysinfo/ServiceDetection/ServiceDetection.js');

    this.start(filepath, (err, res) => {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + 'Error while trying to serve : ' + (err.message || err));
        return cb ? cb(err) : this.speedList(cst.ERROR_EXIT);
      }
      return cb ? cb(null) : this.speedList();
    });
  };

  /**
   * Expose a directory over HTTP.
   * @method serve
   * @param {string} target_path - path to serve
   * @param {number} port - HTTP port
   * @param {Object} opts - options
   * @param {Object} commander - commander object (for compatibility)
   * @param {function} cb - callback
   */
  CLI.prototype.serve = function (target_path, port, opts, commander, cb) {
    var that = this;
    var servePort = process.env.PM2_SERVE_PORT || port || 8080;
    var servePath = path.resolve(process.env.PM2_SERVE_PATH || target_path || '.');

    var filepath = path.resolve(path.dirname(module.filename), './Serve.js');

    if (typeof commander.name === 'string') {
      opts.name = commander.name;
    } else {
      opts.name = 'static-page-server-' + servePort;
    }

    if (!opts.env) opts.env = {};
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

    this.start(filepath, opts, function (err, res) {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + 'Error while trying to serve : ' + (err.message || err));
        return cb ? cb(err) : that.speedList(cst.ERROR_EXIT);
      }
      Common.printOut(cst.PREFIX_MSG + 'Serving ' + servePath + ' on port ' + servePort);
      return cb ? cb(null, res) : that.speedList();
    });
  };

  /**
   * Ping daemon or auto-start PM2.
   * @method ping
   */
  CLI.prototype.ping = function(cb) {
    var that = this;

    that.Client.executeRemote('ping', {}, function(err, res) {
      if (err) {
        Common.printError(err);
        return cb ? cb(new Error(err)) : that.exitCli(cst.ERROR_EXIT);
      }
      Common.printOut(res);
      return cb ? cb(null, res) : that.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * Execute remote command.
   * @method remote
   */
  CLI.prototype.remote = function(command, opts, cb) {
    var that = this;

    that[command](opts.name, function(err_cmd, ret) {
      if (err_cmd) console.error(err_cmd);
      console.log('Command %s finished', command);
      return cb(err_cmd, ret);
    });
  };

  /**
   * Execute remote command v2.
   * @method remoteV2
   */
  CLI.prototype.remoteV2 = function(command, opts, cb) {
    var that = this;

    if (that[command].length == 1) {
      return that[command](cb);
    }

    opts.args.push(cb);
    return that[command].apply(this, opts.args);
  };

  /**
   * Generate sample application configuration.
   * @method generateSample
   */
  CLI.prototype.generateSample = function(mode) {
    var that = this;
    var templatePath = mode === 'simple' ?
      path.join(cst.TEMPLATE_FOLDER, cst.APP_CONF_TPL_SIMPLE) :
      path.join(cst.TEMPLATE_FOLDER, cst.APP_CONF_TPL);

    var sample = fs.readFileSync(templatePath);
    var dt = sample.toString();
    var f_name = 'ecosystem.config.js';
    var pwd = process.env.PWD || process.cwd();

    try {
      fs.writeFileSync(path.join(pwd, f_name), dt);
    } catch (e) {
      console.error(e.stack || e);
      return that.exitCli(cst.ERROR_EXIT);
    }
    Common.printOut('File %s generated', path.join(pwd, f_name));
    that.exitCli(cst.SUCCESS_EXIT);
  };

  /**
   * Launch interactive dashboard.
   * @method dashboard
   */
  CLI.prototype.dashboard = function(cb) {
    var that = this;
    var Dashboard = require('./Dashboard');

    if (cb) return cb(new Error('Dashboard cant be called programmatically'));

    Dashboard.init();

    this.Client.launchBus(function (err, bus) {
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
        setTimeout(refreshDashboard, 800);
      });
    }
    refreshDashboard();
  };

  /**
   * Launch lightweight monitor view.
   * @method monit
   */
  CLI.prototype.monit = function(cb) {
    var that = this;
    var Monit = require('./Monit.js');

    if (cb) return cb(new Error('Monit cant be called programmatically'));

    Monit.init();

    function launchMonitor() {
      that.Client.executeRemote('getMonitorData', {}, function(err, list) {
        if (err) {
          console.error('Error retrieving process list: ' + err);
          that.exitCli(cst.ERROR_EXIT);
        }
        Monit.refresh(list);
        setTimeout(launchMonitor, 400);
      });
    }
    launchMonitor();
  };

  /**
   * Enable V8 inspector for a process.
   * @method inspect
   */
  CLI.prototype.inspect = function(app_name, cb) {
    this.trigger(app_name, 'internal:inspect', function (err, res) {
      if(res && res[0]) {
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