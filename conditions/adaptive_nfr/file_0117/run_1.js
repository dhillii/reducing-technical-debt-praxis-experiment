'use strict';

const fs            = require('fs');
const path          = require('path');
const eachLimit     = require('async/eachLimit');
const os            = require('os');
const p             = path;
const cst           = require('../../constants.js');
const pkg           = require('../../package.json');
const pidusage      = require('pidusage');
const util          = require('util');
const debug         = require('debug')('pm2:ActionMethod');
const Utility       = require('../Utility');

module.exports = function(God) {
  God.getMonitorData = function getMonitorData(env, cb) {
    const processes = God.getFormatedProcesses();
    const pids = processes.filter(filterBadProcess)
      .map(function(pro) {
        return getProcessId(pro);
      });

    if (pids.length === 0) {
      return cb(null, attachEmptyMonitData(processes));
    }

    pidusage(pids, function retPidUsage(err, statistics) {
      if (err) {
        console.error('Error caught while calling pidusage');
        console.error(err);
        return cb(null, attachEmptyMonitData(processes));
      }

      if (!statistics) {
        console.error('Statistics is not defined!');
        return cb(null, attachEmptyMonitData(processes));
      }

      const processesWithMonit = processes.map(function(pro) {
        return attachMonitData(pro, statistics);
      });

      cb(null, processesWithMonit);
    });
  };

  God.dumpProcessList = function(cb) {
    const process_list = [];
    const apps         = Utility.clone(God.getFormatedProcesses());
    const that = this;

    if (!apps[0]) {
      debug('[PM2] Did not override dump file because list of processes is empty');
      return cb(null, {success:true, process_list: process_list});
    }

    function fin(err) {
      if (process_list.length === 0) {
        if (!fs.existsSync(cst.DUMP_FILE_PATH) && typeof that.clearDump === 'function') {
          that.clearDump(function(){});
        }
        return cb(null, {success:true, process_list: process_list});
      }

      backupDumpFile();
      writeDumpFile(process_list);
      return cb(null, {success:true, process_list: process_list});
    }

    function saveProc(apps) {
      if (!apps[0])
        return fin(null);
      delete apps[0].pm2_env.instances;
      delete apps[0].pm2_env.pm_id;
      if (!apps[0].pm2_env.pmx_module)
        process_list.push(apps[0].pm2_env);
      apps.shift();
      return saveProc(apps);
    }

    saveProc(apps);
  };

  God.ping = function(env, cb) {
    return cb(null, {msg : 'pong'});
  };

  God.notifyKillPM2 = function() {
    God.pm2_being_killed = true;
  };

  God.duplicateProcessId = function(id, cb) {
    if (!(id in God.clusters_db))
      return cb(God.logAndGenerateError(id + ' id unknown'), {});

    if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env)
      return cb(God.logAndGenerateError('Error when getting proc || proc.pm2_env'), {});

    const proc = Utility.clone(God.clusters_db[id].pm2_env);

    delete proc.created_at;
    delete proc.pm_id;
    delete proc.unique_id;

    proc.unique_id = Utility.generateUUID();

    God.injectVariables(proc, function inject (_err, proc) {
      return God.executeApp(Utility.clone(proc), function (err, clu) {
        if (err) return cb(err);
        God.notify('start', clu, true);
        return cb(err, Utility.clone(clu));
      });
    });
  };

  God.startProcessId = function(id, cb) {
    if (!(id in God.clusters_db))
      return cb(God.logAndGenerateError(id + ' id unknown'), {});

    const proc = God.clusters_db[id];
    
    if (proc.pm2_env.status == cst.ONLINE_STATUS)
      return cb(God.logAndGenerateError('process already online'), {});
    if (proc.pm2_env.status == cst.LAUNCHING_STATUS)
      return cb(God.logAndGenerateError('process already started'), {});
    if (proc.process && proc.process.pid)
      return cb(God.logAndGenerateError('Process with pid ' + proc.process.pid + ' already exists'), {});

    return God.executeApp(God.clusters_db[id].pm2_env, function(err, proc) {
      return cb(err, Utility.clone(proc));
    });
  };

  God.stopProcessId = function(id, cb) {
    if (typeof id == 'object' && 'id' in id)
      id = id.id;

    if (!(id in God.clusters_db))
      return cb(God.logAndGenerateError(id + ' : id unknown'), {});

    const proc = God.clusters_db[id];

    clearTimeout(proc.pm2_env.restart_task);

    if (proc.pm2_env.status == cst.STOPPED_STATUS) {
      proc.process.pid = 0;
      return cb(null, God.getFormatedProcess(id));
    }

    if (proc.state && proc.state === 'none')
      return setTimeout(function() { God.stopProcessId(id, cb); }, 250);

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

      if (isKillTimeout(err)) {
        console.error('app=%s id=%d pid=%s could not be stopped',
                      proc.pm2_env.name,
                      proc.pm2_env.pm_id,
                      proc.process.pid);
        proc.pm2_env.status = cst.ERRORED_STATUS;
        return cb(null, God.getFormatedProcess(id));
      }

      cleanupProcessFiles(proc);
      clearProcessMetadata(proc);
      proc.process.pid = 0;
      return cb(null, God.getFormatedProcess(id));
    });
  };

  God.resetMetaProcessId = function(id, cb) {
    if (!(id in God.clusters_db))
      return cb(God.logAndGenerateError(id + ' id unknown'), {});

    if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env)
      return cb(God.logAndGenerateError('Error when getting proc || proc.pm2_env'), {});

    God.clusters_db[id].pm2_env.created_at = Utility.getDate();
    God.clusters_db[id].pm2_env.unstable_restarts = 0;
    God.clusters_db[id].pm2_env.restart_time = 0;

    return cb(null, God.getFormatedProcesses());
  };

  God.deleteProcessId = function(id, cb) {
    God.deleteCron(id);

    God.stopProcessId(id, function(err, proc) {
      if (err) return cb(God.logAndGenerateError(err), {});
      delete God.clusters_db[id];

      if (Object.keys(God.clusters_db).length == 0)
        God.next_id = 0;
      return cb(null, proc);
    });
    return false;
  };

  God.restartProcessId = function(opts, cb) {
    const id = opts.id;
    const env = opts.env || {};

    if (typeof(id) === 'undefined')
      return cb(God.logAndGenerateError('opts.id not passed to restartProcessId', opts));
    if (!(id in God.clusters_db))
      return cb(God.logAndGenerateError('God db process id unknown'), {});

    const proc = God.clusters_db[id];

    God.resetState(proc.pm2_env);
    God.deleteCron(id);

    Utility.extend(proc.pm2_env.env, env);
    Utility.extendExtraConfig(proc, opts);

    if (God.pm2_being_killed) {
      return cb(God.logAndGenerateError('[RestartProcessId] PM2 is being killed, stopping restart procedure...'));
    }

    if (isProcessOnline(proc)) {
      God.stopProcessId(id, function(err) {
        if (God.pm2_being_killed)
          return cb(God.logAndGenerateError('[RestartProcessId] PM2 is being killed, stopping restart procedure...'));
        proc.pm2_env.restart_time += 1;
        return God.startProcessId(id, cb);
      });
      return false;
    }

    debug('[restart] process not online, starting it');
    return God.startProcessId(id, cb);
  };

  God.restartProcessName = function(name, cb) {
    const processes = God.findByName(name);

    if (processes && processes.length === 0)
      return cb(God.logAndGenerateError('Unknown process'), {});

    eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      if (God.pm2_being_killed)
        return next('[Watch] PM2 is being killed, stopping restart procedure...');
      if (proc.pm2_env.status === cst.ONLINE_STATUS)
        return God.restartProcessId({id:proc.pm2_env.pm_id}, next);
      if (proc.pm2_env.status !== cst.STOPPING_STATUS
               && proc.pm2_env.status !== cst.LAUNCHING_STATUS)
        return God.startProcessId(proc.pm2_env.pm_id, next);
      return next(util.format('[Watch] Process name %s is being stopped so I won\'t restart it', name));
    }, function(err) {
      if (err) return cb(God.logAndGenerateError(err));
      return cb(null, God.getFormatedProcesses());
    });

    return false;
  };

  God.sendSignalToProcessId = function(opts, cb) {
    const id = opts.process_id;
    const signal = opts.signal;

    if (!(id in God.clusters_db))
      return cb(God.logAndGenerateError(id + ' id unknown'), {});

    const proc = God.clusters_db[id];

    try {
      process.kill(God.clusters_db[id].process.pid, signal);
    } catch(e) {
      return cb(God.logAndGenerateError('Error when sending signal (signal unknown)'), {});
    }
    return cb(null, God.getFormatedProcesses());
  };

  God.sendSignalToProcessName = function(opts, cb) {
    const processes = God.findByName(opts.process_name);
    const signal    = opts.signal;

    if (processes && processes.length === 0)
      return cb(God.logAndGenerateError('Unknown process name'), {});

    eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      if (isProcessOnlineForSignal(proc)) {
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

  God.stopWatch = function(method, value, fn) {
    if (isStopAllMethod(method)) {
      const processes = God.getFormatedProcesses();
      processes.forEach(function(proc) {
        God.clusters_db[proc.pm_id].pm2_env.watch = false;
        God.watch.disable(proc.pm2_env);
      });
    } else {
      disableWatchForMethod(method, value);
    }
    return fn(null, {success:true});
  };

  God.toggleWatch = function(method, value, fn) {
    const env = getEnvByMethod(method, value);

    if (env) {
      env.pm2_env.watch = !env.pm2_env.watch;
      if (env.pm2_env.watch)
        God.watch.enable(env.pm2_env);
      else
        God.watch.disable(env.pm2_env);
    }

    return fn(null, {success:true});
  };

  God.startWatch = function(method, value, fn) {
    const env = getEnvByMethod(method, value);

    if (env) {
      if (env.pm2_env.watch)
        return fn(null, {success:true, notrestarted:true});

      God.watch.enable(env.pm2_env);
      env.pm2_env.watch = true;
    }

    return fn(null, {success:true});
  };

  God.reloadLogs = function(opts, cb) {
    console.log('Reloading logs...');
    const processIds = Object.keys(God.clusters_db);

    processIds.forEach(function (id) {
      const cluster = God.clusters_db[id];

      console.log('Reloading logs for process id %d', id);

      if (!cluster || !cluster.pm2_env)
        return;

      if (isClusterMode(cluster)) {
        reloadLogsClusterMode(cluster);
      } else if (cluster._reloadLogs) {
        cluster._reloadLogs(function(err) {
          if (err) God.logAndGenerateError(err);
        });
      }
    });

    return cb(null, {});
  };

  God.sendLineToStdin = function(packet, cb) {
    if (typeof(packet.pm_id) == 'undefined' || !packet.line)
      return cb(God.logAndGenerateError('pm_id or line field missing'), {});

    const pm_id = packet.pm_id;
    const line  = packet.line;
    const proc = God.clusters_db[pm_id];

    if (!proc)
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> unknown.'), {});

    if (proc.pm2_env.exec_mode == 'cluster_mode')
      return cb(God.logAndGenerateError('Cannot send line to processes in cluster mode'), {});

    if (!isProcessOnlineForIO(proc))
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> offline.'), {});

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

  God.sendDataToProcessId = function(packet, cb) {
    if (typeof(packet.id) == 'undefined' ||
        typeof(packet.data) == 'undefined' ||
        !packet.topic)
      return cb(God.logAndGenerateError('ID, DATA or TOPIC field is missing'), {});

    const pm_id = packet.id;
    const data  = packet.data;
    const proc = God.clusters_db[pm_id];

    if (!proc)
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> unknown.'), {});

    if (!isProcessOnlineForIO(proc))
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> offline.'), {});

    try {
      proc.send(packet);
    }
    catch(e) {
      return cb(God.logAndGenerateError(e), {});
    }

    return cb(null, {
      success: true,
      data   : packet
    });
  };

  God.msgProcess = function(cmd, cb) {
    if ('id' in cmd) {
      return msgProcessById(cmd, cb);
    }

    if ('name' in cmd) {
      return msgProcessByName(cmd, cb);
    }

    return cb(God.logAndGenerateError('method requires name or id field'), {});
  };

  God.getVersion = function(env, cb) {
    process.nextTick(function() {
      return cb(null, pkg.version);
    });
  };

  God.monitor = function Monitor(pm_id, cb) {
    if (!God.clusters_db[pm_id] || !God.clusters_db[pm_id].pm2_env)
      return cb(new Error('Unknown pm_id'));

    God.clusters_db[pm_id].pm2_env._km_monitored = true;
    return cb(null, { success : true, pm_id : pm_id });
  };

  God.unmonitor = function Monitor(pm_id, cb) {
    if (!God.clusters_db[pm_id] || !God.clusters_db[pm_id].pm2_env)
      return cb(new Error('Unknown pm_id'));

    God.clusters_db[pm_id].pm2_env._km_monitored = false;
    return cb(null, { success : true, pm_id : pm_id });
  };

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

  // Helper functions for guard clause extraction
  /**
   * Attach empty monitoring data to process
   * @param {Object} pro - Process object
   * @returns {Object} Process with empty monit data
   */
  function attachEmptyMonitData(pro) {
    pro['monit'] = {
      memory : 0,
      cpu : 0
    };
    return pro;
  }

  /**
   * Attach monitoring data to process from statistics
   * @param {Object} pro - Process object
   * @param {Object} statistics - Statistics map
   * @returns {Object} Process with monit data
   */
  function attachMonitData(pro, statistics) {
    if (!filterBadProcess(pro)) {
      return attachEmptyMonitData(pro);
    }

    const pid = getProcessId(pro);
    const stat = statistics[pid];

    if (!stat) {
      return attachEmptyMonitData(pro);
    }

    pro['monit'] = {
      memory: stat.memory,
      cpu: Math.round(stat.cpu * 10) / 10
    };

    return pro;
  }

  /**
   * Backup dump file
   */
  function backupDumpFile() {
    try {
      if (fs.existsSync(cst.DUMP_FILE_PATH)) {
        fs.writeFileSync(cst.DUMP_BACKUP_FILE_PATH, fs.readFileSync(cst.DUMP_FILE_PATH));
      }
    } catch (e) {
      console.error(e.stack || e);
    }
  }

  /**
   * Write dump file with error recovery
   * @param {Array} process_list - List of processes to dump
   */
  function writeDumpFile(process_list) {
    try {
      fs.writeFileSync(cst.DUMP_FILE_PATH, JSON.stringify(process_list));
    } catch (e) {
      console.error(e.stack || e);
      restoreDumpFileFromBackup();
    }
  }

  /**
   * Restore dump file from backup
   */
  function restoreDumpFileFromBackup() {
    try {
      if (fs.existsSync(cst.DUMP_BACKUP_FILE_PATH)) {
        fs.writeFileSync(cst.DUMP_FILE_PATH, fs.readFileSync(cst.DUMP_BACKUP_FILE_PATH));
      }
    } catch (e) {
      try {
        fs.unlinkSync(cst.DUMP_FILE_PATH);
      } catch (unlinkErr) {}
      console.error(e.stack || e);
    }
  }

  /**
   * Check if kill error is timeout
   * @param {Error} err - Error object
   * @returns {boolean}
   */
  function isKillTimeout(err) {
    return err && err.type && err.type === 'timeout';
  }

  /**
   * Clean up process files
   * @param {Object} proc - Process object
   */
  function cleanupProcessFiles(proc) {
    if (proc.pm2_env.pm_id.toString().indexOf('_old_') !== 0) {
      try {
        fs.unlinkSync(proc.pm2_env.pm_pid_path);
      } catch (e) {}
    }
  }

  /**
   * Clear process metadata
   * @param {Object} proc - Process object
   */
  function clearProcessMetadata(proc) {
    if (proc.pm2_env.axm_actions) proc.pm2_env.axm_actions = [];
    if (proc.pm2_env.axm_monitor) proc.pm2_env.axm_monitor = {};
  }

  /**
   * Check if process is online
   * @param {Object} proc - Process object
   * @returns {boolean}
   */
  function isProcessOnline(proc) {
    return proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS;
  }

  /**
   * Check if process is online for signal operations
   * @param {Object} proc - Process object
   * @returns {boolean}
   */
  function isProcessOnlineForSignal(proc) {
    return proc.pm2_env.status == cst.ONLINE_STATUS || proc.pm2_env.status == cst.LAUNCHING_STATUS;
  }

  /**
   * Check if process is online for IO operations
   * @param {Object} proc - Process object
   * @returns {boolean}
   */
  function isProcessOnlineForIO(proc) {
    return proc.pm2_env.status == cst.ONLINE_STATUS || proc.pm2_env.status == cst.LAUNCHING_STATUS;
  }

  /**
   * Check if method is stop all
   * @param {string} method - Method name
   * @returns {boolean}
   */
  function isStopAllMethod(method) {
    return method == 'stopAll' || method == 'deleteAll';
  }

  /**
   * Disable watch for specific method
   * @param {string} method - Method name
   * @param {*} value - Value parameter
   */
  function disableWatchForMethod(method, value) {
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

  /**
   * Get environment by method
   * @param {string} method - Method name
   * @param {*} value - Value parameter
   * @returns {Object|null}
   */
  function getEnvByMethod(method, value) {
    if (method == 'restartProcessId') {
      return God.clusters_db[value.id];
    }
    if (method == 'restartProcessName') {
      return God.clusters_db[God.findByName(value)];
    }
    return null;
  }

  /**
   * Check if cluster is in cluster mode
   * @param {Object} cluster - Cluster object
   * @returns {boolean}
   */
  function isClusterMode(cluster) {
    return cluster.send && cluster.pm2_env.exec_mode == 'cluster_mode';
  }

  /**
   * Reload logs in cluster mode
   * @param {Object} cluster - Cluster object
   */
  function reloadLogsClusterMode(cluster) {
    try {
      cluster.send({
        type:'log:reload'
      });
    } catch(e) {
      console.error(e.message || e);
    }
  }

  /**
   * Send message to process by ID
   * @param {Object} cmd - Command object
   * @param {Function} cb - Callback
   * @returns {*}
   */
  function msgProcessById(cmd, cb) {
    const id = cmd.id;
    if (!(id in God.clusters_db))
      return cb(God.logAndGenerateError(id + ' id unknown'), {});

    const proc = God.clusters_db[id];
    let action_exist = false;

    proc.pm2_env.axm_actions.forEach(function(action) {
      if (action.action_name == cmd.msg) {
        action_exist = true;
        action.output = [];
      }
    });

    if (!action_exist) {
      return cb(God.logAndGenerateError('Action doesn\'t exist ' + cmd.msg + ' for ' + proc.pm2_env.name), {});
    }

    if (!isProcessOnlineForIO(proc)) {
      return cb(God.logAndGenerateError(id + ' : id offline'), {});
    }

    if (cmd.opts == null && !cmd.uuid)
      proc.send(cmd.msg);
    else
      proc.send(cmd);

    return cb(null, { process_count : 1, success : true });
  }

  /**
   * Send message to process by name
   * @param {Object} cmd - Command object
   * @param {Function} cb - Callback
   * @returns {*}
   */
  function msgProcessByName(cmd, cb) {
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

      if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env) {
        arr.shift();
        return ex(arr);
      }

      const proc_env = God.clusters_db[id].pm2_env;
      const isActionAvailable = proc_env.axm_actions.find(action => action.action_name === cmd.msg) !== undefined;

      if (!isActionAvailable) {
        arr.shift();
        return ex(arr);
      }

      const isNameMatch = p.basename(proc_env.pm_exec_path) == name ||
                          proc_env.name == name ||
                          proc_env.namespace == name ||
                          name == 'all';
      const isProcessOnline = proc_env.status == cst.ONLINE_STATUS ||
                              proc_env.status == cst.LAUNCHING_STATUS;

      if (!isNameMatch || !isProcessOnline) {
        arr.shift();
        return ex(arr);
      }

      let action_exist = false;
      proc_env.axm_actions.forEach(function(action) {
        if (action.action_name == cmd.msg) {
          action_exist = true;
        }
      });

      if (!action_exist || proc_env.axm_actions.length == 0) {
        arr.shift();
        return ex(arr);
      }

      if (cmd.opts == null)
        God.clusters_db[id].send(cmd.msg);
      else
        God.clusters_db[id].send(cmd);

      sent++;
      arr.shift();
      return ex(arr);
    })(arr);
  }
};

/**
 * Filter process by status and axm_options
 * @param {Object} pro - Process object
 * @returns {boolean}
 */
function filterBadProcess(pro) {
  if (pro.pm2_env.status !== cst.ONLINE_STATUS) {
    return false;
  }

  if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
    if (isNaN(pro.pm2_env.axm_options.pid))  {
      return false;
    }
  }

  return true;
}

/**
 * Get process ID from process object
 * @param {Object} pro - Process object
 * @returns {number}
 */
function getProcessId(pro) {
  if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
    return pro.pm2_env.axm_options.pid;
  }

  return pro.pid;
}