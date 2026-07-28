"""Beautiful Soup
Elixir and Tonic
"The Screen-Scraper's Friend"
http://www.crummy.com/software/BeautifulSoup/

Beautiful Soup parses a (possibly invalid) XML or HTML document into a
tree representation. It provides methods and Pythonic idioms that make
it easy to navigate, search, and modify the tree.

A well-formed XML/HTML document yields a well-formed data
structure. An ill-formed XML/HTML document yields a correspondingly
ill-formed data structure. If your document is only locally
well-formed, you can use this library to find and process the
well-formed part of it.

Beautiful Soup works with Python 2.2 and up. It has no external
dependencies, but you'll have more success at converting data to UTF-8
if you also install these three packages:

* chardet, for auto-detecting character encodings
  http://chardet.feedparser.org/
* cjkcodecs and iconv_codec, which add more encodings to the ones supported
  by stock Python.
  http://cjkpython.i18n.org/

Beautiful Soup defines classes for two main parsing strategies:

 * BeautifulStoneSoup, for parsing XML, SGML, or your domain-specific
   language that kind of looks like XML.

 * BeautifulSoup, for parsing run-of-the-mill HTML code, be it valid
   or invalid. This class has web browser-like heuristics for
   obtaining a sensible parse tree in the face of common HTML errors.

Beautiful Soup also defines a class (UnicodeDammit) for autodetecting
the encoding of an HTML or XML document, and converting it to
Unicode. Much of this code is taken from Mark Pilgrim's Universal Feed Parser.

For more than you ever wanted to know about Beautiful Soup, see the
documentation:
http://www.crummy.com/software/BeautifulSoup/documentation.html

Here, have some legalese:

Copyright (c) 2004-2007, Leonard Richardson

All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

  * Redistributions of source code must retain the above copyright
    notice, this list of conditions and the following disclaimer.

  * Redistributions in binary form must reproduce the above copyright
    notice, this list of conditions and the following disclaimer
    in the documentation and/or other materials provided
    with the distribution.

  * Neither the name of the the Beautiful Soup Consortium and All
    Night Kosher Bakery nor the names of its contributors may be used
    to endorse or promote products derived from this software without
    specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR
CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, PROCUREMENT OF SUBSTITUTE
GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF
THE POSSIBILITY OF SUCH DAMAGE, DAMMIT.

"""
from __future__ import generators

__author__ = "Leonard Richardson (leonardr@segfault.org)"
__version__ = "3.0.5"
__copyright__ = "Copyright (c) 2004-2007 Leonard Richardson"
__license__ = "New-style BSD"

from calibre.ebooks.sgmllib import SGMLParser, SGMLParseError
import codecs
import types
import re
import calibre.ebooks.sgmllib as sgmllib
from htmlentitydefs import name2codepoint

#This hack makes Beautiful Soup able to parse XML with namespaces
sgmllib.tagfind = re.compile('[a-zA-Z][-_.:a-zA-Z0-9]*')

DEFAULT_OUTPUT_ENCODING = "utf-8"

# First, the classes that represent markup elements.

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

    def _should_wrap_string(self, newChild):
        """Return True if newChild is a plain string that should be wrapped."""
        return (isinstance(newChild, basestring) or isinstance(newChild, unicode)) \
               and not isinstance(newChild, NavigableString)

    def _has_parent(self, newChild):
        """Return True if newChild already has a parent."""
        return hasattr(newChild, 'parent') and newChild.parent is not None

    def _is_child_of_self(self, newChild):
        """Return True if newChild's parent is this element."""
        return newChild.parent == self

    def _needs_position_adjust(self, index, position):
        """Return True if the insertion index must be shifted left."""
        return index and index < position

    def _setup_new_child_at_start(self, newChild):
        """Configure newChild when inserting at position 0."""
        newChild.previousSibling = None
        newChild.previous = self

    def _setup_new_child_after_position(self, newChild, position):
        """Configure newChild when inserting after the first element."""
        previousChild = self.contents[position - 1]
        newChild.previousSibling = previousChild
        previousChild.nextSibling = newChild
        newChild.previous = previousChild._lastRecursiveChild()

    def _link_new_child_siblings(self, newChild, position):
        """Link newChild with surrounding siblings after insertion."""
        newChildsLast = newChild._lastRecursiveChild()
        if position >= len(self.contents):
            newChild.nextSibling = None
            parent = self
            parentsNextSibling = None
            while not parentsNextSibling:
                parentsNextSibling = parent.nextSibling
                parent = parent.parent
                if not parent:
                    break
            newChildsLast.next = parentsNextSibling if parentsNextSibling else None
        else:
            nextChild = self.contents[position]
            newChild.nextSibling = nextChild
            if nextChild:
                nextChild.previousSibling = newChild
            newChildsLast.next = nextChild
        if newChildsLast.next:
            newChildsLast.next.previous = newChildsLast

    def insert(self, position, newChild):
        """Insert newChild into this element at the given position."""
        if self._should_wrap_string(newChild):
            newChild = NavigableString(newChild)

        position = min(position, len(self.contents))

        if self._has_parent(newChild):
            if self._is_child_of_self(newChild):
                index = self.find(newChild)
                if self._needs_position_adjust(index, position):
                    position -= 1
            newChild.extract()

        newChild.parent = self
        if position == 0:
            self._setup_new_child_at_start(newChild)
        else:
            self._setup_new_child_after_position(newChild, position)

        if newChild.previous:
            newChild.previous.next = newChild

        self._link_new_child_siblings(newChild, position)
        self.contents.insert(position, newChild)

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
    fetchNextSiblings = findNextSiblings # Compatibility with pre-3.x

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
    fetchPrevious = findAllPrevious # Compatibility with pre-3.x

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
    fetchPreviousSiblings = findPreviousSiblings # Compatibility with pre-3.x

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
    fetchParents = findParents # Compatibility with pre-3.x

    #These methods do the real heavy lifting.

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

    #These Generators can be used to navigate starting from both
    #NavigableStrings and Tags.
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

    # Utility methods
    def substituteEncoding(self, str, encoding=None):
        encoding = encoding or "utf-8"
        return str.replace("%SOUP-ENCODING%", encoding)

    def toEncoding(self, s, encoding=None):
        """Encodes an object to a string in some encoding, or to Unicode.
        ."""
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
                s  = self.toEncoding(str(s), encoding)
            else:
                s = unicode(s)
        return s

