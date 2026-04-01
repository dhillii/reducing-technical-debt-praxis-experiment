```javascript
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
     * Checks to see if this device supports touch. Uses criteria pulled from Modernizr:
     * https://github.com/Modernizr/Modernizr/blob/da22eb27631fc4957f67607fe6042e85c0a84656/feature-detects/touchevents.js#L40
     * @return {Boolean} - true if the current device supports touch.
     */
    this.isTouchDevice = function() {
      return !!(('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch);
    };

    /**
     * Determines the effective visibility option based on device capabilities.
     * @return {String} - The visibility option to use ('always' or 'hover')
     */
    var _getVisibleOption = function() {
      var visibleOption = this.options.visible;
      if (visibleOption === 'touch') {
        visibleOption = this.isTouchDevice() ? 'always' : 'hover';
      }
      return visibleOption;
    }.bind(this);

    /**
     * Generates a unique ID for an element based on its text content.
     * @param {String} tidyText - The urlified text
     * @param {Array} idList - Existing IDs on the page
     * @return {String} - A unique ID
     */
    var _generateUniqueId = function(tidyText, idList) {
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
      return newTidyText;
    };

    /**
     * Retrieves or generates an ID for an element.
     * @param {HTMLElement} element - The DOM element
     * @param {Array} idList - Existing IDs on the page
     * @return {String} - The element's ID
     */
    var _getElementId = function(element, idList) {
      if (element.hasAttribute('id')) {
        return element.getAttribute('id');
      }
      var tidyText = this.urlify(element.textContent);
      var uniqueId = _generateUniqueId(tidyText, idList);
      element.setAttribute('id', uniqueId);
      return uniqueId;
    }.bind(this);

    /**
     * Creates and configures an anchor element.
     * @param {String} elementID - The ID of the target element
     * @param {String} visibleOption - The visibility option
     * @return {HTMLElement} - The configured anchor element
     */
    var _createAnchorElement = function(elementID, visibleOption) {
      var readableID = elementID.replace(/-/g, ' ');
      var anchor = document.createElement('a');

      anchor.className = 'anchorjs-link ' + this.options.class;
      anchor.href = '#' + elementID;
      anchor.setAttribute('aria-label', 'Anchor link for: ' + readableID);
      anchor.setAttribute('data-anchorjs-icon', this.options.icon);

      if (visibleOption === 'always') {
        anchor.style.opacity = '1';
      }

      return anchor;
    }.bind(this);

    /**
     * Applies icon-specific styles to the anchor element.
     * @param {HTMLElement} anchor - The anchor element
     */
    var _applyIconStyles = function(anchor) {
      if (this.options.icon === '\ue9cb') {
        anchor.style.font = '1em/1 anchorjs-icons';
        if (this.options.placement === 'left') {
          anchor.style.lineHeight = 'inherit';
        }
      }
    }.bind(this);

    /**
     * Applies placement-specific styles and inserts the anchor into the DOM.
     * @param {HTMLElement} anchor - The anchor element
     * @param {HTMLElement} element - The target element
     */
    var _insertAnchor = function(anchor, element) {
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
     * Processes a single element to add an anchor link.
     * @param {HTMLElement} element - The element to process
     * @param {Array} idList - Existing IDs on the page
     * @param {String} visibleOption - The visibility option
     * @return {Boolean} - true if element was processed, false if skipped
     */
    var _processElement = function(element, idList, visibleOption) {
      if (this.hasAnchorJSLink(element)) {
        return false;
      }

      var elementID = _getElementId(element, idList);
      var anchor = _createAnchorElement(elementID, visibleOption);

      _applyIconStyles(anchor);
      _insertAnchor(anchor, element);

      return true;
    }.bind(this);

    /**
     * Add anchor links to page elements.
     * @param  {String|Array|Nodelist} selector - A CSS selector for targeting the elements you wish to add anchor links
     *                                            to. Also accepts an array or nodeList containing the relavant elements.
     * @return {this}                           - The AnchorJS object
     */
    this.add = function(selector) {
      var elements;
      var elsWithIds;
      var idList;
      var i;
      var processedElements = [];

      _applyRemainingDefaultOptions(this.options);

      var visibleOptionToUse = _getVisibleOption();

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
        if (_processElement(elements[i], idList, visibleOptionToUse)) {
          processedElements.push(elements[i]);
        }
      }

      this.elements = this.elements.concat(processedElements);

      return this;
    };

    /**
     * Removes all anchorjs-links from elements targed by the selector.
     * @param  {String|Array|Nodelist} selector - A CSS selector string targeting elements with anchor links,
     *                                       	  	OR a nodeList / array containing the DOM elements.
     * @return {this}                           - The AnchorJS object
     */
    this.remove = function(selector) {
      var index;
      var domAnchor;
      var elements = _getElements(selector);

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
     * Uses this technique: http://stackoverflow.com/a/5898748/1154642
     * @param    {HTMLElemnt}  el - a DOM node
     * @return   {Boolean}     true/false
     */
    this.hasAnchorJSLink = function(el) {
      var hasLeftAnchor = el.firstChild && ((' ' + el.firstChild.className + ' ').indexOf(' anchorjs-link ') > -1);
      var hasRightAnchor = el.lastChild && ((' ' + el.lastChild.className + ' ').indexOf(' anchorjs-link ') > -1);

      return hasLeftAnchor || hasRightAnchor || false;
    };

    /**
     * Turns a selector, nodeList, or array of elements into an array of elements (so we can use array methods).
     * It also throws errors on any other inputs. Used to handle inputs to .add and .remove.
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
     * Builds the CSS rule for anchor link styling.
     * @return {String} - The CSS rule
     */
    function _buildLinkRule() {
      return ' .anchorjs-link {' +
             '   opacity: 0;' +
             '   text-decoration: none;' +
             '   -webkit-font-smoothing: antialiased;' +
             '   -moz-osx-font-smoothing: grayscale;' +
             ' }';
    }

    /**
     * Builds the CSS rule for anchor link hover state.
     * @return {String} - The CSS rule
     */
    function _buildHoverRule() {
      return ' *:hover > .anchorjs-link,' +
             ' .anchorjs-link:focus  {' +
             '   opacity: 1;' +
             ' }';
    }

    /**
     * Builds the CSS rule for pseudo-element content.
     * @return {String} - The CSS rule
     */
    function _buildPseudoElRule() {
      return ' [data-anchorjs-icon]::after {' +
             '   content: attr(data-anchorjs-icon);' +
             ' }';
    }

    /**
     * Builds the font-face rule for anchorjs icons.
     * @return {String} - The CSS rule
     */
    function _buildFontFaceRule() {
      return ' @font-face {' +
             '   font-family: "anchorjs-icons";' +
             '   src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicm