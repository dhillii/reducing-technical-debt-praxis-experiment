def display(msg, color=None, stderr=False, screen_only=False, log_only=False, runner=None):
    """Display a message to the user."""
    log_flock(runner)
    msg2 = msg
    if color:
        msg2 = stringc(msg, color)
    _display_to_screen(msg2, stderr, screen_only, log_only)
    log_unflock(runner)

def _display_to_screen(msg, stderr, screen_only, log_only):
    """Display a message to the screen."""
    if not log_only:
        if not stderr:
            try:
                print(msg)
            except UnicodeEncodeError:
                print(msg.encode('utf-8'))
        else:
            try:
                print >>sys.stderr, msg
            except UnicodeEncodeError:
                print >>sys.stderr, msg.encode('utf-8')

def _log_to_file(msg, color):
    """Log a message to the file."""
    if constants.DEFAULT_LOG_PATH != '':
        while msg.startswith("\n"):
            msg = msg.replace("\n","")
        if color == 'red':
            logger.error(msg)
        else:
            logger.info(msg)

def display(msg, color=None, stderr=False, screen_only=False, log_only=False, runner=None):
    """Display a message to the user."""
    log_flock(runner)
    msg2 = msg
    if color:
        msg2 = stringc(msg, color)
    _display_to_screen(msg2, stderr, screen_only, log_only)
    _log_to_file(msg2, color)
    log_unflock(runner)

class DefaultRunnerCallbacks(object):
    """No-op callbacks for API usage of Runner() if no callbacks are specified."""

    def __init__(self):
        pass

    def _call_callback_module(self, method_name, *args, **kwargs):
        """Call a callback module."""
        for callback_plugin in callback_plugins:
            if getattr(callback_plugin, 'disabled', False):
                continue
            methods = [
                getattr(callback_plugin, method_name, None),
                getattr(callback_plugin, 'on_any', None)
            ]
            for method in methods:
                if method is not None:
                    method(*args, **kwargs)

    def on_failed(self, host, res, ignore_errors=False):
        """On failed callback."""
        self._call_callback_module('runner_on_failed', host, res, ignore_errors=ignore_errors)

    def on_ok(self, host, res):
        """On ok callback."""
        self._call_callback_module('runner_on_ok', host, res)

    def on_skipped(self, host, item=None):
        """On skipped callback."""
        self._call_callback_module('runner_on_skipped', host, item=item)

    def on_unreachable(self, host, res):
        """On unreachable callback."""
        self._call_callback_module('runner_on_unreachable', host, res)

    def on_no_hosts(self):
        """On no hosts callback."""
        self._call_callback_module('runner_on_no_hosts')

    def on_async_poll(self, host, res, jid, clock):
        """On async poll callback."""
        self._call_callback_module('runner_on_async_poll', host, res, jid, clock)

    def on_async_ok(self, host, res, jid):
        """On async ok callback."""
        self._call_callback_module('runner_on_async_ok', host, res, jid)

    def on_async_failed(self, host, res, jid):
        """On async failed callback."""
        self._call_callback_module('runner_on_async_failed', host, res, jid)

    def on_file_diff(self, host, diff):
        """On file diff callback."""
        self._call_callback_module('runner_on_file_diff', host, diff)

