/**
 * Add anchor links to page elements.
 * @param  {String|Array|Nodelist} selector - A CSS selector for targeting the elements you wish to add anchor links
 *                                            to. Also accepts an array or nodeList containing the relavant elements.
 * @return {this}                           - The AnchorJS object
 */
this.add = function(selector) {
  var elements = _getElements(selector);
  if (elements.length === 0) {
    return false;
  }

  _applyRemainingDefaultOptions(this.options);
  var visibleOptionToUse = this.options.visible;
  if (visibleOptionToUse === 'touch') {
    visibleOptionToUse = this.isTouchDevice() ? 'always' : 'hover';
  }

  _addBaselineStyles();

  var elsWithIds = document.querySelectorAll('[id]');
  var idList = [].map.call(elsWithIds, function assign(el) {
    return el.id;
  });

  var indexesToDrop = [];
  for (var i = 0; i < elements.length; i++) {
    if (this.hasAnchorJSLink(elements[i])) {
      indexesToDrop.push(i);
      continue;
    }

    var elementID = _getElementID(elements[i], idList);
    var readableID = elementID.replace(/-/g, ' ');
    var anchor = _createAnchor(elementID, readableID, this.options);

    if (this.options.placement === 'left') {
      elements[i].insertBefore(anchor, elements[i].firstChild);
    } else {
      elements[i].appendChild(anchor);
    }
  }

  for (var i = 0; i < indexesToDrop.length; i++) {
    elements.splice(indexesToDrop[i] - i, 1);
  }
  this.elements = this.elements.concat(elements);

  return this;
};

/**
 * Get the ID of an element, generating a new one if it doesn't exist.
 * @param  {HTMLElement} element - The element to get the ID for.
 * @param  {Array} idList - A list of existing IDs.
 * @return {String} - The ID of the element.
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
  index = undefined;
  idList.push(newTidyText);

  element.setAttribute('id', newTidyText);
  return newTidyText;
}

/**
 * Create an anchor element.
 * @param  {String} elementID - The ID of the element.
 * @param  {String} readableID - The readable ID of the element.
 * @param  {Object} options - The options object.
 * @return {HTMLElement} - The anchor element.
 */
function _createAnchor(elementID, readableID, options) {
  var anchor = document.createElement('a');
  anchor.className = 'anchorjs-link ' + options.class;
  anchor.href = '#' + elementID;
  anchor.setAttribute('aria-label', 'Anchor link for: ' + readableID);
  anchor.setAttribute('data-anchorjs-icon', options.icon);

  if (options.visible === 'always') {
    anchor.style.opacity = '1';
  }

  if (options.icon === '\ue9cb') {
    anchor.style.font = '1em/1 anchorjs-icons';

    if (options.placement === 'left') {
      anchor.style.lineHeight = 'inherit';
    }
  }

  if (options.placement === 'left') {
    anchor.style.position = 'absolute';
    anchor.style.marginLeft = '-1em';
    anchor.style.paddingRight = '0.5em';
  } else {
    anchor.style.paddingLeft = '0.375em';
  }

  return anchor;
}