class NavigableString(unicode, PageElement):

    def __getnewargs__(self):
        return (NavigableString.__str__(self),)

    def __getattr__(self, attr):
        """text.string gives you text. This is for backwards
        compatibility for Navigable*String, but for CData* it lets you
        get the string without the CData wrapper."""
        if attr == 'string':
            return self
        else:
            raise AttributeError, "'%s' object has no attribute '%s'" % (self.__class__.__name__, attr)

    def __unicode__(self):
        return unicode(str(self), DEFAULT_OUTPUT_ENCODING) # Changed by Kovid

    def __str__(self, encoding=DEFAULT_OUTPUT_ENCODING):
        if encoding:
            return self.encode(encoding)
        else:
            return self

class CData(NavigableString):

    def __str__(self, encoding=DEFAULT_OUTPUT_ENCODING):
        return "<![CDATA[%s]]>" % NavigableString.__str__(self, encoding)

class ProcessingInstruction(NavigableString):
    def __str__(self, encoding=DEFAULT_OUTPUT_ENCODING):
        output = self
        if "%SOUP-ENCODING%" in output:
            output = self.substituteEncoding(output, encoding)
        return "<?%s?>" % self.toEncoding(output, encoding)

class Comment(NavigableString):
    def __str__(self, encoding=DEFAULT_OUTPUT_ENCODING):
        return "<!--%s-->" % NavigableString.__str__(self, encoding)

class Declaration(NavigableString):
    def __str__(self, encoding=DEFAULT_OUTPUT_ENCODING):
        return "<!%s>" % NavigableString.__str__(self, encoding)

