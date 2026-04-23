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
 * Description
 * @method exports
 * @param {} God
 * @return
 */
module.exports = function(God) {
  /**
   * Description
   * @method getMonitorData
   * @param {} env
   * @param {} cb
   * @return
   */
  God.getMonitorData = function getMonitorData(env, cb) {
    var processes = God.getFormatedProcesses();
    var pids = processes.filter(filterBadProcess)
      .map(function(pro) {
        return getProcessId(pro);
      });

    if (!hasValidPids(pids)) {
      return cb(null, processes.map(function(pro) {
        pro['monit'] = {
          memory : 0,
          cpu : 0
        };
        return pro;
      }));
    }

    pidusage(pids, function retPidUsage(err, statistics) {
      if (hasPidUsageError(err)) {
        return cb(null, processes.map(function(pro) {
          pro['monit'] = {
            memory : 0,
            cpu : 0
          };
          return pro;
        }));
      }

      if (!hasValidStatistics(statistics)) {
        return cb(null, processes.map(function(pro) {
          pro['monit'] = {
            memory : 0,
            cpu : 0
          };
          return pro;
        }));
      }

      var updatedProcesses = processes.map(function(pro) {
        if (!isProcessValid(pro)) {
          pro['monit'] = {
            memory : 0,
            cpu : 0
          };
          return pro;
        }

        var pid = getProcessId(pro);
        var stat = statistics[pid];

        if (!hasValidStat(stat)) {
          pro['monit'] = {
            memory : 0,
            cpu : 0
          };
          return pro;
        }

        pro['monit'] = {
          memory: stat.memory,
          cpu: Math.round(stat.cpu * 10) / 10
        };

        return pro;
      });

      cb(null, updatedProcesses);
    });
  };

  /**
   * Description
   * @method dumpProcessList
   * @param {} cb
   * @return
   */
  God.dumpProcessList = function(cb) {
    var process_list = [];
    var apps         = Utility.clone(God.getFormatedProcesses());
    var that = this;

    if (!hasValidApps(apps)) {
      debug('[PM2] Did not override dump file because list of processes is empty');
      return cb(null, {success:true, process_list: process_list});
    }

    function fin(err) {
      if (process_list.length === 0) {
        if (shouldClearDump()) {
          that.clearDump(function(){});
        }
        return cb(null, {success:true, process_list: process_list});
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

      return cb(null, {success:true, process_list: process_list});
    }

    function saveProc(apps) {
      if (!hasValidApps(apps)) {
        return fin(null);
      }
      delete apps[0].pm2_env.instances;
      delete apps[0].pm2_env.pm_id;
      if (!hasModule(apps[0])) {
        process_list.push(apps[0].pm2_env);
      }
      apps.shift();
      return saveProc(apps);
    }
    saveProc(apps);
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
   * Duplicate a process
   * @method duplicateProcessId
   * @param {} id
   * @param {} cb
   * @return CallExpression
   */
  God.duplicateProcessId = function(id, cb) {
    if (!hasValidId(id)) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    if (!hasValidProcEnv(id)) {
      return cb(God.logAndGenerateError('Error when getting proc || proc.pm2_env'), {});
    }

    var proc = Utility.clone(God.clusters_db[id].pm2_env);

    delete proc.created_at;
    delete proc.pm_id;
    delete proc.unique_id;

    proc.unique_id = Utility.generateUUID();

    God.injectVariables(proc, function inject (_err, proc) {
      return God.executeApp(Utility.clone(proc), function (err, clu) {
        if (hasError(err)) {
          return cb(err);
        }
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
    if (!hasValidId(id)) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    var proc = God.clusters_db[id];
    if (isProcessOnline(proc)) {
      return cb(God.logAndGenerateError('process already online'), {});
    }
    if (isProcessLaunching(proc)) {
      return cb(God.logAndGenerateError('process already started'), {});
    }
    if (hasExistingPid(proc)) {
      return cb(God.logAndGenerateError('Process with pid ' + proc.process.pid + ' already exists'), {});
    }

    return God.executeApp(God.clusters_db[id].pm2_env, function(err, proc) {
      return cb(err, Utility.clone(proc));
    });
  };

  /**
   * Stop a process and set it on state 'stopped'
   * @method stopProcessId
   * @param {} id
   * @param {} cb
   * @return Literal
   */
  God.stopProcessId = function(id, cb) {
    if (typeof id == 'object' && 'id' in id) {
      id = id.id;
    }

    if (!hasValidId(id)) {
      return cb(God.logAndGenerateError(id + ' : id unknown'), {});
    }

    var proc     = God.clusters_db[id];

    clearTimeout(proc.pm2_env.restart_task);

    if (isProcessStopped(proc)) {
      proc.process.pid = 0;
      return cb(null, God.getFormatedProcess(id));
    }

    if (isProcessNoneState(proc)) {
      return setTimeout(function() { God.stopProcessId(id, cb); }, 250);
    }

    console.log('Stopping app:%s id:%s', proc.pm2_env.name, proc.pm2_env.pm_id);
    proc.pm2_env.status = cst.STOPPING_STATUS;

    if (!hasProcessPid(proc)) {
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

      if (!hasOldPid(proc)) {
        try {
          fs.unlinkSync(proc.pm2_env.pm_pid_path);
        } catch (e) {}
      }

      if (hasAxmActions(proc)) {
        proc.pm2_env.axm_actions = [];
      }
      if (hasAxmMonitor(proc)) {
        proc.pm2_env.axm_monitor = {};
      }

      proc.process.pid = 0;
      return cb(null, God.getFormatedProcess(id));
    });
  };

  God.resetMetaProcessId = function(id, cb) {
    if (!hasValidId(id)) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    if (!hasValidProcEnv(id)) {
      return cb(God.logAndGenerateError('Error when getting proc || proc.pm2_env'), {});
    }

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
      if (hasError(err)) {
        return cb(God.logAndGenerateError(err), {});
      }
      delete God.clusters_db[id];

      if (hasNoClusters()) {
        God.next_id = 0;
      }
      return cb(null, proc);
    });
    return false;
  };

  /**
   * Restart a process ID
   * If the process is online it will not put it on state stopped
   * but directly kill it and let God restart it
   * @method restartProcessId
   * @param {} id
   * @param {} cb
   * @return Literal
   */
  God.restartProcessId = function(opts, cb) {
    var id = opts.id;
    var env = opts.env || {};

    if (id === undefined) {
      return cb(God.logAndGenerateError('opts.id not passed to restartProcessId', opts));
    }
    if (!hasValidId(id)) {
      return cb(God.logAndGenerateError('God db process id unknown'), {});
    }

    var proc = God.clusters_db[id];

    God.resetState(proc.pm2_env);
    God.deleteCron(id);

    Utility.extend(proc.pm2_env.env, env);
    Utility.extendExtraConfig(proc, opts);

    if (isBeingKilled()) {
      return cb(God.logAndGenerateError('[RestartProcessId] PM2 is being killed, stopping restart procedure...'));
    }
    if (isProcessOnlineOrLaunching(proc)) {
      God.stopProcessId(id, function(err) {
        if (isBeingKilled()) {
          return cb(God.logAndGenerateError('[RestartProcessId] PM2 is being killed, stopping restart procedure...'));
        }
        proc.pm2_env.restart_time += 1;
        return God.startProcessId(id, cb);
      });

      return false;
    }
    else {
      debug('[restart] process not online, starting it');
      return God.startProcessId(id, cb);
    }
  };

  /**
   * Restart all process by name
   * @method restartProcessName
   * @param {} name
   * @param {} cb
   * @return Literal
   */
  God.restartProcessName = function(name, cb) {
    var processes = God.findByName(name);

    if (!hasProcesses(processes)) {
      return cb(God.logAndGenerateError('Unknown process'), {});
    }

    eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      if (isBeingKilled()) {
        return next('[Watch] PM2 is being killed, stopping restart procedure...');
      }
      if (isProcessOnline(proc)) {
        return God.restartProcessId({id:proc.pm2_env.pm_id}, next);
      }
      else if (!isProcessStoppingOrLaunching(proc)) {
        return God.startProcessId(proc.pm2_env.pm_id, next);
      }
      else {
        return next(util.format('[Watch] Process name %s is being stopped so I won\'t restart it', name));
      }
    }, function(err) {
      if (hasError(err)) {
        return cb(God.logAndGenerateError(err));
      }
      return cb(null, God.getFormatedProcesses());
    });

    return false;
  };

  /**
   * Send system signal to process id
   * @method sendSignalToProcessId
   * @param {} opts
   * @param {} cb
   * @return CallExpression
   */
  God.sendSignalToProcessId = function(opts, cb) {
    var id = opts.process_id;
    var signal = opts.signal;

    if (!hasValidId(id)) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    var proc = God.clusters_db[id];

    try {
      process.kill(God.clusters_db[id].process.pid, signal);
    } catch(e) {
      return cb(God.logAndGenerateError('Error when sending signal (signal unknown)'), {});
    }
    return cb(null, God.getFormatedProcesses());
  };

  /**
   * Send system signal to all processes by name
   * @method sendSignalToProcessName
   * @param {} opts
   * @param {} cb
   * @return
   */
  God.sendSignalToProcessName = function(opts, cb) {
    var processes = God.findByName(opts.process_name);
    var signal    = opts.signal;

    if (!hasProcesses(processes)) {
      return cb(God.logAndGenerateError('Unknown process name'), {});
    }

    eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      if (isProcessOnlineOrLaunching(proc)) {
        try {
          process.kill(proc.process.pid, signal);
        } catch(e) {
          return next(e);
        }
      }
      return setTimeout(next, 200);
    }, function(err) {
      if (hasError(err)) {
        return cb(God.logAndGenerateError(err), {});
      }
      return cb(null, God.getFormatedProcesses());
    });

  };

  /**
   * Stop watching daemon
   * @method stopWatch
   * @param {} method
   * @param {} value
   * @param {} fn
   * @return
   */
  God.stopWatch = function(method, value, fn) {
    var env = null;

    if (isStopAllOrDeleteAll(method)) {
      var processes = God.getFormatedProcesses();

      processes.forEach(function(proc) {
        God.clusters_db[proc.pm_id].pm2_env.watch = false;
        God.watch.disable(proc.pm2_env);
      });

    } else {

      if (isProcessIdMethod(method)) {
        env = God.clusters_db[value];
      } else if (isProcessNameMethod(method)) {
        env = God.clusters_db[God.findByName(value)];
      }

      if (hasEnv(env)) {
        God.watch.disable(env.pm2_env);
        env.pm2_env.watch = false;
      }
    }
    return fn(null, {success:true});
  };

  /**
   * Toggle watching daemon
   * @method toggleWatch
   * @param {String} method
   * @param {Object} application environment, should include id
   * @param {Function} callback
   */
  God.toggleWatch = function(method, value, fn) {
    var env = null;

    if (isRestartProcessIdMethod(method)) {
      env = God.clusters_db[value.id];
    } else if (isRestartProcessNameMethod(method)) {
      env = God.clusters_db[God.findByName(value)];
    }

    if (hasEnv(env)) {
      env.pm2_env.watch = !env.pm2_env.watch;
      if (isWatchEnabled(env)) {
        God.watch.enable(env.pm2_env);
      } else {
        God.watch.disable(env.pm2_env);
      }
    }

    return fn(null, {success:true});
  };

  /**
   * Start Watch
   * @method startWatch
   * @param {String} method
   * @param {Object} application environment, should include id
   * @param {Function} callback
   */
  God.startWatch = function(method, value, fn) {
    var env = null;

    if (isRestartProcessIdMethod(method)) {
      env = God.clusters_db[value.id];
    } else if (isRestartProcessNameMethod(method)) {
      env = God.clusters_db[God.findByName(value)];
    }

    if (hasEnv(env)) {
      if (isWatchEnabled(env)) {
        return fn(null, {success:true, notrestarted:true});
      }

      God.watch.enable(env.pm2_env);
      env.pm2_env.watch = true;
    }

    return fn(null, {success:true});
  };

  /**
   * Description
   * @method reloadLogs
   * @param {} opts
   * @param {} cb
   * @return CallExpression
   */
  God.reloadLogs = function(opts, cb) {
    console.log('Reloading logs...');
    var processIds = Object.keys(God.clusters_db);

    processIds.forEach(function (id) {
      var cluster = God.clusters_db[id];

      console.log('Reloading logs for process id %d', id);

      if (hasCluster(cluster)) {
        if (hasClusterMode(cluster)) {
          try {
            cluster.send({
              type:'log:reload'
            });
          } catch(e) {
            console.error(e.message || e);
          }
        }
        else if (hasReloadLogs(cluster)) {
          cluster._reloadLogs(function(err) {
            if (hasError(err)) {
              God.logAndGenerateError(err);
            }
          });
        }
      }
    });

    return cb(null, {});
  };

  /**
   * Send Line To Stdin
   * @method sendLineToStdin
   * @param Object packet
   * @param String pm_id Process ID
   * @param String line  Line to send to process stdin
   */
  God.sendLineToStdin = function(packet, cb) {
    if (!hasPacketFields(packet)) {
      return cb(God.logAndGenerateError('pm_id or line field missing'), {});
    }

    var pm_id = packet.pm_id;
    var line  = packet.line;

    var proc = God.clusters_db[pm_id];

    if (!hasProc(proc)) {
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> unknown.'), {});
    }

    if (isClusterMode(proc)) {
      return cb(God.logAndGenerateError('Cannot send line to processes in cluster mode'), {});
    }

    if (!isProcessOnlineOrLaunching(proc)) {
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> offline.'), {});
    }

    try {
      proc.stdin.write(line, function() {
        return cb(null, {
          pm_id : pm_id,
          line : line
        });
      });
    } catch(e) {
      return cb(God.logAndGenerateError(e), {});
    }
  };

  /**
   * @param {object} packet
   * @param {function} cb
   */
  God.sendDataToProcessId = function(packet, cb) {
    if (!hasPacketFields(packet)) {
      return cb(God.logAndGenerateError('ID, DATA or TOPIC field is missing'), {});
    }

    var pm_id = packet.id;
    var data  = packet.data;

    var proc = God.clusters_db[pm_id];

    if (!hasProc(proc)) {
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> unknown.'), {});
    }

    if (!isProcessOnlineOrLaunching(proc)) {
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> offline.'), {});
    }

    try {
      proc.send(packet);
    }
    catch(e) {
      return cb(God.logAndGenerateError(e), {});
    }

    return cb(null, {
      success: true,
      data   : packet
    });
  };

  /**
   * Send Message to Process by id or name
   * @method msgProcess
   * @param {} cmd
   * @param {} cb
   * @return Literal
   */
  God.msgProcess = function(cmd, cb) {
    if (hasIdField(cmd)) {
      var id = cmd.id;
      if (!hasValidId(id)) {
        return cb(God.logAndGenerateError(id + ' id unknown'), {});
      }
      var proc = God.clusters_db[id];

      var action_exist = false;

      proc.pm2_env.axm_actions.forEach(function(action) {
        if (action.action_name == cmd.msg) {
          action_exist = true;
          action.output = [];
        }
      });
      if (!hasActionExist(action_exist)) {
        return cb(God.logAndGenerateError('Action doesn\'t exist ' + cmd.msg + ' for ' + proc.pm2_env.name), {});
      }

      if (isProcessOnlineOrLaunching(proc)) {
        if (hasNullOptsAndUuid(cmd)) {
          proc.send(cmd.msg);
        } else {
          proc.send(cmd);
        }

        return cb(null, { process_count : 1, success : true });
      }
      else {
        return cb(God.logAndGenerateError(id + ' : id offline'), {});
      }
    }

    else if (hasNameField(cmd)) {
      var name = cmd.name;
      var arr = Object.keys(God.clusters_db);
      var sent = 0;

      (function ex(arr) {
        if (!hasValidArr(arr)) {
          return cb(null, {
            process_count : sent,
            success : true
          });
        }

        var id = arr[0];

        if (!hasValidProcEnv(id)) {
          arr.shift();
          return ex(arr);
        }

        var proc_env = God.clusters_db[id].pm2_env;

        if (!hasActionAvailable(proc_env)) {
          arr.shift();
          return ex(arr);
        }

        if (hasMatchingName(proc_env, name) && isProcessOnlineOrLaunching(proc_env)) {
          proc_env.axm_actions.forEach(function(action) {
            if (action.action_name == cmd.msg) {
              action_exist = true;
            }
          });

          if (!hasActionExist(action_exist) || hasNoActions(proc_env)) {
            arr.shift();
            return ex(arr);
          }

          if (hasNullOpts(cmd)) {
            God.clusters_db[id].send(cmd.msg);
          } else {
            God.clusters_db[id].send(cmd);
          }

          sent++;
          arr.shift();
          return ex(arr);
        }
        else {
          arr.shift();
          return ex(arr);
        }
        return false;
      })(arr);
    }

    else {
      return cb(God.logAndGenerateError('method requires name or id field'), {});
    }
    return false;
  };

  /**
   * Description
   * @method getVersion
   * @param {} env
   * @param {} cb
   * @return CallExpression
   */
  God.getVersion = function(env, cb) {
    process.nextTick(function() {
      return cb(null, pkg.version);
    });
  };

  God.monitor = function Monitor(pm_id, cb) {
    if (!hasValidProcEnv(pm_id)) {
      return cb(new Error('Unknown pm_id'));
    }

    God.clusters_db[pm_id].pm2_env._km_monitored = true;
    return cb(null, { success : true, pm_id : pm_id });
  };

  God.unmonitor = function Monitor(pm_id, cb) {
    if (!hasValidProcEnv(pm_id)) {
      return cb(new Error('Unknown pm_id'));
    }

    God.clusters_db[pm_id].pm2_env._km_monitored = false;
    return cb(null, { success : true, pm_id : pm_id });
  };

  God.getReport = function(arg, cb) {
    var report = {
      pm2_version : pkg.version,
      node_version : 'N/A',
      node_path : process.env['_'] || 'not found',
      argv0 : process.argv0,
      argv : process.argv,
      user : process.env.USER,
      uid : (cst.IS_WINDOWS === false && process.geteuid) ? process.geteuid() : 'N/A',
      gid : (cst.IS_WINDOWS === false && process.getegid) ? process.getegid() : 'N/A',
      env : process.env,
      managed_apps : Object.keys(God.clusters_db).length,
      started_at : God.started_at
    };

    if (hasNodeVersion()) {
      report.node_version = process.versions.node;
    }

    process.nextTick(function() {
      return cb(null, report);
    });
  };
};

