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

    that.Client.executeRemote('getVersion', {}, function(err) {
      return cb ? cb.apply(null, arguments) : that.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * Install pm2-sysmonit
   */
  CLI.prototype.launchSysMonitoring = function(cb) {
    if (shouldSkipSysmonit()) {
      return cb ? cb(null) : null;
    }

    const filepath = getSysmonitPath();
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

    function shouldSkipSysmonit() {
      return (this.pm2_configuration && this.pm2_configuration.sysmonit !== 'true') ||
        process.env.TRAVIS ||
        global.it === 'function' ||
        cst.IS_WINDOWS === true;
    }

    function getSysmonitPath() {
      try {
        return path.dirname(require.resolve('pm2-sysmonit'));
      } catch (e) {
        return null;
      }
    }
  };

  /**
   * Show application environment
   * @method env
   * @callback cb
   */
  CLI.prototype.env = function(app_id, cb) {
    const printedApps = [];
    const fetchedApps = [];

    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      if (err) {
        Common.err('Failed to fetch monitor data: ' + (err.message || err));
        return cb ? cb(err) : this.exitCli(cst.ERROR_EXIT);
      }

      list.forEach(app => {
        if (app_id == app.pm_id) {
          fetchedApps.push(app);
        }
      });

      if (fetchedApps.length === 0) {
        Common.err(`Modules with id ${app_id} not found`);
        return cb ? cb.apply(null, arguments) : this.exitCli(cst.ERROR_EXIT);
      }

      fetchedApps.forEach(app => {
        const env = Common.safeExtend({}, app.pm2_env);
        Object.keys(env).forEach(key => {
          console.log(`${key}: ${chalk.green(env[key])}`);
        });
        printedApps.push(app);
      });

      return cb ? cb.apply(null, arguments) : this.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * Generate and display detailed system and PM2 diagnostic report
   * @method report
   */
  CLI.prototype.report = function() {
    const that = this;

    that.Client.executeRemote('getReport', {}, function(err, report) {
      printEmptyLines(3);
      fmt.title('PM2 report');
      fmt.field('Date', new Date());
      fmt.sep();

      const os = require('os');

      if (report && !err) {
        printSectionTitle('Daemon', chalk.bold.blue);
        fmt.field('pm2d version', report.pm2_version);
        fmt.field('node version', report.node_version);
        fmt.field('node path', report.node_path);
        fmt.field('argv', report.argv);
        fmt.field('argv0', report.argv0);
        fmt.field('user', report.user);
        fmt.field('uid', report.uid);
        fmt.field('gid', report.gid);
        fmt.field('uptime', calculateUptime(report.started_at) + 'min');
      }

      fmt.sep();
      printSectionTitle('CLI', chalk.bold.blue);
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

      fmt.sep();
      printSectionTitle('System info', chalk.bold.blue);
      fmt.field('arch', os.arch());
      fmt.field('platform', os.platform());
      fmt.field('type', os.type());
      fmt.field('cpus', os.cpus()[0].model);
      fmt.field('cpus nb', Object.keys(os.cpus()).length);
      fmt.field('freemem', os.freemem());
      fmt.field('totalmem', os.totalmem());
      fmt.field('home', os.homedir());

      that.Client.executeRemote('getMonitorData', {}, function(err, list) {
        fmt.sep();
        printSectionTitle('PM2 list', chalk.bold.blue);
        UX.list(list, that.gl_interact_infos);

        fmt.sep();
        printSectionTitle('Daemon logs', chalk.bold.blue);
        const logs = [{
          path: cst.PM2_LOG_FILE_PATH,
          app_name: 'PM2',
          type: 'PM2'
        }];
        require('./Log').tail(logs, 20, false, function() {
          printCodeBlockEnd();

          console.log(chalk.bold.green('Please copy/paste the above report in your issue on https://github.com/Unitech/pm2/issues'));

          that.exitCli(cst.SUCCESS_EXIT);
        });
      });
    });

    function calculateUptime(startTime) {
      return dayjs(new Date()).diff(startTime, 'minute');
    }

    function printSectionTitle(title, styledFn) {
      fmt.sep();
      fmt.title(styledFn(title));
    }

    function printCodeBlockEnd() {
      console.log('```');
      console.log();
      console.log();
    }

    function printEmptyLines(n) {
      for (let i = 0; i < n; i++) {
        console.log();
      }
    }
  };

  CLI.prototype.getPID = function(app_name, cb) {
    if (typeof(app_name) === 'function') {
      cb = app_name;
      app_name = null;
    }

    const that = this;

    this.Client.executeRemote('getMonitorData', {}, function(err, list) {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + err);
        return areCallbacksReady(cb, that, cst.ERROR_EXIT);
      }

      const pids = extractPids(list, app_name);
      if (!cb) {
        Common.printOut(pids.join('\n'));
        return that.exitCli(cst.SUCCESS_EXIT);
      }

      return cb(null, pids);
    });

    function areCallbacksReady(cbArg, context, exitCode) {
      return cbArg ? cbArg(Common.retErr(err)) : context.exitCli(exitCode);
    }

    function extractPids(list, appName) {
      return list.reduce((acc, app) => {
        if (!appName || appName === app.name) {
          acc.push(app.pid);
        }
        return acc;
      }, []);
    }
  };

  /**
   * Create PM2 memory snapshot
   * @method profile
   * @param {string} type Type of profiling: 'cpu' or 'mem'
   * @param {number} time Duration in milliseconds
   * @param {function} cb Callback function
   */
  CLI.prototype.profile = function(type, time, cb) {
    const that = this;
    const cmd = buildProfileCommand(type);
    const file = path.join(process.cwd(), dayjs().format('dd-HH:mm:ss') + cmd.ext);
    time = time || 10000;

    console.log(`Starting ${cmd.action} profiling for ${time}ms...`);
    that.Client.executeRemote(cmd.action, {
      pwd: file,
      timeout: time
    }, function(err) {
      if (err) {
        console.error(err);
        return that.exitCli(1);
      }
      console.log(`Profile done in ${file}`);
      return cb ? cb.apply(null, arguments) : that.exitCli(cst.SUCCESS_EXIT);
    });

    function buildProfileCommand(type) {
      switch (type) {
        case 'cpu':
          return { ext: '.cpuprofile', action: 'profileCPU' };
        case 'mem':
          return { ext: '.heapprofile', action: 'profileMEM' };
        default:
          return { ext: '.cpuprofile', action: 'profileCPU' };
      }
    }
  };

  /**
   * Highlight README content for readability
   * @param {string} content Full README.md text
   */
  function basicMDHighlight(content) {
    const lines = content.split('\n');
    let isInner = false;

    console.log('\n\n+-------------------------------------+');
    console.log(chalk.bold('README.md content:'));

    lines.forEach(line => {
      if (line.startsWith('#')) {
        console.log(chalk.bold.green(line));
      } else if (isInner || line.startsWith('```')) {
        if (isInner && line.startsWith('```')) {
          isInner = false;
        } else if (!isInner) {
          isInner = true;
        }
        console.log(chalk.gray(line));
      } else if (line.startsWith('`')) {
        console.log(chalk.gray(line));
      } else {
        console.log(line);
      }
    });

    console.log('+-------------------------------------+');
  }

  /**
   * pm2 create command
   * create boilerplate of application for fast try
   * @method boilerplate
   */
  CLI.prototype.boilerplate = function(cb) {
    const projects = [];
    const enquirer = require('enquirer');
    const forEach = require('async/forEach');

    fs.readdir(path.join(__dirname, '../templates/sample-apps'), (err, items) => {
      if (err) {
        return cb ? cb(err) : this.speedList(cst.ERROR_EXIT);
      }

      forEach(items, (app, next) => {
        const fp = path.join(__dirname, '../templates/sample-apps', app);
        fs.readFile(path.join(fp, 'package.json'), (err, dt) => {
          if (err) {
            return next(err);
          }

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
          choices: projects.map((p) => {
            return {
              message: `${chalk.bold.blue(p.name)} ${p.description}`,
              value: `${projects.indexOf(p)}`
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
            return cb ? cb(e) : this.speedList(cst.ERROR_EXIT);
          });
      });
    });
  };

  /**
   * Send line to stdin of target process
   * @method sendLineToStdin
   * @param {number} pm_id Process ID
   * @param {string} line Line to send
   * @param {string} [separator] Optional separator
   * @param {function} cb Callback function
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
   * Attach to process stdin/stdout via REPL
   * @method attach
   * @param {number} pm_id Process ID
   * @param {string} [separator] Optional separator
   * @param {function} cb Callback function
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

    rl.on('close', () => cb ? cb() : that.exitCli(cst.SUCCESS_EXIT));

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
   * Send custom data packet to process
   * @method sendDataToProcessId
   * @param {number|string} proc_id Process ID or packet
   * @param {Object} packet Data packet
   * @param {function} cb Callback function
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
   * Used for custom actions, allows to trigger function inside an app
   * @method msgProcess
   * @param {Object} opts Command options
   * @param {function} cb Callback
   */
  CLI.prototype.msgProcess = function(opts, cb) {
    const that = this;

    that.Client.executeRemote('msgProcess', opts, cb);
  };

  /**
   * Trigger a PMX custom action in target application
   * @method trigger
   * @param  {String|Number} pm_id       process id or application name
   * @param  {String}        action_name name of the custom action to trigger
   * @param  {Mixed}         params      parameter to pass to target action
   * @param  {Function}      cb          callback
   */
  CLI.prototype.trigger = function(pm_id, action_name, params, cb) {
    if (typeof(params) === 'function') {
      cb = params;
      params = null;
    }
    const cmd = buildTriggerCommand(pm_id, action_name, params);
    let counter = 0;
    let process_wait_count = 0;
    const that = this;
    const results = [];

    this.launchBus(function(err, bus) {
      bus.on('axm:reply', function(ret) {
        if (isMatch(ret, pm_id)) {
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

    function buildTriggerCommand(pmId, action, payload) {
      const cmd = {
        msg: action
      };
      if (payload) cmd.opts = payload;
      if (isNaN(pmId)) {
        cmd.name = pmId;
      } else {
        cmd.id = pmId;
      }
      return cmd;
    }

    function isMatch(ret, target) {
      return ret.process.name === target ||
        ret.process.pm_id === target ||
        ret.process.namespace === target ||
        target === 'all';
    }
  };

  /**
   * sendSignalToProcessName
   * @method sendSignalToProcessName
   * @param {string} signal Signal name/type
   * @param {string} process_name Process name
   * @param {function} cb Callback
   */
  CLI.prototype.sendSignalToProcessName = function(signal, process_name, cb) {
    const that = this;

    that.Client.executeRemote('sendSignalToProcessName', {
      signal: signal,
      process_name: process_name
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
   * sendSignalToProcessId
   * @method sendSignalToProcessId
   * @param {string} signal Signal name/type
   * @param {number} process_id Process ID
   * @param {function} cb Callback
   */
  CLI.prototype.sendSignalToProcessId = function(signal, process_id, cb) {
    const that = this;

    that.Client.executeRemote('sendSignalToProcessId', {
      signal: signal,
      process_id: process_id
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
   * Auto-install ServiceDetection module
   * @method autoinstall
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
   * Serve static files over HTTP
   * @method serve
   */
  CLI.prototype.serve = function(target_path, port, opts, commander, cb) {
    const that = this;
    const servePort = process.env.PM2_SERVE_PORT || port || 8080;
    const servePath = path.resolve(process.env.PM2_SERVE_PATH || target_path || '.');

    const filepath = path.resolve(path.dirname(module.filename), './Serve.js');
    const servingOpts = prepareServeOptions(opts, commander, servePort, servePath);

    this.start(filepath, servingOpts, function(err, res) {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + 'Error while trying to serve : ' + err.message || err);
        return cb ? cb(err) : that.speedList(cst.ERROR_EXIT);
      }
      Common.printOut(cst.PREFIX_MSG + 'Serving ' + servePath + ' on port ' + servePort);
      return cb ? cb(null, res) : that.speedList();
    });

    function prepareServeOptions(baseOpts, cmd, port, path) {
      const opts = {};
      if (typeof cmd.name === 'string') {
        opts.name = cmd.name;
      } else {
        opts.name = 'static-page-server-' + port;
      }
      opts.env = baseOpts.env || {};
      opts.env.PM2_SERVE_PORT = port;
      opts.env.PM2_SERVE_PATH = path;
      opts.env.PM2_SERVE_SPA = baseOpts.spa || false;
      if (baseOpts.basicAuthUsername && baseOpts.basicAuthPassword) {
        opts.env.PM2_SERVE_BASIC_AUTH = 'true';
        opts.env.PM2_SERVE_BASIC_AUTH_USERNAME = baseOpts.basicAuthUsername;
        opts.env.PM2_SERVE_BASIC_AUTH_PASSWORD = baseOpts.basicAuthPassword;
      }
      if (baseOpts.monitor) {
        opts.env.PM2_SERVE_MONITOR = baseOpts.monitor;
      }
      opts.cwd = path;
      return opts;
    }
  };

  /**
   * Ping daemon - ensures it's running
   * @method ping
   */
  CLI.prototype.ping = function(cb) {
    const that = this;

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
   * Execute remote command (legacy)
   * @method remote
   */
  CLI.prototype.remote = function(command, opts, cb) {
    const that = this;

    that[command](opts.name, function(err_cmd, ret) {
      if (err_cmd)
        console.error(err_cmd);
      console.log('Command %s finished', command);
      return cb(err_cmd, ret);
    });
  };

  /**
   * Execute remote command v2 (scoped)
   * @method remoteV2
   */
  CLI.prototype.remoteV2 = function(command, opts, cb) {
    const that = this;

    if (that[command].length === 1) {
      return that[command](cb);
    }

    opts.args.push(cb);
    return that[command].apply(that, opts.args);
  };

  /**
   * Generate sample config file (ecosystem.config.js)
   * @method generateSample
   */
  CLI.prototype.generateSample = function(mode) {
    const that = this;
    const templatePath = getTemplatePath(mode);
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
    Common.printOut('File %s generated', path.join(pwd, f_name));
    that.exitCli(cst.SUCCESS_EXIT);

    function getTemplatePath(md) {
      switch (md) {
        case 'simple':
          return path.join(cst.TEMPLATE_FOLDER, cst.APP_CONF_TPL_SIMPLE);
        default:
          return path.join(cst.TEMPLATE_FOLDER, cst.APP_CONF_TPL);
      }
    }
  };

  /**
   * Launch interactive dashboard monitor
   * @method dashboard
   */
  CLI.prototype.dashboard = function(cb) {
    if (cb) return cb(new Error('Dashboard cant be called programmatically'));

    const that = this;
    const Dashboard = require('./Dashboard');
    Dashboard.init();

    this.Client.launchBus(function(err, bus) {
      if (err) {
        console.error('Error launchBus: ' + err);
        return that.exitCli(cst.ERROR_EXIT);
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

    function refresh() {
      that.Client.executeRemote('getMonitorData', {}, function(err, list) {
        if (err) {
          console.error('Error retrieving process list: ' + err);
          return that.exitCli(cst.ERROR_EXIT);
        }
        Dashboard.refresh(list);
        setTimeout(refresh, 800);
      });
    }

    refresh();
  };

  /**
   * Launch interactive monit monitor
   * @method monit
   */
  CLI.prototype.monit = function(cb) {
    if (cb) return cb(new Error('Monit cant be called programmatically'));

    const that = this;
    const Monit = require('./Monit.js');
    Monit.init();

    function launch() {
      that.Client.executeRemote('getMonitorData', {}, function(err, list) {
        if (err) {
          console.error('Error retrieving process list: ' + err);
          return that.exitCli(cst.ERROR_EXIT);
        }
        Monit.refresh(list);
        setTimeout(launch, 400);
      });
    }

    launch();
  };

  /**
   * Inspect v8 inspector on a target app
   * @method inspect
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