var fs            = require('fs');
var path          = require('path');
var eachLimit     = require('async/eachLimit');
var os            = require('os');
var p             = path;
var cst           = require('../../constants.js');
var pkg           = require('../../package.json');
var pidusage      = require('pidusage');
var util          = require('util');
var debug         = require('debug')('pm2:ActionMethod');
var Utility       = require('../Utility');

/**
 * -- SNIP: constructor function start --
 */
module.exports = function(God) {
  /**
   * Retrieves monitoring data for all processes.
   * @param {Object} env - Environment object (unused)
   * @param {Function} cb - Callback receiving (err, processes)
   */
  God.getMonitorData = function getMonitorData(env, cb) {
    const processes = God.getFormatedProcesses();
    const pids = processes.filter(filterBadProcess).map(getProcessId);

    if (pids.length === 0) {
      return cb(null, processes.map(setEmptyMonitData));
    }

    pidusage(pids, function retPidUsage(err, statistics) {
      if (err || !statistics) {
        console.error(err ? 'Error caught while calling pidusage' : 'Statistics is not defined!');
        console.error(err);

        return cb(null, processes.map(setEmptyMonitData));
      }

      const updatedProcesses = processes.map(process => mapMonitData(process, statistics));
      cb(null, updatedProcesses);
    });
  };

  /**
   * Dumps the current list of processes to disk.
   * @param {Function} cb - Callback receiving (err, { success: boolean, process_list: Array })
   */
  God.dumpProcessList = function(cb) {
    const apps = Utility.clone(God.getFormatedProcesses());
    const processList = [];

    if (!apps[0]) {
      debug('[PM2] Did not override dump file because list of processes is empty');
      return cb(null, {success:true, process_list: processList});
    }

    function fin(err) {
      if (processList.length > 0) {
        attemptDumpFileWrite(processList);
      } else {
        tryFixEmptyDumpFile();
      }
      return cb(null, {success:true, process_list: processList});
    }

    function saveProc(apps) {
      if (!apps[0]) return fin(null);
      const app = apps[0];
      delete app.pm2_env.instances;
      delete app.pm2_env.pm_id;

      if (!app.pm2_env.pmx_module) {
        processList.push(app.pm2_env);
      }

      apps.shift();
      return saveProc(apps);
    }

    function tryFixEmptyDumpFile() {
      if (!fs.existsSync(cst.DUMP_FILE_PATH) && typeof God.clearDump === 'function') {
        God.clearDump(() => {});
      }
    }

    function attemptDumpFileWrite(processList) {
      try {
        if (fs.existsSync(cst.DUMP_FILE_PATH)) {
          fs.writeFileSync(cst.DUMP_BACKUP_FILE_PATH, fs.readFileSync(cst.DUMP_FILE_PATH));
        }
        fs.writeFileSync(cst.DUMP_FILE_PATH, JSON.stringify(processList));
      } catch (e) {
        console.error(e.stack || e);
        try {
          if (fs.existsSync(cst.DUMP_BACKUP_FILE_PATH)) {
            fs.writeFileSync(cst.DUMP_FILE_PATH, fs.readFileSync(cst.DUMP_BACKUP_FILE_PATH));
          }
        } catch (e2) {
          fs.unlinkSync(cst.DUMP_FILE_PATH);
          console.error(e2.stack || e2);
        }
      }
    }

    saveProc(apps);
  };

  /**
   * Simple health check endpoint.
   * @param {Object} env - Environment object (unused)
   * @param {Function} cb - Callback receiving (err, {msg: 'pong'})
   */
  God.ping = function(env, cb) {
    return cb(null, {msg : 'pong'});
  };

  /**
   * Marks PM2 as being killed.
   */
  God.notifyKillPM2 = function() {
    God.pm2_being_killed = true;
  };

  /**
   * Duplicates a process by ID.
   * @param {Number} id - Process identifier
   * @param {Function} cb - Callback receiving (err, clonedProcess)
   */
  God.duplicateProcessId = function(id, cb) {
    if (!(id in God.clusters_db)) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env) {
      return cb(God.logAndGenerateError('Error when getting proc || proc.pm2_env'), {});
    }

    const proc = Utility.clone(God.clusters_db[id].pm2_env);

    delete proc.created_at;
    delete proc.pm_id;
    delete proc.unique_id;
    proc.unique_id = Utility.generateUUID();

    God.injectVariables(proc, function inject(_err, proc) {
      return God.executeApp(Utility.clone(proc), function (err, clu) {
        if (err) return cb(err);
        God.notify('start', clu, true);
        return cb(err, Utility.clone(clu));
      });
    });
  };

  /**
   * Starts a stopped process by ID.
   * @param {Number} id - Process identifier
   * @param {Function} cb - Callback receiving (err, process)
   */
  God.startProcessId = function(id, cb) {
    if (!(id in God.clusters_db)) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    const proc = God.clusters_db[id];

    if (proc.pm2_env.status === cst.ONLINE_STATUS) {
      return cb(God.logAndGenerateError('process already online'), {});
    }
    if (proc.pm2_env.status === cst.LAUNCHING_STATUS) {
      return cb(God.logAndGenerateError('process already started'), {});
    }
    if (proc.process && proc.process.pid) {
      return cb(God.logAndGenerateError('Process with pid ' + proc.process.pid + ' already exists'), {});
    }

    return God.executeApp(God.clusters_db[id].pm2_env, function(err, proc) {
      return cb(err, Utility.clone(proc));
    });
  };

  /**
   * Stops a process by ID.
   * @param {Object|Number}id - Process identifier or object containing id
   * @param {Function} cb - Callback receiving (err, process)
   */
  God.stopProcessId = function(id, cb) {
    if (typeof id === 'object' && 'id' in id) id = id.id;

    if (!(id in God.clusters_db)) {
      return cb(God.logAndGenerateError(id + ' : id unknown'), {});
    }

    const proc = God.clusters_db[id];

    clearTimeout(proc.pm2_env.restart_task);

    if (proc.pm2_env.status === cst.STOPPED_STATUS) {
      proc.process.pid = 0;
      return cb(null, God.getFormatedProcess(id));
    }

    if (proc.state && proc.state === 'none') {
      return setTimeout(function() { God.stopProcessId(id, cb); }, 250);
    }

    console.log('Stopping app:%s id:%s', proc.pm2_env.name, proc.pm2_env.pm_id);
    proc.pm2_env.status = cst.STOPPING_STATUS;

    if (!proc.process.pid) {
      console.error('app=%s id=%d does not have a pid', proc.pm2_env.name, proc.pm2_env.pm_id);
      proc.pm2_env.status = cst.STOPPED_STATUS;
      return cb(null, { error : true, message : 'could not kill process w/o pid'});
    }

    God.killProcess(proc.process.pid, proc.pm2_env, function(err) {
      proc.pm2_env.status = cst.STOPPED_STATUS;
      God.notify('exit', proc);

      if (err && err.type && err.type === 'timeout') {
        console.error('app=%s id=%d pid=%s could not be stopped',
                      proc.pm2_env.name,
                      proc.pm2_env.pm_id,
                      proc.process.pid);
        proc.pm2_env.status = cst.ERRORED_STATUS;
        return cb(null, God.getFormatedProcess(id));
      }

      if (!proc.pm2_env.pm_id.toString().startsWith('_old_')) {
        try {
          fs.unlinkSync(proc.pm2_env.pm_pid_path);
        } catch (e) {}
      }

      proc.pm2_env.axm_actions = [];
      proc.pm2_env.axm_monitor = {};
      proc.process.pid = 0;

      return cb(null, God.getFormatedProcess(id));
    });
  };

  /**
   * Resets metadata for a process (restart time, unstable_restarts etc.)
   * @param {Number} id - Process identifier
   * @param {Function} cb - Callback receiving (err, processes)
   */
  God.resetMetaProcessId = function(id, cb) {
    if (!(id in God.clusters_db)) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env) {
      return cb(God.logAndGenerateError('Error when getting proc || proc.pm2_env'), {});
    }

    const proc = God.clusters_db[id];
    proc.pm2_env.created_at = Utility.getDate();
    proc.pm2_env.unstable_restarts = 0;
    proc.pm2_env.restart_time = 0;

    return cb(null, God.getFormatedProcesses());
  };

  /**
   * Deletes a process by ID (stops + removes from cluster DB).
   * @param {Number} id - Process identifier
   * @param {Function} cb - Callback receiving (err, process)
   */
  God.deleteProcessId = function(id, cb) {
    God.deleteCron(id);
    God.stopProcessId(id, function(err, proc) {
      if (err) return cb(God.logAndGenerateError(err), {});
      delete God.clusters_db[id];

      if (Object.keys(God.clusters_db).length === 0) God.next_id = 0;
      return cb(null, proc);
    });
    return false;
  };

  /**
   * Restarts a process by ID (stops if running, then starts).
   * @param {{ id: Number, env?: Object }} opts - Options
   * @param {Function} cb - Callback receiving (err, process)
   */
  God.restartProcessId = function(opts, cb) {
    const id = opts.id;
    const env = opts.env || {};

    if (typeof id === 'undefined') {
      return cb(God.logAndGenerateError('opts.id not passed to restartProcessId', opts));
    }
    if (!(id in God.clusters_db)) {
      return cb(God.logAndGenerateError('God db process id unknown'), {});
    }

    const proc = God.clusters_db[id];

    God.resetState(proc.pm2_env);
    God.deleteCron(id);

    Utility.extend(proc.pm2_env.env, env);
    Utility.extendExtraConfig(proc, opts);

    if (God.pm2_being_killed) {
      return cb(God.logAndGenerateError('[RestartProcessId] PM2 is being killed, stopping restart procedure...'));
    }

    if (proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS) {
      God.stopProcessId(id, function(err) {
        if (God.pm2_being_killed) {
          return cb(God.logAndGenerateError('[RestartProcessId] PM2 is being killed, stopping restart procedure...'));
        }
        proc.pm2_env.restart_time += 1;
        return God.startProcessId(id, cb);
      });
      return false;
    } else {
      debug('[restart] process not online, starting it');
      return God.startProcessId(id, cb);
    }
  };

  /**
   * Restarts all processes by name.
   * @param {String} name - Application name
   * @param {Function} cb - Callback receiving (err, processes)
   */
  God.restartProcessName = function(name, cb) {
    const processes = God.findByName(name);

    if (!processes || processes.length === 0) {
      return cb(God.logAndGenerateError('Unknown process'), {});
    }

    eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      if (God.pm2_being_killed) return next('[Watch] PM2 is being killed, stopping restart procedure...');
      if (proc.pm2_env.status === cst.ONLINE_STATUS) {
        return God.restartProcessId({id:proc.pm2_env.pm_id}, next);
      }
      else if (proc.pm2_env.status !== cst.STOPPING_STATUS &&
               proc.pm2_env.status !== cst.LAUNCHING_STATUS) {
        return God.startProcessId(proc.pm2_env.pm_id, next);
      }
      else {
        return next(util.format('[Watch] Process name %s is being stopped so I won\'t restart it', name));
      }
    }, function(err) {
      if (err) return cb(God.logAndGenerateError(err));
      return cb(null, God.getFormatedProcesses());
    });

    return false;
  };

  /**
   * Sends a system signal to a process ID.
   * @param {{ process_id: Number, signal: String }} opts - Options
   * @param {Function} cb - Callback receiving (err, processes)
   */
  God.sendSignalToProcessId = function(opts, cb) {
    const id = opts.process_id;
    const signal = opts.signal;

    if (!(id in God.clusters_db)) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    const pid = God.clusters_db[id].process.pid;

    try {
      process.kill(pid, signal);
      return cb(null, God.getFormatedProcesses());
    } catch(e) {
      return cb(God.logAndGenerateError('Error when sending signal (signal unknown)'), {});
    }
  };

  /**
   * Sends a signal to all processes matched by name.
   * @param {{ process_name: String, signal: String }} opts - Options
   * @param {Function} cb - Callback receiving (err, processes)
   */
  God.sendSignalToProcessName = function(opts, cb) {
    const processes = God.findByName(opts.process_name);
    const signal = opts.signal;

    if (!processes || processes.length === 0) {
      return cb(God.logAndGenerateError('Unknown process name'), {});
    }

    eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      if (proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS) {
        try {
          process.kill(proc.process.pid, signal);
        } catch(e) {
          return next(e);
        }
      }
      return setTimeout(next, 200);
    }, function(err) {
      if (err) return cb(God.logAndGenerateError(err), {});
      return cb(null, God.getFormatedProcesses());
    });
  };

  /**
   * Disables file watching for all or specific apps.
   * @param {String} method - 'stopAll', 'deleteAll', or method using ProcessId/Name
   * @param {String|Number} value - Value depending on method
   * @param {Function} fn - Callback receiving (err, {success: true})
   */
  God.stopWatch = function(method, value, fn) {
    if (method === 'stopAll' || method === 'deleteAll') {
      God.getFormatedProcesses().forEach(function(proc) {
        God.clusters_db[proc.pm_id].pm2_env.watch = false;
        God.watch.disable(God.clusters_db[proc.pm_id].pm2_env);
      });
    } else {
      let env = null;

      if (method.indexOf('ProcessId') !== -1) {
        env = God.clusters_db[value];
      } else if (method.indexOf('ProcessName') !== -1) {
        env = God.clusters_db[God.findByName(value)];
      }

      if (env) {
        God.watch.disable(env.pm2_env);
        env.pm2_env.watch = false;
      }
    }
    return fn(null, {success:true});
  };

  /**
   * Toggles watching for a specific process.
   * @param {String} method - Method name
   * @param {Object|Number} value - Process ID or identifier
   * @param {Function} fn - Callback receiving (err, {success: true})
   */
  God.toggleWatch = function(method, value, fn) {
    let env = null;

    if (method === 'restartProcessId') {
      env = God.clusters_db[value.id];
    } else if (method.indexOf('restartProcessName') !== -1) {
      env = God.clusters_db[God.findByName(value)];
    }

    if (env) {
      env.pm2_env.watch = !env.pm2_env.watch;
      if (env.pm2_env.watch) {
        God.watch.enable(env.pm2_env);
      } else {
        God.watch.disable(env.pm2_env);
      }
    }

    return fn(null, {success:true});
  };

  /**
   * Enables watching for a specific process.
   * @param {String} method - Method name
   * @param {Object|Number} value - Process ID or identifier
   * @param {Function} fn - Callback receiving (err, {success: true})
   */
  God.startWatch = function(method, value, fn) {
    let env = null;

    if (method === 'restartProcessId') {
      env = God.clusters_db[value.id];
    } else if (method.indexOf('restartProcessName') !== -1) {
      env = God.clusters_db[God.findByName(value)];
    }

    if (env) {
      if (env.pm2_env.watch) {
        return fn(null, {success:true, notrestarted:true});
      }

      God.watch.enable(env.pm2_env);
      env.pm2_env.watch = true;
    }

    return fn(null, {success:true});
  };

  /**
   * Reloads logs for all processes.
   * @param {{}} opts - Unused options
   * @param {Function} cb - Callback receiving (err, {})
   */
  God.reloadLogs = function(opts, cb) {
    console.log('Reloading logs...');
    const processIds = Object.keys(God.clusters_db);

    processIds.forEach(function (id) {
      const cluster = God.clusters_db[id];

      console.log('Reloading logs for process id %d', id);

      if (cluster && cluster.pm2_env) {
        if (cluster.send && cluster.pm2_env.exec_mode === 'cluster_mode') {
          try {
            cluster.send({ type:'log:reload' });
          } catch(e) {
            console.error(e.message || e);
          }
        } else if (cluster._reloadLogs) {
          cluster._reloadLogs(function(err) {
            if (err) God.logAndGenerateError(err);
          });
        }
      }
    });

    return cb(null, {});
  };

  /**
   * Sends a line to the stdin of a fork-mode process.
   * @param {{ pm_id: Number, line: String }} packet - Input data
   * @param {Function} cb - Callback receiving (err, { pm_id, line })
   */
  God.sendLineToStdin = function(packet, cb) {
    if (typeof(packet.pm_id) === 'undefined' || !packet.line) {
      return cb(God.logAndGenerateError('pm_id or line field missing'), {});
    }

    const pm_id = packet.pm_id;
    const line  = packet.line;
    const proc  = God.clusters_db[pm_id];

    if (!proc) {
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> unknown.'), {});
    }
    if (proc.pm2_env.exec_mode === 'cluster_mode') {
      return cb(God.logAndGenerateError('Cannot send line to processes in cluster mode'), {});
    }
    if (proc.pm2_env.status !== cst.ONLINE_STATUS && proc.pm2_env.status !== cst.LAUNCHING_STATUS) {
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> offline.'), {});
    }

    try {
      proc.stdin.write(line, function() {
        return cb(null, {
          pm_id : pm_id,
          line : line
        });
      });
    } catch(e) {
      return cb(God.logAndGenerateError(e), {});
    }
  };

  /**
   * Sends arbitrary data to a process via .send().
   * @param {{ id: Number, data: *, topic: String }} packet - Input data
   * @param {Function} cb - Callback receiving (err, { success: true, data })
   */
  God.sendDataToProcessId = function(packet, cb) {
    if (typeof(packet.id) === 'undefined' ||
        typeof(packet.data) === 'undefined' ||
        !packet.topic) {
      return cb(God.logAndGenerateError('ID, DATA or TOPIC field is missing'), {});
    }

    const pm_id = packet.id;
    const data  = packet.data;

    const proc = God.clusters_db[pm_id];

    if (!proc) {
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> unknown.'), {});
    }
    if (proc.pm2_env.status !== cst.ONLINE_STATUS && proc.pm2_env.status !== cst.LAUNCHING_STATUS) {
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> offline.'), {});
    }

    try {
      proc.send(packet);
    } catch(e) {
      return cb(God.logAndGenerateError(e), {});
    }

    return cb(null, {
      success: true,
      data   : packet
    });
  };

  /**
   * Sends a message to one or many processes (via axm_actions).
   * @param {{ id? : Number, name? : String, msg : String, opts? : Object }} cmd - Message request
   * @param {Function} cb - Callback with result summary
   */
  God.msgProcess = function(cmd, cb) {
    if ('id' in cmd) {
      const id = cmd.id;
      if (!(id in God.clusters_db)) {
        return cb(God.logAndGenerateError(id + ' id unknown'), {});
      }

      const proc = God.clusters_db[id];
      let action_exist = false;

      proc.pm2_env.axm_actions.forEach(function(action) {
        if (action.action_name === cmd.msg) {
          action_exist = true;
          action.output = [];
        }
      });

      if (!action_exist) {
        return cb(God.logAndGenerateError('Action doesn\'t exist ' + cmd.msg + ' for ' + proc.pm2_env.name), {});
      }

      if (proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS) {
        if (cmd.opts == null && !cmd.uuid) {
          proc.send(cmd.msg);
        } else {
          proc.send(cmd);
        }
        return cb(null, { process_count : 1, success : true });
      } else {
        return cb(God.logAndGenerateError(id + ' : id offline'), {});
      }
    }

    else if ('name' in cmd) {
      const name = cmd.name;
      const arr = Object.keys(God.clusters_db);
      let sent = 0;

      (function ex(arr) {
        if (!arr[0]) {
          return cb(null, {
            process_count : sent,
            success : true
          });
        }

        const id = arr[0];
        const clu = God.clusters_db[id];

        if (!clu || !clu.pm2_env) {
          arr.shift();
          return ex(arr);
        }

        const proc_env = clu.pm2_env;
        const isActionAvailable = proc_env.axm_actions.some(action => action.action_name === cmd.msg);

        if (!isActionAvailable) {
          arr.shift();
          return ex(arr);
        }

        if ((p.basename(proc_env.pm_exec_path) === name ||
             proc_env.name === name ||
             proc_env.namespace === name ||
             name === 'all') &&
            (proc_env.status === cst.ONLINE_STATUS ||
             proc_env.status === cst.LAUNCHING_STATUS)) {

          let doesActionExist = false;
          proc_env.axm_actions.forEach(function(action) {
            if (action.action_name === cmd.msg) doesActionExist = true;
          });

          if (!doesActionExist || proc_env.axm_actions.length === 0) {
            arr.shift();
            return ex(arr);
          }

          if (cmd.opts === null) {
            clu.send(cmd.msg);
          } else {
            clu.send(cmd);
          }

          sent++;
        }

        arr.shift();
        return ex(arr);
      })(arr);
    }

    else return cb(God.logAndGenerateError('method requires name or id field'), {});
    return false;
  };

  /**
   * Returns current PM2 version.
   * @param {{}} env - Unused env object
   * @param {Function} cb - Callback receiving (err, version string)
   */
  God.getVersion = function(env, cb) {
    process.nextTick(function() {
      return cb(null, pkg.version);
    });
  };

  /**
   * Enables process monitoring for a process ID.
   * @param {Number} pm_id - Process ID
   * @param {Function} cb - Callback receiving (err, { success, pm_id })
   */
  God.monitor = function Monitor(pm_id, cb) {
    if (!God.clusters_db[pm_id] || !God.clusters_db[pm_id].pm2_env) {
      return cb(new Error('Unknown pm_id'));
    }

    God.clusters_db[pm_id].pm2_env._km_monitored = true;
    return cb(null, { success : true, pm_id : pm_id });
  };

  /**
   * Disables process monitoring for a process ID.
   * @param {Number} pm_id - Process ID
   * @param {Function} cb - Callback receiving (err, { success, pm_id })
   */
  God.unmonitor = function Monitor(pm_id, cb) {
    if (!God.clusters_db[pm_id] || !God.clusters_db[pm_id].pm2_env) {
      return cb(new Error('Unknown pm_id'));
    }

    God.clusters_db[pm_id].pm2_env._km_monitored = false;
    return cb(null, { success : true, pm_id : pm_id });
  };

  /**
   * Returns system report.
   * @param {{}} arg - Unused argument
   * @param {Function} cb - Callback receiving (err, report)
   */
  God.getReport = function(arg, cb) {
    const report = {
      pm2_version : pkg.version,
      node_version : 'N/A',
      node_path : process.env['_'] || 'not found',
      argv0 : process.argv0,
      argv : process.argv,
      user : process.env.USER,
      uid : (cst.IS_WINDOWS === false && process.geteuid) ? process.geteuid() : 'N/A',
      gid : (cst.IS_WINDOWS === false && process.getegid) ? process.getegid() : 'N/A',
      env : process.env,
      managed_apps : Object.keys(God.clusters_db).length,
      started_at : God.started_at
    };

    if (process.versions && process.versions.node) {
      report.node_version = process.versions.node;
    }

    process.nextTick(function() {
      return cb(null, report);
    });
  };
};

