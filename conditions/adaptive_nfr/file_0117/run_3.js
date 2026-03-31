```javascript
'use strict';

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

const EMPTY_MONIT = { memory: 0, cpu: 0 };

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

function attachMonitData(processes, statistics) {
  return processes.map(pro => {
    if (!filterBadProcess(pro)) {
      pro.monit = EMPTY_MONIT;
      return pro;
    }

    const pid = getProcessId(pro);
    const stat = statistics[pid];

    if (!stat) {
      pro.monit = EMPTY_MONIT;
      return pro;
    }

    pro.monit = {
      memory: stat.memory,
      cpu: Math.round(stat.cpu * 10) / 10
    };

    return pro;
  });
}

function attachEmptyMonit(processes) {
  return processes.map(pro => {
    pro.monit = EMPTY_MONIT;
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
}

function extractProcessConfig(app) {
  delete app.pm2_env.instances;
  delete app.pm2_env.pm_id;
  if (!app.pm2_env.pmx_module) {
    return app.pm2_env;
  }
  return null;
}

function getProcessEnv(God, value, method) {
  if (method.indexOf('ProcessId') !== -1) {
    return God.clusters_db[value];
  } else if (method.indexOf('ProcessName') !== -1) {
    return God.clusters_db[God.findByName(value)];
  }
  return null;
}

function validateProcessId(God, id) {
  if (!(id in God.clusters_db)) {
    return God.logAndGenerateError(id + ' id unknown');
  }
  if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env) {
    return God.logAndGenerateError('Error when getting proc || proc.pm2_env');
  }
  return null;
}

function clearProcessMetadata(proc) {
  if (proc.pm2_env.axm_actions) proc.pm2_env.axm_actions = [];
  if (proc.pm2_env.axm_monitor) proc.pm2_env.axm_monitor = {};
}

function findActionInProcess(proc, actionName) {
  return proc.pm2_env.axm_actions.find(action => action.action_name === actionName);
}

function isProcessOnline(proc) {
  return proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS;
}

module.exports = function(God) {
  God.getMonitorData = function getMonitorData(env, cb) {
    const processes = God.getFormatedProcesses();
    const pids = processes.filter(filterBadProcess).map(getProcessId);

    if (pids.length === 0) {
      return cb(null, attachEmptyMonit(processes));
    }

    pidusage(pids, function retPidUsage(err, statistics) {
      if (err || !statistics) {
        if (err) console.error('Error caught while calling pidusage', err);
        if (!statistics) console.error('Statistics is not defined!');
        return cb(null, attachEmptyMonit(processes));
      }

      const processesWithMonit = attachMonitData(processes, statistics);
      cb(null, processesWithMonit);
    });
  };

  God.dumpProcessList = function(cb) {
    const apps = Utility.clone(God.getFormatedProcesses());

    if (!apps[0]) {
      debug('[PM2] Did not override dump file because list of processes is empty');
      return cb(null, { success: true, process_list: [] });
    }

    const processList = [];

    const saveProc = (appList) => {
      if (!appList[0]) return processList;
      const config = extractProcessConfig(appList[0]);
      if (config) processList.push(config);
      appList.shift();
      return saveProc(appList);
    };

    saveProc(apps);

    if (processList.length === 0) {
      if (!fs.existsSync(cst.DUMP_FILE_PATH) && typeof this.clearDump === 'function') {
        this.clearDump(function(){});
      }
      return cb(null, { success: true, process_list: processList });
    }

    backupDumpFile();
    writeDumpFile(processList);

    return cb(null, { success: true, process_list: processList });
  };

  God.ping = function(env, cb) {
    return cb(null, { msg: 'pong' });
  };

  God.notifyKillPM2 = function() {
    God.pm2_being_killed = true;
  };

  God.duplicateProcessId = function(id, cb) {
    const err = validateProcessId(God, id);
    if (err) return cb(err, {});

    const proc = Utility.clone(God.clusters_db[id].pm2_env);

    delete proc.created_at;
    delete proc.pm_id;
    delete proc.unique_id;
    proc.unique_id = Utility.generateUUID();

    God.injectVariables(proc, function inject(_err, proc) {
      return God.executeApp(Utility.clone(proc), function (err, clu) {
        if (err) return cb(err);
        God.notify('start', clu, true);
        return cb(err, Utility.clone(clu));
      });
    });
  };

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

  God.stopProcessId = function(id, cb) {
    if (typeof id == 'object' && 'id' in id)
      id = id.id;

    if (!(id in God.clusters_db))
      return cb(God.logAndGenerateError(id + ' : id unknown'), {});

    const proc = God.clusters_db[id];

    clearTimeout(proc.pm2_env.restart_task);

    if (proc.pm2_env.status == cst.STOPPED_STATUS) {
      proc.process.pid = 0;
      return cb(null, God.getFormatedProcess(id));
    }

    if (proc.state && proc.state === 'none')
      return setTimeout(function() { God.stopProcessId(id, cb); }, 250);

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

      clearProcessMetadata(proc);
      proc.process.pid = 0;
      return cb(null, God.getFormatedProcess(id));
    });
  };

  God.resetMetaProcessId = function(id, cb) {
    const err = validateProcessId(God, id);
    if (err) return cb(err, {});

    God.clusters_db[id].pm2_env.created_at = Utility.getDate();
    God.clusters_db[id].pm2_env.unstable_restarts = 0;
    God.clusters_db[id].pm2_env.restart_time = 0;

    return cb(null, God.getFormatedProcesses());
  };

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

  God.restartProcessId = function(opts, cb) {
    const id = opts.id;
    const env = opts.env || {};

    if (typeof(id) === 'undefined')
      return cb(God.logAndGenerateError('opts.id not passed to restartProcessId', opts));
    if (!(id in God.clusters_db))
      return cb(God.logAndGenerateError('God db process id unknown'), {});

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

  God.restartProcessName = function(name, cb) {
    const processes = God.findByName(name);

    if (processes && processes.length === 0)
      return cb(God.logAndGenerateError('Unknown process'), {});

    eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      if (God.pm2_being_killed)
        return next('[Watch] PM2 is being killed, stopping restart procedure...');
      if (isProcessOnline(proc))
        return God.restartProcessId({id: proc.pm2_env.pm_id}, next);
      else if (proc.pm2_env.status !== cst.STOPPING_STATUS
               && proc.pm2_env.status !== cst.LAUNCHING_STATUS)
        return God.startProcessId(proc.pm2_env.pm_id, next);
      else
        return next(util.format('[Watch] Process name %s is being stopped so I won\'t restart it', name));
    }, function(err) {
      if (err) return cb(God.logAndGenerateError(err));
      return cb(null, God.getFormatedProcesses());
    });

    return false;
  };

  God.sendSignalToProcessId = function(opts, cb) {
    const id = opts.process_id;
    const signal = opts.signal;

    if (!(id in God.clusters_db))
      return cb(God.logAndGenerateError(id + ' id unknown'), {});

    try {
      process.kill(God.clusters_db[id].process.pid, signal);
    } catch(e) {
      return cb(God.logAndGenerateError('Error when sending signal (signal unknown)'), {});
    }
    return cb(null, God.getFormatedProcesses());
  };

  God.sendSignalToProcessName = function(opts, cb) {
    const processes = God.findByName(opts.process_name);
    const signal = opts.signal;

    if (processes && processes.length === 0)
      return cb(God.logAndGenerateError('Unknown process name'), {});

    eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      if (isProcessOnline(proc)) {
        try {
          process.kill(proc.process.pid, signal);
        } catch(e) {
          return next(e);
        }
      }
      return setTimeout(next,