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
// Helper Functions
// ============================================================================

function filterBadProcess(pro) {
  if (pro.pm2_env.status !== cst.ONLINE_STATUS) {
    return false;
  }

  if (pro.pm2_env.axm_options?.pid && isNaN(pro.pm2_env.axm_options.pid)) {
    return false;
  }

  return true;
}

function getProcessId(pro) {
  return pro.pm2_env.axm_options?.pid || pro.pid;
}

function createEmptyMonit() {
  return { memory: 0, cpu: 0 };
}

function attachMonitData(processes, statistics) {
  return processes.map(pro => {
    if (!filterBadProcess(pro)) {
      pro.monit = createEmptyMonit();
      return pro;
    }

    const pid = getProcessId(pro);
    const stat = statistics[pid];

    pro.monit = stat
      ? {
          memory: stat.memory,
          cpu: Math.round(stat.cpu * 10) / 10
        }
      : createEmptyMonit();

    return pro;
  });
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

function writeDumpFile(processList) {
  try {
    fs.writeFileSync(cst.DUMP_FILE_PATH, JSON.stringify(processList));
  } catch (e) {
    console.error(e.stack || e);
    restoreDumpFileFromBackup();
  }
}

function restoreDumpFileFromBackup() {
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

function extractProcessConfig(pm2Env) {
  const config = Utility.clone(pm2Env);
  delete config.instances;
  delete config.pm_id;
  return config;
}

function getProcessEnv(clustersDb, id) {
  return clustersDb[id]?.pm2_env;
}

function isProcessOnline(proc) {
  return proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS;
}

function validateProcessId(clustersDb, id) {
  if (!(id in clustersDb)) {
    return { valid: false, error: `${id} id unknown` };
  }
  if (!clustersDb[id]?.pm2_env) {
    return { valid: false, error: 'Error when getting proc || proc.pm2_env' };
  }
  return { valid: true };
}

function clearProcessMetadata(proc) {
  if (proc.pm2_env.axm_actions) proc.pm2_env.axm_actions = [];
  if (proc.pm2_env.axm_monitor) proc.pm2_env.axm_monitor = {};
}

function findProcessEnvByMethod(clustersDb, method, value) {
  if (method.indexOf('ProcessId') !== -1) {
    return clustersDb[value];
  }
  if (method.indexOf('ProcessName') !== -1) {
    const processes = Object.values(clustersDb).filter(p => p.pm2_env.name === value);
    return processes[0];
  }
  return null;
}

function findProcessEnvByMethodForWatch(clustersDb, method, value) {
  if (method === 'restartProcessId') {
    return clustersDb[value.id];
  }
  if (method === 'restartProcessName') {
    const processes = Object.values(clustersDb).filter(p => p.pm2_env.name === value);
    return processes[0];
  }
  return null;
}

// ============================================================================
// Module Export
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
        pro.monit = createEmptyMonit();
        return pro;
      }));
    }

    pidusage(pids, (err, statistics) => {
      if (err || !statistics) {
        console.error('Error caught while calling pidusage:', err);
        return cb(null, processes.map(pro => {
          pro.monit = createEmptyMonit();
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

    if (!apps[0]) {
      debug('[PM2] Did not override dump file because list of processes is empty');
      return cb(null, { success: true, process_list: [] });
    }

    const processList = [];

    const extractAndSave = (appList) => {
      if (!appList[0]) return processList;
      const config = extractProcessConfig(appList[0].pm2_env);
      if (!appList[0].pm2_env.pmx_module) {
        processList.push(config);
      }
      appList.shift();
      return extractAndSave(appList);
    };

    extractAndSave(apps);

    if (processList.length === 0) {
      if (!fs.existsSync(cst.DUMP_FILE_PATH) && typeof God.clearDump === 'function') {
        God.clearDump(() => {});
      }
      return cb(null, { success: true, process_list: processList });
    }

    backupDumpFile();
    writeDumpFile(processList);

    return cb(null, { success: true, process_list: processList });
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
    const validation = validateProcessId(God.clusters_db, id);
    if (!validation.valid) {
      return cb(God.logAndGenerateError(validation.error), {});
    }

    const proc = Utility.clone(God.clusters_db[id].pm2_env);
    delete proc.created_at;
    delete proc.pm_id;
    delete proc.unique_id;
    proc.unique_id = Utility.generateUUID();

    God.injectVariables(proc, (_err, injectedProc) => {
      God.executeApp(Utility.clone(injectedProc), (err, clu) => {
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
    const validation = validateProcessId(God.clusters_db, id);
    if (!validation.valid) {
      return cb(God.logAndGenerateError(validation.error), {});
    }

    const proc = God.clusters_db[id];

    if (proc.pm2_env.status === cst.ONLINE_STATUS) {
      return cb(God.logAndGenerateError('process already online'), {});
    }
    if (proc.pm2_env.status === cst.LAUNCHING_STATUS) {
      return cb(God.logAndGenerateError('process already started'), {});
    }
    if (proc.process?.pid) {
      return cb(God.logAndGenerateError(`Process with pid ${proc.process.pid} already exists`), {});
    }

    return God.executeApp(God.clusters_db[id].pm2_env, (err, proc) => {
      return cb(err, Utility.clone(proc));
    });
  };

  /**
   * Stop a process and set it to stopped state
   */
  God.stopProcessId = function(id, cb) {
    if (typeof id === 'object' && 'id' in id) {
      id = id.id;
    }

    const validation = validateProcessId(God.clusters_db, id);
    if (!validation.valid) {
      return cb(God.logAndGenerateError(validation.error), {});
    }

    const proc = God.clusters_db[id];
    clearTimeout(proc.pm2_env.restart_task);

    if (proc.pm2_env.status === cst.STOPPED_STATUS) {
      proc.process.pid = 0;
      return cb(null, God.getFormatedProcess(id));
    }

    if (proc.state === 'none') {
      return setTimeout(() => { God.stopProcessId(id, cb); }, 250);
    }

    console.log('Stopping app:%s id:%s', proc.pm2_env.name, proc.pm2_env.pm_id);
    proc.pm2_env.status = cst.STOPPING_STATUS;

    if (!proc.process.pid) {
      console.error('app=%s id=%d does not have a pid', proc.pm2_env.name, proc.pm2_env.pm_id);
      proc.pm2_env.status = cst.STOPPED_STATUS;
      return cb(null, { error: true, message: 'could not kill process w/o pid' });
    }

    God.killProcess(proc.process.pid, proc.pm2_env, (err) => {
      proc.pm2_env.status = cst.STOPPED_STATUS;
      God.notify('exit', proc);

      if (err?.type === 'timeout') {
        console.error('app=%s id=%d pid=%s could not be stopped',
          proc.pm2_env.name, proc.pm2_env.pm_id, proc.process.pid);
        proc.pm2_env.status = cst.ERRORED_STATUS;
        return cb(null, God.getFormatedProcess(id));
      }

      if (!proc.pm2_env.pm_id.toString().startsWith('_old_')) {
        try {
          fs.unlinkSync(proc.pm2_env.pm_pid_path);
        } catch (e) {}
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
    const validation = validateProcessId(God.clusters_db, id);
    if (!validation.valid) {
      return cb(God.logAndGenerateError(validation.error), {});
    }

    const proc = God.clusters_db[id];
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

    God.stopProcessId(id, (err, proc) => {
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
    const { id, env = {} } = opts;

    if (typeof id === 'undefined') {
      return cb(God.logAndGenerateError('opts.id not passed to restartProcessId', opts));
    }

    const validation = validateProcessId(God.clusters_db, id);
    if (!validation.valid) {
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

    if (isProcessOnline(proc)) {
      God.stopProcessId(id, (err) => {
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
   * Restart all processes by name
   */
  God.restartProcessName = function(name, cb) {
    const processes = God.findByName(name);

    if (!processes || processes.length === 0) {
      return cb(God.logAndGenerateError('Unknown process'), {});
    }

    eachLimit(processes, cst.CONCURRENT_ACTIONS, (proc, next) => {
      if (God.pm2_being_killed) {
        return next('[Watch] PM2 is being killed, stopping restart procedure...');
      }
      if (isProcessOnline(proc)) {
        return God.restartProcessId({ id: proc.pm2_env.pm_id }, next);
      }
      if (proc.pm2_env.status !== cst.STOPPING_STATUS && proc.pm2_env.status !== cst.LAUNCHING_STATUS) {
        return God.startProcessId(proc.pm2_env.pm_id, next);
      }
      return next(util.format('[Watch]