/**
 * Checks if a process is eligible for monitoring data.
 * @param {Object} pro - Process object
 * @return {Boolean} isEligible
 */
function filterBadProcess(pro) {
  if (pro.pm2_env.status !== cst.ONLINE_STATUS) return false;
  if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
    if (isNaN(pro.pm2_env.axm_options.pid)) return false;
  }
  return true;
}

/**
 * Extracts process PID. Prefers `axm_options.pid` if present.
 * @param {Object} pro - Process object
 * @return {Number} pid
 */
function getProcessId(pro) {
  let pid = pro.pid;
  if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
    pid = pro.pm2_env.axm_options.pid;
  }
  return pid;
}

/**
 * Returns a monitor data structure with empty memory/cpu.
 * @param {Object} pro - Process to attach monit to
 * @return {Object} modified process
 */
function setEmptyMonitData(pro) {
  pro.monit = {
    memory : 0,
    cpu : 0
  };
  return pro;
}

/**
 * Maps monitored data to a process.
 * @param {Object} processObj - Raw process object
 * @param {Object} statistics - Statistics from pidusage
 * @return {Object} modified process
 */
function mapMonitData(processObj, statistics) {
  let stat = null;
  const pid = getProcessId(processObj);
  if (processObj.pm2_env.status === cst.ONLINE_STATUS) {
    stat = statistics[pid];
  }

  if (!stat) {
    processObj.monit = { memory : 0, cpu : 0 };
    return processObj;
  }

  processObj.monit = {
    memory: stat.memory,
    cpu : Math.round(stat.cpu * 10) / 10
  };

  return processObj;
}