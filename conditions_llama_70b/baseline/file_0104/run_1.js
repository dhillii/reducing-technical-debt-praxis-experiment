/**
 * Add anchor links to page elements.
 * @param  {String|Array|Nodelist} selector - A CSS selector for targeting the elements you wish to add anchor links
 *                                            to. Also accepts an array or nodeList containing the relavant elements.
 * @return {this}                           - The AnchorJS object
 */
this.add = function(selector) {
  var elements = _getElements(selector),
      visibleOptionToUse = _getVisibleOption(),
      indexesToDrop = [];

  if (elements.length === 0) {
    return false;
  }

  _addBaselineStyles();

  var elsWithIds = document.querySelectorAll('[id]');
  var idList = _getIdList(elsWithIds);

  elements.forEach(function(element, index) {
    if (_hasAnchorJSLink(element)) {
      indexesToDrop.push(index);
      return;
    }

    var elementID = _getElementID(element, idList);
    var readableID = _getReadableID(elementID);
    var anchor = _createAnchor(elementID, readableID, visibleOptionToUse);

    _appendAnchor(element, anchor);
  });

  _removeIndexes(elements, indexesToDrop);
  this.elements = this.elements.concat(elements);

  return this;
};

/**
 * Get visible option
 * @return {String} - Visible option
 */
function _getVisibleOption() {
  var visibleOptionToUse = this.options.visible;
  if (visibleOptionToUse === 'touch') {
    visibleOptionToUse = this.isTouchDevice() ? 'always' : 'hover';
  }
  return visibleOptionToUse;
}

/**
 * Get ID list
 * @param  {NodeList} elsWithIds - Elements with IDs
 * @return {Array} - ID list
 */
function _getIdList(elsWithIds) {
  return [].map.call(elsWithIds, function assign(el) {
    return el.id;
  });
}

/**
 * Get element ID
 * @param  {HTMLElement} element - Element
 * @param  {Array} idList - ID list
 * @return {String} - Element ID
 */
function _getElementID(element, idList) {
  if (element.hasAttribute('id')) {
    return element.getAttribute('id');
  }

  var tidyText = this.urlify(element.textContent);
  var newTidyText = tidyText;
  var count = 0;
  var index;

  do {
    if (index !== undefined) {
      newTidyText = tidyText + '-' + count;
    }

    index = idList.indexOf(newTidyText);
    count += 1;
  } while (index !== -1);

  element.setAttribute('id', newTidyText);
  return newTidyText;
}

/**
 * Get readable ID
 * @param  {String} elementID - Element ID
 * @return {String} - Readable ID
 */
function _getReadableID(elementID) {
  return elementID.replace(/-/g, ' ');
}

/**
 * Create anchor
 * @param  {String} elementID - Element ID
 * @param  {String} readableID - Readable ID
 * @param  {String} visibleOptionToUse - Visible option
 * @return {HTMLElement} - Anchor
 */
function _createAnchor(elementID, readableID, visibleOptionToUse) {
  var anchor = document.createElement('a');
  anchor.className = 'anchorjs-link ' + this.options.class;
  anchor.href = '#' + elementID;
  anchor.setAttribute('aria-label', 'Anchor link for: ' + readableID);
  anchor.setAttribute('data-anchorjs-icon', this.options.icon);

  if (visibleOptionToUse === 'always') {
    anchor.style.opacity = '1';
  }

  if (this.options.icon === '\ue9cb') {
    anchor.style.font = '1em/1 anchorjs-icons';

    if (this.options.placement === 'left') {
      anchor.style.lineHeight = 'inherit';
    }
  }

  return anchor;
}

/**
 * Append anchor
 * @param  {HTMLElement} element - Element
 * @param  {HTMLElement} anchor - Anchor
 */
function _appendAnchor(element, anchor) {
  if (this.options.placement === 'left') {
    anchor.style.position = 'absolute';
    anchor.style.marginLeft = '-1em';
    anchor.style.paddingRight = '0.5em';
    element.insertBefore(anchor, element.firstChild);
  } else {
    anchor.style.paddingLeft = '0.375em';
    element.appendChild(anchor);
  }
}

/**
 * Remove indexes
 * @param  {Array} elements - Elements
 * @param  {Array} indexesToDrop - Indexes to drop
 */
function _removeIndexes(elements, indexesToDrop) {
  for (var i = 0; i < indexesToDrop.length; i++) {
    elements.splice(indexesToDrop[i] - i, 1);
  }
}

/**
 * Check if element has AnchorJS link
 * @param  {HTMLElement} element - Element
 * @return {Boolean} - True if element has AnchorJS link
 */
function _hasAnchorJSLink(element) {
  var hasLeftAnchor = element.firstChild && ((' ' + element.firstChild.className + ' ').indexOf(' anchorjs-link ') > -1),
      hasRightAnchor = element.lastChild && ((' ' + element.lastChild.className + ' ').indexOf(' anchorjs-link ') > -1);

  return hasLeftAnchor || hasRightAnchor || false;
}