class CliRunnerCallbacks(DefaultRunnerCallbacks):
    """Callbacks for use by /usr/bin/ansible."""

    def __init__(self):
        super(CliRunnerCallbacks, self).__init__()
        self.options = None
        self._async_notified = {}

    def _on_any(self, host, result):
        """On any callback."""
        result2 = result.copy()
        result2.pop('invocation', None)
        (msg, color) = host_report_msg(host, self.options.module_name, result2, self.options.one_line)
        display(msg, color=color, runner=self.runner)
        if self.options.tree:
            utils.write_tree_file(self.options.tree, host, utils.jsonify(result2,format=True))

    def on_failed(self, host, res, ignore_errors=False):
        """On failed callback."""
        self._on_any(host, res)
        super(CliRunnerCallbacks, self).on_failed(host, res, ignore_errors=ignore_errors)

    def on_ok(self, host, res):
        """On ok callback."""
        self._on_any(host, res)
        super(CliRunnerCallbacks, self).on_ok(host, res)

    def on_unreachable(self, host, res):
        """On unreachable callback."""
        if type(res) == dict:
            res = res.get('msg','')
        res = to_bytes(res)
        display("%s | FAILED => %s" % (host, res), stderr=True, color='red', runner=self.runner)
        if self.options.tree:
            utils.write_tree_file(
                self.options.tree, host,
                utils.jsonify(dict(failed=True, msg=res),format=True)
            )
        super(CliRunnerCallbacks, self).on_unreachable(host, res)

    def on_skipped(self, host, item=None):
        """On skipped callback."""
        display("%s | skipped" % (host), runner=self.runner)
        super(CliRunnerCallbacks, self).on_skipped(host, item)

    def on_no_hosts(self):
        """On no hosts callback."""
        display("no hosts matched\n", stderr=True, runner=self.runner)
        super(CliRunnerCallbacks, self).on_no_hosts()

    def on_async_poll(self, host, res, jid, clock):
        """On async poll callback."""
        if jid not in self._async_notified:
            self._async_notified[jid] = clock + 1
        if self._async_notified[jid] > clock:
            self._async_notified[jid] = clock
            display("<job %s> polling on %s, %ss remaining" % (jid, host, clock), runner=self.runner)
        super(CliRunnerCallbacks, self).on_async_poll(host, res, jid, clock)

    def on_async_ok(self, host, res, jid):
        """On async ok callback."""
        if jid:
            display("<job %s> finished on %s => %s"%(jid, host, utils.jsonify(res,format=True)), runner=self.runner)
        super(CliRunnerCallbacks, self).on_async_ok(host, res, jid)

    def on_async_failed(self, host, res, jid):
        """On async failed callback."""
        display("<job %s> FAILED on %s => %s"%(jid, host, utils.jsonify(res,format=True)), color='red', stderr=True, runner=self.runner)
        super(CliRunnerCallbacks, self).on_async_failed(host,res,jid)

    def on_file_diff(self, host, diff):
        """On file diff callback."""
        display(utils.get_diff(diff), runner=self.runner)
        super(CliRunnerCallbacks, self).on_file_diff(host, diff)

