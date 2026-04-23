```javascript
/***************************
 *
 * Extra methods
 *
 **************************/

const cst         = require('../../constants.js');
const Common      = require('../Common.js');
const UX          = require('./UX');
const chalk       = require('ansis');
const path        = require('path');
const fs          = require('fs');
const fmt         = require('../tools/fmt.js');
const dayjs      = require('dayjs');
const pkg         = require('../../package.json');
const copyDirSync = require('../tools/copydirSync.js');

module.exports = function(CLI) {
  /**
   * Get version of the daemonized PM2
   * @method getVersion
   * @callback cb
   */
  CLI.prototype.getVersion = function(cb) {
    this.Client.executeRemote('getVersion', {}, (err) => {
      return cb ? cb.apply(null, arguments) : this.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * Install pm2-sysmonit
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
   * Check if sysmonit should be skipped
   * @private
   */
  CLI.prototype.shouldSkipSysMonitoring = function() {
    return (this.pm2_configuration && this.pm2_configuration.sysmonit !== 'true') ||
           process.env.TRAVIS ||
           global.it === 'function' ||
           cst.IS_WINDOWS === true;
  };

  /**
   * Get sysmonit file path
   * @private
   */
  CLI.prototype.getSysmonitPath = function() {
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
    const printed = this.printAppEnvironment(app_id);

    if (printed === 0) {
      Common.err(`Modules with id ${app_id} not found`);
      return cb ? cb.apply(null, arguments) : this.exitCli(cst.ERROR_EXIT);
    }

    return cb ? cb.apply(null, arguments) : this.exitCli(cst.SUCCESS_EXIT);
  };

  /**
   * Print environment for a specific app
   * @private
   */
  CLI.prototype.printAppEnvironment = function(app_id) {
    let printed = 0;

    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      list.forEach(l => {
        if (app_id === l.pm_id) {
          printed++;
          const env = Common.safeExtend({}, l.pm2_env);
          Object.keys(env).forEach(key => {
            console.log(`${key}: ${chalk.green(env[key])}`);
          });
        }
      });

      if (printed === 0) {
        Common.err(`Modules with id ${app_id} not found`);
        return cb ? cb.apply(null, arguments) : this.exitCli(cst.ERROR_EXIT);
      }
      return cb ? cb.apply(null, arguments) : this.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * Get version of the daemonized PM2
   * @method getVersion
   * @callback cb
   */
  CLI.prototype.report = function() {
    const that = this;
    const Log = require('./Log');

    this.printDaemonReport();
    this.printCliReport();
    this.printSystemInfo();
    this.printProcessList();
    this.printDaemonLogs();
  };

  /**
   * Print daemon report section
   * @private
   */
  CLI.prototype.printDaemonReport = function(report) {
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
  };

  /**
   * Print CLI report section
   * @private
   */
  CLI.prototype.printCliReport = function() {
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
  };

  /**
   * Print system info section
   * @private
   */
  CLI.prototype.printSystemInfo = function() {
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
  };

  /**
   * Print process list section
   * @private
   */
  CLI.prototype.printProcessList = function(list) {
    fmt.title(chalk.bold.blue('PM2 list'));
    UX.list(list, this.gl_interact_infos);
  };

  /**
   * Print daemon logs section
   * @private
   */
  CLI.prototype.printDaemonLogs = function(callback) {
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
      this.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * Get PID for application
   * @method getPID
   * @param {String} app_name
   * @callback cb
   */
  CLI.prototype.getPID = function(app_name, cb) {
    const that = this;

    if (typeof(app_name) === 'function') {
      cb = app_name;
      app_name = null;
    }

    this.getProcessPids(app_name, (err, pids) => {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }

      if (!cb) {
        Common.printOut(pids.join("\n"));
        return that.exitCli(cst.SUCCESS_EXIT);
      }
      return cb(null, pids);
    });
  };

  /**
   * Get process PIDs
   * @private
   */
  CLI.prototype.getProcessPids = function(app_name, callback) {
    const pids = [];

    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      if (err) {
        callback(err);
        return;
      }

      list.forEach(app => {
        if (!app_name || app_name === app.name) {
          pids.push(app.pid);
        }
      });

      callback(null, pids);
    });
  };

  /**
   * Create PM2 memory snapshot
   * @method profile
   * @param {String} type
   * @param {Number} time
   * @callback cb
   */
  CLI.prototype.profile = function(type, time, cb) {
    const that = this;
    const dayjs = require('dayjs');
    const cmd = this.getProfileCommand(type);
    const file = this.getProfileFilePath(cmd.ext);
    const duration = time || 10000;

    console.log(`Starting ${cmd.action} profiling for ${duration}ms...`);
    this.executeProfile(cmd.action, file, duration, (err) => {
      if (err) {
        console.error(err);
        return that.exitCli(1);
      }
      console.log(`Profile done in ${file}`);
      return cb ? cb.apply(null, arguments) : that.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * Get profile command configuration
   * @private
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
    return null;
  };

  /**
   * Get profile file path
   * @private
   */
  CLI.prototype.getProfileFilePath = function(ext) {
    return path.join(process.cwd(), dayjs().format('dd-HH:mm:ss') + ext);
  };

  /**
   * Execute profile command
   * @private
   */
  CLI.prototype.executeProfile = function(action, file, timeout, callback) {
    this.Client.executeRemote(action, {
      pwd: file,
      timeout: timeout
    }, callback);
  };

  /**
   * Highlight README.md content
   * @private
   */
  CLI.prototype.basicMDHighlight = function(lines) {
    console.log('\n\n+-------------------------------------+')
    console.log(chalk.bold('README.md content:'))
    const linesArray = lines.split('\n')
    let isInner = false
    linesArray.forEach(l => {
      if (l.startsWith('#'))
        console.log(chalk.bold.green(l))
      else if (isInner || l.startsWith('```')) {
        if (isInner && l.startsWith('```'))
          isInner = false
        else if (isInner === false)
          isInner = true
        console.log(chalk.gray(l))
      }
      else if (l.startsWith('`'))
        console.log(chalk.gray(l))
      else
        console.log(l)
    })
    console.log('+-------------------------------------+')
  };

  /**
   * pm2 create command
   * create boilerplate of application for fast try
   * @method boilerplate
   */
  CLI.prototype.boilerplate = function(cb) {
    const that = this;
    const projects = [];
    const enquirer = require('enquirer');
    const forEach = require('async/forEach');

    this.loadBoilerplateProjects((err, items) => {
      forEach(items, (app, next) => {
        const fp = path.join(__dirname, '../templates/sample-apps', app);
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
            this.highlightBoilerplateReadme(p);
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
   * Load boilerplate projects
   * @private
   */
  CLI.prototype.loadBoilerplateProjects = function(callback) {
    fs.readdir(path.join(__dirname, '../templates/sample-apps'), (err, items) => {
      callback(err, items);
    });
  };

  /**
   * Highlight boilerplate README
   * @private
   */
  CLI.prototype.highlightBoilerplateReadme = function(project) {
    const readmePath = path.join(project.fullpath, 'README.md');
    const content = fs.readFileSync(readmePath).toString();
    this.basicMDHighlight(content);
  };

  /**
   * Send line to stdin
   * @method sendLineToStdin
   * @param {String} pm_id
   * @param {String} line
   * @param {String} separator
   * @callback cb
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

    this.Client.executeRemote('sendLineToStdin', packet, (err, res) => {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }
      return cb ? cb(null, res) : that.speedList();
    });
  };

  /**
   * Attach to process
   * @method attach
   * @param {String} pm_id
   * @param {String} separator
   * @callback cb
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

    rl.on('close', () => {
      return cb ? cb() : that.exitCli(cst.SUCCESS_EXIT);
    });

    this.launchBus((err, bus, socket) => {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }

      bus.on('log:*', (type, packet) => {
        if (packet.process.pm_id !== parseInt(pm_id))
          return;
        process.stdout.write(packet.data);
      });
    });

    rl.on('line', (line) => {
      this.sendLineToStdin(pm_id, line, separator, () => {});
    });
  };

  /**
   * Send data to process ID
   * @method sendDataToProcessId
   * @param {String} proc_id
   * @param {Object} packet
   * @callback cb
   */
  CLI.prototype.sendDataToProcessId = function(proc_id, packet, cb) {
    const that = this;

    if (typeof proc_id === 'object' && typeof packet === 'function') {
      // the proc_id is packet.
      cb = packet;
      packet = proc_id;
    } else {
      packet.id = proc_id;
    }

    this.Client.executeRemote('sendDataToProcessId', packet, (err, res) => {
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
    this.Client.executeRemote('msgProcess', opts, cb);
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
    const cmd = this.buildTriggerCommand(pm_id, action_name, params);
    const process_wait_count = this.getProcessCount(cmd);
    const results = [];
    let counter = 0;

    this.launchBus((err, bus) => {
      bus.on('axm:reply', (ret) => {
        if (this.matchProcessId(ret.process, pm_id)) {
          results.push(ret);
          Common.printOut('[%s:%s:%s]=%j', ret.process.name, ret.process.pm_id, ret.process.namespace, ret.data.return);
          if (++counter === process_wait_count)
            return cb ? cb(null, results) : that.exitCli(cst.SUCCESS_EXIT);
        }
      });

      this.msgProcess(cmd, (err, data) => {
        if (err) {
          Common.printError(err);
          return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
        }

        if (data.process_count === 0) {
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
   * Build trigger command
   * @private
   */
  CLI.prototype.buildTriggerCommand = function(pm_id, action_name, params) {
    const cmd = {
      msg: action_name
    };
    if (params)
      cmd.opts = params;
    if (isNaN(pm_id))
      cmd.name = pm_id;
    else
      cmd.id = pm_id;
    return cmd;
  };

  /**
   * Get process count from command
   * @private
   */
  CLI.prototype.getProcessCount = function(cmd) {
    return cmd.process_count || 0;
  };

  /**
   * Match process ID
   * @private
   */
  CLI.prototype.matchProcessId = function(process, pm_id) {
    return process.name === pm_id || process.pm_id === pm_id || process.namespace === pm_id || pm_id === 'all';
  };

  /**
   * Send signal to process name
   * @method sendSignalToProcessName
   * @param {} signal
   * @param {} process_name
   * @return
   */
  CLI.prototype.sendSignalToProcessName = function(signal, process_name, cb) {
    const that = this;

    this.Client.executeRemote('sendSignalToProcessName', {
      signal: signal,
      process_name: process_name
    }, (err, list) => {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }
      Common.printOut('successfully sent signal %s to process name %s', signal, process_name);
      return cb ? cb(null, list) : that.speedList();
    });
  };

  /**
   * Send signal to process ID
   * @method sendSignalToProcessId
   * @param {} signal
   * @param {} process_id
   * @return
   */
  CLI.prototype.sendSignalToProcessId = function(signal, process_id, cb) {
    const that = this;

    this.Client.executeRemote('sendSignalToProcessId', {
      signal: signal,
      process_id: process_id
    }, (err, list) => {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }
      Common.printOut('successfully sent signal %s to process id %s', signal, process_id);
      return cb ? cb(null, list) : that.speedList();
    });
  };

  /**
   * API method to launch a process that will serve directory over http
   */
  CLI.prototype.autoinstall = function (cb) {
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
  CLI.prototype.serve = function (target_path, port, opts, commander, cb) {
    const that = this;
    const servePort = this.getServePort(port);
    const servePath = this.getServePath(target_path);

    const filepath = path.resolve(path.dirname(module.filename), './Serve.js');

    const serveOpts = this.buildServeOptions(servePort, servePath, opts, commander);

    this.start(filepath, serveOpts, (err, res) => {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + 'Error while trying to serve : ' + err.message || err);
        return cb ? cb(err) : that.speedList(cst.ERROR_EXIT);
      }
      Common.printOut(cst.PREFIX_MSG + 'Serving ' + servePath + ' on port ' + servePort);
      return cb ? cb(null, res) : that.speedList();
    });
  };

  /**
   * Get serve port
   * @private
   */
  CLI.prototype.getServePort = function(port) {
    return process.env.PM2_SERVE_PORT || port || 8080;
  };

  /**
   * Get serve path
   * @private
   */
  CLI.prototype.getServePath = function(target_path) {
    return path.resolve(process.env.PM2_SERVE_PATH || target_path || '.');
  };

  /**
   * Build serve options
   * @private
   */
  CLI.prototype.buildServeOptions = function(servePort, servePath, opts, commander) {
    const serveOpts = {
      name: this.getServeName(servePort, commander),
      env: this.getServeEnv(servePort, servePath, opts, commander)
    };
    serveOpts.cwd = servePath;
    return serveOpts;
  };

  /**
   * Get serve name
   * @private
   */
  CLI.prototype.getServeName = function(servePort, commander) {
    if (typeof commander.name === 'string')
      return commander.name;
    return 'static-page-server-' + servePort;
  };

  /**
   * Get serve environment
   * @private
   */
  CLI.prototype.getServeEnv = function(servePort, servePath, opts, commander) {
    const env = {
      PM2_SERVE_PORT: servePort,
      PM2_SERVE_PATH: servePath,
      PM2_SERVE_SPA: opts.spa
    };
    if (opts.basicAuthUsername && opts.basicAuthPassword) {
      env.PM2_SERVE_BASIC_AUTH = 'true';
      env.PM2_SERVE_BASIC_AUTH_USERNAME = opts.basicAuthUsername;
      env.PM2_SERVE_BASIC_AUTH_PASSWORD = opts.basicAuthPassword;
    }
    if (opts.monitor) {
      env.PM2_SERVE_MONITOR = opts.monitor;
    }
    return env;
  };

  /**
   * Ping daemon - if PM2 daemon not launched, it will launch it
   * @method ping
   */
  CLI.prototype.ping = function(cb) {
    const that = this;

    this.Client.executeRemote('ping', {}, (err, res) => {
      if (err) {
        Common.printError(err);
        return cb ? cb(new Error(err)) : that.exitCli(cst.ERROR_EXIT);
      }
      Common.printOut(res);
      return cb ? cb(null, res) : that.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * Execute remote command
   */
  CLI.prototype.remote = function(command, opts, cb) {
    const that = this;

    this[command](opts.name, (err_cmd, ret) => {
      if (err_cmd)
        console.error(err_cmd);
      console.log('Command %s finished', command);
      return cb(err_cmd, ret);
    });
  };

  /**
   * This remote method allows to pass multiple arguments
   * to PM2
   * It is used for the new scoped PM2 action system
   */
  CLI.prototype.remoteV2 = function(command, opts, cb) {
    const that = this;

    if (this[command].length === 1)
      return this[command](cb);

    opts.args.push(cb);
    return this[command].apply(this, opts.args);
  };

  /**
   * Generate sample ecosystem config
   * @method generateSample
   * @param {String} mode
   */
  CLI.prototype.generateSample = function(mode) {
    const that = this;
    const templatePath = this.getTemplatePath(mode);

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
  };

  /**
   * Get template path
   * @private
   */
  CLI.prototype.getTemplatePath = function(mode) {
    if (mode === 'simple')
      return path.join(cst.TEMPLATE_FOLDER, cst.APP_CONF_TPL_SIMPLE);
    return path.join(cst.TEMPLATE_FOLDER, cst.APP_CONF_TPL);
  };

  /**
   * Dashboard
   * @method dashboard
   * @callback cb
   */
  CLI.prototype.dashboard = function(cb) {
    const that = this;

    const Dashboard = require('./Dashboard');

    if (cb)
      return cb(new Error('Dashboard cant be called programmatically'));

    Dashboard.init();

    this.Client.launchBus((err, bus) => {
      if (err) {
        console.error('Error launchBus: ' + err);
        that.exitCli(cst.ERROR_EXIT);
      }
      bus.on('log:*', (type, data) => {
        Dashboard.log(type, data)
      })
    });

    process.on('SIGINT', () => {
      this.Client.disconnectBus(() => {
        process.exit(cst.SUCCESS_EXIT);
      });
    });

    this.startDashboardRefresh();
  };

  /**
   * Start dashboard refresh
   * @private
   */
  CLI.prototype.startDashboardRefresh = function() {
    const that = this;

    this.refreshDashboard(() => {
      setTimeout(() => {
        this.refreshDashboard();
      }, 800);
    });
  };

  /**
   * Refresh dashboard
   * @private
   */
  CLI.prototype.refreshDashboard = function(callback) {
    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      if (err) {
        console.error('Error retrieving process list: ' + err);
        this.exitCli(cst.ERROR_EXIT);
      }

      Dashboard.refresh(list);

      if (callback) {
        callback();
      }
    });
  };

  /**
   * Monit
   * @method monit
   * @callback cb
   */
  CLI.prototype.monit = function(cb) {
    const that = this;

    const Monit = require('./Monit.js');

    if (cb) return cb(new Error('Monit cant be called programmatically'));

    Monit.init();

    this.startMonitorRefresh();
  };

  /**
   * Start monitor refresh
   * @private
   */
  CLI.prototype.startMonitorRefresh = function() {
    const that = this;

    this.refreshMonitor(() => {
      setTimeout(() => {
        this.refreshMonitor();
      }, 400);
    });
  };

  /**
   * Refresh monitor
   * @private
   */
  CLI.prototype.refreshMonitor = function(callback) {
    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      if (err) {
        console.error('Error retrieving process list: ' + err);
        this.exitCli(cst.ERROR_EXIT);
      }

      Monit.refresh(list);

      if (callback) {
        callback();
      }
    });
  };

  /**
   * Inspect
   * @method inspect
   * @param {String} app_name
   * @callback cb
   */
  CLI.prototype.inspect = function(app_name, cb) {
    const that = this;
    this.trigger(app_name, 'internal:inspect', (err, res) => {

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
```