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

var fs            = require('fs');
var path          = require('path');
var eachLimit     = require('async/eachLimit');
var os            = require('os');
var p             = path;
var cst           = require('../../constants.js');
var pkg           = require('../../package.json');
var pidusage      = require('pidusage');
var util          = require('util');
var debug         = require('debug')('pm2:ActionMethod');
var Utility       = require('../Utility');

/**
 * Get monitor data for processes
 * @method getMonitorData
 * @param {Object} env
 * @param {Function} cb
 */
module.exports.getMonitorData = function getMonitorData(env, cb) {
  const processes = God.getFormatedProcesses();
  const pids = processes
    .filter(filterBadProcess)
    .map(pro => getProcessId(pro));

  if (pids.length === 0) {
    return cb(null, processes.map(pro => {
      pro['monit'] = {
        memory: 0,
        cpu: 0
      };
      return pro;
    }));
  }

  pidusage(pids, (err, statistics) => {
    if (err) {
      console.error('Error caught while calling pidusage');
      console.error(err);
      return cb(null, processes.map(pro => {
        pro['monit'] = {
          memory: 0,
          cpu: 0
        };
        return pro;
      }));
    }

    if (!statistics) {
      console.error('Statistics is not defined!');
      return cb(null, processes.map(pro => {
        pro['monit'] = {
          memory: 0,
          cpu: 0
        };
        return pro;
      }));
    }

    processes = processes.map(pro => {
      if (!filterBadProcess(pro)) {
        pro['monit'] = {
          memory: 0,
          cpu: 0
        };
        return pro;
      }

      const pid = getProcessId(pro);
      const stat = statistics[pid];

      if (!stat) {
        pro['monit'] = {
          memory: 0,
          cpu: 0
        };
        return pro;
      }

      pro['monit'] = {
        memory: stat.memory,
        cpu: Math.round(stat.cpu * 10) / 10
      };

      return pro;
    });

    cb(null, processes);
  });
};

/**
 * Dump process list to file
 * @method dumpProcessList
 * @param {Function} cb
 */
module.exports.dumpProcessList = function dumpProcessList(cb) {
  const process_list = [];
  const apps = Utility.clone(God.getFormatedProcesses());
  const that = this;

  if (!apps[0]) {
    debug('[PM2] Did not override dump file because list of processes is empty');
    return cb(null, { success: true, process_list: process_list });
  }

  function fin(err) {
    if (process_list.length === 0) {
      if (!fs.existsSync(cst.DUMP_FILE_PATH) && typeof that.clearDump === 'function') {
        that.clearDump(function() {});
      }

      if (!apps[0]) {
        return cb(null, { success: true, process_list: process_list });
      }
    }

    try {
      if (fs.existsSync(cst.DUMP_FILE_PATH)) {
        fs.writeFileSync(cst.DUMP_BACKUP_FILE_PATH, fs.readFileSync(cst.DUMP_FILE_PATH));
      }
    } catch (e) {
      console.error(e.stack || e);
    }

    try {
      fs.writeFileSync(cst.DUMP_FILE_PATH, JSON.stringify(process_list));
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

    return cb(null, { success: true, process_list: process_list });
  }

  function saveProc(apps) {
    if (!apps[0]) return fin(null);
    delete apps[0].pm2_env.instances;
    delete apps[0].pm2_env.pm_id;
    if (!apps[0].pm2_env.pmx_module) process_list.push(apps[0].pm2_env);
    apps.shift();
    return saveProc(apps);
  }
  saveProc(apps);
};

/**
 * Ping the system
 * @method ping
 * @param {Object} env
 * @param {Function} cb
 */
module.exports.ping = function ping(env, cb) {
  return cb(null, { msg: 'pong' });
};

/**
 * Notify PM2 that it is being killed
 * @method notifyKillPM2
 */
module.exports.notifyKillPM2 = function notifyKillPM2() {
  God.pm2_being_killed = true;
};

/**
 * Duplicate a process
 * @method duplicateProcessId
 * @param {Number} id
 * @param {Function} cb
 */
module.exports.duplicateProcessId = function duplicateProcessId(id, cb) {
  if (!(id in God.clusters_db)) return cb(God.logAndGenerateError(id + ' id unknown'), {});

  if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env) return cb(God.logAndGenerateError('Error when getting proc || proc.pm2_env'), {});

  const proc = Utility.clone(God.clusters_db[id].pm2_env);

  delete proc.created_at;
  delete proc.pm_id;
  delete proc.unique_id;

  proc.unique_id = Utility.generateUUID();

  God.injectVariables(proc, function inject(_err, proc) {
    God.executeApp(Utility.clone(proc), function (err, clu) {
      if (err) return cb(err);
      God.notify('start', clu, true);
      cb(err, Utility.clone(clu));
    });
  });
};