class Tag(PageElement):

    """Represents a found HTML tag with its attributes and contents."""

    def _invert(h):
        "Cheap function to invert a hash."
        i = {}
        for k,v in h.items():
            i[v] = k
        return i

    XML_ENTITIES_TO_SPECIAL_CHARS = { "apos" : "'",
                                      "quot" : '"',
                                      "amp" : "&",
                                      "lt" : "<",
                                      "gt" : ">" }

    XML_SPECIAL_CHARS_TO_ENTITIES = _invert(XML_ENTITIES_TO_SPECIAL_CHARS)

    def _convertEntities(self, match):
        """Used in a call to re.sub to replace HTML, XML, and numeric
        entities with the appropriate Unicode characters. If HTML
        entities are being converted, any unrecognized entities are
        escaped."""
        x = match.group(1)
        if self.convertHTMLEntities and x in name2codepoint:
            return unichr(name2codepoint[x])
        elif x in self.XML_ENTITIES_TO_SPECIAL_CHARS:
            if self.convertXMLEntities:
                return self.XML_ENTITIES_TO_SPECIAL_CHARS[x]
            else:
                return u'&%s;' % x
        elif len(x) > 0 and x[0] == '#':
            if len(x) > 1 and x[1] == 'x':
                return unichr(int(x[2:], 16))
            else:
                return unichr(int(x[1:]))
        elif self.escapeUnrecognizedEntities:
            return u'&amp;%s;' % x
        else:
            return u'&%s;' % x

    def __init__(self, parser, name, attrs=None, parent=None,
                 previous=None):
        "Basic constructor."
        self.parserClass = parser.__class__
        self.isSelfClosing = parser.isSelfClosingTag(name)
        self.name = name
        if attrs == None:
            attrs = []
        self.attrs = attrs
        self.contents = []
        self.setup(parent, previous)
        self.hidden = False
        self.containsSubstitutions = False
        self.convertHTMLEntities = parser.convertHTMLEntities
        self.convertXMLEntities = parser.convertXMLEntities
        self.escapeUnrecognizedEntities = parser.escapeUnrecognizedEntities
        convert = lambda(k, val): (k,
                                   re.sub("&(#\d+|#x[0-9a-fA-F]+|\w+);",
                                          self._convertEntities,
                                          val))
        self.attrs = map(convert, self.attrs)

    def get(self, key, default=None):
        """Returns the value of the 'key' attribute for the tag, or
        the value given for 'default' if it doesn't have that
        attribute."""
        return self._getAttrMap().get(key, default)

    def has_key(self, key):
        return self._getAttrMap().has_key(key)

    def __getitem__(self, key):
        """tag[key] returns the value of the 'key' attribute for the tag,
        and throws an exception if it's not there."""
        return self._getAttrMap()[key]

    def __iter__(self):
        "Iterating over a tag iterates over its contents."
        return iter(self.contents)

    def __len__(self):
        "The length of a tag is the length of its list of contents."
        return len(self.contents)

    def __contains__(self, x):
        return x in self.contents

    def __nonzero__(self):
        "A tag is non-None even if it has no contents."
        return True

    def __setitem__(self, key, value):
        """Setting tag[key] sets the value of the 'key' attribute for the
        tag."""
        self._getAttrMap()
        self.attrMap[key] = value
        found = False
        for i in range(0, len(self.attrs)):
            if self.attrs[i][0] == key:
                self.attrs[i] = (key, value)
                found = True
        if not found:
            self.attrs.append((key, value))
        self._getAttrMap()[key] = value

    def __delitem__(self, key):
        """Delete all occurrences of key from the attribute list."""
        for item in self.attrs:
            if item[0] == key:
                self.attrs.remove(item)
            self._getAttrMap()
            if self.attrMap.has_key(key):
                del self.attrMap[key]

    def __call__(self, *args, **kwargs):
        """Calling a tag like a function is the same as calling its
        findAll() method. Eg. tag('a') returns a list of all the A tags
        found within this tag."""
        return apply(self.findAll, args, kwargs)

    def __getattr__(self, tag):
        if len(tag) > 3 and tag.rfind('Tag') == len(tag)-3:
            return self.find(tag[:-3])
        elif tag.find('__') != 0:
            return self.find(tag)
        raise AttributeError, "'%s' object has no attribute '%s'" % (self.__class__, tag)

    def __eq__(self, other):
        """Returns true iff this tag has the same name, the same attributes,
        and the same contents (recursively) as the given tag."""
        if not hasattr(other, 'name') or not hasattr(other, 'attrs') or not hasattr(other, 'contents') or self.name != other.name or self.attrs != other.attrs or len(self) != len(other):
            return False
        for i in range(0, len(self.contents)):
            if self.contents[i] != other.contents[i]:
                return False
        return True

    def __ne__(self, other):
        """Returns true iff this tag is not identical to the other tag,
        as defined in __eq__."""
        return not self == other

    def __repr__(self, encoding=DEFAULT_OUTPUT_ENCODING):
        """Renders this tag as a string."""
        return self.__str__(encoding)

    def __unicode__(self):
        return self.__str__(None)

    BARE_AMPERSAND_OR_BRACKET = re.compile("([<>]|"
                                           + "&(?!#\d+;|#x[0-9a-fA-F]+;|\w+;)"
                                           + ")")

    def _sub_entity(self, x):
        """Used with a regular expression to substitute the
        appropriate XML entity for an XML special character."""
        return "&" + self.XML_SPECIAL_CHARS_TO_ENTITIES[x.group(0)[0]] + ";"

    def __str__(self, encoding=DEFAULT_OUTPUT_ENCODING,
                prettyPrint=False, indentLevel=0):
        """Returns a string or Unicode representation of this tag and
        its contents. To get Unicode, pass None for encoding."""
        encodedName = self.toEncoding(self.name, encoding)
        attrs = []
        if self.attrs:
            for key, val in self.attrs:
                fmt = '%s="%s"'
                if isString(val):
                    if self.containsSubstitutions and '%SOUP-ENCODING%' in val:
                        val = self.substituteEncoding(val, encoding)
                    if '"' in val:
                        fmt = "%s='%s'"
                        if "'" in val:
                            val = val.replace("'", "&squot;")
                    val = self.BARE_AMPERSAND_OR_BRACKET.sub(self._sub_entity, val)
                attrs.append(fmt % (self.toEncoding(key, encoding),
                                    self.toEncoding(val, encoding)))
        close = ''
        closeTag = ''
        if self.isSelfClosing:
            close = ' /'
        else:
            closeTag = '</%s>' % encodedName
        indentTag, indentContents = 0, 0
        if prettyPrint:
            indentTag = indentLevel
            space = (' ' * (indentTag-1))
            indentContents = indentTag + 1
        contents = self.renderContents(encoding, prettyPrint, indentContents)
        if self.hidden:
            s = contents
        else:
            s = []
            attributeString = ''
            if attrs:
                attributeString = ' ' + ' '.join(attrs)
            if prettyPrint:
                s.append(space)
            s.append('<%s%s%s>' % (encodedName, attributeString, close))
            if prettyPrint:
                s.append("\n")
            s.append(contents)
            if prettyPrint and contents and contents[-1] != "\n":
                s.append("\n")
            if prettyPrint and closeTag:
                s.append(space)
            s.append(closeTag)
            if prettyPrint and closeTag and self.nextSibling:
                s.append("\n")
            s = ''.join(s)
        return s

    def prettify(self, encoding=DEFAULT_OUTPUT_ENCODING):
        return self.__str__(encoding, True)

    def renderContents(self, encoding=DEFAULT_OUTPUT_ENCODING,
                       prettyPrint=False, indentLevel=0):
        """Renders the contents of this tag as a string in the given
        encoding. If encoding is None, returns a Unicode string.."""
        s=[]
        for c in self:
            text = None
            if isinstance(c, NavigableString):
                text = c.__str__(encoding)
            elif isinstance(c, Tag):
                s.append(c.__str__(encoding, prettyPrint, indentLevel))
            if text and prettyPrint:
                text = text.strip()
            if text:
                if prettyPrint:
                    s.append(" " * (indentLevel-1))
                s.append(text)
                if prettyPrint:
                    s.append("\n")
        return ''.join(s)

    #Soup methods

    def find(self, name=None, attrs={}, recursive=True, text=None,
             **kwargs):
        """Return only the first child of this Tag matching the given
        criteria."""
        r = None
        l = self.findAll(name, attrs, recursive, text, 1, **kwargs)
        if l:
            r = l[0]
        return r
    findChild = find

    def findAll(self, name=None, attrs={}, recursive=True, text=None,
                limit=None, **kwargs):
        """Extracts a list of Tag objects that match the given
        criteria."""
        generator = self.recursiveChildGenerator
        if not recursive:
            generator = self.childGenerator
        return self._findAll(name, attrs, text, limit, generator, **kwargs)
    findChildren = findAll

    # Pre-3.x compatibility methods
    first = find
    fetch = findAll

    def fetchText(self, text=None, recursive=True, limit=None):
        return self.findAll(text=text, recursive=recursive, limit=limit)

    def firstText(self, text=None, recursive=True):
        return self.find(text=text, recursive=recursive)

    #Private methods

    def _getAttrMap(self):
        """Initializes a map representation of this tag's attributes,
        if not already initialized."""
        if not getattr(self, 'attrMap'):
            self.attrMap = {}
            for (key, value) in self.attrs:
                self.attrMap[key] = value
        return self.attrMap

    #Generator methods
    def childGenerator(self):
        for i in range(0, len(self.contents)):
            yield self.contents[i]
        raise StopIteration

    def recursiveChildGenerator(self):
        stack = [(self, 0)]
        while stack:
            tag, start = stack.pop()
            if isinstance(tag, Tag):
                for i in range(start, len(tag.contents)):
                    a = tag.contents[i]
                    yield a
                    if isinstance(a, Tag) and tag.contents:
                        if i < len(tag.contents) - 1:
                            stack.append((tag, i+1))
                        stack.append((a, 0))
                        break
        raise StopIteration

