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
const copyDirSync = require('../tools/copydirSync.js')

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
   * Check if sysmonit should be launched
   * @private
   */
  const shouldSkipSysMonit = () => {
    if (process.env.TRAVIS) return true;
    if (global.it === 'function') return true;
    if (cst.IS_WINDOWS === true) return true;
    return false;
  };

  /**
   * Check if sysmonit is disabled in config
   * @private
   */
  const isSysMonitDisabled = (config) => {
    return config && config.sysmonit !== 'true';
  };

  /**
   * Install pm2-sysmonit
   */
  CLI.prototype.launchSysMonitoring = function(cb) {
    if (shouldSkipSysMonit() || isSysMonitDisabled(this.pm2_configuration)) {
      return cb ? cb(null) : null;
    }

    let filepath;

    try {
      filepath = path.dirname(require.resolve('pm2-sysmonit'));
    } catch(e) {
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
   * Show application environment
   * @method env
   * @callback cb
   */
  CLI.prototype.env = function(app_id, cb) {
    const procs = [];
    let printed = 0;

    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      list.forEach(l => {
        if (app_id !== l.pm_id) return;
        
        printed++;
        const env = Common.safeExtend({}, l.pm2_env);
        Object.keys(env).forEach(key => {
          console.log(`${key}: ${chalk.green(env[key])}`);
        });
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

    that.Client.executeRemote('getReport', {}, function(err, report) {
      console.log();
      console.log();
      console.log();
      console.log('```');
      fmt.title('PM2 report');
      fmt.field('Date', new Date());
      fmt.sep();

      if (report && !err) {
        _printDaemonReport(report);
      }

      _printCliReport();
      _printSystemInfo();

      that.Client.executeRemote('getMonitorData', {}, function(err, list) {
        fmt.sep();
        fmt.title(chalk.bold.blue('PM2 list'));
        UX.list(list, that.gl_interact_infos);

        fmt.sep();
        fmt.title(chalk.bold.blue('Daemon logs'));
        Log.tail([{
          path     : cst.PM2_LOG_FILE_PATH,
          app_name : 'PM2',
          type     : 'PM2'
        }], 20, false, function() {
          console.log('```');
          console.log();
          console.log();
          console.log(chalk.bold.green('Please copy/paste the above report in your issue on https://github.com/Unitech/pm2/issues'));
          console.log();
          console.log();
          that.exitCli(cst.SUCCESS_EXIT);
        });
      });
    });
  };

  /**
   * Print daemon report information
   * @private
   */
  const _printDaemonReport = (report) => {
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
   * Print CLI report information
   * @private
   */
  const _printCliReport = () => {
    fmt.sep();
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
  const _printSystemInfo = () => {
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

      const pids = [];

      list.forEach(function(app) {
        if (!app_name || app_name === app.name) {
          pids.push(app.pid);
        }
      });

      if (!cb) {
        Common.printOut(pids.join("\n"));
        return that.exitCli(cst.SUCCESS_EXIT);
      }
      return cb(null, pids);
    });
  };

  /**
   * Get profile command configuration
   * @private
   */
  const _getProfileCmd = (type) => {
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
   * Create PM2 memory snapshot
   * @method profile
   * @callback cb
   */
  CLI.prototype.profile = function(type, time, cb) {
    const that = this;
    const cmd = _getProfileCmd(type);

    if (!cmd) {
      return that.exitCli(cst.ERROR_EXIT);
    }

    const file = path.join(process.cwd(), dayjs().format('dd-HH:mm:ss') + cmd.ext);
    const profileTime = time || 10000;

    console.log(`Starting ${cmd.action} profiling for ${profileTime}ms...`);
    that.Client.executeRemote(cmd.action, {
      pwd : file,
      timeout: profileTime
    }, function(err) {
      if (err) {
        console.error(err);
        return that.exitCli(1);
      }
      console.log(`Profile done in ${file}`);
      return cb ? cb.apply(null, arguments) : that.exitCli(cst.SUCCESS_EXIT);
    });
  };

  /**
   * Check if line is markdown heading
   * @private
   */
  const _isMarkdownHeading = (line) => line.startsWith('#');

  /**
   * Check if line is code block delimiter
   * @private
   */
  const _isCodeBlockDelimiter = (line) => line.startsWith('```');

  /**
   * Check if line is inline code
   * @private
   */
  const _isInlineCode = (line) => line.startsWith('`');

  /**
   * Print markdown line with appropriate formatting
   * @private
   */
  const _printMarkdownLine = (line, isInner) => {
    if (_isMarkdownHeading(line)) {
      console.log(chalk.bold.green(line));
    } else if (isInner || _isCodeBlockDelimiter(line)) {
      console.log(chalk.gray(line));
    } else if (_isInlineCode(line)) {
      console.log(chalk.gray(line));
    } else {
      console.log(line);
    }
  };

  /**
   * Highlight markdown content
   * @private
   */
  function basicMDHighlight(lines) {
    console.log('\n\n+-------------------------------------+');
    console.log(chalk.bold('README.md content:'));
    const lineArray = lines.split('\n');
    let isInner = false;
    
    lineArray.forEach(l => {
      if (_isCodeBlockDelimiter(l)) {
        isInner = !isInner;
      }
      _printMarkdownLine(l, isInner);
    });
    
    console.log('+-------------------------------------+');
  }

  /**
   * pm2 create command
   * create boilerplate of application for fast try
   * @method boilerplate
   */
  CLI.prototype.boilerplate = function(cb) {
    const enquirer = require('enquirer');
    const forEach = require('async/forEach');
    const that = this;

    fs.readdir(path.join(__dirname, '../templates/sample-apps'), (err, items) => {
      const projects = [];
      let processed = 0;

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
        _showBoilerplatePrompt(projects, that, cb);
      });
    });
  };

  /**
   * Show boilerplate selection prompt
   * @private
   */
  const _showBoilerplatePrompt = (projects, that, cb) => {
    const enquirer = require('enquirer');
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
        _handleBoilerplateSelection(projects, parseInt(answer), that, cb);
      })
      .catch(e => {
        return cb ? cb.apply(null, arguments) : that.speedList(cst.SUCCESS_EXIT);
      });
  };

  /**
   * Handle boilerplate selection
   * @private
   */
  const _handleBoilerplateSelection = (projects, index, that, cb) => {
    const p = projects[index];
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
   * Description
   * @method sendLineToStdin
   */
  CLI.prototype.sendLineToStdin = function(pm_id, line, separator, cb) {
    const that = this;

    if (!cb && typeof(separator) === 'function') {
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
   * Check if pm_id is valid number
   * @private
   */
  const _isValidPmId = (pm_id) => !isNaN(pm_id);

  /**
   * Description
   * @method attachToProcess
   */
  CLI.prototype.attach = function(pm_id, separator, cb) {
    const that = this;
    const readline = require('readline');

    if (!_isValidPmId(pm_id)) {
      Common.printError('pm_id must be a process number (not a process name)');
      return cb ? cb(Common.retErr('pm_id must be number')) : that.exitCli(cst.ERROR_EXIT);
    }

    if (typeof(separator) === 'function') {
      cb = separator;