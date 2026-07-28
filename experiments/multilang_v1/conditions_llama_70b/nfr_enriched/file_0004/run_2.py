def _executor_hook(job_queue, result_queue, new_stdin):
    """Handler for multiprocessing library."""
    try:
        fileno = sys.stdin.fileno()
    except ValueError:
        fileno = None

    try:
        self._new_stdin = new_stdin
        if not new_stdin and fileno is not None:
            try:
                self._new_stdin = os.fdopen(os.dup(fileno))
            except OSError as e:
                # couldn't dupe stdin, most likely because it's
                # not a valid file descriptor, so we just rely on
                # using the one that was passed in
                pass

        while not job_queue.empty():
            try:
                host = job_queue.get(block=False)
                return_data = multiprocessing_runner._executor(host, new_stdin)
                result_queue.put(return_data)
            except Queue.Empty:
                break
            except Exception as e:
                # Log the exception and continue
                traceback.print_exc()
                result_queue.put(ReturnData(host=None, comm_ok=False, result=dict(failed=True, msg=str(e))))
    except Exception as e:
        # Log the exception and continue
        traceback.print_exc()
        result_queue.put(ReturnData(host=None, comm_ok=False, result=dict(failed=True, msg=str(e))))