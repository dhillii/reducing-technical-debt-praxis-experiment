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

    def replace_with(self, replace_with):
        """Replaces this element with another."""
        old_parent = self.parent
        my_index = self.parent.contents.index(self)
        if hasattr(replace_with, 'parent') and replace_with.parent == self.parent:
            # We're replacing this element with one of its siblings.
            index = self.parent.contents.index(replace_with)
            if index and index < my_index:
                # Furthermore, it comes before this element. That
                # means that when we extract it, the index of this
                # element will change.
                my_index = my_index - 1
        self.extract()
        old_parent.insert(my_index, replace_with)

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

        # Find the two elements that would be next to each other if
        # this element (and any children) hadn't been parsed. Connect
        # the two.
        last_child = self._last_recursive_child()
        next_element = last_child.next

        if self.previous:
            self.previous.next = next_element
        if next_element:
            next_element.previous = self.previous
        self.previous = None
        last_child.next = None

        self.parent = None
        if self.previousSibling:
            self.previousSibling.nextSibling = self.nextSibling
        if self.nextSibling:
            self.nextSibling.previousSibling = self.previousSibling
        self.previousSibling = self.nextSibling = None

    def _last_recursive_child(self):
        """Finds the last element beneath this object to be parsed."""
        last_child = self
        while hasattr(last_child, 'contents') and last_child.contents:
            last_child = last_child.contents[-1]
        return last_child

    def insert(self, position, new_child):
        """Inserts a new child at the specified position."""
        if (isinstance(new_child, basestring)
            or isinstance(new_child, unicode)) \
            and not isinstance(new_child, NavigableString):
            new_child = NavigableString(new_child)

        position = min(position, len(self.contents))
        if hasattr(new_child, 'parent') and new_child.parent != None:
            # We're 'inserting' an element that's already one
            # of this object's children.
            if new_child.parent == self:
                index = self.find(new_child)
                if index and index < position:
                    # Furthermore we're moving it further down the
                    # list of this object's children. That means that
                    # when we extract this element, our target index
                    # will jump down one.
                    position = position - 1
            new_child.extract()

        new_child.parent = self
        previous_child = None
        if position == 0:
            new_child.previousSibling = None
            new_child.previous = self
        else:
            previous_child = self.contents[position-1]
            new_child.previousSibling = previous_child
            new_child.previousSibling.nextSibling = new_child
            new_child.previous = previous_child._last_recursive_child()
        if new_child.previous:
            new_child.previous.next = new_child

        new_childs_last_element = new_child._last_recursive_child()

        if position >= len(self.contents):
            new_child.nextSibling = None

            parent = self
            parents_next_sibling = None
            while not parents_next_sibling:
                parents_next_sibling = parent.nextSibling
                parent = parent.parent
                if not parent: # This is the last element in the document.
                    break
            if parents_next_sibling:
                new_childs_last_element.next = parents_next_sibling
            else:
                new_childs_last_element.next = None
        else:
            next_child = self.contents[position]
            new_child.nextSibling = next_child
            if new_child.nextSibling:
                new_child.nextSibling.previousSibling = new_child
            new_childs_last_element.next = next_child

        if new_childs_last_element.next:
            new_childs_last_element.next.previous = new_childs_last_element
        self.contents.insert(position, new_child)

    def append(self, tag):
        """Appends the given tag to the contents of this tag."""
        self.insert(len(self.contents), tag)

    def find_next(self, name=None, attrs={}, text=None, **kwargs):
        """Returns the first item that matches the given criteria and
        appears after this Tag in the document."""
        return self._find_one(self.find_all_next, name, attrs, text, **kwargs)

    def find_all_next(self, name=None, attrs={}, text=None, limit=None,
                    **kwargs):
        """Returns all items that match the given criteria and appear
        before after Tag in the document."""
        return self._find_all(name, attrs, text, limit, self.next_generator)

    def find_next_sibling(self, name=None, attrs={}, text=None, **kwargs):
        """Returns the closest sibling to this Tag that matches the
        given criteria and appears after this Tag in the document."""
        return self._find_one(self.find_next_siblings, name, attrs, text,
                             **kwargs)

    def find_next_siblings(self, name=None, attrs={}, text=None, limit=None,
                         **kwargs):
        """Returns the siblings of this Tag that match the given
        criteria and appear after this Tag in the document."""
        return self._find_all(name, attrs, text, limit,
                             self.next_sibling_generator, **kwargs)
    fetch_next_siblings = find_next_siblings # Compatibility with pre-3.x

    def find_previous(self, name=None, attrs={}, text=None, **kwargs):
        """Returns the first item that matches the given criteria and
        appears before this Tag in the document."""
        return self._find_one(self.find_all_previous, name, attrs, text, **kwargs)

    def find_all_previous(self, name=None, attrs={}, text=None, limit=None,
                        **kwargs):
        """Returns all items that match the given criteria and appear
        before this Tag in the document."""
        return self._find_all(name, attrs, text, limit, self.previous_generator,
                           **kwargs)
    fetch_previous = find_all_previous # Compatibility with pre-3.x

    def find_previous_sibling(self, name=None, attrs={}, text=None, **kwargs):
        """Returns the closest sibling to this Tag that matches the
        given criteria and appears before this Tag in the document."""
        return self._find_one(self.find_previous_siblings, name, attrs, text,
                             **kwargs)

    def find_previous_siblings(self, name=None, attrs={}, text=None,
                             limit=None, **kwargs):
        """Returns the siblings of this Tag that match the given
        criteria and appear before this Tag in the document."""
        return self._find_all(name, attrs, text, limit,
                             self.previous_sibling_generator, **kwargs)
    fetch_previous_siblings = find_previous_siblings # Compatibility with pre-3.x

    def find_parent(self, name=None, attrs={}, **kwargs):
        """Returns the closest parent of this Tag that matches the given
        criteria."""
        # NOTE: We can't use _find_one because find_parents takes a different
        # set of arguments.
        r = None
        l = self.find_parents(name, attrs, 1)
        if l:
            r = l[0]
        return r

    def find_parents(self, name=None, attrs={}, limit=None, **kwargs):
        """Returns the parents of this Tag that match the given
        criteria."""

        return self._find_all(name, attrs, None, limit, self.parent_generator,
                             **kwargs)
    fetch_parents = find_parents # Compatibility with pre-3.x

    # These methods do the real heavy lifting.

    def _find_one(self, method, name, attrs, text, **kwargs):
        """Finds the first item that matches the given criteria."""
        r = None
        l = method(name, attrs, text, 1, **kwargs)
        if l:
            r = l[0]
        return r

    def _find_all(self, name, attrs, text, limit, generator, **kwargs):
        """Finds all items that match the given criteria."""
        if isinstance(name, SoupStrainer):
            strainer = name
        else:
            # Build a SoupStrainer
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

    # These Generators can be used to navigate starting from both
    # NavigableStrings and Tags.
    def next_generator(self):
        """Generates the next elements in the document."""
        i = self
        while i:
            i = i.next
            yield i

    def next_sibling_generator(self):
        """Generates the next siblings in the document."""
        i = self
        while i:
            i = i.nextSibling
            yield i

    def previous_generator(self):
        """Generates the previous elements in the document."""
        i = self
        while i:
            i = i.previous
            yield i

    def previous_sibling_generator(self):
        """Generates the previous siblings in the document."""
        i = self
        while i:
            i = i.previousSibling
            yield i

    def parent_generator(self):
        """Generates the parents in the document."""
        i = self
        while i:
            i = i.parent
            yield i

    # Utility methods
    def substitute_encoding(self, string, encoding=None):
        """Substitutes the encoding in the given string."""
        encoding = encoding or "utf-8"
        return string.replace("%SOUP-ENCODING%", encoding)

    def to_encoding(self, string, encoding=None):
        """Encodes the given string to the specified encoding."""
        if isinstance(string, unicode):
            if encoding:
                string = string.encode(encoding)
        elif isinstance(string, str):
            if encoding:
                string = string.encode(encoding)
            else:
                string = unicode(string)
        else:
            if encoding:
                string  = self.to_encoding(str(string), encoding)
            else:
                string = unicode(string)
        return string

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
            output = self.substitute_encoding(output, encoding)
        return "<?%s?>" % self.to_encoding(output, encoding)

