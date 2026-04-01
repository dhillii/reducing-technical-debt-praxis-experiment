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
   * Filter processes that are online and have valid PIDs
   */
  const filterBadProcess = (pro) => {
    if (pro.pm2_env.status !== cst.ONLINE_STATUS) {
      return false;
    }

    if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
      if (isNaN(pro.pm2_env.axm_options.pid))  {
        return false;
      }
    }

    return true;
  };

  /**
   * Extract process ID from process object
   */
  const getProcessId = (pro) => {
    if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
      return pro.pm2_env.axm_options.pid;
    }
    return pro.pid;
  };

  /**
   * Create empty monitoring statistics
   */
  const createEmptyMonitStats = () => ({
    memory: 0,
    cpu: 0
  });

  /**
   * Attach monitoring data to process
   */
  const attachMonitData = (pro, statistics) => {
    if (!filterBadProcess(pro)) {
      pro['monit'] = createEmptyMonitStats();
      return pro;
    }

    const pid = getProcessId(pro);
    const stat = statistics[pid];

    if (!stat) {
      pro['monit'] = createEmptyMonitStats();
      return pro;
    }

    pro['monit'] = {
      memory: stat.memory,
      cpu: Math.round(stat.cpu * 10) / 10
    };

    return pro;
  };

  /**
   * Handle pidusage error by returning empty statistics
   */
  const handlePidUsageError = (processes, cb) => {
    const result = processes.map((pro) => {
      pro['monit'] = createEmptyMonitStats();
      return pro;
    });
    return cb(null, result);
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
      .map((pro) => getProcessId(pro));

    // No pids, return empty statistics
    if (pids.length === 0) {
      return cb(null, processes.map((pro) => {
        pro['monit'] = createEmptyMonitStats();
        return pro;
      }));
    }

    pidusage(pids, function retPidUsage(err, statistics) {
      // Just log, we'll set empty statistics
      if (err) {
        console.error('Error caught while calling pidusage');
        console.error(err);
        return handlePidUsageError(processes, cb);
      }

      if (!statistics) {
        console.error('Statistics is not defined!');
        return handlePidUsageError(processes, cb);
      }

      const processesWithMonit = processes.map((pro) => attachMonitData(pro, statistics));
      cb(null, processesWithMonit);
    });
  };

  /**
   * Backup dump file if it exists
   */
  const backupDumpFile = () => {
    try {
      if (fs.existsSync(cst.DUMP_FILE_PATH)) {
        fs.writeFileSync(cst.DUMP_BACKUP_FILE_PATH, fs.readFileSync(cst.DUMP_FILE_PATH));
      }
    } catch (e) {
      console.error(e.stack || e);
    }
  };

  /**
   * Write dump file with error recovery
   */
  const writeDumpFile = (processList) => {
    try {
      fs.writeFileSync(cst.DUMP_FILE_PATH, JSON.stringify(processList));
    } catch (e) {
      console.error(e.stack || e);
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
  };

  /**
   * Handle dump completion
   */
  const finalizeDump = (processList, that, cb) => {
    if (processList.length === 0) {
      if (!fs.existsSync(cst.DUMP_FILE_PATH) && typeof that.clearDump === 'function') {
        that.clearDump(function(){});
      }
      return cb(null, {success: true, process_list: processList});
    }

    backupDumpFile();
    writeDumpFile(processList);
    return cb(null, {success: true, process_list: processList});
  };

  /**
   * Recursively save processes to dump list
   */
  const saveProcessesToList = (apps, processList, cb) => {
    if (!apps[0]) {
      return cb(processList);
    }

    delete apps[0].pm2_env.instances;
    delete apps[0].pm2_env.pm_id;

    if (!apps[0].pm2_env.pmx_module) {
      processList.push(apps[0].pm2_env);
    }

    apps.shift();
    return saveProcessesToList(apps, processList, cb);
  };

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

    if (!apps[0]) {
      debug('[PM2] Did not override dump file because list of processes is empty');
      return cb(null, {success: true, process_list: processList});
    }

    saveProcessesToList(apps, processList, (finalList) => {
      finalizeDump(finalList, that, cb);
    });
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
   */
  const validateProcessExists = (id, cb) => {
    if (!(id in God.clusters_db)) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }
    if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env) {
      return cb(God.logAndGenerateError('Error when getting proc || proc.pm2_env'), {});
    }
    return null;
  };

  /**
   * Duplicate a process
   * @method duplicateProcessId
   * @param {} id
   * @param {} cb
   * @return CallExpression
   */
  God.duplicateProcessId = function(id, cb) {
    const validationError = validateProcessExists(id, cb);
    if (validationError) return validationError;

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
   * Handle process already stopped
   */
  const handleAlreadyStopped = (proc, id, cb) => {
    proc.process.pid = 0;
    return cb(null, God.getFormatedProcess(id));
  };

  /**
   * Handle process not yet online
   */
  const handleNotOnline = (id, cb) => {
    return setTimeout(function() { God.stopProcessId(id, cb); }, 250);
  };

  /**
   * Handle process without PID
   */
  const handleNoPid = (proc, cb) => {
    console.error('app=%s id=%d does not have a pid', proc.pm2_env.name, proc.pm2_env.pm_id);
    proc.pm2_env.status = cst.STOPPED_STATUS;
    return cb(null, { error : true, message : 'could not kill process w/o pid'});
  };

  /**
   * Handle kill process timeout
   */
  const handleKillTimeout = (proc, id, cb) => {
    console.error('app=%s id=%d pid=%s could not be stopped',
                  proc.pm2_env.name,
                  proc.pm2_env.pm_id,
                  proc.process.pid);
    proc.pm2_env.status = cst.ERRORED_STATUS;
    return cb(null, God.getFormatedProcess(id));
  };

  /**
   * Clean up process metadata after stop
   */
  const cleanupProcessMetadata = (proc, id) => {
    if (proc.pm2_env.pm_id.toString().indexOf('_old_') !== 0) {
      try {
        fs.unlinkSync(proc.pm2_env.pm_pid_path);
      } catch (e) {}
    }

    if (proc.pm2_env.axm_actions) proc.pm2_env.axm_actions = [];
    if (proc.pm2_env.axm_monitor) proc.pm2_env.axm_monitor = {};

    proc.process.pid = 0;
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
      return handleAlreadyStopped(proc, id, cb);
    }

    if (proc.state && proc.state === 'none')
      return handleNotOnline(id, cb);

    console.log('Stopping app:%s id:%s', proc.pm2_env.name, proc.pm2_env.pm_id);
    proc.pm2_env.status = cst.STOPPING_STATUS;

    if (!proc.process.pid) {
      return handleNoPid(proc, cb);
    }

    God.killProcess(proc.process.pid, proc.pm2_env, function(err) {
      proc.pm2_env.status = cst.STOPPED_STATUS;
      God.notify('exit', proc);

      if (err && err.type && err.type === 'timeout') {
        return handleKillTimeout(proc, id, cb);
      }

      cleanupProcessMetadata(proc, id);
      return cb(null, God.getFormatedProcess(id));
    });
  };

  /**
   * Reset process metadata
   */
  God.resetMetaProcessId = function(id, cb) {
    const validationError = validateProcessExists(id, cb);
    if (validationError) return validationError;

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
   * Validate restart options
   */
  const validateRestartOpts = (opts, cb) => {
    const id = opts.id;
    if (typeof(id) === 'undefined')
      return cb(God.logAndGenerateError('opts.id not passed to restartProcessId', opts));
    if (!(id in God.clusters_db))
      return cb(God.logAndGenerateError('God db process id unknown'), {});
    return null;
  };

  /**
   * Handle restart when process is online
   */
  const handleOnlineRestart = (id, cb) => {