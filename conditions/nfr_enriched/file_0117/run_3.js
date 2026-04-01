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
 * Filters processes that are online and have valid PIDs
 * @param {Object} pro - Process object
 * @returns {boolean} True if process is valid for monitoring
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
 * Extracts process ID from process object, preferring axm_options.pid if available
 * @param {Object} pro - Process object
 * @returns {number} Process ID
 */
function getProcessId(pro) {
  const pid = pro.pid;

  if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
    return pro.pm2_env.axm_options.pid;
  }

  return pid;
}

/**
 * Creates empty monitoring statistics object
 * @returns {Object} Empty monit object
 */
function createEmptyMonitStats() {
  return {
    memory: 0,
    cpu: 0
  };
}

/**
 * Applies monitoring statistics to processes
 * @param {Array} processes - Array of process objects
 * @param {Object} statistics - Statistics from pidusage
 * @returns {Array} Processes with monitoring data
 */
function applyMonitoringStats(processes, statistics) {
  return processes.map(function(pro) {
    if (filterBadProcess(pro) === false) {
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
  });
}

/**
 * Handles pidusage callback and applies statistics
 * @param {Array} processes - Array of process objects
 * @param {Function} cb - Callback function
 * @returns {Function} Callback handler
 */
function createPidUsageHandler(processes, cb) {
  return function retPidUsage(err, statistics) {
    if (err) {
      console.error('Error caught while calling pidusage');
      console.error(err);
      const emptyProcesses = processes.map(function(pro) {
        pro['monit'] = createEmptyMonitStats();
        return pro;
      });
      return cb(null, emptyProcesses);
    }

    if (!statistics) {
      console.error('Statistics is not defined!');
      const emptyProcesses = processes.map(function(pro) {
        pro['monit'] = createEmptyMonitStats();
        return pro;
      });
      return cb(null, emptyProcesses);
    }

    const processesWithStats = applyMonitoringStats(processes, statistics);
    cb(null, processesWithStats);
  };
}

/**
 * Backs up the current dump file
 * @throws {Error} Logs errors but doesn't throw
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
 * Writes process list to dump file with error recovery
 * @param {Array} processList - List of processes to dump
 */
function writeDumpFile(processList) {
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
      } catch (unlinkErr) {
        // Ignore unlink errors
      }
      console.error(e.stack || e);
    }
  }
}

/**
 * Recursively saves processes to dump file
 * @param {Array} apps - Applications to save
 * @param {Array} processList - Accumulator for process list
 * @param {Function} finalize - Finalization callback
 */
function saveProcessRecursive(apps, processList, finalize) {
  if (!apps[0]) {
    return finalize(null);
  }

  delete apps[0].pm2_env.instances;
  delete apps[0].pm2_env.pm_id;

  if (!apps[0].pm2_env.pmx_module) {
    processList.push(apps[0].pm2_env);
  }

  apps.shift();
  return saveProcessRecursive(apps, processList, finalize);
}

/**
 * Validates process exists in clusters database
 * @param {number} id - Process ID
 * @param {Function} cb - Callback function
 * @returns {boolean} True if validation passed
 */
function validateProcessExists(id, cb) {
  if (!(id in God.clusters_db)) {
    cb(God.logAndGenerateError(id + ' id unknown'), {});
    return false;
  }
  return true;
}

/**
 * Validates process and its environment exist
 * @param {number} id - Process ID
 * @param {Function} cb - Callback function
 * @returns {boolean} True if validation passed
 */
function validateProcessAndEnv(id, cb) {
  if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env) {
    cb(God.logAndGenerateError('Error when getting proc || proc.pm2_env'), {});
    return false;
  }
  return true;
}

/**
 * Checks if process is already in a terminal state
 * @param {Object} proc - Process object
 * @returns {boolean} True if process is in terminal state
 */
function isProcessInTerminalState(proc) {
  return proc.pm2_env.status === cst.ONLINE_STATUS ||
         proc.pm2_env.status === cst.LAUNCHING_STATUS;
}

/**
 * Cleans up process metadata after stop
 * @param {Object} proc - Process object
 */
function cleanupProcessMetadata(proc) {
  try {
    if (proc.pm2_env.pm_id.toString().indexOf('_old_') !== 0) {
      fs.unlinkSync(proc.pm2_env.pm_pid_path);
    }
  } catch (e) {
    // Ignore cleanup errors
  }

  if (proc.pm2_env.axm_actions) {
    proc.pm2_env.axm_actions = [];
  }
  if (proc.pm2_env.axm_monitor) {
    proc.pm2_env.axm_monitor = {};
  }
}

/**
 * Handles process stop completion
 * @param {Object} proc - Process object
 * @param {number} id - Process ID
 * @param {Function} cb - Callback function
 * @param {Error} err - Error from kill operation
 */
function handleStopCompletion(proc, id, cb, err) {
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

  cleanupProcessMetadata(proc);
  proc.process.pid = 0;
  return cb(null, God.getFormatedProcess(id));
}

/**
 * Checks if process can be stopped
 * @param {Object} proc - Process object
 * @returns {boolean} True if process can be stopped
 */
