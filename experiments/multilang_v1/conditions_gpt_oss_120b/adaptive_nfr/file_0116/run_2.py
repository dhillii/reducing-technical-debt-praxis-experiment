# Natural Language Toolkit: Drawing utilities
#
# Copyright (C) 2001-2015 NLTK Project
# Author: Edward Loper <edloper@gmail.com>
# URL: <http://nltk.org/>
# For license information, see LICENSE.TXT

"""
Tools for graphically displaying and interacting with the objects and
processing classes defined by the Toolkit.  These tools are primarily
intended to help students visualize the objects that they create.

The graphical tools are typically built using "canvas widgets", each
of which encapsulates the graphical elements and bindings used to
display a complex object on a Tkinter ``Canvas``.  For example, NLTK
defines canvas widgets for displaying trees and directed graphs, as
well as a number of simpler widgets.  These canvas widgets make it
easier to build new graphical tools and demos.  See the class
documentation for ``CanvasWidget`` for more information.

The ``nltk.draw`` module defines the abstract ``CanvasWidget`` base
class, and a number of simple canvas widgets.  The remaining canvas
widgets are defined by submodules, such as ``nltk.draw.tree``.

The ``nltk.draw`` module also defines ``CanvasFrame``, which
encapsulates a ``Canvas`` and its scrollbars.  It uses a
``ScrollWatcherWidget`` to ensure that all canvas widgets contained on
its canvas are within the scroll region.

Acknowledgements: Many of the ideas behind the canvas widget system
are derived from ``CLIG``, a Tk-based grapher for linguistic data
structures.  For more information, see the CLIG
homepage (http://www.ags.uni-sb.de/~konrad/clig.html).

"""


import nltk.compat
from tkinter import (Button, Canvas, Entry, Frame, Label, Menu, Menubutton,
                     RAISED, Scrollbar, StringVar, Text, Tk, Toplevel, Widget)

import tkinter.font, tkinter.messagebox, tkinter.filedialog

from nltk.util import in_idle

##//////////////////////////////////////////////////////
##  CanvasWidget
##//////////////////////////////////////////////////////

