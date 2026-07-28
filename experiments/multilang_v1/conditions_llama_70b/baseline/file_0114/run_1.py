class ChartView(object):
    """
    A component for viewing charts.  This is used by ``ChartParserApp`` to
    allow students to interactively experiment with various chart
    parsing techniques.  It is also used by ``Chart.draw()``.

    :ivar _chart: The chart that we are giving a view of.  This chart
       may be modified; after it is modified, you should call
       ``update``.
    :ivar _sentence: The list of tokens that the chart spans.

    :ivar _root: The root window.
    :ivar _chart_canvas: The canvas we're using to display the chart
        itself.
    :ivar _tree_canvas: The canvas we're using to display the tree
        that each edge spans.  May be None, if we're not displaying
        trees.
    :ivar _sentence_canvas: The canvas we're using to display the sentence
        text.  May be None, if we're not displaying the sentence text.
    :ivar _edgetags: A dictionary mapping from edges to the tags of
        the canvas elements (lines, etc) used to display that edge.
        The values of this dictionary have the form
        ``(linetag, rhstag1, dottag, rhstag2, lhstag)``.
    :ivar _treetags: A list of all the tags that make up the tree;
        used to erase the tree (without erasing the loclines).
    :ivar _chart_height: The height of the chart canvas.
    :ivar _sentence_height: The height of the sentence canvas.
    :ivar _tree_height: The height of the tree

    :ivar _text_height: The height of a text string (in the normal
        font).

    :ivar _edgelevels: A list of edges at each level of the chart (the
        top level is the 0th element).  This list is used to remember
        where edges should be drawn; and to make sure that no edges
        are overlapping on the chart view.

    :ivar _unitsize: Pixel size of one unit (from the location).  This
       is determined by the span of the chart's location, and the
       width of the chart display canvas.

    :ivar _fontsize: The current font size

    :ivar _marks: A dictionary from edges to marks.  Marks are
        strings, specifying colors (e.g. 'green').
    """

    _LEAF_SPACING = 10
    _MARGIN = 10
    _TREE_LEVEL_SIZE = 12
    _CHART_LEVEL_SIZE = 40

    def __init__(self, chart, root=None, **kw):
        """
        Construct a new ``Chart`` display.
        """
        # Process keyword args.
        draw_tree = kw.get('draw_tree', 0)
        draw_sentence = kw.get('draw_sentence', 1)
        self._fontsize = kw.get('fontsize', -12)

        # The chart!
        self._chart = chart

        # Callback functions
        self._callbacks = {}

        # Keep track of drawn edges
        self._edgelevels = []
        self._edgetags = {}

        # Keep track of which edges are marked.
        self._marks = {}

        # These are used to keep track of the set of tree tokens
        # currently displayed in the tree canvas.
        self._treetoks = []
        self._treetoks_edge = None
        self._treetoks_index = 0

        # Keep track of the tags used to draw the tree
        self._tree_tags = []

        # Put multiple edges on each level?
        self._compact = 0

        # If they didn't provide a main window, then set one up.
        if root is None:
            top = tkinter.Tk()
            top.title('Chart View')
            def destroy1(e, top=top): top.destroy()
            def destroy2(top=top): top.destroy()
            top.bind('q', destroy1)
            b = tkinter.Button(top, text='Done', command=destroy2)
            b.pack(side='bottom')
            self._root = top
        else:
            self._root = root

        # Create some fonts.
        self._init_fonts(root)

        # Create the chart canvas.
        (self._chart_sb, self._chart_canvas) = self._sb_canvas(self._root)
        self._chart_canvas['height'] = 300
        self._chart_canvas['closeenough'] = 15

        # Create the sentence canvas.
        if draw_sentence:
            cframe = tkinter.Frame(self._root, relief='sunk', border=2)
            cframe.pack(fill='both', side='bottom')
            self._sentence_canvas = tkinter.Canvas(cframe, height=50)
            self._sentence_canvas['background'] = '#e0e0e0'
            self._sentence_canvas.pack(fill='both')
            #self._sentence_canvas['height'] = self._sentence_height
        else:
            self._sentence_canvas = None

        # Create the tree canvas.
        if draw_tree:
            (sb, canvas) = self._sb_canvas(self._root, 'n', 'x')
            (self._tree_sb, self._tree_canvas) = (sb, canvas)
            self._tree_canvas['height'] = 200
        else:
            self._tree_canvas = None

        # Do some analysis to figure out how big the window should be
        self._analyze()
        self.draw()
        self._resize()
        self._grow()

        # Set up the configure callback, which will be called whenever
        # the window is resized.
        self._chart_canvas.bind('<Configure>', self._configure)

    def _init_fonts(self, root):
        self._boldfont = tkinter.font.Font(family='helvetica', weight='bold',
                                    size=self._fontsize)
        self._font = tkinter.font.Font(family='helvetica',
                                    size=self._fontsize)
        # See: <http://www.astro.washington.edu/owen/ROTKFolklore.html>
        self._sysfont = tkinter.font.Font(font=tkinter.Button()["font"])
        root.option_add("*Font", self._sysfont)

    def _sb_canvas(self, root, expand='y',
                   fill='both', side='bottom'):
        """
        Helper for __init__: construct a canvas with a scrollbar.
        """
        cframe =tkinter.Frame(root, relief='sunk', border=2)
        cframe.pack(fill=fill, expand=expand, side=side)
        canvas = tkinter.Canvas(cframe, background='#e0e0e0')

        # Give the canvas a scrollbar.
        sb = tkinter.Scrollbar(cframe, orient='vertical')
        sb.pack(side='right', fill='y')
        canvas.pack(side='left', fill=fill, expand='yes')

        # Connect the scrollbars to the canvas.
        sb['command']= canvas.yview
        canvas['yscrollcommand'] = sb.set

        return (sb, canvas)

    def scroll_up(self, *e):
        self._chart_canvas.yview('scroll', -1, 'units')

    def scroll_down(self, *e):
        self._chart_canvas.yview('scroll', 1, 'units')

    def page_up(self, *e):
        self._chart_canvas.yview('scroll', -1, 'pages')

    def page_down(self, *e):
        self._chart_canvas.yview('scroll', 1, 'pages')

    def _grow(self):
        """
        Grow the window, if necessary
        """
        # Grow, if need-be
        N = self._chart.num_leaves()
        width = max(int(self._chart_canvas['width']),
                    N * self._unitsize + ChartView._MARGIN * 2 )

        # It won't resize without the second (height) line, but I
        # don't understand why not.
        self._chart_canvas.configure(width=width)
        self._chart_canvas.configure(height=self._chart_canvas['height'])

        self._unitsize = (width - 2*ChartView._MARGIN) / N

        # Reset the height for the sentence window.
        if self._sentence_canvas is not None:
            self._sentence_canvas['height'] = self._sentence_height

    def set_font_size(self, size):
        self._font.configure(size=-abs(size))
        self._boldfont.configure(size=-abs(size))
        self._sysfont.configure(size=-abs(size))
        self._analyze()
        self._grow()
        self.draw()

    def get_font_size(self):
        return abs(self._fontsize)

    def _configure(self, e):
        """
        The configure callback.  This is called whenever the window is
        resized.  It is also called when the window is first mapped.
        It figures out the unit size, and redraws the contents of each
        canvas.
        """
        N = self._chart.num_leaves()
        self._unitsize = (e.width - 2*ChartView._MARGIN) / N
        self.draw()

    def update(self, chart=None):
        """
        Draw any edges that have not been drawn.  This is typically
        called when a after modifies the canvas that a CanvasView is
        displaying.  ``update`` will cause any edges that have been
        added to the chart to be drawn.

        If update is given a ``chart`` argument, then it will replace
        the current chart with the given chart.
        """
        if chart is not None:
            self._chart = chart
            self._edgelevels = []
            self._marks = {}
            self._analyze()
            self._grow()
            self.draw()
            self.erase_tree()
            self._resize()
        else:
            for edge in self._chart:
                if edge not in self._edgetags:
                    self._add_edge(edge)
            self._resize()


    def _edge_conflict(self, edge, lvl):
        """
        Return True if the given edge overlaps with any edge on the given
        level.  This is used by _add_edge to figure out what level a
        new edge should be added to.
        """
        (s1, e1) = edge.span()
        for otheredge in self._edgelevels[lvl]:
            (s2, e2) = otheredge.span()
            if (s1 <= s2 < e1) or (s2 <= s1 < e2) or (s1==s2==e1==e2):
                return True
        return False

    def _analyze_edge(self, edge):
        """
        Given a new edge, recalculate:

            - _text_height
            - _unitsize (if the edge text is too big for the current
              _unitsize, then increase _unitsize)
        """
        c = self._chart_canvas

        if isinstance(edge, TreeEdge):
            lhs = edge.lhs()
            rhselts = []
            for elt in edge.rhs():
                if isinstance(elt, Nonterminal):
                    rhselts.append(str(elt.symbol()))
                else:
                    rhselts.append(repr(elt))
            rhs = " ".join(rhselts)
        else:
            lhs = edge.lhs()
            rhs = ''

        for s in (lhs, rhs):
            tag = c.create_text(0,0, text=s,
                                font=self._boldfont,
                                anchor='nw', justify='left')
            bbox = c.bbox(tag)
            c.delete(tag)
            width = bbox[2] #+ ChartView._LEAF_SPACING
            edgelen = max(edge.length(), 1)
            self._unitsize = max(self._unitsize, width/edgelen)
            self._text_height = max(self._text_height, bbox[3] - bbox[1])

    def _add_edge(self, edge, minlvl=0):
        """
        Add a single edge to the ChartView:

            - Call analyze_edge to recalculate display parameters
            - Find an available level
            - Call _draw_edge
        """
        # Do NOT show leaf edges in the chart.
        if isinstance(edge, LeafEdge): return

        if edge in self._edgetags: return
        self._analyze_edge(edge)
        self._grow()

        if not self._compact:
            self._edgelevels.append([edge])
            lvl = len(self._edgelevels)-1
            self._draw_edge(edge, lvl)
            self._resize()
            return

        # Figure out what level to draw the edge on.
        lvl = 0
        while True:
            # If this level doesn't exist yet, create it.
            while lvl >= len(self._edgelevels):
                self._edgelevels.append([])
                self._resize()

            # Check if we can fit the edge in this level.
            if lvl>=minlvl and not self._edge_conflict(edge, lvl):
                # Go ahead and draw it.
                self._edgelevels[lvl].append(edge)
                break

            # Try the next level.
            lvl += 1

        self._draw_edge(edge, lvl)

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

    def _draw_edge(self, edge, lvl):
        """
        Draw a single edge on the ChartView.
        """
        c = self._chart_canvas

        # Draw the arrow.
        x1 = (edge.start() * self._unitsize + ChartView._MARGIN)
        x2 = (edge.end() * self._unitsize + ChartView._MARGIN)
        if x2 == x1: x2 += max(4, self._unitsize/5)
        y = (lvl+1) * self._chart_level_size
        linetag = c.create_line(x1, y, x2, y, arrow='last', width=3)

        # Draw a label for the edge.
        if isinstance(edge, TreeEdge):
            rhs = []
            for elt in edge.rhs():
                if isinstance(elt, Nonterminal):
                    rhs.append(str(elt.symbol()))
                else:
                    rhs.append(repr(elt))
            pos = edge.dot()
        else:
            rhs = []
            pos = 0

        rhs1 = " ".join(rhs[:pos])
        rhs2 = " ".join(rhs[pos:])
        rhstag1 = c.create_text(x1+3, y, text=rhs1,
                                font=self._font,
                                anchor='nw')
        dotx = c.bbox(rhstag1)[2] + 6
        doty = (c.bbox(rhstag1)[1]+c.bbox(rhstag1)[3])/2
        dottag = c.create_oval(dotx-2, doty-2, dotx+2, doty+2)
        rhstag2 = c.create_text(dotx+6, y, text=rhs2,
                                font=self._font,
                                anchor='nw')
        lhstag =  c.create_text((x1+x2)/2, y, text=str(edge.lhs()),
                                anchor='s',
                                font=self._boldfont)

        # Keep track of the edge's tags.
        self._edgetags[edge] = (linetag, rhstag1,
                                dottag, rhstag2, lhstag)

        # Register a callback for clicking on the edge.
        def cb(event, self=self, edge=edge):
            self._fire_callbacks('select', edge)
        c.tag_bind(rhstag1, '<Button-1>', cb)
        c.tag_bind(rhstag2, '<Button-1>', cb)
        c.tag_bind(linetag, '<Button-1>', cb)
        c.tag_bind(dottag, '<Button-1>', cb)
        c.tag_bind(lhstag, '<Button-1>', cb)

        self._color_edge(edge)

    def _color_edge(self, edge, linecolor=None, textcolor=None):
        """
        Color in an edge with the given colors.
        If no colors are specified, use intelligent defaults
        (dependent on selection, etc.)
        """
        if edge not in self._edgetags: return
        c = self._chart_canvas

        if linecolor is not None and textcolor is not None:
            if edge in self._marks:
                linecolor = self._marks[edge]
            tags = self._edgetags[edge]
            c.itemconfig(tags[0], fill=linecolor)
            c.itemconfig(tags[1], fill=textcolor)
            c.itemconfig(tags[2], fill=textcolor,
                         outline=textcolor)
            c.itemconfig(tags[3], fill=textcolor)
            c.itemconfig(tags[4], fill=textcolor)
            return
        else:
            N = self._chart.num_leaves()
            if edge in self._marks:
                self._color_edge(self._marks[edge])
            if (edge.is_complete() and edge.span() == (0, N)):
                self._color_edge(edge, '#084', '#042')
            elif isinstance(edge, LeafEdge):
                self._color_edge(edge, '#48c', '#246')
            else:
                self._color_edge(edge, '#00f', '#008')

    def mark_edge(self, edge, mark='#0df'):
        """
        Mark an edge
        """
        self._marks[edge] = mark
        self._color_edge(edge)

    def unmark_edge(self, edge=None):
        """
        Unmark an edge (or all edges)
        """
        if edge is None:
            old_marked_edges = list(self._marks.keys())
            self._marks = {}
            for edge in old_marked_edges:
                self._color_edge(edge)
        else:
            del self._marks[edge]
            self._color_edge(edge)

    def markonly_edge(self, edge, mark='#0df'):
        self.unmark_edge()
        self.mark_edge(edge, mark)

    def _analyze(self):
        """
        Analyze the sentence string, to figure out how big a unit needs
        to be, How big the tree should be, etc.
        """
        # Figure out the text height and the unit size.
        unitsize = 70 # min unitsize
        text_height = 0
        c = self._chart_canvas

        # Check against all tokens
        for leaf in self._chart.leaves():
            tag = c.create_text(0,0, text=repr(leaf),
                                font=self._font,
                                anchor='nw', justify='left')
            bbox = c.bbox(tag)
            c.delete(tag)
            width = bbox[2] + ChartView._LEAF_SPACING
            unitsize = max(width, unitsize)
            text_height = max(text_height, bbox[3] - bbox[1])

        self._unitsize = unitsize
        self._text_height = text_height
        self._sentence_height = (self._text_height +
                               2*ChartView._MARGIN)

        # Check against edges.
        for edge in self._chart.edges():
            self._analyze_edge(edge)

        # Size of chart levels
        self._chart_level_size = self._text_height * 2

        # Default tree size..
        self._tree_height = (3 * (ChartView._TREE_LEVEL_SIZE +
                                  self._text_height))

        # Resize the scrollregions.
        self._resize()

    def _resize(self):
        """
        Update the scroll-regions for each canvas.  This ensures that
        everything is within a scroll-region, so the user can use the
        scrollbars to view the entire display.  This does *not*
        resize the window.
        """
        c = self._chart_canvas

        # Reset the chart scroll region
        width = ( self._chart.num_leaves() * self._unitsize +
                  ChartView._MARGIN * 2 )

        levels = len(self._edgelevels)
        self._chart_height = (levels+2)*self._chart_level_size
        c['scrollregion']=(0,0,width,self._chart_height)

        # Reset the tree scroll region
        if self._tree_canvas:
            self._tree_canvas['scrollregion'] = (0, 0, width,
                                                 self._tree_height)

    def _draw_loclines(self):
        """
        Draw location lines.  These are vertical gridlines used to
        show where each location unit is.
        """
        BOTTOM = 50000
        c1 = self._tree_canvas
        c2 = self._sentence_canvas
        c3 = self._chart_canvas
        margin = ChartView._MARGIN
        self._loclines = []
        for i in range(0, self._chart.num_leaves()+1):
            x = i*self._unitsize + margin

            if c1:
                t1=c1.create_line(x, 0, x, BOTTOM)
                c1.tag_lower(t1)
            if c2:
                t2=c2.create_line(x, 0, x, self._sentence_height)
                c2.tag_lower(t2)
            t3=c3.create_line(x, 0, x, BOTTOM)
            c3.tag_lower(t3)
            t4=c3.create_text(x+2, 0, text=repr(i), anchor='nw',
                              font=self._font)
            c3.tag_lower(t4)
            #if i % 4 == 0:
            #    if c1: c1.itemconfig(t1, width=2, fill='gray60')
            #    if c2: c2.itemconfig(t2, width=2, fill='gray60')
            #    c3.itemconfig(t3, width=2, fill='gray60')
            if i % 2 == 0:
                if c1: c1.itemconfig(t1, fill='gray60')
                if c2: c2.itemconfig(t2, fill='gray60')
                c3.itemconfig(t3, fill='gray60')
            else:
                if c1: c1.itemconfig(t1, fill='gray80')
                if c2: c2.itemconfig(t2, fill='gray80')
                c3.itemconfig(t3, fill='gray80')

    def _draw_sentence(self):
        """Draw the sentence string."""
        if self._chart.num_leaves() == 0: return
        c = self._sentence_canvas
        margin = ChartView._MARGIN
        y = ChartView._MARGIN

        for i, leaf in enumerate(self._chart.leaves()):
            x1 = i * self._unitsize + margin
            x2 = x1 + self._unitsize
            x = (x1+x2)/2
            tag = c.create_text(x, y, text=repr(leaf),
                                font=self._font,
                                anchor='n', justify='left')
            bbox = c.bbox(tag)
            rt=c.create_rectangle(x1+2, bbox[1]-(ChartView._LEAF_SPACING/2),
                                  x2-2, bbox[3]+(ChartView._LEAF_SPACING/2),
                                  fill='#f0f0f0', outline='#f0f0f0')
            c.tag_lower(rt)

    def erase_tree(self):
        for tag in self._tree_tags: self._tree_canvas.delete(tag)
        self._treetoks = []
        self._treetoks_edge = None
        self._treetoks_index = 0

    def draw_tree(self, edge=None):
        if edge is None and self._treetoks_edge is None: return
        if edge is None: edge = self._treetoks_edge

        # If it's a new edge, then get a new list of treetoks.
        if self._treetoks_edge != edge:
            self._treetoks = [t for t in self._chart.trees(edge)
                              if isinstance(t, Tree)]
            self._treetoks_edge = edge
            self._treetoks_index = 0

        # Make sure there's something to draw.
        if len(self._treetoks) == 0: return

        # Erase the old tree.
        for tag in self._tree_tags: self._tree_canvas.delete(tag)

        # Draw the new tree.
        tree = self._treetoks[self._treetoks_index]
        self._draw_treetok(tree, edge.start())

        # Show how many trees are available for the edge.
        self._draw_treecycle()

        # Update the scroll region.
        w = self._chart.num_leaves()*self._unitsize+2*ChartView._MARGIN
        h = tree.height() * (ChartView._TREE_LEVEL_SIZE+self._text_height)
        self._tree_canvas['scrollregion'] = (0, 0, w, h)

    def cycle_tree(self):
        self._treetoks_index = (self._treetoks_index+1)%len(self._treetoks)
        self.draw_tree(self._treetoks_edge)

    def _draw_treecycle(self):
        if len(self._treetoks) <= 1: return

        # Draw the label.
        label = '%d Trees' % len(self._treetoks)
        c = self._tree_canvas
        margin = ChartView._MARGIN
        right = self._chart.num_leaves()*self._unitsize+margin-2
        tag = c.create_text(right, 2, anchor='ne', text=label,
                            font=self._boldfont)
        self._tree_tags.append(tag)
        _, _, _, y = c.bbox(tag)

        # Draw the triangles.
        for i in range(len(self._treetoks)):
            x = right - 20*(len(self._treetoks)-i-1)
            if i == self._treetoks_index: fill = '#084'
            else: fill = '#fff'
            tag = c.create_polygon(x, y+10, x-5, y, x-10, y+10,
                             fill=fill, outline='black')
            self._tree_tags.append(tag)

            # Set up a callback: show the tree if they click on its
            # triangle.
            def cb(event, self=self, i=i):
                self._treetoks_index = i
                self.draw_tree()
            c.tag_bind(tag, '<Button-1>', cb)

    def _draw_treetok(self, treetok, index, depth=0):
        """
        :param index: The index of the first leaf in the tree.
        :return: The index of the first leaf after the tree.
        """
        c = self._tree_canvas
        margin = ChartView._MARGIN

        # Draw the children
        child_xs = []
        for child in treetok:
            if isinstance(child, Tree):
                child_x, index = self._draw_treetok(child, index, depth+1)
                child_xs.append(child_x)
            else:
                child_xs.append((2*index+1)*self._unitsize/2 + margin)
                index += 1

        # If we have children, then get the node's x by averaging their
        # node x's.  Otherwise, make room for ourselves.
        if child_xs:
            nodex = sum(child_xs)/len(child_xs)
        else:
            # [XX] breaks for null productions.
            nodex = (2*index+1)*self._unitsize/2 + margin
            index += 1

        # Draw the node
        nodey = depth * (ChartView._TREE_LEVEL_SIZE + self._text_height)
        tag = c.create_text(nodex, nodey, anchor='n', justify='center',
                            text=str(treetok.label()), fill='#042',
                            font=self._boldfont)
        self._tree_tags.append(tag)

        # Draw lines to the children.
        childy = nodey + ChartView._TREE_LEVEL_SIZE + self._text_height
        for childx, child in zip(child_xs, treetok):
            if isinstance(child, Tree) and child:
                # A "real" tree token:
                tag = c.create_line(nodex, nodey + self._text_height,
                                    childx, childy, width=2, fill='#084')
                self._tree_tags.append(tag)
            if isinstance(child, Tree) and not child:
                # An unexpanded tree token:
                tag = c.create_line(nodex, nodey + self._text_height,
                                    childx, childy, width=2,
                                    fill='#048', dash='2 3')
                self._tree_tags.append(tag)
            if not isinstance(child, Tree):
                # A leaf:
                tag = c.create_line(nodex, nodey + self._text_height,
                                    childx, 10000, width=2, fill='#084')
                self._tree_tags.append(tag)

        return nodex, index

    def draw(self):
        """
        Draw everything (from scratch).
        """
        if self._tree_canvas:
            self._tree_canvas.delete('all')
            self.draw_tree()

        if self._sentence_canvas:
            self._sentence_canvas.delete('all')
            self._draw_sentence()

        self._chart_canvas.delete('all')
        self._edgetags = {}

        # Redraw any edges we erased.
        for lvl in range(len(self._edgelevels)):
            for edge in self._edgelevels[lvl]:
                self._draw_edge(edge, lvl)

        for edge in self._chart:
            self._add_edge(edge)

        self._draw_loclines()

    def add_callback(self, event, func):
        self._callbacks.setdefault(event,{})[func] = 1

    def remove_callback(self, event, func=None):
        if func is None: del self._callbacks[event]
        else:
            try: del self._callbacks[event][func]
            except: pass

    def _fire_callbacks(self, event, *args):
        if event not in self._callbacks: return
        for cb_func in list(self._callbacks[event].keys()): cb_func(*args)

class ChartParserApp(object):
    # ...

    def _init_chartview(self, parent):
        self._cv = ChartView(self._chart, parent,
                             draw_tree=1, draw_sentence=1)
        self._cv.add_callback('select', self._click_cv_edge)

    # ...

    def view_edge(self, edge):
        level = None
        for i in range(len(self._cv._edgelevels)):
            if edge in self._cv._edgelevels[i]:
                level = i
                break
        if level is None: return
        # Try to view the new edge..
        y = (level+1) * self._cv._chart_level_size
        dy = self._cv._text_height + 10
        self._cv._chart_canvas.yview('moveto', 1.0)
        if self._cv._chart_height != 0:
            self._cv._chart_canvas.yview('moveto',
                                         (y-dy)/self._cv._chart_height)

    # ...