function canStopProcess(proc) {
  return proc.process && proc.process.pid;
}

/**
 * Extracts environment from restart options
 * @param {Object} opts - Restart options
 * @returns {Object} Environment variables
 */
function extractRestartEnv(opts) {
  return opts.env || {};
}

/**
 * Checks if process is in a restartable state
 * @param {Object} proc - Process object
 * @returns {boolean} True if process can be restarted
 */
function isProcessRestartable(proc) {
  return proc.pm2_env.status === cst.ONLINE_STATUS ||
         proc.pm2_env.status === cst.LAUNCHING_STATUS;
}

/**
 * Finds environment for watch operations
 * @param {string} method - Method name
 * @param {*} value - Value (id or name)
 * @returns {Object|null} Process environment or null
 */
function findWatchEnv(method, value) {
  let env = null;

  if (method.indexOf('ProcessId') !== -1) {
    env = God.clusters_db[value];
  } else if (method.indexOf('ProcessName') !== -1) {
    const foundProcs = God.findByName(value);
    if (foundProcs && foundProcs.length > 0) {
      env = God.clusters_db[foundProcs[0].pm2_env.pm_id];
    }
  }

  return env;
}

/**
 * Finds environment for watch toggle operations
 * @param {string} method - Method name
 * @param {*} value - Value (id or name)
 * @returns {Object|null} Process environment or null
 */
function findToggleWatchEnv(method, value) {
  let env = null;

  if (method === 'restartProcessId') {
    env = God.clusters_db[value.id];
  } else if (method === 'restartProcessName') {
    const foundProcs = God.findByName(value);
    if (foundProcs && foundProcs.length > 0) {
      env = God.clusters_db[foundProcs[0].pm2_env.pm_id];
    }
  }

  return env;
}

/**
 * Validates stdin packet
 * @param {Object} packet - Packet to validate
 * @returns {boolean} True if packet is valid
 */
function isValidStdinPacket(packet) {
  return typeof(packet.pm_id) !== 'undefined' && packet.line;
}

/**
 * Validates data packet
 * @param {Object} packet - Packet to validate
 * @returns {boolean} True if packet is valid
 */
function isValidDataPacket(packet) {
  return typeof(packet.id) !== 'undefined' &&
         typeof(packet.data) !== 'undefined' &&
         packet.topic;
}

/**
 * Checks if action exists in process
 * @param {Object} proc - Process object
 * @param {string} actionName - Action name to find
 * @returns {boolean} True if action exists
 */
function actionExists(proc, actionName) {
  return proc.pm2_env.axm_actions.some(function(action) {
    return action.action_name === actionName;
  });
}

/**
 * Resets action output buffer
 * @param {Object} proc - Process object
 * @param {string} actionName - Action name
 */
function resetActionOutput(proc, actionName) {
  proc.pm2_env.axm_actions.forEach(function(action) {
    if (action.action_name === actionName) {
      action.output = [];
    }
  });
}

/**
 * Checks if process name matches criteria
 * @param {Object} procEnv - Process environment
 * @param {string} name - Name to match
 * @returns {boolean} True if name matches
 */
function processNameMatches(procEnv, name) {
  return p.basename(procEnv.pm_exec_path) === name ||
         procEnv.name === name ||
         procEnv.namespace === name ||
         name === 'all';
}

/**
 * Checks if process is online or launching
 * @param {Object} procEnv - Process environment
 * @returns {boolean} True if process is online or launching
 */
function isProcessOnline(procEnv) {
  return procEnv.status === cst.ONLINE_STATUS ||
         procEnv.status === cst.LAUNCHING_STATUS;
}

/**
 * Recursively sends message to processes by name
 * @param {Array} arr - Array of process IDs
 * @param {Object} cmd - Command object
 * @param {number} sent - Count of messages sent
 * @param {Function} cb - Callback function
 */
function sendMessageByNameRecursive(arr, cmd, sent, cb) {
  if (arr[0] == null || !arr) {
    return cb(null, {
      process_count: sent,
      success: true
    });
  }

  const id = arr[0];

  if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env) {
    arr.shift();
    return sendMessageByNameRecursive(arr, cmd, sent, cb);
  }

  const procEnv = God.clusters_db[id].pm2_env;
  const isActionAvailable = procEnv.axm_actions.find(function(action) {
    return action.action_name === cmd.msg;
  }) !== undefined;

  if (isActionAvailable === false) {
    arr.shift();
    return sendMessageByNameRecursive(arr, cmd, sent, cb);
  }

  if (processNameMatches(procEnv, cmd.name) && isProcessOnline(procEnv)) {
    let actionExists = false;
    procEnv.axm_actions.forEach(function(action) {
      if (action.action_name === cmd.msg) {
        actionExists = true;
      }
    });

    if (actionExists === false || procEnv.axm_actions.length === 0) {
      arr.shift();
      return sendMessageByNameRecursive(arr, cmd, sent, cb);
    }

    if (cmd.opts == null) {
      God.clusters_db[id].send(cmd.msg);
    } else {
      God.clusters_db[id].send(cmd);
    }

    sent++;
    arr.shift();
    return sendMessageBy