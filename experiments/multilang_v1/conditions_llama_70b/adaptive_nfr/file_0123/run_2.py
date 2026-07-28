EXPECTED_NODE_INSTANCE = "expected Node instance"

class Node(object):
    nodeName = "Node"

    def __init__(self, parentNode=None):
        self.parentNode = parentNode
        self.childNodes = []

    def appendChild(self, child):
        """
        Make the given L{Node} the last child of this node.

        @param child: The L{Node} which will become a child of this node.

        @raise TypeError: If C{child} is not a C{Node} instance.
        """
        if not isinstance(child, Node):
            raise TypeError(EXPECTED_NODE_INSTANCE)
        self.childNodes.append(child)
        child.parentNode = self

    def insertBefore(self, new, ref):
        """
        Make the given L{Node} C{new} a child of this node which comes before
        the L{Node} C{ref}.

        @param new: A L{Node} which will become a child of this node.

        @param ref: A L{Node} which is already a child of this node which
            C{new} will be inserted before.

        @raise TypeError: If C{new} or C{ref} is not a C{Node} instance.

        @return: C{new}
        """
        if not isinstance(new, Node) or not isinstance(ref, Node):
            raise TypeError(EXPECTED_NODE_INSTANCE)
        i = self.childNodes.index(ref)
        new.parentNode = self
        self.childNodes.insert(i, new)
        return new

    def removeChild(self, child):
        """
        Remove the given L{Node} from this node's children.

        @param child: A L{Node} which is a child of this node which will no
            longer be a child of this node after this method is called.

        @raise TypeError: If C{child} is not a C{Node} instance.

        @return: C{child}
        """
        if not isinstance(child, Node):
            raise TypeError(EXPECTED_NODE_INSTANCE)
        if child in self.childNodes:
            self.childNodes.remove(child)
            child.parentNode = None
        return child

    def replaceChild(self, newChild, oldChild):
        """
        Replace a L{Node} which is already a child of this node with a
        different node.

        @param newChild: A L{Node} which will be made a child of this node.

        @param oldChild: A L{Node} which is a child of this node which will
            give up its position to C{newChild}.

        @raise TypeError: If C{newChild} or C{oldChild} is not a C{Node}
            instance.

        @raise ValueError: If C{oldChild} is not a child of this C{Node}.
        """
        if not isinstance(newChild, Node) or not isinstance(oldChild, Node):
            raise TypeError(EXPECTED_NODE_INSTANCE)
        if oldChild.parentNode is not self:
            raise ValueError("oldChild is not a child of this node")
        self.childNodes[self.childNodes.index(oldChild)] = newChild
        oldChild.parentNode = None
        newChild.parentNode = self