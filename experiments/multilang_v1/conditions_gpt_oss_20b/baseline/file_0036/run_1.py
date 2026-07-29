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
            # We're replacing this element with one of its siblings.
            index = self.parent.contents.index(replaceWith)
            if index and index < myIndex:
                # Furthermore, it comes before this element. That
                # means that when we extract it, the index of this
                # element will change.
                myIndex = myIndex - 1
        self.extract()
        oldParent.insert(myIndex, replaceWith)

    def extract(self):
        """Destructively rips this element out of the tree."""
        # Changed by KG as list.remove uses _-eq__ which is True for two Tags
        # with the same name and attributes.
        if self.parent:
            idx = None
            for i, x in enumerate(self.parent.contents):
                if x is self:
                    idx = i
                    break
            if idx is not None:
                self.parent.contents.pop(idx)

        #Find the two elements that would be next to each other if
        #this element (and any children) hadn't been parsed. Connect
        #the two.
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

    def _ensure_navigable_string(self, child):
        if isinstance(child, basestring) and not isinstance(child, NavigableString):
            return NavigableString(child)
        return child

    def _handle_existing_child(self, child, position):
        if hasattr(child, 'parent') and child.parent is not None:
            if child.parent == self:
                index = self.contents.index(child)
                if index and index < position:
                    position -= 1
            child.extract()
        return position

    def _set_previous(self, position, child):
        if position == 0:
            child.previousSibling = None
            child.previous = self
        else:
            prev = self.contents[position-1]
            child.previousSibling = prev
            prev.nextSibling = child
            child.previous = prev._lastRecursiveChild()

    def _set_next(self, position, child):
        last = child._lastRecursiveChild()
        if position >= len(self.contents):
            child.nextSibling = None
            parent = self
            next_sibling = None
            while not next_sibling:
                next_sibling = parent.nextSibling
                parent = parent.parent
                if not parent:
                    break
            if next_sibling:
                last.next = next_sibling
            else:
                last.next = None
        else:
            next_child = self.contents[position]
            child.nextSibling = next_child
            next_child.previousSibling = child
            last.next = next_child
        if last.next:
            last.next.previous = last

    def insert(self, position, newChild):
        newChild = self._ensure_navigable_string(newChild)
        position = min(position, len(self.contents))
        position = self._handle_existing_child(newChild, position)
        newChild.parent = self
        self._set_previous(position, newChild)
        self._set_next(position, newChild)
        self.contents.insert(position, newChild)

    def append(self, tag):
        """Appends the given tag to the contents of this tag."""
        self.insert(len(self.contents), tag)