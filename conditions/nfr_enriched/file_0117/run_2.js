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
  // Helper: Filter processes that are online and have valid PIDs
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

  // Helper: Extract process ID from process object
  function getProcessId(pro) {
    if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
      return pro.pm2_env.axm_options.pid;
    }
    return pro.pid;
  }

  // Helper: Create empty monitoring statistics
  function createEmptyMonitStats() {
    return {
      memory: 0,
      cpu: 0
    };
  }

  // Helper: Attach monitoring data to process
  function attachMonitData(pro, statistics) {
    if (!filterBadProcess(pro)) {
      pro.monit = createEmptyMonitStats();
      return pro;
    }

    const pid = getProcessId(pro);
    const stat = statistics[pid];

    if (!stat) {
      pro.monit = createEmptyMonitStats();
      return pro;
    }

    pro.monit = {
      memory: stat.memory,
      cpu: Math.round(stat.cpu * 10) / 10
    };

    return pro;
  }

  // Helper: Handle pidusage error by returning empty stats
  function handlePidUsageError(processes) {
    return processes.map(pro => {
      pro.monit = createEmptyMonitStats();
      return pro;
    });
  }

  God.getMonitorData = function getMonitorData(env, cb) {
    const processes = God.getFormatedProcesses();
    const pids = processes.filter(filterBadProcess)
      .map(pro => getProcessId(pro));

    if (pids.length === 0) {
      return cb(null, handlePidUsageError(processes));
    }

    pidusage(pids, function retPidUsage(err, statistics) {
      if (err) {
        console.error('Error caught while calling pidusage');
        console.error(err);
        return cb(null, handlePidUsageError(processes));
      }

      if (!statistics) {
        console.error('Statistics is not defined!');
        return cb(null, handlePidUsageError(processes));
      }

      const processesWithMonit = processes.map(pro => attachMonitData(pro, statistics));
      cb(null, processesWithMonit);
    });
  };

  // Helper: Check if process list is empty
  function isProcessListEmpty(apps) {
    return !apps || !apps[0];
  }

  // Helper: Backup dump file
  function backupDumpFile() {
    try {
      if (fs.existsSync(cst.DUMP_FILE_PATH)) {
        fs.writeFileSync(cst.DUMP_BACKUP_FILE_PATH, fs.readFileSync(cst.DUMP_FILE_PATH));
      }
    } catch (e) {
      console.error(e.stack || e);
    }
  }

  // Helper: Write dump file with error recovery
  function writeDumpFile(processListData) {
    try {
      fs.writeFileSync(cst.DUMP_FILE_PATH, JSON.stringify(processListData));
    } catch (e) {
      console.error(e.stack || e);
      try {
        if (fs.existsSync(cst.DUMP_BACKUP_FILE_PATH)) {
          fs.writeFileSync(cst.DUMP_FILE_PATH, fs.readFileSync(cst.DUMP_BACKUP_FILE_PATH));
        }
      } catch (e) {
        fs.unlinkSync(cst.DUMP_FILE_PATH);
        console.error(e.stack || e);
      }
    }
  }

  // Helper: Recursively save processes to dump list
  function saveProcessesToList(apps, processList) {
    if (!apps || !apps[0]) {
      return processList;
    }

    const app = apps[0];
    delete app.pm2_env.instances;
    delete app.pm2_env.pm_id;

    if (!app.pm2_env.pmx_module) {
      processList.push(app.pm2_env);
    }

    apps.shift();
    return saveProcessesToList(apps, processList);
  }

  God.dumpProcessList = function(cb) {
    const apps = Utility.clone(God.getFormatedProcesses());
    const that = this;

    if (isProcessListEmpty(apps)) {
      debug('[PM2] Did not override dump file because list of processes is empty');
      return cb(null, { success: true, process_list: [] });
    }

    const processList = saveProcessesToList(apps, []);

    if (processList.length === 0) {
      if (!fs.existsSync(cst.DUMP_FILE_PATH) && typeof that.clearDump === 'function') {
        that.clearDump(function(){});
      }
      return cb(null, { success: true, process_list: processList });
    }

    backupDumpFile();
    writeDumpFile(processList);

    return cb(null, { success: true, process_list: processList });
  };

  God.ping = function(env, cb) {
    return cb(null, { msg: 'pong' });
  };

  God.notifyKillPM2 = function() {
    God.pm2_being_killed = true;
  };

  // Helper: Validate process exists in database
  function validateProcessExists(id) {
    if (!(id in God.clusters_db)) {
      return { valid: false, error: God.logAndGenerateError(id + ' id unknown') };
    }
    if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env) {
      return { valid: false, error: God.logAndGenerateError('Error when getting proc || proc.pm2_env') };
    }
    return { valid: true };
  }

  God.duplicateProcessId = function(id, cb) {
    const validation = validateProcessExists(id);
    if (!validation.valid) {
      return cb(validation.error, {});
    }

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

  // Helper: Check if process is already running
  function isProcessRunning(proc) {
    if (proc.pm2_env.status === cst.ONLINE_STATUS) {
      return { running: true, error: God.logAndGenerateError('process already online') };
    }
    if (proc.pm2_env.status === cst.LAUNCHING_STATUS) {
      return { running: true, error: God.logAndGenerateError('process already started') };
    }
    if (proc.process && proc.process.pid) {
      return { running: true, error: God.logAndGenerateError('Process with pid ' + proc.process.pid + ' already exists') };
    }
    return { running: false };
  }

  God.startProcessId = function(id, cb) {
    if (!(id in God.clusters_db)) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    const proc = God.clusters_db[id];
    const runningCheck = isProcessRunning(proc);

    if (runningCheck.running) {
      return cb(runningCheck.error, {});
    }

    return God.executeApp(God.clusters_db[id].pm2_env, function(err, proc) {
      return cb(err, Utility.clone(proc));
    });
  };

  // Helper: Clear process restart timeout
  function clearProcessRestartTimeout(proc) {
    clearTimeout(proc.pm2_env.restart_task);
  }

  // Helper: Handle already stopped process
  function handleAlreadyStopped(proc, id) {
    proc.process.pid = 0;
    return God.getFormatedProcess(id);
  }

  // Helper: Clean up process metadata
  function cleanupProcessMetadata(proc) {
    if (proc.pm2_env.axm_actions) {
      proc.pm2_env.axm_actions = [];
    }
    if (proc.pm2_env.axm_monitor) {
      proc.pm2_env.axm_monitor = {};
    }
  }

  // Helper: Handle kill process timeout
  function handleKillTimeout(proc, id) {
    console.error('app=%s id=%d pid=%s could not be stopped',
                  proc.pm2_env.name,
                  proc.pm2_env.pm_id,
                  proc.process.pid);
    proc.pm2_env.status = cst.ERRORED_STATUS;
    return God.getFormatedProcess(id);
  }

  // Helper: Clean up process PID file
  function cleanupPidFile(proc) {
    if (proc.pm2_env.pm_id.toString().indexOf('_old_') !== 0) {
      try {
        fs.unlinkSync(proc.pm2_env.pm_pid_path);
      } catch (e) {}
    }
  }

  God.stopProcessId = function(id, cb) {
    if (typeof id === 'object' && 'id' in id) {
      id = id.id;
    }

    if (!(id in God.clusters_db)) {
      return cb(God.logAndGenerateError(id + ' : id unknown'), {});
    }

    const proc = God.clusters_db[id];

    clearProcessRestartTimeout(proc);

    if (proc.pm2_env.status === cst.STOPPED_STATUS) {
      return cb(null, handleAlreadyStopped(proc, id));
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
        return cb(null, handleKillTimeout(proc, id));
      }

      cleanupPidFile(proc);
      cleanupProcessMetadata(proc);
      proc.process.pid = 0;

      return cb(null, God.getFormatedProcess(id));
    });
  };

  God.resetMetaProcessId = function(id, cb) {
    const validation = validateProcessExists(id);
    if (!validation.valid) {
      return cb(validation.error, {});
    }

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

      if (Object.keys(God.clusters_db).length === 0) {
        God.next_id = 0;
      }

      return cb(null, proc);
    });

    return false;
  };

  // Helper: Check if PM2 is being killed
  function checkPM2BeingKilled(cb) {
    if (God.pm2_being_killed) {
      return { killed: true, error: God.logAndGenerateError('[RestartProcessId] PM2 is being killed, stopping restart procedure...') };
    }
    return { killed: false };
  }

  // Helper: Determine if process needs restart
  function shouldRestartProcess(proc) {
    return proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS;
  }

  God.restartProcessId = function(opts, cb) {
    const id = opts.id;
    const env = opts.env || {};

    if (typeof(id) === 'undefined') {
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

    const pmKilledCheck = checkPM2BeingKilled(cb);
    if (pmKilledCheck.killed) {
      return cb(pmKilledCheck.error);
    }

    if (shouldRestartProcess(proc)) {
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

  // Helper: Process restart action for single process
  function restartSingleProcess(proc, next) {
    if (God.pm2_being_killed) {
      return next('[Watch] PM2 is being killed, stopping restart procedure...');
    }

    if (proc.pm2_env.status === cst.ONLINE_STATUS) {
      return God.restartProcessId({ id: proc.pm2_env.pm_id }, next);
    }

    if (proc.pm2_env.status !== cst.STOPPING_STATUS && proc.pm2_env.status !== cst.LAUNCHING_STATUS) {
      return God.startProcessId(proc.pm2_env.pm_id, next);
    }

    return next(util.format('[Watch] Process name %s is being stopped so I won\'t restart it', proc.pm2_env.name));
  }

  God.restartProcessName = function(name, cb) {
    const processes = God.findByName(name);

    if (!processes || processes.length === 0) {
      return cb(God.logAndGenerateError('Unknown process'), {});
    }

    eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      restartSingleProcess(proc, next);
    }, function(err) {
      if (err) return cb(God.logAndGenerateError(err));
      return cb(null, God.getFormatedProcesses());
    });

    return false;
  };

  God.sendSignalToProcessId = function(opts, cb) {
    const id = opts.process_id;
    const signal = opts.signal;

    if (!(id in God.clusters_db)) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    try {
      process.kill(God.clusters_db[id].process.pid, signal);
    } catch(e) {
      return cb(God.logAndGenerateError('Error when sending signal (signal unknown)'), {});
    }

    return cb(null, God.getFormatedProcesses());
  };

  // Helper: Send signal to single process by name
  function sendSignalToSingleProcess(proc, signal, next) {
    if (proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS) {
      try {
        process.kill(proc.process.pid, signal);
      } catch(e) {
        return next(e);
      }
    }
    return setTimeout(next, 200);
  }

  God.sendSignalToProcessName = function(opts, cb) {
    const processes = God.findByName(opts.process_name);
    const signal = opts.signal;

    if (!processes || processes.length === 0) {
      return cb(God.logAndGenerateError('Unknown process name'), {});
    }

    eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      sendSignalToSingleProcess(proc, signal, next);
    }, function(err) {
      if (err) return cb(God.logAndGenerateError(err), {});
      return cb(null, God.getFormatedProcesses());
    });
  };

  // Helper: Disable watch for all processes
  function disableWatchAll() {
    const processes = God.getFormatedProcesses();
    processes.forEach(function(proc) {
      God.clusters_db[proc.pm_id].pm2_env.watch = false;
      God.watch.disable(proc.pm2_env);
    });
  }

  // Helper: Get environment for watch operation
  function getEnvForWatch(method, value) {
    if (method.indexOf('ProcessId') !== -1) {
      return God.clusters_db[value];
    } else if (method.indexOf('ProcessName') !== -1) {
      return God.clusters_db[God.findByName(value)];
    }
    return null;
  }

  God.stopWatch = function(method, value, fn) {
    if (method === 'stopAll' || method === 'deleteAll') {
      disableWatchAll();
    } else {
      const env = getEnvForWatch(method, value);
      if (env) {
        God.watch.disable(env.pm2_env);
        env.pm2_env.watch = false;
      }
    }

    return fn(null, { success: true });
  };

  God.toggleWatch = function(method, value, fn) {
    let env = null;

    if (method === 'restartProcessId') {
      env = God.clusters_db[value.id];
    } else if(method === 'restartProcessName') {
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

    return fn(null, { success: true });
  };

  God.startWatch = function(method, value, fn) {
    let env = null;

    if (method === 'restartProcessId') {
      env = God.clusters_db[value.id];
    } else if(method === 'restartProcessName') {
      env = God.clusters_db[God.findByName(value)];
    }

    if (env) {
      if (env.pm2_env.watch) {
        return fn(null, { success: true, notrestarted: true });
      }

      God.watch.enable(env.pm2_env);
      env.pm2_env.watch = true;
    }

    return fn(null, { success: true });
  };

  // Helper: Reload logs for cluster mode process
  function reloadClusterModeLogs(cluster) {
    try {
      cluster.send({
        type: 'log:reload'
      });
    } catch(e) {
      console.error(e.message || e);
    }
  }

  // Helper: Reload logs for fork mode process
  function reloadForkModeLogs(cluster) {
    if (cluster._reloadLogs) {
      cluster._reloadLogs(function(err) {
        if (err) God.logAndGenerateError(err);
      });
    }
  }

  God.reloadLogs = function(opts, cb) {
    console.log('Reloading logs...');
    const processIds = Object.keys(God.clusters_db);

    processIds.forEach(function (id) {
      const cluster = God.clusters_db[id];

      console.log('Reloading logs for process id %d', id);

      if (cluster && cluster.pm2_env) {
        if (cluster.send && cluster.pm2_env.exec_mode === 'cluster_mode') {
          reloadClusterModeLogs(cluster);
        } else if (cluster._reloadLogs) {
          reloadForkModeLogs(cluster);
        }
      }
    });

    return cb(null, {});
  };

  God.sendLineToStdin = function(packet, cb) {
    if (typeof(packet.pm_id) === 'undefined' || !packet.line) {
      return cb(God.logAndGenerateError('pm_id or line field missing'), {});
    }

    const pm_id = packet.pm_id;
    const line = packet.line;
    const proc = God.clusters_db[pm_id];

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
          pm_id: pm_id,
          line: line
        });
      });
    } catch(e) {
      return cb(God.logAndGenerateError(e), {});
    }
  };

  God.sendDataToProcessId = function(packet, cb) {
    if (typeof(packet.id) === 'undefined' ||
        typeof(packet.data) === 'undefined' ||
        !packet.topic) {
      return cb(God.logAndGenerateError('ID, DATA or TOPIC field is missing'), {});
    }

    const pm_id = packet.id;
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
      data: packet
    });
  };

  // Helper: Find action in process actions
  function findActionInProcess(proc, actionName) {
    let actionExists = false;
    proc.pm2_env.axm_actions.forEach(function(action) {
      if (action.action_name === actionName) {
        actionExists = true;
        action.output = [];
      }
    });
    return actionExists;
  }

  // Helper: Send message to process by ID
  function sendMessageToProcessId(cmd, cb) {
    const id = cmd.id;

    if (!(id in God.clusters_db)) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    const proc = God.clusters_db[id];
    const actionExists = findActionInProcess(proc, cmd.msg);

    if (!actionExists) {
      return cb(God.logAndGenerateError('Action doesn\'t exist ' + cmd.msg + ' for ' + proc.pm2_env.name), {});
    }

    if (proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS) {
      if (cmd.opts === null && !cmd.uuid) {
        proc.send(cmd.msg);
      } else {
        proc.send(cmd);
      }
      return cb(null, { process_count: 1, success: true });
    }

    return cb(God.logAndGenerateError(id + ' : id offline'), {});
  }

  // Helper: Check if process matches name criteria
  function processMatchesName(procEnv, name) {
    return (p.basename(procEnv.pm_exec_path) === name ||
            procEnv.name === name ||
            procEnv.namespace === name ||
            name === 'all') &&
           (procEnv.status === cst.ONLINE_STATUS ||
            procEnv.status === cst.LAUNCHING_STATUS);
  }

  // Helper: Send message to process by name recursively
  function sendMessageToProcessNameRecursive(arr, cmd, sent, cb) {
    if (!arr || !arr[0]) {
      return cb(null, {
        process_count: sent,
        success: true
      });
    }

    const id = arr[0];

    if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env) {
      arr.shift();
      return sendMessageToProcessNameRecursive(arr, cmd, sent, cb);
    }

    const procEnv = God.clusters_db[id].pm2_env;
    const isActionAvailable = procEnv.axm_actions.find(action => action.action_name === cmd.msg) !== undefined;

    if (!isActionAvailable) {
      arr.shift();
      return sendMessageToProcessNameRecursive(arr, cmd, sent, cb);
    }

    if (processMatchesName(procEnv, cmd.name)) {
      let actionExists = false;
      procEnv.axm_actions.forEach(function(action) {
        if (action.action_name === cmd.msg) {
          actionExists = true;
        }
      });

      if (!actionExists || procEnv.axm_actions.length === 0) {
        arr.shift();
        return sendMessageToProcessNameRecursive(arr, cmd, sent, cb);
      }

      if (cmd.opts === null) {
        God.clusters_db[id].send(cmd.msg);
      } else {
        God.clusters_db[id].send(cmd);
      }

      sent++;
      arr.shift();
      return sendMessageToProcessNameRecursive(arr, cmd, sent, cb);
    }

    arr.shift();
    return sendMessageToProcessNameRecursive(arr, cmd, sent, cb);
  }

  God.msgProcess = function(cmd, cb) {
    if ('id' in cmd) {
      return sendMessageToProcessId(cmd, cb);
    } else if ('name' in cmd) {
      const arr = Object.keys(God.clusters_db);
      return sendMessageToProcessNameRecursive(arr, cmd, 0, cb);
    } else {
      return cb(God.logAndGenerateError('method requires name or id field'), {});
    }
  };

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
    const report = {
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