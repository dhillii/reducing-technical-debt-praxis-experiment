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
     * Determines the appropriate visibility option based on device capabilities.
     * @return {String} - The visibility option to use ('always' or 'hover')
     */
    var _getVisibleOption = function(visibleOption) {
      if (visibleOption === 'touch') {
        return this.isTouchDevice() ? 'always' : 'hover';
      }
      return visibleOption;
    }.bind(this);

    /**
     * Generates a unique ID for an element, avoiding duplicates.
     * @param {String} tidyText - The base text for the ID
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
     * Creates and configures an anchor element with appropriate styles and attributes.
     * @param {String} elementID - The ID of the target element
     * @param {String} readableID - Human-readable version of the ID
     * @param {String} visibleOptionToUse - The visibility setting
     * @return {HTMLElement} - The configured anchor element
     */
    var _createAnchorElement = function(elementID, readableID, visibleOptionToUse) {
      var anchor = document.createElement('a');
      anchor.className = 'anchorjs-link ' + this.options.class;
      anchor.href = '#' + elementID;
      anchor.setAttribute('aria-label', 'Anchor link for: ' + readableID);
      anchor.setAttribute('data-anchorjs-icon', this.options.icon);

      if (visibleOptionToUse === 'always') {
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
    var _insertAnchorElement = function(anchor, element) {
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
     * @param {Array} idList - List of existing IDs
     * @param {String} visibleOptionToUse - The visibility setting
     * @return {String} - The element's ID (existing or newly generated)
     */
    var _processElement = function(element, idList, visibleOptionToUse) {
      var elementID;

      if (element.hasAttribute('id')) {
        elementID = element.getAttribute('id');
      } else {
        var tidyText = this.urlify(element.textContent);
        elementID = _generateUniqueId(tidyText, idList);
        element.setAttribute('id', elementID);
      }

      var readableID = elementID.replace(/-/g, ' ');
      var anchor = _createAnchorElement(elementID, readableID, visibleOptionToUse);

      _applyIconStyles(anchor);
      _insertAnchorElement(anchor, element);

      return elementID;
    }.bind(this);

    /**
     * Collects existing IDs from the document.
     * @return {Array} - Array of existing element IDs
     */
    var _getExistingIds = function() {
      var elsWithIds = document.querySelectorAll('[id]');
      return [].map.call(elsWithIds, function(el) {
        return el.id;
      });
    };

    /**
     * Add anchor links to page elements.
     * @param  {String|Array|Nodelist} selector - A CSS selector for targeting the elements you wish to add anchor links
     *                                            to. Also accepts an array or nodeList containing the relavant elements.
     * @return {this}                           - The AnchorJS object
     */
    this.add = function(selector) {
      var elements;
      var idList;
      var indexesToDrop = [];
      var visibleOptionToUse;
      var i;

      _applyRemainingDefaultOptions(this.options);

      visibleOptionToUse = _getVisibleOption(this.options.visible);

      if (!selector) {
        selector = 'h1, h2, h3, h4, h5, h6';
      }

      elements = _getElements(selector);

      if (elements.length === 0) {
        return false;
      }

      _addBaselineStyles();

      idList = _getExistingIds();

      for (i = 0; i < elements.length; i++) {
        if (this.hasAnchorJSLink(elements[i])) {
          indexesToDrop.push(i);
          continue;
        }

        _processElement(elements[i], idList, visibleOptionToUse);
      }

      for (i = 0; i < indexesToDrop.length; i++) {
        elements.splice(indexesToDrop[i] - i, 1);
      }

      this.elements = this.elements.concat(elements);

      return this;
    };

    /**
     * Removes all anchorjs-links from elements targed by the selector.
     * @param  {String|Array|Nodelist} selector - A CSS selector string targeting elements with anchor links,
     *                                       	  	OR a nodeList / array containing the DOM elements.
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
     * Removes the anchor link from a single element.
     * @param {HTMLElement} element - The element to process
     */
    var _removeAnchorFromElement = function(element) {
      var domAnchor = element.querySelector('.anchorjs-link');
      if (domAnchor) {
        var index = this.elements.indexOf(element);
        if (index !== -1) {
          this.elements.splice(index, 1);
        }
        element.removeChild(domAnchor);
      }
    }.bind(this);

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
     * Builds the CSS rules for anchor styling.
     * @return {Array} - Array of CSS rule strings
     */
    var _buildCssRules = function() {
      var linkRule =
        ' .anchorjs-link {' +
        '   opacity: 0;' +
        '   text-decoration: none;' +
        '   -webkit-font-smoothing: antialiased;' +
        '   -moz-osx-font-smoothing: grayscale;' +
        ' }';

      var hoverRule =
        ' *:hover > .anchorjs-link,' +
        ' .anchorjs-link:focus  {' +
        '   opacity: 1;' +
        ' }';

      var pseudoElContent =
        ' [data-anchorjs-icon]::after {' +
        '   content: attr(data-anchorjs-icon);' +
        ' }';

      var anchorjsLinkFontFace =
        ' @font-face {' +
        '   font-family: "anchorjs-icons";' +
        '   src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP) format("truetype");' +
        ' }';

      return [linkRule, hoverRule, pseudoElContent, anchorjsLinkFontFace];
    };

    /**
     * Inserts the style element into the document head.
     * @param {HTMLElement} style - The style element to insert
     */
    var _insertStyleElement = function(style) {
      var firstStyleEl = document.head.querySelector('[rel="stylesheet"], style');
      if (firstStyleEl === undefined) {
        document.head.appendChild(style);
      } else {
        document.head.insertBefore(style, firstStyleEl);
      }
    };

    /**
     * Adds CSS rules to the style sheet.
     * @param {CSSStyleSheet} sheet - The style sheet
     * @param {Array} rules - Array of CSS rule strings
     */
    var _addCssRules = function(sheet, rules) {
      for (var i = 0; i < rules.length; i++) {
        sheet.insertRule(rules[i], sheet.cssRules.length);
      }
    };

    /**
     * _addBaselineStyles
     * Adds baseline styles to the page, used by all AnchorJS links irregardless of configuration.
     */
    function _addBaselineStyles() {
      if (document.head.querySelector('style.anchorjs') !== null) {
        return;
      }

      var style = document.createElement('style');
      style.className = 'anchorjs';
      style.appendChild(document.createTextNode(''));

      _insertStyleElement(style);

      var rules = _buildCssRules();
      _addCssRules(style.sheet, rules);
    }
  }

  return AnchorJS;
}));
```