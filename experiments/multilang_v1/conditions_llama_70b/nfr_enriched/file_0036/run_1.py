class PageElement:
    # ...

    def insert(self, position, newChild):
        """Inserts a new child at the specified position."""
        newChild = self._normalize_new_child(newChild)
        position = self._validate_position(position)
        self._insert_at_position(position, newChild)

    def _normalize_new_child(self, newChild):
        """Normalizes the new child to be inserted."""
        if isinstance(newChild, basestring) or isinstance(newChild, unicode):
            if not isinstance(newChild, NavigableString):
                newChild = NavigableString(newChild)
        return newChild

    def _validate_position(self, position):
        """Validates the position where the new child will be inserted."""
        return min(position, len(self.contents))

    def _insert_at_position(self, position, newChild):
        """Inserts the new child at the specified position."""
        if hasattr(newChild, 'parent') and newChild.parent != None:
            newChild.extract()
        newChild.parent = self
        self._update_child_pointers(position, newChild)
        self.contents.insert(position, newChild)

    def _update_child_pointers(self, position, newChild):
        """Updates the child pointers after inserting a new child."""
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
                if not parent: # This is the last element in the document.
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