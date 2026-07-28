def insert(self, position, newChild):
    if isinstance(newChild, (basestring, unicode)) and not isinstance(newChild, NavigableString):
        newChild = NavigableString(newChild)

    position = min(position, len(self.contents))
    if hasattr(newChild, 'parent') and newChild.parent is not None:
        if newChild.parent == self:
            index = self.find(newChild)
            if index and index < position:
                position = position - 1
        newChild.extract()

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
    self.contents.insert(position, newChild)