/**
 * Check if pids array has valid entries
 * @param {Array} pids
 * @returns {boolean}
 */
function hasValidPids(pids) {
  return pids.length > 0;
}

/**
 * Check if pidusage has error
 * @param {Error|null} err
 * @returns {boolean}
 */
function hasPidUsageError(err) {
  return err !== null;
}

/**
 * Check if statistics is valid
 * @param {Object|null} statistics
 * @returns {boolean}
 */
function hasValidStatistics(statistics) {
  return statistics !== null;
}

/**
 * Check if process is valid
 * @param {Object} pro
 * @returns {boolean}
 */
function isProcessValid(pro) {
  return filterBadProcess(pro) === true;
}

/**
 * Check if stat is valid
 * @param {Object|null} stat
 * @returns {boolean}
 */
function hasValidStat(stat) {
  return stat !== null;
}

/**
 * Check if apps array has valid entries
 * @param {Array} apps
 * @returns {boolean}
 */
function hasValidApps(apps) {
  return apps && apps.length > 0;
}

/**
 * Check if should clear dump
 * @returns {boolean}
 */
function shouldClearDump() {
  return !fs.existsSync(cst.DUMP_FILE_PATH) && typeof God.clearDump === 'function';
}

/**
 * Check if app has module
 * @param {Object} app
 * @returns {boolean}
 */