class Comment(NavigableString):
    def __str__(self, encoding=DEFAULT_OUTPUT_ENCODING):
        return "<!--%s-->" % NavigableString.__str__(self, encoding)

class Declaration(NavigableString):
    def __str__(self, encoding=DEFAULT_OUTPUT_ENCODING):
        return "<!%s>" % NavigableString.__str__(self, encoding)

class Tag(PageElement):

    """Represents a found HTML tag with its attributes and contents."""

    def _invert(self, hash):
        """Inverts the given hash."""
        i = {}
        for k,v in hash.items():
            i[v] = k
        return i

    XML_ENTITIES_TO_SPECIAL_CHARS = { "apos" : "'",
                                      "quot" : '"',
                                      "amp" : "&",
                                      "lt" : "<",
                                      "gt" : ">" }

    XML_SPECIAL_CHARS_TO_ENTITIES = _invert(XML_ENTITIES_TO_SPECIAL_CHARS)

    def _convert_entities(self, match):
        """Used in a call to re.sub to replace HTML, XML, and numeric
        entities with the appropriate Unicode characters. If HTML
        entities are being converted, any unrecognized entities are
        escaped."""
        x = match.group(1)
        if self.convert_html_entities and x in name2codepoint:
            return unichr(name2codepoint[x])
        elif x in self.XML_ENTITIES_TO_SPECIAL_CHARS:
            if self.convert_xml_entities:
                return self.XML_ENTITIES_TO_SPECIAL_CHARS[x]
            else:
                return u'&%s;' % x
        elif len(x) > 0 and x[0] == '#':
            # Handle numeric entities
            if len(x) > 1 and x[1] == 'x':
                return unichr(int(x[2:], 16))
            else:
                return unichr(int(x[1:]))

        elif self.escape_unrecognized_entities:
            return u'&amp;%s;' % x
        else:
            return u'&%s;' % x

    def __init__(self, parser, name, attrs=None, parent=None,
                 previous=None):
        """Basic constructor."""

        # We don't actually store the parser object: that lets extracted
        # chunks be garbage-collected
        self.parser_class = parser.__class__
        self.is_self_closing = parser.is_self_closing_tag(name)
        self.name = name
        if attrs == None:
            attrs = []
        self.attrs = attrs
        self.contents = []
        self.setup(parent, previous)
        self.hidden = False
        self.contains_substitutions = False
        self.convert_html_entities = parser.convert_html_entities
        self.convert_xml_entities = parser.convert_xml_entities
        self.escape_unrecognized_entities = parser.escape_unrecognized_entities

        # Convert any HTML, XML, or numeric entities in the attribute values.
        convert = lambda(k, val): (k,
                                   re.sub("&(#\d+|#x[0-9a-fA-F]+|\w+);",
                                          self._convert_entities,
                                          val))
        self.attrs = map(convert, self.attrs)

    def get(self, key, default=None):
        """Returns the value of the 'key' attribute for the tag, or
        the value given for 'default' if it doesn't have that
        attribute."""
        return self._get_attr_map().get(key, default)

    def has_key(self, key):
        return self._get_attr_map().has_key(key)

    def __getitem__(self, key):
        """tag[key] returns the value of the 'key' attribute for the tag,
        and throws an exception if it's not there."""
        return self._get_attr_map()[key]

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
        self._get_attr_map()
        self.attr_map[key] = value
        found = False
        for i in range(0, len(self.attrs)):
            if self.attrs[i][0] == key:
                self.attrs[i] = (key, value)
                found = True
        if not found:
            self.attrs.append((key, value))
        self._get_attr_map()[key] = value

    def __delitem__(self, key):
        "Deleting tag[key] deletes all 'key' attributes for the tag."
        for item in self.attrs:
            if item[0] == key:
                self.attrs.remove(item)
                # We don't break because bad HTML can define the same
                # attribute multiple times.
            self._get_attr_map()
            if self.attr_map.has_key(key):
                del self.attr_map[key]

    def __call__(self, *args, **kwargs):
        """Calling a tag like a function is the same as calling its
        find_all() method. Eg. tag('a') returns a list of all the A tags
        found within this tag."""
        return apply(self.find_all, args, kwargs)

    def __getattr__(self, tag):
        # print "Getattr %s.%s" % (self.__class__, tag)
        if len(tag) > 3 and tag.rfind('Tag') == len(tag)-3:
            return self.find(tag[:-3])
        elif tag.find('__') != 0:
            return self.find(tag)
        raise AttributeError, "'%s' object has no attribute '%s'" % (self.__class__, tag)

    def __eq__(self, other):
        """Returns true iff this tag has the same name, the same attributes,
        and the same contents (recursively) as the given tag.

        NOTE: right now this will return false if two tags have the
        same attributes in a different order. Should this be fixed?"""
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
                pretty_print=False, indent_level=0):
        """Returns a string or Unicode representation of this tag and
        its contents. To get Unicode, pass None for encoding.

        NOTE: since Python's HTML parser consumes whitespace, this
        method is not certain to reproduce the whitespace present in
        the original string."""

        encoded_name = self.to_encoding(self.name, encoding)

        attrs = []
        if self.attrs:
            for key, val in self.attrs:
                fmt = '%s="%s"'
                if is_string(val):
                    if self.contains_substitutions and '%SOUP-ENCODING%' in val:
                        val = self.substitute_encoding(val, encoding)

                    # The attribute value either:
                    #
                    # * Contains no embedded double quotes or single quotes.
                    #   No problem: we enclose it in double quotes.
                    # * Contains embedded single quotes. No problem:
                    #   double quotes work here too.
                    # * Contains embedded double quotes. No problem:
                    #   we enclose it in single quotes.
                    # * Embeds both single _and_ double quotes. This
                    #   can't happen naturally, but it can happen if
                    #   you modify an attribute value after parsing
                    #   the document. Now we have a bit of a
                    #   problem. We solve it by enclosing the
                    #   attribute in single quotes, and escaping any
                    #   embedded single quotes to XML entities.
                    if '"' in val:
                        fmt = "%s='%s'"
                        if "'" in val:
                            # TODO: replace with apos when
                            # appropriate.
                            val = val.replace("'", "&squot;")

                    # Now we're okay w/r/t quotes. But the attribute
                    # value might also contain angle brackets, or
                    # ampersands that aren't part of entities. We need
                    # to escape those to XML entities too.
                    val = self.BARE_AMPERSAND_OR_BRACKET.sub(self._sub_entity, val)

                attrs.append(fmt % (self.to_encoding(key, encoding),
                                    self.to_encoding(val, encoding)))
        close = ''
        close_tag = ''
        if self.is_self_closing:
            close = ' /'
        else:
            close_tag = '</%s>' % encoded_name

        indent_tag, indent_contents = 0, 0
        if pretty_print:
            indent_tag = indent_level
            space = (' ' * (indent_tag-1))
            indent_contents = indent_tag + 1
        contents = self.render_contents(encoding, pretty_print, indent_contents)
        if self.hidden:
            s = contents
        else:
            s = []
            attribute_string = ''
            if attrs:
                attribute_string = ' ' + ' '.join(attrs)
            if pretty_print:
                s.append(space)
            s.append('<%s%s%s>' % (encoded_name, attribute_string, close))
            if pretty_print:
                s.append("\n")
            s.append(contents)
            if pretty_print and contents and contents[-1] != "\n":
                s.append("\n")
            if pretty_print and close_tag:
                s.append(space)
            s.append(close_tag)
            if pretty_print and close_tag and self.next_sibling:
                s.append("\n")
            s = ''.join(s)
        return s

    def prettify(self, encoding=DEFAULT_OUTPUT_ENCODING):
        return self.__str__(encoding, True)

    def render_contents(self, encoding=DEFAULT_OUTPUT_ENCODING,
                       pretty_print=False, indent_level=0):
        """Renders the contents of this tag as a string in the given
        encoding. If encoding is None, returns a Unicode string.."""
        s=[]
        for c in self:
            text = None
            if isinstance(c, NavigableString):
                text = c.__str__(encoding)
            elif isinstance(c, Tag):
                s.append(c.__str__(encoding, pretty_print, indent_level))
            if text and pretty_print:
                text = text.strip()
            if text:
                if pretty_print:
                    s.append(" " * (indent_level-1))
                s.append(text)
                if pretty_print:
                    s.append("\n")
        return ''.join(s)

    # Soup methods

    def find(self, name=None, attrs={}, recursive=True, text=None,
             **kwargs):
        """Return only the first child of this Tag matching the given
        criteria."""
        r = None
        l = self.find_all(name, attrs, recursive, text, 1, **kwargs)
        if l:
            r = l[0]
        return r
    find_child = find

    def find_all(self, name=None, attrs={}, recursive=True, text=None,
                limit=None, **kwargs):
        """Extracts a list of Tag objects that match the given
        criteria.  You can specify the name of the Tag and any
        attributes you want the Tag to have.

        The value of a key-value pair in the 'attrs' map can be a
        string, a list of strings, a regular expression object, or a
        callable that takes a string and returns whether or not the
        string matches for some custom definition of 'matches'. The
        same is true of the tag name."""
        generator = self.recursive_child_generator
        if not recursive:
            generator = self.child_generator
        return self._find_all(name, attrs, text, limit, generator, **kwargs)
    find_children = find_all

    # Pre-3.x compatibility methods
    first = find
    fetch = find_all

    def fetch_text(self, text=None, recursive=True, limit=None):
        return self.find_all(text=text, recursive=recursive, limit=limit)

    def first_text(self, text=None, recursive=True):
        return self.find(text=text, recursive=recursive)

    # Private methods

    def _get_attr_map(self):
        """Initializes a map representation of this tag's attributes,
        if not already initialized."""
        if not getattr(self, 'attr_map'):
            self.attr_map = {}
            for (key, value) in self.attrs:
                self.attr_map[key] = value
        return self.attr_map

    # Generator methods
    def child_generator(self):
        for i in range(0, len(self.contents)):
            yield self.contents[i]
        raise StopIteration

    def recursive_child_generator(self):
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
        if is_string(attrs):
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

    def search_tag(self, markup_name=None, markup_attrs={}):
        found = None
        markup = None
        if isinstance(markup_name, Tag):
            markup = markup_name
            markup_attrs = markup
        call_function_with_tag_data = callable(self.name) \
                                and not isinstance(markup_name, Tag)

        if (not self.name) \
               or call_function_with_tag_data \
               or (markup and self._matches(markup, self.name)) \
               or (not markup and self._matches(markup_name, self.name)):
            if call_function_with_tag_data:
                match = self.name(markup_name, markup_attrs)
            else:
                match = True
                markup_attr_map = None
                for attr, match_against in self.attrs.items():
                    if not markup_attr_map:
                         if hasattr(markup_attrs, 'get'):
                            markup_attr_map = markup_attrs
                         else:
                            markup_attr_map = {}
                            for k,v in markup_attrs:
                                markup_attr_map[k] = v
                    attr_value = markup_attr_map.get(attr)
                    if not self._matches(attr_value, match_against):
                        match = False
                        break
            if match:
                if markup:
                    found = markup
                else:
                    found = markup_name
        return found

    def search(self, markup):
        # print 'looking for %s in %s' % (self, markup)
        found = None
        # If given a list of items, scan it for a text element that
        # matches.
        if is_list(markup) and not isinstance(markup, Tag):
            for element in markup:
                if isinstance(element, NavigableString) \
                       and self.search(element):
                    found = element
                    break
        # If it's a Tag, make sure its name or attributes match.
        # Don't bother with Tags if we're searching for text.
        elif isinstance(markup, Tag):
            if not self.text:
                found = self.search_tag(markup)
        # If it's text, make sure the text matches.
        elif isinstance(markup, NavigableString) or \
                 is_string(markup):
            if self._matches(markup, self.text):
                found = markup
        else:
            raise Exception, "I don't know how to match against a %s" \
                  % markup.__class__
        return found

    def _matches(self, markup, match_against):
        # print "Matching %s against %s" % (markup, match_against)
        result = False
        if match_against == True and type(match_against) == types.BooleanType:
            result = markup != None
        elif callable(match_against):
            result = match_against(markup)
        else:
            # Custom match methods take the tag as an argument, but all
            # other ways of matching match the tag name as a string.
            if isinstance(markup, Tag):
                markup = markup.name
            if markup and not is_string(markup):
                markup = unicode(markup)
            # Now we know that chunk is either a string, or None.
            if hasattr(match_against, 'match'):
                # It's a regexp object.
                result = markup and match_against.search(markup)
            elif is_list(match_against):
                result = markup in match_against
            elif hasattr(match_against, 'items'):
                result = markup.has_key(match_against)
            elif match_against and is_string(markup):
                if isinstance(markup, unicode):
                    match_against = unicode(match_against)
                else:
                    match_against = str(match_against)

            if not result:
                result = match_against == markup
        return result

