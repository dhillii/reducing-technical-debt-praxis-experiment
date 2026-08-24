Common deepen silence console methods to prevent accidental output.
Common.extend = function(destination, source) {
  if (typeof destination !== 'object') destination = {};
  if (!source || typeof source !== 'object') return destination;

  Object.keys(source).forEach((new_key) => {
    if (source[new_key] != '[object Object]')
      destination[new_key] = source[new_key];
  });

  return destination;
};

Common.safeExtend = function(origin, add) {
  if (!add || typeof add != 'object') return origin;

  var keysToIgnore = ['name', 'exec_mode', 'env', 'args', 'pm_cwd', 'exec_interpreter', 'pm_exec_path', 'node_args', 'pm_out_log_path', 'pm_err_log_path', 'pm_pid_path', 'pm_id', 'status', 'pm_uptime', 'created_at', 'windowsHide', 'username', 'merge_logs', 'kill_retry_time', 'prev_restart_delay', 'instance_var', 'unstable_restarts', 'restart_time', 'axm_actions', 'pmx_module', 'command', 'watch', 'filter_env', 'versioning', 'vizion_runing', 'MODULE_DEBUG', 'pmx', 'axm_options', 'created_at', 'watch', 'vizion', 'axm_dynamic', 'axm_monitor', 'instances', 'automation', 'autostart', 'autorestart', 'stop_exit_codes', 'unstable_restart', 'treekill', 'exit_code', 'vizion'];

  Object.keys(add).forEach((key) => {
    if (keysToIgnore.indexOf(key) == -1 && add[key] != '[object Object]')
      origin[key] = add[key];
  });
  return origin;
};