/**
 * Start a stopped process by ID
 * @method startProcessId
 * @param {Number} id
 * @param {Function} cb
 */
module.exports.startProcessId = function startProcessId(id, cb) {
  if (!(id in God.clusters_db)) return cb(God.logAndGenerateError(id + ' id unknown'), {});

  const proc = God.clusters_db[id];
  if (proc.pm2_env.status === cst.ONLINE_STATUS) return cb(God.logAndGenerateError('process already online'), {});
  if (proc.pm2_env.status === cst.LAUNCHING_STATUS) return cb(God.logAndGenerateError('process already started'), {});
  if (proc.process && proc.process.pid) return cb(God.logAndGenerateError('Process with pid ' + proc.process.pid + ' already exists'), {});

  God.executeApp(God.clusters_db[id].pm2_env, function(err, proc) {
    if (err) return cb(err);
    God.notify('start', proc, true);
    cb(err, Utility.clone(proc));
  });
};

/**
 * Stop a process and set it on state 'stopped'
 * @method stopProcessId
 * @param {Number} id
 * @param {Function} cb
 */
module.exports.stopProcessId = function stopProcessId(id, cb) {
  if (typeof id === 'object' && 'id' in id) id = id.id;

  if (!(id in God.clusters_db)) return cb(God.logAndGenerateError(id + ' : id unknown'), {});

  const proc = God.clusters_db[id];

  clearTimeout(proc.pm2_env.restart_task);

  if (proc.pm2_env.status === cst.STOPPED_STATUS) {
    proc.process.pid = 0;
    return cb(null, God.getFormatedProcess(id));
  }

  if (proc.state && proc.state === 'none') return setTimeout(() => God.stopProcessId(id, cb), 250);

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

    if (err && err.type && err.type === 'timeout') {
      console.error('app=%s id=%d pid=%s could not be stopped',
        proc.pm2_env.name,
        proc.pm2_env.pm_id,
        proc.process.pid);
      proc.pm2_env.status = cst.ERRORED_STATUS;
      return cb(null, God.getFormatedProcess(id));
    }

    if (proc.pm2_env.pm_id.toString().indexOf('_old_') !== 0) {
      try {
        fs.unlinkSync(proc.pm2_env.pm_pid_path);
      } catch (e) {}
    }

    if (proc.pm2_env.axm_actions) proc.pm2_env.axm_actions = [];
    if (proc.pm2_env.axm_monitor) proc.pm2_env.axm_monitor = {};

    proc.process.pid = 0;
    cb(null, God.getFormatedProcess(id));
  });
};

/**
 * Reset meta process data
 * @method resetMetaProcessId
 * @param {Number} id
 * @param {Function} cb
 */
module.exports.resetMetaProcessId = function resetMetaProcessId(id, cb) {
  if (!(id in God.clusters_db)) return cb(God.logAndGenerateError(id + ' id unknown'), {});

  if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env) return cb(God.logAndGenerateError('Error when getting proc || proc.pm2_env'), {});

  God.clusters_db[id].pm2_env.created_at = Utility.getDate();
  God.clusters_db[id].pm2_env.unstable_restarts = 0;
  God.clusters_db[id].pm2_env.restart_time = 0;

  cb(null, God.getFormatedProcesses());
};

