(function (root, factory) {
  'use strict';

  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AnchorJS = factory();
    root.anchors = new root.AnchorJS();
  }
}(this, function () {
  'use strict';

  function AnchorJS(options) {
    this.options = options || {};
    this.elements = [];

    /**
     * Assigns options to the internal options object, and provides defaults.
     * @param {Object} opts - Options object
     */
    function _applyRemainingDefaultOptions(opts) {
      opts.icon = opts.hasOwnProperty('icon') ? opts.icon : '\ue9cb';
      opts.visible = opts.hasOwnProperty('visible') ? opts.visible : 'hover';
      opts.placement = opts.hasOwnProperty('placement') ? opts.placement : 'right';
      opts.class = opts.hasOwnProperty('class') ? opts.class : '';
      opts.truncate = opts.hasOwnProperty('truncate') ? Math.floor(opts.truncate) : 64;
    }

    _applyRemainingDefaultOptions(this.options);

    /**
     * Checks to see if this device supports touch.
     * @return {Boolean} - true if the current device supports touch.
     */
    this.isTouchDevice = function() {
      return !!(('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch);
    };

    /**
     * Determines the visible option to use based on device capabilities.
     * @param {String} visibleOption - The configured visible option
     * @return {String} - The resolved visible option
     */
    var _resolveVisibleOption = function(visibleOption) {
      if (visibleOption === 'touch') {
        return this.isTouchDevice() ? 'always' : 'hover';
      }
      return visibleOption;
    }.bind(this);

    /**
     * Checks if element already has an AnchorJS link.
     * @param {HTMLElement} el - The element to check
     * @return {Boolean} - true if element has an anchor link
     */
    var _hasAnchorLink = function(el) {
      var hasLeftAnchor = el.firstChild && ((' ' + el.firstChild.className + ' ').indexOf(' anchorjs-link ') > -1);
      var hasRightAnchor = el.lastChild && ((' ' + el.lastChild.className + ' ').indexOf(' anchorjs-link ') > -1);
      return hasLeftAnchor || hasRightAnchor;
    };

    /**
     * Generates a unique ID for an element.
     * @param {String} tidyText - The base tidy text
     * @param {Array} idList - List of existing IDs
     * @return {String} - The generated unique ID
     */
    var _generateUniqueId = function(tidyText, idList) {
      var newTidyText = tidyText;
      var count = 0;
      var index = idList.indexOf(newTidyText);

      while (index !== -1) {
        newTidyText = tidyText + '-' + count;
        index = idList.indexOf(newTidyText);
        count += 1;
      }

      return newTidyText;
    };

    /**
     * Sets the element ID, either from existing attribute or generated.
     * @param {HTMLElement} element - The element to set ID on
     * @param {Array} idList - List of existing IDs
     * @return {String} - The element's ID
     */
    var _setElementId = function(element, idList) {
      if (element.hasAttribute('id')) {
        return element.getAttribute('id');
      }

      var tidyText = this.urlify(element.textContent);
      var newId = _generateUniqueId(tidyText, idList);
      idList.push(newId);
      element.setAttribute('id', newId);
      return newId;
    }.bind(this);

    /**
     * Applies styling to anchor element based on options.
     * @param {HTMLElement} anchor - The anchor element
     * @param {String} visibleOption - The visible option
     */
    var _styleAnchor = function(anchor, visibleOption) {
      if (visibleOption === 'always') {
        anchor.style.opacity = '1';
      }

      if (this.options.icon === '\ue9cb') {
        anchor.style.font = '1em/1 anchorjs-icons';
        if (this.options.placement === 'left') {
          anchor.style.lineHeight = 'inherit';
        }
      }
    }.bind(this);

    /**
     * Positions anchor element based on placement option.
     * @param {HTMLElement} anchor - The anchor element
     * @param {HTMLElement} element - The parent element
     */
    var _positionAnchor = function(anchor, element) {
      if (this.options.placement === 'left') {
        anchor.style.position = 'absolute';
        anchor.style.marginLeft = '-1em';
        anchor.style.paddingRight = '0.5em';
        element.insertBefore(anchor, element.firstChild);
      } else {
        anchor.style.paddingLeft = '0.375em';
        element.appendChild(anchor);
      }
    }.bind(this);

    /**
     * Creates an anchor element with proper attributes.
     * @param {String} elementID - The ID of the target element
     * @param {String} readableID - The readable version of the ID
     * @return {HTMLElement} - The created anchor element
     */
    var _createAnchorElement = function(elementID, readableID) {
      var anchor = document.createElement('a');
      anchor.className = 'anchorjs-link ' + this.options.class;
      anchor.href = '#' + elementID;
      anchor.setAttribute('aria-label', 'Anchor link for: ' + readableID);
      anchor.setAttribute('data-anchorjs-icon', this.options.icon);
      return anchor;
    }.bind(this);

    /**
     * Processes a single element to add anchor link.
     * @param {HTMLElement} element - The element to process
     * @param {Array} idList - List of existing IDs
     * @param {String} visibleOption - The visible option
     * @return {Boolean} - true if element was processed, false if skipped
     */
    var _processElement = function(element, idList, visibleOption) {
      if (_hasAnchorLink(element)) {
        return false;
      }

      var elementID = _setElementId(element, idList);
      var readableID = elementID.replace(/-/g, ' ');
      var anchor = _createAnchorElement(elementID, readableID);

      _styleAnchor(anchor, visibleOption);
      _positionAnchor(anchor, element);

      return true;
    };

    /**
     * Add anchor links to page elements.
     * @param  {String|Array|Nodelist} selector - A CSS selector for targeting elements
     * @return {this}                           - The AnchorJS object
     */
    this.add = function(selector) {
      var elements, elsWithIds, idList, i, indexesToDrop = [];

      _applyRemainingDefaultOptions(this.options);

      var visibleOptionToUse = _resolveVisibleOption(this.options.visible);

      if (!selector) {
        selector = 'h1, h2, h3, h4, h5, h6';
      }

      elements = _getElements(selector);

      if (elements.length === 0) {
        return false;
      }

      _addBaselineStyles();

      elsWithIds = document.querySelectorAll('[id]');
      idList = [].map.call(elsWithIds, function assign(el) {
        return el.id;
      });

      for (i = 0; i < elements.length; i++) {
        if (!_processElement(elements[i], idList, visibleOptionToUse)) {
          indexesToDrop.push(i);
        }
      }

      for (i = 0; i < indexesToDrop.length; i++) {
        elements.splice(indexesToDrop[i] - i, 1);
      }

      this.elements = this.elements.concat(elements);

      return this;
    };

    /**
     * Removes all anchorjs-links from elements targeted by the selector.
     * @param  {String|Array|Nodelist} selector - A CSS selector string or array of elements
     * @return {this}                           - The AnchorJS object
     */
    this.remove = function(selector) {
      var elements = _getElements(selector);

      for (var i = 0; i < elements.length; i++) {
        _removeAnchorFromElement(elements[i]);
      }

      return this;
    };

    /**
     * Removes anchor link from a single element.
     * @param {HTMLElement} element - The element to remove anchor from
     */
    var _removeAnchorFromElement = function(element) {
      var domAnchor = element.querySelector('.anchorjs-link');

      if (!domAnchor) {
        return;
      }

      var index = this.elements.indexOf(element);
      if (index !== -1) {
        this.elements.splice(index, 1);
      }

      element.removeChild(domAnchor);
    }.bind(this);

    /**
     * Removes all anchorjs links.
     */
    this.removeAll = function() {
      this.remove(this.elements);
    };

    /**
     * Urlify - Refine text so it makes a good ID.
     * @param  {String} text - Any text. Usually pulled from the webpage element.
     * @return {String}      - hyphen-delimited text for use in IDs and URLs.
     */
    this.urlify = function(text) {
      var nonsafeChars = /[& +$,:;=?@"#{}|^~[`%!'\]\.\/\(\)\*\\]/g;

      if (!this.options.truncate) {
        _applyRemainingDefaultOptions(this.options);
      }

      var urlText = text.trim()
                        .replace(/\'/gi, '')
                        .replace(nonsafeChars, '-')
                        .replace(/-{2,}/g, '-')
                        .substring(0, this.options.truncate)
                        .replace(/^-+|-+$/gm, '')
                        .toLowerCase();

      return urlText;
    };

    /**
     * Determines if this element already has an AnchorJS link on it.
     * @param    {HTMLElement}  el - a DOM node
     * @return   {Boolean}     true/false
     */
    this.hasAnchorJSLink = function(el) {
      return _hasAnchorLink(el);
    };

    /**
     * Turns a selector, nodeList, or array of elements into an array of elements.
     * @param  {String|Array|Nodelist} input - A CSS selector string or array of elements
     * @return {Array} - An array containing the elements we want.
     */
    function _getElements(input) {
      if (typeof input === 'string' || input instanceof String) {
        return [].slice.call(document.querySelectorAll(input));
      }

      if (Array.isArray(input) || input instanceof NodeList) {
        return [].slice.call(input);
      }

      throw new Error('The selector provided to AnchorJS was invalid.');
    }

    /**
     * Adds baseline styles to the page.
     */
    function _addBaselineStyles() {
      if (document.head.querySelector('style.anchorjs') !== null) {
        return;
      }

      var style = document.createElement('style');
      var linkRule = ' .anchorjs-link {' +
                     '   opacity: 0;' +
                     '   text-decoration: none;' +
                     '   -webkit-font-smoothing: antialiased;' +
                     '   -moz-osx-font-smoothing: grayscale;' +
                     ' }';
      var hoverRule = ' *:hover > .anchorjs-link,' +
                      ' .anchorjs-link:focus  {' +
                      '   opacity: 1;' +
                      ' }';
      var anchorjsLinkFontFace = ' @font-face {' +
                                 '   font-family: "anchorjs-icons";' +
                                 '   src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP) format("truetype");' +
                                 ' }';
      var pseudoElContent = ' [data-anchorjs-icon]::after {' +
                            '   content: attr(data-anchorjs-icon);' +
                            ' }';

      style.className = 'anchorjs';
      style.appendChild(document.createTextNode(''));

      var firstStyleEl = document.head.querySelector('[rel="stylesheet"], style');
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
}));