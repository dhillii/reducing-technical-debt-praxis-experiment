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
   * Check if sysmonit should be skipped
   * @private
   */
  const shouldSkipSysMonit = function() {
    if (this.pm2_configuration && this.pm2_configuration.sysmonit != 'true') {
      return true;
    }
    if (process.env.TRAVIS) {
      return true;
    }
    if (global.it === 'function') {
      return true;
    }
    if (cst.IS_WINDOWS === true) {
      return true;
    }
    return false;
  };

  /**
   * Resolve sysmonit filepath
   * @private
   */
  const resolveSysMonitPath = function() {
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
    if (shouldSkipSysMonit.call(this)) {
      return cb ? cb(null) : null;
    }

    const filepath = resolveSysMonitPath();
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
   * Show application environment
   * @method env
   * @callback cb
   */
  CLI.prototype.env = function(app_id, cb) {
    const procs = [];
    let printed = 0;

    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      list.forEach(l => {
        if (app_id == l.pm_id) {
          printed++;
          const env = Common.safeExtend({}, l.pm2_env);
          Object.keys(env).forEach(key => {
            console.log(`${key}: ${chalk.green(env[key])}`);
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
   * Format markdown heading
   * @private
   */
  const formatMarkdownHeading = function(line) {
    return chalk.bold.green(line);
  };

  /**
   * Format markdown code block
   * @private
   */
  const formatMarkdownCode = function(line) {
    return chalk.gray(line);
  };

  /**
   * Check if line is markdown heading
   * @private
   */
  const isMarkdownHeading = function(line) {
    return line.startsWith('#');
  };

  /**
   * Check if line is markdown code fence
   * @private
   */
  const isMarkdownCodeFence = function(line) {
    return line.startsWith('```');
  };

  /**
   * Check if line is inline code
   * @private
   */
  const isInlineCode = function(line) {
    return line.startsWith('`');
  };

  /**
   * Get version of the daemonized PM2
   * @method report
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
      
      if (cst.IS_WINDOWS === false && process.geteuid) {
        fmt.field('uid', process.geteuid());
      }
      if (cst.IS_WINDOWS === false && process.getegid) {
        fmt.field('gid', process.getegid());
      }

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
   * Check if app_name matches
   * @private
   */
  const appNameMatches = function(app_name, app) {
    return !app_name || app_name == app.name;
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
        if (appNameMatches(app_name, app)) {
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
  const getProfileCommand = function(type) {
    if (type == 'cpu') {
      return {
        ext: '.cpuprofile',
        action: 'profileCPU'
      };
    }
    if (type == 'mem') {
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
    const cmd = getProfileCommand(type);

    if (!cmd) {
      return that.exitCli(1);
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
   * Format markdown line based on content
   * @private
   */
  const formatMarkdownLine = function(line, isInner) {
    if (isMarkdownHeading(line)) {
      return formatMarkdownHeading(line);
    }
    if (isInner || isMarkdownCodeFence(line)) {
      return formatMarkdownCode(line);
    }
    if (isInlineCode(line)) {
      return formatMarkdownCode(line);
    }
    return line;
  };

  /**
   * Process markdown line and update inner state
   * @private
   */
  const processMarkdownLine = function(line, isInner) {
    let newIsInner = isInner;
    if (isInner && isMarkdownCodeFence(line)) {
      newIsInner = false;
    } else if (isInner === false && isMarkdownCodeFence(line)) {
      newIsInner = true;
    }
    return newIsInner;
  };

  function basicMDHighlight(lines) {
    console.log('\n\n+-------------------------------------+');
    console.log(chalk.bold('README.md content:'));
    const lineArray = lines.split('\n');
    let isInner = false;
    
    lineArray.forEach(l => {
      console.log(formatMarkdownLine(l, isInner));
      isInner = processMarkdownLine(l, isInner);
    });
    
    console.log('+-------------------------------------+');
  }

  /**
   * Load boilerplate projects from templates
   * @private
   */
  const loadBoilerplateProjects = function(callback) {
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
   * @private
   */
  const createBoilerplatePrompt = function(projects) {
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
    const that = this;

    loadBoilerplateProjects((projects) => {
      const prompt = createBoilerplatePrompt(projects);

      prompt.run()
        .then(answer => {
          const p = projects[parseInt(answer)];
          basicMDHighlight(fs.readFileSync(path.join(p.fullpath, 'README.md')).toString());
          console.log(chalk.bold(`>> Project copied inside folder ./${p.folder_name}/\n`));
          copyDirSync(p.fullpath, path.join(process.cwd(), p.folder_name));
          that.start(path.join(p.fullpath, 'ecosystem.config.js'), {
            cwd: p.fullpath
          }, () => {
            return cb ? cb.apply(null, arguments) : that.speedList(cst.SUCCESS_EXIT);
          });
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

    let actualSeparator = separator;
    let actualCb = cb;

    if (!actualCb && typeof(actualSeparator) == 'function') {
      actualCb = actualSeparator;
      actualSeparator = null;
    }

    const packet = {
      pm_id : pm_id,
      line : line + (actualSeparator || '\n')
    };

    that.Client.executeRemote('sendLineToStdin', packet, function(err, res) {
      if (err) {
        Common.printError(cst.PREFIX_MSG_ERR + err);
        return actualCb ? actualCb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }
      return actualCb ? actualCb(null, res) : that.speedList();
    });
  };

  /**
   * Check if pm_id is valid number
   * @private
   */
  const