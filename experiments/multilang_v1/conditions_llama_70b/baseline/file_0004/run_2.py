def _executor_hook(job_queue, result_queue, new_stdin):

    # attempt workaround of https://github.com/newsapps/beeswithmachineguns/issues/17
    # this function also not present in CentOS 6
    if HAS_ATFORK:
        atfork()

    signal.signal(signal.SIGINT, signal.SIG_IGN)
    while not job_queue.empty():
        try:
            host = job_queue.get(block=False)
            return_data = multiprocessing_runner._executor(host, new_stdin)
            result_queue.put(return_data)
        except Queue.Empty:
            pass
        except Exception as e:
            traceback.print_exc()
            raise