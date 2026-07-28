class PageElement:
    # ...

    def insert(self, position, newChild):
        """Inserts a new child at the specified position."""
        newChild = self._normalize_new_child(newChild)
        self._insert_at_position(position, newChild)

    def _normalize_new_child(self, newChild):
        """Normalizes the new child to be inserted."""
        if isinstance(newChild, basestring) or isinstance(newChild, unicode):
            if not isinstance(newChild, NavigableString):
                newChild = NavigableString(newChild)
        return newChild

    def _insert_at_position(self, position, newChild):
        """Inserts the new child at the specified position."""
        position = min(position, len(self.contents))
        if hasattr(newChild, 'parent') and newChild.parent is not None:
            newChild.extract()
        self._update_child_pointers(newChild, position)
        self.contents.insert(position, newChild)

    def _update_child_pointers(self, newChild, position):
        """Updates the child pointers after insertion."""
        newChild.parent = self
        previousChild = None
        if position == 0:
            newChild.previousSibling = None
            newChild.previous = self
        else:
            previousChild = self.contents[position-1]
            newChild.previousSibling = previousChild
            newChild.previousSibling.nextSibling = newChild
            newChild.previous = previousChild._lastRecursiveChild()
        if newChild.previous:
            newChild.previous.next = newChild
        newChildsLastElement = newChild._lastRecursiveChild()
        if position >= len(self.contents):
            newChild.nextSibling = None
            parent = self
            parentsNextSibling = None
            while not parentsNextSibling:
                parentsNextSibling = parent.nextSibling
                parent = parent.parent
                if not parent: 
                    break
            if parentsNextSibling:
                newChildsLastElement.next = parentsNextSibling
            else:
                newChildsLastElement.next = None
        else:
            nextChild = self.contents[position]
            newChild.nextSibling = nextChild
            if newChild.nextSibling:
                newChild.nextSibling.previousSibling = newChild
            newChildsLastElement.next = nextChild
        if newChildsLastElement.next:
            newChildsLastElement.next.previous = newChildsLastElement