class ResultSet(list):
    """A ResultSet is just a list that keeps track of the SoupStrainer
    that created it."""
    def __init__(self, source):
        list.__init__([])
        self.source = source

# Now, some helper functions.

def is_list(l):
    """Convenience method that works with all 2.x versions of Python
    to determine whether or not something is listlike."""
    return hasattr(l, '__iter__') \
           or (type(l) in (types.ListType, types.TupleType))

def is_string(s):
    """Convenience method that works with all 2.x versions of Python
    to determine whether or not something is stringlike."""
    try:
        return isinstance(s, unicode) or isinstance(s, basestring)
    except NameError:
        return isinstance(s, str)

def build_tag_map(default, *args):
    """Turns a list of maps, lists, or scalars into a single map.
    Used to build the SELF_CLOSING_TAGS, NESTABLE_TAGS, and
    NESTING_RESET_TAGS maps out of lists and partial maps."""
    built = {}
    for portion in args:
        if hasattr(portion, 'items'):
            # It's a map. Merge it.
            for k,v in portion.items():
                built[k] = v
        elif is_list(portion):
            # It's a list. Map each item to the default.
            for k in portion:
                built[k] = default
        else:
            # It's a scalar. Map it to the default.
            built[portion] = default
    return built

# Now, the parser classes.

