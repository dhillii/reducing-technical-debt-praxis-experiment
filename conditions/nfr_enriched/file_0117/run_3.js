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
   * Create empty monitoring statistics object
   * @param {Array} processes - Array of processes
   * @return {Array} Processes with empty monit data
   */
  function createEmptyMonitStats(processes) {
    return processes.map(function(pro) {
      pro['monit'] = {
        memory : 0,
        cpu : 0
      };
      return pro;
    });
  }

  /**
   * Attach monitoring statistics to processes
   * @param {Array} processes - Array of processes
   * @param {Object} statistics - Statistics from pidusage
   * @return {Array} Processes with monit data attached
   */
  function attachMonitStats(processes, statistics) {
    return processes.map(function(pro) {
      if (filterBadProcess(pro) === false) {
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
    });
  }

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
      .map(function(pro) {
        return getProcessId(pro);
      });

    // No pids, return empty statistics
    if (pids.length === 0) {
      return cb(null, createEmptyMonitStats(processes));
    }

    pidusage(pids, function retPidUsage(err, statistics) {
      // Just log, we'll set empty statistics
      if (err) {
        console.error('Error caught while calling pidusage');
        console.error(err);
        return cb(null, createEmptyMonitStats(processes));
      }

      if (!statistics) {
        console.error('Statistics is not defined!');
        return cb(null, createEmptyMonitStats(processes));
      }

      const processesWithStats = attachMonitStats(processes, statistics);
      cb(null, processesWithStats);
    });
  };

  /**
   * Backup dump file if it exists
   * @param {string} sourcePath - Source file path
   * @param {string} backupPath - Backup file path
   */
  function backupDumpFile(sourcePath, backupPath) {
    try {
      if (fs.existsSync(sourcePath)) {
        fs.writeFileSync(backupPath, fs.readFileSync(sourcePath));
      }
    } catch (e) {
      console.error(e.stack || e);
    }
  }

  /**
   * Write dump file with error recovery
   * @param {string} filePath - File path to write
   * @param {string} content - Content to write
   * @param {string} backupPath - Backup file path for recovery
   */
  function writeDumpFileWithRecovery(filePath, content, backupPath) {
    try {
      fs.writeFileSync(filePath, content);
    } catch (e) {
      console.error(e.stack || e);
      try {
        if (fs.existsSync(backupPath)) {
          fs.writeFileSync(filePath, fs.readFileSync(backupPath));
        }
      } catch (e) {
        try {
          fs.unlinkSync(filePath);
        } catch (unlinkErr) {
          // ignore
        }
        console.error(e.stack || e);
      }
    }
  }

  /**
   * Recursively save processes to process list
   * @param {Array} apps - Applications to save
   * @param {Array} processList - Accumulator for process list
   * @return {Array} Accumulated process list
   */
  function saveProcessRecursive(apps, processList) {
    if (!apps[0])
      return processList;
    
    delete apps[0].pm2_env.instances;
    delete apps[0].pm2_env.pm_id;
    
    // Do not dump modules
    if (!apps[0].pm2_env.pmx_module)
      processList.push(apps[0].pm2_env);
    
    apps.shift();
    return saveProcessRecursive(apps, processList);
  }

  /**
   * Handle dump file finalization
   * @param {Array} processList - List of processes to dump
   * @param {Object} context - Context object with clearDump method
   * @param {Function} cb - Callback function
   */
  function finalizeDumpFile(processList, context, cb) {
    // try to fix issues with empty dump file like #3485
    if (processList.length === 0) {
      // fix : if no dump file, no process, only module and after pm2 update
      if (!fs.existsSync(cst.DUMP_FILE_PATH) && typeof context.clearDump === 'function') {
        context.clearDump(function(){});
      }
      // if no process in list don't modify dump file
      return cb(null, {success:true, process_list: processList});
    }

    backupDumpFile(cst.DUMP_FILE_PATH, cst.DUMP_BACKUP_FILE_PATH);
    writeDumpFileWithRecovery(cst.DUMP_FILE_PATH, JSON.stringify(processList), cst.DUMP_BACKUP_FILE_PATH);

    return cb(null, {success:true, process_list: processList});
  }

  /**
   * Description
   * @method dumpProcessList
   * @param {} cb
   * @return
   */
  God.dumpProcessList = function(cb) {
    const processList = [];
    const apps = Utility.clone(God.getFormatedProcesses());
    const that = this;

    // Don't override the actual dump file if process list is empty
    // unless user explicitely did `pm2 dump`.
    // This often happens when PM2 crashed, we don't want to override
    // the dump file with an empty list of process.
    if (!apps[0]) {
      debug('[PM2] Did not override dump file because list of processes is empty');
      return cb(null, {success:true, process_list: processList});
    }

    const finalProcessList = saveProcessRecursive(apps, processList);
    finalizeDumpFile(finalProcessList, that, cb);
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
   * Validate process exists in database
   * @param {number} id - Process ID
   * @return {boolean} True if valid
   */
  function validateProcessExists(id) {
    if (!(id in God.clusters_db))
      return false;
    if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env)
      return false;
    return true;
  }

  /**
   * Duplicate a process
   * @method duplicateProcessId
   * @param {} id
   * @param {} cb
   * @return CallExpression
   */
  God.duplicateProcessId = function(id, cb) {
    if (!validateProcessExists(id))
      return cb(God.logAndGenerateError(id + ' id unknown'), {});

    const proc = Utility.clone(God.clusters_db[id].pm2_env);

    delete proc.created_at;
    delete proc.pm_id;
    delete proc.unique_id;

    // generate a new unique id for new process
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
   * Handle process stop completion
   * @param {Object} proc - Process object
   * @param {number} id - Process ID
   * @param {Function} cb - Callback
   */
  function handleStopCompletion(proc, id, cb) {
    if (proc.pm2_env.pm_id.toString().indexOf('_old_') !== 0) {
      try {
        fs.unlinkSync(proc.pm2_env.pm_pid_path);
      } catch (e) {
        // ignore
      }
    }

    if (proc.pm2_env.axm_actions) proc.pm2_env.axm_actions = [];
    if (proc.pm2_env.axm_monitor) proc.pm2_env.axm_monitor = {};

    proc.process.pid = 0;
    return cb(null, God.getFormatedProcess(id));
  }

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

    //clear time-out restart task
    clearTimeout(proc.pm2_env.restart_task);

    if (proc.pm2_env.status == cst.STOPPED_STATUS) {
      proc.process.pid = 0;
      return cb(null, God.getFormatedProcess(id));
    }
    // state == 'none' means that the process is not online yet
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

      if (err && err.type && err.type === 'timeout') {
        console.error('app=%s id=%d pid=%s could not be stopped',
                      proc.pm2_env.name,
                      proc.pm2_env.pm_id,
                      proc.process.pid);
        proc.pm2_env.status = cst.ERRORED_STATUS;
        return cb(null, God.getFormatedProcess(id));
      }

      handleStopCompletion(proc, id, cb);
    });
  };

  /**
   * Reset metadata for a process
   * @method resetMetaProcessId
   * @param {} id
   * @param {} cb
   * @return
   */
  God.resetMetaProcessId = function(id, cb) {
    if (!validateProcessExists(id))
      return cb(God.logAndGenerateError(id + ' id unknown'), {});

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
      // ! transform to slow object
      delete God.clusters_db[id];

      if (Object.keys(God.clusters_db).length == 0)
        God.next_id = 0;
      return cb(null, proc);
    });
    return false;
  };

  /**
   * Handle restart when process is online
   * @param {number} id - Process ID
   * @param {Object} proc - Process object
   * @param {Function} cb - Callback
   */
  function handleOnlineRestart(id, proc, cb) {
    God.stopProcessId(id, function(err) {
      if (God.pm2_being_killed)
        return cb(God.logAndGenerateError('[RestartProcessId] PM2 is being killed, stopping restart procedure...'));
      proc.pm2_env.restart_time += 1;
      return God.startProcessId(id, cb);
    });
  }

  /**
   * Restart a process ID
   * If the process is online it will not put it on state stopped
   * but directly kill it and let God restart it
   * @method restartProcessId
   * @param {} opts
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

    /**
     * Merge new application configuration on restart
     * Same system in reloadProcessId and softReloadProcessId
     */
    Utility.extend(proc.pm2_env.env, env);
    Utility.extendExtraConfig(proc, opts);

    if (God.pm2_being_killed) {
      return cb(God.logAndGenerateError('[RestartProcessId] PM2 is being killed, stopping restart procedure...'));
    }
    if (proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS) {
      handleOnlineRestart(id, proc, cb);
      return false;
    }
    else {
      debug('[restart] process not online, starting it');
      return God.startProcessId(id, cb);
    }
  };

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
      else if (proc.pm2_env.status !== cst.STOPPING_STATUS
               && proc.pm2_env.status !== cst.LAUNCHING_STATUS)
        return God.startProcessId(proc.pm2_env.pm_id, next);
      else
        return next(util.format('[Watch] Process name %s is being stopped so I won\'t restart it', name));
    }, function(err) {
      if (err) return cb(God.logAndGenerateError(err));
      return cb(null, God.getFormatedProcesses());
    });

    return false;
  };

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
      if (proc.pm2_env.status == cst.ONLINE_STATUS || proc.pm2_env.status == cst.LAUNCHING_STATUS) {
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
   * Disable watch for all or specific process
   * @param {string} method - Method name
   * @param {*} value - Process id or name
   * @param {Function} fn - Callback
   */
  function disableWatchForProcess(method, value) {
    if (method == 'stopAll' || method == 'deleteAll') {
      const processes = God.getFormatedProcesses();
      processes.forEach(function(proc) {
        God.clusters_db[proc.pm_id].pm2_env.watch = false;
        God.watch.disable(proc.pm2_env);
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
    disableWatchForProcess(method, value);
    return fn(null, {success:true});
  };

  /**
   * Get environment for watch toggle
   * @param {string} method - Method name
   * @param {*} value - Process id or name
   * @return {Object|null} Environment object or null
   */
  function getEnvForWatch(method, value) {
    let env = null;
    if (method == 'restartProcessId') {
      env = God.clusters_db[value.id];
    } else if(method == 'restartProcessName') {
      env = God.clusters_db[God.findByName(value)];
    }
    return env;
  }

  /**
   * Toggle watching daemon
   * @method toggleWatch
   * @param {String} method
   * @param {Object} application environment, should include id
   * @param {Function} callback
   */
  God.toggleWatch = function(method, value, fn) {
    const env = getEnvForWatch(method, value);

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
   * Start Watch
   * @method startWatch
   * @param {String} method
   * @param {Object} application environment, should include id
   * @param {Function} callback
   */
  God.startWatch = function(method, value, fn) {
    const env = getEnvForWatch(method, value);

    if (env) {
      if (env.pm2_env.watch)
        return fn(null, {success:true, notrestarted:true});

      God.watch.enable(env.pm2_env);
      env.pm2_env.watch = true;
    }

    return fn(null, {success:true});
  };

  /**
   * Reload logs for all processes
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

      if (cluster && cluster.pm2_env) {
        // Cluster mode
        if (cluster.send && cluster.pm2_env.exec_mode == 'cluster_mode') {
          try {
            cluster.send({
              type:'log:reload'
            });
          } catch(e) {
            console.error(e.message || e);
          }
        }
        // Fork mode
        else if (cluster._reloadLogs) {
          cluster._reloadLogs(function(err) {
            if (err) God.logAndGenerateError(err);
          });
        }
      }
    });

    return cb(null, {});
  };

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

    if (proc.pm2_env.status != cst.ONLINE_STATUS && proc.pm2_env.status != cst.LAUNCHING_STATUS)
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

    if (proc.pm2_env.status != cst.ONLINE_STATUS && proc.pm2_env.status != cst.LAUNCHING_STATUS)
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
   * Check if action exists in process
   * @param {Object} procEnv - Process environment
   * @param {string} actionName - Action name to check
   * @return {boolean} True if action exists
   */
  function actionExists(procEnv, actionName) {
    return procEnv.axm_actions.find(action => action.action_name === actionName) !== undefined;
  }

  /**
   * Process message by ID
   * @param {Object} cmd - Command object
   * @param {Function} cb - Callback
   */
  function msgProcessById(cmd, cb) {
    const id = cmd.id;
    if (!(id in God.clusters_db))
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    
    const proc = God.clusters_db[id];
    let actionExist = false;

    proc.pm2_env.axm_actions.forEach(function(action) {
      if (action.action_name == cmd.msg) {
        actionExist = true;
        action.output = [];
      }
    });
    
    if (actionExist == false) {
      return cb(God.logAndGenerateError('Action doesn\'t exist ' + cmd.msg + ' for ' + proc.pm2_env.name), {});
    }

    if (proc.pm2_env.status == cst.ONLINE_STATUS || proc.pm2_env.status == cst.LAUNCHING_STATUS) {
      if (cmd.opts == null && !cmd.uuid)
        proc.send(cmd.msg);
      else
        proc.send(cmd);

      return cb(null, { process_count : 1, success : true });
    }
    else
      return cb(God.logAndGenerateError(id + ' : id offline'), {});
  }

  /**
   * Process message by name recursively
   * @param {Array} arr - Array of process IDs
   * @param {Object} cmd - Command object
   * @param {number} sent - Count of sent messages
   * @param {Function} cb - Callback
   */
  function msgProcessByNameRecursive(arr, cmd, sent, cb) {
    if (arr[0] == null || !arr) {
      return cb(null, {
        process_count : sent,
        success : true
      });
    }

    const id = arr[0];

    if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env) {
      arr.shift();
      return msgProcessByNameRecursive(arr, cmd, sent, cb);
    }

    const procEnv = God.clusters_db[id].pm2_env;

    if (actionExists(procEnv, cmd.msg) === false) {
      arr.shift();
      return msgProcessByNameRecursive(arr, cmd, sent, cb);
    }

    if ((p.basename(procEnv.pm_exec_path) == cmd.name ||
         procEnv.name == cmd.name ||
         procEnv.namespace == cmd.name ||
         cmd.name == 'all') &&
        (procEnv.status == cst.ONLINE_STATUS ||
         procEnv.status == cst.LAUNCHING_STATUS)) {

      let actionExist = false;
      procEnv.axm_actions.forEach(function(action) {
        if (action.action_name == cmd.msg) {
          actionExist = true;
        }
      });

      if (actionExist == false || procEnv.axm_actions.length == 0) {
        arr.shift();
        return msgProcessByNameRecursive(arr, cmd, sent, cb);
      }

      if (cmd.opts == null)
        God.clusters_db[id].send(cmd.msg);
      else
        God.clusters_db[id].send(cmd);

      sent++;
      arr.shift();
      return msgProcessByNameRecursive(arr, cmd, sent, cb);
    }
    else {
      arr.shift();
      return msgProcessByNameRecursive(arr, cmd, sent, cb);
    }
  }

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
    else if ('name' in cmd) {
      const arr = Object.keys(God.clusters_db);
      return msgProcessByNameRecursive(arr, cmd, 0, cb);
    }
    else {
      return cb(God.logAndGenerateError('method requires name or id field'), {});
    }
  };

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

  /**
   * Monitor a process
   * @method monitor
   * @param {number} pm_id - Process ID
   * @param {Function} cb - Callback
   */
  God.monitor = function Monitor(pm_id, cb) {
    if (!God.clusters_db[pm_id] || !God.clusters_db[pm_id].pm2_env)
      return cb(new Error('Unknown pm_id'));

    God.clusters_db[pm_id].pm2_env._km_monitored = true;
    return cb(null, { success : true, pm_id : pm_id });
  };

  /**
   * Unmonitor a process
   * @method unmonitor
   * @param {number} pm_id - Process ID
   * @param {Function} cb - Callback
   */
  God.unmonitor = function Monitor(pm_id, cb) {
    if (!God.clusters_db[pm_id] || !God.clusters_db[pm_id].pm2_env)
      return cb(new Error('Unknown pm_id'));

    God.clusters_db[pm_id].pm2_env._km_monitored = false;
    return cb(null, { success : true, pm_id : pm_id });
  };

  /**
   * Get system report
   * @method getReport
   * @param {*} arg - Argument (unused)
   * @param {Function} cb - Callback
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
 * Filter processes that are online and have valid PIDs
 * @param {Object} pro - Process object
 * @return {boolean} True if process is valid for monitoring
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
 * @return {number} Process ID
 */
function getProcessId(pro) {
  let pid = pro.pid;

  if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
    pid = pro.pm2_env.axm_options.pid;
  }

  return pid;
}