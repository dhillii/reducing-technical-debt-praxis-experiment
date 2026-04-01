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
   * Check if sysmonit should be launched
   * @private
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
   * @private
   */
  const getSysMonitFilepath = () => {
    try {
      return path.dirname(require.resolve('pm2-sysmonit'));
    } catch(e) {
      return null;
    }
  };

  /**
   * Install pm2-sysmonit
   */
  CLI.prototype.launchSysMonitoring = function(cb) {
    if (!shouldLaunchSysMonit.call(this)) {
      return cb ? cb(null) : null;
    }

    const filepath = getSysMonitFilepath();
    if (!filepath) {
      return cb ? cb(null) : null;
    }

    this.start({
      script: filepath
    }, {
      started_as_module : true
    }, (err, res) => {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + 'Error while trying to serve : ' + err.message || err);
        return cb ? cb(err) : this.speedList(cst.ERROR_EXIT);
      }
      return cb ? cb(null) : this.speedList();
    });
  };

  /**
   * Print environment variables for a process
   * @private
   */
  const printProcessEnv = (env) => {
    Object.keys(env).forEach(key => {
      console.log(`${key}: ${chalk.green(env[key])}`);
    });
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
          printProcessEnv(env);
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
   * Print daemon information
   * @private
   */
  const printDaemonInfo = (report) => {
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
   * Print CLI information
   * @private
   */
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

  /**
   * Print system information
   * @private
   */
  const printSystemInfo = () => {
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
   * Print PM2 list and logs
   * @private
   */
  const printPm2ListAndLogs = (list, gl_interact_infos, callback) => {
    const Log = require('./Log');

    fmt.sep();
    fmt.title(chalk.bold.blue('PM2 list'));
    UX.list(list, gl_interact_infos);

    fmt.sep();
    fmt.title(chalk.bold.blue('Daemon logs'));
    Log.tail([{
      path     : cst.PM2_LOG_FILE_PATH,
      app_name : 'PM2',
      type     : 'PM2'
    }], 20, false, callback);
  };

  /**
   * Get version of the daemonized PM2
   * @method report
   */
  CLI.prototype.report = function() {
    this.Client.executeRemote('getReport', {}, (err, report) => {
      console.log();
      console.log();
      console.log();
      console.log('```');
      fmt.title('PM2 report');
      fmt.field('Date', new Date());
      fmt.sep();

      if (report && !err) {
        printDaemonInfo(report);
      }

      fmt.sep();
      printCliInfo();
      fmt.sep();
      printSystemInfo();

      this.Client.executeRemote('getMonitorData', {}, (err, list) => {
        printPm2ListAndLogs(list, this.gl_interact_infos, () => {
          console.log('```');
          console.log();
          console.log();
          console.log(chalk.bold.green('Please copy/paste the above report in your issue on https://github.com/Unitech/pm2/issues'));
          console.log();
          console.log();
          this.exitCli(cst.SUCCESS_EXIT);
        });
      });
    });
  };

  /**
   * Collect PIDs from process list
   * @private
   */
  const collectPids = (list, app_name) => {
    const pids = [];
    list.forEach(function(app) {
      if (!app_name || app_name == app.name) {
        pids.push(app.pid);
      }
    });
    return pids;
  };

  CLI.prototype.getPID = function(app_name, cb) {
    if (typeof(app_name) === 'function') {
      cb = app_name;
      app_name = null;
    }

    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + err);
        return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
      }

      const pids = collectPids(list, app_name);

      if (!cb) {
        Common.printOut(pids.join("\n"));
        return this.exitCli(cst.SUCCESS_EXIT);
      }
      return cb(null, pids);
    });
  };

  /**
   * Get profile command configuration
   * @private
   */
  const getProfileCommand = (type) => {
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
   * Create PM2 memory snapshot
   * @method profile
   */
  CLI.prototype.profile = function(type, time, cb) {
    const cmd = getProfileCommand(type);
    if (!cmd) {
      return this.exitCli(cst.ERROR_EXIT);
    }

    const file = path.join(process.cwd(), dayjs().format('dd-HH:mm:ss') + cmd.ext);
    const profileTime = time || 10000;

    console.log(`Starting ${cmd.action} profiling for ${profileTime}ms...`);
    this.Client.executeRemote(cmd.action, {
      pwd : file,
      timeout: profileTime
    }, (err) => {
      if (err) {
        console.error(err);
        return this.exitCli(1);
      }
      console.log(`Profile done in ${file}`);
      return cb ? cb.apply(null, arguments) : this.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * Highlight markdown content
   * @private
   */
  const basicMDHighlight = (lines) => {
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
        } else if (isInner == false) {
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

  /**
   * Load sample projects from templates
   * @private
   */
  const loadSampleProjects = (callback) => {
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
   * Create enquirer prompt for boilerplate selection
   * @private
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
   * pm2 create command
   * create boilerplate of application for fast try
   * @method boilerplate
   */
  CLI.prototype.boilerplate = function(cb) {
    loadSampleProjects((projects) => {
      const prompt = createBoilerplatePrompt(projects);

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
          return cb ? cb.apply(null, arguments) : this.speedList(cst.SUCCESS_EXIT);
        });
    });
  };

  /**
   * Send line to process stdin
   * @method sendLineToStdin
   */
  CLI.prototype.sendLineToStdin = function(pm_id, line, separator, cb) {
    if (!cb && typeof(separator) == 'function') {
      cb = separator;
      separator = null;
    }

    const packet = {
      pm_id : pm_id,
      line : line + (separator || '\n')
    };

    this.Client.executeRemote('sendLineToStdin', packet, (err, res) => {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + err);
        return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
      }
      return cb ? cb(null, res) : this.speedList();
    });
  };

  /**
   * Validate process ID is numeric
   * @private
   */
  const validateProcessId = (pm_id) => {
    return !isNaN(pm_id);
  };

  /**
   * Setup readline interface for process attachment
   * @private
   */
  const setupReadlineInterface = () => {
    const readline = require('readline');
    return readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  };

  /**
   * Attach to process for interactive communication
   * @method attach
   */
  CLI.prototype.attach = function(pm_id, separator, cb) {
    if (!validateProcessId(pm_id)) {
      Common.printError('pm_id must be a process number (not a process name)');
      return cb ? cb(Common.retErr('pm_id must be number')) : this.exitCli(cst.ERROR_EXIT);
    }

    if (typeof(separator) == 'function') {
      cb = separator;
      separator = null;
    }

    const rl = setupReadlineInterface();

    rl.on('close', () => {
      return cb ? cb() : this