class BeautifulStoneSoup(Tag, SGMLParser):

    """This class contains the basic parser and search code. It defines
    a parser that knows nothing about tag behavior except for the
    following:

      You can't close a tag without closing all the tags it encloses.
      That is, "<foo><bar></foo>" actually means
      "<foo><bar></bar></foo>".

    [Another possible explanation is "<foo><bar /></foo>", but since
    this class defines no SELF_CLOSING_TAGS, it will never use that
    explanation.]

    This class is useful for parsing XML or made-up markup languages,
    or when BeautifulSoup makes an assumption counter to what you were
    expecting."""

    SELF_CLOSING_TAGS = {}
    NESTABLE_TAGS = {}
    RESET_NESTING_TAGS = {}
    QUOTE_TAGS = {}
    PRESERVE_WHITESPACE_TAGS = frozenset()

    MARKUP_MASSAGE = [(re.compile('(<[^<>]*)/>'),
                       lambda x: x.group(1) + ' />'),
                      (re.compile('<!\s+([^<>]*)>'),
                       lambda x: '<!' + x.group(1) + '>')
                      ]

    ROOT_TAG_NAME = u'[document]'

    HTML_ENTITIES = "html"
    XML_ENTITIES = "xml"
    XHTML_ENTITIES = "xhtml"
    # TODO: This only exists for backwards-compatibility
    ALL_ENTITIES = XHTML_ENTITIES

    # Used when determining whether a text node is all whitespace and
    # can be replaced with a single space. A text node that contains
    # fancy Unicode spaces (usually non-breaking) should be left
    # alone.
    STRIP_ASCII_SPACES = { 9: None, 10: None, 12: None, 13: None, 32: None, }

    def __init__(self, markup="", parse_only_these=None, from_encoding=None,
                 markup_massage=True, smart_quotes_to=XML_ENTITIES,
                 convert_entities=None, self_closing_tags=None):
        """The Soup object is initialized as the 'root tag', and the
        provided markup (which can be a string or a file-like object)
        is fed into the underlying parser.

        sgmllib will process most bad HTML, and the BeautifulSoup
        class has some tricks for dealing with some HTML that kills
        sgmllib, but Beautiful Soup can nonetheless choke or lose data
        if your data uses self-closing tags or declarations
        incorrectly.

        By default, Beautiful Soup uses regexes to sanitize input,
        avoiding the vast majority of these problems. If the problems
        don't apply to you, pass in False for markup_massage, and
        you'll get better performance.

        The default parser massage techniques fix the two most common
        instances of invalid HTML that choke sgmllib:

         <br/> (No space between name of closing tag and tag close)
         <! --Comment--> (Extraneous whitespace in declaration)

        You can pass in a custom list of (RE object, replace method)
        tuples to get Beautiful Soup to scrub your input the way you
        want."""

        self.parse_only_these = parse_only_these
        self.from_encoding = from_encoding
        self.smart_quotes_to = smart_quotes_to
        self.convert_entities = convert_entities
        # Set the rules for how we'll deal with the entities we
        # encounter
        if self.convert_entities:
            # It doesn't make sense to convert encoded characters to
            # entities even while you're converting entities to Unicode.
            # Just convert it all to Unicode.
            self.smart_quotes_to = None
            if convert_entities == self.HTML_ENTITIES:
                self.convert_xml_entities = False
                self.convert_html_entities = True
                self.escape_unrecognized_entities = True
            elif convert_entities == self.XHTML_ENTITIES:
                self.convert_xml_entities = True
                self.convert_html_entities = True
                self.escape_unrecognized_entities = False
            elif convert_entities == self.XML_ENTITIES:
                self.convert_xml_entities = True
                self.convert_html_entities = False
                self.escape_unrecognized_entities = False
        else:
            self.convert_xml_entities = False
            self.convert_html_entities = False
            self.escape_unrecognized_entities = False

        self.instance_self_closing_tags = build_tag_map(None, self_closing_tags)
        SGMLParser.__init__(self)

        if hasattr(markup, 'read'):        # It's a file-type object.
            markup = markup.read()
        self.markup = markup
        self.markup_massage = markup_massage
        try:
            self._feed()
        except StopParsing:
            pass
        self.markup = None                 # The markup can now be GCed

    def convert_charref(self, name):
        """This method fixes a bug in Python's SGMLParser."""
        try:
            n = int(name)
        except ValueError:
            return
        if not 0 <= n <= 127 : # ASCII ends at 127, not 255
            return
        return self.convert_codepoint(n)

    def _feed(self, in_document_encoding=None):
        # Convert the document to Unicode.
        markup = self.markup
        if isinstance(markup, unicode):
            if not hasattr(self, 'original_encoding'):
                self.original_encoding = None
        else:
            # Changed detection by Kovid
            markup, self.original_encoding = chardet.xml_to_unicode(markup)
        if markup:
            if self.markup_massage:
                if not is_list(self.markup_massage):
                    self.markup_massage = self.MARKUP_MASSAGE
                for fix, m in self.markup_massage:
                    markup = fix.sub(m, markup)
                # TODO: We get rid of markup_massage so that the
                # soup object can be deepcopied later on. Some
                # Python installations can't copy regexes. If anyone
                # was relying on the existence of markup_massage, this
                # might cause problems.
                del(self.markup_massage)
                self.markup = markup
        self.reset()

        SGMLParser.feed(self, markup)
        # Close out any unfinished strings and close all the open tags.
        self.end_data()
        while self.current_tag.name != self.ROOT_TAG_NAME:
            self.pop_tag()

    def __getattr__(self, method_name):
        """This method routes method call requests to either the SGMLParser
        superclass or the Tag superclass, depending on the method name."""
        # print "__getattr__ called on %s.%s" % (self.__class__, method_name)

        if method_name.find('start_') == 0 or method_name.find('end_') == 0 \
               or method_name.find('do_') == 0:
            return SGMLParser.__getattr__(self, method_name)
        elif method_name.find('__') != 0:
            return Tag.__getattr__(self, method_name)
        else:
            raise AttributeError

    def is_self_closing_tag(self, name):
        """Returns true iff the given string is the name of a
        self-closing tag according to this parser."""
        return self.SELF_CLOSING_TAGS.has_key(name) \
               or self.instance_self_closing_tags.has_key(name)

    def reset(self):
        Tag.__init__(self, self, self.ROOT_TAG_NAME)
        self.hidden = 1
        SGMLParser.reset(self)
        self.current_data = []
        self.current_tag = None
        self.tag_stack = []
        self.quote_stack = []
        self.push_tag(self)

    def pop_tag(self):
        self.tag_stack.pop()
        # Tags with just one string-owning child get the child as a
        # 'string' property, so that soup.tag.string is shorthand for
        # soup.tag.contents[0]
        if len(self.current_tag.contents) == 1 and \
           isinstance(self.current_tag.contents[0], NavigableString):
            self.current_tag.string = self.current_tag.contents[0]

        # print "Pop", tag.name
        if self.tag_stack:
            self.current_tag = self.tag_stack[-1]
        return self.current_tag

    def push_tag(self, tag):
        # print "Push", tag.name
        if self.current_tag:
            self.current_tag.contents.append(tag)
        self.tag_stack.append(tag)
        self.current_tag = self.tag_stack[-1]

    def end_data(self, container_class=NavigableString):
        if self.current_data:
            current_data = ''.join(self.current_data)
            # Changed by Kovid to not clobber whitespace inside <pre> tags and the like
            if ( (not current_data.translate(self.STRIP_ASCII_SPACES)) and (
                    not frozenset(tag.name for tag in self.tag_stack).intersection(
                        self.PRESERVE_WHITESPACE_TAGS))):
                if '\n' in current_data:
                    current_data = '\n'
                else:
                    current_data = ' '
            self.current_data = []
            if self.parse_only_these and len(self.tag_stack) <= 1 and \
                   (not self.parse_only_these.text or \
                    not self.parse_only_these.search(current_data)):
                return
            o = container_class(current_data)
            o.setup(self.current_tag, self.previous)
            if self.previous:
                self.previous.next = o
            self.previous = o
            self.current_tag.contents.append(o)


    def _pop_to_tag(self, name, inclusive_pop=True):
        """Pops the tag stack up to and including the most recent
        instance of the given tag. If inclusive_pop is false, pops the tag
        stack up to but *not* including the most recent instqance of
        the given tag."""
        # print "Popping to %s" % name
        if name == self.ROOT_TAG_NAME:
            return

        num_pops = 0
        most_recent_tag = None
        for i in range(len(self.tag_stack)-1, 0, -1):
            if name == self.tag_stack[i].name:
                num_pops = len(self.tag_stack)-i
                break
        if not inclusive_pop:
            num_pops = num_pops - 1

        for i in range(0, num_pops):
            most_recent_tag = self.pop_tag()
        return most_recent_tag

    def _smart_pop(self, name):

        """We need to pop up to the previous tag of this type, unless
        one of this tag's nesting reset triggers comes between this
        tag and the previous tag of this type, OR unless this tag is a
        generic nesting trigger and another generic nesting trigger
        comes between this tag and the previous tag of this type.

        Examples:
         <p>Foo<b>Bar *<p>* should pop to 'p', not 'b'.
         <p>Foo<table>Bar *<p>* should pop to 'table', not 'p'.
         <p>Foo<table><tr>Bar *<p>* should pop to 'tr', not 'p'.

         <li><ul><li> *<li>* should pop to 'ul', not the first 'li'.
         <tr><table><tr> *<tr>* should pop to 'table', not the first 'tr'
         <td><tr><td> *<td>* should pop to 'tr', not the first 'td'
        """

        nesting_reset_triggers = self.NESTABLE_TAGS.get(name)
        is_nestable = nesting_reset_triggers != None
        is_reset_nesting = self.RESET_NESTING_TAGS.has_key(name)
        pop_to = None
        inclusive = True
        for i in range(len(self.tag_stack)-1, 0, -1):
            p = self.tag_stack[i]
            if (not p or p.name == name) and not is_nestable:
                # Non-nestable tags get popped to the top or to their
                # last occurance.
                pop_to = name
                break
            if (nesting_reset_triggers != None
                and p.name in nesting_reset_triggers) \
                or (nesting_reset_triggers == None and is_reset_nesting
                    and self.RESET_NESTING_TAGS.has_key(p.name)):

                # If we encounter one of the nesting reset triggers
                # peculiar to this tag, or we encounter another tag
                # that causes nesting to reset, pop up to but not
                # including that tag.
                pop_to = p.name
                inclusive = False
                break
            p = p.parent
        if pop_to:
            self._pop_to_tag(pop_to, inclusive)

    def unknown_starttag(self, name, attrs, self_closing=0):
        # print "Start tag %s: %s" % (name, attrs)
        if self.quote_stack:
            # This is not a real tag.
            # print "<%s> is not real!" % name
            attrs = ''.join(map(lambda(x, y): ' %s="%s"' % (x, y), attrs))
            self.handle_data('<%s%s>' % (name, attrs))
            return
        self.end_data()

        if not self.is_self_closing_tag(name) and not self_closing:
            self._smart_pop(name)

        if self.parse_only_these and len(self.tag_stack) <= 1 \
               and (self.parse_only_these.text or not self.parse_only_these.search_tag(name, attrs)):
            return

        tag = Tag(self, name, attrs, self.current_tag, self.previous)
        if self.previous:
            self.previous.next = tag
        self.previous = tag
        self.push_tag(tag)
        if self_closing or self.is_self_closing_tag(name):
            self.pop_tag()
        if name in self.QUOTE_TAGS:
            # print "Beginning quote (%s)" % name
            self.quote_stack.append(name)
            self.literal = 1
        return tag

    def unknown_endtag(self, name):
        # print "End tag %s" % name
        if self.quote_stack and self.quote_stack[-1] != name:
            # This is not a real end tag.
            # print "</%s> is not real!" % name
            self.handle_data('</%s>' % name)
            return
        self.end_data()
        self._pop_to_tag(name)
        if self.quote_stack and self.quote_stack[-1] == name:
            self.quote_stack.pop()
            self.literal = (len(self.quote_stack) > 0)

    def handle_data(self, data):
        self.current_data.append(data)

    def _to_string_subclass(self, text, subclass):
        """Adds a certain piece of text to the tree as a NavigableString
        subclass."""
        self.end_data()
        self.handle_data(text)
        self.end_data(subclass)

    def handle_pi(self, text):
        """Handle a processing instruction as a ProcessingInstruction
        object, possibly one with a %SOUP-ENCODING% slot into which an
        encoding will be plugged later."""
        if text[:3] == "xml":
            text = u"xml version='1.0' encoding='%SOUP-ENCODING%'"
        self._to_string_subclass(text, ProcessingInstruction)

    def handle_comment(self, text):
        "Handle comments as Comment objects."
        self._to_string_subclass(text, Comment)

    def handle_charref(self, ref):
        "Handle character references as data."
        if self.convert_entities:
            if ref.lower().startswith('x'): #
                ref = int(ref[1:], 16)      # Added by Kovid to handle hex numeric entities
            try:
                data = unichr(int(ref))
            except ValueError: # Bad numerical entity. Added by Kovid
                data = u''
        else:
            data = '&#%s;' % ref
        self.handle_data(data)

    def handle_entityref(self, ref):
        """Handle entity references as data, possibly converting known
        HTML and/or XML entity references to the corresponding Unicode
        characters."""
        data = None
        if self.convert_html_entities:
            try:
                data = unichr(name2codepoint[ref])
            except KeyError:
                pass

        if not data and self.convert_xml_entities:
                data = self.XML_ENTITIES_TO_SPECIAL_CHARS.get(ref)

        if not data and self.convert_html_entities and \
            not self.XML_ENTITIES_TO_SPECIAL_CHARS.get(ref):
                # TODO: We've got a problem here. We're told this is
                # an entity reference, but it's not an XML entity
                # reference or an HTML entity reference. Nonetheless,
                # the logical thing to do is to pass it through as an
                # unrecognized entity reference.
                #
                # Except: when the input is "&carol;" this function
                # will be called with input "carol". When the input is
                # "AT&T", this function will be called with input
                # "T". We have no way of knowing whether a semicolon
                # was present originally, so we don't know whether
                # this is an unknown entity or just a misplaced
                # ampersand.
                #
                # The more common case is a misplaced ampersand, so I
                # escape the ampersand and omit the trailing semicolon.
                data = "&amp;%s" % ref
        if not data:
            # This case is different from the one above, because we
            # haven't already gone through a supposedly comprehensive
            # mapping of entities to Unicode characters. We might not
            # have gone through any mapping at all. So the chances are
            # very high that this is a real entity, and not a
            # misplaced ampersand.
            data = "&%s;" % ref
        self.handle_data(data)

    def handle_decl(self, data):
        "Handle DOCTYPEs and the like as Declaration objects."
        self._to_string_subclass(data, Declaration)

    def parse_declaration(self, i):
        """Treat a bogus SGML declaration as raw data. Treat a CDATA
        declaration as a CData object."""
        j = None
        if self.rawdata[i:i+9] == '<![CDATA[':
             k = self.rawdata.find(']]>', i)
             if k == -1:
                 k = len(self.rawdata)
             data = self.rawdata[i+9:k]
             j = k+3
             self._to_string_subclass(data, CData)
        else:
            try:
                j = SGMLParser.parse_declaration(self, i)
            except SGMLParseError:
                to_handle = self.rawdata[i:]
                self.handle_data(to_handle)
                j = i + len(to_handle)
        return j