function hasModule(app) {
  return app.pm2_env.pmx_module !== undefined;
}

/**
 * Check if id is valid
 * @param {string} id
 * @returns {boolean}
 */
function hasValidId(id) {
  return id !== undefined && id !== null && (id in God.clusters_db);
}

/**
 * Check if process environment is valid
 * @param {string} id
 * @returns {boolean}
 */
function hasValidProcEnv(id) {
  return God.clusters_db[id] !== null && God.clusters_db[id].pm2_env !== undefined;
}

/**
 * Check if has error
 * @param {Error|null} err
 * @returns {boolean}
 */
function hasError(err) {
  return err !== null;
}

/**
 * Check if process is online
 * @param {Object} proc
 * @returns {boolean}
 */
function isProcessOnline(proc) {
  return proc.pm2_env.status === cst.ONLINE_STATUS;
}

/**
 * Check if process is launching
 * @param {Object} proc
 * @returns {boolean}
 */
function isProcessLaunching(proc) {
  return proc.pm2_env.status === cst.LAUNCHING_STATUS;
}

/**
 * Check if process has existing pid
 * @param {Object} proc
 * @returns {boolean}
 */
function hasExistingPid(proc) {
  return proc.process && proc.process.pid !== undefined;
}

/**
 * Check if process is stopped
 * @param {Object} proc
 * @returns {boolean}
 */