class SoupStrainer:
    """Encapsulates a number of ways of matching a markup element (tag or
    text)."""

    def __init__(self, name=None, attrs={}, text=None, **kwargs):
        self.name = name
        if isString(attrs):
            kwargs['class'] = attrs
            attrs = None
        if kwargs:
            if attrs:
                attrs = attrs.copy()
                attrs.update(kwargs)
            else:
                attrs = kwargs
        self.attrs = attrs
        self.text = text

    def __str__(self):
        if self.text:
            return self.text
        else:
            return "%s|%s" % (self.name, self.attrs)

    def searchTag(self, markupName=None, markupAttrs={}):
        found = None
        markup = None
        if isinstance(markupName, Tag):
            markup = markupName
            markupAttrs = markup
        callFunctionWithTagData = callable(self.name) \
                                and not isinstance(markupName, Tag)

        if (not self.name) \
               or callFunctionWithTagData \
               or (markup and self._matches(markup, self.name)) \
               or (not markup and self._matches(markupName, self.name)):
            if callFunctionWithTagData:
                match = self.name(markupName, markupAttrs)
            else:
                match = True
                markupAttrMap = None
                for attr, matchAgainst in self.attrs.items():
                    if not markupAttrMap:
                         if hasattr(markupAttrs, 'get'):
                            markupAttrMap = markupAttrs
                         else:
                            markupAttrMap = {}
                            for k,v in markupAttrs:
                                markupAttrMap[k] = v
                    attrValue = markupAttrMap.get(attr)
                    if not self._matches(attrValue, matchAgainst):
                        match = False
                        break
            if match:
                if markup:
                    found = markup
                else:
                    found = markupName
        return found

    def search(self, markup):
        found = None
        if isList(markup) and not isinstance(markup, Tag):
            for element in markup:
                if isinstance(element, NavigableString) \
                       and self.search(element):
                    found = element
                    break
        elif isinstance(markup, Tag):
            if not self.text:
                found = self.searchTag(markup)
        elif isinstance(markup, NavigableString) or \
                 isString(markup):
            if self._matches(markup, self.text):
                found = markup
        else:
            raise Exception, "I don't know how to match against a %s" \
                  % markup.__class__
        return found

    def _matches(self, markup, matchAgainst):
        result = False
        if matchAgainst == True and type(matchAgainst) == types.BooleanType:
            result = markup != None
        elif callable(matchAgainst):
            result = matchAgainst(markup)
        else:
            if isinstance(markup, Tag):
                markup = markup.name
            if markup and not isString(markup):
                markup = unicode(markup)
            if hasattr(matchAgainst, 'match'):
                result = markup and matchAgainst.search(markup)
            elif isList(matchAgainst):
                result = markup in matchAgainst
            elif hasattr(matchAgainst, 'items'):
                result = markup.has_key(matchAgainst)
            elif matchAgainst and isString(markup):
                if isinstance(markup, unicode):
                    matchAgainst = unicode(matchAgainst)
                else:
                    matchAgainst = str(matchAgainst)
            if not result:
                result = matchAgainst == markup
        return result

