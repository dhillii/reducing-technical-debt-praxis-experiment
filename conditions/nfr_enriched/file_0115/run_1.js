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

  const executeRemoteCommand = (client, command, params, callback) => {
    client.executeRemote(command, params, (err, result) => {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + (err.message || err));
        return callback ? callback(Common.retErr(err)) : null;
      }
      return callback ? callback(null, result) : null;
    });
  };

  const handleRemoteError = (err, callback, exitCli, exitCode = cst.ERROR_EXIT) => {
    if (err) {
      Common.printError(cst.PREFIX_MSG_ERR + (err.message || err));
      return callback ? callback(Common.retErr(err)) : exitCli(exitCode);
    }
  };

  const shouldSkipSysMonitoring = () => {
    return (this.pm2_configuration && this.pm2_configuration.sysmonit !== 'true') ||
           process.env.TRAVIS ||
           global.it === 'function' ||
           cst.IS_WINDOWS === true;
  };

  const getProfileConfig = (type) => {
    const configs = {
      cpu: { ext: '.cpuprofile', action: 'profileCPU' },
      mem: { ext: '.heapprofile', action: 'profileMEM' }
    };
    return configs[type];
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

  const loadBoilerplateProjects = (callback) => {
    const projects = [];
    const templatesPath = path.join(__dirname, '../templates/sample-apps');
    const forEach = require('async/forEach');

    fs.readdir(templatesPath, (err, items) => {
      if (err) return callback(err, []);

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
      }, () => callback(null, projects));
    });
  };

  const createBoilerplatePrompt = (projects) => {
    const enquirer = require('enquirer');
    return new enquirer.Select({
      name: 'boilerplate',
      message: 'Select a boilerplate',
      choices: projects.map((p, i) => ({
        message: `${chalk.bold.blue(p.name)} ${p.description}`,
        value: `${i}`
      }))
    });
  };

  const printReportSection = (title, fields) => {
    fmt.sep();
    fmt.title(chalk.bold.blue(title));
    Object.entries(fields).forEach(([key, value]) => {
      fmt.field(key, value);
    });
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
        Common.printError(cst.PREFIX_MSG_ERR + (err.message || err));
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
          Object.entries(env).forEach(([key, value]) => {
            console.log(`${key}: ${chalk.green(value)}`);
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
    const that = this;
    const Log = require('./Log');

    this.Client.executeRemote('getReport', {}, (err, report) => {
      console.log('\n\n\n```');
      fmt.title('PM2 report');
      fmt.field('Date', new Date());

      if (report && !err) {
        printReportSection('Daemon', {
          'pm2d version': report.pm2_version,
          'node version': report.node_version,
          'node path': report.node_path,
          'argv': report.argv,
          'argv0': report.argv0,
          'user': report.user,
          'uid': report.uid,
          'gid': report.gid,
          'uptime': dayjs(new Date()).diff(report.started_at, 'minute') + 'min'
        });
      }

      const cliFields = {
        'local pm2': pkg.version,
        'node version': process.versions.node,
        'node path': process.env['_'] || 'not found',
        'argv': process.argv,
        'argv0': process.argv0,
        'user': process.env.USER || process.env.LNAME || process.env.USERNAME
      };

      if (cst.IS_WINDOWS === false && process.geteuid) {
        cliFields['uid'] = process.geteuid();
      }
      if (cst.IS_WINDOWS === false && process.getegid) {
        cliFields['gid'] = process.getegid();
      }

      printReportSection('CLI', cliFields);

      const systemFields = {
        'arch': os.arch(),
        'platform': os.platform(),
        'type': os.type(),
        'cpus': os.cpus()[0].model,
        'cpus nb': Object.keys(os.cpus()).length,
        'freemem': os.freemem(),
        'totalmem': os.totalmem(),
        'home': os.homedir()
      };

      printReportSection('System info', systemFields);

      this.Client.executeRemote('getMonitorData', {}, (err, list) => {
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
          console.log(chalk.bold.green('Please copy/paste the above report in your issue on https://github.com/Unitech/pm2/issues\n\n'));
          that.exitCli(cst.SUCCESS_EXIT);
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
    const config = getProfileConfig(type);
    if (!config) {
      console.error('Invalid profile type');
      return this.exitCli(cst.ERROR_EXIT);
    }

    const file = path.join(process.cwd(), dayjs().format('dd-HH:mm:ss') + config.ext);
    const duration = time || 10000;

    console.log(`Starting ${config.action} profiling for ${duration}ms...`);
    
    this.Client.executeRemote(config.action, { pwd: file, timeout: duration }, (err) => {
      if (err) {
        console.error(err);
        return this.exitCli(cst.ERROR_EXIT);
      }
      console.log(`Profile done in ${file}`);
      return cb ? cb.apply(null, arguments) : this.exitCli(cst.SUCCESS_EXIT);
    });
  };

  CLI.prototype.boilerplate = function(cb) {
    const that = this;

    loadBoilerplateProjects((err, projects) => {
      if (err || !projects.length) {
        return cb ? cb(err) : this.speedList(cst.ERROR_EXIT);
      }

      const prompt = createBoilerplatePrompt(projects);

      prompt.run()
        .then(answer => {
          const selectedProject = projects[parseInt(answer)];
          const readmePath = path.join(selectedProject.fullpath, 'README.md');
          
          formatMarkdownHighlight(fs.readFileSync(readmePath).toString());
          console.log(chalk.bold(`>> Project copied inside folder ./${selectedProject.folder_name}/\n`));
          
          copyDirSync(selectedProject.fullpath, path.join(process.cwd(), selectedProject.folder_name));
          
          that.start(path.join(selectedProject.fullpath, 'ecosystem.config.js'), {
            cwd: selectedProject.fullpath
          }, () => {
            return cb ? cb.apply(null, arguments) : that.speedList(cst.SUCCESS_EXIT);
          });
        })
        .catch(() => {
          return cb ? cb.apply(null, arguments) : that.speedList(cst.SUCCESS_EXIT);
        });
    });
  };

  CLI.prototype.sendLineToStdin = function(pm_id, line, separator, cb) {
    if (!cb && typeof separator === 'function') {
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
    if (typeof params === 'function') {
      cb = params;
      params = null;
    }

    const cmd = { msg: action_name };
    if (params) cmd.opts = params;
    if (isNaN(pm_id)) cmd.name = pm_id;
    else cmd.id = pm_id;

    let counter = 0;
    let processWaitCount = 0;
    const results = [];
    const that = this;

    this.launchBus((