function isProcessStopped(proc) {
  return proc.pm2_env.status === cst.STOPPED_STATUS;
}

/**
 * Check if process is in none state
 * @param {Object} proc
 * @returns {boolean}
 */
function isProcessNoneState(proc) {
  return proc.state && proc.state === 'none';
}

/**
 * Check if process has pid
 * @param {Object} proc
 * @returns {boolean}
 */
function hasProcessPid(proc) {
  return proc.process && proc.process.pid !== undefined;
}

/**
 * Check if process has old pid
 * @param {Object} proc
 * @returns {boolean}
 */
function hasOldPid(proc) {
  return proc.pm2_env.pm_id.toString().indexOf('_old_') !== -1;
}

/**
 * Check if process has axm actions
 * @param {Object} proc
 * @returns {boolean}
 */
function hasAxmActions(proc) {
  return proc.pm2_env.axm_actions !== undefined;
}

/**
 * Check if process has axm monitor
 * @param {Object} proc
 * @returns {boolean}
 */
function hasAxmMonitor(proc) {
  return proc.pm2_env.axm_monitor !== undefined;
}

/**
 * Check if being killed
 * @returns {boolean}
 */
function isBeingKilled() {
  return God.pm2_being_killed === true;
}

/**
 * Check if process is online or launching
 * @param {Object} proc
 * @returns {boolean}
 */
