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
 * Export ActionMethods bound to God instance
 * @param {Object} God
 */
module.exports = function (God) {
  /**
   * Retrieve monitor data for all processes
   * @param {Object} env
   * @param {Function} cb
   */
  God.getMonitorData = function getMonitorData(env, cb) {
    const processes = God.getFormatedProcesses();
    const pids = processes.filter(filterBadProcess).map(pro => getProcessId(pro));

    if (pids.length === 0) {
      return cb(null, processes.map(pro => ({ ...pro, monit: { memory: 0, cpu: 0 } })));
    }

    pidusage(pids, (err, statistics) => {
      if (err || !statistics) {
        console.error('Error fetching pid usage', err || 'Statistics undefined');
        return cb(null, emptyMonitProcesses(processes));
      }
      const updated = processes.map(pro => enrichProcessWithStats(pro, statistics));
      return cb(null, updated);
    });
  };

  /**
   * Create a list of processes with empty monitor data
   * @param {Array} processes
   * @returns {Array}
   */
  function emptyMonitProcesses(processes) {
    return processes.map(pro => ({ ...pro, monit: { memory: 0, cpu: 0 } }));
  }

  /**
   * Enrich a single process with statistics from pidusage
   * @param {Object} pro
   * @param {Object} statistics
   * @returns {Object}
   */
  function enrichProcessWithStats(pro, statistics) {
    if (!filterBadProcess(pro)) {
      return { ...pro, monit: { memory: 0, cpu: 0 } };
    }
    const pid = getProcessId(pro);
    const stat = statistics[pid];
    if (!stat) {
      return { ...pro, monit: { memory: 0, cpu: 0 } };
    }
    return {
      ...pro,
      monit: {
        memory: stat.memory,
        cpu: Math.round(stat.cpu * 10) / 10,
      },
    };
  }

  /**
   * Dump the current process list to disk
   * @param {Function} cb
   */
  God.dumpProcessList = function dumpProcessList(cb) {
    const processList = [];
    const apps = Utility.clone(God.getFormatedProcesses());
    const that = this;

    if (!apps[0]) {
      debug('[PM2] Did not override dump file because list of processes is empty');
      return cb(null, { success: true, process_list: processList });
    }

    const finalize = err => {
      if (processList.length === 0) {
        if (!fs.existsSync(cst.DUMP_FILE_PATH) && typeof that.clearDump === 'function') {
          that.clearDump(() => {});
        }
        return cb(null, { success: true, process_list: processList });
      }

      backupDumpFile();
      writeDumpFile(processList, cb);
    };

    const backupDumpFile = () => {
      try {
        if (fs.existsSync(cst.DUMP_FILE_PATH)) {
          fs.writeFileSync(cst.DUMP_BACKUP_FILE_PATH, fs.readFileSync(cst.DUMP_FILE_PATH));
        }
      } catch (e) {
        console.error(e.stack || e);
      }
    };

    const writeDumpFile = (list, callback) => {
      try {
        fs.writeFileSync(cst.DUMP_FILE_PATH, JSON.stringify(list));
        callback(null, { success: true, process_list: list });
      } catch (e) {
        console.error(e.stack || e);
        attemptRestoreBackup(callback);
      }
    };

    const attemptRestoreBackup = callback => {
      try {
        if (fs.existsSync(cst.DUMP_BACKUP_FILE_PATH)) {
          fs.writeFileSync(cst.DUMP_FILE_PATH, fs.readFileSync(cst.DUMP_BACKUP_FILE_PATH));
          callback(null, { success: true, process_list: processList });
        }
      } catch (e) {
        fs.unlinkSync(cst.DUMP_FILE_PATH);
        console.error(e.stack || e);
        callback(null, { success: true, process_list: processList });
      }
    };

    const processApps = appsArray => {
      if (!appsArray[0]) return finalize(null);
      const app = appsArray.shift();
      delete app.pm2_env.instances;
      delete app.pm2_env.pm_id;
      if (!app.pm2_env.pmx_module) processList.push(app.pm2_env);
      processApps(appsArray);
    };

    processApps(apps);
  };

  /**
   * Simple ping method
   */
  God.ping = function ping(env, cb) {
    return cb(null, { msg: 'pong' });
  };

  /**
   * Mark PM2 as being killed
   */
  God.notifyKillPM2 = function notifyKillPM2() {
    God.pm2_being_killed = true;
  };

  /**
   * Duplicate a process by ID
   */
  God.duplicateProcessId = function duplicateProcessId(id, cb) {
    if (!(id in God.clusters_db)) return cb(God.logAndGenerateError(id + ' id unknown'), {});
    const original = God.clusters_db[id];
    if (!original || !original.pm2_env) return cb(God.logAndGenerateError('Error when getting proc || proc.pm2_env'), {});

    const proc = Utility.clone(original.pm2_env);
    delete proc.created_at;
    delete proc.pm_id;
    delete proc.unique_id;
    proc.unique_id = Utility.generateUUID();

    God.injectVariables(proc, () => {
      God.executeApp(Utility.clone(proc), (err, clu) => {
        if (err) return cb(err);
        God.notify('start', clu, true);
        return cb(null, Utility.clone(clu));
      });
    });
  };

  /**
   * Start a stopped process by ID
   */
  God.startProcessId = function startProcessId(id, cb) {
    if (!(id in God.clusters_db)) return cb(God.logAndGenerateError(id + ' id unknown'), {});
    const proc = God.clusters_db[id];
    if (proc.pm2_env.status === cst.ONLINE_STATUS) return cb(God.logAndGenerateError('process already online'), {});
    if (proc.pm2_env.status === cst.LAUNCHING_STATUS) return cb(God.logAndGenerateError('process already started'), {});
    if (proc.process && proc.process.pid) return cb(God.logAndGenerateError('Process with pid ' + proc.process.pid + ' already exists'), {});

    God.executeApp(proc.pm2_env, (err, newProc) => cb(err, Utility.clone(newProc)));
  };

  /**
   * Stop a process by ID and set its status to stopped
   */
  God.stopProcessId = function stopProcessId(id, cb) {
    if (typeof id === 'object' && 'id' in id) id = id.id;
    if (!(id in God.clusters_db)) return cb(God.logAndGenerateError(id + ' : id unknown'), {});

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

    God.killProcess(proc.process.pid, proc.pm2_env, err => {
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
        } catch (_) {}
      }

      proc.pm2_env.axm_actions = [];
      proc.pm2_env.axm_monitor = {};
      proc.process.pid = 0;
      return cb(null, God.getFormatedProcess(id));
    });
  };

  /**
   * Reset meta information for a process
   */
  God.resetMetaProcessId = function resetMetaProcessId(id, cb) {
    if (!(id in God.clusters_db)) return cb(God.logAndGenerateError(id + ' id unknown'), {});
    const env = God.clusters_db[id].pm2_env;
    if (!env) return cb(God.logAndGenerateError('Error when getting proc || proc.pm2_env'), {});

    env.created_at = Utility.getDate();
    env.unstable_restarts = 0;
    env.restart_time = 0;
    return cb(null, God.getFormatedProcesses());
  };

  /**
   * Delete a process by ID
   */
  God.deleteProcessId = function deleteProcessId(id, cb) {
    God.deleteCron(id);
    God.stopProcessId(id, (err, proc) => {
      if (err) return cb(God.logAndGenerateError(err), {});
      delete God.clusters_db[id];
      if (Object.keys(God.clusters_db).length === 0) God.next_id = 0;
      return cb(null, proc);
    });
  };

  /**
   * Restart a process by ID with optional env overrides
   */
  God.restartProcessId = function restartProcessId(opts, cb) {
    const { id, env = {} } = opts;
    if (typeof id === 'undefined') return cb(God.logAndGenerateError('opts.id not passed to restartProcessId', opts));
    if (!(id in God.clusters_db)) return cb(God.logAndGenerateError('God db process id unknown'), {});

    const proc = God.clusters_db[id];
    God.resetState(proc.pm2_env);
    God.deleteCron(id);
    Utility.extend(proc.pm2_env.env, env);
    Utility.extendExtraConfig(proc, opts);

    if (God.pm2_being_killed) {
      return cb(God.logAndGenerateError('[RestartProcessId] PM2 is being killed, stopping restart procedure...'));
    }

    const shouldStop = [cst.ONLINE_STATUS, cst.LAUNCHING_STATUS].includes(proc.pm2_env.status);
    if (shouldStop) {
      return God.stopProcessId(id, err => {
        if (God.pm2_being_killed) return cb(God.logAndGenerateError('[RestartProcessId] PM2 is being killed, stopping restart procedure...'));
        proc.pm2_env.restart_time += 1;
        return God.startProcessId(id, cb);
      });
    }

    debug('[restart] process not online, starting it');
    return God.startProcessId(id, cb);
  };

  /**
   * Restart all processes matching a name
   */
  God.restartProcessName = function restartProcessName(name, cb) {
    const processes = God.findByName(name);
    if (!processes || processes.length === 0) return cb(God.logAndGenerateError('Unknown process'), {});

    eachLimit(processes, cst.CONCURRENT_ACTIONS, (proc, next) => {
      if (God.pm2_being_killed) return next('[Watch] PM2 is being killed, stopping restart procedure...');
      if (proc.pm2_env.status === cst.ONLINE_STATUS) {
        return God.restartProcessId({ id: proc.pm2_env.pm_id }, next);
      }
      if (![cst.STOPPING_STATUS, cst.LAUNCHING_STATUS].includes(proc.pm2_env.status)) {
        return God.startProcessId(proc.pm2_env.pm_id, next);
      }
      return next(util.format('[Watch] Process name %s is being stopped so I won\'t restart it', name));
    }, err => {
      if (err) return cb(God.logAndGenerateError(err));
      return cb(null, God.getFormatedProcesses());
    });
  };

  /**
   * Send a system signal to a process by ID
   */
  God.sendSignalToProcessId = function sendSignalToProcessId(opts, cb) {
    const { process_id: id, signal } = opts;
    if (!(id in God.clusters_db)) return cb(God.logAndGenerateError(id + ' id unknown'), {});
    try {
      process.kill(God.clusters_db[id].process.pid, signal);
    } catch (e) {
      return cb(God.logAndGenerateError('Error when sending signal (signal unknown)'), {});
    }
    return cb(null, God.getFormatedProcesses());
  };

  /**
   * Send a system signal to all processes matching a name
   */
  God.sendSignalToProcessName = function sendSignalToProcessName(opts, cb) {
    const processes = God.findByName(opts.process_name);
    const { signal } = opts;
    if (!processes || processes.length === 0) return cb(God.logAndGenerateError('Unknown process name'), {});

    eachLimit(processes, cst.CONCURRENT_ACTIONS, (proc, next) => {
      if ([cst.ONLINE_STATUS, cst.LAUNCHING_STATUS].includes(proc.pm2_env.status)) {
        try {
          process.kill(proc.process.pid, signal);
        } catch (e) {
          return next(e);
        }
      }
      return setTimeout(next, 200);
    }, err => {
      if (err) return cb(God.logAndGenerateError(err), {});
      return cb(null, God.getFormatedProcesses());
    });
  };

  /**
   * Stop watching daemon for given method/value
   */
  God.stopWatch = function stopWatch(method, value, fn) {
    if (method === 'stopAll' || method === 'deleteAll') {
      const processes = God.getFormatedProcesses();
      processes.forEach(proc => {
        God.clusters_db[proc.pm_id].pm2_env.watch = false;
        God.watch.disable(proc.pm2_env);
      });
    } else {
      let env = null;
      if (method.includes('ProcessId')) {
        env = God.clusters_db[value];
      } else if (method.includes('ProcessName')) {
        const found = God.findByName(value);
        env = God.clusters_db[found];
      }
      if (env) {
        God.watch.disable(env.pm2_env);
        env.pm2_env.watch = false;
      }
    }
    return fn(null, { success: true });
  };

  /**
   * Toggle watch status for a process
   */
  God.toggleWatch = function toggleWatch(method, value, fn) {
    let env = null;
    if (method === 'restartProcessId') {
      env = God.clusters_db[value.id];
    } else if (method === 'restartProcessName') {
      const found = God.findByName(value);
      env = God.clusters_db[found];
    }
    if (env) {
      env.pm2_env.watch = !env.pm2_env.watch;
      if (env.pm2_env.watch) God.watch.enable(env.pm2_env);
      else God.watch.disable(env.pm2_env);
    }
    return fn(null, { success: true });
  };

  /**
   * Start watch for a process
   */
  God.startWatch = function startWatch(method, value, fn) {
    let env = null;
    if (method === 'restartProcessId') {
      env = God.clusters_db[value.id];
    } else if (method === 'restartProcessName') {
      const found = God.findByName(value);
      env = God.clusters_db[found];
    }
    if (env) {
      if (env.pm2_env.watch) return fn(null, { success: true, notrestarted: true });
      God.watch.enable(env.pm2_env);
      env.pm2_env.watch = true;
    }
    return fn(null, { success: true });
  };

  /**
   * Reload logs for all processes
   */
  God.reloadLogs = function reloadLogs(opts, cb) {
    console.log('Reloading logs...');
    const ids = Object.keys(God.clusters_db);
    ids.forEach(id => {
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
        cluster._reloadLogs(err => {
          if (err) God.logAndGenerateError(err);
        });
      }
    });
    return cb(null, {});
  };

  /**
   * Send a line to a process stdin
   */
  God.sendLineToStdin = function sendLineToStdin(packet, cb) {
    if (typeof packet.pm_id === 'undefined' || !packet.line) {
      return cb(God.logAndGenerateError('pm_id or line field missing'), {});
    }
    const { pm_id, line } = packet;
    const proc = God.clusters_db[pm_id];
    if (!proc) return cb(God.logAndGenerateError(`Process with ID <${pm_id}> unknown.`), {});
    if (proc.pm2_env.exec_mode === 'cluster_mode') return cb(God.logAndGenerateError('Cannot send line to processes in cluster mode'), {});
    if (![cst.ONLINE_STATUS, cst.LAUNCHING_STATUS].includes(proc.pm2_env.status)) {
      return cb(God.logAndGenerateError(`Process with ID <${pm_id}> offline.`), {});
    }
    try {
      proc.stdin.write(line, () => cb(null, { pm_id, line }));
    } catch (e) {
      return cb(God.logAndGenerateError(e), {});
    }
  };

  /**
   * Send arbitrary data to a process by ID
   */
  God.sendDataToProcessId = function sendDataToProcessId(packet, cb) {
    if (typeof packet.id === 'undefined' || typeof packet.data === 'undefined' || !packet.topic) {
      return cb(God.logAndGenerateError('ID, DATA or TOPIC field is missing'), {});
    }
    const { id: pm_id, data } = packet;
    const proc = God.clusters_db[pm_id];
    if (!proc) return cb(God.logAndGenerateError(`Process with ID <${pm_id}> unknown.`), {});
    if (![cst.ONLINE_STATUS, cst.LAUNCHING_STATUS].includes(proc.pm2_env.status)) {
      return cb(God.logAndGenerateError(`Process with ID <${pm_id}> offline.`), {});
    }
    try {
      proc.send(packet);
    } catch (e) {
      return cb(God.logAndGenerateError(e), {});
    }
    return cb(null, { success: true, data: packet });
  };

  /**
   * Send a message to a process by ID or name
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
   * Handle msgProcess when an ID is provided
   */
  function handleMsgById(cmd, cb) {
    const { id } = cmd;
    if (!(id in God.clusters_db)) return cb(God.logAndGenerateError(id + ' id unknown'), {});
    const proc = God.clusters_db[id];
    const actionExists = proc.pm2_env.axm_actions.some(a => a.action_name === cmd.msg);
    if (!actionExists) return cb(God.logAndGenerateError(`Action doesn't exist ${cmd.msg} for ${proc.pm2_env.name}`), {});
    if (![cst.ONLINE_STATUS, cst.LAUNCHING_STATUS].includes(proc.pm2_env.status)) {
      return cb(God.logAndGenerateError(id + ' : id offline'), {});
    }
    if (cmd.opts == null && !cmd.uuid) proc.send(cmd.msg);
    else proc.send(cmd);
    return cb(null, { process_count: 1, success: true });
  }

  /**
   * Handle msgProcess when a name is provided
   */
  function handleMsgByName(cmd, cb) {
    const name = cmd.name;
    const ids = Object.keys(God.clusters_db);
    let sent = 0;

    const processNext = () => {
      if (ids.length === 0) {
        return cb(null, { process_count: sent, success: true });
      }
      const id = ids.shift();
      const entry = God.clusters_db[id];
      if (!entry || !entry.pm2_env) return processNext();

      const env = entry.pm2_env;
      const actionAvailable = env.axm_actions.some(a => a.action_name === cmd.msg);
      if (!actionAvailable) return processNext();

      const nameMatches = [p.basename(env.pm_exec_path), env.name, env.namespace, 'all'].includes(name);
      const statusOk = [cst.ONLINE_STATUS, cst.LAUNCHING_STATUS].includes(env.status);
      if (!nameMatches || !statusOk) return processNext();

      if (!env.axm_actions.length) return processNext();

      if (cmd.opts == null) entry.send(cmd.msg);
      else entry.send(cmd);
      sent++;
      return processNext();
    };

    processNext();
  }

  /**
   * Return PM2 version
   */
  God.getVersion = function getVersion(env, cb) {
    process.nextTick(() => cb(null, pkg.version));
  };

  /**
   * Enable monitoring for a process
   */
  God.monitor = function monitor(pm_id, cb) {
    if (!God.clusters_db[pm_id] || !God.clusters_db[pm_id].pm2_env) return cb(new Error('Unknown pm_id'));
    God.clusters_db[pm_id].pm2_env._km_monitored = true;
    return cb(null, { success: true, pm_id });
  };

  /**
   * Disable monitoring for a process
   */
  God.unmonitor = function unmonitor(pm_id, cb) {
    if (!God.clusters_db[pm_id] || !God.clusters_db[pm_id].pm2_env) return cb(new Error('Unknown pm_id'));
    God.clusters_db[pm_id].pm2_env._km_monitored = false;
    return cb(null, { success: true, pm_id });
  };

  /**
   * Generate a detailed report about the PM2 environment
   */
  God.getReport = function getReport(arg, cb) {
    const report = {
      pm2_version: pkg.version,
      node_version: 'N/A',
      node_path: process.env['_'] || 'not found',
      argv0: process.argv0,
      argv: process.argv,
      user: process.env.USER,
      uid: cst.IS_WINDOWS === false && process.geteuid ? process.geteuid() : 'N/A',
      gid: cst.IS_WINDOWS === false && process.getegid ? process.getegid() : 'N/A',
      env: process.env,
      managed_apps: Object.keys(God.clusters_db).length,
      started_at: God.started_at,
    };
    if (process.versions && process.versions.node) report.node_version = process.versions.node;
    process.nextTick(() => cb(null, report));
  };
};

/**
 * Filter out processes that should not be monitored
 */
function filterBadProcess(pro) {
  if (pro.pm2_env.status !== cst.ONLINE_STATUS) return false;
  if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid && isNaN(pro.pm2_env.axm_options.pid)) return false;
  return true;
}

/**
 * Retrieve the PID for a process, considering axm_options override
 */
function getProcessId(pro) {
  let pid = pro.pid;
  if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
    pid = pro.pm2_env.axm_options.pid;
  }
  return pid;
}