class StopParsing(Exception):
    pass

class BeautifulSoup(BeautifulStoneSoup):

    """This parser knows the following facts about HTML:

    * Some tags have no closing tag and should be interpreted as being
      closed as soon as they are encountered.

    * The text inside some tags (ie. 'script') may contain tags which
      are not really part of the document and which should be parsed
      as text, not tags. If you want to parse the text as tags, you can
      always fetch it and parse it explicitly.

    * Tag nesting rules:

      Most tags can't be nested at all. For instance, the occurance of
      a <p> tag should implicitly close the previous <p> tag.

       <p>Para1<p>Para2
        should be transformed into:
       <p>Para1</p><p>Para2

      Some tags can be nested arbitrarily. For instance, the occurance
      of a <blockquote> tag should _not_ implicitly close the previous
      <blockquote> tag.

       Alice said: <blockquote>Bob said: <blockquote>Blah
        should NOT be transformed into:
       Alice said: <blockquote>Bob said: </blockquote><blockquote>Blah

      Some tags can be nested, but the nesting is reset by the
      interposition of other tags. For instance, a <tr> tag should
      implicitly close the previous <tr> tag within the same <table>,
      but not close a <tr> tag in another table.

       <table><tr>Blah<tr>Blah
        should be transformed into:
       <table><tr>Blah</tr><tr>Blah
        but,
       <tr>Blah<table><tr>Blah
        should NOT be transformed into
       <tr>Blah<table></tr><tr>Blah

    Differing assumptions about tag nesting rules are a major source
    of problems with the BeautifulSoup class. If BeautifulSoup is not
    treating as nestable a tag your page author treats as nestable,
    try ICantBelieveItsBeautifulSoup, MinimalSoup, or
    BeautifulStoneSoup before writing your own subclass."""

    def __init__(self, *args, **kwargs):
        if not kwargs.has_key('smart_quotes_to'):
            kwargs['smart_quotes_to'] = self.HTML_ENTITIES
        BeautifulStoneSoup.__init__(self, *args, **kwargs)

    SELF_CLOSING_TAGS = build_tag_map(None,
                                    ['br' , 'hr', 'input', 'img', 'meta',
                                    'spacer', 'link', 'frame', 'base'])

    PRESERVE_WHITESPACE_TAGS = frozenset(('pre', 'textarea'))

    QUOTE_TAGS = {'script' : None, 'textarea' : None}

    # According to the HTML standard, each of these inline tags can
    # contain another tag of the same type. Furthermore, it's common
    # to actually use these tags this way.
    NESTABLE_INLINE_TAGS = ['span', 'font', 'q', 'object', 'bdo', 'sub', 'sup',
                            'center']

    # According to the HTML standard, these block tags can contain
    # another tag of the same type. Furthermore, it's common
    # to actually use these tags this way.
    # Changed by Kovid: Added HTML 5 block tags
    NESTABLE_BLOCK_TAGS = ['blockquote', 'div', 'fieldset', 'ins', 'del',
            'article', 'aside', 'header', 'footer', 'nav', 'figcaption', 'figure', 'section']

    # Lists can contain other lists, but there are restrictions.
    NESTABLE_LIST_TAGS = { 'ol' : [],
                           'ul' : [],
                           'li' : ['ul', 'ol'],
                           'dl' : [],
                           'dd' : ['dl'],
                           'dt' : ['dl'] }

    # Tables can contain other tables, but there are restrictions.
    NESTABLE_TABLE_TAGS = {'table' : [],
                           'tr' : ['table', 'tbody', 'tfoot', 'thead'],
                           'td' : ['tr'],
                           'th' : ['tr'],
                           'thead' : ['table'],
                           'tbody' : ['table'],
                           'tfoot' : ['table'],
                           }

    NON_NESTABLE_BLOCK_TAGS = ['address', 'form', 'p', 'pre']

    # If one of these tags is encountered, all tags up to the next tag of
    # this type are popped.
    RESET_NESTING_TAGS = build_tag_map(None, NESTABLE_BLOCK_TAGS, 'noscript',
                                     NON_NESTABLE_BLOCK_TAGS,
                                     NESTABLE_LIST_TAGS,
                                     NESTABLE_TABLE_TAGS)

    NESTABLE_TAGS = build_tag_map([], NESTABLE_INLINE_TAGS, NESTABLE_BLOCK_TAGS,
                                NESTABLE_LIST_TAGS, NESTABLE_TABLE_TAGS)

    # Used to detect the charset in a META tag; see start_meta
    CHARSET_RE = re.compile("((^|;)\s*charset=)([^;]*)")

    def start_meta(self, attrs):
        """Beautiful Soup can detect a charset included in a META tag,
        try to convert the document to that charset, and re-parse the
        document from the beginning."""
        http_equiv = None
        content_type = None
        content_type_index = None
        tag_needs_encoding_substitution = False

        for i in range(0, len(attrs)):
            key, value = attrs[i]
            key = key.lower()
            if key == 'http-equiv':
                http_equiv = value
            elif key == 'content':
                content_type = value
                content_type_index = i

        if http_equiv and content_type: # It's an interesting meta tag.
            match = self.CHARSET_RE.search(content_type)
            if match:
                if getattr(self, 'declared_html_encoding') or \
                       (self.original_encoding == self.from_encoding):
                    # This is our second pass through the document, or
                    # else an encoding was specified explicitly and it
                    # worked. Rewrite the meta tag.
                    new_attr = self.CHARSET_RE.sub\
                              (lambda(match):match.group(1) +
                               "%SOUP-ENCODING%", value)
                    attrs[content_type_index] = (attrs[content_type_index][0],
                                               new_attr)
                    tag_needs_encoding_substitution = True
                else:
                    # This is our first pass through the document.
                    # Go through it again with the new information.
                    new_charset = match.group(3)
                    if new_charset and new_charset != self.original_encoding:
                        self.declared_html_encoding = new_charset
                        self._feed(self.declared_html_encoding)
                        raise StopParsing
        tag = self.unknown_starttag("meta", attrs)
        if tag and tag_needs_encoding_substitution:
            tag.contains_substitutions = True