function isProcessOnlineOrLaunching(proc) {
  return proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS;
}

/**
 * Check if process is stopping or launching
 * @param {Object} proc
 * @returns {boolean}
 */
function isProcessStoppingOrLaunching(proc) {
  return proc.pm2_env.status === cst.STOPPING_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS;
}

/**
 * Check if has processes
 * @param {Array} processes
 * @returns {boolean}
 */
function hasProcesses(processes) {
  return processes && processes.length > 0;
}

/**
 * Check if method is stop all or delete all
 * @param {string} method
 * @returns {boolean}
 */
function isStopAllOrDeleteAll(method) {
  return method === 'stopAll' || method === 'deleteAll';
}

/**
 * Check if method is process id
 * @param {string} method
 * @returns {boolean}
 */
function isProcessIdMethod(method) {
  return method.indexOf('ProcessId') !== -1;
}

/**
 * Check if method is process name
 * @param {string} method
 * @returns {boolean}
 */
function isProcessNameMethod(method) {
  return method.indexOf('ProcessName') !== -1;
}

/**
 * Check if method is restart process id
 * @param {string} method
 * @returns {boolean}
 */
function isRestartProcessIdMethod(method) {
  return method === 'restartProcessId';
}

/**
 * Check if method is restart process name
 * @param {string} method
 * @returns {boolean}
 */