class CanvasWidget(object):
    """
    A collection of graphical elements and bindings used to display a
    complex object on a Tkinter ``Canvas``.  A canvas widget is
    responsible for managing the ``Canvas`` tags and callback bindings
    necessary to display and interact with the object.  Canvas widgets
    are often organized into hierarchies, where parent canvas widgets
    control aspects of their child widgets.

    Each canvas widget is bound to a single ``Canvas``.  This ``Canvas``
    is specified as the first argument to the ``CanvasWidget``'s
    constructor.

    Attributes.  Each canvas widget can support a variety of
    "attributes", which control how the canvas widget is displayed.
    Some typical examples attributes are ``color``, ``font``, and
    ``radius``.  Each attribute has a default value.  This default
    value can be overridden in the constructor, using keyword
    arguments of the form ``attribute=value``:

        >>> from nltk.draw.util import TextWidget
        >>> cn = TextWidget(c, 'test', color='red')

    Attribute values can also be changed after a canvas widget has
    been constructed, using the ``__setitem`` operator:

        >>> cn['font'] = 'times'

    The current value of an attribute value can be queried using the
    ``__getitem`` operator:

        >>> cn['color']
        red

    For a list of the attributes supported by a type of canvas widget,
    see its class documentation.

    Interaction.  The attribute ``'draggable'`` controls whether
    the user can drag a canvas widget around the canvas.  By default,
    canvas widgets are not draggable.

    ``CanvasWidget`` provides callback support for two types of user
    interaction: clicking and dragging.  The method ``bind_click``
    registers a callback function that is called whenever the canvas
    widget is clicked.  The method ``bind_drag`` registers a callback
    function that is called after the canvas widget is dragged.  If
    the user clicks or drags a canvas widget with no registered
    callback function, then the interaction event will propagate to
    its parent.  For each canvas widget, only one callback function
    may be registered for an interaction event.  Callback functions
    can be deregistered with the ``unbind_click`` and ``unbind_drag``
    methods.

    Subclassing.  ``CanvasWidget`` is an abstract class.  Subclasses
    are required to implement the following methods:

      - ``__init__``: Builds a new canvas widget.  It must perform the
        following three tasks (in order):
          - Create any new graphical elements.
          - Call ``_add_child_widget`` on each child widget.
          - Call the ``CanvasWidget`` constructor.
      - ``_tags``: Returns a list of the canvas tags for all graphical
        elements managed by this canvas widget, not including
        graphical elements managed by its child widgets.
      - ``_manage``: Arranges the child widgets of this canvas widget.
        This is typically only called when the canvas widget is
        created.
      - ``_update``: Update this canvas widget in response to a
        change in a single child.

    The ``CanvasWidget`` with no child widgets, the default
    definitions for ``_manage`` and ``_update`` may be used.

    If a subclass defines any attributes, then it should implement
    ``__getitem__`` and ``__setitem__``.  If either of these methods is
    called with an unknown attribute, then they should propagate the
    request to ``CanvasWidget``.

    Most subclasses implement a number of additional methods that
    modify the ``CanvasWidget`` in some way.  These methods must call
    ``parent.update(self)`` after making any changes to the canvas
    widget's graphical elements.  The canvas widget must also call
    ``parent.update(self)`` after changing any attribute value that
    affects the shape or position of the canvas widget's graphical
    elements.

    :type __canvas: Tkinter.Canvas
    :ivar __canvas: This ``CanvasWidget``'s canvas.

    :type __parent: CanvasWidget or None
    :ivar __parent: This ``CanvasWidget``'s hierarchical parent widget.
    :type __children: list(CanvasWidget)
    :ivar __children: This ``CanvasWidget``'s hierarchical child widgets.

    :type __updating: bool
    :ivar __updating: Is this canvas widget currently performing an
        update?  If it is, then it will ignore any new update requests
        from child widgets.

    :type __draggable: bool
    :ivar __draggable: Is this canvas widget draggable?
    :type __press: event
    :ivar __press: The ButtonPress event that we're currently handling.
    :type __drag_x: int
    :ivar __drag_x: Where it's been moved to (to find dx)
    :type __drag_y: int
    :ivar __drag_y: Where it's been moved to (to find dy)
    :type __callbacks: dictionary
    :ivar __callbacks: Registered callbacks.  Currently, four keys are
        used: ``1``, ``2``, ``3``, and ``'drag'``.  The values are
        callback functions.  Each callback function takes a single
        argument, which is the ``CanvasWidget`` that triggered the
        callback.
    """
    _NO_TAGS_ERROR = 'No tags'

    def __init__(self, canvas, parent=None, **attribs):
        """
        Create a new canvas widget.  This constructor should only be
        called by subclass constructors; and it should be called only
        "after" the subclass has constructed all graphical canvas
        objects and registered all child widgets.

        :param canvas: This canvas widget's canvas.
        :type canvas: Tkinter.Canvas
        :param parent: This canvas widget's hierarchical parent.
        :type parent: CanvasWidget
        :param attribs: The new canvas widget's attributes.
        """
        if self.__class__ == CanvasWidget:
            raise TypeError('CanvasWidget is an abstract base class')

        if not isinstance(canvas, Canvas):
            raise TypeError('Expected a canvas!')

        self.__canvas = canvas
        self.__parent = parent

        # If the subclass constructor called _add_child_widget, then
        # self.__children will already exist.
        if not hasattr(self, '_CanvasWidget__children'): self.__children = []

        # Is this widget hidden?
        self.__hidden = 0

        # Update control (prevents infinite loops)
        self.__updating = 0

        # Button-press and drag callback handling.
        self.__press = None
        self.__drag_x = self.__drag_y = 0
        self.__callbacks = {}
        self.__draggable = 0

        # Set up attributes.
        for (attr, value) in list(attribs.items()): self[attr] = value

        # Manage this canvas widget
        self._manage()

        # Register any new bindings
        for tag in self._tags():
            self.__canvas.tag_bind(tag, '<ButtonPress-1>',
                                   self.__press_cb)
            self.__canvas.tag_bind(tag, '<ButtonPress-2>',
                                   self.__press_cb)
            self.__canvas.tag_bind(tag, '<ButtonPress-3>',
                                   self.__press_cb)

    ##//////////////////////////////////////////////////////
    ##  Inherited methods.
    ##//////////////////////////////////////////////////////

    def _ensure_tags(self):
        """Raise an error if this widget has no tags."""
        if len(self.tags()) == 0:
            raise ValueError(self._NO_TAGS_ERROR)

    def bbox(self):
        """
        :return: A bounding box for this ``CanvasWidget``. The bounding
            box is a tuple of four coordinates, *(xmin, ymin, xmax, ymax)*,
            for a rectangle which encloses all of the canvas
            widget's graphical elements.  Bounding box coordinates are
            specified with respect to the coordinate space of the ``Canvas``.
        :rtype: tuple(int, int, int, int)
        """
        if self.__hidden:
            return (0, 0, 0, 0)
        self._ensure_tags()
        return self.__canvas.bbox(*self.tags())

    def width(self):
        """
        :return: The width of this canvas widget's bounding box, in
            its ``Canvas``'s coordinate space.
        :rtype: int
        """
        self._ensure_tags()
        bbox = self.__canvas.bbox(*self.tags())
        return bbox[2] - bbox[0]

    def height(self):
        """
        :return: The height of this canvas widget's bounding box, in
            its ``Canvas``'s coordinate space.
        :rtype: int
        """
        self._ensure_tags()
        bbox = self.__canvas.bbox(*self.tags())
        return bbox[3] - bbox[1]

    def parent(self):
        """
        :return: The hierarchical parent of this canvas widget.
            ``self`` is considered a subpart of its parent for
            purposes of user interaction.
        :rtype: CanvasWidget or None
        """
        return self.__parent

    def child_widgets(self):
        """
        :return: A list of the hierarchical children of this canvas
            widget.  These children are considered part of ``self``
            for purposes of user interaction.
        :rtype: list of CanvasWidget
        """
        return self.__children

    def canvas(self):
        """
        :return: The canvas that this canvas widget is bound to.
        :rtype: Tkinter.Canvas
        """
        return self.__canvas

    def move(self, dx, dy):
        """
        Move this canvas widget by a given distance.  In particular,
        shift the canvas widget right by ``dx`` pixels, and down by
        ``dy`` pixels.  Both ``dx`` and ``dy`` may be negative, resulting
        in leftward or upward movement.

        :type dx: int
        :param dx: The number of pixels to move this canvas widget
            rightwards.
        :type dy: int
        :param dy: The number of pixels to move this canvas widget
            downwards.
        :rtype: None
        """
        if dx == dy == 0:
            return
        for tag in self.tags():
            self.__canvas.move(tag, dx, dy)
        if self.__parent:
            self.__parent.update(self)

    def moveto(self, x, y, anchor='NW'):
        """
        Move this canvas widget to the given location.  In particular,
        shift the canvas widget such that the corner or side of the
        bounding box specified by ``anchor`` is at location (``x``,
        ``y``).

        :param x,y: The location that the canvas widget should be moved
            to.
        :param anchor: The corner or side of the canvas widget that
            should be moved to the specified location.  ``'N'``
            specifies the top center; ``'NE'`` specifies the top right
            corner; etc.
        """
        x1, y1, x2, y2 = self.bbox()
        if anchor == 'NW':
            self.move(x - x1, y - y1)
        if anchor == 'N':
            self.move(x - x1 / 2 - x2 / 2, y - y1)
        if anchor == 'NE':
            self.move(x - x2, y - y1)
        if anchor == 'E':
            self.move(x - x2, y - y1 / 2 - y2 / 2)
        if anchor == 'SE':
            self.move(x - x2, y - y2)
        if anchor == 'S':
            self.move(x - x1 / 2 - x2 / 2, y - y2)
        if anchor == 'SW':
            self.move(x - x1, y - y2)
        if anchor == 'W':
            self.move(x - x1, y - y1 / 2 - y2 / 2)

    def destroy(self):
        """
        Remove this ``CanvasWidget`` from its ``Canvas``.  After a
        ``CanvasWidget`` has been destroyed, it should not be accessed.

        Note that you only need to destroy a top-level
        ``CanvasWidget``; its child widgets will be destroyed
        automatically.  If you destroy a non-top-level
        ``CanvasWidget``, then the entire top-level widget will be
        destroyed.

        :raise ValueError: if this ``CanvasWidget`` has a parent.
        :rtype: None
        """
        if self.__parent is not None:
            self.__parent.destroy()
            return

        for tag in self.tags():
            self.__canvas.tag_unbind(tag, '<ButtonPress-1>')
            self.__canvas.tag_unbind(tag, '<ButtonPress-2>')
            self.__canvas.tag_unbind(tag, '<ButtonPress-3>')
        self.__canvas.delete(*self.tags())
        self.__canvas = None

    def update(self, child):
        """
        Update the graphical display of this canvas widget, and all of
        its ancestors, in response to a change in one of this canvas
        widget's children.

        :param child: The child widget that changed.
        :type child: CanvasWidget
        """
        if self.__hidden or child.__hidden:
            return
        # If we're already updating, then do nothing.  This prevents
        # infinite loops when _update modifies its children.
        if self.__updating:
            return
        self.__updating = 1

        # Update this CanvasWidget.
        self._update(child)

        # Propagate update request to the parent.
        if self.__parent:
            self.__parent.update(self)

        # We're done updating.
        self.__updating = 0

    def manage(self):
        """
        Arrange this canvas widget and all of its descendants.

        :rtype: None
        """
        if self.__hidden:
            return
        for child in self.__children:
            child.manage()
        self._manage()

    def tags(self):
        """
        :return: a list of the canvas tags for all graphical
            elements.  Including
            graphical elements managed by its child widgets.
        :rtype: list of int
        """
        if self.__canvas is None:
            raise ValueError('Attempt to access a destroyed canvas widget')
        tags = []
        tags += self._tags()
        for child in self.__children:
            tags += child.tags()
        return tags

    def __setitem__(self, attr, value):
        """
        Set the value of the attribute ``attr`` to ``value``.  See the
        class documentation for a list of attributes supported by this
        canvas widget.

        :rtype: None
        """
        if attr == 'draggable':
            self.__draggable = value
        else:
            raise ValueError('Unknown attribute %r' % attr)

    def __getitem__(self, attr):
        """
        :return: the value of the attribute ``attr``.  See the
        class documentation for a list of attributes supported by this
        canvas widget.

        :rtype: (any)
        """
        if attr == 'draggable':
            return self.__draggable
        else:
            raise ValueError('Unknown attribute %r' % attr)

    def __repr__(self):
        """
        :return: a string representation of this canvas widget.
        :rtype: str
        """
        return '<%s>' % self.__class__.__name__

    def hide(self):
        """
        Temporarily hide this canvas widget.

        :rtype: None
        """
        self.__hidden = 1
        for tag in self.tags():
            self.__canvas.itemconfig(tag, state='hidden')

    def show(self):
        """
        Show a hidden canvas widget.

        :rtype: None
        """
        self.__hidden = 0
        for tag in self.tags():
            self.__canvas.itemconfig(tag, state='normal')

    def hidden(self):
        """
        :return: True if this canvas widget is hidden.
        :rtype: bool
        """
        return self.__hidden

    def __press_cb(self):
        """
        :return: a button-press callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag_cb(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click_cb(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __drag(self):
        """
        :return: a drag callback.
        :rtype: None
        """
        if self.__canvas is None:
            return

    def __click(self):
        """
        :return: a click

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return

    def __drag(self):
        :return

    def __click(self):
        :return