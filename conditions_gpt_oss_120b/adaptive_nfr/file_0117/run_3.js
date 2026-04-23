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

const fs = require('fs');
const path = require('path');
const eachLimit = require('async/eachLimit');
const os = require('os');
const p = path;
const cst = require('../../constants.js');
const pkg = require('../../package.json');
const pidusage = require('pidusage');
const util = require('util');
const debug = require('debug')('pm2:ActionMethod');
const Utility = require('../Utility');

/**
 * @param {object} God
 */
module.exports = function (God) {
  /**
   * Get monitor data for all processes.
   * @param {object} env
   * @param {function} cb
   */
  God.getMonitorData = function getMonitorData(env, cb) {
    const processes = God.getFormatedProcesses();
    const pids = processes.filter(isOnlineProcess).map(getProcessId);

    if (pids.length === 0) {
      return cb(null, processes.map(setEmptyMonit));
    }

    pidusage(pids, function retPidUsage(err, statistics) {
      if (err) {
        console.error('Error caught while calling pidusage');
        console.error(err);
        return cb(null, processes.map(setEmptyMonit));
      }

      if (!statistics) {
        console.error('Statistics is not defined!');
        return cb(null, processes.map(setEmptyMonit));
      }

      const updated = processes.map(function (pro) {
        if (!isOnlineProcess(pro)) {
          return setEmptyMonit(pro);
        }

        const pid = getProcessId(pro);
        const stat = statistics[pid];

        if (!stat) {
          return setEmptyMonit(pro);
        }

        pro.monit = {
          memory: stat.memory,
          cpu: Math.round(stat.cpu * 10) / 10,
        };
        return pro;
      });

      return cb(null, updated);
    });
  };

  /**
   * Dump the current process list to disk.
   * @param {function} cb
   */
  God.dumpProcessList = function dumpProcessList(cb) {
    const processList = [];
    const apps = Utility.clone(God.getFormatedProcesses());
    const that = this;

    if (!apps[0]) {
      debug('[PM2] Did not override dump file because list of processes is empty');
      return cb(null, { success: true, process_list: processList });
    }

    function finalize(err) {
      if (processList.length === 0) {
        if (!fs.existsSync(cst.DUMP_FILE_PATH) && typeof that.clearDump === 'function') {
          that.clearDump(() => {});
        }
        return cb(null, { success: true, process_list: processList });
      }

      try {
        if (fs.existsSync(cst.DUMP_FILE_PATH)) {
          fs.writeFileSync(cst.DUMP_BACKUP_FILE_PATH, fs.readFileSync(cst.DUMP_FILE_PATH));
        }
      } catch (e) {
        console.error(e.stack || e);
      }

      try {
        fs.writeFileSync(cst.DUMP_FILE_PATH, JSON.stringify(processList));
      } catch (e) {
        console.error(e.stack || e);
        try {
          if (fs.existsSync(cst.DUMP_BACKUP_FILE_PATH)) {
            fs.writeFileSync(cst.DUMP_FILE_PATH, fs.readFileSync(cst.DUMP_BACKUP_FILE_PATH));
          }
        } catch (e2) {
          fs.unlinkSync(cst.DUMP_FILE_PATH);
          console.error(e2.stack || e2);
        }
      }

      return cb(null, { success: true, process_list: processList });
    }

    function saveProc(appsArray) {
      if (!appsArray[0]) {
        return finalize(null);
      }
      delete appsArray[0].pm2_env.instances;
      delete appsArray[0].pm2_env.pm_id;
      if (!appsArray[0].pm2_env.pmx_module) {
        processList.push(appsArray[0].pm2_env);
      }
      appsArray.shift();
      return saveProc(appsArray);
    }

    saveProc(apps);
  };

  /**
   * Ping method.
   * @param {object} env
   * @param {function} cb
   */
  God.ping = function ping(env, cb) {
    return cb(null, { msg: 'pong' });
  };

  /**
   * Notify that PM2 is being killed.
   */
  God.notifyKillPM2 = function notifyKillPM2() {
    God.pm2_being_killed = true;
  };

  /**
   * Duplicate a process.
   * @param {string|number} id
   * @param {function} cb
   */
  God.duplicateProcessId = function duplicateProcessId(id, cb) {
    if (!(id in God.clusters_db)) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    const cluster = God.clusters_db[id];
    if (!cluster || !cluster.pm2_env) {
      return cb(God.logAndGenerateError('Error when getting proc || proc.pm2_env'), {});
    }

    const proc = Utility.clone(cluster.pm2_env);
    delete proc.created_at;
    delete proc.pm_id;
    delete proc.unique_id;
    proc.unique_id = Utility.generateUUID();

    God.injectVariables(proc, function inject(_err, injectedProc) {
      God.executeApp(Utility.clone(injectedProc), function (err, clu) {
        if (err) return cb(err);
        God.notify('start', clu, true);
        return cb(err, Utility.clone(clu));
      });
    });
  };

  /**
   * Start a stopped process by ID.
   * @param {string|number} id
   * @param {function} cb
   */
  God.startProcessId = function startProcessId(id, cb) {
    if (!(id in God.clusters_db)) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    const proc = God.clusters_db[id];
    if (proc.pm2_env.status === cst.ONLINE_STATUS) {
      return cb(God.logAndGenerateError('process already online'), {});
    }
    if (proc.pm2_env.status === cst.LAUNCHING_STATUS) {
      return cb(God.logAndGenerateError('process already started'), {});
    }
    if (proc.process && proc.process.pid) {
      return cb(God.logAndGenerateError('Process with pid ' + proc.process.pid + ' already exists'), {});
    }

    God.executeApp(proc.pm2_env, function (err, newProc) {
      return cb(err, Utility.clone(newProc));
    });
  };

  /**
   * Stop a process and set it on state 'stopped'.
   * @param {string|number|object} id
   * @param {function} cb
   */
  God.stopProcessId = function stopProcessId(id, cb) {
    if (typeof id === 'object' && 'id' in id) {
      id = id.id;
    }

    if (!(id in God.clusters_db)) {
      return cb(God.logAndGenerateError(id + ' : id unknown'), {});
    }

    const proc = God.clusters_db[id];
    clearTimeout(proc.pm2_env.restart_task);

    if (proc.pm2_env.status === cst.STOPPED_STATUS) {
      proc.process.pid = 0;
      return cb(null, God.getFormatedProcess(id));
    }

    if (proc.state && proc.state === 'none') {
      return setTimeout(() => God.stopProcessId(id, cb), 250);
    }

    console.log('Stopping app:%s id:%s', proc.pm2_env.name, proc.pm2_env.pm_id);
    proc.pm2_env.status = cst.STOPPING_STATUS;

    if (!proc.process.pid) {
      console.error('app=%s id=%d does not have a pid', proc.pm2_env.name, proc.pm2_env.pm_id);
      proc.pm2_env.status = cst.STOPPED_STATUS;
      return cb(null, { error: true, message: 'could not kill process w/o pid' });
    }

    God.killProcess(proc.process.pid, proc.pm2_env, function (err) {
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

      if (!proc.pm2_env.pm_id.toString().startsWith('_old_')) {
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

  /**
   * Reset meta information for a process.
   * @param {string|number} id
   * @param {function} cb
   */
  God.resetMetaProcessId = function resetMetaProcessId(id, cb) {
    if (!(id in God.clusters_db)) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    const cluster = God.clusters_db[id];
    if (!cluster || !cluster.pm2_env) {
      return cb(God.logAndGenerateError('Error when getting proc || proc.pm2_env'), {});
    }

    cluster.pm2_env.created_at = Utility.getDate();
    cluster.pm2_env.unstable_restarts = 0;
    cluster.pm2_env.restart_time = 0;

    return cb(null, God.getFormatedProcesses());
  };

  /**
   * Delete a process by id.
   * @param {string|number} id
   * @param {function} cb
   */
  God.deleteProcessId = function deleteProcessId(id, cb) {
    God.deleteCron(id);
    God.stopProcessId(id, function (err, proc) {
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
   * Restart a process ID.
   * @param {object} opts
   * @param {function} cb
   */
  God.restartProcessId = function restartProcessId(opts, cb) {
    const id = opts.id;
    const env = opts.env || {};

    if (typeof id === 'undefined') {
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

    if (God.pm2_being_killed) {
      return cb(God.logAndGenerateError('[RestartProcessId] PM2 is being killed, stopping restart procedure...'));
    }

    const isOnline = proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS;
    if (isOnline) {
      return God.stopProcessId(id, function (err) {
        if (God.pm2_being_killed) {
          return cb(God.logAndGenerateError('[RestartProcessId] PM2 is being killed, stopping restart procedure...'));
        }
        proc.pm2_env.restart_time += 1;
        return God.startProcessId(id, cb);
      });
    }

    debug('[restart] process not online, starting it');
    return God.startProcessId(id, cb);
  };

  /**
   * Restart all processes by name.
   * @param {string} name
   * @param {function} cb
   */
  God.restartProcessName = function restartProcessName(name, cb) {
    const processes = God.findByName(name);
    if (!processes || processes.length === 0) {
      return cb(God.logAndGenerateError('Unknown process'), {});
    }

    eachLimit(processes, cst.CONCURRENT_ACTIONS, function (proc, next) {
      if (God.pm2_being_killed) {
        return next('[Watch] PM2 is being killed, stopping restart procedure...');
      }
      if (proc.pm2_env.status === cst.ONLINE_STATUS) {
        return God.restartProcessId({ id: proc.pm2_env.pm_id }, next);
      }
      if (proc.pm2_env.status !== cst.STOPPING_STATUS && proc.pm2_env.status !== cst.LAUNCHING_STATUS) {
        return God.startProcessId(proc.pm2_env.pm_id, next);
      }
      return next(util.format('[Watch] Process name %s is being stopped so I won\'t restart it', name));
    }, function (err) {
      if (err) return cb(God.logAndGenerateError(err));
      return cb(null, God.getFormatedProcesses());
    });

    return false;
  };

  /**
   * Send system signal to process id.
   * @param {object} opts
   * @param {function} cb
   */
  God.sendSignalToProcessId = function sendSignalToProcessId(opts, cb) {
    const id = opts.process_id;
    const signal = opts.signal;

    if (!(id in God.clusters_db)) {
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
   * Send system signal to all processes by name.
   * @param {object} opts
   * @param {function} cb
   */
  God.sendSignalToProcessName = function sendSignalToProcessName(opts, cb) {
    const processes = God.findByName(opts.process_name);
    const signal = opts.signal;

    if (!processes || processes.length === 0) {
      return cb(God.logAndGenerateError('Unknown process name'), {});
    }

    eachLimit(processes, cst.CONCURRENT_ACTIONS, function (proc, next) {
      const isRunning = proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS;
      if (isRunning) {
        try {
          process.kill(proc.process.pid, signal);
        } catch (e) {
          return next(e);
        }
      }
      return setTimeout(next, 200);
    }, function (err) {
      if (err) return cb(God.logAndGenerateError(err), {});
      return cb(null, God.getFormatedProcesses());
    });
  };

  /**
   * Stop watching daemon.
   * @param {string} method
   * @param {*} value
   * @param {function} fn
   */
  God.stopWatch = function stopWatch(method, value, fn) {
    if (method === 'stopAll' || method === 'deleteAll') {
      const processes = God.getFormatedProcesses();
      processes.forEach(function (proc) {
        God.clusters_db[proc.pm_id].pm2_env.watch = false;
        God.watch.disable(proc.pm2_env);
      });
    } else {
      let env = null;
      if (method.includes('ProcessId')) {
        env = God.clusters_db[value];
      } else if (method.includes('ProcessName')) {
        env = God.clusters_db[God.findByName(value)];
      }
      if (env) {
        God.watch.disable(env.pm2_env);
        env.pm2_env.watch = false;
      }
    }
    return fn(null, { success: true });
  };

  /**
   * Toggle watching daemon.
   * @param {string} method
   * @param {*} value
   * @param {function} fn
   */
  God.toggleWatch = function toggleWatch(method, value, fn) {
    let env = null;
    if (method === 'restartProcessId') {
      env = God.clusters_db[value.id];
    } else if (method === 'restartProcessName') {
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

  /**
   * Start watch.
   * @param {string} method
   * @param {*} value
   * @param {function} fn
   */
  God.startWatch = function startWatch(method, value, fn) {
    let env = null;
    if (method === 'restartProcessId') {
      env = God.clusters_db[value.id];
    } else if (method === 'restartProcessName') {
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

  /**
   * Reload logs for all processes.
   * @param {object} opts
   * @param {function} cb
   */
  God.reloadLogs = function reloadLogs(opts, cb) {
    console.log('Reloading logs...');
    const processIds = Object.keys(God.clusters_db);
    processIds.forEach(function (id) {
      const cluster = God.clusters_db[id];
      console.log('Reloading logs for process id %d', id);
      if (!cluster || !cluster.pm2_env) return;
      if (cluster.send && cluster.pm2_env.exec_mode === 'cluster_mode') {
        try {
          cluster.send({ type: 'log:reload' });
        } catch (e) {
          console.error(e.message || e);
        }
      } else if (cluster._reloadLogs) {
        cluster._reloadLogs(function (err) {
          if (err) God.logAndGenerateError(err);
        });
      }
    });
    return cb(null, {});
  };

  /**
   * Send a line to a process stdin.
   * @param {object} packet
   * @param {function} cb
   */
  God.sendLineToStdin = function sendLineToStdin(packet, cb) {
    if (typeof packet.pm_id === 'undefined' || !packet.line) {
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
    if (!isOnlineStatus(proc.pm2_env.status)) {
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> offline.'), {});
    }

    try {
      proc.stdin.write(line, function () {
        return cb(null, { pm_id, line });
      });
    } catch (e) {
      return cb(God.logAndGenerateError(e), {});
    }
  };

  /**
   * Send data to a process by id.
   * @param {object} packet
   * @param {function} cb
   */
  God.sendDataToProcessId = function sendDataToProcessId(packet, cb) {
    if (typeof packet.id === 'undefined' ||
      typeof packet.data === 'undefined' ||
      !packet.topic) {
      return cb(God.logAndGenerateError('ID, DATA or TOPIC field is missing'), {});
    }

    const pm_id = packet.id;
    const proc = God.clusters_db[pm_id];

    if (!proc) {
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> unknown.'), {});
    }
    if (!isOnlineStatus(proc.pm2_env.status)) {
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> offline.'), {});
    }

    try {
      proc.send(packet);
    } catch (e) {
      return cb(God.logAndGenerateError(e), {});
    }

    return cb(null, { success: true, data: packet });
  };

  /**
   * Send a message to a process by id or name.
   * @param {object} cmd
   * @param {function} cb
   */
  God.msgProcess = function msgProcess(cmd, cb) {
    if ('id' in cmd) {
      return handleMsgById(cmd, cb);
    }
    if ('name' in cmd) {
      return handleMsgByName(cmd, cb);
    }
    return cb(God.logAndGenerateError('method requires name or id field'), {});
  };

  /**
   * Get PM2 version.
   * @param {object} env
   * @param {function} cb
   */
  God.getVersion = function getVersion(env, cb) {
    process.nextTick(() => cb(null, pkg.version));
  };

  /**
   * Enable monitoring for a process.
   * @param {string|number} pm_id
   * @param {function} cb
   */
  God.monitor = function monitor(pm_id, cb) {
    if (!God.clusters_db[pm_id] || !God.clusters_db[pm_id].pm2_env) {
      return cb(new Error('Unknown pm_id'));
    }
    God.clusters_db[pm_id].pm2_env._km_monitored = true;
    return cb(null, { success: true, pm_id });
  };

  /**
   * Disable monitoring for a process.
   * @param {string|number} pm_id
   * @param {function} cb
   */
  God.unmonitor = function unmonitor(pm_id, cb) {
    if (!God.clusters_db[pm_id] || !God.clusters_db[pm_id].pm2_env) {
      return cb(new Error('Unknown pm_id'));
    }
    God.clusters_db[pm_id].pm2_env._km_monitored = false;
    return cb(null, { success: true, pm_id });
  };

  /**
   * Get a detailed report.
   * @param {any} arg
   * @param {function} cb
   */
  God.getReport = function getReport(arg, cb) {
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
      started_at: God.started_at,
    };

    if (process.versions && process.versions.node) {
      report.node_version = process.versions.node;
    }

    process.nextTick(() => cb(null, report));
  };
};

/**
 * Determine if a process is online and valid for monitoring.
 * @param {object} pro
 * @returns {boolean}
 */
function isOnlineProcess(pro) {
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
 * Extract the PID from a process object.
 * @param {object} pro
 * @returns {number|string}
 */
function getProcessId(pro) {
  let pid = pro.pid;
  if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
    pid = pro.pm2_env.axm_options.pid;
  }
  return pid;
}

/**
 * Set empty monitoring data on a process.
 * @param {object} pro
 * @returns {object}
 */
function setEmptyMonit(pro) {
  pro.monit = { memory: 0, cpu: 0 };
  return pro;
}

/**
 * Check if a status indicates the process is online or launching.
 * @param {string} status
 * @returns {boolean}
 */
function isOnlineStatus(status) {
  return status === cst.ONLINE_STATUS || status === cst.LAUNCHING_STATUS;
}

/**
 * Handle message sending when an ID is provided.
 * @param {object} cmd
 * @param {function} cb
 */
function handleMsgById(cmd, cb) {
  const id = cmd.id;
  if (!(id in God.clusters_db)) {
    return cb(God.logAndGenerateError(id + ' id unknown'), {});
  }
  const proc = God.clusters_db[id];
  const actionExists = proc.pm2_env.axm_actions.some(action => action.action_name === cmd.msg);
  if (!actionExists) {
    return cb(God.logAndGenerateError('Action doesn\'t exist ' + cmd.msg + ' for ' + proc.pm2_env.name), {});
  }
  if (isOnlineStatus(proc.pm2_env.status)) {
    if (!cmd.opts && !cmd.uuid) {
      proc.send(cmd.msg);
    } else {
      proc.send(cmd);
    }
    return cb(null, { process_count: 1, success: true });
  }
  return cb(God.logAndGenerateError(id + ' : id offline'), {});
}

/**
 * Handle message sending when a name is provided.
 * @param {object} cmd
 * @param {function} cb
 */
function handleMsgByName(cmd, cb) {
  const name = cmd.name;
  const ids = Object.keys(God.clusters_db);
  let sent = 0;

  (function iterate(arr) {
    if (!arr.length) {
      return cb(null, { process_count: sent, success: true });
    }
    const id = arr.shift();
    const cluster = God.clusters_db[id];
    if (!cluster || !cluster.pm2_env) {
      return iterate(arr);
    }
    const procEnv = cluster.pm2_env;
    const actionAvailable = procEnv.axm_actions.some(action => action.action_name === cmd.msg);
    if (!actionAvailable) {
      return iterate(arr);
    }
    const nameMatches = p.basename(procEnv.pm_exec_path) === name ||
      procEnv.name === name ||
      procEnv.namespace === name ||
      name === 'all';
    if (nameMatches && isOnlineStatus(procEnv.status)) {
      const actionExists = procEnv.axm_actions.some(action => action.action_name === cmd.msg);
      if (!actionExists || procEnv.axm_actions.length === 0) {
        return iterate(arr);
      }
      if (!cmd.opts) {
        cluster.send(cmd.msg);
      } else {
        cluster.send(cmd);
      }
      sent++;
    }
    return iterate(arr);
  })(ids);
}