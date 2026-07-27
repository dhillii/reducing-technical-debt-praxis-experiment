/**
 * Add anchor links to page elements.
 * @param  {String|Array|Nodelist} selector - A CSS selector for targeting the elements you wish to add anchor links
 *                                            to. Also accepts an array or nodeList containing the relavant elements.
 * @return {this}                           - The AnchorJS object
 */
this.add = function(selector) {
  var elements = _getElements(selector);
  var visibleOptionToUse = _getVisibleOption();
  var indexesToDrop = [];

  if (elements.length === 0) {
    return false;
  }

  _addBaselineStyles();

  var idList = _getIdList();
  for (var i = 0; i < elements.length; i++) {
    if (this.hasAnchorJSLink(elements[i])) {
      indexesToDrop.push(i);
      continue;
    }

    var elementID = _getElementID(elements[i], idList);
    var anchor = _createAnchor(elementID, visibleOptionToUse);
    _appendAnchor(elements[i], anchor, this.options.placement);
  }

  _removeIndexes(elements, indexesToDrop);
  this.elements = this.elements.concat(elements);

  return this;
};

/**
 * Get visible option to use.
 * @return {String} - The visible option to use.
 */
function _getVisibleOption() {
  var visibleOptionToUse = this.options.visible;
  if (visibleOptionToUse === 'touch') {
    visibleOptionToUse = this.isTouchDevice() ? 'always' : 'hover';
  }
  return visibleOptionToUse;
}

/**
 * Get ID list.
 * @return {Array} - The list of existing IDs.
 */
function _getIdList() {
  var elsWithIds = document.querySelectorAll('[id]');
  return [].map.call(elsWithIds, function assign(el) {
    return el.id;
  });
}

/**
 * Get element ID.
 * @param  {HTMLElement} element - The element to get the ID for.
 * @param  {Array} idList - The list of existing IDs.
 * @return {String} - The ID for the element.
 */
function _getElementID(element, idList) {
  if (element.hasAttribute('id')) {
    return element.getAttribute('id');
  } else {
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
    index = undefined;
    idList.push(newTidyText);

    element.setAttribute('id', newTidyText);
    return newTidyText;
  }
}

/**
 * Create anchor.
 * @param  {String} elementID - The ID of the element.
 * @param  {String} visibleOptionToUse - The visible option to use.
 * @return {HTMLElement} - The anchor element.
 */
function _createAnchor(elementID, visibleOptionToUse) {
  var anchor = document.createElement('a');
  anchor.className = 'anchorjs-link ' + this.options.class;
  anchor.href = '#' + elementID;
  anchor.setAttribute('aria-label', 'Anchor link for: ' + elementID.replace(/-/g, ' '));
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
 * Append anchor.
 * @param  {HTMLElement} element - The element to append the anchor to.
 * @param  {HTMLElement} anchor - The anchor element.
 * @param  {String} placement - The placement of the anchor.
 */
function _appendAnchor(element, anchor, placement) {
  if (placement === 'left') {
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
 * Remove indexes.
 * @param  {Array} elements - The array of elements.
 * @param  {Array} indexesToDrop - The array of indexes to drop.
 */
function _removeIndexes(elements, indexesToDrop) {
  for (var i = 0; i < indexesToDrop.length; i++) {
    elements.splice(indexesToDrop[i] - i, 1);
  }
}