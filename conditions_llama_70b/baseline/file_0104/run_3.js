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

  _addBaselineStyles();

  var visibleOptionToUse = _getVisibleOption();
  var idList = _getIdList();

  elements = elements.filter(function(element) {
    return !_hasAnchorJSLink(element);
  });

  elements.forEach(function(element) {
    var elementID = _getElementID(element, idList);
    var anchor = _createAnchor(elementID, visibleOptionToUse);
    _appendAnchor(element, anchor);
  });

  this.elements = this.elements.concat(elements);

  return this;
};

/**
 * Get the visible option to use.
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
 * Get the list of existing IDs.
 * @return {Array} - The list of existing IDs.
 */
function _getIdList() {
  var elsWithIds = document.querySelectorAll('[id]');
  return [].map.call(elsWithIds, function assign(el) {
    return el.id;
  });
}

/**
 * Check if an element already has an AnchorJS link.
 * @param  {HTMLElemnt}  el - a DOM node
 * @return {Boolean}     true/false
 */
function _hasAnchorJSLink(el) {
  var hasLeftAnchor = el.firstChild && ((' ' + el.firstChild.className + ' ').indexOf(' anchorjs-link ') > -1),
      hasRightAnchor = el.lastChild && ((' ' + el.lastChild.className + ' ').indexOf(' anchorjs-link ') > -1);

  return hasLeftAnchor || hasRightAnchor || false;
}

/**
 * Get the ID of an element.
 * @param  {HTMLElemnt}  el - a DOM node
 * @param  {Array} idList - The list of existing IDs.
 * @return {String}      - The ID of the element.
 */
function _getElementID(el, idList) {
  if (el.hasAttribute('id')) {
    return el.getAttribute('id');
  } else {
    var tidyText = this.urlify(el.textContent);
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

    el.setAttribute('id', newTidyText);
    return newTidyText;
  }
}

/**
 * Create an anchor element.
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
 * Append the anchor element to the element.
 * @param  {HTMLElemnt}  el - a DOM node
 * @param  {HTMLElement} anchor - The anchor element.
 */
function _appendAnchor(el, anchor) {
  if (this.options.placement === 'left') {
    anchor.style.position = 'absolute';
    anchor.style.marginLeft = '-1em';
    anchor.style.paddingRight = '0.5em';
    el.insertBefore(anchor, el.firstChild);
  } else {
    anchor.style.paddingLeft = '0.375em';
    el.appendChild(anchor);
  }
}