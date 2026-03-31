```javascript
'use strict';

/**
 * @file ActionMethod like restart, stop, monitor... are here
 * @author Alexandre Strzelewicz <as@unitech.io>
 * @project PM2
 */

const fs = require('fs');
const path = require('path');
const eachLimit = require('async/eachLimit');
const os = require('os');
const cst = require('../../constants.js');
const pkg = require('../../package.json');
const pidusage = require('pidusage');
const util = require('util');
const debug = require('debug')('pm2:ActionMethod');
const Utility = require('../Utility');

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

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

function getProcessId(pro) {
  if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
    return pro.pm2_env.axm_options.pid;
  }
  return pro.pid;
}

function createEmptyMonitData() {
  return { memory: 0, cpu: 0 };
}

function attachMonitData(processes, statistics) {
  return processes.map(pro => {
    if (!filterBadProcess(pro)) {
      pro.monit = createEmptyMonitData();
      return pro;
    }

    const pid = getProcessId(pro);
    const stat = statistics[pid];

    if (!stat) {
      pro.monit = createEmptyMonitData();
      return pro;
    }

    pro.monit = {
      memory: stat.memory,
      cpu: Math.round(stat.cpu * 10) / 10
    };

    return pro;
  });
}

function safeFileWrite(filePath, content) {
  try {
    fs.writeFileSync(filePath, content);
    return true;
  } catch (e) {
    console.error(e.stack || e);
    return false;
  }
}

function safeFileRead(filePath) {
  try {
    return fs.readFileSync(filePath);
  } catch (e) {
    console.error(e.stack || e);
    return null;
  }
}

function safeFileDelete(filePath) {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (e) {
    return false;
  }
}

function backupDumpFile() {
  if (fs.existsSync(cst.DUMP_FILE_PATH)) {
    const content = safeFileRead(cst.DUMP_FILE_PATH);
    if (content) {
      safeFileWrite(cst.DUMP_BACKUP_FILE_PATH, content);
    }
  }
}

function restoreDumpFileFromBackup() {
  if (fs.existsSync(cst.DUMP_BACKUP_FILE_PATH)) {
    const content = safeFileRead(cst.DUMP_BACKUP_FILE_PATH);
    if (content) {
      safeFileWrite(cst.DUMP_FILE_PATH, content);
      return true;
    }
  }
  return false;
}

function handleDumpFileError(that) {
  if (!restoreDumpFileFromBackup()) {
    safeFileDelete(cst.DUMP_FILE_PATH);
  }
}

function getProcessEnv(id, God) {
  if (!(id in God.clusters_db)) {
    return null;
  }
  const proc = God.clusters_db[id];
  if (!proc || !proc.pm2_env) {
    return null;
  }
  return proc;
}

function validateProcessExists(id, God, cb) {
  if (!(id in God.clusters_db)) {
    return cb(God.logAndGenerateError(id + ' id unknown'), {});
  }
  return null;
}

function validateProcessNotOnline(proc, cb) {
  if (proc.pm2_env.status === cst.ONLINE_STATUS) {
    return cb(God.logAndGenerateError('process already online'), {});
  }
  if (proc.pm2_env.status === cst.LAUNCHING_STATUS) {
    return cb(God.logAndGenerateError('process already started'), {});
  }
  if (proc.process && proc.process.pid) {
    return cb(God.logAndGenerateError('Process with pid ' + proc.process.pid + ' already exists'), {});
  }
  return null;
}

function clearProcessMetadata(proc) {
  if (proc.pm2_env.axm_actions) {
    proc.pm2_env.axm_actions = [];
  }
  if (proc.pm2_env.axm_monitor) {
    proc.pm2_env.axm_monitor = {};
  }
}

function getWatchEnv(method, value, God) {
  if (method.indexOf('ProcessId') !== -1) {
    return God.clusters_db[value];
  } else if (method.indexOf('ProcessName') !== -1) {
    const processes = God.findByName(value);
    return processes ? God.clusters_db[processes[0].pm2_env.pm_id] : null;
  }
  return null;
}

function findProcessEnvByMethod(method, value, God) {
  if (method === 'restartProcessId') {
    return God.clusters_db[value.id];
  } else if (method === 'restartProcessName') {
    const processes = God.findByName(value);
    return processes ? God.clusters_db[processes[0].pm2_env.pm_id] : null;
  }
  return null;
}

function isProcessOnline(proc) {
  return proc.pm2_env.status === cst.ONLINE_STATUS || 
         proc.pm2_env.status === cst.LAUNCHING_STATUS;
}

function canProcessReceiveSignal(proc) {
  return proc.pm2_env.status === cst.ONLINE_STATUS || 
         proc.pm2_env.status === cst.LAUNCHING_STATUS;
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = function(God) {
  /**
   * Get monitor data for all processes
   */
  God.getMonitorData = function getMonitorData(env, cb) {
    const processes = God.getFormatedProcesses();
    const pids = processes
      .filter(filterBadProcess)
      .map(getProcessId);

    if (pids.length === 0) {
      return cb(null, processes.map(pro => {
        pro.monit = createEmptyMonitData();
        return pro;
      }));
    }

    pidusage(pids, function retPidUsage(err, statistics) {
      if (err || !statistics) {
        console.error('Error caught while calling pidusage:', err);
        return cb(null, processes.map(pro => {
          pro.monit = createEmptyMonitData();
          return pro;
        }));
      }

      const processesWithMonit = attachMonitData(processes, statistics);
      cb(null, processesWithMonit);
    });
  };

  /**
   * Dump process list to file
   */
  God.dumpProcessList = function(cb) {
    const apps = Utility.clone(God.getFormatedProcesses());
    const that = this;

    if (!apps[0]) {
      debug('[PM2] Did not override dump file because list of processes is empty');
      return cb(null, { success: true, process_list: [] });
    }

    const processList = [];

    function saveProc(appList) {
      if (!appList[0]) {
        return finalizeDump();
      }

      const app = appList[0];
      delete app.pm2_env.instances;
      delete app.pm2_env.pm_id;

      if (!app.pm2_env.pmx_module) {
        processList.push(app.pm2_env);
      }

      appList.shift();
      return saveProc(appList);
    }

    function finalizeDump() {
      if (processList.length === 0) {
        if (!fs.existsSync(cst.DUMP_FILE_PATH) && typeof that.clearDump === 'function') {
          that.clearDump(function() {});
        }
        return cb(null, { success: true, process_list: processList });
      }

      backupDumpFile();

      if (!safeFileWrite(cst.DUMP_FILE_PATH, JSON.stringify(processList))) {
        handleDumpFileError(that);
      }

      return cb(null, { success: true, process_list: processList });
    }

    saveProc(apps);
  };

  /**
   * Ping endpoint
   */
  God.ping = function(env, cb) {
    return cb(null, { msg: 'pong' });
  };

  /**
   * Notify that PM2 is being killed
   */
  God.notifyKillPM2 = function() {
    God.pm2_being_killed = true;
  };

  /**
   * Duplicate a process
   */
  God.duplicateProcessId = function(id, cb) {
    const error = validateProcessExists(id, God, cb);
    if (error) return error;

    const proc = God.clusters_db[id];
    if (!proc || !proc.pm2_env) {
      return cb(God.logAndGenerateError('Error when getting proc || proc.pm2_env'), {});
    }

    const newProc = Utility.clone(proc.pm2_env);
    delete newProc.created_at;
    delete newProc.pm_id;
    delete newProc.unique_id;
    newProc.unique_id = Utility.generateUUID();

    God.injectVariables(newProc, function inject(_err, injectedProc) {
      return God.executeApp(Utility.clone(injectedProc), function (err, clu) {
        if (err) return cb(err);
        God.notify('start', clu, true);
        return cb(err, Utility.clone(clu));
      });
    });
  };

  /**
   * Start a stopped process by ID
   */
  God.startProcessId = function(id, cb) {
    const error = validateProcessExists(id, God, cb);
    if (error) return error;

    const proc = God.clusters_db[id];
    const validationError = validateProcessNotOnline(proc, cb);
    if (validationError) return validationError;

    return God.executeApp(God.clusters_db[id].pm2_env, function(err, result) {
      return cb(err, Utility.clone(result));
    });
  };

  /**
   * Stop a process and set it to stopped state
   */
  God.stopProcessId = function(id, cb) {
    if (typeof id === 'object' && 'id' in id) {
      id = id.id;
    }

    const error = validateProcessExists(id, God, cb);
    if (error) return error;

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
      return cb(null, { error: true, message: 'could not kill process w/o pid' });
    }

    God.killProcess(proc.process.pid, proc.pm2_env, function(err) {
      proc.pm2_env.status = cst.STOPPED_STATUS;
      God.notify('exit', proc);

      if (err && err.type === 'timeout') {
        console.error('app=%s id=%d pid=%s could not be stopped',
          proc.pm2_env.name,
          proc.pm2_env.pm_id,
          proc.process.pid);
        proc.pm2_env.status = cst.ERRORED_STATUS;
        return cb(null, God.getFormatedProcess(id));
      }

      if (proc.pm2_env.pm_id.toString().indexOf('_old_') !== 0) {
        safeFileDelete(proc.pm2_env.pm_pid_path);
      }

      clearProcessMetadata(proc);
      proc.process.pid = 0;
      return cb(null, God.getFormatedProcess(id));
    });
  };

  /**
   * Reset metadata for a process
   */
  God.resetMetaProcessId = function(id, cb) {
    const error = validateProcessExists(id, God, cb);
    if (error) return error;

    const proc = God.clusters_db[id];
    if (!proc || !proc.pm2_env) {
      return cb(God.logAndGenerateError('Error when getting proc || proc.pm2_env'), {});
    }

    proc.pm2_env.created_at = Utility.getDate();
    proc.pm2_env.unstable_restarts = 0;
    proc.pm2_env.restart_time = 0;

    return cb(null, God.getFormatedProcesses());
  };

  /**
   * Delete a process by id
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
   */
  God.restartProcessId = function(opts, cb) {
    const id = opts.id;
    const env = opts.env || {};

    if (typeof id === 'undefined') {
      return cb(God.logAndGenerateError('opts.id not passed to restartProcessId', opts));
    }

    const error = validateProcessExists(id, God, cb);
    if (error) return error;

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
        if (God.pm2_being_killed) {
          return cb(God.logAndGenerateError('[RestartProcessId] PM2 is being killed, stopping restart procedure...'));
        }
        proc.pm2_env.restart_