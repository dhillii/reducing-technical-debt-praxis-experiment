NO_TAGS_ERROR_MESSAGE = 'No tags'

class CanvasWidget(object):
    # ...

    def bbox(self):
        """
        :return: A bounding box for this ``CanvasWidget``. The bounding
            box is a tuple of four coordinates, *(xmin, ymin, xmax, ymax)*,
            for a rectangle which encloses all of the canvas
            widget's graphical elements.  Bounding box coordinates are
            specified with respect to the coordinate space of the ``Canvas``.
        :rtype: tuple(int, int, int, int)
        """
        if self.__hidden: return (0,0,0,0)
        if len(self.tags()) == 0: raise ValueError(NO_TAGS_ERROR_MESSAGE)
        return self.__canvas.bbox(*self.tags())

    def width(self):
        """
        :return: The width of this canvas widget's bounding box, in
            its ``Canvas``'s coordinate space.
        :rtype: int
        """
        if len(self.tags()) == 0: raise ValueError(NO_TAGS_ERROR_MESSAGE)
        bbox = self.__canvas.bbox(*self.tags())
        return bbox[2]-bbox[0]

    def height(self):
        """
        :return: The height of this canvas widget's bounding box, in
            its ``Canvas``'s coordinate space.
        :rtype: int
        """
        if len(self.tags()) == 0: raise ValueError(NO_TAGS_ERROR_MESSAGE)
        bbox = self.__canvas.bbox(*self.tags())
        return bbox[3]-bbox[1]