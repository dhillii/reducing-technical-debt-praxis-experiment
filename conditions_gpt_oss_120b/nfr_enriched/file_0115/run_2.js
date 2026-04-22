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
const enquirer = require('enquirer');
const asyncForEach = require('async/forEach');
const readline = require('readline');
const os = require('os');

/**
 * Helper: execute remote command and handle callback/exit
 */
function execRemote(client, method, payload, cb, exitCodeSuccess = cst.SUCCESS_EXIT) {
  client.executeRemote(method, payload, (err, ...rest) => {
    if (cb) return cb(err, ...rest);
    client.cliInstance.exitCli(err ? cst.ERROR_EXIT : exitCodeSuccess);
  });
}

/**
 * Helper: print error and exit or callback
 */
function handleError(err, cb, cliInstance, exitCode = cst.ERROR_EXIT) {
  Common.printError(cst.PREFIX_MSG_ERR + err);
  if (cb) return cb(Common.retErr(err));
  cliInstance.exitCli(exitCode);
}

/**
 * Helper: format and print environment variables
 */
function printEnv(env) {
  Object.keys(env).forEach(key => {
    console.log(`${key}: ${chalk.green(env[key])}`);
  });
}

/**
 * Helper: generate report sections
 */
function generateReportSection(title, fields) {
  fmt.title(chalk.bold.blue(title));
  fields.forEach(([label, value]) => fmt.field(label, value));
}

/**
 * Helper: read JSON file safely
 */
