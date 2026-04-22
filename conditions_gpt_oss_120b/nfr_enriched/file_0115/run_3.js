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

module.exports = function (CLI) {
  /**
   * Get version of the daemonized PM2
   * @method getVersion
   * @callback cb
   */
  CLI.prototype.getVersion = function (cb) {
    this.Client.executeRemote('getVersion', {}, (err, ...rest) => {
      return cb ? cb(err, ...rest) : this.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * Install pm2-sysmonit
   */
  CLI.prototype.launchSysMonitoring = function (cb) {
    const shouldSkip =
      (this.pm2_configuration && this.pm2_configuration.sysmonit !== 'true') ||
      process.env.TRAVIS ||
      global.it === 'function' ||
      cst.IS_WINDOWS === true;
    if (shouldSkip) return cb ? cb(null) : null;

    let filepath;
    try {
      filepath = path.dirname(require.resolve('pm2-sysmonit'));
    } catch (e) {
      return cb ? cb(null) : null;
    }

    this.start({ script: filepath }, { started_as_module: true }, (err) => {
      if (err) {
        Common.printError(`${cst.PREFIX_MSG_ERR}Error while trying to serve : ${err.message || err}`);
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
  CLI.prototype.env = function (app_id, cb) {
    let printed = 0;
    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      list.forEach((l) => {
        if (app_id == l.pm_id) {
          printed++;
          const env = Common.safeExtend({}, l.pm2_env);
          Object.entries(env).forEach(([key, value]) => {
            console.log(`${key}: ${chalk.green(value)}`);
          });
        }
      });

      if (printed === 0) {
        Common.err(`Modules with id ${app_id} not found`);
        return cb ? cb(err, list) : this.exitCli(cst.ERROR_EXIT);
      }
      return cb ? cb(err, list) : this.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * Generate full PM2 report
   */
  CLI.prototype.report = function () {
    const Log = require('./Log');
    const os = require('os');

    const printHeader = () => {
      console.log('\n\n\n\n```');
      fmt.title('PM2 report');
      fmt.field('Date', new Date());
      fmt.sep();
    };

    const printDaemonInfo = (report) => {
      if (!report) return;
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

    const printCLIInfo = () => {
      fmt.title(chalk.bold.blue('CLI'));
      fmt.field('local pm2', pkg.version);
      fmt.field('node version', process.versions.node);
      fmt.field('node path', process.env['_'] || 'not found');
      fmt.field('argv', process.argv);
      fmt.field('argv0', process.argv0);
      fmt.field('user', process.env.USER || process.env.LNAME || process.env.USERNAME);
      if (!cst.IS_WINDOWS && process.geteuid) fmt.field('uid', process.geteuid());
      if (!cst.IS_WINDOWS && process.getegid) fmt.field('gid', process.getegid());
    };

    const printSystemInfo = () => {
      fmt.title(chalk.bold.blue('System info'));
      fmt.field('arch', os.arch());
      fmt.field('platform', os.platform());
      fmt.field('type', os.type());
      fmt.field('cpus', os.cpus()[0].model);
      fmt.field('cpus nb', os.cpus().length);
      fmt.field('freemem', os.freemem());
      fmt.field('totalmem', os.totalmem());
      fmt.field('home', os.homedir());
    };

    const printPM2List = (list) => {
      fmt.title(chalk.bold.blue('PM2 list'));
      UX.list(list, this.gl_interact_infos);
    };

    const printDaemonLogs = () => {
      fmt.title(chalk.bold.blue('Daemon logs'));
      Log.tail(
        [
          {
            path: cst.PM2_LOG_FILE_PATH,
            app_name: 'PM2',
            type: 'PM2',
          },
        ],
        20,
        false,
        () => {
          console.log('```');
          console.log('\n\n');
          console.log(
            chalk.bold.green(
              'Please copy/paste the above report in your issue on https://github.com/Unitech/pm2/issues'
            )
          );
          console.log('\n\n');
          this.exitCli(cst.SUCCESS_EXIT);
        }
      );
    };

    this.Client.executeRemote('getReport', {}, (err, report) => {
      printHeader();
      fmt.sep();
      printDaemonInfo(report);
      fmt.sep();
      printCLIInfo();
      fmt.sep();
      printSystemInfo();
      fmt.sep();

      this.Client.executeRemote('getMonitorData', {}, (err, list) => {
        printPM2List(list);
        fmt.sep();
        printDaemonLogs();
      });
    });
  };

  CLI.prototype.getPID = function (app_name, cb) {
    if (typeof app_name === 'function') {
      cb = app_name;
      app_name = null;
    }

    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      if (err) {
        Common.printError(`${cst.PREFIX_MSG_ERR}${err}`);
        return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
      }

      const pids = list
        .filter((app) => !app_name || app_name === app.name)
        .map((app) => app.pid);

      if (!cb) {
        Common.printOut(pids.join('\n'));
        return this.exitCli(cst.SUCCESS_EXIT);
      }
      return cb(null, pids);
    });
  };

  /**
   * Create PM2 memory/CPU snapshot
   */
  CLI.prototype.profile = function (type, time, cb) {
    const cmdMap = {
      cpu: { ext: '.cpuprofile', action: 'profileCPU' },
      mem: { ext: '.heapprofile', action: 'profileMEM' },
    };
    const cmd = cmdMap[type];
    if (!cmd) return cb ? cb(new Error('Invalid profile type')) : this.exitCli(cst.ERROR_EXIT);

    const file = path.join(process.cwd(), dayjs().format('dd-HH:mm:ss') + cmd.ext);
    const duration = time || 10000;

    console.log(`Starting ${cmd.action} profiling for ${duration}ms...`);
    this.Client.executeRemote(
      cmd.action,
      { pwd: file, timeout: duration },
      (err) => {
        if (err) {
          console.error(err);
          return this.exitCli(1);
        }
        console.log(`Profile done in ${file}`);
        return cb ? cb(null) : this.exitCli(cst.SUCCESS_EXIT);
      }
    );
  };

  /**
   * Highlight README.md content
   */
  function basicMDHighlight(content) {
    console.log('\n\n+-------------------------------------+');
    console.log(chalk.bold('README.md content:'));
    const lines = content.split('\n');
    let isInner = false;
    lines.forEach((l) => {
      if (l.startsWith('#')) console.log(chalk.bold.green(l));
      else if (isInner || l.startsWith('```')) {
        if (isInner && l.startsWith('```')) isInner = false;
        else if (!isInner) isInner = true;
        console.log(chalk.gray(l));
      } else if (l.startsWith('`')) console.log(chalk.gray(l));
      else console.log(l);
    });
    console.log('+-------------------------------------+');
  }

  /**
   * Boilerplate creation command
   */
  CLI.prototype.boilerplate = function (cb) {
    const templatesDir = path.join(__dirname, '../templates/sample-apps');
    const enquirer = require('enquirer');
    const asyncForEach = require('async/forEach');

    const loadProjects = (done) => {
      const projects = [];
      fs.readdir(templatesDir, (err, items) => {
        if (err) return done(err);
        asyncForEach(
          items,
          (app, next) => {
            const fp = path.join(templatesDir, app);
            fs.readFile(path.join(fp, 'package.json'), (err, data) => {
              if (err) return next(err);
              const meta = JSON.parse(data);
              meta.fullpath = fp;
              meta.folder_name = app;
              projects.push(meta);
              next();
            });
          },
          (err) => done(err, projects)
        );
      });
    };

    const promptSelection = (projects) => {
      const prompt = new enquirer.Select({
        name: 'boilerplate',
        message: 'Select a boilerplate',
        choices: projects.map((p, i) => ({
          message: `${chalk.bold.blue(p.name)} ${p.description}`,
          value: `${i}`,
        })),
      });
      return prompt.run();
    };

    const copyAndStart = (project) => {
      const readmePath = path.join(project.fullpath, 'README.md');
      basicMDHighlight(fs.readFileSync(readmePath).toString());
      console.log(chalk.bold(`>> Project copied inside folder ./${project.folder_name}/\n`));
      copyDirSync(project.fullpath, path.join(process.cwd(), project.folder_name));
      this.start(path.join(project.fullpath, 'ecosystem.config.js'), { cwd: project.fullpath }, (err, res) => {
        return cb ? cb(err, res) : this.speedList(cst.SUCCESS_EXIT);
      });
    };

    loadProjects((err, projects) => {
      if (err) return cb ? cb(err) : this.speedList(cst.ERROR_EXIT);
      promptSelection(projects)
        .then((answer) => {
          const project = projects[parseInt(answer, 10)];
          copyAndStart(project);
        })
        .catch(() => {
          return cb ? cb() : this.speedList(cst.SUCCESS_EXIT);
        });
    });
  };

  /**
   * Send a line to a process stdin
   */
  CLI.prototype.sendLineToStdin = function (pm_id, line, separator, cb) {
    if (!cb && typeof separator === 'function') {
      cb = separator;
      separator = null;
    }

    const packet = {
      pm_id,
      line: line + (separator || '\n'),
    };

    this.Client.executeRemote('sendLineToStdin', packet, (err, res) => {
      if (err) {
        Common.printError(`${cst.PREFIX_MSG_ERR}${err}`);
        return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
      }
      return cb ? cb(null, res) : this.speedList();
    });
  };

  /**
   * Attach to a process stdin/stdout
   */
  CLI.prototype.attach = function (pm_id, separator, cb) {
    if (isNaN(pm_id)) {
      const msg = 'pm_id must be a process number (not a process name)';
      Common.printError(msg);
      return cb ? cb(Common.retErr(msg)) : this.exitCli(cst.ERROR_EXIT);
    }
    if (typeof separator === 'function') {
      cb = separator;
      separator = null;
    }

    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    rl.on('close', () => (cb ? cb() : this.exitCli(cst.SUCCESS_EXIT)));

    this.Client.launchBus((err, bus) => {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
      }
      bus.on('log:*', (type, packet) => {
        if (packet.process.pm_id === parseInt(pm_id, 10)) process.stdout.write(packet.data);
      });
    });

    rl.on('line', (line) => {
      this.sendLineToStdin(pm_id, line, separator, () => {});
    });
  };

  /**
   * Send arbitrary data to a process
   */
  CLI.prototype.sendDataToProcessId = function (proc_id, packet, cb) {
    if (typeof proc_id === 'object' && typeof packet === 'function') {
      cb = packet;
      packet = proc_id;
    } else {
      packet.id = proc_id;
    }

    this.Client.executeRemote('sendDataToProcessId', packet, (err, res) => {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
      }
      Common.printOut('successfully sent data to process');
      return cb ? cb(null, res) : this.speedList();
    });
  };

  /**
   * Custom action message to a process
   */
  CLI.prototype.msgProcess = function (opts, cb) {
    this.Client.executeRemote('msgProcess', opts, cb);
  };

  /**
   * Trigger a PMX custom action
   */
  CLI.prototype.trigger = function (pm_id, action_name, params, cb) {
    if (typeof params === 'function') {
      cb = params;
      params = null;
    }

    const buildCmd = () => {
      const cmd = { msg: action_name };
      if (params) cmd.opts = params;
      if (isNaN(pm_id)) cmd.name = pm_id;
      else cmd.id = pm_id;
      return cmd;
    };

    const handleReply = (ret, state) => {
      const match =
        ret.process.name == pm_id ||
        ret.process.pm_id == pm_id ||
        ret.process.namespace == pm_id ||
        pm_id === 'all';
      if (!match) return;
      state.results.push(ret);
      Common.printOut(
        '[%s:%s:%s]=%j',
        ret.process.name,
        ret.process.pm_id,
        ret.process.namespace,
        ret.data.return
      );
      if (++state.counter === state.waitCount) {
        return cb ? cb(null, state.results) : this.exitCli(cst.SUCCESS_EXIT);
      }
    };

    const cmd = buildCmd();
    const state = { counter: 0, waitCount: 0, results: [] };

    this.launchBus((err, bus) => {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
      }
      bus.on('axm:reply', (ret) => handleReply(ret, state));

      this.msgProcess(cmd, (err, data) => {
        if (err) {
          Common.printError(err);
          return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
        }
        if (data.process_count === 0) {
          const msg = 'Not any process has received a command (offline or unexistent)';
          Common.printError(msg);
          return cb ? cb(Common.retErr('Unknown process')) : this.exitCli(cst.ERROR_EXIT);
        }
        state.waitCount = data.process_count;
        Common.printOut(
          chalk.bold('%s processes have received command %s'),
          data.process_count,
          action_name
        );
      });
    });
  };

  /**
   * Send signal to a process by name
   */
  CLI.prototype.sendSignalToProcessName = function (signal, process_name, cb) {
    this.Client.executeRemote(
      'sendSignalToProcessName',
      { signal, process_name },
      (err, list) => {
        if (err) {
          Common.printError(err);
          return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
        }
        Common.printOut('successfully sent signal %s to process name %s', signal, process_name);
        return cb ? cb(null, list) : this.speedList();
      }
    );
  };

  /**
   * Send signal to a process by id
   */
  CLI.prototype.sendSignalToProcessId = function (signal, process_id, cb) {
    this.Client.executeRemote(
      'sendSignalToProcessId',
      { signal, process_id },
      (err, list) => {
        if (err) {
          Common.printError(err);
          return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
        }
        Common.printOut('successfully sent signal %s to process id %s', signal, process_id);
        return cb ? cb(null, list) : this.speedList();
      }
    );
  };

  /**
   * Autoinstall service detection
   */
  CLI.prototype.autoinstall = function (cb) {
    const filepath = path.resolve(path.dirname(module.filename), '../Sysinfo/ServiceDetection/ServiceDetection.js');
    this.start(filepath, (err) => {
      if (err) {
        Common.printError(`${cst.PREFIX_MSG_ERR}Error while trying to serve : ${err.message || err}`);
        return cb ? cb(err) : this.speedList(cst.ERROR_EXIT);
      }
      return cb ? cb(null) : this.speedList();
    });
  };

  /**
   * Serve static files over HTTP
   */
  CLI.prototype.serve = function (target_path, port, opts, commander, cb) {
    const servePort = process.env.PM2_SERVE_PORT || port || 8080;
    const servePath = path.resolve(process.env.PM2_SERVE_PATH || target_path || '.');
    const filepath = path.resolve(path.dirname(module.filename), './Serve.js');

    opts.name = typeof commander.name === 'string' ? commander.name : `static-page-server-${servePort}`;
    opts.env = opts.env || {};
    opts.env.PM2_SERVE_PORT = servePort;
    opts.env.PM2_SERVE_PATH = servePath;
    opts.env.PM2_SERVE_SPA = opts.spa;
    if (opts.basicAuthUsername && opts.basicAuthPassword) {
      opts.env.PM2_SERVE_BASIC_AUTH = 'true';
      opts.env.PM2_SERVE_BASIC_AUTH_USERNAME = opts.basicAuthUsername;
      opts.env.PM2_SERVE_BASIC_AUTH_PASSWORD = opts.basicAuthPassword;
    }
    if (opts.monitor) opts.env.PM2_SERVE_MONITOR = opts.monitor;
    opts.cwd = servePath;

    this.start(filepath, opts, (err, res) => {
      if (err) {
        Common.printError(`${cst.PREFIX_MSG_ERR}Error while trying to serve : ${err.message || err}`);
        return cb ? cb(err) : this.speedList(cst.ERROR_EXIT);
      }
      Common.printOut(`${cst.PREFIX_MSG}Serving ${servePath} on port ${servePort}`);
      return cb ? cb(null, res) : this.speedList();
    });
  };

  /**
   * Ping daemon
   */
  CLI.prototype.ping = function (cb) {
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
   * Execute remote command (legacy)
   */
  CLI.prototype.remote = function (command, opts, cb) {
    this[command](opts.name, (err_cmd, ret) => {
      if (err_cmd) console.error(err_cmd);
      console.log(`Command %s finished`, command);
      return cb(err_cmd, ret);
    });
  };

  /**
   * Execute remote command with variable arguments
   */
  CLI.prototype.remoteV2 = function (command, opts, cb) {
    if (this[command].length === 1) return this[command](cb);
    opts.args.push(cb);
    return this[command].apply(this, opts.args);
  };

  /**
   * Generate sample ecosystem file
   */
  CLI.prototype.generateSample = function (mode) {
    const templatePath =
      mode === 'simple'
        ? path.join(cst.TEMPLATE_FOLDER, cst.APP_CONF_TPL_SIMPLE)
        : path.join(cst.TEMPLATE_FOLDER, cst.APP_CONF_TPL);
    const sample = fs.readFileSync(templatePath);
    const pwd = process.env.PWD || process.cwd();
    const target = path.join(pwd, 'ecosystem.config.js');

    try {
      fs.writeFileSync(target, sample);
    } catch (e) {
      console.error(e.stack || e);
      return this.exitCli(cst.ERROR_EXIT);
    }
    Common.printOut('File %s generated', target);
    this.exitCli(cst.SUCCESS_EXIT);
  };

  /**
   * Launch interactive dashboard
   */
  CLI.prototype.dashboard = function (cb) {
    if (cb) return cb(new Error('Dashboard cant be called programmatically'));

    const Dashboard = require('./Dashboard');
    Dashboard.init();

    this.Client.launchBus((err, bus) => {
      if (err) {
        console.error('Error launchBus: ' + err);
        return this.exitCli(cst.ERROR_EXIT);
      }
      bus.on('log:*', (type, data) => Dashboard.log(type, data));
    });

    process.on('SIGINT', () => {
      this.Client.disconnectBus(() => process.exit(cst.SUCCESS_EXIT));
    });

    const refresh = () => {
      this.Client.executeRemote('getMonitorData', {}, (err, list) => {
        if (err) {
          console.error('Error retrieving process list: ' + err);
          return this.exitCli(cst.ERROR_EXIT);
        }
        Dashboard.refresh(list);
        setTimeout(refresh, 800);
      });
    };
    refresh();
  };

  /**
   * Launch monitor UI
   */
  CLI.prototype.monit = function (cb) {
    if (cb) return cb(new Error('Monit cant be called programmatically'));

    const Monit = require('./Monit.js');
    Monit.init();

    const loop = () => {
      this.Client.executeRemote('getMonitorData', {}, (err, list) => {
        if (err) {
          console.error('Error retrieving process list: ' + err);
          return this.exitCli(cst.ERROR_EXIT);
        }
        Monit.refresh(list);
        setTimeout(loop, 400);
      });
    };
    loop();
  };

  /**
   * Enable/disable V8 inspector
   */
  CLI.prototype.inspect = function (app_name, cb) {
    this.trigger(app_name, 'internal:inspect', (err, res) => {
      if (res && res[0]) {
        const status = res[0].data.return === '' ? 'disabled' : 'enabled';
        Common.printOut(`Inspect ${status} on ${app_name}`);
      } else {
        Common.printOut(`Unable to activate inspect mode on ${app_name} !!!`);
      }
      this.exitCli(cst.SUCCESS_EXIT);
    });
  };
};