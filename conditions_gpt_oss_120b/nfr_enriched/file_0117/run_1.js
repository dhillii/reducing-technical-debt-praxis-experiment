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
 * Helper: filter processes that are not online or have invalid pid
 */
function filterBadProcess(pro) {
  if (pro.pm2_env.status !== cst.ONLINE_STATUS) return false;
  if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
    if (isNaN(pro.pm2_env.axm_options.pid)) return false;
  }
  return true;
}

/**
 * Helper: retrieve pid from process object
 */
function getProcessId(pro) {
  let pid = pro.pid;
  if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
    pid = pro.pm2_env.axm_options.pid;
  }
  return pid;
}

/**
 * Helper: set default monitoring data on a process
 */
function setDefaultMonit(pro) {
  pro.monit = { memory: 0, cpu: 0 };
  return pro;
}

/**
 * Helper: apply pidusage statistics to processes
 */
function applyStatistics(processes, statistics) {
  return processes.map(pro => {
    if (!filterBadProcess(pro)) return setDefaultMonit(pro);
    const pid = getProcessId(pro);
    const stat = statistics[pid];
    if (!stat) return setDefaultMonit(pro);
    pro.monit = {
      memory: stat.memory,
      cpu: Math.round(stat.cpu * 10) / 10
    };
    return pro;
  });
}

/**
 * Helper: collect pids from formatted processes
 */
function collectPids(processes) {
  return processes
    .filter(filterBadProcess)
    .map(pro => getProcessId(pro));
}

/**
 * Helper: finalize dump file write
 */
function finalizeDump(processList, that, cb) {
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

/**
 * Helper: recursively save processes for dump
 */
function saveProcessesForDump(apps, processList, done) {
  if (!apps[0]) return done();
  delete apps[0].pm2_env.instances;
  delete apps[0].pm2_env.pm_id;
  if (!apps[0].pm2_env.pmx_module) processList.push(apps[0].pm2_env);
  apps.shift();
  saveProcessesForDump(apps, processList, done);
}

/**
 * Helper: validate process existence in God.clusters_db
 */
function validateProcessId(God, id) {
  if (!(id in God.clusters_db)) {
    return God.logAndGenerateError(`${id} id unknown`);
  }
  return null;
}

/**
 * Helper: stop a process and clean up resources
 */
function stopProcess(God, proc, id, cb) {
  clearTimeout(proc.pm2_env.restart_task);
  if (proc.pm2_env.status === cst.STOPPED_STATUS) {
    proc.process.pid = 0;
    return cb(null, God.getFormatedProcess(id));
  }
  if (proc.state && proc.state === 'none') {
    return setTimeout(() => stopProcess(God, proc, id, cb), 250);
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
      try { fs.unlinkSync(proc.pm2_env.pm_pid_path); } catch (_) {}
    }

    proc.pm2_env.axm_actions = [];
    proc.pm2_env.axm_monitor = {};
    proc.process.pid = 0;
    return cb(null, God.getFormatedProcess(id));
  });
}

/**
 * Helper: restart a process by id (core logic)
 */
function coreRestartProcessId(God, id, env, cb) {
  const proc = God.clusters_db[id];
  God.resetState(proc.pm2_env);
  God.deleteCron(id);
  Utility.extend(proc.pm2_env.env, env);
  Utility.extendExtraConfig(proc, { id, env });

  if (God.pm2_being_killed) {
    return cb(God.logAndGenerateError('[RestartProcessId] PM2 is being killed, stopping restart procedure...'));
  }

  if ([cst.ONLINE_STATUS, cst.LAUNCHING_STATUS].includes(proc.pm2_env.status)) {
    return God.stopProcessId(id, err => {
      if (God.pm2_being_killed) {
        return cb(God.logAndGenerateError('[RestartProcessId] PM2 is being killed, stopping restart procedure...'));
      }
      proc.pm2_env.restart_time += 1;
      return God.startProcessId(id, cb);
    });
  }

  debug('[restart] process not online, starting it');
  return God.startProcessId(id, cb);
}

