def is_valid_new_child(newChild):
    """Checks if the new child is a valid string or NavigableString."""
    return (isinstance(newChild, basestring) or isinstance(newChild, unicode)) and not isinstance(newChild, NavigableString)

def get_new_child(newChild):
    """Converts the new child to a NavigableString if it's a string."""
    if is_valid_new_child(newChild):
        return NavigableString(newChild)
    return newChild

def get_position(self, position):
    """Ensures the position is within the bounds of the contents list."""
    return min(position, len(self.contents))

def has_parent(newChild):
    """Checks if the new child has a parent."""
    return hasattr(newChild, 'parent') and newChild.parent is not None

def extract_new_child(newChild):
    """Extracts the new child from its current position if it has a parent."""
    if has_parent(newChild):
        newChild.extract()

def get_previous_child(self, position):
    """Gets the previous child at the specified position."""
    if position == 0:
        return None
    return self.contents[position-1]

def update_new_child(newChild, previousChild, self):
    """Updates the new child's previous sibling and previous attributes."""
    if previousChild:
        newChild.previousSibling = previousChild
        newChild.previousSibling.nextSibling = newChild
        newChild.previous = previousChild._lastRecursiveChild()
    else:
        newChild.previousSibling = None
        newChild.previous = self

def update_new_child_next(newChild, self, position):
    """Updates the new child's next sibling attribute."""
    if position >= len(self.contents):
        newChild.nextSibling = None
    else:
        nextChild = self.contents[position]
        newChild.nextSibling = nextChild
        if newChild.nextSibling:
            newChild.nextSibling.previousSibling = newChild

def insert_new_child(self, newChild, position):
    """Inserts the new child at the specified position."""
    newChild.parent = self
    previousChild = get_previous_child(self, position)
    update_new_child(newChild, previousChild, self)
    update_new_child_next(newChild, self, position)
    self.contents.insert(position, newChild)

def insert(self, position, newChild):
    newChild = get_new_child(newChild)
    position = get_position(self, position)
    extract_new_child(newChild)
    insert_new_child(self, newChild, position)