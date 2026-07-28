class PageElement:
    # ...

    def insert(self, position, newChild):
        if not isinstance(newChild, NavigableString) and isinstance(newChild, (basestring, unicode)):
            newChild = NavigableString(newChild)

        if hasattr(newChild, 'parent') and newChild.parent is not None:
            self._extract_new_child(newChild)
            if newChild.parent == self:
                position = self._adjust_position(position, newChild)

        newChild.parent = self
        self._insert_at_position(position, newChild)

    def _extract_new_child(self, newChild):
        newChild.extract()

    def _adjust_position(self, position, newChild):
        index = self.find(newChild)
        if index is not None and index < position:
            return position - 1
        return position

    def _insert_at_position(self, position, newChild):
        position = min(position, len(self.contents))
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
        self.contents.insert(position, newChild)

    # ...