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
const dayjs       = require('dayjs');
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
   * Install pm2-sysmonit
   */
  CLI.prototype.launchSysMonitoring = function(cb) {
    if ((this.pm2_configuration && this.pm2_configuration.sysmonit != 'true') ||
        process.env.TRAVIS ||
        global.it === 'function' ||
        cst.IS_WINDOWS === true)
      return cb ? cb(null) : null

    let filepath

    try {
      filepath = path.dirname(require.resolve('pm2-sysmonit'))
    } catch(e) {
      return cb ? cb(null) : null
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
    const procs = []
    let printed = 0

    this.Client.executeRemote('getMonitorData', {}, (err, list) => {
      list.forEach(l => {
        if (app_id == l.pm_id) {
          printed++
          const env = Common.safeExtend({}, l.pm2_env)
          Object.keys(env).forEach(key => {
            console.log(`${key}: ${chalk.green(env[key])}`)
          })
        }
      })

      if (printed == 0) {
        Common.err(`Modules with id ${app_id} not found`)
        return cb ? cb.apply(null, arguments) : this.exitCli(cst.ERROR_EXIT);
      }
      return cb ? cb.apply(null, arguments) : this.exitCli(cst.SUCCESS_EXIT);
    })
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

      console.log()
      console.log()
      console.log()
      console.log('```')
      fmt.title('PM2 report')
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
          console.log('```')
          console.log()
          console.log()

          console.log(chalk.bold.green('Please copy/paste the above report in your issue on https://github.com/Unitech/pm2/issues'));

          console.log()
          console.log()
          that.exitCli(cst.SUCCESS_EXIT);
        });
      });
    });
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
        if (!app_name || app_name == app.name)
          pids.push(app.pid);
      })

      if (!cb) {
        Common.printOut(pids.join("\n"))
        return that.exitCli(cst.SUCCESS_EXIT);
      }
      return cb(null, pids);
    })
  }

  /**
   * Create PM2 memory snapshot
   * @method getVersion
   * @callback cb
   */
  CLI.prototype.profile = function(type, time, cb) {
    const that = this;
    const dayjs = require('dayjs');
    let cmd

    if (type == 'cpu') {
      cmd = {
        ext: '.cpuprofile',
        action: 'profileCPU'
      }
    }
    if (type == 'mem') {
      cmd = {
        ext: '.heapprofile',
        action: 'profileMEM'
      }
    }

    const file = path.join(process.cwd(), dayjs().format('dd-HH:mm:ss') + cmd.ext);
    time = time || 10000

    console.log(`Starting ${cmd.action} profiling for ${time}ms...`)
    that.Client.executeRemote(cmd.action, {
      pwd : file,
      timeout: time
    }, function(err) {
      if (err) {
        console.error(err);
        return that.exitCli(1);
      }
      console.log(`Profile done in ${file}`)
      return cb ? cb.apply(null, arguments) : that.exitCli(cst.SUCCESS_EXIT);
    });
  };


  function basicMDHighlight(lines) {
    console.log('\n\n+-------------------------------------+')
    console.log(chalk.bold('README.md content:'))
    lines = lines.split('\n')
    let isInner = false
    lines.forEach(l => {
      if (l.startsWith('#'))
        console.log(chalk.bold.green(l))
      else if (isInner || l.startsWith('```')) {
        if (isInner && l.startsWith('```'))
          isInner = false
        else if (isInner == false)
          isInner = true
        console.log(chalk.gray(l))
      }
      else if (l.startsWith('`'))
        console.log(chalk.gray(l))
      else
        console.log(l)
    })
    console.log('+-------------------------------------+')
  }
  /**
   * pm2 create command
   * create boilerplate of application for fast try
   * @method boilerplate
   */
  CLI.prototype.boilerplate = function(cb) {
    let i = 0
    const projects = []
    const enquirer = require('enquirer')
    const forEach = require('async/forEach')

    fs.readdir(path.join(__dirname, '../templates/sample-apps'), (err, items) => {
      forEach(items, (app, next) => {
        const fp = path.join(__dirname, '../templates/sample-apps', app)
        fs.readFile(path.join(fp, 'package.json'), (err, dt) => {
          const meta = JSON.parse(dt)
          meta.fullpath = fp
          meta.folder_name = app
          projects.push(meta)
          next()
        })
      }, () => {
        const prompt = new enquirer.Select({
          name: 'boilerplate',
          message: 'Select a boilerplate',
          choices: projects.map((p, i) => {
            return {
              message: `${chalk.bold.blue(p.name)} ${p.description}`,
              value: `${i}`
            }
          })
        });

        prompt.run()
          .then(answer => {
            const p = projects[parseInt(answer)]
            basicMDHighlight(fs.readFileSync(path.join(p.fullpath, 'README.md')).toString())
            console.log(chalk.bold(`>> Project copied inside folder ./${p.folder_name}/\n`))
            copyDirSync(p.fullpath, path.join(process.cwd(), p.folder_name));
            this.start(path.join(p.fullpath, 'ecosystem.config.js'), {
              cwd: p.fullpath
            }, () => {
              return cb ? cb.apply(null, arguments) : this.speedList(cst.SUCCESS_EXIT);
            })
          })
          .catch(e => {
            return cb ? cb.apply(null, arguments) : this.speedList(cst.SUCCESS_EXIT);
          });

      })
    })
  }

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
   * Description
   * @method attachToProcess
   */
  CLI.prototype.attach = function(pm_id, separator, cb) {
    const that = this;
    const readline = require('readline');

    if (isNaN(pm_id)) {
      Common.printError('pm_id must be a process number (not a process name)');
      return cb ? cb(Common.retErr('pm_id must be number')) : that.exitCli(cst.ERROR_EXIT);
    }

    if (typeof(separator) == 'function') {
      cb = separator;
      separator = null;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.on('close', function() {
      return cb ? cb() : that.exitCli(cst.SUCCESS_EXIT);
    });

    that.Client.launchBus(function(err, bus, socket) {
      if (err) {
        Common.printError(err);
        return cb ? cb(Common.retErr(err)) : that.exitCli(cst.ERROR_EXIT);
      }

      bus.on('log:*', function(type, packet) {
        if (packet.process.pm_id !== parseInt(pm_id))
          return;
        process.stdout.write(packet.data);
      });
    });

    rl.on('line', function(line) {
      that.sendLineToStdin(pm_id, line, separator, function() {});
    });
  };

  /**
   * Description
   * @method sendDataToProcessId
   */
  CLI.prototype.sendDataToProcessId = function(proc_id, packet, cb) {
    const that = this;

    if (typeof proc_id === 'object' && typeof packet === 'function') {
      // the proc_id is packet.
      cb = packet;
      packet = proc_id;
    } else {
      packet.id = proc_id;
    }

    that.Client.executeRemote('sendDataToProcessId', packet, function(err, res) {
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
    const that = this;

    that.Client.executeRemote('msgProcess', opts, cb);
  };

  /**
   * Trigger a PMX custom action in target application
   * Custom actions allows to interact with an application
   *
   * @method trigger
   * @param  {String|Number} pm_id       process id or application name
   * @param  {String}        action_name name of the custom action to trigger
   * @param  {Mixed}         params      parameter to pass to target action