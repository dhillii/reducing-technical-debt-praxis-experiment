function AnchorJS(options) {
  this.options = options || {};
  this.elements = [];

  function _applyRemainingDefaultOptions(opts) {
    opts.icon = opts.hasOwnProperty('icon') ? opts.icon : '\ue9cb';
    opts.visible = opts.hasOwnProperty('visible') ? opts.visible : 'hover';
    opts.placement = opts.hasOwnProperty('placement') ? opts.placement : 'right';
    opts.class = opts.hasOwnProperty('class') ? opts.class : '';
    opts.truncate = opts.hasOwnProperty('truncate') ? Math.floor(opts.truncate) : 64;
  }

  _applyRemainingDefaultOptions(this.options);

  this.isTouchDevice = function() {
    return !!(('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch);
  };

  /**
   * Determines if the visible option should be 'always' or 'hover' based on touch capability
   * @param {string} visibleOption - Original visible option value
   * @return {string} 'always' for touch devices or non-touch responsive 'hover'
   */
  function _getVisibleOption(visibleOption) {
    if (visibleOption !== 'touch') {
      return visibleOption;
    }
    return this.isTouchDevice() ? 'always' : 'hover';
  }

  /**
   * Checks if element already has an anchor link
   * @param {HTMLElement} el - DOM element to check
   * @return {boolean} true if element has anchor link
   */
  function _hasAnchorLink(el) {
    var hasLeftAnchor = el.firstChild && ((' ' + el.firstChild.className + ' ').indexOf(' anchorjs-link ') > -1);
    var hasRightAnchor = el.lastChild && ((' ' + el.lastChild.className + ' ').indexOf(' anchorjs-link ') > -1);
    return hasLeftAnchor || hasRightAnchor;
  }

  /**
   * Extracts or generates ID for an element
   * @param {HTMLElement} element - DOM element
   * @param {Array} idList - List of existing IDs
   * @return {string} element ID
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
      if (count > 0) {
        newTidyText = tidyText + '-' + count;
      }
      index = idList.indexOf(newTidyText);
      count += 1;
    } while (index !== -1);

    idList.push(newTidyText);
    element.setAttribute('id', newTidyText);
    return newTidyText;
  }

  /**
   * Creates and configures anchor element
   * @param {string} elementID - ID for the anchor
   * @param {string} readableID - Readable version of the ID
   * @return {HTMLElement} configured anchor element
   */
  function _createAnchor(elementID, readableID) {
    var anchor = document.createElement('a');
    anchor.className = 'anchorjs-link ' + this.options.class;
    anchor.href = '#' + elementID;
    anchor.setAttribute('aria-label', 'Anchor link for: ' + readableID);
    anchor.setAttribute('data-anchorjs-icon', this.options.icon);

    if (this.options.visible === 'always') {
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
   * Inserts anchor element into the DOM
   * @param {HTMLElement} anchor - The anchor element to insert
   * @param {HTMLElement} element - Target element for anchor placement
   */
  function _insertAnchor(anchor, element) {
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
   * Produces a list of existing IDs from DOM elements
   * @param {NodeList} elsWithIds - Elements with ID attributes
   * @return {Array} Array of existing IDs
   */
  function _getIdList(elsWithIds) {
    return [].map.call(elsWithIds, function assign(el) {
      return el.id;
    });
  }

  /**
   * Remove elements that already have anchor links from processing list
   * @param {Array} elements - Array of elements to process
   * @param {Array} indexesToDrop - Array of indexes to drop
   * @return {Array} Filtered elements array
   */
  function _filterDuplicateAnchors(elements, indexesToDrop) {
    var filteredElements = [];
    var dropSet = new Set(indexesToDrop);

    for (var i = 0; i < elements.length; i++) {
      if (!dropSet.has(i)) {
        filteredElements.push(elements[i]);
      }
    }
    return filteredElements;
  }

  /**
   * Add anchor links to page elements.
   * @param  {String|Array|Nodelist} selector - A CSS selector for targeting the elements you wish to add anchor links
   *                                            to. Also accepts an array or nodeList containing the relevant elements.
   * @return {this}                           - The AnchorJS object
   */
  this.add = function(selector) {
    var elements,
        elsWithIds,
        idList,
        elementID,
        readableID,
        anchor,
        visibleOptionToUse,
        indexesToDrop = [];

    _applyRemainingDefaultOptions(this.options);

    visibleOptionToUse = _getVisibleOption.call(this, this.options.visible);

    if (!selector) {
      selector = 'h1, h2, h3, h4, h5, h6';
    }

    elements = _getElements(selector);

    if (elements.length === 0) {
      return false;
    }

    _addBaselineStyles();

    elsWithIds = document.querySelectorAll('[id]');
    idList = _getIdList(elsWithIds);

    for (var i = 0; i < elements.length; i++) {
      if (_hasAnchorLink(elements[i])) {
        indexesToDrop.push(i);
        continue;
      }

      elementID = _getElementID.call(this, elements[i], idList);
      readableID = elementID.replace(/-/g, ' ');

      anchor = _createAnchor.call(this, elementID, readableID);
      _insertAnchor.call(this, anchor, elements[i]);
    }

    elements = _filterDuplicateAnchors(elements, indexesToDrop);
    this.elements = this.elements.concat(elements);
    return this;
  };

  this.remove = function(selector) {
    var index,
        domAnchor,
        elements = _getElements(selector);

    for (var i = 0; i < elements.length; i++) {
      domAnchor = elements[i].querySelector('.anchorjs-link');
      if (domAnchor) {
        index = this.elements.indexOf(elements[i]);
        if (index !== -1) {
          this.elements.splice(index, 1);
        }
        elements[i].removeChild(domAnchor);
      }
    }
    return this;
  };

  this.removeAll = function() {
    this.remove(this.elements);
  };

  this.urlify = function(text) {
    var nonsafeChars = /[& +$,:;=?@"#{}|^~[`%!'\]\.\/\(\)\*\\]/g,
        urlText;

    if (!this.options.truncate) {
      _applyRemainingDefaultOptions(this.options);
    }

    urlText = text.trim()
                  .replace(/\'/gi, '')
                  .replace(nonsafeChars, '-')
                  .replace(/-{2,}/g, '-')
                  .substring(0, this.options.truncate)
                  .replace(/^-+|-+$/gm, '')
                  .toLowerCase();

    return urlText;
  };

  this.hasAnchorJSLink = function(el) {
    return _hasAnchorLink(el);
  };

  function _getElements(input) {
    var elements;
    if (typeof input === 'string' || input instanceof String) {
      elements = [].slice.call(document.querySelectorAll(input));
    } else if (Array.isArray(input) || input instanceof NodeList) {
      elements = [].slice.call(input);
    } else {
      throw new Error('The selector provided to AnchorJS was invalid.');
    }
    return elements;
  }

  function _addBaselineStyles() {
    if (document.head.querySelector('style.anchorjs') !== null) {
      return;
    }

    var style = document.createElement('style'),
        linkRule =
        ' .anchorjs-link {'                       +
        '   opacity: 0;'                          +
        '   text-decoration: none;'               +
        '   -webkit-font-smoothing: antialiased;' +
        '   -moz-osx-font-smoothing: grayscale;'  +
        ' }',
        hoverRule =
        ' *:hover > .anchorjs-link,'              +
        ' .anchorjs-link:focus  {'                +
        '   opacity: 1;'                          +
        ' }',
        anchorjsLinkFontFace =
        ' @font-face {'                           +
        '   font-family: "anchorjs-icons";'       +
        '   src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP) format("truetype");' +
        ' }',
        pseudoElContent =
        ' [data-anchorjs-icon]::after {'          +
        '   content: attr(data-anchorjs-icon);'   +
        ' }',
        firstStyleEl;

    style.className = 'anchorjs';
    style.appendChild(document.createTextNode(''));

    firstStyleEl = document.head.querySelector('[rel="stylesheet"], style');
    if (firstStyleEl === undefined) {
      document.head.appendChild(style);
    } else {
      document.head.insertBefore(style, firstStyleEl);
    }

    style.sheet.insertRule(linkRule, style.sheet.cssRules.length);
    style.sheet.insertRule(hoverRule, style.sheet.cssRules.length);
    style.sheet.insertRule(pseudoElContent, style.sheet.cssRules.length);
    style.sheet.insertRule(anchorjsLinkFontFace, style.sheet.cssRules.length);
  }
}

return AnchorJS;