/**
 * Delete a process by id
 * @method deleteProcessId
 * @param {Number} id
 * @param {Function} cb
 */
module.exports.deleteProcessId = function deleteProcessId(id, cb) {
  God.deleteCron(id);

  God.stopProcessId(id, function(err, proc) {
    if (err) return cb(God.logAndGenerateError(err), {});
    delete God.clusters_db[id];

    if (Object.keys(God.clusters_db).length === 0) God.next_id = 0;
    cb(null, proc);
  });
  return false;
};

/**
 * Restart a process ID
 * @method restartProcessId
 * @param {Object} opts
 * @param {Function} cb
 */
module.exports.restartProcessId = function restartProcessId(opts, cb) {
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
    God.stopProcessId(id, function(err) {
      if (God.pm2_being_killed)
        return cb(God.logAndGenerateError('[RestartProcessId] PM2 is being killed, stopping restart procedure...'));
      proc.pm2_env.restart_time += 1;
      return God.startProcessId(id, cb);
    });

    return false;
  } else {
    debug('[restart] process not online, starting it');
    return God.startProcessId(id, cb);
  }
};

/**
 * Restart all process by name
 * @method restartProcessName
 * @param {String} name
 * @param {Function} cb
 */
module.exports.restartProcessName = function restartProcessName(name, cb) {
  const processes = God.findByName(name);

  if (processes && processes.length === 0) return cb(God.logAndGenerateError('Unknown process'), {});

  eachLimit(processes, cst.CONCURRENT_ACTIONS, (proc, next) => {
    if (God.pm2_being_killed)
      return next('[Watch] PM2 is being killed, stopping restart procedure...');
    if (proc.pm2_env.status === cst.ONLINE_STATUS)
      return God.restartProcessId({ id: proc.pm2_env.pm_id }, next);
    else if (proc.pm2_env.status !== cst.STOPPING_STATUS && proc.pm2_env.status !== cst.LAUNCHING_STATUS)
      return God.startProcessId(proc.pm2_env.pm_id, next);
    else
      return next(util.format('[Watch] Process name %s is being stopped so I won\'t restart it', name));
  }, (err) => {
    if (err) return cb(God.logAndGenerateError(err));
    return cb(null, God.getFormatedProcesses());
  });

  return false;
};

/**
 * Send system signal to process id
 * @method sendSignalToProcessId
 * @param {Object} opts
 * @param {Function} cb
 */
module.exports.sendSignalToProcessId = function sendSignalToProcessId(opts, cb) {
  const id = opts.process_id;
  const signal = opts.signal;

  if (!(id in God.clusters_db)) return cb(God.logAndGenerateError(id + ' id unknown'), {});

  const proc = God.clusters_db[id];

  try {
    process.kill(God.clusters_db[id].process.pid, signal);
  } catch (e) {
    return cb(God.logAndGenerateError('Error when sending signal (signal unknown)'), {});
  }
  cb(null, God.getFormatedProcesses());
};

/**
 * Send system signal to all processes by name
 * @method sendSignalToProcessName
 * @param {Object} opts
 * @param {Function} cb
 */