/**
 * Helper: send message to a single process by id
 */
function sendMessageToId(God, cmd, cb) {
  const id = cmd.id;
  const proc = God.clusters_db[id];
  const actionExists = proc.pm2_env.axm_actions.some(a => a.action_name === cmd.msg);
  if (!actionExists) {
    return cb(God.logAndGenerateError(`Action doesn't exist ${cmd.msg} for ${proc.pm2_env.name}`), {});
  }
  if ([cst.ONLINE_STATUS, cst.LAUNCHING_STATUS].includes(proc.pm2_env.status)) {
    if (!cmd.opts && !cmd.uuid) proc.send(cmd.msg);
    else proc.send(cmd);
    return cb(null, { process_count: 1, success: true });
  }
  return cb(God.logAndGenerateError(`${id} : id offline`), {});
}

/**
 * Helper: send message to processes by name
 */
function sendMessageToName(God, cmd, cb) {
  const name = cmd.name;
  const ids = Object.keys(God.clusters_db);
  let sent = 0;

  const processNext = () => {
    if (ids.length === 0) {
      return cb(null, { process_count: sent, success: true });
    }
    const id = ids.shift();
    const procEnv = God.clusters_db[id]?.pm2_env;
    if (!procEnv) return processNext();

    const actionAvailable = procEnv.axm_actions.some(a => a.action_name === cmd.msg);
    if (!actionAvailable) return processNext();

    const matchesName = [p.basename(procEnv.pm_exec_path), procEnv.name, procEnv.namespace].includes(name) || name === 'all';
    const isOnline = [cst.ONLINE_STATUS, cst.LAUNCHING_STATUS].includes(procEnv.status);
    if (matchesName && isOnline) {
      if (!cmd.opts) God.clusters_db[id].send(cmd.msg);
      else God.clusters_db[id].send(cmd);
      sent++;
    }
    return processNext();
  };

  processNext();
}

/**
 * Main export
 */