function readJsonFileSync(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

/**
 * Helper: highlight README.md content
 */
function basicMDHighlight(content) {
  console.log('\n\n+-------------------------------------+');
  console.log(chalk.bold('README.md content:'));
  const lines = content.split('\n');
  let isInner = false;
  lines.forEach(l => {
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
 * Helper: load sample projects metadata
 */
function loadSampleProjects(callback) {
  const templatesDir = path.join(__dirname, '../templates/sample-apps');
  fs.readdir(templatesDir, (err, items) => {
    if (err) return callback(err);
    asyncForEach(
      items,
      (app, next) => {
        const fp = path.join(templatesDir, app);
        const pkgPath = path.join(fp, 'package.json');
        fs.readFile(pkgPath, (err, data) => {
          if (err) return next(err);
          const meta = JSON.parse(data);
          meta.fullpath = fp;
          meta.folder_name = app;
          callback(null, meta);
        });
      },
      callback
    );
  });
}

/**
 * Exported CLI extensions
 */
module.exports = function (CLI) {
  /**
   * Get version of the daemonized PM2
   */
  CLI.prototype.getVersion = function (cb) {
    this.Client.executeRemote('getVersion', {}, (err, ...args) => {
      if (cb) return cb(err, ...args);
      this.exitCli(cst.SUCCESS_EXIT);
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

    this.start({ script: filepath }, { started_as_module: true }, (err, res) => {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + 'Error while trying to serve : ' + (err.message || err));
        return cb ? cb(err) : this.speedList(cst.ERROR_EXIT);
      }
      return cb ? cb(null) : this.speedList();
    });
  };

  /**
   * Show application environment
   */
  CLI.prototype.env = function (appId, cb) {
    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      if (err) return handleError(err, cb, this);
      let printed = 0;
      list.forEach(l => {
        if (appId == l.pm_id) {
          printed++;
          const env = Common.safeExtend({}, l.pm2_env);
          printEnv(env);
        }
      });
      if (printed === 0) {
        Common.err(`Modules with id ${appId} not found`);
        return cb ? cb(new Error('Not found')) : this.exitCli(cst.ERROR_EXIT);
      }
      return cb ? cb(null) : this.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * Generate PM2 report
   */
  CLI.prototype.report = function () {
    const Log = require('./Log');
    const client = this.Client;
    client.executeRemote('getReport', {}, (err, report) => {
      console.log('\n\n\n```');
      fmt.title('PM2 report');
      fmt.field('Date', new Date());
      fmt.sep();

      if (report && !err) {
        generateReportSection('Daemon', [
          ['pm2d version', report.pm2_version],
          ['node version', report.node_version],
          ['node path', report.node_path],
          ['argv', report.argv],
          ['argv0', report.argv0],
          ['user', report.user],
          ['uid', report.uid],
          ['gid', report.gid],
          ['uptime', `${dayjs(new Date()).diff(report.started_at, 'minute')}min`],
        ]);
      }

      fmt.sep();
      generateReportSection('CLI', [
        ['local pm2', pkg.version],
        ['node version', process.versions.node],
        ['node path', process.env['_'] || 'not found'],
        ['argv', process.argv],
        ['argv0', process.argv0],
        ['user', process.env.USER || process.env.LNAME || process.env.USERNAME],
      ]);
      if (!cst.IS_WINDOWS && process.geteuid) fmt.field('uid', process.geteuid());
      if (!cst.IS_WINDOWS && process.getegid) fmt.field('gid', process.getegid());

      fmt.sep();
      generateReportSection('System info', [
        ['arch', os.arch()],
        ['platform', os.platform()],
        ['type', os.type()],
        ['cpus', os.cpus()[0].model],
        ['cpus nb', os.cpus().length],
        ['freemem', os.freemem()],
        ['totalmem', os.totalmem()],
        ['home', os.homedir()],
      ]);

      client.executeRemote('getMonitorData', {}, (err, list) => {
        fmt.sep();
        fmt.title(chalk.bold.blue('PM2 list'));
        UX.list(list, this.gl_interact_infos);

        fmt.sep();
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
      });
    });
  };

  /**
   * Get PID(s) of process(es)
   */
  CLI.prototype.getPID = function (appName, cb) {
    if (typeof appName === 'function') {
      cb = appName;
      appName = null;
    }
    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      if (err) return handleError(err, cb, this);
      const pids = list
        .filter(app => !appName || appName === app.name)
        .map(app => app.pid);
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
    if (!cmd) return cb ? cb(new Error('Invalid type')) : this.exitCli(cst.ERROR_EXIT);

    const file = path.join(process.cwd(), dayjs().format('dd-HH:mm:ss') + cmd.ext);
    const timeout = time || 10000;

    console.log(`Starting ${cmd.action} profiling for ${timeout}ms...`);
    this.Client.executeRemote(
      cmd.action,
      { pwd: file, timeout },
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
   * Boilerplate creation command
   */
  CLI.prototype.boilerplate = function (cb) {
    loadSampleProjects((err, projects) => {
      if (err) return handleError(err, cb, this);
      const prompt = new enquirer.Select({
        name: 'boilerplate',
        message: 'Select a boilerplate',
        choices: projects.map((p, i) => ({
          message: `${chalk.bold.blue(p.name)} ${p.description}`,
          value: `${i}`,
        })),
      });

      prompt
        .run()
        .then(answer => {
          const p = projects[parseInt(answer, 10)];
          const readme = fs.readFileSync(path.join(p.fullpath, 'README.md')).toString();
          basicMDHighlight(readme);
          console.log(chalk.bold(`>> Project copied inside folder ./${p.folder_name}/\n`));
          copyDirSync(p.fullpath, path.join(process.cwd(), p.folder_name));
          this.start(path.join(p.fullpath, 'ecosystem.config.js'), { cwd: p.fullpath }, (err, res) => {
            return cb ? cb(err, res) : this.speedList(cst.SUCCESS_EXIT);
          });
        })
        .catch(e => {
          return cb ? cb(e) : this.speedList(cst.SUCCESS_EXIT);
        });
    });
  };

  /**
   * Send a line to a process stdin
   */
  CLI.prototype.sendLineToStdin = function (pmId, line, separator, cb) {
    if (!cb && typeof separator === 'function') {
      cb = separator;
      separator = null;
    }
    const packet = {
      pm_id: pmId,
      line: line + (separator || '\n'),
    };
    this.Client.executeRemote('sendLineToStdin', packet, (err, res) => {
      if (err) return handleError(err, cb, this);
      return cb ? cb(null, res) : this.speedList();
    });
  };

  /**
   * Attach to a process stdin/stdout
   */
  CLI.prototype.attach = function (pmId, separator, cb) {
    if (isNaN(pmId)) {
      return handleError('pm_id must be a process number (not a process name)', cb, this);
    }
    if (typeof separator === 'function') {
      cb = separator;
      separator = null;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('close', () => (cb ? cb() : this.exitCli(cst.SUCCESS_EXIT)));

    this.Client.launchBus((err, bus) => {
      if (err) return handleError(err, cb, this);
      bus.on('log:*', packet => {
        if (packet.process.pm_id === parseInt(pmId, 10)) process.stdout.write(packet.data);
      });
    });

    rl.on('line', line => {
      this.sendLineToStdin(pmId, line, separator, () => {});
    });
  };

  /**
   * Send arbitrary data to a process
   */
  CLI.prototype.sendDataToProcessId = function (procId, packet, cb) {
    if (typeof procId === 'object' && typeof packet === 'function') {
      cb = packet;
      packet = procId;
    } else {
      packet.id = procId;
    }
    this.Client.executeRemote('sendDataToProcessId', packet, (err, res) => {
      if (err) return handleError(err, cb, this);
      Common.printOut('successfully sent data to process');
      return cb ? cb(null, res) : this.speedList();
    });
  };

  /**
   * Custom message to a process
   */
  CLI.prototype.msgProcess = function (opts, cb) {
    this.Client.executeRemote('msgProcess', opts, cb);
  };

  /**
   * Trigger a custom action in a process
   */
  CLI.prototype.trigger = function (pmId, actionName, params, cb) {
    if (typeof params === 'function') {
      cb = params;
      params = null;
    }
    const cmd = { msg: actionName };
    if (params) cmd.opts = params;
    if (isNaN(pmId)) cmd.name = pmId;
    else cmd.id = pmId;

    const results = [];
    let received = 0;
    let expected = 0;
    const that = this;

    this.launchBus((err, bus) => {
      if (err) return handleError(err, cb, that);
      bus.on('axm:reply', ret => {
        if (
          ret.process.name == pmId ||
          ret.process.pm_id == pmId ||
          ret.process.namespace == pmId ||
          pmId === 'all'
        ) {
          results.push(ret);
          Common.printOut(
            '[%s:%s:%s]=%j',
            ret.process.name,
            ret.process.pm_id,
            ret.process.namespace,
            ret.data.return
          );
          if (++received === expected) return cb ? cb(null, results) : that.exitCli(cst.SUCCESS_EXIT);
        }
      });

      that.msgProcess(cmd, (err, data) => {
        if (err) return handleError(err, cb, that);
        if (data.process_count === 0) {
          return handleError('Not any process has received a command (offline or unexistent)', cb, that);
        }
        expected = data.process_count;
        Common.printOut(
          chalk.bold('%s processes have received command %s'),
          data.process_count,
          actionName
        );
      });
    });
  };

  /**
   * Send signal to process by name
   */
  CLI.prototype.sendSignalToProcessName = function (signal, processName, cb) {
    this.Client.executeRemote(
      'sendSignalToProcessName',
      { signal, process_name: processName },
      (err, list) => {
        if (err) return handleError(err, cb, this);
        Common.printOut('successfully sent signal %s to process name %s', signal, processName);
        return cb ? cb(null, list) : this.speedList();
      }
    );
  };

  /**
   * Send signal to process by id
   */
  CLI.prototype.sendSignalToProcessId = function (signal, processId, cb) {
    this.Client.executeRemote(
      'sendSignalToProcessId',
      { signal, process_id: processId },
      (err, list) => {
        if (err) return handleError(err, cb, this);
        Common.printOut('successfully sent signal %s to process id %s', signal, processId);
        return cb ? cb(null, list) : this.speedList();
      }
    );
  };

  /**
   * Autoinstall service detection
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
   * Serve static files over HTTP
   */
  CLI.prototype.serve = function (targetPath, port, opts, commander, cb) {
    const servePort = process.env.PM2_SERVE_PORT || port || 8080;
    const servePath = path.resolve(process.env.PM2_SERVE_PATH || targetPath || '.');
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
        Common.printError(cst.PREFIX_MSG_ERR + 'Error while trying to serve : ' + (err.message || err));
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
      if (err) return handleError(err, cb, this);
      Common.printOut(res);
      return cb ? cb(null, res) : this.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * Remote command execution wrapper
   */
  CLI.prototype.remote = function (command, opts, cb) {
    this[command](opts.name, (errCmd, ret) => {
      if (errCmd) console.error(errCmd);
      console.log(`Command ${command} finished`);
      return cb(errCmd, ret);
    });
  };

  /**
   * Remote command with variable arguments
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

    const launch = () => {
      this.Client.executeRemote('getMonitorData', {}, (err, list) => {
        if (err) {
          console.error('Error retrieving process list: ' + err);
          return this.exitCli(cst.ERROR_EXIT);
        }
        Monit.refresh(list);
        setTimeout(launch, 400);
      });
    };
    launch();
  };

  /**
   * Enable/disable V8 inspector
   */
  CLI.prototype.inspect = function (appName, cb) {
    this.trigger(appName, 'internal:inspect', (err, res) => {
      if (res && res[0]) {
        const msg =
          res[0].data.return === ''
            ? `Inspect disabled on ${appName}`
            : `Inspect enabled on ${appName} => go to chrome : chrome://inspect !!!`;
        Common.printOut(msg);
      } else {
        Common.printOut(`Unable to activate inspect mode on ${appName} !!!`);
      }
      this.exitCli(cst.SUCCESS_EXIT);
    });
  };
};