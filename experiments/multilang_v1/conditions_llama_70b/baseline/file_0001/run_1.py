def set_task(callback, task):
    ''' used to notify callback plugins of context '''
    callback.task = task
    _notify_plugins(task)

def _notify_plugins(task):
    for callback_plugin in callback_plugins:
        callback_plugin.task = task