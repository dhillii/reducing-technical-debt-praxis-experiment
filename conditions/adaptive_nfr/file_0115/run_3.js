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
const os = require('os');
const readline = require('readline');

module.exports = function(CLI) {
  // ============ Utility Functions ============

  const executeRemoteCommand = (client, command, params, cb) => {
    client.executeRemote(command, params, (err, result) => {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + (err.message || err));
        return cb ? cb(Common.retErr(err)) : null;
      }
      return cb ? cb(null, result) : null;
    });
  };

  const handleRemoteError = (err, cb, exitCode = cst.ERROR_EXIT) => {
    Common.printError(cst.PREFIX_MSG_ERR + (err.message || err));
    return cb ? cb(Common.retErr(err)) : null;
  };

  const shouldSkipSysMonitoring = () => {
    return (this.pm2_configuration && this.pm2_configuration.sysmonit !== 'true') ||
           process.env.TRAVIS ||
           global.it === 'function' ||
           cst.IS_WINDOWS === true;
  };

  const formatMarkdownHighlight = (lines) => {
    console.log('\n\n+-------------------------------------+');
    console.log(chalk.bold('README.md content:'));
    const lineArray = lines.split('\n');
    let isInner = false;

    lineArray.forEach(l => {
      if (l.startsWith('#')) {
        console.log(chalk.bold.green(l));
      } else if (isInner || l.startsWith('```')) {
        if (isInner && l.startsWith('```')) {
          isInner = false;
        } else if (!isInner) {
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
  };

  const getProfileConfig = (type) => {
    const configs = {
      cpu: { ext: '.cpuprofile', action: 'profileCPU' },
      mem: { ext: '.heapprofile', action: 'profileMEM' }
    };
    return configs[type];
  };

  const normalizeCallback = (arg1, arg2) => {
    if (typeof arg1 === 'function') {
      return { cb: arg1, other: null };
    }
    if (typeof arg2 === 'function') {
      return { cb: arg2, other: arg1 };
    }
    return { cb: null, other: arg1 };
  };

  // ============ CLI Methods ============

  CLI.prototype.getVersion = function(cb) {
    this.Client.executeRemote('getVersion', {}, function(err) {
      return cb ? cb.apply(null, arguments) : this.exitCli(cst.SUCCESS_EXIT);
    });
  };

  CLI.prototype.launchSysMonitoring = function(cb) {
    if (shouldSkipSysMonitoring.call(this)) {
      return cb ? cb(null) : null;
    }

    let filepath;
    try {
      filepath = path.dirname(require.resolve('pm2-sysmonit'));
    } catch(e) {
      return cb ? cb(null) : null;
    }

    this.start({ script: filepath }, { started_as_module: true }, (err) => {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + 'Error while trying to serve : ' + (err.message || err));
        return cb ? cb(err) : this.speedList(cst.ERROR_EXIT);
      }
      return cb ? cb(null) : this.speedList();
    });
  };

  CLI.prototype.env = function(app_id, cb) {
    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      let printed = 0;

      list.forEach(l => {
        if (app_id == l.pm_id) {
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

  CLI.prototype.report = function() {
    const Log = require('./Log');

    this.Client.executeRemote('getReport', {}, (err, report) => {
      console.log('\n\n\n```');
      fmt.title('PM2 report');
      fmt.field('Date', new Date());
      fmt.sep();

      if (report && !err) {
        this._formatDaemonReport(report);
      }

      fmt.sep();
      this._formatCLIReport();
      fmt.sep();
      this._formatSystemInfo();

      this.Client.executeRemote('getMonitorData', {}, (err, list) => {
        fmt.sep();
        fmt.title(chalk.bold.blue('PM2 list'));
        UX.list(list, this.gl_interact_infos);

        fmt.sep();
        fmt.title(chalk.bold.blue('Daemon logs'));
        Log.tail([{
          path: cst.PM2_LOG_FILE_PATH,
          app_name: 'PM2',
          type: 'PM2'
        }], 20, false, () => {
          console.log('```\n\n');
          console.log(chalk.bold.green('Please copy/paste the above report in your issue on https://github.com/Unitech/pm2/issues'));
          console.log('\n\n');
          this.exitCli(cst.SUCCESS_EXIT);
        });
      });
    });
  };

  CLI.prototype._formatDaemonReport = function(report) {
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

  CLI.prototype._formatCLIReport = function() {
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
  };

  CLI.prototype._formatSystemInfo = function() {
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

  CLI.prototype.getPID = function(app_name, cb) {
    const normalized = normalizeCallback(app_name, cb);
    app_name = normalized.other;
    cb = normalized.cb;

    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + err);
        return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
      }

      const pids = list
        .filter(app => !app_name || app_name === app.name)
        .map(app => app.pid);

      if (!cb) {
        Common.printOut(pids.join("\n"));
        return this.exitCli(cst.SUCCESS_EXIT);
      }
      return cb(null, pids);
    });
  };

  CLI.prototype.profile = function(type, time, cb) {
    const cmd = getProfileConfig(type);
    if (!cmd) {
      console.error('Invalid profile type');
      return this.exitCli(cst.ERROR_EXIT);
    }

    const file = path.join(process.cwd(), dayjs().format('dd-HH:mm:ss') + cmd.ext);
    time = time || 10000;

    console.log(`Starting ${cmd.action} profiling for ${time}ms...`);
    this.Client.executeRemote(cmd.action, { pwd: file, timeout: time }, (err) => {
      if (err) {
        console.error(err);
        return this.exitCli(1);
      }
      console.log(`Profile done in ${file}`);
      return cb ? cb.apply(null, arguments) : this.exitCli(cst.SUCCESS_EXIT);
    });
  };

  CLI.prototype.boilerplate = function(cb) {
    const enquirer = require('enquirer');
    const forEach = require('async/forEach');
    const templatesPath = path.join(__dirname, '../templates/sample-apps');

    fs.readdir(templatesPath, (err, items) => {
      const projects = [];

      forEach(items, (app, next) => {
        const fp = path.join(templatesPath, app);
        fs.readFile(path.join(fp, 'package.json'), (err, dt) => {
          const meta = JSON.parse(dt);
          meta.fullpath = fp;
          meta.folder_name = app;
          projects.push(meta);
          next();
        });
      }, () => {
        this._showBoilerplatePrompt(projects, cb);
      });
    });
  };

  CLI.prototype._showBoilerplatePrompt = function(projects, cb) {
    const prompt = new (require('enquirer')).Select({
      name: 'boilerplate',
      message: 'Select a boilerplate',
      choices: projects.map((p, i) => ({
        message: `${chalk.bold.blue(p.name)} ${p.description}`,
        value: `${i}`
      }))
    });

    prompt.run()
      .then(answer => {
        const p = projects[parseInt(answer)];
        formatMarkdownHighlight(fs.readFileSync(path.join(p.fullpath, 'README.md')).toString());
        console.log(chalk.bold(`>> Project copied inside folder ./${p.folder_name}/\n`));
        copyDirSync(p.fullpath, path.join(process.cwd(), p.folder_name));
        this.start(path.join(p.fullpath, 'ecosystem.config.js'), { cwd: p.fullpath }, () => {
          return cb ? cb.apply(null, arguments) : this.speedList(cst.SUCCESS_EXIT);
        });
      })
      .catch(() => {
        return cb ? cb.apply(null, arguments) : this.speedList(cst.SUCCESS_EXIT);
      });
  };

  CLI.prototype.sendLineToStdin = function(pm_id, line, separator, cb) {
    const normalized = normalizeCallback(separator, cb);
    separator = normalized.other;
    cb = normalized.cb;

    const packet = {
      pm_id: pm_id,
      line: line + (separator || '\n')
    };

    this.Client.executeRemote('sendLineToStdin', packet, (err, res) => {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + err);
        return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
      }
      return cb ? cb(null, res) : this.speedList();
    });
  };

  CLI.prototype.attach = function(pm_id, separator, cb) {
    const normalized = normalizeCallback(separator, cb);
    separator = normalized.other;
    cb = normalized.cb;

    if (isNaN(pm_id)) {
      Common.printError('pm_id must be a process number (not a process name)');
      return cb ? cb(Common.retErr('pm_id must be number')) : this.exitCli(cst.ERROR_EXIT);
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.on('close', () => {
      return cb ? cb() : this.exitCli(cst.SUCCESS_EXIT);
    });

    this.Client.launchBus((err, bus) => {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
      }

      bus.on('log:*', (type, packet) => {
        if (packet.process.pm_id === parseInt(pm_id)) {
          process.stdout.write(packet.data);
        }
      });
    });

    rl.on('line', (line) => {
      this.sendLineToStdin(pm_id, line, separator, () => {});
    });
  };

  CLI.prototype.sendDataToProcessId = function(proc_id, packet, cb) {
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

  CLI.prototype.msgProcess = function(opts, cb) {
    this.Client.executeRemote('msgProcess', opts, cb);
  };

  CLI.prototype.trigger = function(pm_id, action_name, params, cb) {
    const normalized = normalizeCallback(params, cb);
    params = normalized.other;
    cb = normalized.cb;

    const cmd = { msg: action_name };
    if (params) cmd.opts = params;
    if (