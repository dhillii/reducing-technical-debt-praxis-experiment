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
   * @param {Array} processListRef
   * @return {void}
   */
  const saveProcessRecursive = (apps, processListRef) => {
    if (!apps[0]) {
      return;
    }

    delete apps[0].pm2_env.instances;
    delete apps[0].pm2_env.pm_id;

    if (!apps[0].pm2_env.pmx_module) {
      processListRef.push(apps[0].pm2_env);
    }

    apps.shift();
    saveProcessRecursive(apps, processListRef);
  };

  /**
   * @param {Array} processListRef
   * @return {boolean}
   */
  const shouldSkipDumpFile = (processListRef) => {
    return processListRef.length === 0;
  };

  /**
   * @param {Array} processListRef
   * @return {void}
   */
  const handleEmptyProcessList = (processListRef, that) => {
    if (!fs.existsSync(cst.DUMP_FILE_PATH) && typeof that.clearDump === 'function') {
      that.clearDump(function(){});
    }
  };

  /**
   * @param {Array} processListRef
   * @return {void}
   */
  const backupDumpFile = (processListRef) => {
    try {
      if (fs.existsSync(cst.DUMP_FILE_PATH)) {
        fs.writeFileSync(cst.DUMP_BACKUP_FILE_PATH, fs.readFileSync(cst.DUMP_FILE_PATH));
      }
    } catch (e) {
      console.error(e.stack || e);
    }
  };

  /**
   * @param {Array} processListRef
   * @return {void}
   */
  const writeDumpFile = (processListRef) => {
    try {
      fs.writeFileSync(cst.DUMP_FILE_PATH, JSON.stringify(processListRef));
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
    const processListRef = [];
    const apps = Utility.clone(God.getFormatedProcesses());
    const that = this;

    if (!apps[0]) {
      debug('[PM2] Did not override dump file because list of processes is empty');
      return cb(null, {success:true, process_list: processListRef});
    }

    saveProcessRecursive(apps, processListRef);

    if (shouldSkipDumpFile(processListRef)) {
      handleEmptyProcessList(processListRef, that);
      return cb(null, {success:true, process_list: processListRef});
    }

    backupDumpFile(processListRef);
    writeDumpFile(processListRef);

    return cb(null, {success:true, process_list: processListRef});
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
  const isProcessOnline = (id) => {
    const proc = God.clusters_db[id];
    return proc.pm2_env.status === cst.ONLINE_STATUS;
  };

  /**
   * @param {number} id
   * @return {boolean}
   */
  const isProcessLaunching = (id) => {
    const proc = God.clusters_db[id];
    return proc.pm2_env.status === cst.LAUNCHING_STATUS;
  };

  /**
   * @param {number} id
   * @return {boolean}
   */
  const hasProcessPid = (id) => {
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

    if (isProcessOnline(id)) {
      return cb(God.logAndGenerateError('process already online'), {});
    }

    if (isProcessLaunching(id)) {
      return cb(God.logAndGenerateError('process already started'), {});
    }

    if (hasProcessPid(id)) {
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
  const isProcessNotOnlineYet = (id) => {
    const proc = God.clusters_db[id];
    return proc.state && proc.state === 'none';
  };

  /**
   * @param {number} id
   * @return {boolean}
   */
  const hasProcessNoPid = (id) => {
    const proc = God.clusters_db[id];
    return !proc.process.pid;
  };

  /**
   * @param {Object} err
   * @return {boolean}
   */
  const isTimeoutError = (err) => {
    return err && err.type && err.type === 'timeout';
  };

  /**
   * @param {number} id
   * @return {boolean}
   */
  const isOldProcess = (id) => {
    const proc = God.clusters_db[id];
    return proc.pm2_env.pm_id.toString().indexOf('_old_') === 0;
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

    if (isProcessNotOnlineYet(id)) {
      return setTimeout(function() { God.stopProcessId(id, cb); }, 250);
    }

    console.log('Stopping app:%s id:%s', proc.pm2_env.name, proc.pm2_env.pm_id);
    proc.pm2_env.status = cst.STOPPING_STATUS;

    if (hasProcessNoPid(id)) {
      console.error('app=%s id=%d does not have a pid', proc.pm2_env.name, proc.pm2_env.pm_id);
      proc.pm2_env.status = cst.STOPPED_STATUS;
      return cb(null, { error : true, message : 'could not kill process w/o pid'});
    }

    God.killProcess(proc.process.pid, proc.pm2_env, function(err) {
      proc.pm2_env.status = cst.STOPPED_STATUS;

      God.notify('exit', proc);

      if (isTimeoutError(err)) {
        console.error('app=%s id=%d pid=%s could not be stopped',
                      proc.pm2_env.name,
                      proc.pm2_env.pm_id,
                      proc.process.pid);
        proc.pm2_env.status = cst.ERRORED_STATUS;
        return cb(null, God.getFormatedProcess(id));
      }

      if (!isOldProcess(id)) {
        try {
          fs.unlinkSync(proc.pm2_env.pm_pid_path);
        } catch (e) {}
      }

      if (proc.pm2_env.axm_actions) proc.pm2_env.axm_actions = [];
      if (proc.pm2_env.axm_monitor) proc.pm2_env.axm_monitor = {};

      proc.process.pid = 0;
      return cb(null, God.getFormatedProcess(id));
    });
  };

  God.resetMetaProcessId = function(id, cb) {
    if (!isProcessIdValid(id)) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    if