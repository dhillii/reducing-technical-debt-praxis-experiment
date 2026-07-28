def set_task(callback, task):
    ''' used to notify callback plugins of context '''
    callback.task = task
    _notify_plugins('task', task)

def _notify_plugins(attr, value):
    for callback_plugin in callback_plugins:
        setattr(callback_plugin, attr, value)