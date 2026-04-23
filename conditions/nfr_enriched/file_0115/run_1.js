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
   * Check if sysmonit should be launched
   */
  const shouldLaunchSysMonit = () => {
    return !(
      (this.pm2_configuration && this.pm2_configuration.sysmonit !== 'true') ||
      process.env.TRAVIS ||
      global.it === 'function' ||
      cst.IS_WINDOWS === true
    );
  };

  /**
   * Get sysmonit filepath
   */
  const getSysMonitFilepath = () => {
    try {
      return path.dirname(require.resolve('pm2-sysmonit'));
    } catch(e) {
      return null;
    }
  };

  /**
   * Handle sysmonit start result
   */
  const handleSysMonitResult = (err, res, cb) => {
    if (err) {
      Common.printError(cst.PREFIX_MSG_ERR + 'Error while trying to serve : ' + (err.message || err));
      return cb ? cb(err) : this.speedList(cst.ERROR_EXIT);
    }
    return cb ? cb(null) : this.speedList();
  };

  /**
   * Install pm2-sysmonit
   */
  CLI.prototype.launchSysMonitoring = function(cb) {
    if (!shouldLaunchSysMonit.call(this))
      return cb ? cb(null) : null;

    const filepath = getSysMonitFilepath();
    if (!filepath)
      return cb ? cb(null) : null;

    this.start({
      script: filepath
    }, {
      started_as_module : true
    }, (err, res) => {
      handleSysMonitResult.call(this, err, res, cb);
    });
  };

  /**
   * Print environment variable
   */
  const printEnvVariable = (key, value) => {
    console.log(`${key}: ${chalk.green(value)}`);
  };

  /**
   * Show application environment
   * @method env
   * @callback cb
   */
  CLI.prototype.env = function(app_id, cb) {
    let printed = 0;

    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      list.forEach(l => {
        if (app_id == l.pm_id) {
          printed++;
          const env = Common.safeExtend({}, l.pm2_env);
          Object.keys(env).forEach(key => {
            printEnvVariable(key, env[key]);
          });
        }
      });

      if (printed == 0) {
        Common.err(`Modules with id ${app_id} not found`);
        return cb ? cb.apply(null, arguments) : this.exitCli(cst.ERROR_EXIT);
      }
      return cb ? cb.apply(null, arguments) : this.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * Format daemon information for report
   */
  const formatDaemonInfo = (report) => {
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
   * Format CLI information for report
   */
  const formatCliInfo = () => {
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
   * Format system information for report
   */
  const formatSystemInfo = () => {
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
   * Format process list for report
   */
  const formatProcessList = (list, gl_interact_infos) => {
    fmt.title(chalk.bold.blue('PM2 list'));
    UX.list(list, gl_interact_infos);
  };

  /**
   * Format daemon logs for report
   */
  const formatDaemonLogs = (callback) => {
    const Log = require('./Log');
    fmt.title(chalk.bold.blue('Daemon logs'));
    Log.tail([{
      path     : cst.PM2_LOG_FILE_PATH,
      app_name : 'PM2',
      type     : 'PM2'
    }], 20, false, callback);
  };

  /**
   * Print report footer
   */
  const printReportFooter = () => {
    console.log('```');
    console.log();
    console.log();
    console.log(chalk.bold.green('Please copy/paste the above report in your issue on https://github.com/Unitech/pm2/issues'));
    console.log();
    console.log();
  };

  /**
   * Get version of the daemonized PM2
   * @method report
   * @callback cb
   */
  CLI.prototype.report = function() {
    const that = this;

    that.Client.executeRemote('getReport', {}, function(err, report) {
      console.log();
      console.log();
      console.log();
      console.log('```');
      fmt.title('PM2 report');
      fmt.field('Date', new Date());
      fmt.sep();

      if (report && !err) {
        formatDaemonInfo(report);
      }

      fmt.sep();
      formatCliInfo();
      fmt.sep();
      formatSystemInfo();

      that.Client.executeRemote('getMonitorData', {}, function(err, list) {
        fmt.sep();
        formatProcessList(list, that.gl_interact_infos);
        fmt.sep();
        formatDaemonLogs(function() {
          printReportFooter();
          that.exitCli(cst.SUCCESS_EXIT);
        });
      });
    });
  };

  /**
   * Extract PIDs from process list
   */
  const extractPidsFromList = (list, app_name) => {
    const pids = [];
    list.forEach(function(app) {
      if (!app_name || app_name == app.name)
        pids.push(app.pid);
    });
    return pids;
  };

  CLI.prototype.getPID = function(app_name, cb) {
    const that = this;

    if (typeof(app_name) === 'function') {
      cb = app_name;
      app_name = null;
    }

    this.Client.executeRemote('getMonitorData', {}, function(err, list) {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }

      const pids = extractPidsFromList(list, app_name);

      if (!cb) {
        Common.printOut(pids.join("\n"));
        return that.exitCli(cst.SUCCESS_EXIT);
      }
      return cb(null, pids);
    });
  };

  /**
   * Get profiling command configuration
   */
  const getProfilingCommand = (type) => {
    const commands = {
      'cpu': {
        ext: '.cpuprofile',
        action: 'profileCPU'
      },
      'mem': {
        ext: '.heapprofile',
        action: 'profileMEM'
      }
    };
    return commands[type];
  };

  /**
   * Handle profiling result
   */
  const handleProfilingResult = (err, file, cmd, that, cb) => {
    if (err) {
      console.error(err);
      return that.exitCli(1);
    }
    console.log(`Profile done in ${file}`);
    return cb ? cb.apply(null, arguments) : that.exitCli(cst.SUCCESS_EXIT);
  };

  /**
   * Create PM2 memory snapshot
   * @method profile
   * @callback cb
   */
  CLI.prototype.profile = function(type, time, cb) {
    const that = this;
    const cmd = getProfilingCommand(type);

    if (!cmd) {
      console.error('Invalid profiling type');
      return that.exitCli(1);
    }

    const file = path.join(process.cwd(), dayjs().format('dd-HH:mm:ss') + cmd.ext);
    const profileTime = time || 10000;

    console.log(`Starting ${cmd.action} profiling for ${profileTime}ms...`);
    that.Client.executeRemote(cmd.action, {
      pwd : file,
      timeout: profileTime
    }, function(err) {
      handleProfilingResult(err, file, cmd, that, cb);
    });
  };

  /**
   * Highlight markdown content
   */
  function basicMDHighlight(lines) {
    console.log('\n\n+-------------------------------------+');
    console.log(chalk.bold('README.md content:'));
    const lineArray = lines.split('\n');
    let isInner = false;
    lineArray.forEach(l => {
      if (l.startsWith('#'))
        console.log(chalk.bold.green(l));
      else if (isInner || l.startsWith('```')) {
        if (isInner && l.startsWith('```'))
          isInner = false;
        else if (isInner == false)
          isInner = true;
        console.log(chalk.gray(l));
      }
      else if (l.startsWith('`'))
        console.log(chalk.gray(l));
      else
        console.log(l);
    });
    console.log('+-------------------------------------+');
  }

  /**
   * Load boilerplate projects from templates
   */
  const loadBoilerplateProjects = (callback) => {
    const forEach = require('async/forEach');
    const projects = [];

    fs.readdir(path.join(__dirname, '../templates/sample-apps'), (err, items) => {
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
        callback(projects);
      });
    });
  };

  /**
   * Create boilerplate selection prompt
   */
  const createBoilerplatePrompt = (projects) => {
    const enquirer = require('enquirer');
    return new enquirer.Select({
      name: 'boilerplate',
      message: 'Select a boilerplate',
      choices: projects.map((p, i) => {
        return {
          message: `${chalk.bold.blue(p.name)} ${p.description}`,
          value: `${i}`
        };
      })
    });
  };

  /**
   * Handle boilerplate selection
   */
  const handleBoilerplateSelection = (answer, projects, that, cb) => {
    const p = projects[parseInt(answer)];
    basicMDHighlight(fs.readFileSync(path.join(p.fullpath, 'README.md')).toString());
    console.log(chalk.bold(`>> Project copied inside folder ./${p.folder_name}/\n`));
    copyDirSync(p.fullpath, path.join(process.cwd(), p.folder_name));
    that.start(path.join(p.fullpath, 'ecosystem.config.js'), {
      cwd: p.fullpath
    }, () => {
      return cb ? cb.apply(null, arguments) : that.speedList(cst.SUCCESS_EXIT);
    });
  };

  /**
   * pm2 create command
   * create boilerplate of application for fast try
   * @method boilerplate
   */
  CLI.prototype.boilerplate = function(cb) {
    const that = this;

    loadBoilerplateProjects((projects) => {
      const prompt = createBoilerplatePrompt(projects);

      prompt.run()
        .then(answer => {
          handleBoilerplateSelection(answer, projects, that, cb);
        })
        .catch(e => {
          return cb ? cb.apply(null, arguments) : that.speedList(cst.SUCCESS_EXIT);
        });
    });
  };

  /**
   * Description
   * @method sendLineToStdin
   */
  CLI.prototype.sendLineToStdin = function(pm_id, line, separator, cb) {
    const that = this;

    if (!cb && typeof(separator) == 'function') {
      cb = separator;
      separator = null;
    }

    const packet = {
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
   * Setup readline interface for process attachment
   */
  const setupReadlineInterface = () => {
    const readline = require('readline');
    return readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  };

  /**
   * Setup bus listener for process logs
   */
  const setupBusListener = (pm_id, bus) => {
    bus.on('log:*', function(type, packet) {
      if (packet.process.pm_id !== parseInt(pm_id))
        return;
      process.stdout.write(packet.data);
    });
  };

  /**
   * Description
   * @method attach
   */
  CLI.prototype.attach = function(pm_id, separator, cb) {
    const that = this;

    if (isNaN(pm_id)) {
      Common.printError('pm_id must be a process number (not a process name)');
      return cb ? cb(Common.retErr('pm_id must be number')) : that.exitCli(cst.ERROR_EXIT);
    }

    if (typeof(separator) == 'function') {
      cb = separator;
      separator = null;
    }

    const rl = setupReadlineInterface();

    rl.on('close', function() {
      return cb ? cb() : that.exitCli(cst.SUCCESS_EXIT);
    });

    that.Client.launchBus(function(err, bus, socket) {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }

      setupBusListener(pm_id, bus);
    });

    rl.on('line', function(line) {
      that.sendLineToStdin(pm_id, line, separator, function() {});
    });
  };

  /**
   * Normalize packet for sendDataToProcessId
   */
  const normalizeDataPacket = (proc_id, packet) => {
    if (typeof proc_id === 'object' && typeof packet === 'function') {
      return { packet: proc_id, isNormalized: false };
    }
    packet.id = proc_id;
    return { packet: packet, isNormalized: true };
  };

  /**
   * Description
   * @method sendDataToProcessId
   */
  CLI.prototype.sendDataToProcessId = function(proc_id, packet, cb) {
    const that = this;

    const normalized = normalizeDataPacket(proc_id, packet);

    that.Client.executeRemote('sendDataToProcessId', normalized.packet, function(err, res) {
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
   * Build trigger command object
   */
  const buildTriggerCommand = (pm_id, action_name, params) => {
    const cmd = {
      msg : action_name
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
   * Setup trigger bus listener
   */
  const setupTriggerListener = (pm_id, results, process_wait_count, that, cb) => {
    return (ret) => {
      if (ret.process.name == pm_id || ret.process.pm_id == pm_id || ret.process.namespace == pm_id || pm_id == 'all') {
        results.push(ret);
        Common.printOut('[%s:%s:%s]=%j', ret.process.name, ret.process.pm_id, ret.process.namespace, ret.data.return);
        if (++results.length == process_wait_count)
          return cb ? cb(null, results) : that.exitCli(cst.SUCCESS_EXIT);
      }
    };
  };

  /**
   * Handle trigger message response
   */
  const handleTriggerResponse = (err, data, action_name, process_wait_count, that, cb) => {
    if (err) {
      Common.printError(err);
      return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
    }

    if (data.process_count == 0) {
      Common.printError('Not any process has received a command (offline or unexistent)');
      return cb ? cb(Common.retErr('Unknown process')) : that.exitCli(cst.ERROR_EXIT);
    }

    Common.printOut(chalk.bold('%s processes have received command %s'),
                    data.process_count, action_name);
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
    if (typeof(params) === 'function') {
      cb = params;
      params = null;
    }

    const cmd = buildTriggerCommand(pm_id, action_name, params);
    const results = [];
    let process_wait_count = 0;
    const that = this;

    this.launchBus(function(err, bus) {
      bus.on('axm:reply', setupTriggerListener(pm_id, results, process_wait_count, that, cb));

      that.msgProcess(cmd, function(err, data) {
        handleTriggerResponse(err, data, action_name, process_wait_count, that, cb);
        if (!err && data)
          process_wait_count = data.process_count;
      });
    });
  };

  /**
   * Description
   * @method sendSignalToProcessName
   * @param {} signal
   * @param {} process_name
   * @return
   */
  CLI.prototype.sendSignalToProcessName = function(signal, process_name, cb) {
    const that = this;

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
   * Description
   * @method sendSignalToProcessId
   * @param {} signal
   * @param {} process_id
   * @return
   */
  CLI.prototype.sendSignalToProcessId = function(signal, process_id, cb) {
    const that = this;

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
   * API method to launch a process that will serve directory over http
   */
  CLI.prototype.autoinstall = function (cb) {
    const filepath = path.resolve(path.dirname(module.filename), '../Sysinfo/ServiceDetection/ServiceDetection.js');

    this.start(filepath, (err, res) => {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + 'Error while trying to serve : ' + (err.message || err));
        return cb ? cb(err) : this.speedList(cst.ERROR_EXIT);
      }
      return cb ? cb(null) : this.speedList();
    });
  };

  /**
   * Build serve environment variables
   */
  const buildServeEnv = (servePort, servePath, opts) => {
    const env = opts.env || {};
    env.PM2_SERVE_PORT = servePort;
    env.PM2_SERVE_PATH = servePath;
    env.PM2_SERVE_SPA = opts.spa;
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
   * Build serve options
   */
  const buildServeOptions = (servePort, servePath, opts, commander) => {
    const serveOpts = Object.assign({}, opts);
    if (typeof commander.name === 'string')
      serveOpts.name = commander.name;
    else
      serveOpts.name = 'static-page-server-' + servePort;
    serveOpts.env = buildServeEnv(servePort, servePath, opts);
    serveOpts.cwd = servePath;
    return serveOpts;
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
    const servePort = process.env.PM2_SERVE_PORT || port || 8080;
    const servePath = path.resolve(process.env.PM2_SERVE_PATH || target_path || '.');
    const filepath = path.resolve(path.dirname(module.filename), './Serve.js');
    const serveOpts = buildServeOptions(servePort, servePath, opts, commander);

    this.start(filepath, serveOpts, function (err, res) {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + 'Error while trying to serve : ' + (err.message || err));
        return cb ? cb(err) : that.speedList(cst.ERROR_EXIT);
      }
      Common.printOut(cst.PREFIX_MSG + 'Serving ' + servePath + ' on port ' + servePort);
      return cb ? cb(null, res) : that.speedList();
    });
  };

  /**
   * Ping daemon - if PM2 daemon not launched, it will launch it
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
   * Execute remote command
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
   * This remote method allows to pass multiple arguments
   * to PM2
   * It is used for the new scoped PM2 action system
   */
  CLI.prototype.remoteV2 = function(command, opts, cb) {
    const that = this;

    if (that[command].length == 1)
      return that[command](cb);

    opts.args.push(cb);
    return that[command].apply(this, opts.args);
  };

  /**
   * Get template path for sample generation
   */
  const getTemplatePath = (mode) => {
    if (mode == 'simple')
      return path.join(cst.TEMPLATE_FOLDER, cst.APP_CONF_TPL_SIMPLE);
    return path.join(cst.TEMPLATE_FOLDER, cst.APP_CONF_TPL);
  };

  /**
   * Description
   * @method generateSample
   * @param {} mode
   * @return
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
  };

  /**
   * Refresh dashboard with process data
   */
  const refreshDashboard = (that) => {
    that.Client.executeRemote('getMonitorData', {}, function(err, list) {
      if (err) {
        console.error('Error retrieving process list: ' + err);
        that.exitCli(cst.ERROR_EXIT);
        return;
      }

      const Dashboard = require('./Dashboard');
      Dashboard.refresh(list);

      setTimeout(function() {
        refreshDashboard(that);
      }, 800);
    });
  };

  /**
   * Description
   * @method dashboard
   * @return
   */
  CLI.prototype.dashboard = function(cb) {
    const that = this;
    const Dashboard = require('./Dashboard');

    if (cb)
      return cb(new Error('Dashboard cant be called programmatically'));

    Dashboard.init();

    this.Client.launchBus(function (err, bus) {
      if (err) {
        console.error('Error launchBus: ' + err);
        that.exitCli(cst.ERROR_EXIT);
        return;
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

    refreshDashboard(that);
  };

  /**
   * Refresh monit with process data
   */
  const refreshMonit = (that) => {
    that.Client.executeRemote('getMonitorData', {}, function(err, list) {
      if (err) {
        console.error('Error retrieving process list: ' + err);
        that.exitCli(cst.ERROR_EXIT);
        return;
      }

      const Monit = require('./Monit.js');
      Monit.refresh(list);

      setTimeout(function() {
        refreshMonit(that);
      }, 400);
    });
  };

  CLI.prototype.monit = function(cb) {
    const that = this;
    const Monit = require('./Monit.js');

    if (cb) return cb(new Error('Monit cant be called programmatically'));

    Monit.init();
    refreshMonit(that);
  };

  CLI.prototype.inspect = function(app_name, cb) {
    const that = this;
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