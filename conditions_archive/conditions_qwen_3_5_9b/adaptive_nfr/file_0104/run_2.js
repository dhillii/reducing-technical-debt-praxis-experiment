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
     * Determines if the visible option should be 'always' based on device type.
     * @return {String} - 'always' or 'hover'
     */
    function _getVisibleOption() {
      var visibleOptionToUse = this.options.visible;
      if (visibleOptionToUse === 'touch') {
        visibleOptionToUse = this.isTouchDevice() ? 'always' : 'hover';
      }
      return visibleOptionToUse;
    }

    /**
     * Determines if an element already has an AnchorJS link on it.
     * Uses this technique: http://stackoverflow.com/a/5898748/1154642
     * @param    {HTMLElement}  el - a DOM node
     * @return   {Boolean}     true/false
     */
    this.hasAnchorJSLink = function(el) {
      var hasLeftAnchor = el.firstChild && ((' ' + el.firstChild.className + ' ').indexOf(' anchorjs-link ') > -1),
          hasRightAnchor = el.lastChild && ((' ' + el.lastChild.className + ' ').indexOf(' anchorjs-link ') > -1);

      return hasLeftAnchor || hasRightAnchor;
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
     * Determines if an element already has an ID attribute.
     * @param {HTMLElement} element - DOM element to check
     * @return {Boolean} - true if element has an ID
     */
    function _hasElementId(element) {
      return element.hasAttribute('id');
    }

    /**
     * Determines if an element should be skipped during processing.
     * @param {HTMLElement} element - DOM element to check
     * @return {Boolean} - true if element should be skipped
     */
    function _shouldSkipElement(element) {
      return this.hasAnchorJSLink(element);
    }

    /**
     * Determines if an element ID is already in use.
     * @param {String} elementID - The ID to check
     * @param {Array} idList - Array of existing IDs
     * @return {Number} - Index if found, -1 otherwise
     */
    function _isIdInUse(elementID, idList) {
      return idList.indexOf(elementID);
    }

    /**
     * Generates a unique ID by incrementing a counter if needed.
     * @param {String} tidyText - The base text to use for the ID
     * @param {Array} idList - Array of existing IDs
     * @return {String} - A unique ID string
     */
    function _generateUniqueID(tidyText, idList) {
      var count = 0,
          newTidyText = tidyText;

      do {
        if (count > 0) {
          newTidyText = tidyText + '-' + count;
        }
        count += 1;
      } while (_isIdInUse(newTidyText, idList) !== -1);

      return newTidyText;
    }

    /**
     * Creates and configures the anchor link element.
     * @param {HTMLElement} element - The target element
     * @param {String} elementID - The ID to link to
     * @param {Object} options - AnchorJS configuration options
     * @return {HTMLElement} - The created anchor element
     */
    function _createAnchorElement(element, elementID, options) {
      var readableID = elementID.replace(/-/g, ' ');
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
        element.insertBefore(anchor, element.firstChild);
      } else {
        anchor.style.paddingLeft = '0.375em';
        element.appendChild(anchor);
      }

      return anchor;
    }

    /**
     * Adds anchor links to page elements.
     * @param  {String|Array|Nodelist} selector - A CSS selector for targeting the elements you wish to add anchor links
     *                                            to. Also accepts an array or nodeList containing the relavant elements.
     * @return {this}                           - The AnchorJS object
     */
    this.add = function(selector) {
      if (!selector) {
        selector = 'h1, h2, h3, h4, h5, h6';
      }

      var elements = _getElements(selector);

      if (elements.length === 0) {
        return false;
      }

      _addBaselineStyles();

      var elsWithIds = document.querySelectorAll('[id]');
      var idList = [].map.call(elsWithIds, function assign(el) {
        return el.id;
      });

      var visibleOptionToUse = _getVisibleOption.call(this);
      var indexesToDrop = [];

      for (var i = 0; i < elements.length; i++) {
        if (_shouldSkipElement.call(this, elements[i])) {
          indexesToDrop.push(i);
          continue;
        }

        var elementID;
        if (_hasElementId(elements[i])) {
          elementID = elements[i].getAttribute('id');
        } else {
          var tidyText = this.urlify(elements[i].textContent);
          elementID = _generateUniqueID(tidyText, idList);
          idList.push(elementID);
          elements[i].setAttribute('id', elementID);
        }

        _createAnchorElement(elements[i], elementID, this.options);
      }

      for (var j = 0; j < indexesToDrop.length; j++) {
        elements.splice(indexesToDrop[j] - j, 1);
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
        var domAnchor = elements[i].querySelector('.anchorjs-link');
        if (domAnchor) {
          var index = this.elements.indexOf(elements[i]);
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

    /**
     * _addBaselineStyles
     * Adds baseline styles to the page, used by all AnchorJS links irregardless of configuration.
     */
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
}));
```