class ICantBelieveItsBeautifulSoup(BeautifulSoup):

    """The BeautifulSoup class is oriented towards skipping over
    common HTML errors like unclosed tags. However, sometimes it makes
    errors of its own. For instance, consider this fragment:

     <b>Foo<b>Bar</b></b>

    This is perfectly valid (if bizarre) HTML. However, the
    BeautifulSoup class will implicitly close the first b tag when it
    encounters the second 'b'. It will think the author wrote
    "<b>Foo<b>Bar", and didn't close the first 'b' tag, because
    there's no real-world reason to bold something that's already
    bold. When it encounters '</b></b>' it will close two more 'b'
    tags, for a grand total of three tags closed instead of two. This
    can throw off the rest of your document structure. The same is
    true of a number of other tags, listed below.

    It's much more common for someone to forget to close a 'b' tag
    than to actually use nested 'b' tags, and the BeautifulSoup class
    handles the common case. This class handles the not-co-common
    case: where you can't believe someone wrote what they did, but
    it's valid HTML and BeautifulSoup screwed up by assuming it
    wouldn't be."""

    I_CANT_BELIEVE_THEYRE_NESTABLE_INLINE_TAGS = \
     ['em', 'big', 'i', 'small', 'tt', 'abbr', 'acronym', 'strong',
      'cite', 'code', 'dfn', 'kbd', 'samp', 'strong', 'var', 'b',
      'big']

    I_CANT_BELIEVE_THEYRE_NESTABLE_BLOCK_TAGS = ['noscript']

    NESTABLE_TAGS = build_tag_map([], BeautifulSoup.NESTABLE_TAGS,
                                I_CANT_BELIEVE_THEYRE_NESTABLE_BLOCK_TAGS,
                                I_CANT_BELIEVE_THEYRE_NESTABLE_INLINE_TAGS)

