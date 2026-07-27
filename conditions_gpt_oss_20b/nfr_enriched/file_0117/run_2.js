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
 * @file ActionMethod like restart, stop, monitor... are here
 * @author Alexandre Strzelewicz <as@unitech.io>
 * @project PM2
 */

module.exports = function (God) {
  /**
   * Create an empty monitoring object
   * @returns {{memory: number, cpu: number}}
   */
  const emptyMonitor = () => ({ memory: 0, cpu: 0 });

  /**
   * Map processes to include monitoring data
   * @param {Array} processes
   * @param {Object} statistics
   * @returns {Array}
   */
  const mapProcessesWithStats = (processes, statistics) => {
    return processes.map((pro) => {
      if (!filterBadProcess(pro)) {
        pro.monit = emptyMonitor();
        return pro;
      }
      const pid = getProcessId(pro);
      const stat = statistics[pid];
      if (!stat) {
        pro.monit = emptyMonitor();
        return pro;
      }
      pro.monit = {
        memory: stat.memory,
        cpu: Math.round(stat.cpu * 10) / 10,
      };
      return pro;
    });
  };

  /**
   * Get monitoring data for all processes
   * @param {Object} env
   * @param {Function} cb
   */
  God.getMonitorData = function (env, cb) {
    const processes = God.getFormatedProcesses();
    const pids = processes
      .filter(filterBadProcess)
      .map((pro) => getProcessId(pro));

    if (pids.length === 0) {
      const result = processes.map((pro) => {
        pro.monit = emptyMonitor();
        return pro;
      });
      return cb(null, result);
    }

    pidusage(pids, (err, statistics) => {
      if (err || !statistics) {
        console.error('Error caught while calling pidusage', err || 'Statistics is not defined!');
        const result = processes.map((pro) => {
          pro.monit = emptyMonitor();
          return pro;
        });
        return cb(null, result);
      }

      const result = mapProcessesWithStats(processes, statistics);
      cb(null, result);
    });
  };

  /**
   * Save process list to dump file
   * @param {Function} cb
   */
  God.dumpProcessList = function (cb) {
    const processList = [];
    const apps = Utility.clone(God.getFormatedProcesses());
    const that = this;

    if (!apps[0]) {
      debug('[PM2] Did not override dump file because list of processes is empty');
      return cb(null, { success: true, process_list: processList });
    }

    const finish = (err) => {
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
        } catch (e) {
          fs.unlinkSync(cst.DUMP_FILE_PATH);
          console.error(e.stack || e);
        }
      }

      return cb(null, { success: true, process_list: processList });
    };

    const saveProc = (appsArray) => {
      if (!appsArray[0]) return finish(null);
      delete appsArray[0].pm2_env.instances;
      delete appsArray[0].pm2_env.pm_id;
      if (!appsArray[0].pm2_env.pmx_module) processList.push(appsArray[0].pm2_env);
      appsArray.shift();
      return saveProc(appsArray);
    };

    saveProc(apps);
  };

  /**
   * Ping
   * @param {Object} env
   * @param {Function} cb
   */
  God.ping = function (env, cb) {
    return cb(null, { msg: 'pong' });
  };

  /**
   * Notify PM2 is being killed
   */
  God.notifyKillPM2 = function () {
    God.pm2_being_killed = true;
  };

  /**
   * Duplicate a process
   * @param {number|string} id
   * @param {Function} cb
   */
  God.duplicateProcessId = function (id, cb) {
    if (!(id in God.clusters_db)) return cb(God.logAndGenerateError(`${id} id unknown`), {});

    const cluster = God.clusters_db[id];
    if (!cluster || !cluster.pm2_env) return cb(God.logAndGenerateError('Error when getting proc || proc.pm2_env'), {});

    const proc = Utility.clone(cluster.pm2_env);
    delete proc.created_at;
    delete proc.pm_id;
    delete proc.unique_id;
    proc.unique_id = Utility.generateUUID();

    God.injectVariables(proc, (err, procWithVars) => {
      God.executeApp(Utility.clone(procWithVars), (err, clu) => {
        if (err) return cb(err);
        God.notify('start', clu, true);
        return cb(err, Utility.clone(clu));
      });
    });
  };

  /**
   * Start a stopped process by ID
   * @param {number|string} id
   * @param {Function} cb
   */
  God.startProcessId = function (id, cb) {
    if (!(id in God.clusters_db)) return cb(God.logAndGenerateError(`${id} id unknown`), {});

    const proc = God.clusters_db[id];
    if (proc.pm2_env.status === cst.ONLINE_STATUS) return cb(God.logAndGenerateError('process already online'), {});
    if (proc.pm2_env.status === cst.LAUNCHING_STATUS) return cb(God.logAndGenerateError('process already started'), {});
    if (proc.process && proc.process.pid) return cb(God.logAndGenerateError(`Process with pid ${proc.process.pid} already exists`), {});

    return God.executeApp(God.clusters_db[id].pm2_env, (err, procResult) => {
      return cb(err, Utility.clone(procResult));
    });
  };

  /**
   * Stop a process and set it on state 'stopped'
   * @param {number|string} id
   * @param {Function} cb
   */
  God.stopProcessId = function (id, cb) {
    if (typeof id === 'object' && 'id' in id) id = id.id;

    if (!(id in God.clusters_db)) return cb(God.logAndGenerateError(`${id} : id unknown`), {});

    const proc = God.clusters_db[id];
    clearTimeout(proc.pm2_env.restart_task);

    if (proc.pm2_env.status === cst.STOPPED_STATUS) {
      proc.process.pid = 0;
      return cb(null, God.getFormatedProcess(id));
    }

    if (proc.state && proc.state === 'none') {
      return setTimeout(() => God.stopProcessId(id, cb), 250);
    }

    console.log(`Stopping app:%s id:%s`, proc.pm2_env.name, proc.pm2_env.pm_id);
    proc.pm2_env.status = cst.STOPPING_STATUS;

    if (!proc.process.pid) {
      console.error(`app=${proc.pm2_env.name} id=${proc.pm2_env.pm_id} does not have a pid`);
      proc.pm2_env.status = cst.STOPPED_STATUS;
      return cb(null, { error: true, message: 'could not kill process w/o pid' });
    }

    God.killProcess(proc.process.pid, proc.pm2_env, (err) => {
      proc.pm2_env.status = cst.STOPPED_STATUS;
      God.notify('exit', proc);

      if (err && err.type === 'timeout') {
        console.error(`app=${proc.pm2_env.name} id=${proc.pm2_env.pm_id} pid=${proc.process.pid} could not be stopped`);
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
   * Reset meta data for a process
   * @param {number|string} id
   * @param {Function} cb
   */
  God.resetMetaProcessId = function (id, cb) {
    if (!(id in God.clusters_db)) return cb(God.logAndGenerateError(`${id} id unknown`), {});

    if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env) {
      return cb(God.logAndGenerateError('Error when getting proc || proc.pm2_env'), {});
    }

    const env = God.clusters_db[id].pm2_env;
    env.created_at = Utility.getDate();
    env.unstable_restarts = 0;
    env.restart_time = 0;

    return cb(null, God.getFormatedProcesses());
  };

  /**
   * Delete a process by id
   * @param {number|string} id
   * @param {Function} cb
   */
  God.deleteProcessId = function (id, cb) {
    God.deleteCron(id);

    God.stopProcessId(id, (err, proc) => {
      if (err) return cb(God.logAndGenerateError(err), {});
      delete God.clusters_db[id];

      if (Object.keys(God.clusters_db).length === 0) God.next_id = 0;
      return cb(null, proc);
    });
    return false;
  };

  /**
   * Restart a process ID
   * @param {Object} opts
   * @param {Function} cb
   */
  God.restartProcessId = function (opts, cb) {
    const id = opts.id;
    const env = opts.env || {};

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

    if (proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS) {
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
   * Restart all process by name
   * @param {string} name
   * @param {Function} cb
   */
  God.restartProcessName = function (name, cb) {
    const processes = God.findByName(name);

    if (processes && processes.length === 0) return cb(God.logAndGenerateError('Unknown process'), {});

    eachLimit(processes, cst.CONCURRENT_ACTIONS, (proc, next) => {
      if (God.pm2_being_killed) return next('[Watch] PM2 is being killed, stopping restart procedure...');
      if (proc.pm2_env.status === cst.ONLINE_STATUS) return God.restartProcessId({ id: proc.pm2_env.pm_id }, next);
      if (proc.pm2_env.status !== cst.STOPPING_STATUS && proc.pm2_env.status !== cst.LAUNCHING_STATUS) {
        return God.startProcessId(proc.pm2_env.pm_id, next);
      }
      return next(util.format("[Watch] Process name %s is being stopped so I won\'t restart it", name));
    }, (err) => {
      if (err) return cb(God.logAndGenerateError(err));
      return cb(null, God.getFormatedProcesses());
    });

    return false;
  };

  /**
   * Send system signal to process id
   * @param {Object} opts
   * @param {Function} cb
   */
  God.sendSignalToProcessId = function (opts, cb) {
    const id = opts.process_id;
    const signal = opts.signal;

    if (!(id in God.clusters_db)) return cb(God.logAndGenerateError(`${id} id unknown`), {});

    const proc = God.clusters_db[id];

    try {
      process.kill(proc.process.pid, signal);
    } catch (e) {
      return cb(God.logAndGenerateError('Error when sending signal (signal unknown)'), {});
    }
    return cb(null, God.getFormatedProcesses());
  };

  /**
   * Send system signal to all processes by name
   * @param {Object} opts
   * @param {Function} cb
   */
  God.sendSignalToProcessName = function (opts, cb) {
    const processes = God.findByName(opts.process_name);
    const signal = opts.signal;

    if (processes && processes.length === 0) return cb(God.logAndGenerateError('Unknown process name'), {});

    eachLimit(processes, cst.CONCURRENT_ACTIONS, (proc, next) => {
      if (proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS) {
        try {
          process.kill(proc.process.pid, signal);
        } catch (e) {
          return next(e);
        }
      }
      return setTimeout(next, 200);
    }, (err) => {
      if (err) return cb(God.logAndGenerateError(err), {});
      return cb(null, God.getFormatedProcesses());
    });
  };

  /**
   * Stop watching daemon
   * @param {string} method
   * @param {any} value
   * @param {Function} fn
   */
  God.stopWatch = function (method, value, fn) {
    let env = null;

    if (method === 'stopAll' || method === 'deleteAll') {
      const processes = God.getFormatedProcesses();
      processes.forEach((proc) => {
        God.clusters_db[proc.pm_id].pm2_env.watch = false;
        God.watch.disable(proc.pm2_env);
      });
    } else {
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
   * Toggle watching daemon
   * @param {string} method
   * @param {any} value
   * @param {Function} fn
   */
  God.toggleWatch = function (method, value, fn) {
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
   * Start Watch
   * @param {string} method
   * @param {any} value
   * @param {Function} fn
   */
  God.startWatch = function (method, value, fn) {
    let env = null;

    if (method === 'restartProcessId') {
      env = God.clusters_db[value.id];
    } else if (method === 'restartProcessName') {
      env = God.clusters_db[God.findByName(value)];
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
   * @param {Object} opts
   * @param {Function} cb
   */
  God.reloadLogs = function (opts, cb) {
    console.log('Reloading logs...');
    const processIds = Object.keys(God.clusters_db);

    processIds.forEach((id) => {
      const cluster = God.clusters_db[id];
      console.log(`Reloading logs for process id ${id}`);

      if (cluster && cluster.pm2_env) {
        if (cluster.send && cluster.pm2_env.exec_mode === 'cluster_mode') {
          try {
            cluster.send({ type: 'log:reload' });
          } catch (e) {
            console.error(e.message || e);
          }
        } else if (cluster._reloadLogs) {
          cluster._reloadLogs((err) => {
            if (err) God.logAndGenerateError(err);
          });
        }
      }
    });

    return cb(null, {});
  };

  /**
   * Send line to stdin of a process
   * @param {Object} packet
   * @param {Function} cb
   */
  God.sendLineToStdin = function (packet, cb) {
    if (typeof packet.pm_id === 'undefined' || !packet.line) {
      return cb(God.logAndGenerateError('pm_id or line field missing'), {});
    }

    const pm_id = packet.pm_id;
    const line = packet.line;
    const proc = God.clusters_db[pm_id];

    if (!proc) return cb(God.logAndGenerateError(`Process with ID <${pm_id}> unknown.`), {});

    if (proc.pm2_env.exec_mode === 'cluster_mode') {
      return cb(God.logAndGenerateError('Cannot send line to processes in cluster mode'), {});
    }

    if (proc.pm2_env.status !== cst.ONLINE_STATUS && proc.pm2_env.status !== cst.LAUNCHING_STATUS) {
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
   * Send data to a process by ID
   * @param {Object} packet
   * @param {Function} cb
   */
  God.sendDataToProcessId = function (packet, cb) {
    if (typeof packet.id === 'undefined' || typeof packet.data === 'undefined' || !packet.topic) {
      return cb(God.logAndGenerateError('ID, DATA or TOPIC field is missing'), {});
    }

    const pm_id = packet.id;
    const data = packet.data;
    const proc = God.clusters_db[pm_id];

    if (!proc) return cb(God.logAndGenerateError(`Process with ID <${pm_id}> unknown.`), {});

    if (proc.pm2_env.status !== cst.ONLINE_STATUS && proc.pm2_env.status !== cst.LAUNCHING_STATUS) {
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
   * Send message to process by id or name
   * @param {Object} cmd
   * @param {Function} cb
   */
  God.msgProcess = function (cmd, cb) {
    if ('id' in cmd) {
      const id = cmd.id;
      if (!(id in God.clusters_db)) return cb(God.logAndGenerateError(`${id} id unknown`), {});

      const proc = God.clusters_db[id];
      let actionExist = false;

      proc.pm2_env.axm_actions.forEach((action) => {
        if (action.action_name === cmd.msg) {
          actionExist = true;
          action.output = [];
        }
      });

      if (!actionExist) {
        return cb(God.logAndGenerateError(`Action doesn't exist ${cmd.msg} for ${proc.pm2_env.name}`), {});
      }

      if (proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS) {
        if (cmd.opts == null && !cmd.uuid) {
          proc.send(cmd.msg);
        } else {
          proc.send(cmd);
        }
        return cb(null, { process_count: 1, success: true });
      }

      return cb(God.logAndGenerateError(`${id} : id offline`), {});
    }

    if ('name' in cmd) {
      const name = cmd.name;
      const ids = Object.keys(God.clusters_db);
      let sent = 0;

      const processNext = (remainingIds) => {
        if (!remainingIds || remainingIds[0] == null) {
          return cb(null, { process_count: sent, success: true });
        }

        const id = remainingIds[0];
        const cluster = God.clusters_db[id];

        if (!cluster || !cluster.pm2_env) {
          remainingIds.shift();
          return processNext(remainingIds);
        }

        const env = cluster.pm2_env;
        const actionAvailable = env.axm_actions.some((a) => a.action_name === cmd.msg);

        if (!actionAvailable) {
          remainingIds.shift();
          return processNext(remainingIds);
        }

        if (
          (p.basename(env.pm_exec_path) === name ||
            env.name === name ||
            env.namespace === name ||
            name === 'all') &&
          (env.status === cst.ONLINE_STATUS || env.status === cst.LAUNCHING_STATUS)
        ) {
          env.axm_actions.forEach((action) => {
            if (action.action_name === cmd.msg) {
              // action_exist = true; // not needed
            }
          });

          if (cmd.opts == null) {
            cluster.send(cmd.msg);
          } else {
            cluster.send(cmd);
          }

          sent++;
          remainingIds.shift();
          return processNext(remainingIds);
        }

        remainingIds.shift();
        return processNext(remainingIds);
      };

      processNext(ids);
      return false;
    }

    return cb(God.logAndGenerateError('method requires name or id field'), {});
  };

  /**
   * Get version
   * @param {Object} env
   * @param {Function} cb
   */
  God.getVersion = function (env, cb) {
    process.nextTick(() => {
      return cb(null, pkg.version);
    });
  };

  /**
   * Monitor a process
   * @param {number|string} pm_id
   * @param {Function} cb
   */
  God.monitor = function (pm_id, cb) {
    if (!God.clusters_db[pm_id] || !God.clusters_db[pm_id].pm2_env) {
      return cb(new Error('Unknown pm_id'));
    }

    God.clusters_db[pm_id].pm2_env._km_monitored = true;
    return cb(null, { success: true, pm_id });
  };

  /**
   * Unmonitor a process
   * @param {number|string} pm_id
   * @param {Function} cb
   */
  God.unmonitor = function (pm_id, cb) {
    if (!God.clusters_db[pm_id] || !God.clusters_db[pm_id].pm2_env) {
      return cb(new Error('Unknown pm_id'));
    }

    God.clusters_db[pm_id].pm2_env._km_monitored = false;
    return cb(null, { success: true, pm_id });
  };

  /**
   * Get system report
   * @param {any} arg
   * @param {Function} cb
   */
  God.getReport = function (arg, cb) {
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

    if (process.versions && process.versions.node) {
      report.node_version = process.versions.node;
    }

    process.nextTick(() => {
      return cb(null, report);
    });
  };
};

/**
 * Check if a process is eligible for monitoring
 * @param {Object} pro
 * @returns {boolean}
 */
function filterBadProcess(pro) {
  if (pro.pm2_env.status !== cst.ONLINE_STATUS) return false;

  if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
    if (isNaN(pro.pm2_env.axm_options.pid)) return false;
  }

  return true;
}

/**
 * Retrieve the PID for a process
 * @param {Object} pro
 * @returns {number|string}
 */
function getProcessId(pro) {
  let pid = pro.pid;

  if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
    pid = pro.pm2_env.axm_options.pid;
  }

  return pid;
}