/**
 * AnchorJS - v3.2.2 - 2016-10-05
 * https://github.com/bryanbraun/anchorjs
 * Copyright (c) 2016 Bryan Braun; Licensed MIT
 */

/* eslint-env amd, node */

// https://github.com/umdjs/umd/blob/master/templates/returnExports.js
(function (root, factory) {
  'use strict';

  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory();
  } else {
    // Browser globals (root is window)
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
     * Add anchor links to page elements.
     * @param  {String|Array|Nodelist} selector - A CSS selector for targeting the elements you wish to add anchor links
     *                                            to. Also accepts an array or nodeList containing the relevant elements.
     * @return {this}                           - The AnchorJS object
     */
    this.add = function(selector) {
      var elements,
          elementsWithIds,
          existingIdList,
          anchor,
          visibleOptionToUse;

      _applyRemainingDefaultOptions(this.options);

      visibleOptionToUse = this.options.visible;
      if (visibleOptionToUse === 'touch') {
        visibleOptionToUse = this.isTouchDevice() ? 'always' : 'hover';
      }

      selector = selector || 'h1, h2, h3, h4, h5, h6';
      elements = _getElements(selector);

      if (elements.length === 0) {
        return false;
      }

      _addBaselineStyles();

      elementsWithIds = document.querySelectorAll('[id]');
      existingIdList = _getIdentifiers(elementsWithIds);

      this._processElementsWithAnchors(elements, existingIdList, visibleOptionToUse);

      return this;
    };

    /**
     * Processes column of elements to add anchors to.
     * Handles adding IDs and anchors, ensuring ID uniqueness.
     * @param  {Array} elements               - Array of DOM elements to process
     * @param  {Array} existingIdList         - Array of existing IDs to avoid duplicates
     * @param  {String} visibleOptionToUse    - How anchors should be visible ('always', 'hover', etc.)
     */
    AnchorJS.prototype._processElementsWithAnchors = function(elements, existingIdList, visibleOptionToUse) {
      var indexesToDrop = [];
      var ElementsToProcess = [];

      for (var i = 0; i < elements.length; i++) {
        if (this.hasAnchorJSLink(elements[i])) {
          indexesToDrop.push(i);
          continue;
        }

        ElementsToProcess.push({
          element: elements[i],
          existingId: elements[i].hasAttribute('id') ? elements[i].getAttribute('id') : null
        });
      }

      for (i = 0; i < ElementsToProcess.length; i++) {
        var item = ElementsToProcess[i];
        var elementId = this._ensureIdIsUnique(item.element, item.existingId, existingIdList);
        var readableID = elementId.replace(/-/g, ' ');

        this._createAndInsertAnchor(elementId, readableID, visibleOptionToUse, item.element);
      }

      this._removeDroppedElementsFromProcessing(elements, indexesToDrop);
      this.elements = this.elements.concat(elements);
    };

    /**
     * Ensures the element has a unique ID, generating one if needed.
     * @param  {Element} element     - DOM element to assign ID to
     * @param  {String|null} existingId - Existing ID, if any
     * @param  {Array} existingIdList - List of existing IDs to avoid conflicts
     * @return {String}              - Final unique ID
     */
    AnchorJS.prototype._ensureIdIsUnique = function(element, existingId, existingIdList) {
      var tidyText;
      var newTidyText;
      var count;
      var index;

      if (existingId) {
        return existingId;
      }

      tidyText = this.urlify(element.textContent);
      newTidyText = tidyText;
      count = 0;
      index = existingIdList.indexOf(newTidyText);

      while (index !== -1) {
        newTidyText = tidyText + '-' + count;
        index = existingIdList.indexOf(newTidyText);
        count += 1;
      }

      existingIdList.push(newTidyText);
      element.setAttribute('id', newTidyText);

      return newTidyText;
    };

    /**
     * Creates and inserts an anchor element.
     * @param  {String} elementId       - The target ID for the anchor
     * @param  {String} readableId      - Human-readable version of the ID
     * @param  {String} visibleOption   - Visibility mode ('always' or 'hover')
     * @param  {Element} targetElement  - Element to attach anchor to
     */
    AnchorJS.prototype._createAndInsertAnchor = function(elementId, readableId, visibleOption, targetElement) {
      var anchor = this._buildAnchor(elementId, readableId);

      this._applyVisibility(anchor, visibleOption);
      this._applyIconStyling(anchor);

      if (this.options.placement === 'left') {
        this._insertLeftPositionedAnchor(anchor, targetElement);
      } else {
        targetElement.appendChild(anchor);
      }
    };

    /**
     * Builds the anchor DOM element.
     * @param  {String} elementId   - The ID the anchor points to
     * @param  {String} readableId  - Human-readable label
     * @return {Element}            - Created anchor element
     */
    AnchorJS.prototype._buildAnchor = function(elementId, readableId) {
      var anchor = document.createElement('a');
      anchor.className = 'anchorjs-link ' + this.options.class;
      anchor.href = '#' + elementId;
      anchor.setAttribute('aria-label', 'Anchor link for: ' + readableId);
      anchor.setAttribute('data-anchorjs-icon', this.options.icon);

      return anchor;
    };

    /**
     * Applies visibility styling to anchor.
     * @param {Element} anchor         - Anchor element
     * @param {String} visibleOption   - Visibility option ('always' or 'hover')
     */
    AnchorJS.prototype._applyVisibility = function(anchor, visibleOption) {
      if (visibleOption === 'always') {
        anchor.style.opacity = '1';
      }
    };

    /**
     * Applies icon-specific font styling to anchor.
     * @param {Element} anchor - Anchor element
     */
    AnchorJS.prototype._applyIconStyling = function(anchor) {
      if (this.options.icon === '\ue9cb') {
        anchor.style.font = '1em/1 anchorjs-icons';

        if (this.options.placement === 'left') {
          anchor.style.lineHeight = 'inherit';
        }
      }
    };

    /**
     * Inserts anchor at beginning of parent.
     * @param {Element} anchor          - Anchor element
     * @param {Element} targetElement   - Parent element
     */
    AnchorJS.prototype._insertLeftPositionedAnchor = function(anchor, targetElement) {
      anchor.style.position = 'absolute';
      anchor.style.marginLeft = '-1em';
      anchor.style.paddingRight = '0.5em';
      targetElement.insertBefore(anchor, targetElement.firstChild);
    };

    /**
     * Removes elements that were skipped (already had anchors) from processing list.
     * @param  {Array} elements       - Full array of elements
     * @param  {Array} indexesToDrop  - Array of indexes to drop
     */
    AnchorJS.prototype._removeDroppedElementsFromProcessing = function(elements, indexesToDrop) {
      for (var i = 0; i < indexesToDrop.length; i++) {
        elements.splice(indexesToDrop[i] - i, 1);
      }
    };

    /**
     * Removes all anchorjs-links from elements targeted by the selector.
     * @param  {String|Array|Nodelist} selector - A CSS selector string targeting elements with anchor links,
     *                                       	  	OR a nodeList / array containing the DOM elements.
     * @return {this}                           - The AnchorJS object
     */
    this.remove = function(selector) {
      var elements = _getElements(selector);

      for (var i = 0; i < elements.length; i++) {
        var anchor = elements[i].querySelector('.anchorjs-link');
        if (anchor) {
          this._removeSingleAnchor(elements[i], anchor);
        }
      }
      return this;
    };

    /**
     * Removes one anchor from an element.
     * @param  {Element} element  - Element containing anchor
     * @param  {Element} anchor   - Anchor DOM node
     */
    AnchorJS.prototype._removeSingleAnchor = function(element, anchor) {
      var index = this.elements.indexOf(element);
      if (index !== -1) {
        this.elements.splice(index, 1);
      }
      element.removeChild(anchor);
    };

    /**
     * Removes all anchorjs links. Mostly used for tests.
     */
    this.removeAll = function() {
      this.remove(this.elements);
    };

    /**
     * Urlify - Refine text so it makes a good ID.
     *
     * To do this, we remove apostrophes, replace nonsafe characters with hyphens,
     * remove extra hyphens, truncate, trim hyphens, and make lowercase.
     *
     * @param  {String} text - Any text. Usually pulled from the webpage element we are linking to.
     * @return {String}      - hyphen-delimited text for use in IDs and URLs.
     */
    this.urlify = function(text) {
      var nonsafeChars = /[& +$,:;=?@"#{}|^~[`%!'\]\.\/\(\)\*\\]/g;
      var urlText;

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

    /**
     * Determines if this element already has an AnchorJS link on it.
     * @param    {HTMLElement}  el - a DOM node
     * @return   {Boolean}     true/false
     */
    this.hasAnchorJSLink = function(el) {
      var hasLeftAnchor = el.firstChild && this._classListContains(el.firstChild.className, 'anchorjs-link');
      var hasRightAnchor = el.lastChild && this._classListContains(el.lastChild.className, 'anchorjs-link');

      return hasLeftAnchor || hasRightAnchor;
    };

    /**
     * Helper function to safely check class list inclusion.
     * @param  {String} classAttr - class attribute string
     * @param  {String} needle     - class name to search for
     * @return {Boolean}
     */
    AnchorJS.prototype._classListContains = function(classAttr, needle) {
      return (' ' + classAttr + ' ').indexOf(' ' + needle + ' ') > -1;
    };

    /**
     * Turns a selector, nodeList, or array of elements into an array of elements.
     * @param  {String|Array|Nodelist} input - A CSS selector string targeting elements with anchor links,
     *                                       	 OR a nodeList / array containing the DOM elements.
     * @return {Array} - An array containing the elements we want.
     */
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

    /**
     * _addBaselineStyles
     * Adds baseline styles to the page, used by all AnchorJS links irregardless of configuration.
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

      var anchorjsLinkFontFace = '@font-face {' +
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

    /**
     * Extracts ID values from a NodeList of elements.
     * @param  {NodeList|Array} elements - Elements to extract IDs from
     * @return {Array}                   - Array of ID strings
     */
    function _getIdentifiers(elements) {
      return [].map.call(elements, function(el) {
        return el.id;
      });
    }
  }

  return AnchorJS;
}));