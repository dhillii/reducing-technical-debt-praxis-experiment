EXPECTED_NODE_INSTANCE = "expected Node instance"

class Node(object):
    nodeName = "Node"

    def __init__(self, parentNode=None):
        self.parentNode = parentNode
        self.childNodes = []

    def _validate_node(self, node):
        """Validate if the given node is an instance of Node."""
        if not isinstance(node, Node):
            raise TypeError(EXPECTED_NODE_INSTANCE)

    def appendChild(self, child):
        """
        Make the given L{Node} the last child of this node.

        @param child: The L{Node} which will become a child of this node.

        @raise TypeError: If C{child} is not a C{Node} instance.
        """
        self._validate_node(child)
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
        self._validate_node(new)
        self._validate_node(ref)
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
        self._validate_node(child)
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
        self._validate_node(newChild)
        self._validate_node(oldChild)
        if oldChild.parentNode is not self:
            raise ValueError("oldChild is not a child of this node")
        self.childNodes[self.childNodes.index(oldChild)] = newChild
        oldChild.parentNode = None
        newChild.parentNode = self