class ResultSet(list):
    """A ResultSet is just a list that keeps track of the SoupStrainer
    that created it."""
    def __init__(self, source):
        list.__init__([])
        self.source = source

def isList(l):
    """Convenience method that works with all 2.x versions of Python
    to determine whether or not something is listlike."""
    return hasattr(l, '__iter__') \
           or (type(l) in (types.ListType, types.TupleType))

def isString(s):
    """Convenience method that works with all 2.x versions of Python
    to determine whether or not something is stringlike."""
    try:
        return isinstance(s, unicode) or isinstance(s, basestring)
    except NameError:
        return isinstance(s, str)

def buildTagMap(default, *args):
    """Turns a list of maps, lists, or scalars into a single map."""
    built = {}
    for portion in args:
        if hasattr(portion, 'items'):
            for k,v in portion.items():
                built[k] = v
        elif isList(portion):
            for k in portion:
                built[k] = default
        else:
            built[portion] = default
    return built

class BeautifulStoneSoup(Tag, SGMLParser):
    """Base parser for XML/SGML."""
    SELF_CLOSING_TAGS = {}
    NESTABLE_TAGS = {}
    RESET_NESTING_TAGS = {}
    QUOTE_TAGS = {}
    PRESERVE_WHITESPACE_TAGS = frozenset()
    MARKUP_MASSAGE = [(re.compile('(<[^<>]*)/>'),
                       lambda x: x.group(1) + ' />'),
                      (re.compile('<!\s+([^<>]*)>'),
                       lambda x: '<!' + x.group(1) + '>')]
    ROOT_TAG_NAME = u'[document]'
    HTML_ENTITIES = "html"
    XML_ENTITIES = "xml"
    XHTML_ENTITIES = "xhtml"
    ALL_ENTITIES = XHTML_ENTITIES
    STRIP_ASCII_SPACES = { 9: None, 10: None, 12: None, 13: None, 32: None, }

    def __init__(self, markup="", parseOnlyThese=None, fromEncoding=None,
                 markupMassage=True, smartQuotesTo=XML_ENTITIES,
                 convertEntities=None, selfClosingTags=None):
        self.parseOnlyThese = parseOnlyThese
        self.fromEncoding = fromEncoding
        self.smartQuotesTo = smartQuotesTo
        self.convertEntities = convertEntities
        if self.convertEntities:
            self.smartQuotesTo = None
            if convertEntities == self.HTML_ENTITIES:
                self.convertXMLEntities = False
                self.convertHTMLEntities = True
                self.escapeUnrecognizedEntities = True
            elif convertEntities == self.XHTML_ENTITIES:
                self.convertXMLEntities = True
                self.convertHTMLEntities = True
                self.escapeUnrecognizedEntities = False
            elif convertEntities == self.XML_ENTITIES:
                self.convertXMLEntities = True
                self.convertHTMLEntities = False
                self.escapeUnrecognizedEntities = False
        else:
            self.convertXMLEntities = False
            self.convertHTMLEntities = False
            self.escapeUnrecognizedEntities = False
        self.instanceSelfClosingTags = buildTagMap(None, selfClosingTags)
        SGMLParser.__init__(self)
        if hasattr(markup, 'read'):
            markup = markup.read()
        self.markup = markup
        self.markupMassage = markupMassage
        try:
            self._feed()
        except StopParsing:
            pass
        self.markup = None

    def convert_charref(self, name):
        try:
            n = int(name)
        except ValueError:
            return
        if not 0 <= n <= 127 :
            return
        return self.convert_codepoint(n)

    def _feed(self, inDocumentEncoding=None):
        markup = self.markup
        if isinstance(markup, unicode):
            if not hasattr(self, 'originalEncoding'):
                self.originalEncoding = None
        else:
            markup, self.originalEncoding = chardet.xml_to_unicode(markup)
        if markup:
            if self.markupMassage:
                if not isList(self.markupMassage):
                    self.markupMassage = self.MARKUP_MASSAGE
                for fix, m in self.markupMassage:
                    markup = fix.sub(m, markup)
                del(self.markupMassage)
                self.markup = markup
        self.reset()
        SGMLParser.feed(self, markup)
        self.endData()
        while self.currentTag.name != self.ROOT_TAG_NAME:
            self.popTag()

    def __getattr__(self, methodName):
        if methodName.find('start_') == 0 or methodName.find('end_') == 0 \
               or methodName.find('do_') == 0:
            return SGMLParser.__getattr__(self, methodName)
        elif methodName.find('__') != 0:
            return Tag.__getattr__(self, methodName)
        else:
            raise AttributeError

    def isSelfClosingTag(self, name):
        return self.SELF_CLOSING_TAGS.has_key(name) \
               or self.instanceSelfClosingTags.has_key(name)

    def reset(self):
        Tag.__init__(self, self, self.ROOT_TAG_NAME)
        self.hidden = 1
        SGMLParser.reset(self)
        self.currentData = []
        self.currentTag = None
        self.tagStack = []
        self.quoteStack = []
        self.pushTag(self)

    def popTag(self):
        self.tagStack.pop()
        if len(self.currentTag.contents) == 1 and \
           isinstance(self.currentTag.contents[0], NavigableString):
            self.currentTag.string = self.currentTag.contents[0]
        if self.tagStack:
            self.currentTag = self.tagStack[-1]
        return self.currentTag

    def pushTag(self, tag):
        if self.currentTag:
            self.currentTag.contents.append(tag)
        self.tagStack.append(tag)
        self.currentTag = self.tagStack[-1]

    def endData(self, containerClass=NavigableString):
        if self.currentData:
            currentData = ''.join(self.currentData)
            if ( (not currentData.translate(self.STRIP_ASCII_SPACES)) and (
                    not frozenset(tag.name for tag in self.tagStack).intersection(
                        self.PRESERVE_WHITESPACE_TAGS))):
                if '\n' in currentData:
                    currentData = '\n'
                else:
                    currentData = ' '
            self.currentData = []
            if self.parseOnlyThese and len(self.tagStack) <= 1 and \
                   (not self.parseOnlyThese.text or \
                    not self.parseOnlyThese.search(currentData)):
                return
            o = containerClass(currentData)
            o.setup(self.currentTag, self.previous)
            if self.previous:
                self.previous.next = o
            self.previous = o
            self.currentTag.contents.append(o)

    def _popToTag(self, name, inclusivePop=True):
        if name == self.ROOT_TAG_NAME:
            return
        numPops = 0
        mostRecentTag = None
        for i in range(len(self.tagStack)-1, 0, -1):
            if name == self.tagStack[i].name:
                numPops = len(self.tagStack)-i
                break
        if not inclusivePop:
            numPops = numPops - 1
        for i in range(0, numPops):
            mostRecentTag = self.popTag()
        return mostRecentTag

    def _smartPop(self, name):
        nestingResetTriggers = self.NESTABLE_TAGS.get(name)
        isNestable = nestingResetTriggers != None
        isResetNesting = self.RESET_NESTING_TAGS.has_key(name)
        popTo = None
        inclusive = True
        for i in range(len(self.tagStack)-1, 0, -1):
            p = self.tagStack[i]
            if (not p or p.name == name) and not isNestable:
                popTo = name
                break
            if (nestingResetTriggers != None
                and p.name in nestingResetTriggers) \
                or (nestingResetTriggers == None and isResetNesting
                    and self.RESET_NESTING_TAGS.has_key(p.name)):
                popTo = p.name
                inclusive = False
                break
            p = p.parent
        if popTo:
            self._popToTag(popTo, inclusive)

    def unknown_starttag(self, name, attrs, selfClosing=0):
        if self.quoteStack:
            attrs = ''.join(map(lambda(x, y): ' %s="%s"' % (x, y), attrs))
            self.handle_data('<%s%s>' % (name, attrs))
            return
        self.endData()
        if not self.isSelfClosingTag(name) and not selfClosing:
            self._smartPop(name)
        if self.parseOnlyThese and len(self.tagStack) <= 1 \
               and (self.parseOnlyThese.text or not self.parseOnlyThese.searchTag(name, attrs)):
            return
        tag = Tag(self, name, attrs, self.currentTag, self.previous)
        if self.previous:
            self.previous.next = tag
        self.previous = tag
        self.pushTag(tag)
        if selfClosing or self.isSelfClosingTag(name):
            self.popTag()
        if name in self.QUOTE_TAGS:
            self.quoteStack.append(name)
            self.literal = 1
        return tag

    def unknown_endtag(self, name):
        if self.quoteStack and self.quoteStack[-1] != name:
            self.handle_data('</%s>' % name)
            return
        self.endData()
        self._popToTag(name)
        if self.quoteStack and self.quoteStack[-1] == name:
            self.quoteStack.pop()
            self.literal = (len(self.quoteStack) > 0)

    def handle_data(self, data):
        self.currentData.append(data)

    def _toStringSubclass(self, text, subclass):
        self.endData()
        self.handle_data(text)
        self.endData(subclass)

    def handle_pi(self, text):
        if text[:3] == "xml":
            text = u"xml version='1.0' encoding='%SOUP-ENCODING%'"
        self._toStringSubclass(text, ProcessingInstruction)

    def handle_comment(self, text):
        "Handle comments as Comment objects."
        self._toStringSubclass(text, Comment)

    def handle_charref(self, ref):
        "Handle character references as data."
        if self.convertEntities:
            if ref.lower().startswith('x'): #
                ref = int(ref[1:], 16)
            try:
                data = unichr(int(ref))
            except ValueError:
                data = u''
        else:
            data = '&#%s;' % ref
        self.handle_data(data)

    def handle_entityref(self, ref):
        data = None
        if self.convertHTMLEntities:
            try:
                data = unichr(name2codepoint[ref])
            except KeyError:
                pass
        if not data and self.convertXMLEntities:
                data = self.XML_ENTITIES_TO_SPECIAL_CHARS.get(ref)
        if not data and self.convertHTMLEntities and \
            not self.XML_ENTITIES_TO_SPECIAL_CHARS.get(ref):
                data = "&amp;%s" % ref
        if not data:
            data = "&%s;" % ref
        self.handle_data(data)

    def handle_decl(self, data):
        "Handle DOCTYPEs and the like as Declaration objects."
        self._toStringSubclass(data, Declaration)

    def parse_declaration(self, i):
        j = None
        if self.rawdata[i:i+9] == '<![CDATA[':
             k = self.rawdata.find(']]>', i)
             if k == -1:
                 k = len(self.rawdata)
             data = self.rawdata[i+9:k]
             j = k+3
             self._toStringSubclass(data, CData)
        else:
            try:
                j = SGMLParser.parse_declaration(self, i)
            except SGMLParseError:
                toHandle = self.rawdata[i:]
                self.handle_data(toHandle)
                j = i + len(toHandle)
        return j

