class ChartView(object):
    # ...

    _CHART_LEVEL_SIZE = 40

    def __init__(self, chart, root=None, **kw):
        # ...
        self._chart_level_size = self._CHART_LEVEL_SIZE
        # ...

    def view_edge(self, edge):
        level = None
        for i in range(len(self._edgelevels)):
            if edge in self._edgelevels[i]:
                level = i
                break
        if level is None: return
        # Try to view the new edge..
        y = (level+1) * self._chart_level_size
        dy = self._text_height + 10
        self._chart_canvas.yview('moveto', 1.0)
        if self._chart_height != 0:
            self._chart_canvas.yview('moveto',
                                     (y-dy)/self._chart_height)