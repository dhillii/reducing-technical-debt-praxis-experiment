def notify(self, event, ids=[]):
    'Notify all listeners'
    for listener in self.listeners:
        try:
            listener(event, ids)
        except Exception as e:
            traceback.print_exc()
            continue