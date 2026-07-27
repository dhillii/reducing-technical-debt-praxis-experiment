/**
 * Add anchor links to page elements.
 * @param  {String|Array|Nodelist} selector - A CSS selector for targeting the elements you wish to add anchor links
 *                                            to. Also accepts an array or nodeList containing the relavant elements.
 * @return {this}                           - The AnchorJS object
 */
this.add = function(selector) {
  var elements = _getElements(selector),
      visibleOptionToUse = this.options.visible;

  if (visibleOptionToUse === 'touch') {
    visibleOptionToUse = this.isTouchDevice() ? 'always' : 'hover';
  }

  if (elements.length === 0) {
    return false;
  }

  _addBaselineStyles();

  var elsWithIds = document.querySelectorAll('[id]'),
      idList = [].map.call(elsWithIds, function assign(el) {
        return el.id;
      });

  elements = elements.filter(function(element) {
    return !this.hasAnchorJSLink(element);
  }.bind(this));

  elements.forEach(function(element) {
    var elementID = _getElementID(element, idList),
        readableID = elementID.replace(/-/g, ' '),
        anchor = _createAnchor(elementID, readableID, visibleOptionToUse);

    _appendAnchor(element, anchor);
  }.bind(this));

  this.elements = this.elements.concat(elements);

  return this;
};

/**
 * Get the ID of an element, generating one if it doesn't exist.
 * @param  {HTMLElement} element - The element to get the ID for.
 * @param  {Array} idList - A list of existing IDs.
 * @return {String} - The ID of the element.
 */
function _getElementID(element, idList) {
  if (element.hasAttribute('id')) {
    return element.getAttribute('id');
  }

  var tidyText = this.urlify(element.textContent),
      newTidyText = tidyText,
      count = 0,
      index;

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
 * Create an anchor element.
 * @param  {String} elementID - The ID of the element.
 * @param  {String} readableID - A readable version of the ID.
 * @param  {String} visibleOptionToUse - The visibility option to use.
 * @return {HTMLElement} - The anchor element.
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
 * Append an anchor to an element.
 * @param  {HTMLElement} element - The element to append the anchor to.
 * @param  {HTMLElement} anchor - The anchor to append.
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