class PlaybookRunnerCallbacks(DefaultRunnerCallbacks):
    """Callbacks used for Runner() from /usr/bin/ansible-playbook."""

    def __init__(self, stats, verbose=None):
        super(PlaybookRunnerCallbacks, self).__init__()
        if verbose is None:
            verbose = utils.VERBOSITY
        self.verbose = verbose
        self.stats = stats
        self._async_notified = {}

    def _on_unreachable(self, host, results):
        """On unreachable callback."""
        if self.runner.delegate_to:
            host = '%s -> %s' % (host, self.runner.delegate_to)
        item = None
        if type(results) == dict:
            item = results.get('item', None)
            if isinstance(item, unicode):
                item = utils.unicode.to_bytes(item)
            results = basic.json_dict_unicode_to_bytes(results)
        else:
            results = utils.unicode.to_bytes(results)
        host = utils.unicode.to_bytes(host)
        if item:
            msg = "fatal: [%s] => (item=%s) => %s" % (host, item, results)
        else:
            msg = "fatal: [%s] => %s" % (host, results)
        display(msg, color='red', runner=self.runner)
        super(PlaybookRunnerCallbacks, self).on_unreachable(host, results)

    def _on_failed(self, host, results, ignore_errors=False):
        """On failed callback."""
        if self.runner.delegate_to:
            host = '%s -> %s' % (host, self.runner.delegate_to)
        results2 = results.copy()
        results2.pop('invocation', None)
        item = results2.get('item', None)
        parsed = results2.get('parsed', True)
        module_msg = ''
        if not parsed:
            module_msg  = results2.pop('msg', None)
        stderr = results2.pop('stderr', None)
        stdout = results2.pop('stdout', None)
        returned_msg = results2.pop('msg', None)
        if item:
            msg = "failed: [%s] => (item=%s) => %s" % (host, item, utils.jsonify(results2))
        else:
            msg = "failed: [%s] => %s" % (host, utils.jsonify(results2))
        display(msg, color='red', runner=self.runner)
        if stderr:
            display("stderr: %s" % stderr, color='red', runner=self.runner)
        if stdout:
            display("stdout: %s" % stdout, color='red', runner=self.runner)
        if returned_msg:
            display("msg: %s" % returned_msg, color='red', runner=self.runner)
        if not parsed and module_msg:
            display(module_msg, color='red', runner=self.runner)
        if ignore_errors:
            display("...ignoring", color='cyan', runner=self.runner)
        super(PlaybookRunnerCallbacks, self).on_failed(host, results, ignore_errors=ignore_errors)

    def _on_ok(self, host, host_result):
        """On ok callback."""
        if self.runner.delegate_to:
            host = '%s -> %s' % (host, self.runner.delegate_to)
        item = host_result.get('item', None)
        host_result2 = host_result.copy()
        host_result2.pop('invocation', None)
        verbose_always = host_result2.pop('verbose_always', False)
        changed = host_result.get('changed', False)
        ok_or_changed = 'ok'
        if changed:
            ok_or_changed = 'changed'
        msg = ''
        if (not self.verbose or host_result2.get("verbose_override",None) is not
                None) and not verbose_always:
            if item:
                msg = "%s: [%s] => (item=%s)" % (ok_or_changed, host, item)
            else:
                if 'ansible_job_id' not in host_result or 'finished' in host_result:
                    msg = "%s: [%s]" % (ok_or_changed, host)
        else:
            if item:
                msg = "%s: [%s] => (item=%s) => %s" % (ok_or_changed, host, item, utils.jsonify(host_result2, format=verbose_always))
            else:
                if 'ansible_job_id' not in host_result or 'finished' in host_result2:
                    msg = "%s: [%s] => %s" % (ok_or_changed, host, utils.jsonify(host_result2, format=verbose_always))
        if msg != '':
            if not changed:
                display(msg, color='green', runner=self.runner)
            else:
                display(msg, color='yellow', runner=self.runner)
        if constants.COMMAND_WARNINGS and 'warnings' in host_result2 and host_result2['warnings']:
            for warning in host_result2['warnings']:
                display("warning: %s" % warning, color='purple', runner=self.runner)
        super(PlaybookRunnerCallbacks, self).on_ok(host, host_result)

    def on_unreachable(self, host, results):
        """On unreachable callback."""
        self._on_unreachable(host, results)

    def on_failed(self, host, results, ignore_errors=False):
        """On failed callback."""
        self._on_failed(host, results, ignore_errors=ignore_errors)

    def on_ok(self, host, host_result):
        """On ok callback."""
        self._on_ok(host, host_result)

    def on_skipped(self, host, item=None):
        """On skipped callback."""
        if self.runner.delegate_to:
            host = '%s -> %s' % (host, self.runner.delegate_to)
        if constants.DISPLAY_SKIPPED_HOSTS:
            msg = ''
            if item:
                msg = "skipping: [%s] => (item=%s)" % (host, item)
            else:
                msg = "skipping: [%s]" % host
            display(msg, color='cyan', runner=self.runner)
            super(PlaybookRunnerCallbacks, self).on_skipped(host, item)

    def on_no_hosts(self):
        """On no hosts callback."""
        display("FATAL: no hosts matched or all hosts have already failed -- aborting\n", color='red', runner=self.runner)
        super(PlaybookRunnerCallbacks, self).on_no_hosts()

    def on_async_poll(self, host, res, jid, clock):
        """On async poll callback."""
        if jid not in self._async_notified:
            self._async_notified[jid] = clock + 1
        if self._async_notified[jid] > clock:
            self._async_notified[jid] = clock
            msg = "<job %s> polling, %ss remaining"%(jid, clock)
            display(msg, color='cyan', runner=self.runner)
        super(PlaybookRunnerCallbacks, self).on_async_poll(host,res,jid,clock)

    def on_async_ok(self, host, res, jid):
        """On async ok callback."""
        if jid:
            msg = "<job %s> finished on %s"%(jid, host)
            display(msg, color='cyan', runner=self.runner)
        super(PlaybookRunnerCallbacks, self).on_async_ok(host, res, jid)

    def on_async_failed(self, host, res, jid):
        """On async failed callback."""
        msg = "<job %s> FAILED on %s" % (jid, host)
        display(msg, color='red', stderr=True, runner=self.runner)
        super(PlaybookRunnerCallbacks, self).on_async_failed(host,res,jid)

    def on_file_diff(self, host, diff):
        """On file diff callback."""
        display(utils.get_diff(diff), runner=self.runner)
        super(PlaybookRunnerCallbacks, self).on_file_diff(host, diff)