var fs            = require('fs');
var path          = require('path');
var eachLimit     = require('async/eachLimit');
var os            = require('os');
var p             = path;
var cst           = require('../../constants.js');

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
    var processes = God.getFormatedProcesses();

    var pids = processes
      .filter(isProcessMonitored)
      .map(extractProcessId);

    if (pids.length === 0) {
      return cb(null, processes.map(prepareEmptyMonitorData));
    }

    pidusage(pids, function retPidUsage(err, statistics) {
      if (err || !statistics) {
        console.error(err || 'Statistics is not defined!');
        console.error('Error caught while calling pidusage');
        return cb(null, processes.map(prepareEmptyMonitorData));
      }

      processes = processes.map(function(pro) {
        if (!isProcessMonitored(pro)) {
          return assignEmptyMonitorData(pro);
        }

        var pid = extractProcessId(pro);
        var stat = statistics[pid];

        if (!stat) {
          return assignEmptyMonitorData(pro);
        }

        pro.monit = {
          memory: stat.memory,
          cpu: Math.round(stat.cpu * 10) / 10
        };

        return pro;
      });

      cb(null, processes);
    });
  };

  /**
   * Description
   * @method dumpProcessList
   * @param {} cb
   * @return
   */
  God.dumpProcessList = function(cb) {
    var processList = [];
    var apps = Utility.clone(God.getFormatedProcesses());

    if (!apps[0]) {
      debug('[PM2] Did not override dump file because list of processes is empty');
      return cb(null, { success: true, process_list: processList });
    }

    finalizeDump(processList, apps, cb);
  };

  /**
   * Description
   * @method ping
   * @param {} env
   * @param {} cb
   * @return CallExpression
   */
  God.ping = function(env, cb) {
    return cb(null, { msg: 'pong' });
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
    if (!God.clusters_db[id]) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    var proc = God.clusters_db[id];
    if (!proc || !proc.pm2_env) {
      return cb(God.logAndGenerateError('Error when getting proc || proc.pm2_env'), {});
    }

    proc = Utility.clone(proc.pm2_env);

    delete proc.created_at;
    delete proc.pm_id;
    delete proc.unique_id;

    proc.unique_id = Utility.generateUUID();

    God.injectVariables(proc, function injectProc(err, proc) {
      if (err) return cb(err);

      God.executeApp(Utility.clone(proc), function(err, clu) {
        if (err) return cb(err);

        God.notify('start', clu, true);
        return cb(null, Utility.clone(clu));
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
    if (!God.clusters_db[id]) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    var proc = God.clusters_db[id];

    if (proc.pm2_env.status === cst.ONLINE_STATUS) {
      return cb(God.logAndGenerateError('process already online'), {});
    }

    if (proc.pm2_env.status === cst.LAUNCHING_STATUS) {
      return cb(God.logAndGenerateError('process already started'), {});
    }

    if (proc.process && proc.process.pid) {
      return cb(God.logAndGenerateError('Process with pid ' + proc.process.pid + ' already exists'), {});
    }

    return God.executeApp(proc.pm2_env, function(err, proc) {
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
    if (typeof id === 'object' && 'id' in id) {
      id = id.id;
    }

    if (!God.clusters_db[id]) {
      return cb(God.logAndGenerateError(id + ' : id unknown'), {});
    }

    var proc = God.clusters_db[id];

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
      return cb(null, { error: true, message: 'could not kill process w/o pid' });
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

      if (proc.pm2_env.pm_id.toString().indexOf('_old_') !== 0) {
        try {
          fs.unlinkSync(proc.pm2_env.pm_pid_path);
        } catch (e) { }
      }

      if (proc.pm2_env.axm_actions) proc.pm2_env.axm_actions = [];
      if (proc.pm2_env.axm_monitor) proc.pm2_env.axm_monitor = {};

      proc.process.pid = 0;
      return cb(null, God.getFormatedProcess(id));
    });
  };

  God.resetMetaProcessId = function(id, cb) {
    if (!God.clusters_db[id]) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    var proc = God.clusters_db[id];
    if (!proc || !proc.pm2_env) {
      return cb(God.logAndGenerateError('Error when getting proc || proc.pm2_env'), {});
    }

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

      if (Object.keys(God.clusters_db).length === 0) {
        God.next_id = 0;
      }
      return cb(null, proc);
    });

    return false;
  };

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
    var id = opts.id;
    var env = opts.env || {};

    if (typeof id === 'undefined') {
      return cb(God.logAndGenerateError('opts.id not passed to restartProcessId', opts));
    }

    if (!God.clusters_db[id]) {
      return cb(God.logAndGenerateError('God db process id unknown'), {});
    }

    var proc = God.clusters_db[id];

    God.resetState(proc.pm2_env);
    God.deleteCron(id);

    Utility.extend(proc.pm2_env.env, env);
    Utility.extendExtraConfig(proc, opts);

    if (God.pm2_being_killed) {
      return cb(God.logAndGenerateError('[RestartProcessId] PM2 is being killed, stopping restart procedure...'));
    }

    if (isProcessOnline(proc)) {
      God.stopProcessId(id, function(err) {
        if (God.pm2_being_killed) {
          return cb(God.logAndGenerateError('[RestartProcessId] PM2 is being killed, stopping restart procedure...'));
        }

        proc.pm2_env.restart_time += 1;
        return God.startProcessId(id, cb);
      });

      return false;
    }

    debug('[restart] process not online, starting it');
    return God.startProcessId(id, cb);
  };

  /**
   * Restart all process by name
   * @method restartProcessName
   * @param {} name
   * @param {} cb
   * @return Literal
   */
  God.restartProcessName = function(name, cb) {
    var processes = God.findByName(name);

    if (!processes || processes.length === 0) {
      return cb(God.logAndGenerateError('Unknown process'), {});
    }

    eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      if (God.pm2_being_killed) {
        return next('[Watch] PM2 is being killed, stopping restart procedure...');
      }

      if (isProcessOnline(proc)) {
        return God.restartProcessId({ id: proc.pm2_env.pm_id }, next);
      }

      if (isProcessStopping(proc) || isProcessLaunching(proc)) {
        return next(util.format('[Watch] Process name %s is being stopped so I won\'t restart it', name));
      }

      return God.startProcessId(proc.pm2_env.pm_id, next);
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
    var id = opts.process_id;
    var signal = opts.signal;

    if (!God.clusters_db[id]) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    try {
      process.kill(God.clusters_db[id].process.pid, signal);
    } catch (e) {
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
    var processes = God.findByName(opts.process_name);
    var signal    = opts.signal;

    if (!processes || processes.length === 0) {
      return cb(God.logAndGenerateError('Unknown process name'), {});
    }

    eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      if (isProcessOnline(proc) || isProcessLaunching(proc)) {
        try {
          process.kill(proc.process.pid, signal);
        } catch (e) {
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
   * Stop watching daemon
   * @method stopWatch
   * @param {} method
   * @param {} value
   * @param {} fn
   * @return
   */
  God.stopWatch = function(method, value, fn) {
    if (method === 'stopAll' || method === 'deleteAll') {
      God.getFormatedProcesses().forEach(function(proc) {
        God.clusters_db[proc.pm_id].pm2_env.watch = false;
        God.watch.disable(God.clusters_db[proc.pm_id].pm2_env);
      });

      return fn(null, { success: true });
    }

    var env = getProcessEnvByMethod(method, value);
    if (!env) {
      return fn(null, { success: true });
    }

    God.watch.disable(env.pm2_env);
    env.pm2_env.watch = false;

    return fn(null, { success: true });
  };

  /**
   * Toggle watching daemon
   * @method toggleWatch
   * @param {String} method
   * @param {Object} application environment, should include id
   * @param {Function} callback
   */
  God.toggleWatch = function(method, value, fn) {
    var env = getProcessEnvByMethod(method, value);

    if (!env) {
      return fn(null, { success: true });
    }

    env.pm2_env.watch = !env.pm2_env.watch;
    if (env.pm2_env.watch) {
      God.watch.enable(env.pm2_env);
    } else {
      God.watch.disable(env.pm2_env);
    }

    return fn(null, { success: true });
  };

  /**
   * Start Watch
   * @method startWatch
   * @param {String} method
   * @param {Object} application environment, should include id
   * @param {Function} callback
   */
  God.startWatch = function(method, value, fn) {
    var env = getProcessEnvByMethod(method, value);

    if (!env) {
      return fn(null, { success: true });
    }

    if (env.pm2_env.watch) {
      return fn(null, { success: true, notrestarted: true });
    }

    God.watch.enable(env.pm2_env);
    env.pm2_env.watch = true;

    return fn(null, { success: true });
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
    var processIds = Object.keys(God.clusters_db);

    processIds.forEach(function(id) {
      var cluster = God.clusters_db[id];

      console.log('Reloading logs for process id %d', id);

      if (!cluster || !cluster.pm2_env) {
        return;
      }

      if (cluster.send && cluster.pm2_env.exec_mode === 'cluster_mode') {
        try {
          cluster.send({ type: 'log:reload' });
        } catch (e) {
          console.error(e.message || e);
        }
      } else if (cluster._reloadLogs) {
        cluster._reloadLogs(function(err) {
          if (err) God.logAndGenerateError(err);
        });
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
    if (typeof packet.pm_id === 'undefined' || !packet.line) {
      return cb(God.logAndGenerateError('pm_id or line field missing'), {});
    }

    var pm_id = packet.pm_id;
    var line = packet.line;
    var proc = God.clusters_db[pm_id];

    if (!proc) {
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> unknown.'), {});
    }

    if (proc.pm2_env.exec_mode === 'cluster_mode') {
      return cb(God.logAndGenerateError('Cannot send line to processes in cluster mode'), {});
    }

    if (!isProcessOnline(proc) && !isProcessLaunching(proc)) {
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> offline.'), {});
    }

    try {
      proc.stdin.write(line, function() {
        return cb(null, {
          pm_id: pm_id,
          line: line
        });
      });
    } catch (e) {
      return cb(God.logAndGenerateError(e), {});
    }
  };

  /**
   * @param {object} packet
   * @param {function} cb
   */
  God.sendDataToProcessId = function(packet, cb) {
    if (typeof packet.id === 'undefined' ||
        typeof packet.data === 'undefined' ||
        !packet.topic) {
      return cb(God.logAndGenerateError('ID, DATA or TOPIC field is missing'), {});
    }

    var pm_id = packet.id;
    var data = packet.data;
    var proc = God.clusters_db[pm_id];

    if (!proc) {
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> unknown.'), {});
    }

    if (!isProcessOnline(proc) && !isProcessLaunching(proc)) {
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> offline.'), {});
    }

    try {
      proc.send(packet);
    } catch (e) {
      return cb(God.logAndGenerateError(e), {});
    }

    return cb(null, {
      success: true,
      data: packet
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
      return handleMsgById(cmd, cb);
    }

    if ('name' in cmd) {
      return handleMsgByName(cmd, cb);
    }

    return cb(God.logAndGenerateError('method requires name or id field'), {});
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

  God.monitor = function Monitor(pm_id, cb) {
    if (!God.clusters_db[pm_id] || !God.clusters_db[pm_id].pm2_env) {
      return cb(new Error('Unknown pm_id'));
    }

    God.clusters_db[pm_id].pm2_env._km_monitored = true;
    return cb(null, { success: true, pm_id: pm_id });
  };

  God.unmonitor = function Monitor(pm_id, cb) {
    if (!God.clusters_db[pm_id] || !God.clusters_db[pm_id].pm2_env) {
      return cb(new Error('Unknown pm_id'));
    }

    God.clusters_db[pm_id].pm2_env._km_monitored = false;
    return cb(null, { success: true, pm_id: pm_id });
  };

  God.getReport = function(arg, cb) {
    var report = {
      pm2_version: pkg.version,
      node_version: 'N/A',
      node_path: process.env['_'] || 'not found',
      argv0: process.argv0,
      argv: process.argv,
      user: process.env.USER,
      uid: (cst.IS_WINDOWS === false && process.geteuid) ? process.geteuid() : 'N/A',
      gid: (cst.IS_WINDOWS === false && process.getegid) ? process.getegid() : 'N/A',
      env: process.env,
      managed_apps: Object.keys(God.clusters_db).length,
      started_at: God.started_at
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
 * Determines if a process should be monitored.
 * @param {Object} pro - Process object.
 * @return {Boolean}
 */
function isProcessMonitored(pro) {
  if (pro.pm2_env.status !== cst.ONLINE_STATUS) {
    return false;
  }

  if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
    return !isNaN(pro.pm2_env.axm_options.pid);
  }

  return true;
}

/**
 * Extracts the process ID, possibly overridden by axm_options.
 * @param {Object} pro - Process object.
 * @return {Number|String}
 */
function extractProcessId(pro) {
  if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
    return pro.pm2_env.axm_options.pid;
  }
  return pro.pid;
}

/**
 * Prepares a process with empty monitor data.
 * @param {Object} pro - Process object.
 * @return {Object}
 */
function assignEmptyMonitorData(pro) {
  pro.monit = {
    memory: 0,
    cpu: 0
  };
  return pro;
}

/**
 * Prepares an empty monitor data object for mapping.
 * @param {Object} pro - Process object.
 * @return {Object}
 */
function prepareEmptyMonitorData(pro) {
  pro.monit = {
    memory: 0,
    cpu: 0
  };
  return pro;
}

/**
 * Determines if a process is currently online.
 * @param {Object} proc - Process object.
 * @return {Boolean}
 */
function isProcessOnline(proc) {
  return proc.pm2_env.status === cst.ONLINE_STATUS ||
         proc.pm2_env.status === cst.LAUNCHING_STATUS;
}

/**
 * Determines if a process is currently stopping.
 * @param {Object} proc - Process object.
 * @return {Boolean}
 */
function isProcessStopping(proc) {
  return proc.pm2_env.status === cst.STOPPING_STATUS;
}

/**
 * Determines if a process is currently launching.
 * @param {Object} proc - Process object.
 * @return {Boolean}
 */
function isProcessLaunching(proc) {
  return proc.pm2_env.status === cst.LAUNCHING_STATUS;
}

/**
 * Determines final dump state and calls final callback.
 * @param {Array} processList - List to be written to dump file.
 * @param {Array} apps - Process applications.
 * @param {Function} cb - Final callback.
 */
function finalizeDump(processList, apps, cb) {
  if (!apps[0]) {
    return completeDump(processList, cb);
  }

  delete apps[0].pm2_env.instances;
  delete apps[0].pm2_env.pm_id;

  if (!apps[0].pm2_env.pmx_module) {
    processList.push(apps[0].pm2_env);
  }

  apps.shift();
  finalizeDump(processList, apps, cb);
}

/**
 * Writes dump file after backup handling.
 * @param {Array} processList - Final list of processes to dump.
 * @param {Function} cb - Callback.
 */
function completeDump(processList, cb) {
  if (processList.length === 0) {
    handleEmptyDump(processList, cb);
    return;
  }

  backupDumpFile();

  try {
    fs.writeFileSync(cst.DUMP_FILE_PATH, JSON.stringify(processList));
  } catch (e) {
    console.error(e.stack || e);
    restoreDumpFileOnFailure();
  }

  cb(null, { success: true, process_list: processList });
}

/**
 * Handles empty dump file scenario.
 * @param {Array} processList - Current process list.
 * @param {Function} cb - Callback.
 */
function handleEmptyDump(processList, cb) {
  if (!fs.existsSync(cst.DUMP_FILE_PATH) && typeof this.clearDump === 'function') {
    this.clearDump(function(){});
  }
  return cb(null, { success: true, process_list: processList });
}

/**
 * Attempts to restore dump from backup after write failure.
 */
function restoreDumpFileOnFailure() {
  try {
    if (fs.existsSync(cst.DUMP_BACKUP_FILE_PATH)) {
      fs.writeFileSync(cst.DUMP_FILE_PATH, fs.readFileSync(cst.DUMP_BACKUP_FILE_PATH));
    }
  } catch (e) {
    try {
      if (fs.existsSync(cst.DUMP_FILE_PATH)) {
        fs.unlinkSync(cst.DUMP_FILE_PATH);
      }
    } catch (e2) {
      console.error(e2.stack || e2);
    }
    console.error(e.stack || e);
  }
}

/**
 * Backs up current dump file if it exists.
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
 * Gets process environment based on method and value.
 * @param {String} method - Method name pattern.
 * @param {String|Object} value - Value to look up.
 * @return {Object|null}
 */
function getProcessEnvByMethod(method, value) {
  if (method === 'restartProcessId') {
    return God.clusters_db[value.id];
  }

  if (method === 'restartProcessName') {
    var found = God.findByName(value);
    return God.clusters_db[found];
  }

  if (method.indexOf('ProcessId') !== -1) {
    return God.clusters_db[value];
  }

  if (method.indexOf('ProcessName') !== -1) {
    var found = God.findByName(value);
    return God.clusters_db[found];
  }

  return null;
}

/**
 * Handles messaging by process ID.
 * @param {Object} cmd - Message command object.
 * @param {Function} cb - Callback.
 * @return {Function}
 */
function handleMsgById(cmd, cb) {
  var id = cmd.id;

  if (!God.clusters_db[id]) {
    return cb(God.logAndGenerateError(id + ' id unknown'), {});
  }

  var proc = God.clusters_db[id];
  var actionExist = false;

  proc.pm2_env.axm_actions.forEach(function(action) {
    if (action.action_name === cmd.msg) {
      actionExist = true;
      action.output = [];
    }
  });

  if (!actionExist) {
    return cb(God.logAndGenerateError('Action doesn\'t exist ' + cmd.msg + ' for ' + proc.pm2_env.name), {});
  }

  if (isProcessOnline(proc)) {
    if (cmd.opts == null && !cmd.uuid) {
      proc.send(cmd.msg);
    } else {
      proc.send(cmd);
    }
    return cb(null, { process_count: 1, success: true });
  }

  return cb(God.logAndGenerateError(id + ' : id offline'), {});
}

/**
 * Handles messaging by process name.
 * @param {Object} cmd - Message command object.
 * @param {Function} cb - Callback.
 * @return {Function}
 */
function handleMsgByName(cmd, cb) {
  var name = cmd.name;
  var arr = Object.keys(God.clusters_db);
  var sent = 0;

  function processNext(arr) {
    if (arr[0] == null || !arr) {
      return cb(null, {
        process_count: sent,
        success: true
      });
    }

    var id = arr[0];

    if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env) {
      arr.shift();
      return processNext(arr);
    }

    var procEnv = God.clusters_db[id].pm2_env;

    if (procEnv.axm_actions.every(function(action) {
          return action.action_name !== cmd.msg;
        })) {
      arr.shift();
      return processNext(arr);
    }

    if ((p.basename(procEnv.pm_exec_path) === name ||
         procEnv.name === name ||
         procEnv.namespace === name ||
         name === 'all') &&
        isProcessOnline(procEnv)) {

      var actionMatched = false;
      procEnv.axm_actions.forEach(function(action) {
        if (action.action_name === cmd.msg) {
          actionMatched = true;
        }
      });

      if (!actionMatched || procEnv.axm_actions.length === 0) {
        arr.shift();
        return processNext(arr);
      }

      if (cmd.opts == null) {
        God.clusters_db[id].send(cmd.msg);
      } else {
        God.clusters_db[id].send(cmd);
      }

      sent++;
    }

    arr.shift();
    return processNext(arr);
  }

  return processNext(arr);
}