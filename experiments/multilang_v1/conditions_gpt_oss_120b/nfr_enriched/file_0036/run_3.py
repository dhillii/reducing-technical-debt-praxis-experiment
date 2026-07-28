class PageElement:
    """Contains the navigational information for some part of the page
    (either a tag or a piece of text)"""

    def setup(self, parent=None, previous=None):
        """Sets up the initial relations between this element and
        other elements."""
        self.parent = parent
        self.previous = previous
        self.next = None
        self.previousSibling = None
        self.nextSibling = None
        if self.parent and self.parent.contents:
            self.previousSibling = self.parent.contents[-1]
            self.previousSibling.nextSibling = self

    def replaceWith(self, replaceWith):
        oldParent = self.parent
        myIndex = self.parent.contents.index(self)
        if hasattr(replaceWith, 'parent') and replaceWith.parent == self.parent:
            index = self.parent.contents.index(replaceWith)
            if index and index < myIndex:
                myIndex = myIndex - 1
        self.extract()
        oldParent.insert(myIndex, replaceWith)

    def extract(self):
        """Destructively rips this element out of the tree."""
        if self.parent:
            idx = None
            for i, x in enumerate(self.parent.contents):
                if x is self:
                    idx = i
                    break
            if idx is not None:
                self.parent.contents.pop(idx)

        lastChild = self._lastRecursiveChild()
        nextElement = lastChild.next

        if self.previous:
            self.previous.next = nextElement
        if nextElement:
            nextElement.previous = self.previous
        self.previous = None
        lastChild.next = None

        self.parent = None
        if self.previousSibling:
            self.previousSibling.nextSibling = self.nextSibling
        if self.nextSibling:
            self.nextSibling.previousSibling = self.previousSibling
        self.previousSibling = self.nextSibling = None

    def _lastRecursiveChild(self):
        "Finds the last element beneath this object to be parsed."
        lastChild = self
        while hasattr(lastChild, 'contents') and lastChild.contents:
            lastChild = lastChild.contents[-1]
        return lastChild

    def insert(self, position, newChild):
        """Insert newChild at the given position, handling all link updates."""
        newChild = self._coerce_to_navigable_string(newChild)
        position = min(position, len(self.contents))

        if getattr(newChild, 'parent', None) is not None:
            position = self._adjust_position_for_existing_child(position, newChild)
            newChild.extract()

        newChild.parent = self
        self._link_new_child(position, newChild)
        self.contents.insert(position, newChild)

    def _coerce_to_navigable_string(self, newChild):
        """Convert plain strings to NavigableString unless already a subclass."""
        if (isinstance(newChild, basestring) or isinstance(newChild, unicode)) \
                and not isinstance(newChild, NavigableString):
            return NavigableString(newChild)
        return newChild

    def _adjust_position_for_existing_child(self, position, newChild):
        """If newChild is already a child of this tag, adjust insertion index."""
        if newChild.parent == self:
            index = self.find(newChild)
            if index is not None and index < position:
                return position - 1
        return position

    def _link_new_child(self, position, newChild):
        """Set sibling and previous/next links for newChild."""
        if position == 0:
            newChild.previousSibling = None
            newChild.previous = self
        else:
            previousChild = self.contents[position - 1]
            newChild.previousSibling = previousChild
            previousChild.nextSibling = newChild
            newChild.previous = previousChild._lastRecursiveChild()
        if newChild.previous:
            newChild.previous.next = newChild

        lastElement = newChild._lastRecursiveChild()
        self._link_next_sibling(position, newChild, lastElement)

    def _link_next_sibling(self, position, newChild, lastElement):
        """Connect newChild's last element to the appropriate next sibling."""
        if position >= len(self.contents):
            newChild.nextSibling = None
            parent = self
            parentsNextSibling = None
            while parent:
                parentsNextSibling = parent.nextSibling
                parent = parent.parent
                if not parent:
                    break
            lastElement.next = parentsNextSibling if parentsNextSibling else None
        else:
            nextChild = self.contents[position]
            newChild.nextSibling = nextChild
            nextChild.previousSibling = newChild
            lastElement.next = nextChild

        if lastElement.next:
            lastElement.next.previous = lastElement

    def append(self, tag):
        """Appends the given tag to the contents of this tag."""
        self.insert(len(self.contents), tag)

    def findNext(self, name=None, attrs={}, text=None, **kwargs):
        """Returns the first item that matches the given criteria and
        appears after this Tag in the document."""
        return self._findOne(self.findAllNext, name, attrs, text, **kwargs)

    def findAllNext(self, name=None, attrs={}, text=None, limit=None,
                    **kwargs):
        """Returns all items that match the given criteria and appear
        before after Tag in the document."""
        return self._findAll(name, attrs, text, limit, self.nextGenerator)

    def findNextSibling(self, name=None, attrs={}, text=None, **kwargs):
        """Returns the closest sibling to this Tag that matches the
        given criteria and appears after this Tag in the document."""
        return self._findOne(self.findNextSiblings, name, attrs, text,
                             **kwargs)

    def findNextSiblings(self, name=None, attrs={}, text=None, limit=None,
                         **kwargs):
        """Returns the siblings of this Tag that match the given
        criteria and appear after this Tag in the document."""
        return self._findAll(name, attrs, text, limit,
                             self.nextSiblingGenerator, **kwargs)
    fetchNextSiblings = findNextSiblings

    def findPrevious(self, name=None, attrs={}, text=None, **kwargs):
        """Returns the first item that matches the given criteria and
        appears before this Tag in the document."""
        return self._findOne(self.findAllPrevious, name, attrs, text, **kwargs)

    def findAllPrevious(self, name=None, attrs={}, text=None, limit=None,
                        **kwargs):
        """Returns all items that match the given criteria and appear
        before this Tag in the document."""
        return self._findAll(name, attrs, text, limit, self.previousGenerator,
                           **kwargs)
    fetchPrevious = findAllPrevious

    def findPreviousSibling(self, name=None, attrs={}, text=None, **kwargs):
        """Returns the closest sibling to this Tag that matches the
        given criteria and appears before this Tag in the document."""
        return self._findOne(self.findPreviousSiblings, name, attrs, text,
                             **kwargs)

    def findPreviousSiblings(self, name=None, attrs={}, text=None,
                             limit=None, **kwargs):
        """Returns the siblings of this Tag that match the given
        criteria and appear before this Tag in the document."""
        return self._findAll(name, attrs, text, limit,
                             self.previousSiblingGenerator, **kwargs)
    fetchPreviousSiblings = findPreviousSiblings

    def findParent(self, name=None, attrs={}, **kwargs):
        """Returns the closest parent of this Tag that matches the given
        criteria."""
        r = None
        l = self.findParents(name, attrs, 1)
        if l:
            r = l[0]
        return r

    def findParents(self, name=None, attrs={}, limit=None, **kwargs):
        """Returns the parents of this Tag that match the given
        criteria."""
        return self._findAll(name, attrs, None, limit, self.parentGenerator,
                             **kwargs)
    fetchParents = findParents

    def _findOne(self, method, name, attrs, text, **kwargs):
        r = None
        l = method(name, attrs, text, 1, **kwargs)
        if l:
            r = l[0]
        return r

    def _findAll(self, name, attrs, text, limit, generator, **kwargs):
        "Iterates over a generator looking for things that match."
        if isinstance(name, SoupStrainer):
            strainer = name
        else:
            strainer = SoupStrainer(name, attrs, text, **kwargs)
        results = ResultSet(strainer)
        g = generator()
        while True:
            try:
                i = g.next()
            except StopIteration:
                break
            if i:
                found = strainer.search(i)
                if found:
                    results.append(found)
                    if limit and len(results) >= limit:
                        break
        return results

    def nextGenerator(self):
        i = self
        while i:
            i = i.next
            yield i

    def nextSiblingGenerator(self):
        i = self
        while i:
            i = i.nextSibling
            yield i

    def previousGenerator(self):
        i = self
        while i:
            i = i.previous
            yield i

    def previousSiblingGenerator(self):
        i = self
        while i:
            i = i.previousSibling
            yield i

    def parentGenerator(self):
        i = self
        while i:
            i = i.parent
            yield i

    def substituteEncoding(self, str, encoding=None):
        encoding = encoding or "utf-8"
        return str.replace("%SOUP-ENCODING%", encoding)

    def toEncoding(self, s, encoding=None):
        """Encodes an object to a string in some encoding, or to Unicode."""
        if isinstance(s, unicode):
            if encoding:
                s = s.encode(encoding)
        elif isinstance(s, str):
            if encoding:
                s = s.encode(encoding)
            else:
                s = unicode(s)
        else:
            if encoding:
                s = self.toEncoding(str(s), encoding)
            else:
                s = unicode(s)
        return s