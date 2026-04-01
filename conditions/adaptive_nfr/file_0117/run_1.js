```javascript
/**
 * Copyright 2013-2022 the PM2 project authors. All rights reserved.
 * Use of this source code is governed by a license that
 * can be found in the LICENSE file.
 */
'use strict';

/**
 * @file ActionMethod like restart, stop, monitor... are here
 * @author Alexandre Strzelewicz <as@unitech.io>
 * @project PM2
 */

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
   * @param {Array} pids
   * @param {Function} cb
   * @return {void}
   */
  const handleEmptyPids = (processes, cb) => {
    return cb(null, processes.map(pro => {
      pro['monit'] = { memory: 0, cpu: 0 };
      return pro;
    }));
  };

  /**
   * @param {Error} err
   * @param {Array} processes
   * @param {Function} cb
   * @return {void}
   */
  const handlePidUsageError = (err, processes, cb) => {
    console.error('Error caught while calling pidusage');
    console.error(err);
    return cb(null, processes.map(pro => {
      pro['monit'] = { memory: 0, cpu: 0 };
      return pro;
    }));
  };

  /**
   * @param {Object} statistics
   * @param {Array} processes
   * @param {Function} cb
   * @return {void}
   */
  const handleMissingStatistics = (processes, cb) => {
    console.error('Statistics is not defined!');
    return cb(null, processes.map(pro => {
      pro['monit'] = { memory: 0, cpu: 0 };
      return pro;
    }));
  };

  /**
   * @param {Object} pro
   * @param {Object} statistics
   * @return {Object}
   */
  const enrichProcessWithMonitData = (pro, statistics) => {
    if (!filterBadProcess(pro)) {
      pro['monit'] = { memory: 0, cpu: 0 };
      return pro;
    }

    const pid = getProcessId(pro);
    const stat = statistics[pid];

    if (!stat) {
      pro['monit'] = { memory: 0, cpu: 0 };
      return pro;
    }

    pro['monit'] = {
      memory: stat.memory,
      cpu: Math.round(stat.cpu * 10) / 10
    };

    return pro;
  };

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
      .map(pro => getProcessId(pro));

    if (pids.length === 0) {
      return handleEmptyPids(processes, cb);
    }

    pidusage(pids, function retPidUsage(err, statistics) {
      if (err) {
        return handlePidUsageError(err, processes, cb);
      }

      if (!statistics) {
        return handleMissingStatistics(processes, cb);
      }

      const enrichedProcesses = processes.map(pro => enrichProcessWithMonitData(pro, statistics));
      cb(null, enrichedProcesses);
    });
  };

  /**
   * @param {Array} apps
   * @param {Array} process_list
   * @return {void}
   */
  const saveProcessRecursive = (apps, process_list) => {
    if (!apps[0]) {
      return;
    }
    delete apps[0].pm2_env.instances;
    delete apps[0].pm2_env.pm_id;
    if (!apps[0].pm2_env.pmx_module) {
      process_list.push(apps[0].pm2_env);
    }
    apps.shift();
    return saveProcessRecursive(apps, process_list);
  };

  /**
   * @param {Array} process_list
   * @param {Object} that
   * @return {boolean}
   */
  const shouldSkipDumpFile = (process_list, that) => {
    if (process_list.length !== 0) {
      return false;
    }
    if (!fs.existsSync(cst.DUMP_FILE_PATH) && typeof that.clearDump === 'function') {
      that.clearDump(function(){});
    }
    return true;
  };

  /**
   * @param {Array} process_list
   * @return {void}
   */
  const backupDumpFile = (process_list) => {
    try {
      if (fs.existsSync(cst.DUMP_FILE_PATH)) {
        fs.writeFileSync(cst.DUMP_BACKUP_FILE_PATH, fs.readFileSync(cst.DUMP_FILE_PATH));
      }
    } catch (e) {
      console.error(e.stack || e);
    }
  };

  /**
   * @param {Array} process_list
   * @return {void}
   */
  const writeDumpFile = (process_list) => {
    try {
      fs.writeFileSync(cst.DUMP_FILE_PATH, JSON.stringify(process_list));
    } catch (e) {
      console.error(e.stack || e);
      restoreDumpFileFromBackup();
    }
  };

  /**
   * @return {void}
   */
  const restoreDumpFileFromBackup = () => {
    try {
      if (fs.existsSync(cst.DUMP_BACKUP_FILE_PATH)) {
        fs.writeFileSync(cst.DUMP_FILE_PATH, fs.readFileSync(cst.DUMP_BACKUP_FILE_PATH));
      }
    } catch (e) {
      try {
        fs.unlinkSync(cst.DUMP_FILE_PATH);
      } catch (unlinkErr) {
        // ignore
      }
      console.error(e.stack || e);
    }
  };

  /**
   * Description
   * @method dumpProcessList
   * @param {} cb
   * @return
   */
  God.dumpProcessList = function(cb) {
    const process_list = [];
    const apps = Utility.clone(God.getFormatedProcesses());
    const that = this;

    if (!apps[0]) {
      debug('[PM2] Did not override dump file because list of processes is empty');
      return cb(null, {success:true, process_list: process_list});
    }

    saveProcessRecursive(apps, process_list);

    if (shouldSkipDumpFile(process_list, that)) {
      return cb(null, {success:true, process_list: process_list});
    }

    backupDumpFile(process_list);
    writeDumpFile(process_list);

    return cb(null, {success:true, process_list: process_list});
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
   * @param {number} id
   * @return {boolean}
   */
  const isProcessIdValid = (id) => {
    return id in God.clusters_db;
  };

  /**
   * @param {number} id
   * @return {boolean}
   */
  const hasProcessValidEnv = (id) => {
    return God.clusters_db[id] && God.clusters_db[id].pm2_env;
  };

  /**
   * Duplicate a process
   * @method duplicateProcessId
   * @param {} id
   * @param {} cb
   * @return CallExpression
   */
  God.duplicateProcessId = function(id, cb) {
    if (!isProcessIdValid(id)) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    if (!hasProcessValidEnv(id)) {
      return cb(God.logAndGenerateError('Error when getting proc || proc.pm2_env'), {});
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

  /**
   * @param {number} id
   * @return {boolean}
   */
  const isProcessAlreadyOnline = (id) => {
    const proc = God.clusters_db[id];
    return proc.pm2_env.status === cst.ONLINE_STATUS;
  };

  /**
   * @param {number} id
   * @return {boolean}
   */
  const isProcessAlreadyLaunching = (id) => {
    const proc = God.clusters_db[id];
    return proc.pm2_env.status === cst.LAUNCHING_STATUS;
  };

  /**
   * @param {number} id
   * @return {boolean}
   */
  const doesProcessHavePid = (id) => {
    const proc = God.clusters_db[id];
    return proc.process && proc.process.pid;
  };

  /**
   * Start a stopped process by ID
   * @method startProcessId
   * @param {} id
   * @param {} cb
   * @return CallExpression
   */
  God.startProcessId = function(id, cb) {
    if (!isProcessIdValid(id)) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    if (isProcessAlreadyOnline(id)) {
      return cb(God.logAndGenerateError('process already online'), {});
    }

    if (isProcessAlreadyLaunching(id)) {
      return cb(God.logAndGenerateError('process already started'), {});
    }

    if (doesProcessHavePid(id)) {
      const proc = God.clusters_db[id];
      return cb(God.logAndGenerateError('Process with pid ' + proc.process.pid + ' already exists'), {});
    }

    return God.executeApp(God.clusters_db[id].pm2_env, function(err, proc) {
      return cb(err, Utility.clone(proc));
    });
  };

  /**
   * @param {number} id
   * @return {boolean}
   */
  const isProcessStopped = (id) => {
    const proc = God.clusters_db[id];
    return proc.pm2_env.status === cst.STOPPED_STATUS;
  };

  /**
   * @param {number} id
   * @return {boolean}
   */
  const isProcessNotOnline = (id) => {
    const proc = God.clusters_db[id];
    return proc.state && proc.state === 'none';
  };

  /**
   * @param {number} id
   * @return {boolean}
   */
  const doesProcessHaveNoPid = (id) => {
    const proc = God.clusters_db[id];
    return !proc.process.pid;
  };

  /**
   * @param {number} id
   * @return {boolean}
   */
  const isOldProcessId = (id) => {
    const proc = God.clusters_db[id];
    return proc.pm2_env.pm_id.toString().indexOf('_old_') === 0;
  };

  /**
   * @param {number} id
   * @return {void}
   */
  const cleanupProcessPidFile = (id) => {
    if (isOldProcessId(id)) {
      return;
    }
    try {
      const proc = God.clusters_db[id];
      fs.unlinkSync(proc.pm2_env.pm_pid_path);
    } catch (e) {
      // ignore
    }
  };

  /**
   * @param {number} id
   * @return {void}
   */
  const clearProcessActions = (id) => {
    const proc = God.clusters_db[id];
    if (proc.pm2_env.axm_actions) {
      proc.pm2_env.axm_actions = [];
    }
    if (proc.pm2_env.axm_monitor) {
      proc.pm2_env.axm_monitor = {};
    }
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

    if (!isProcessIdValid(id)) {
      return cb(God.logAndGenerateError(id + ' : id unknown'), {});
    }

    const proc = God.clusters_db[id];

    clearTimeout(proc.pm2_env.restart_task);

    if (isProcessStopped(id)) {
      proc.process.pid = 0;
      return cb(null, God.getFormatedProcess(id));
    }

    if (isProcessNotOnline(id)) {
      return setTimeout(function() { God.stopProcessId(id, cb); }, 250);
    }

    console.log('Stopping app:%s id:%s', proc.pm2_env.name, proc.pm2_env.pm_id);
    proc.pm2_env.status = cst.STOPPING_STATUS;

    if (doesProcessHaveNoPid(id)) {
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

      cleanupProcessPidFile(id);
      clearProcessActions(id);

      proc.process.pid = 0;
      return cb(null, God.getFormatedProcess(id));
    });
  };

  /**
   * @param {number} id
   * @return {boolean}
   */
  const isValidProcessId = (id) => {
    return id in God.clusters_db;
  };

  /**
   * @param {number} id
   * @return {boolean}
   */
  const hasValidProcessEnv = (id) => {
    return God.clusters_db[id] && God.clusters_db[id].pm2_env;
  };

  God.resetMetaProcessId = function(id, cb) {
    if (!isValidProcessId(id)) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    if (!hasValidProcessEnv(id)) {
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
   * @param {Object} proc
   * @return {boolean}
   */
  const isProcessOnlineOrLaunching = (proc) => {
    return proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS;
  };

  /**
   * @param {number} id
   * @return {void}
   */
  const handleRestartWhenOnline = (id, cb) => {
    God.stopProcessId(id, function(err) {
      if (God.pm2_being_killed) {
        return cb(God.logAndGenerateError('[RestartProcessId] PM2 is being killed, stopping restart procedure...'));
      }
      const proc = God.clusters_db[id];
      proc.pm2_env.restart_time += 1;
      return God.startProcessId(id, cb);
    });
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

    if (typeof(id) === 'undefined') {
      return cb(God.logAndGenerateError('opts.id not passed to restartProcessId', opts));
    }

    if (!isProcessIdValid(id)) {
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

    if (isProcessOnlineOrLaunching(proc)) {
      handleRestartWhenOnline(id, cb);
      return false;
    }

    debug('[restart] process not online, starting it');
    return God.startProcessId(id, cb);
  };

  /**
   * @param {Object} proc
   * @return {boolean}
   */
  const shouldRestartProcess = (proc) => {
    return proc.pm2_env.status === cst.ONLINE_STATUS;
  };

  /**
   * @param {Object} proc
   * @return {boolean}
   */
  const canStartProcess = (proc) => {
    const status = proc.pm2_env.status;
    return status !== cst.STOPPING_STATUS && status !== cst.LAUNCHING_STATUS;
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

    if (processes && processes.length === 0) {
      return cb(God.logAndGenerateError('Unknown process'), {});
    }

    eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      if (God.pm2_being_killed) {
        return next('[Watch] PM2 is being killed, stopping restart procedure...');
      }

      if (shouldRestartProcess(proc)) {
        return God.restartProcessId({id:proc.pm2_env.pm_id}, next);
      }

      if (canStartProcess(proc)) {
        return God.startProcessId(proc.pm2_env.pm_id, next);
      }

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

    if (!isProcessIdValid(id)) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    try {
      process.kill(God.clusters_db[id].process.pid, signal);
    } catch(e) {
      return cb(God.logAndGenerateError('Error when sending signal (signal unknown)'), {});
    }
    return cb(null, God.getFormatedProcesses());
  };

  /**
   * @param {Object} proc
   * @return {boolean}
   */
  const isProcessOnlineOrLaunchingForSignal = (proc) => {
    return proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS;
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
    const signal = opts.signal;

    if (processes && processes.length === 0) {
      return cb(God.logAndGenerateError('Unknown process name'), {});
    }

    eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      if (!isProcessOnlineOrLaunchingForSignal(proc)) {
        return setTimeout(next, 200);
      }

      try {
        process.kill(proc.process.pid, signal);
      } catch(e) {
        return next(e);
      }

      return setTimeout(next, 200);
    }, function(err) {
      if (err) return cb(God.logAndGenerateError(err), {});
      return cb(null, God.getFormatedProcesses());
    });
  };

  /**
   * @param {string} method
   * @return {boolean}
   */
  const isStopAllMethod = (method) => {
    return method === 'stopAll' || method === 'deleteAll';
  };

  /**
   * @param {string} method
   * @return {boolean}
   */
  const isProcessIdMethod = (method) => {
    return method.indexOf('ProcessId') !== -1;
  };

  /**
   * @param {string} method
   * @return {boolean}
   */
  const isProcessNameMethod = (method) => {
    return method.indexOf('ProcessName') !== -1;
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
    if (isStopAllMethod(method)) {
      const processes = God.getFormatedProcesses();
      processes.forEach(function(proc) {
        God.clusters_db[proc.pm_id].pm2_env.watch = false;
        God.watch.disable(proc.pm2_env);
      });
      return fn(null, {success:true});
    }

    let env = null;

    if (isProcessIdMethod(method)) {
      env = God.clusters_db[value];
    } else if (isProcessNameMethod(method)) {
      env = God.clusters_db[God.findByName(value)];
    }

    if (env) {
      God.watch.disable(env.pm2_env);
      env.pm2_env.watch = false;
    }

    return fn(null, {success:true});
  };

  /**
   * @param {string} method
   * @return {boolean}
   */
  const isRestartProcessIdMethod = (method) => {
    return method === 'restartProcessId';
  };

  /**
   * @param {string} method
   * @return {boolean}
   */
  const isRestartProcessNameMethod = (method) => {
    return method === 'restartProcessName';
  };

  /**
   * Toggle watching daemon
   * @method toggleWatch
   * @param {String} method
   * @param {Object} application environment, should include id
   * @param {Function} callback
   */
  God.toggleWatch = function(method, value, fn) {
    let env = null;

    if (isRestartProcessIdMethod(method)) {
      env = God.clusters_db[value.id];
    } else if (isRestartProcessNameMethod(method)) {
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
   * Start Watch
   * @method startWatch
   * @param {String} method
   * @param {Object} application environment, should include id
   * @param {Function} callback
   */
  God.startWatch = function(method, value, fn) {
    let env = null;

    if (isRestartProcessIdMethod(method)) {
      env = God.clusters_db[value.id];
    } else if (isRestartProcessNameMethod(method)) {
      env = God.clusters_db[God.findByName(value)];
    }

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

      if (cluster.send && cluster.pm2_env.exec_mode === 'cluster_mode') {
        try {
          cluster.send({
            type:'log:reload'
          });
        } catch(e) {
          console.error(e.message || e);
        }
        return;
      }

      if (cluster._reloadLogs) {
        cluster._reloadLogs(function(err) {
          if (err) God.logAndGenerateError(err);
        });
      }
    });

    return cb(null, {});
  };

  /**
   * @param {Object} packet
   * @return {boolean}
   */
  const hasRequiredStdinFields = (packet) => {
    return typeof(packet.pm_id) !== 'undefined' && packet.line;
  };

  /**
   * @param {number} pm_id
   * @return {boolean}
   */
  const isProcessInClusterMode = (pm_id) => {
    const proc = God.clusters_db[pm_id];
    return proc.pm2_env.exec_mode === 'cluster_mode';
  };

  /**
   * @param {number} pm_id
   * @return {boolean}
   */
  const isProcessOffline = (pm_id) => {
    const proc = God.clusters_db[pm_id];
    return proc.pm2_env.status !== cst.ONLINE_STATUS && proc.pm2_env.status !== cst.LAUNCHING_STATUS;
  };

  /**
   * Send Line To Stdin
   * @method sendLineToStdin
   * @param Object packet
   * @param String pm_id Process ID
   * @param String line  Line to send to process stdin
   */
  God.sendLineToStdin = function(packet, cb) {
    if (!hasRequiredStdinFields(packet)) {
      return cb(God.logAndGenerateError('pm_id or line field missing'), {});
    }

    const pm_id = packet.pm_id;
    const line = packet.line;

    const proc = God.clusters_db[pm_id];

    if (!proc) {
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> unknown.'), {});
    }

    if (isProcessInClusterMode(pm_id)) {
      return cb(God.logAndGenerateError('Cannot send line to processes in cluster mode'), {});
    }

    if (isProcessOffline(pm_id)) {
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
   * @param {Object} packet
   * @return {boolean}
   */
  const hasRequiredDataFields = (packet) => {
    return typeof(packet.id) !== 'undefined' &&
           typeof(packet.data) !== 'undefined' &&
           packet.topic;
  };

  /**
   * @param {number} pm_id
   * @return {boolean}
   */
  const isProcessOfflineForData = (pm_id) => {
    const proc = God.clusters_db[pm_id];
    return proc.pm2_env.status !== cst.ONLINE_STATUS && proc.pm2_env.status !== cst.LAUNCHING_STATUS;
  };

  /**
   * @param {object} packet
   * @param {function} cb
   */
  God.sendDataToProcessId = function(packet, cb) {
    if (!hasRequiredDataFields(packet)) {
      return cb(God.logAndGenerateError('ID, DATA or TOPIC field is missing'), {});
    }

    const pm_id = packet.id;
    const data = packet.data;

    const proc = God.clusters_db[pm_id];

    if (!proc) {
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> unknown.'), {});
    }

    if (isProcessOfflineForData(pm_id)) {
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> offline.'), {});
    }

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
   * @param {Object} cmd
   * @return {boolean}
   */
  const hasIdField = (cmd) => {
    return 'id' in cmd;
  };

  /**
   * @param {Object} cmd
   * @return {boolean}
   */
  const hasNameField = (cmd) => {
    return 'name' in cmd;
  };

  /**
   * @param {number} id
   * @return {boolean}
   */
  const isProcessValidForMsg = (id) => {
    return God.clusters_db[id] && God.clusters_db[id].pm2_env;
  };

  /**
   * @param {Object} proc_env
   * @param {string} msg
   * @return {boolean}
   */
  const hasActionAvailable = (proc_env, msg) => {
    return proc_env.axm_actions.find(action => action.action_name === msg) !== undefined;
  };

  /**
   * @param {Object} proc_env
   * @param {string} name
   * @return {boolean}
   */
  const matchesProcessName = (proc_env, name) => {
    return p.basename(proc_env.pm_exec_path) === name ||
           proc_env.name === name ||
           proc_env.namespace === name ||
           name === 'all';
  };

  /**
   * @param {Object} proc_env
   * @return {boolean}
   */
  const isProcessOnlineOrLaunchingForMsg = (proc_env) => {
    return proc_env.status === cst.ONLINE_STATUS || proc_env.status === cst.LAUNCHING_STATUS;
  };

  /**
   * @param {Object} proc_env
   * @param {string} msg
   * @return {boolean}
   */
  const hasValidActions = (proc_env, msg) => {
    return proc_env.axm_actions.length > 0;
  };

  /**
   * @param {number} id
   * @param {Object} cmd
   * @param {Function} cb
   * @return {void}
   */
  const handleMsgProcessById = (id, cmd, cb) => {
    if (!isProcessValidForMsg(id)) {
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

    if (!isProcessOnlineOrLaunchingForMsg(proc.pm2_env)) {
      return cb(God.logAndGenerateError(id + ' : id offline'), {});
    }

    if (cmd.opts === null && !cmd.uuid) {
      proc.send(cmd.msg);
    } else {
      proc.send(cmd);
    }

    return cb(null, { process_count : 1, success : true });
  };

  /**
   * @param {string} name
   * @param {Object} cmd
   * @param {Function} cb
   * @return {void}
   */
  const handleMsgProcessByName = (name, cmd, cb) => {
    const arr = Object.keys(God.clusters_db);
    let sent = 0;

    const processArray = (arr) => {
      if (!arr[0]) {
        return cb(null, {
          process_count : sent,
          success : true
        });
      }

      const id = arr[0];

      if (!isProcessValidForMsg(id)) {
        arr.shift();
        return processArray(arr);
      }

      const proc_env = God.clusters_db[id].pm2_env;

      if (!hasActionAvailable(proc_env, cmd.msg)) {
        arr.shift();
        return processArray(arr);
      }

      if (!matchesProcessName(proc_env, name) || !isProcessOnlineOrLaunchingForMsg(proc_env)) {
        arr.shift();
        return processArray(arr);
      }

      if (!hasValidActions(proc_env, cmd.msg)) {
        arr.shift();
        return processArray(arr);
      }

      if (cmd.opts === null) {
        God.clusters_db[id].send(cmd.msg);
      } else {
        God.clusters_db[id].send(cmd);
      }

      sent++;
      arr.shift();
      return processArray(arr);
    };

    processArray(arr);
  };

  /**
   * Send Message to Process by id or name
   * @method msgProcess
   * @param {} cmd
   * @param {} cb
   * @return Literal
   */
  God.msgProcess = function(cmd, cb) {
    if (hasIdField(cmd)) {
      return handleMsgProcessById(cmd.id, cmd, cb);
    }

    if (hasNameField(cmd)) {
      const processes = God.findByName(cmd.name);
      if (processes && processes.length === 0) {
        return cb(God.logAndGenerateError('Unknown process name'), {});
      }
      return handleMsgProcessByName(cmd.name, cmd, cb);
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

  /**
   * @param {number} pm_id
   * @return {boolean}
   */
  const isValidMonitorId = (pm_id) => {
    return God.clusters_db[pm_id] && God.clusters_db[pm_id].pm2_env;
  };

  God.monitor = function Monitor(pm_id, cb) {
    if (!isValidMonitorId(pm_id)) {
      return cb(new Error('Unknown pm_id'));
    }

    God.clusters_db[pm_id].pm2_env._km_monitored = true;
    return cb(null, { success : true, pm_id : pm_id });
  };

  God.unmonitor = function Monitor(pm_id, cb) {
    if (!isValidMonitorId(pm_id)) {
      return cb(new Error('Unknown pm_id'));
    }

    God.clusters_db[pm_id].pm2_env._km_monitored = false;
    return cb(null, { success : true, pm_id : pm_id });
  };

  /**
   * @return {string|number}
   */
  const getUidValue = () => {
    if (cst.IS_WINDOWS === false && process.geteuid) {
      return process.geteuid();
    }
    return 'N/A';
  };

  /**
   * @return {string|number}
   */
  const getGidValue = () => {
    if (cst.IS_WINDOWS === false && process.getegid) {
      return process.getegid();
    }
    return 'N/A';
  };

  /**
   * @return {string}
   */
  const getNodeVersion = () => {
    if (process.versions && process.versions.node) {
      return process.versions.node;
    }
    return 'N/A';
  };

  God.getReport = function(arg, cb) {
    const report = {
      pm2_version : pkg.version,
      node_version : getNodeVersion(),
      node_path : process.env['_'] || 'not found',
      argv0 : process.argv0,
      argv : process.argv,
      user : process.env.USER,
      uid : getUidValue(),
      gid : getGidValue(),
      env : process.env,
      managed_apps : Object.keys(God.clusters_db).length,
      started_at : God.started_at
    };

    process.nextTick(function() {
      return cb(null, report);
    });
  };
};

/**
 * @param {Object} pro
 * @return {boolean}
 */
function filterBadProcess(pro) {
  if (pro.pm2_env.status !== cst.ONLINE_STATUS) {
    return false;
  }

  if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
    if (isNaN(pro.pm2_env.axm_options.pid)) {
      return false;
    }
  }

  return true;
}

/**
 * @param {Object} pro
 * @return {number}
 */
function getProcessId(pro) {
  let pid = pro.pid;

  if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
    pid = pro.pm2_env.axm_options.pid;
  }

  return pid;
}
```