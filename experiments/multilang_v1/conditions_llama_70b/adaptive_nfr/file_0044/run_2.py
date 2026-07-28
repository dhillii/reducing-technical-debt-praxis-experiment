def is_valid_category(self, category):
    """Check if a category is valid."""
    return category in self.db.field_metadata

def is_user_category(self, category):
    """Check if a category is a user category."""
    return category.startswith('@')

def get_category_key(self, node):
    """Get the category key from a node."""
    return node.category_key

def get_tag_name(self, node):
    """Get the tag name from a node."""
    return node.tag.original_name

def get_tag_category(self, node):
    """Get the tag category from a node."""
    return node.tag.category

def is_tag_editable(self, node):
    """Check if a tag is editable."""
    return node.tag.is_editable

def is_tag_searchable(self, node):
    """Check if a tag is searchable."""
    return node.tag.is_searchable

def is_tag_hierarchical(self, node):
    """Check if a tag is hierarchical."""
    return node.tag.is_hierarchical

def get_node_children(self, node):
    """Get the children of a node."""
    return node.children

def get_node_parent(self, node):
    """Get the parent of a node."""
    return node.parent

def get_node_row(self, node):
    """Get the row of a node."""
    return node.row()

def get_node_data(self, node, role):
    """Get the data of a node for a given role."""
    return node.data(role)

def get_node_tooltip(self, node):
    """Get the tooltip of a node."""
    return node.tooltip

def get_node_average_rating(self, node):
    """Get the average rating of a node."""
    return node.average_rating

def get_node_item_count(self, node):
    """Get the item count of a node."""
    return node.item_count

def get_node_state(self, node):
    """Get the state of a node."""
    return node.tag.state

def set_node_state(self, node, state):
    """Set the state of a node."""
    node.tag.state = state

def toggle_node_state(self, node, set_to=None):
    """Toggle the state of a node."""
    node.toggle(set_to=set_to)

def is_node_boxed(self, node):
    """Check if a node is boxed."""
    return node.boxed

def set_node_boxed(self, node, boxed):
    """Set the boxed state of a node."""
    node.boxed = boxed

def get_category_nodes(self, sort_by):
    """Get the category nodes."""
    return self._get_category_nodes(sort_by)

def get_category_editor_data(self, category):
    """Get the category editor data."""
    return self.get_category_editor_data(category)

def is_in_user_category(self, index):
    """Check if an index is in a user category."""
    return self.is_in_user_category(index)

def get_mime_types(self):
    """Get the mime types."""
    return self.mimeTypes()

def get_mime_data(self, indexes):
    """Get the mime data."""
    return self.mimeData(indexes)

def drop_mime_data(self, md, action, row, column, parent):
    """Drop mime data."""
    return self.dropMimeData(md, action, row, column, parent)

def do_drop_from_tag_browser(self, md, action, row, column, parent):
    """Do drop from tag browser."""
    return self.do_drop_from_tag_browser(md, action, row, column, parent)

def do_drop_from_library(self, md, action, row, column, parent):
    """Do drop from library."""
    return self.do_drop_from_library(md, action, row, column, parent)

def handle_drop(self, on_node, ids):
    """Handle drop."""
    return self.handle_drop(on_node, ids)

def handle_user_category_drop(self, on_node, ids, column):
    """Handle user category drop."""
    return self.handle_user_category_drop(on_node, ids, column)

def get_in_vl(self):
    """Get the in vl."""
    return self.get_in_vl()

def get_book_ids_to_use(self):
    """Get the book ids to use."""
    return self.get_book_ids_to_use()

def get_category_filter(self):
    """Get the category filter."""
    return self.get_categories_filter()

def set_category_filter(self, txt):
    """Set the category filter."""
    return self.set_categories_filter(txt)

def refresh(self, data=None):
    """Refresh."""
    return self.refresh(data)

def create_node(self, *args, **kwargs):
    """Create a node."""
    return self.create_node(*args, **kwargs)

def get_node(self, idx):
    """Get a node."""
    return self.get_node(idx)

def create_index(self, row, column, internal_pointer=None):
    """Create an index."""
    return self.createIndex(row, column, internal_pointer)

def index_for_category(self, name):
    """Get the index for a category."""
    return self.index_for_category(name)

def column_count(self, parent):
    """Get the column count."""
    return self.columnCount(parent)

def data(self, index, role):
    """Get the data."""
    return self.data(index, role)

def set_data(self, index, value, role=Qt.EditRole):
    """Set the data."""
    return self.setData(index, value, role)

def flags(self, index):
    """Get the flags."""
    return self.flags(index)

def supported_drop_actions(self):
    """Get the supported drop actions."""
    return self.supportedDropActions()

def path_for_index(self, index):
    """Get the path for an index."""
    return self.path_for_index(index)

def index_for_path(self, path):
    """Get the index for a path."""
    return self.index_for_path(path)

def index(self, row, column, parent):
    """Get the index."""
    return self.index(row, column, parent)

def parent(self, index):
    """Get the parent."""
    return self.parent(index)

def row_count(self, parent):
    """Get the row count."""
    return self.rowCount(parent)

def reset_all_states(self, except_=None):
    """Reset all states."""
    return self.reset_all_states(except_)

def clear_state(self):
    """Clear the state."""
    return self.clear_state()

def toggle(self, index, exclusive, set_to=None):
    """Toggle."""
    return self.toggle(index, exclusive, set_to)

def tokens(self):
    """Get the tokens."""
    return self.tokens()

def find_item_node(self, key, txt, start_path, equals_match=False):
    """Find an item node."""
    return self.find_item_node(key, txt, start_path, equals_match)

def find_category_node(self, key, parent=QModelIndex()):
    """Find a category node."""
    return self.find_category_node(key, parent)

def set_boxed(self, idx):
    """Set boxed."""
    return self.set_boxed(idx)

def clear_boxed(self):
    """Clear boxed."""
    return self.clear_boxed()