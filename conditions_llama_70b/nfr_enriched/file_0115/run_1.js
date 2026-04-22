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
    const that = this;
    const getVersionCallback = (err) => {
      return cb ? cb.apply(null, arguments) : that.exitCli(cst.SUCCESS_EXIT);
    };

    that.Client.executeRemote('getVersion', {}, getVersionCallback);
  };

  /**
   * Install pm2-sysmonit
   */
  CLI.prototype.launchSysMonitoring = function(cb) {
    if (!shouldLaunchSysMonitoring(this)) {
      return cb ? cb(null) : null;
    }

    const filepath = getSysMonitFilePath();
    if (!filepath) {
      return cb ? cb(null) : null;
    }

    const startOptions = {
      script: filepath,
      started_as_module: true,
    };

    this.start(startOptions, (err, res) => {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + 'Error while trying to serve : ' + err.message || err);
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
  CLI.prototype.env = function(appId, cb) {
    const that = this;
    const getMonitorDataCallback = (err, list) => {
      const printed = printEnvironment(list, appId);
      if (printed === 0) {
        Common.err(`Modules with id ${appId} not found`);
        return cb ? cb.apply(null, arguments) : that.exitCli(cst.ERROR_EXIT);
      }
      return cb ? cb.apply(null, arguments) : that.exitCli(cst.SUCCESS_EXIT);
    };

    this.Client.executeRemote('getMonitorData', {}, getMonitorDataCallback);
  };

  /**
   * Get version of the daemonized PM2
   * @method report
   */
  CLI.prototype.report = function() {
    const that = this;
    const getReportCallback = (err, report) => {
      printReport(report);
      that.Client.executeRemote('getMonitorData', {}, (err, list) => {
        printPM2List(list);
        printDaemonLogs();
        that.exitCli(cst.SUCCESS_EXIT);
      });
    };

    that.Client.executeRemote('getReport', {}, getReportCallback);
  };

  CLI.prototype.getPID = function(appName, cb) {
    const that = this;
    const getMonitorDataCallback = (err, list) => {
      const pids = getPIDs(list, appName);
      if (!cb) {
        Common.printOut(pids.join("\n"));
        return that.exitCli(cst.SUCCESS_EXIT);
      }
      return cb(null, pids);
    };

    this.Client.executeRemote('getMonitorData', {}, getMonitorDataCallback);
  };

  /**
   * Create PM2 memory snapshot
   * @method profile
   * @callback cb
   */
  CLI.prototype.profile = function(type, time, cb) {
    const that = this;
    const profileCallback = (err) => {
      if (err) {
        console.error(err);
        return that.exitCli(1);
      }
      console.log(`Profile done in ${getProfileFilePath(type)}`);
      return cb ? cb.apply(null, arguments) : that.exitCli(cst.SUCCESS_EXIT);
    };

    const cmd = getProfileCommand(type);
    const file = getProfileFilePath(type);
    time = time || 10000;

    console.log(`Starting ${cmd.action} profiling for ${time}ms...`);
    that.Client.executeRemote(cmd.action, {
      pwd: file,
      timeout: time,
    }, profileCallback);
  };

  /**
   * pm2 create command
   * create boilerplate of application for fast try
   * @method boilerplate
   */
  CLI.prototype.boilerplate = function(cb) {
    const that = this;
    const projects = getBoilerplateProjects();
    const prompt = createBoilerplatePrompt(projects);

    prompt.run()
      .then((answer) => {
        const project = projects[parseInt(answer)];
        printBoilerplateReadme(project);
        copyBoilerplateProject(project);
        that.start(path.join(project.fullpath, 'ecosystem.config.js'), {
          cwd: project.fullpath,
        }, () => {
          return cb ? cb.apply(null, arguments) : that.speedList(cst.SUCCESS_EXIT);
        });
      })
      .catch((e) => {
        return cb ? cb.apply(null, arguments) : that.speedList(cst.SUCCESS_EXIT);
      });
  };

  /**
   * Description
   * @method sendLineToStdin
   */
  CLI.prototype.sendLineToStdin = function(pmId, line, separator, cb) {
    const that = this;
    const packet = {
      pm_id: pmId,
      line: line + (separator || '\n'),
    };

    that.Client.executeRemote('sendLineToStdin', packet, (err, res) => {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }
      return cb ? cb(null, res) : that.speedList();
    });
  };

  /**
   * Description
   * @method attachToProcess
   */
  CLI.prototype.attach = function(pmId, separator, cb) {
    const that = this;
    const readline = require('readline');

    if (isNaN(pmId)) {
      Common.printError('pm_id must be a process number (not a process name)');
      return cb ? cb(Common.retErr('pm_id must be number')) : that.exitCli(cst.ERROR_EXIT);
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.on('close', () => {
      return cb ? cb() : that.exitCli(cst.SUCCESS_EXIT);
    });

    that.Client.launchBus((err, bus) => {
      bus.on('log:*', (type, packet) => {
        if (packet.process.pm_id !== parseInt(pmId)) return;
        process.stdout.write(packet.data);
      });
    });

    rl.on('line', (line) => {
      that.sendLineToStdin(pmId, line, separator, () => {});
    });
  };

  // ... rest of the code remains the same ...

  // Helper functions
  function shouldLaunchSysMonitoring(cli) {
    return (
      !cli.pm2_configuration ||
      cli.pm2_configuration.sysmonit === 'true' &&
      !process.env.TRAVIS &&
      global.it !== 'function' &&
      cst.IS_WINDOWS === false
    );
  }

  function getSysMonitFilePath() {
    try {
      return path.dirname(require.resolve('pm2-sysmonit'));
    } catch (e) {
      return null;
    }
  }

  function printEnvironment(list, appId) {
    let printed = 0;
    list.forEach((l) => {
      if (appId === l.pm_id) {
        printed++;
        const env = Common.safeExtend({}, l.pm2_env);
        Object.keys(env).forEach((key) => {
          console.log(`${key}: ${chalk.green(env[key])}`);
        });
      }
    });
    return printed;
  }

  function printReport(report) {
    console.log();
    console.log();
    console.log();
    console.log('```');
    fmt.title('PM2 report');
    fmt.field('Date', new Date());
    fmt.sep();

    if (report && !report.err) {
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
    if (cst.IS_WINDOWS === false && process.geteuid)
      fmt.field('uid', process.geteuid());
    if (cst.IS_WINDOWS === false && process.getegid)
      fmt.field('gid', process.getegid());

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

  function printPM2List(list) {
    fmt.sep();
    fmt.title(chalk.bold.blue('PM2 list'));
    UX.list(list, this.gl_interact_infos);
  }

  function printDaemonLogs() {
    fmt.sep();
    fmt.title(chalk.bold.blue('Daemon logs'));
    const Log = require('./Log');
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
        console.log();
        console.log();
        console.log(
          chalk.bold.green('Please copy/paste the above report in your issue on https://github.com/Unitech/pm2/issues')
        );
        console.log();
        console.log();
      }
    );
  }

  function getPIDs(list, appName) {
    const pids = [];
    list.forEach((app) => {
      if (!appName || appName === app.name) pids.push(app.pid);
    });
    return pids;
  }

  function getProfileCommand(type) {
    if (type === 'cpu') {
      return {
        ext: '.cpuprofile',
        action: 'profileCPU',
      };
    }
    if (type === 'mem') {
      return {
        ext: '.heapprofile',
        action: 'profileMEM',
      };
    }
  }

  function getProfileFilePath(type) {
    return path.join(process.cwd(), dayjs().format('dd-HH:mm:ss') + getProfileCommand(type).ext);
  }

  function getBoilerplateProjects() {
    const projects = [];
    fs.readdir(path.join(__dirname, '../templates/sample-apps'), (err, items) => {
      items.forEach((app) => {
        const fp = path.join(__dirname, '../templates/sample-apps', app);
        fs.readFile(path.join(fp, 'package.json'), (err, dt) => {
          const meta = JSON.parse(dt);
          meta.fullpath = fp;
          meta.folder_name = app;
          projects.push(meta);
        });
      });
    });
    return projects;
  }

  function createBoilerplatePrompt(projects) {
    const prompt = new (require('enquirer')).Select({
      name: 'boilerplate',
      message: 'Select a boilerplate',
      choices: projects.map((p, i) => {
        return {
          message: `${chalk.bold.blue(p.name)} ${p.description}`,
          value: `${i}`,
        };
      }),
    });
    return prompt;
  }

  function printBoilerplateReadme(project) {
    const lines = fs.readFileSync(path.join(project.fullpath, 'README.md')).toString();
    console.log('\n\n+-------------------------------------+');
    console.log(chalk.bold('README.md content:'));
    lines = lines.split('\n');
    let isInner = false;
    lines.forEach((l) => {
      if (l.startsWith('#')) console.log(chalk.bold.green(l));
      else if (isInner || l.startsWith('```')) {
        if (isInner && l.startsWith('```')) isInner = false;
        else if (isInner === false) isInner = true;
        console.log(chalk.gray(l));
      } else if (l.startsWith('`')) console.log(chalk.gray(l));
      else console.log(l);
    });
    console.log('+-------------------------------------+');
  }

  function copyBoilerplateProject(project) {
    console.log(chalk.bold(`>> Project copied inside folder ./${project.folder_name}/\n`));
    copyDirSync(project.fullpath, path.join(process.cwd(), project.folder_name));
  }
};
```