class MinimalSoup(BeautifulSoup):
    """The MinimalSoup class is for parsing HTML that contains
    pathologically bad markup. It makes no assumptions about tag
    nesting, but it does know which tags are self-closing, that
    <script> tags contain Javascript and should not be parsed, that
    META tags may contain encoding information, and so on.

    This also makes it better for subclassing than BeautifulStoneSoup
    or BeautifulSoup."""

    RESET_NESTING_TAGS = build_tag_map('noscript')
    NESTABLE_TAGS = {}

class BeautifulSOAP(BeautifulStoneSoup):
    """This class will push a tag with only a single string child into
    the tag's parent as an attribute. The attribute's name is the tag
    name, and the value is the string child. An example should give
    the flavor of the change:

    <foo><bar>baz</bar></foo>
     =>
    <foo bar="baz"><bar>baz</bar></foo>

    You can then access fooTag['bar'] instead of fooTag.barTag.string.

    This is, of course, useful for scraping structures that tend to
    use subelements instead of attributes, such as SOAP messages. Note
    that it modifies its input, so don't print the modified version
    out.

    I'm not sure how many people really want to use this class; let me
    know if you do. Mainly I like the name."""

    def pop_tag(self):
        if len(self.tag_stack) > 1:
            tag = self.tag_stack[-1]
            parent = self.tag_stack[-2]
            parent._get_attr_map()
            if (isinstance(tag, Tag) and len(tag.contents) == 1 and
                isinstance(tag.contents[0], NavigableString) and
                not parent.attr_map.has_key(tag.name)):
                parent[tag.name] = tag.contents[0]
        BeautifulStoneSoup.pop_tag(self)

# Enterprise class names! It has come to our attention that some people
# think the names of the Beautiful Soup parser classes are too silly
# and "unprofessional" for use in enterprise screen-scraping. We feel
# your pain! For such-minded folk, the Beautiful Soup Consortium And
# All-Night Kosher Bakery recommends renaming this file to
# "RobustParser.py" (or, in cases of extreme enterprisiness,
# "RobustParserBeanInterface.class") and using the following
# enterprise-friendly class aliases:
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

######################################################
#
# Bonus library: Unicode, Dammit
#
# This class forces XML data into a standard format (usually to UTF-8
# or Unicode).  It is heavily based on code from Mark Pilgrim's
# Universal Feed Parser. It does not rewrite the XML or HTML to
# reflect a new encoding: that happens in BeautifulStoneSoup.handle_pi
# (XML) and BeautifulSoup.start_meta (HTML).

# Autodetects character encodings.
# Download from http://chardet.feedparser.org/
import calibre.ebooks.chardet as chardet