function isRestartProcessNameMethod(method) {
  return method === 'restartProcessName';
}

/**
 * Check if has env
 * @param {Object|null} env
 * @returns {boolean}
 */
function hasEnv(env) {
  return env !== null;
}

/**
 * Check if watch is enabled
 * @param {Object} env
 * @returns {boolean}
 */
function isWatchEnabled(env) {
  return env.pm2_env.watch === true;
}

/**
 * Check if has cluster
 * @param {Object|null} cluster
 * @returns {boolean}
 */
function hasCluster(cluster) {
  return cluster !== null;
}

/**
 * Check if has cluster mode
 * @param {Object} cluster
 * @returns {boolean}
 */
function hasClusterMode(cluster) {
  return cluster.send !== undefined && cluster.pm2_env.exec_mode === 'cluster_mode';
}

/**
 * Check if has reload logs
 * @param {Object} cluster
 * @returns {boolean}
 */
function hasReloadLogs(cluster) {
  return cluster._reloadLogs !== undefined;
}

/**
 * Check if has packet fields
 * @param {Object} packet
 * @returns {boolean}
 */
function hasPacketFields(packet) {
  return packet.pm_id !== undefined && packet.line !== undefined && packet.topic !== undefined;
}

/**
 * Check if has proc
 * @param {Object|null} proc
 * @returns {boolean}
 */