module.exports.sendSignalToProcessName = function sendSignalToProcessName(opts, cb) {
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
 * @method stopWatch
 * @param {String} method
 * @param {String} value
 * @param {Function} fn
 */
module.exports.stopWatch = function stopWatch(method, value, fn) {
  let env = null;

  if (method === 'stopAll' || method === 'deleteAll') {
    const processes = God.getFormatedProcesses();

    processes.forEach((proc) => {
      God.clusters_db[proc.pm_id].pm2_env.watch = false;
      God.watch.disable(proc.pm2_env);
    });

  } else {
    if (method.indexOf('ProcessId') !== -1) {
      env = God.clusters_db[value];
    } else if (method.indexOf('ProcessName') !== -1) {
      env = God.clusters_db[God.findByName(value)];
    }

    if (env) {
      God.watch.disable(env.pm2_env);
      env.pm2_env.watch = false;
    }
  }
  fn(null, { success: true });
};

/**
 * Toggle watching daemon
 * @method toggleWatch
 * @param {String} method
 * @param {Object} application environment, should include id
 * @param {Function} callback
 */
module.exports.toggleWatch = function toggleWatch(method, value, fn) {
  let env = null;

  if (method === 'restartProcessId') {
    env = God.clusters_db[value.id];
  } else if (method === 'restartProcessName') {
    env = God.clusters_db[God.findByName(value)];
  }

  if (env) {
    env.pm2_env.watch = !env.pm2_env.watch;
    if (env.pm2_env.watch) God.watch.enable(env.pm2_env);
    else God.watch.disable(env.pm2_env);
  }

  fn(null, { success: true });
};

/**
 * Start Watch
 * @method startWatch
 * @param {String} method
 * @param {Object} application environment, should include id
 * @param {Function} callback
 */
module.exports.startWatch = function startWatch(method, value, fn) {
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

  fn(null, { success: true });
};

/**
 * Reload logs
 * @method reloadLogs
 * @param {Object} opts
 * @param {Function} cb
 */
module.exports.reloadLogs = function reloadLogs(opts, cb) {
  console.log('Reloading logs...');
  const processIds = Object.keys(God.clusters_db);

  processIds.forEach((id) => {
    const cluster = God.clusters_db[id];

    console.log('Reloading logs for process id %d', id);

    if (cluster && cluster.pm2_env) {
      if (cluster.send && cluster.pm2_env.exec_mode === 'cluster_mode') {
        try {
          cluster.send({
            type: 'log:reload'
          });
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

  cb(null, {});
};

/**
 * Send Line To Stdin
 * @method sendLineToStdin
 * @param {Object} packet
 * @param {Function} cb
 */
module.exports.sendLineToStdin = function sendLineToStdin(packet, cb) {
  if (typeof packet.pm_id === 'undefined' || !packet.line)
    return cb(God.logAndGenerateError('pm_id or line field missing'), {});

  const pm_id = packet.pm_id;
  const line = packet.line;

  const proc = God.clusters_db[pm_id];

  if (!proc)
    return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> unknown.'), {});

  if (proc.pm2_env.exec_mode === 'cluster_mode')
    return cb(God.logAndGenerateError('Cannot send line to processes in cluster mode'), {});

  if (proc.pm2_env.status !== cst.ONLINE_STATUS && proc.pm2_env.status !== cst.LAUNCHING_STATUS)
    return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> offline.'), {});

  try {
    proc.stdin.write(line, (err) => {
      if (err) return cb(God.logAndGenerateError(err));
      cb(null, {
        pm_id: pm_id,
        line: line
      });
    });
  } catch (e) {
    return cb(God.logAndGenerateError(e), {});
  }
};

/**
 * Send Data to Process by id or name
 * @method sendDataToProcessId
 * @param {Object} packet
 * @param {Function} cb
 */
module.exports.sendDataToProcessId = function sendDataToProcessId(packet, cb) {
  if (typeof packet.id === 'undefined' || typeof packet.data === 'undefined' || !packet.topic)
    return cb(God.logAndGenerateError('ID, DATA or TOPIC field is missing'), {});

  const pm_id = packet.id;
  const data = packet.data;

  const proc = God.clusters_db[pm_id];

  if (!proc)
    return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> unknown.'), {});

  if (proc.pm2_env.status !== cst.ONLINE_STATUS && proc.pm2_env.status !== cst.LAUNCHING_STATUS)
    return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> offline.'), {});

  try {
    proc.send(packet);
  } catch (e) {
    return cb(God.logAndGenerateError(e), {});
  }

  cb(null, {
    success: true,
    data: packet
  });
};

/**
 * Send Message to Process by id or name
 * @method msgProcess
 * @param {Object} cmd
 * @param {Function} cb
 */
module.exports.msgProcess = function msgProcess(cmd, cb) {
  if ('id' in cmd) {
    const id = cmd.id;
    if (!(id in God.clusters_db))
      return cb(God.logAndGenerateError(id + ' id unknown'), {});

    const proc = God.clusters_db[id];

    const action_exist = proc.pm2_env.axm_actions.some(action => action.action_name === cmd.msg);

    if (!action_exist) {
      return cb(God.logAndGenerateError('Action doesn\'t exist ' + cmd.msg + ' for ' + proc.pm2_env.name), {});
    }

    if (proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS) {
      if (cmd.opts === null && !cmd.uuid)
        proc.send(cmd.msg);
      else
        proc.send(cmd);

      return cb(null, { process_count: 1, success: true });
    } else
      return cb(God.logAndGenerateError(id + ' : id offline'), {});
  } else if ('name' in cmd) {
    const name = cmd.name;
    const arr = Object.keys(God.clusters_db);
    let sent = 0;

    (function ex(arr) {
      if (arr[0] === null || !arr) {
        return cb(null, {
          process_count: sent,
          success: true
        });
      }

      const id = arr[0];

      if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env) {
        arr.shift();
        return ex(arr);
      }

      const proc_env = God.clusters_db[id].pm2_env;

      const isActionAvailable = proc_env.axm_actions.some(action => action.action_name === cmd.msg);

      if (!isActionAvailable) {
        arr.shift();
        return ex(arr);
      }

      if (proc_env.status === cst.ONLINE_STATUS || proc_env.status === cst.LAUNCHING_STATUS) {
        proc_env.axm_actions.forEach(action => {
          if (action.action_name === cmd.msg) {
            action_exist = true;
          }
        });

        if (!action_exist || proc_env.axm_actions.length === 0) {
          arr.shift();
          return ex(arr);
        }

        if (cmd.opts === null)
          God.clusters_db[id].send(cmd.msg);
        else
          God.clusters_db[id].send(cmd);

        sent++;
        arr.shift();
        return ex(arr);
      } else {
        arr.shift();
        return ex(arr);
      }
    })(arr);
  } else
    return cb(God.logAndGenerateError('method requires name or id field'), {});

  return false;
};

/**
 * Get version
 * @method getVersion
 * @param {Object} env
 * @param {Function} cb
 */
module.exports.getVersion = function getVersion(env, cb) {
  process.nextTick(() => {
    cb(null, pkg.version);
  });
};

/**
 * Monitor a process
 * @method monitor
 * @param {Number} pm_id
 * @param {Function} cb
 */
module.exports.monitor = function monitor(pm_id, cb) {
  if (!God.clusters_db[pm_id] || !God.clusters_db[pm_id].pm2_env)
    return cb(new Error('Unknown pm_id'));

  God.clusters_db[pm_id].pm2_env._km_monitored = true;
  cb(null, { success: true, pm_id: pm_id });
};

/**
 * Unmonitor a process
 * @method unmonitor
 * @param {Number} pm_id
 * @param {Function} cb
 */
module.exports.unmonitor = function unmonitor(pm_id, cb) {
  if (!God.clusters_db[pm_id] || !God.clusters_db[pm_id].pm2_env)
    return cb(new Error('Unknown pm_id'));

  God.clusters_db[pm_id].pm2_env._km_monitored = false;
  cb(null, { success: true, pm_id: pm_id });
};

/**
 * Get report
 * @method getReport
 * @param {Object} arg
 * @param {Function} cb
 */
module.exports.getReport = function getReport(arg, cb) {
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

  process.nextTick(() => {
    cb(null, report);
  });
};

function filterBadProcess(pro) {
  if (pro.pm2_env.status !== cst.ONLINE_STATUS) return false;

  if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
    if (isNaN(pro.pm2_env.axm_options.pid)) return false;
  }

  return true;
}

function getProcessId(pro) {
  const pid = pro.pid;

  if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
    pid = pro.pm2_env.axm_options.pid;
  }

  return pid;
}
```