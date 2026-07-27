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

/**
 * Description
 * @method exports
 * @param {} God
 * @return
 */
module.exports = function(God) {
  /**
   * Description
   * @method getMonitorData
   * @param {} env
   * @param {} cb
   * @return
   */
  God.getMonitorData = function getMonitorData(env, cb) {
    const processes = God.getFormatedProcesses();
    const pids = processes.filter(filterBadProcess)
      .map(function(pro, i) {
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

  /**
   * Attach empty monitoring data to process
   * @param {Array} processes
   * @return {Array}
   */
  function attachEmptyMonitData(processes) {
    return processes.map(function(pro) {
      pro['monit'] = {
        memory : 0,
        cpu : 0
      };
      return pro;
    });
  }

  /**
   * Attach monitoring data to a single process
   * @param {Object} pro
   * @param {Object} statistics
   * @return {Object}
   */
  function attachMonitData(pro, statistics) {
    if (!filterBadProcess(pro)) {
      pro['monit'] = {
        memory : 0,
        cpu : 0
      };
      return pro;
    }

    const pid = getProcessId(pro);
    const stat = statistics[pid];

    if (!stat) {
      pro['monit'] = {
        memory : 0,
        cpu : 0
      };
      return pro;
    }

    pro['monit'] = {
      memory: stat.memory,
      cpu: Math.round(stat.cpu * 10) / 10
    };

    return pro;
  }

  /**
   * Description
   * @method dumpProcessList
   * @param {} cb
   * @return
   */
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
      writeDumpFile(process_list, cb);
    }

    function backupDumpFile() {
      try {
        if (fs.existsSync(cst.DUMP_FILE_PATH)) {
          fs.writeFileSync(cst.DUMP_BACKUP_FILE_PATH, fs.readFileSync(cst.DUMP_FILE_PATH));
        }
      } catch (e) {
        console.error(e.stack || e);
      }
    }

    function writeDumpFile(list, callback) {
      try {
        fs.writeFileSync(cst.DUMP_FILE_PATH, JSON.stringify(list));
      } catch (e) {
        console.error(e.stack || e);
        restoreFromBackup();
      }
      return callback(null, {success:true, process_list: list});
    }

    function restoreFromBackup() {
      try {
        if (fs.existsSync(cst.DUMP_BACKUP_FILE_PATH)) {
          fs.writeFileSync(cst.DUMP_FILE_PATH, fs.readFileSync(cst.DUMP_BACKUP_FILE_PATH));
        }
      } catch (e) {
        try {
          fs.unlinkSync(cst.DUMP_FILE_PATH);
        } catch (unlinkErr) {
          console.error(unlinkErr.stack || unlinkErr);
        }
        console.error(e.stack || e);
      }
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

  /**
   * Description
   * @method ping
   * @param {} env
   * @param {} cb
   * @return CallExpression
   */
  God.ping = function(env, cb) {
    return cb(null, {msg : 'pong'});
  };

  /**
   * Description
   * @method notifyKillPM2
   */
  God.notifyKillPM2 = function() {
    God.pm2_being_killed = true;
  };

  /**
   * Duplicate a process
   * @method duplicateProcessId
   * @param {} id
   * @param {} cb
   * @return CallExpression
   */
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

  /**
   * Start a stopped process by ID
   * @method startProcessId
   * @param {} id
   * @param {} cb
   * @return CallExpression
   */
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

  /**
   * Stop a process and set it on state 'stopped'
   * @method stopProcessId
   * @param {} id
   * @param {} cb
   * @return Literal
   */
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
      handleKillProcessResult(err, proc, id, cb);
    });
  };

  /**
   * Handle result of kill process operation
   * @param {Error} err
   * @param {Object} proc
   * @param {Number} id
   * @param {Function} cb
   */
  function handleKillProcessResult(err, proc, id, cb) {
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
  }

  /**
   * Check if kill operation timed out
   * @param {Error} err
   * @return {Boolean}
   */
  function isKillTimeout(err) {
    return err && err.type && err.type === 'timeout';
  }

  /**
   * Clean up process pid files
   * @param {Object} proc
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
   * @param {Object} proc
   */
  function clearProcessMetadata(proc) {
    if (proc.pm2_env.axm_actions) proc.pm2_env.axm_actions = [];
    if (proc.pm2_env.axm_monitor) proc.pm2_env.axm_monitor = {};
  }

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

  /**
   * Delete a process by id
   * It will stop it and remove it from the database
   * @method deleteProcessId
   * @param {} id
   * @param {} cb
   * @return Literal
   */
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

  /**
   * Restart a process ID
   * If the process is online it will not put it on state stopped
   * but directly kill it and let God restart it
   * @method restartProcessId
   * @param {} id
   * @param {} cb
   * @return Literal
   */
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

  /**
   * Check if process is online or launching
   * @param {Object} proc
   * @return {Boolean}
   */
  function isProcessOnline(proc) {
    return proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS;
  }

  /**
   * Restart all process by name
   * @method restartProcessName
   * @param {} name
   * @param {} cb
   * @return Literal
   */
  God.restartProcessName = function(name, cb) {
    const processes = God.findByName(name);

    if (processes && processes.length === 0)
      return cb(God.logAndGenerateError('Unknown process'), {});

    eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      if (God.pm2_being_killed)
        return next('[Watch] PM2 is being killed, stopping restart procedure...');
      if (proc.pm2_env.status === cst.ONLINE_STATUS)
        return God.restartProcessId({id:proc.pm2_env.pm_id}, next);
      if (shouldStartProcess(proc))
        return God.startProcessId(proc.pm2_env.pm_id, next);
      return next(util.format('[Watch] Process name %s is being stopped so I won\'t restart it', name));
    }, function(err) {
      if (err) return cb(God.logAndGenerateError(err));
      return cb(null, God.getFormatedProcesses());
    });

    return false;
  };

  /**
   * Check if process should be started
   * @param {Object} proc
   * @return {Boolean}
   */
  function shouldStartProcess(proc) {
    return proc.pm2_env.status !== cst.STOPPING_STATUS
           && proc.pm2_env.status !== cst.LAUNCHING_STATUS;
  }

  /**
   * Send system signal to process id
   * @method sendSignalToProcessId
   * @param {} opts
   * @param {} cb
   * @return CallExpression
   */
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

  /**
   * Send system signal to all processes by name
   * @method sendSignalToProcessName
   * @param {} opts
   * @param {} cb
   * @return
   */
  God.sendSignalToProcessName = function(opts, cb) {
    const processes = God.findByName(opts.process_name);
    const signal    = opts.signal;

    if (processes && processes.length === 0)
      return cb(God.logAndGenerateError('Unknown process name'), {});

    eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      if (isProcessOnlineOrLaunching(proc)) {
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
   * Check if process is online or launching
   * @param {Object} proc
   * @return {Boolean}
   */
  function isProcessOnlineOrLaunching(proc) {
    return proc.pm2_env.status == cst.ONLINE_STATUS || proc.pm2_env.status == cst.LAUNCHING_STATUS;
  }

  /**
   * Stop watching daemon
   * @method stopWatch
   * @param {} method
   * @param {} value
   * @param {} fn
   * @return
   */
  God.stopWatch = function(method, value, fn) {
    if (isStopAllOrDeleteAll(method)) {
      disableWatchForAllProcesses();
    } else {
      disableWatchForSpecificProcess(method, value);
    }
    return fn(null, {success:true});
  };

  /**
   * Check if method is stopAll or deleteAll
   * @param {String} method
   * @return {Boolean}
   */
  function isStopAllOrDeleteAll(method) {
    return method == 'stopAll' || method == 'deleteAll';
  }

  /**
   * Disable watch for all processes
   */
  function disableWatchForAllProcesses() {
    const processes = God.getFormatedProcesses();
    processes.forEach(function(proc) {
      God.clusters_db[proc.pm_id].pm2_env.watch = false;
      God.watch.disable(proc.pm2_env);
    });
  }

  /**
   * Disable watch for specific process
   * @param {String} method
   * @param {*} value
   */
  function disableWatchForSpecificProcess(method, value) {
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
   * Toggle watching daemon
   * @method toggleWatch
   * @param {String} method
   * @param {Object} application environment, should include id
   * @param {Function} callback
   */
  God.toggleWatch = function(method, value, fn) {
    const env = getWatchEnvironment(method, value);

    if (env) {
      env.pm2_env.watch = !env.pm2_env.watch;
      if (env.pm2_env.watch)
        God.watch.enable(env.pm2_env);
      else
        God.watch.disable(env.pm2_env);
    }

    return fn(null, {success:true});
  };

  /**
   * Get watch environment for method and value
   * @param {String} method
   * @param {*} value
   * @return {Object|null}
   */
  function getWatchEnvironment(method, value) {
    if (method == 'restartProcessId') {
      return God.clusters_db[value.id];
    } else if(method == 'restartProcessName') {
      return God.clusters_db[God.findByName(value)];
    }
    return null;
  }

  /**
   * Start Watch
   * @method startWatch
   * @param {String} method
   * @param {Object} application environment, should include id
   * @param {Function} callback
   */
  God.startWatch = function(method, value, fn) {
    const env = getWatchEnvironment(method, value);

    if (!env) {
      return fn(null, {success:true});
    }

    if (env.pm2_env.watch) {
      return fn(null, {success:true, notrestarted:true});
    }

    God.watch.enable(env.pm2_env);
    env.pm2_env.watch = true;

    return fn(null, {success:true});
  };

  /**
   * Description
   * @method reloadLogs
   * @param {} opts
   * @param {} cb
   * @return CallExpression
   */
  God.reloadLogs = function(opts, cb) {
    console.log('Reloading logs...');
    const processIds = Object.keys(God.clusters_db);

    processIds.forEach(function (id) {
      const cluster = God.clusters_db[id];

      console.log('Reloading logs for process id %d', id);

      if (!cluster || !cluster.pm2_env) {
        return;
      }

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

  /**
   * Check if cluster is in cluster mode
   * @param {Object} cluster
   * @return {Boolean}
   */
  function isClusterMode(cluster) {
    return cluster.send && cluster.pm2_env.exec_mode == 'cluster_mode';
  }

  /**
   * Reload logs for cluster mode
   * @param {Object} cluster
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
   * Send Line To Stdin
   * @method sendLineToStdin
   * @param Object packet
   * @param String pm_id Process ID
   * @param String line  Line to send to process stdin
   */
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

    if (!isProcessOnlineOrLaunching(proc))
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

  /**
   * @param {object} packet
   * @param {function} cb
   */
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

    if (!isProcessOnlineOrLaunching(proc))
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

  /**
   * Send Message to Process by id or name
   * @method msgProcess
   * @param {} cmd
   * @param {} cb
   * @return Literal
   */
  God.msgProcess = function(cmd, cb) {
    if ('id' in cmd) {
      return msgProcessById(cmd, cb);
    }

    if ('name' in cmd) {
      return msgProcessByName(cmd, cb);
    }

    return cb(God.logAndGenerateError('method requires name or id field'), {});
  };

  /**
   * Send message to process by ID
   * @param {Object} cmd
   * @param {Function} cb
   * @return {*}
   */
  function msgProcessById(cmd, cb) {
    const id = cmd.id;
    if (!(id in God.clusters_db))
      return cb(God.logAndGenerateError(id + ' id unknown'), {});

    const proc = God.clusters_db[id];

    if (!actionExists(proc.pm2_env.axm_actions, cmd.msg)) {
      return cb(God.logAndGenerateError('Action doesn\'t exist ' + cmd.msg + ' for ' + proc.pm2_env.name), {});
    }

    if (!isProcessOnlineOrLaunching(proc)) {
      return cb(God.logAndGenerateError(id + ' : id offline'), {});
    }

    resetActionOutput(proc.pm2_env.axm_actions, cmd.msg);
    sendMessageToProcess(proc, cmd);

    return cb(null, { process_count : 1, success : true });
  }

  /**
   * Check if action exists in actions array
   * @param {Array} actions
   * @param {String} actionName
   * @return {Boolean}
   */
  function actionExists(actions, actionName) {
    return actions.some(function(action) {
      return action.action_name === actionName;
    });
  }

  /**
   * Reset action output buffer
   * @param {Array} actions
   * @param {String} actionName
   */
  function resetActionOutput(actions, actionName) {
    actions.forEach(function(action) {
      if (action.action_name === actionName) {
        action.output = [];
      }
    });
  }

  /**
   * Send message to process
   * @param {Object} proc
   * @param {Object} cmd
   */
  function sendMessageToProcess(proc, cmd) {
    if (cmd.opts == null && !cmd.uuid) {
      proc.send(cmd.msg);
    } else {
      proc.send(cmd);
    }
  }

  /**
   * Send message to process by name
   * @param {Object} cmd
   * @param {Function} cb
   * @return {*}
   */
  function msgProcessByName(cmd, cb) {
    const name = cmd.name;
    const arr = Object.keys(God.clusters_db);
    let sent = 0;

    function processArray(arr) {
      if (!arr[0]) {
        return cb(null, {
          process_count : sent,
          success : true
        });
      }

      const id = arr[0];

      if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env) {
        arr.shift();
        return processArray(arr);
      }

      const proc_env = God.clusters_db[id].pm2_env;

      if (!actionExists(proc_env.axm_actions, cmd.msg)) {
        arr.shift();
        return processArray(arr);
      }

      if (!matchesProcessName(proc_env, name) || !isProcessOnlineOrLaunching(proc_env)) {
        arr.shift();
        return processArray(arr);
      }

      if (proc_env.axm_actions.length === 0) {
        arr.shift();
        return processArray(arr);
      }

      sendMessageToProcess(God.clusters_db[id], cmd);
      sent++;
      arr.shift();
      return processArray(arr);
    }

    return processArray(arr);
  }

  /**
   * Check if process environment matches name
   * @param {Object} proc_env
   * @param {String} name
   * @return {Boolean}
   */
  function matchesProcessName(proc_env, name) {
    return p.basename(proc_env.pm_exec_path) == name ||
           proc_env.name == name ||
           proc_env.namespace == name ||
           name == 'all';
  }

  /**
   * Description
   * @method getVersion
   * @param {} env
   * @param {} cb
   * @return CallExpression
   */
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
};

/**
 * Filter processes that are online and have valid PIDs
 * @param {Object} pro
 * @return {Boolean}
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
 * @param {Object} pro
 * @return {Number}
 */
function getProcessId(pro) {
  if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
    return pro.pm2_env.axm_options.pid;
  }

  return pro.pid;
}