function hasProc(proc) {
  return proc !== null;
}

/**
 * Check if is cluster mode
 * @param {Object} proc
 * @returns {boolean}
 */
function isClusterMode(proc) {
  return proc.pm2_env.exec_mode === 'cluster_mode';
}

/**
 * Check if has id field
 * @param {Object} cmd
 * @returns {boolean}
 */
function hasIdField(cmd) {
  return 'id' in cmd;
}

/**
 * Check if has name field
 * @param {Object} cmd
 * @returns {boolean}
 */
function hasNameField(cmd) {
  return 'name' in cmd;
}

/**
 * Check if has null opts and uuid
 * @param {Object} cmd
 * @returns {boolean}
 */
function hasNullOptsAndUuid(cmd) {
  return cmd.opts === null && cmd.uuid === undefined;
}

/**
 * Check if has null opts
 * @param {Object} cmd
 * @returns {boolean}
 */
function hasNullOpts(cmd) {
  return cmd.opts === null;
}

/**
 * Check if has valid arr
 * @param {Array} arr
 * @returns {boolean}
 */
function hasValidArr(arr) {
  return arr !== null && arr.length > 0;
}

/**
 * Check if has action available
 * @param {Object} proc_env
 * @returns {boolean}
 */
function hasActionAvailable(proc_env) {
  return proc_env.axm_actions !== undefined && proc_env.axm_actions.some(function(action) {
    return action.action_name === cmd.msg;
  });
}

/**
 * Check if has action exist
 * @param {boolean} action_exist
 * @returns {boolean}
 */
function hasActionExist(action_exist) {
  return action_exist === true;
}

/**
 * Check if has no actions
 * @param {Object} proc_env
 * @returns {boolean}
 */
function hasNoActions(proc_env) {
  return proc_env.axm_actions === undefined || proc_env.axm_actions.length === 0;
}

/**
 * Check if has matching name
 * @param {Object} proc_env
 * @param {string} name
 * @returns {boolean}
 */
function hasMatchingName(proc_env, name) {
  return p.basename(proc_env.pm_exec_path) === name ||
         proc_env.name === name ||
         proc_env.namespace === name ||
         name === 'all';
}

/**
 * Check if has node version
 * @returns {boolean}
 */
function hasNodeVersion() {
  return process.versions && process.versions.node;
}

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
  var pid = pro.pid;

  if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
    pid = pro.pm2_env.axm_options.pid;
  }

  return pid;
}
```