class UnicodeDammit:
    """A class for detecting the encoding of a *ML document and
    converting it to a Unicode string. If the source encoding is
    windows-1252, can replace MS smart quotes with their HTML or XML
    equivalents."""

    # This dictionary maps commonly seen values for "charset" in HTML
    # meta tags to the corresponding Python codec names. It only covers
    # values that aren't in Python's aliases and can't be determined
    # by the heuristics in find_codec.
    CHARSET_ALIASES = { "macintosh" : "mac-roman",
                        "x-sjis" : "shift-jis" }

    def __init__(self, markup, override_encodings=[],
                 smart_quotes_to='xml'):
        self.markup, document_encoding, sniffed_encoding = \
                     self._detect_encoding(markup)
        self.smart_quotes_to = smart_quotes_to
        self.tried_encodings = []

        if markup == '' or isinstance(markup, unicode):
            self.original_encoding = None
            self.unicode = unicode(markup)
            return

        u = None
        for proposed_encoding in override_encodings:
            u = self._convert_from(proposed_encoding)
            if u: break
        if not u:
            for proposed_encoding in (document_encoding, sniffed_encoding):
                u = self._convert_from(proposed_encoding)
                if u: break

        # If no luck and we have auto-detection library, try that:
        if not u and chardet and not isinstance(self.markup, unicode):
            u = self._convert_from(chardet.detect(self.markup)['encoding'])

        # As a last resort, try utf-8 and windows-1252:
        if not u:
            for proposed_encoding in ("utf-8", "windows-1252"):
                u = self._convert_from(proposed_encoding)
                if u: break
        self.unicode = u
        if not u: self.original_encoding = None

    def _sub_ms_char(self, orig):
        """Changes a MS smart quote character to an XML or HTML
        entity."""
        sub = self.MS_CHARS.get(orig)
        if type(sub) == types.TupleType:
            if self.smart_quotes_to == 'xml':
                sub = '&#x%s;' % sub[1]
            else:
                sub = '&%s;' % sub[0]
        return sub

    def _convert_from(self, proposed):
        proposed = self.find_codec(proposed)
        if not proposed or proposed in self.tried_encodings:
            return None
        self.tried_encodings.append(proposed)
        markup = self.markup

        # Convert smart quotes to HTML if coming from an encoding
        # that might have them.
        if self.smart_quotes_to and proposed.lower() in("windows-1252",
                                                      "iso-8859-1",
                                                      "iso-8859-2"):
            markup = re.compile("([\x80-\x9f])").sub \
                     (lambda(x): self._sub_ms_char(x.group(1)),
                      markup)

        try:
            # print "Trying to convert document to %s" % proposed
            u = self._to_unicode(markup, proposed)
            self.markup = u
            self.original_encoding = proposed
        except Exception:
            # print "That didn't work!"
            # print e
            return None
        # print "Correct encoding: %s" % proposed
        return self.markup

    def _to_unicode(self, data, encoding):
        '''Given a string and its encoding, decodes the string into Unicode.
        %encoding is a string recognized by encodings.aliases'''

        # strip Byte Order Mark (if present)
        if (len(data) >= 4) and (data[:2] == '\xfe\xff') \
               and (data[2:4] != '\x00\x00'):
            encoding = 'utf-16be'
            data = data[2:]
        elif (len(data) >= 4) and (data[:2] == '\xff\xfe') \
                 and (data[2:4] != '\x00\x00'):
            encoding = 'utf-16le'
            data = data[2:]
        elif data[:3] == '\xef\xbb\xbf':
            encoding = 'utf-8'
            data = data[3:]
        elif data[:4] == '\x00\x00\xfe\xff':
            encoding = 'utf-32be'
            data = data[4:]
        elif data[:4] == '\xff\xfe\x00\x00':
            encoding = 'utf-32le'
            data = data[4:]

        new_data = unicode(data, encoding)

        return new_data

    def _detect_encoding(self, xml_data):
        """Given a document, tries to detect its XML encoding."""
        xml_encoding = sniffed_xml_encoding = None
        try:
            if xml_data[:4] == '\x4c\x6f\xa7\x94':
                # EBCDIC
                xml_data = self._ebcdic_to_ascii(xml_data)

            # By Kovid commented out all the recoding to UTF-8 of UTF-16 and UTF-32
            # as this doesn't make sense and doesn't work for the test case
            # BeautifulSoup.UnicodeDammit(u'abcd'.encode('utf-16')).unicode
            elif xml_data[:4] == '\x00\x3c\x00\x3f':
                # UTF-16BE
                sniffed_xml_encoding = 'utf-16be'
                #xml_data = unicode(xml_data, 'utf-16be').encode('utf-8')
            elif (len(xml_data) >= 4) and (xml_data[:2] == '\xfe\xff') \
                     and (xml_data[2:4] != '\x00\x00'):
                # UTF-16BE with BOM
                sniffed_xml_encoding = 'utf-16be'
                #xml_data = unicode(xml_data[2:], 'utf-16be').encode('utf-8')
            elif xml_data[:4] == '\x3c\x00\x3f\x00':
                # UTF-16LE
                sniffed_xml_encoding = 'utf-16le'
                #xml_data = unicode(xml_data, 'utf-16le').encode('utf-8')
            elif (len(xml_data) >= 4) and (xml_data[:2] == '\xff\xfe') and \
                     (xml_data[2:4] != '\x00\x00'):
                # UTF-16LE with BOM
                sniffed_xml_encoding = 'utf-16le'
                #xml_data = unicode(xml_data[2:], 'utf-16le').encode('utf-8')
            elif xml_data[:4] == '\x00\x00\x00\x3c':
                # UTF-32BE
                sniffed_xml_encoding = 'utf-32be'
                #xml_data = unicode(xml_data, 'utf-32be').encode('utf-8')
            elif xml_data[:4] == '\x3c\x00\x00\x00':
                # UTF-32LE
                sniffed_xml_encoding = 'utf-32le'
                #xml_data = unicode(xml_data, 'utf-32le').encode('utf-8')
            elif xml_data[:4] == '\x00\x00\xfe\xff':
                # UTF-32BE with BOM
                sniffed_xml_encoding = 'utf-32be'
                #xml_data = unicode(xml_data[4:], 'utf-32be').encode('utf-8')
            elif xml_data[:4] == '\xff\xfe\x00\x00':
                # UTF-32LE with BOM
                sniffed_xml_encoding = 'utf-32le'
                #xml_data = unicode(xml_data[4:], 'utf-32le').encode('utf-8')
            elif xml_data[:3] == '\xef\xbb\xbf':
                # UTF-8 with BOM
                sniffed_xml_encoding = 'utf-8'
                #xml_data = unicode(xml_data[3:], 'utf-8').encode('utf-8')
            else:
                sniffed_xml_encoding = 'ascii'
                pass
            xml_encoding_match = re.compile \
                                 ('^<\?.*encoding=[\'"](.*?)[\'"].*\?>')\
                                 .match(xml_data)
            if xml_encoding_match is None: # By Kovid to use the content-type header in HTML files
                xml_encoding_match = re.compile(r'<meta.*?content=[\'"].*?charset=(\S+).*?[\'"]', re.IGNORECASE).search(xml_data)
        except:
            xml_encoding_match = None
        if xml_encoding_match:
            xml_encoding = xml_encoding_match.groups()[0].lower()

            if sniffed_xml_encoding and \
               (xml_encoding in ('iso-10646-ucs-2', 'ucs-2', 'csunicode',
                                 'iso-10646-ucs-4', 'ucs-4', 'csucs4',
                                 'utf-16', 'utf-32', 'utf_16', 'utf_32',
                                 'utf16', 'u16')):
                xml_encoding = sniffed_xml_encoding

        return xml_data, xml_encoding, sniffed_xml_encoding


    def find_codec(self, charset):
        return self._codec(self.CHARSET_ALIASES.get(charset, charset)) \
               or (charset and self._codec(charset.replace("-", ""))) \
               or (charset and self._codec(charset.replace("-", "_"))) \
               or charset

    def _codec(self, charset):
        if not charset: return charset
        codec = None
        try:
            codecs.lookup(charset)
            codec = charset
        except (LookupError, ValueError):
            pass
        return codec

    EBCDIC_TO_ASCII_MAP = None
    def _ebcdic_to_ascii(self, s):
        c = self.__class__
        if not c.EBCDIC_TO_ASCII_MAP:
            emap = (0,1,2,3,156,9,134,127,151,141,142,11,12,13,14,15,
                    16,17,18,19,157,133,8,135,24,25,146,143,28,29,30,31,
                    128,129,130,131,132,10,23,27,136,137,138,139,140,5,6,7,
                    144,145,22,147,148,149,150,4,152,153,154,155,20,21,158,26,
                    32,160,161,162,163,164,165,166,167,168,91,46,60,40,43,33,
                    38,169,170,171,172,173,174,175,176,177,93,36,42,41,59,94,
                    45,47,178,179,180,181,182,183,184,185,124,44,37,95,62,63,
                    186,187,188,189,190,191,192,193,194,96,58,35,64,39,61,34,
                    195,97,98,99,100,101,102,103,104,105,196,197,198,199,200,
                    201,202,106,107,108,109,110,111,112,113,114,203,204,205,
                    206,207,208,209,126,115,116,117,118,119,120,121,122,210,
                    211,212,213,214,215,216,217,218,219,220,221,222,223,224,
                    225,226,227,228,229,230,231,123,65,66,67,68,69,70,71,72,
                    73,232,233,234,235,236,237,125,74,75,76,77,78,79,80,81,
                    82,238,239,240,241,242,243,92,159,83,84,85,86,87,88,89,
                    90,244,245,246,247,248,249,48,49,50,51,52,53,54,55,56,57,
                    250,251,252,253,254,255)
            import string
            c.EBCDIC_TO_ASCII_MAP = string.maketrans( \
            ''.join(map(chr, range(256))), ''.join(map(chr, emap)))
        return s.translate(c.EBCDIC_TO_ASCII_MAP)

    MS_CHARS = { '\x80' : ('euro', '20AC'),
                 '\x81' : ' ',
                 '\x82' : ('sbquo', '201A'),
                 '\x83' : ('fnof', '192'),
                 '\x84' : ('bdquo', '201E'),
                 '\x85' : ('hellip', '2026'),
                 '\x86' : ('dagger', '2020'),
                 '\x87' : ('Dagger', '2021'),
                 '\x88' : ('circ', '2C6'),
                 '\x89' : ('permil', '2030'),
                 '\x8A' : ('Scaron', '160'),
                 '\x8B' : ('lsaquo', '2039'),
                 '\x8C' : ('OElig', '152'),
                 '\x8D' : '?',
                 '\x8E' : ('#x17D', '17D'),
                 '\x8F' : '?',
                 '\x90' : '?',
                 '\x91' : ('lsquo', '2018'),
                 '\x92' : ('rsquo', '2019'),
                 '\x93' : ('ldquo', '201C'),
                 '\x94' : ('rdquo', '201D'),
                 '\x95' : ('bull', '2022'),
                 '\x96' : ('ndash', '2013'),
                 '\x97' : ('mdash', '2014'),
                 '\x98' : ('tilde', '2DC'),
                 '\x99' : ('trade', '2122'),
                 '\x9a' : ('scaron', '161'),
                 '\x9b' : ('rsaquo', '203A'),
                 '\x9c' : ('oelig', '153'),
                 '\x9d' : '?',
                 '\x9e' : ('#x17E', '17E'),
                 '\x9f' : ('Yuml', ''),}

#######################################################################