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

module.exports = function(God) {
  // Helper: Create empty monitoring statistics
  const createEmptyMonitStats = () => ({
    memory: 0,
    cpu: 0
  });

  // Helper: Apply monitoring statistics to process
  const applyMonitStats = (pro, statistics) => {
    if (!filterBadProcess(pro)) {
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
  };

  // Helper: Handle pidusage errors and return empty stats
  const handlePidUsageError = (processes, cb) => {
    return cb(null, processes.map(pro => {
      pro['monit'] = createEmptyMonitStats();
      return pro;
    }));
  };

  God.getMonitorData = function getMonitorData(env, cb) {
    const processes = God.getFormatedProcesses();
    const pids = processes.filter(filterBadProcess)
      .map(pro => getProcessId(pro));

    if (pids.length === 0) {
      return handlePidUsageError(processes, cb);
    }

    pidusage(pids, function retPidUsage(err, statistics) {
      if (err) {
        console.error('Error caught while calling pidusage');
        console.error(err);
        return handlePidUsageError(processes, cb);
      }

      if (!statistics) {
        console.error('Statistics is not defined!');
        return handlePidUsageError(processes, cb);
      }

      const processesWithStats = processes.map(pro => applyMonitStats(pro, statistics));
      cb(null, processesWithStats);
    });
  };

  // Helper: Check if dump file should be written
  const shouldWriteDumpFile = (processList) => processList.length > 0;

  // Helper: Backup existing dump file
  const backupDumpFile = () => {
    try {
      if (fs.existsSync(cst.DUMP_FILE_PATH)) {
        fs.writeFileSync(cst.DUMP_BACKUP_FILE_PATH, fs.readFileSync(cst.DUMP_FILE_PATH));
      }
    } catch (e) {
      console.error(e.stack || e);
    }
  };

  // Helper: Write dump file with error recovery
  const writeDumpFile = (processList) => {
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
  };

  // Helper: Handle empty process list case
  const handleEmptyProcessList = (processList, that, cb) => {
    if (processList.length === 0) {
      if (!fs.existsSync(cst.DUMP_FILE_PATH) && typeof that.clearDump === 'function') {
        that.clearDump(function(){});
      }
      return cb(null, {success: true, process_list: processList});
    }
  };

  // Helper: Recursively save processes to dump file
  const saveProcessesToDump = (apps, processList) => {
    if (!apps[0]) {
      return processList;
    }

    const app = apps[0];
    delete app.pm2_env.instances;
    delete app.pm2_env.pm_id;

    if (!app.pm2_env.pmx_module) {
      processList.push(app.pm2_env);
    }

    apps.shift();
    return saveProcessesToDump(apps, processList);
  };

  God.dumpProcessList = function(cb) {
    const processList = [];
    const apps = Utility.clone(God.getFormatedProcesses());
    const that = this;

    if (!apps[0]) {
      debug('[PM2] Did not override dump file because list of processes is empty');
      return cb(null, {success: true, process_list: processList});
    }

    const finalProcessList = saveProcessesToDump(apps, processList);

    const emptyCheckResult = handleEmptyProcessList(finalProcessList, that, cb);
    if (emptyCheckResult !== undefined) {
      return emptyCheckResult;
    }

    backupDumpFile();
    writeDumpFile(finalProcessList);

    return cb(null, {success: true, process_list: finalProcessList});
  };

  God.ping = function(env, cb) {
    return cb(null, {msg : 'pong'});
  };

  God.notifyKillPM2 = function() {
    God.pm2_being_killed = true;
  };

  // Helper: Validate process exists and has pm2_env
  const validateProcessExists = (id, cb) => {
    if (!(id in God.clusters_db)) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env) {
      return cb(God.logAndGenerateError('Error when getting proc || proc.pm2_env'), {});
    }

    return null;
  };

  God.duplicateProcessId = function(id, cb) {
    const validationError = validateProcessExists(id, cb);
    if (validationError !== null) return validationError;

    const proc = Utility.clone(God.clusters_db[id].pm2_env);

    delete proc.created_at;
    delete proc.pm_id;
    delete proc.unique_id;
    proc.unique_id = Utility.generateUUID();

    God.injectVariables(proc, function inject (_err, proc) {
      return God.executeApp(Utility.clone(proc), function (err, clu) {
        if (err) return cb(err);
        God.notify('start', clu, true);
        return cb(err, Utility.clone(clu));
      });
    });
  };

  // Helper: Check if process is already running
  const isProcessRunning = (proc) => {
    return proc.pm2_env.status === cst.ONLINE_STATUS ||
           proc.pm2_env.status === cst.LAUNCHING_STATUS ||
           (proc.process && proc.process.pid);
  };

  God.startProcessId = function(id, cb) {
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

    return God.executeApp(God.clusters_db[id].pm2_env, function(err, proc) {
      return cb(err, Utility.clone(proc));
    });
  };

  // Helper: Handle process already stopped case
  const handleAlreadyStopped = (proc, id, cb) => {
    proc.process.pid = 0;
    return cb(null, God.getFormatedProcess(id));
  };

  // Helper: Handle process not yet online case
  const handleNotOnline = (id, cb) => {
    return setTimeout(function() { God.stopProcessId(id, cb); }, 250);
  };

  // Helper: Handle process without PID
  const handleNoPid = (proc, cb) => {
    console.error('app=%s id=%d does not have a pid', proc.pm2_env.name, proc.pm2_env.pm_id);
    proc.pm2_env.status = cst.STOPPED_STATUS;
    return cb(null, { error : true, message : 'could not kill process w/o pid'});
  };

  // Helper: Handle kill timeout error
  const handleKillTimeout = (proc, id, cb) => {
    console.error('app=%s id=%d pid=%s could not be stopped',
                  proc.pm2_env.name,
                  proc.pm2_env.pm_id,
                  proc.process.pid);
    proc.pm2_env.status = cst.ERRORED_STATUS;
    return cb(null, God.getFormatedProcess(id));
  };

  // Helper: Clean up process metadata
  const cleanupProcessMetadata = (proc, id) => {
    if (proc.pm2_env.pm_id.toString().indexOf('_old_') !== 0) {
      try {
        fs.unlinkSync(proc.pm2_env.pm_pid_path);
      } catch (e) {}
    }

    if (proc.pm2_env.axm_actions) proc.pm2_env.axm_actions = [];
    if (proc.pm2_env.axm_monitor) proc.pm2_env.axm_monitor = {};

    proc.process.pid = 0;
  };

  God.stopProcessId = function(id, cb) {
    if (typeof id === 'object' && 'id' in id) {
      id = id.id;
    }

    if (!(id in God.clusters_db)) {
      return cb(God.logAndGenerateError(id + ' : id unknown'), {});
    }

    const proc = God.clusters_db[id];

    clearTimeout(proc.pm2_env.restart_task);

    if (proc.pm2_env.status === cst.STOPPED_STATUS) {
      return handleAlreadyStopped(proc, id, cb);
    }

    if (proc.state && proc.state === 'none') {
      return handleNotOnline(id, cb);
    }

    console.log('Stopping app:%s id:%s', proc.pm2_env.name, proc.pm2_env.pm_id);
    proc.pm2_env.status = cst.STOPPING_STATUS;

    if (!proc.process.pid) {
      return handleNoPid(proc, cb);
    }

    God.killProcess(proc.process.pid, proc.pm2_env, function(err) {
      proc.pm2_env.status = cst.STOPPED_STATUS;
      God.notify('exit', proc);

      if (err && err.type && err.type === 'timeout') {
        return handleKillTimeout(proc, id, cb);
      }

      cleanupProcessMetadata(proc, id);
      return cb(null, God.getFormatedProcess(id));
    });
  };

  God.resetMetaProcessId = function(id, cb) {
    const validationError = validateProcessExists(id, cb);
    if (validationError !== null) return validationError;

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

      if (Object.keys(God.clusters_db).length === 0) {
        God.next_id = 0;
      }

      return cb(null, proc);
    });

    return false;
  };

  // Helper: Handle restart when PM2 is being killed
  const handleRestartWhileKilling = (cb) => {
    return cb(God.logAndGenerateError('[RestartProcessId] PM2 is being killed, stopping restart procedure...'));
  };

  // Helper: Restart online process
  const restartOnlineProcess = (id, proc, cb) => {
    God.stopProcessId(id, function(err) {
      if (God.pm2_being_killed) {
        return handleRestartWhileKilling(cb);
      }

      proc.pm2_env.restart_time += 1;
      return God.startProcessId(id, cb);
    });
  };

  God.restartProcessId = function(opts, cb) {
    const id = opts.id;
    const env = opts.env || {};

    if (typeof(id) === 'undefined') {
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
      return handleRestartWhileKilling(cb);
    }

    if (proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS) {
      restartOnlineProcess(id, proc, cb);
      return false;
    } else {
      debug('[restart] process not online, starting it');
      return God.startProcessId(id, cb);
    }
  };

  // Helper: Process single restart action
  const processRestartAction = (proc, name, next) => {
    if (God.pm2_being_killed) {
      return next('[Watch] PM2 is being killed, stopping restart procedure...');
    }

    if (proc.pm2_env.status === cst.ONLINE_STATUS) {
      return God.restartProcessId({id: proc.pm2_env.pm_id}, next);
    } else if (proc.pm2_env.status !== cst.STOPPING_STATUS &&
               proc.pm2_env.status !== cst.LAUNCHING_STATUS) {
      return God.startProcessId(proc.pm2_env.pm_id, next);
    } else {
      return next(util.format('[Watch] Process name %s is being stopped so I won\'t restart it', name));
    }
  };

  God.restartProcessName = function(name, cb) {
    const processes = God.findByName(name);

    if (processes && processes.length === 0) {
      return cb(God.logAndGenerateError('Unknown process'), {});
    }

    eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      processRestartAction(proc, name, next);
    }, function(err) {
      if (err) return cb(God.logAndGenerateError(err));
      return cb(null, God.getFormatedProcesses());
    });

    return false;
  };

  God.sendSignalToProcessId = function(opts, cb) {
    const id = opts.process_id;
    const signal = opts.signal;

    if (!(id in God.clusters_db)) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    try {
      process.kill(God.clusters_db[id].process.pid, signal);
    } catch(e) {
      return cb(God.logAndGenerateError('Error when sending signal (signal unknown)'), {});
    }

    return cb(null, God.getFormatedProcesses());
  };

  // Helper: Send signal to single process
  const sendSignalToProcess = (proc, signal, next) => {
    if (proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS) {
      try {
        process.kill(proc.process.pid, signal);
      } catch(e) {
        return next(e);
      }
    }

    return setTimeout(next, 200);
  };

  God.sendSignalToProcessName = function(opts, cb) {
    const processes = God.findByName(opts.process_name);
    const signal = opts.signal;

    if (processes && processes.length === 0) {
      return cb(God.logAndGenerateError('Unknown process name'), {});
    }

    eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      sendSignalToProcess(proc, signal, next);
    }, function(err) {
      if (err) return cb(God.logAndGenerateError(err), {});
      return cb(null, God.getFormatedProcesses());
    });
  };

  // Helper: Disable watch for all processes
  const disableWatchAll = () => {
    const processes = God.getFormatedProcesses();

    processes.forEach(function(proc) {
      God.clusters_db[proc.pm_id].pm2_env.watch = false;
      God.watch.disable(proc.pm2_env);
    });
  };

  // Helper: Disable watch for specific process
  const disableWatchForProcess = (method, value) => {
    let env = null;

    if (method.indexOf('ProcessId') !== -1) {
      env = God.clusters_db[value];
    } else if (method.indexOf('ProcessName') !== -1) {
      env = God.clusters_db[God.findByName(value)];
    }

    if (env) {
      God.watch.disable(env.pm2_env);
      env.pm2_env.watch = false;
    }
  };

  God.stopWatch = function(method, value, fn) {
    if (method === 'stopAll' || method === 'deleteAll') {
      disableWatchAll();
    } else {
      disableWatchForProcess(method, value);
    }

    return fn(null, {success: true});
  };

  // Helper: Get environment for watch toggle
  const getEnvForWatchToggle = (method, value) => {
    if (method === 'restartProcessId') {
      return God.clusters_db[value.id];
    } else if (method === 'restartProcessName') {
      return God.clusters_db[God.findByName(value)];
    }

    return null;
  };

  God.toggleWatch = function(method, value, fn) {
    const env = getEnvForWatchToggle(method, value);

    if (env) {
      env.pm2_env.watch = !env.pm2_env.watch;

      if (env.pm2_env.watch) {
        God.watch.enable(env.pm2_env);
      } else {
        God.watch.disable(env.pm2_env);
      }
    }

    return fn(null, {success: true});
  };

  God.startWatch = function(method, value, fn) {
    const env = getEnvForWatchToggle(method, value);

    if (env) {
      if (env.pm2_env.watch) {
        return fn(null, {success: true, notrestarted: true});
      }

      God.watch.enable(env.pm2_env);
      env.pm2_env.watch = true;
    }

    return fn(null, {success: true});
  };

  // Helper: Reload logs for cluster mode process
  const reloadClusterModeLogs = (cluster) => {
    try {
      cluster.send({
        type: 'log:reload'
      });
    } catch(e) {
      console.error(e.message || e);
    }
  };

  // Helper: Reload logs for fork mode process
  const reloadForkModeLogs = (cluster) => {
    if (cluster._reloadLogs) {
      cluster._reloadLogs(function(err) {
        if (err) God.logAndGenerateError(err);
      });
    }
  };

  God.reloadLogs = function(opts, cb) {
    console.log('Reloading logs...');
    const processIds = Object.keys(God.clusters_db);

    processIds.forEach(function (id) {
      const cluster = God.clusters_db[id];

      console.log('Reloading logs for process id %d', id);

      if (cluster && cluster.pm2_env) {
        if (cluster.send && cluster.pm2_env.exec_mode === 'cluster_mode') {
          reloadClusterModeLogs(cluster);
        } else {
          reloadForkModeLogs(cluster);
        }
      }
    });

    return cb(null, {});
  };

  // Helper: Validate stdin packet
  const validateStdinPacket = (packet, cb) => {
    if (typeof(packet.pm_id) === 'undefined' || !packet.line) {
      return cb(God.logAndGenerateError('pm_id or line field missing'), {});
    }

    return null;
  };

  // Helper: Validate process for stdin operation
  const validateProcessForStdin = (proc, pm_id, cb) => {
    if (!proc) {
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> unknown.'), {});
    }

    if (proc.pm2_env.exec_mode === 'cluster_mode') {
      return cb(God.logAndGenerateError('Cannot send line to processes in cluster mode'), {});
    }

    if (proc.pm2_env.status !== cst.ONLINE_STATUS && proc.pm2_env.status !== cst.LAUNCHING_STATUS) {
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> offline.'), {});
    }

    return null;
  };

  God.sendLineToStdin = function(packet, cb) {
    const validationError = validateStdinPacket(packet, cb);
    if (validationError !== null) return validationError;

    const pm_id = packet.pm_id;
    const line = packet.line;
    const proc = God.clusters_db[pm_id];

    const procValidationError = validateProcessForStdin(proc, pm_id, cb);
    if (procValidationError !== null) return procValidationError;

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

  // Helper: Validate data packet
  const validateDataPacket = (packet, cb) => {
    if (typeof(packet.id) === 'undefined' ||
        typeof(packet.data) === 'undefined' ||
        !packet.topic) {
      return cb(God.logAndGenerateError('ID, DATA or TOPIC field is missing'), {});
    }

    return null;
  };

  // Helper: Validate process for data operation
  const validateProcessForData = (proc, pm_id, cb) => {
    if (!proc) {
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> unknown.'), {});
    }

    if (proc.pm2_env.status !== cst.ONLINE_STATUS && proc.pm2_env.status !== cst.LAUNCHING_STATUS) {
      return cb(God.logAndGenerateError('Process with ID <' + pm_id + '> offline.'), {});
    }

    return null;
  };

  God.sendDataToProcessId = function(packet, cb) {
    const validationError = validateDataPacket(packet, cb);
    if (validationError !== null) return validationError;

    const pm_id = packet.id;
    const proc = God.clusters_db[pm_id];

    const procValidationError = validateProcessForData(proc, pm_id, cb);
    if (procValidationError !== null) return procValidationError;

    try {
      proc.send(packet);
    } catch(e) {
      return cb(God.logAndGenerateError(e), {});
    }

    return cb(null, {
      success: true,
      data   : packet
    });
  };

  // Helper: Validate message command
  const validateMsgCommand = (cmd, cb) => {
    if (!('id' in cmd) && !('name' in cmd)) {
      return cb(God.logAndGenerateError('method requires name or id field'), {});
    }

    return null;
  };

  // Helper: Find action in process
  const findAction = (proc, actionName) => {
    return proc.pm2_env.axm_actions.find(action => action.action_name === actionName);
  };

  // Helper: Send message to process by ID
  const msgProcessById = (cmd, cb) => {
    const id = cmd.id;

    if (!(id in God.clusters_db)) {
      return cb(God.logAndGenerateError(id + ' id unknown'), {});
    }

    const proc = God.clusters_db[id];
    const action = findAction(proc, cmd.msg);

    if (!action) {
      return cb(God.logAndGenerateError('Action doesn\'t exist ' + cmd.msg + ' for ' + proc.pm2_env.name), {});
    }

    action.output = [];

    if (proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS) {
      if (cmd.opts === null && !cmd.uuid) {
        proc.send(cmd.msg);
      } else {
        proc.send(cmd);
      }

      return cb(null, { process_count : 1, success : true });
    } else {
      return cb(God.logAndGenerateError(id + ' : id offline'), {});
    }
  };

  // Helper: Check if process matches name criteria
  const processMatchesName = (proc_env, name) => {
    return (p.basename(proc_env.pm_exec_path) === name ||
            proc_env.name === name ||
            proc_env.namespace === name ||
            name === 'all') &&
           (proc_env.status === cst.ONLINE_STATUS ||
            proc_env.status === cst.LAUNCHING_STATUS);
  };

  // Helper: Send message to process by name (recursive)
  const msgProcessByName = (cmd, cb) => {
    const name = cmd.name;
    const arr = Object.keys(God.clusters_db);
    let sent = 0;

    const processArray = (arr) => {
      if (!arr[0]) {
        return cb(null, {
          process_count : sent,
          success : true
        });
      }

      const id = arr[0];

      if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env) {
        arr.shift();
        return processArray(arr);
      }

      const proc_env = God.clusters_db[id].pm2_env;
      const action = findAction(God.clusters_db[id], cmd.msg);

      if (!action) {
        arr.shift();
        return processArray(arr);
      }

      if (processMatchesName(proc_env, name)) {
        if (proc_env.axm_actions.length === 0) {
          arr.shift();
          return processArray(arr);
        }

        if (cmd.opts === null) {
          God.clusters_db[id].send(cmd.msg);
        } else {
          God.clusters_db[id].send(cmd);
        }

        sent++;
      }

      arr.shift();
      return processArray(arr);
    };

    return processArray(arr);
  };

  God.msgProcess = function(cmd, cb) {
    const validationError = validateMsgCommand(cmd, cb);
    if (validationError !== null) return validationError;

    if ('id' in cmd) {
      return msgProcessById(cmd, cb);
    } else if ('name' in cmd) {
      return msgProcessByName(cmd, cb);
    }

    return false;
  };

  God.getVersion = function(env, cb) {
    process.nextTick(function() {
      return cb(null, pkg.version);
    });
  };

  God.monitor = function Monitor(pm_id, cb) {
    if (!God.clusters_db[pm_id] || !God.clusters_db[pm_id].pm2_env) {
      return cb(new Error('Unknown pm_id'));
    }

    God.clusters_db[pm_id].pm2_env._km_monitored = true;
    return cb(null, { success : true, pm_id : pm_id });
  };

  God.unmonitor = function Monitor(pm_id, cb) {
    if (!God.clusters_db[pm_id] || !God.clusters_db[pm_id].pm2_env) {
      return cb(new Error('Unknown pm_id'));
    }

    God.clusters_db[pm_id].pm2_env._km_monitored = false;
    return cb(null, { success : true, pm_id : pm_id });
  };

  God.getReport = function(arg, cb) {
    const report = {
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

    if (process.versions && process.versions.node) {
      report.node_version = process.versions.node;
    }

    process.nextTick(function() {
      return cb(null, report);
    });
  };
};

// Helper: Filter processes that are online and have valid PIDs
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

// Helper: Extract process ID from process object
function getProcessId(pro) {
  let pid = pro.pid;

  if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
    pid = pro.pm2_env.axm_options.pid;
  }

  return pid;
}