class BeautifulSoup(BeautifulStoneSoup):
    """HTML parser with additional heuristics."""
    def __init__(self, *args, **kwargs):
        if not kwargs.has_key('smartQuotesTo'):
            kwargs['smartQuotesTo'] = self.HTML_ENTITIES
        BeautifulStoneSoup.__init__(self, *args, **kwargs)

    SELF_CLOSING_TAGS = buildTagMap(None,
                                    ['br' , 'hr', 'input', 'img', 'meta',
                                    'spacer', 'link', 'frame', 'base'])
    PRESERVE_WHITESPACE_TAGS = frozenset(('pre', 'textarea'))
    QUOTE_TAGS = {'script' : None, 'textarea' : None}
    NESTABLE_INLINE_TAGS = ['span', 'font', 'q', 'object', 'bdo', 'sub', 'sup',
                            'center']
    NESTABLE_BLOCK_TAGS = ['blockquote', 'div', 'fieldset', 'ins', 'del',
            'article', 'aside', 'header', 'footer', 'nav', 'figcaption', 'figure', 'section']
    NESTABLE_LIST_TAGS = { 'ol' : [],
                           'ul' : [],
                           'li' : ['ul', 'ol'],
                           'dl' : [],
                           'dd' : ['dl'],
                           'dt' : ['dl'] }
    NESTABLE_TABLE_TAGS = {'table' : [],
                           'tr' : ['table', 'tbody', 'tfoot', 'thead'],
                           'td' : ['tr'],
                           'th' : ['tr'],
                           'thead' : ['table'],
                           'tbody' : ['table'],
                           'tfoot' : ['table'],
                           }
    NON_NESTABLE_BLOCK_TAGS = ['address', 'form', 'p', 'pre']
    RESET_NESTING_TAGS = buildTagMap(None, NESTABLE_BLOCK_TAGS, 'noscript',
                                     NON_NESTABLE_BLOCK_TAGS,
                                     NESTABLE_LIST_TAGS,
                                     NESTABLE_TABLE_TAGS)
    NESTABLE_TAGS = buildTagMap([], NESTABLE_INLINE_TAGS, NESTABLE_BLOCK_TAGS,
                                NESTABLE_LIST_TAGS, NESTABLE_TABLE_TAGS)
    CHARSET_RE = re.compile("((^|;)\s*charset=)([^;]*)")

    def start_meta(self, attrs):
        """Detect charset in META tag and possibly re-parse."""
        httpEquiv = None
        contentType = None
        contentTypeIndex = None
        tagNeedsEncodingSubstitution = False
        for i in range(0, len(attrs)):
            key, value = attrs[i]
            key = key.lower()
            if key == 'http-equiv':
                httpEquiv = value
            elif key == 'content':
                contentType = value
                contentTypeIndex = i
        if httpEquiv and contentType:
            match = self.CHARSET_RE.search(contentType)
            if match:
                if getattr(self, 'declaredHTMLEncoding') or \
                       (self.originalEncoding == self.fromEncoding):
                    newAttr = self.CHARSET_RE.sub\
                              (lambda(match):match.group(1) +
                               "%SOUP-ENCODING%", value)
                    attrs[contentTypeIndex] = (attrs[contentTypeIndex][0],
                                               newAttr)
                    tagNeedsEncodingSubstitution = True
                else:
                    newCharset = match.group(3)
                    if newCharset and newCharset != self.originalEncoding:
                        self.declaredHTMLEncoding = newCharset
                        self._feed(self.declaredHTMLEncoding)
                        raise StopParsing
        tag = self.unknown_starttag("meta", attrs)
        if tag and tagNeedsEncodingSubstitution:
            tag.containsSubstitutions = True

