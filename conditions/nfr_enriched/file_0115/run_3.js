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
const readline = require('readline');
const os = require('os');

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
    let isInCodeBlock = false;

    lineArray.forEach(line => {
      if (line.startsWith('#')) {
        console.log(chalk.bold.green(line));
      } else if (line.startsWith('```')) {
        isInCodeBlock = !isInCodeBlock;
        console.log(chalk.gray(line));
      } else if (isInCodeBlock || line.startsWith('`')) {
        console.log(chalk.gray(line));
      } else {
        console.log(line);
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

  const buildServeEnvironment = (opts, servePort, servePath) => {
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

  const printReportHeader = () => {
    console.log('\n\n\n```');
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

  const printCliInfo = () => {
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

  const printSystemInfo = () => {
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
  };

  // ============ CLI Methods ============

  CLI.prototype.getVersion = function(cb) {
    this.Client.executeRemote('getVersion', {}, (err) => {
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
    } catch (e) {
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
      let found = false;

      list.forEach(process => {
        if (app_id === process.pm_id) {
          found = true;
          const env = Common.safeExtend({}, process.pm2_env);
          Object.keys(env).forEach(key => {
            console.log(`${key}: ${chalk.green(env[key])}`);
          });
        }
      });

      if (!found) {
        Common.err(`Modules with id ${app_id} not found`);
        return cb ? cb.apply(null, arguments) : this.exitCli(cst.ERROR_EXIT);
      }
      return cb ? cb.apply(null, arguments) : this.exitCli(cst.SUCCESS_EXIT);
    });
  };

  CLI.prototype.report = function() {
    const Log = require('./Log');

    printReportHeader();

    this.Client.executeRemote('getReport', {}, (err, report) => {
      printDaemonInfo(report);
      fmt.sep();
      printCliInfo();
      printSystemInfo();

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
          console.log(chalk.bold.green('Please copy/paste the above report in your issue on https://github.com/Unitech/pm2/issues\n\n'));
          this.exitCli(cst.SUCCESS_EXIT);
        });
      });
    });
  };

  CLI.prototype.getPID = function(app_name, cb) {
    if (typeof app_name === 'function') {
      cb = app_name;
      app_name = null;
    }

    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + err);
        return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
      }

      const pids = list
        .filter(app => !app_name || app_name === app.name)
        .map(app => app.pid);

      if (!cb) {
        Common.printOut(pids.join('\n'));
        return this.exitCli(cst.SUCCESS_EXIT);
      }
      return cb(null, pids);
    });
  };

  CLI.prototype.profile = function(type, time, cb) {
    const cmd = getProfileConfig(type);
    if (!cmd) {
      console.error(`Unknown profile type: ${type}`);
      return this.exitCli(1);
    }

    const file = path.join(process.cwd(), dayjs().format('dd-HH:mm:ss') + cmd.ext);
    const duration = time || 10000;

    console.log(`Starting ${cmd.action} profiling for ${duration}ms...`);
    
    this.Client.executeRemote(cmd.action, { pwd: file, timeout: duration }, (err) => {
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
        const appPath = path.join(templatesPath, app);
        fs.readFile(path.join(appPath, 'package.json'), (err, data) => {
          if (!err) {
            const meta = JSON.parse(data);
            meta.fullpath = appPath;
            meta.folder_name = app;
            projects.push(meta);
          }
          next();
        });
      }, () => {
        const prompt = new enquirer.Select({
          name: 'boilerplate',
          message: 'Select a boilerplate',
          choices: projects.map((p, i) => ({
            message: `${chalk.bold.blue(p.name)} ${p.description}`,
            value: `${i}`
          }))
        });

        prompt.run()
          .then(answer => {
            const project = projects[parseInt(answer)];
            const readmePath = path.join(project.fullpath, 'README.md');
            formatMarkdownHighlight(fs.readFileSync(readmePath).toString());
            console.log(chalk.bold(`>> Project copied inside folder ./${project.folder_name}/\n`));
            
            copyDirSync(project.fullpath, path.join(process.cwd(), project.folder_name));
            this.start(path.join(project.fullpath, 'ecosystem.config.js'), {
              cwd: project.fullpath
            }, () => {
              return cb ? cb.apply(null, arguments) : this.speedList(cst.SUCCESS_EXIT);
            });
          })
          .catch(() => {
            return cb ? cb.apply(null, arguments) : this.speedList(cst.SUCCESS_EXIT);
          });
      });
    });
  };

  CLI.prototype.sendLineToStdin = function(pm_id, line, separator, cb) {
    if (!cb && typeof separator === 'function') {
      cb = separator;
      separator = null;
    }

    const packet = {
      pm_id,
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
    if (isNaN(pm_id)) {
      Common.printError('pm_id must be a process number (not a process name)');
      return cb ? cb(Common.retErr('pm_id must be number')) : this.exitCli(cst.ERROR_EXIT);
    }

    if (typeof separator === 'function') {
      cb = separator;
      separator = null;
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
    if (typeof params ===