module.exports = function (God) {
  /**
   * Get monitoring data for all processes
   */
  God.getMonitorData = function getMonitorData(env, cb) {
    const processes = God.getFormatedProcesses();
    const pids = collectPids(processes);

    if (pids.length === 0) {
      return cb(null, processes.map(setDefaultMonit));
    }

    pidusage(pids, (err, statistics) => {
      if (err) {
        console.error('Error caught while calling pidusage', err);
        return cb(null, processes.map(setDefaultMonit));
      }
      if (!statistics) {
        console.error('Statistics is not defined!');
        return cb(null, processes.map(setDefaultMonit));
      }
      const updated = applyStatistics(processes, statistics);
      return cb(null, updated);
    });
  };

  /**
   * Dump the current process list to disk
   */
  God.dumpProcessList = function dumpProcessList(cb) {
    const processList = [];
    const apps = Utility.clone(God.getFormatedProcesses());
    const that = this;

    if (!apps[0]) {
      debug('[PM2] Did not override dump file because list of processes is empty');
      return cb(null, { success: true, process_list: processList });
    }

    saveProcessesForDump(apps, processList, () => {
      finalizeDump(processList, that, cb);
    });
  };

  /**
   * Simple ping
   */
  God.ping = function (env, cb) {
    return cb(null, { msg: 'pong' });
  };

  /**
   * Notify that PM2 is being killed
   */
  God.notifyKillPM2 = function () {
    God.pm2_being_killed = true;
  };

  /**
   * Duplicate a process by id
   */
  God.duplicateProcessId = function (id, cb) {
    const err = validateProcessId(God, id);
    if (err) return cb(err, {});

    const proc = God.clusters_db[id];
    if (!proc || !proc.pm2_env) {
      return cb(God.logAndGenerateError('Error when getting proc || proc.pm2_env'), {});
    }

    const cloned = Utility.clone(proc.pm2_env);
    delete cloned.created_at;
    delete cloned.pm_id;
    delete cloned.unique_id;
    cloned.unique_id = Utility.generateUUID();

    God.injectVariables(cloned, () => {
      God.executeApp(Utility.clone(cloned), (execErr, clu) => {
        if (execErr) return cb(execErr);
        God.notify('start', clu, true);
        return cb(null, Utility.clone(clu));
      });
    });
  };

  /**
   * Start a stopped process by ID
   */
  God.startProcessId = function (id, cb) {
    const err = validateProcessId(God, id);
    if (err) return cb(err, {});

    const proc = God.clusters_db[id];
    if (proc.pm2_env.status === cst.ONLINE_STATUS) {
      return cb(God.logAndGenerateError('process already online'), {});
    }
    if (proc.pm2_env.status === cst.LAUNCHING_STATUS) {
      return cb(God.logAndGenerateError('process already started'), {});
    }
    if (proc.process && proc.process.pid) {
      return cb(God.logAndGenerateError(`Process with pid ${proc.process.pid} already exists`), {});
    }

    God.executeApp(proc.pm2_env, (err, newProc) => {
      return cb(err, Utility.clone(newProc));
    });
  };

  /**
   * Stop a process by ID
   */
  God.stopProcessId = function (id, cb) {
    if (typeof id === 'object' && 'id' in id) id = id.id;
    const err = validateProcessId(God, id);
    if (err) return cb(err, {});

    const proc = God.clusters_db[id];
    stopProcess(God, proc, id, cb);
  };

  /**
   * Reset meta information for a process
   */
  God.resetMetaProcessId = function (id, cb) {
    const err = validateProcessId(God, id);
    if (err) return cb(err, {});

    const procEnv = God.clusters_db[id].pm2_env;
    procEnv.created_at = Utility.getDate();
    procEnv.unstable_restarts = 0;
    procEnv.restart_time = 0;
    return cb(null, God.getFormatedProcesses());
  };

  /**
   * Delete a process by ID
   */
  God.deleteProcessId = function (id, cb) {
    God.deleteCron(id);
    God.stopProcessId(id, (err, proc) => {
      if (err) return cb(God.logAndGenerateError(err), {});
      delete God.clusters_db[id];
      if (Object.keys(God.clusters_db).length === 0) God.next_id = 0;
      return cb(null, proc);
    });
  };

  /**
   * Restart a process by ID (options object)
   */
  God.restartProcessId = function (opts, cb) {
    const { id, env = {} } = opts;
    if (typeof id === 'undefined') {
      return cb(God.logAndGenerateError('opts.id not passed to restartProcessId', opts));
    }
    const err = validateProcessId(God, id);
    if (err) return cb(err, {});

    coreRestartProcessId(God, id, env, cb);
  };

  /**
   * Restart all processes matching a name
   */
  God.restartProcessName = function (name, cb) {
    const processes = God.findByName(name);
    if (!processes || processes.length === 0) {
      return cb(God.logAndGenerateError('Unknown process'), {});
    }

    eachLimit(
      processes,
      cst.CONCURRENT_ACTIONS,
      (proc, next) => {
        if (God.pm2_being_killed) return next('[Watch] PM2 is being killed, stopping restart procedure...');
        if (proc.pm2_env.status === cst.ONLINE_STATUS) {
          return God.restartProcessId({ id: proc.pm2_env.pm_id }, next);
        }
        if (![cst.STOPPING_STATUS, cst.LAUNCHING_STATUS].includes(proc.pm2_env.status)) {
          return God.startProcessId(proc.pm2_env.pm_id, next);
        }
        return next(util.format('[Watch] Process name %s is being stopped so I won\'t restart it', name));
      },
      err => {
        if (err) return cb(God.logAndGenerateError(err));
        return cb(null, God.getFormatedProcesses());
      }
    );
  };

  /**
   * Send a system signal to a process by ID
   */
  God.sendSignalToProcessId = function (opts, cb) {
    const { process_id: id, signal } = opts;
    const err = validateProcessId(God, id);
    if (err) return cb(err, {});

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
  God.sendSignalToProcessName = function (opts, cb) {
    const processes = God.findByName(opts.process_name);
    const { signal } = opts;
    if (!processes || processes.length === 0) {
      return cb(God.logAndGenerateError('Unknown process name'), {});
    }

    eachLimit(
      processes,
      cst.CONCURRENT_ACTIONS,
      (proc, next) => {
        if ([cst.ONLINE_STATUS, cst.LAUNCHING_STATUS].includes(proc.pm2_env.status)) {
          try {
            process.kill(proc.process.pid, signal);
          } catch (e) {
            return next(e);
          }
        }
        return setTimeout(next, 200);
      },
      err => {
        if (err) return cb(God.logAndGenerateError(err), {});
        return cb(null, God.getFormatedProcesses());
      }
    );
  };

  /**
   * Stop watching daemon for given method/value
   */
  God.stopWatch = function (method, value, fn) {
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
   * Toggle watch state for a process
   */
  God.toggleWatch = function (method, value, fn) {
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
  God.startWatch = function (method, value, fn) {
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
  God.reloadLogs = function (opts, cb) {
    console.log('Reloading logs...');
    const processIds = Object.keys(God.clusters_db);
    processIds.forEach(id => {
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
  God.sendLineToStdin = function (packet, cb) {
    if (typeof packet.pm_id === 'undefined' || !packet.line) {
      return cb(God.logAndGenerateError('pm_id or line field missing'), {});
    }
    const { pm_id, line } = packet;
    const proc = God.clusters_db[pm_id];
    if (!proc) return cb(God.logAndGenerateError(`Process with ID <${pm_id}> unknown.`), {});
    if (proc.pm2_env.exec_mode === 'cluster_mode') {
      return cb(God.logAndGenerateError('Cannot send line to processes in cluster mode'), {});
    }
    if (![cst.ONLINE_STATUS, cst.LAUNCHING_STATUS].includes(proc.pm2_env.status)) {
      return cb(God.logAndGenerateError(`Process with ID <${pm_id}> offline.`), {});
    }
    try {
      proc.stdin.write(line, () => {
        return cb(null, { pm_id, line });
      });
    } catch (e) {
      return cb(God.logAndGenerateError(e), {});
    }
  };

  /**
   * Send arbitrary data to a process by ID
   */
  God.sendDataToProcessId = function (packet, cb) {
    if (typeof packet.id === 'undefined' ||
        typeof packet.data === 'undefined' ||
        !packet.topic) {
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
   * Send a message to a process by id or name
   */
  God.msgProcess = function (cmd, cb) {
    if ('id' in cmd) {
      return sendMessageToId(God, cmd, cb);
    }
    if ('name' in cmd) {
      return sendMessageToName(God, cmd, cb);
    }
    return cb(God.logAndGenerateError('method requires name or id field'), {});
  };

  /**
   * Get PM2 version
   */
  God.getVersion = function (env, cb) {
    process.nextTick(() => cb(null, pkg.version));
  };

  /**
   * Enable monitoring for a process
   */
  God.monitor = function (pm_id, cb) {
    if (!God.clusters_db[pm_id] || !God.clusters_db[pm_id].pm2_env) {
      return cb(new Error('Unknown pm_id'));
    }
    God.clusters_db[pm_id].pm2_env._km_monitored = true;
    return cb(null, { success: true, pm_id });
  };

  /**
   * Disable monitoring for a process
   */
  God.unmonitor = function (pm_id, cb) {
    if (!God.clusters_db[pm_id] || !God.clusters_db[pm_id].pm2_env) {
      return cb(new Error('Unknown pm_id'));
    }
    God.clusters_db[pm_id].pm2_env._km_monitored = false;
    return cb(null, { success: true, pm_id });
  };

  /**
   * Generate a report about the PM2 daemon
   */
  God.getReport = function (arg, cb) {
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
    process.nextTick(() => cb(null, report));
  };
};