class StopParsing(Exception):
    pass

class ICantBelieveItsBeautifulSoup(BeautifulSoup):
    """Handles nested bold tags and similar edge cases."""
    I_CANT_BELIEVE_THEYRE_NESTABLE_INLINE_TAGS = \
     ['em', 'big', 'i', 'small', 'tt', 'abbr', 'acronym', 'strong',
      'cite', 'code', 'dfn', 'kbd', 'samp', 'strong', 'var', 'b',
      'big']
    I_CANT_BELIEVE_THEYRE_NESTABLE_BLOCK_TAGS = ['noscript']
    NESTABLE_TAGS = buildTagMap([], BeautifulSoup.NESTABLE_TAGS,
                                I_CANT_BELIEVE_THEYRE_NESTABLE_BLOCK_TAGS,
                                I_CANT_BELIEVE_THEYRE_NESTABLE_INLINE_TAGS)

class MinimalSoup(BeautifulSoup):
    """Parses badly formed HTML without nesting assumptions."""
    RESET_NESTING_TAGS = buildTagMap('noscript')
    NESTABLE_TAGS = {}

class BeautifulSOAP(BeautifulStoneSoup):
    """Converts single-string child tags into attributes."""
    def popTag(self):
        if len(self.tagStack) > 1:
            tag = self.tagStack[-1]
            parent = self.tagStack[-2]
            parent._getAttrMap()
            if (isinstance(tag, Tag) and len(tag.contents) == 1 and
                isinstance(tag.contents[0], NavigableString) and
                not parent.attrMap.has_key(tag.name)):
                parent[tag.name] = tag.contents[0]
        BeautifulStoneSoup.popTag(self)

class RobustXMLParser(BeautifulStoneSoup):
    pass
class RobustHTMLParser(BeautifulSoup):
    pass
class RobustWackAssHTMLParser(ICantBelieveItsBeautifulSoup):
    pass
class RobustInsanelyWackAssHTMLParser(MinimalSoup):
    pass
class SimplifyingSOAPParser(BeautifulSOAP):
    pass

# By default, act as an HTML pretty-printer.
if __name__ == '__main__':
    import sys
    soup = BeautifulSoup(sys.stdin.read())
    print soup.prettify()