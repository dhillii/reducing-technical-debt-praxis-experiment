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
     * Checks to see if this device supports touch. Uses criteria pulled from Modernizr.
     * @return {Boolean} - true if the current device supports touch.
     */
    this.isTouchDevice = function() {
      return !!(('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch);
    };

    /**
     * Add anchor links to page elements.
     * @param  {String|Array|Nodelist} selector - A CSS selector for targeting the elements to add anchor links to.
     * @return {this}                           - The AnchorJS object
     */
    this.add = function(selector) {
      var elements = _getElements(selector);

      if (elements.length === 0) {
        return false;
      }

      _addBaselineStyles();

      var existingIds = _getExistingIds();
      var indexesToDrop = [];

      for (var i = 0; i < elements.length; i++) {
        if (this.hasAnchorJSLink(elements[i])) {
          indexesToDrop.push(i);
          continue;
        }

        _ensureElementHasId(elements[i], existingIds);
      }

      elements = _removeIndexedElements(elements, indexesToDrop);

      for (var j = 0; j < elements.length; j++) {
        _attachAnchorLink(elements[j], this.options, this.isTouchDevice);
      }

      this.elements = this.elements.concat(elements);
      return this;
    };

    /**
     * Removes anchor links from elements matching the given selector.
     * @param  {String|Array|Nodelist} selector - CSS selector for elements containing anchor links.
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
     * Removes all anchor links from tracked elements.
     */
    this.removeAll = function() {
      this.remove(this.elements);
    };

    /**
     * Converts text into a URL-friendly ID.
     * @param  {String} text - Text to convert.
     * @return {String}      - Hyphen-delimited ID string.
     */
    this.urlify = function(text) {
      if (!this.options.truncate) {
        _applyRemainingDefaultOptions(this.options);
      }

      var nonsafeChars = /[& +$,:;=?@"#{}|^~[`%!'\].\/()*\\]/g;
      var urlText = text
        .trim()
        .replace(/\'/gi, '')
        .replace(nonsafeChars, '-')
        .replace(/-{2,}/g, '-')
        .substring(0, this.options.truncate)
        .replace(/^-+|-+$/gm, '')
        .toLowerCase();

      return urlText;
    };

    /**
     * Determines if an element already has an AnchorJS link.
     * @param    {HTMLElement} el - DOM node to check.
     * @return   {Boolean}        - true if the element has an anchor link.
     */
    this.hasAnchorJSLink = function(el) {
      var firstChild = el.firstChild;
      var lastChild = el.lastChild;

      var hasLeftAnchor = firstChild && hasAnchorJSClass(firstChild.className);
      var hasRightAnchor = lastChild && hasAnchorJSClass(lastChild.className);

      return hasLeftAnchor || hasRightAnchor;
    };

    /**
     * Returns elements matching the given selector or array/nodeList.
     * @param  {String|Array|NodeList} input - Selector or element collection.
     * @return {Array} - Array of DOM elements.
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
     * Retrieves IDs currently in use on the document.
     * @return {Array} - Array of existing ID strings.
     */
    function _getExistingIds() {
      var ids = document.querySelectorAll('[id]');
      return [].map.call(ids, function(el) { return el.id; });
    }

    /**
     * Ensures an element has an ID; creates one if needed.
     * @param {HTMLElement} el - Element to ensure has an ID.
     * @param {Array} existingIds - Array of existing IDs to avoid duplicates.
     */
    function _ensureElementHasId(el, existingIds) {
      var newId;
      if (el.hasAttribute('id')) {
        newId = el.getAttribute('id');
      } else {
        var text = this.urlify(el.textContent);
        var candidate = text;
        var count = 0;
        while (existingIds.indexOf(candidate) !== -1) {
          candidate = text + '-' + count;
          count++;
        }
        existingIds.push(candidate);
        el.setAttribute('id', candidate);
        newId = candidate;
      }

      var readableId = newId.replace(/-/g, ' ');
      var anchorOptions = this.options;
      var isTouchDeviceCallback = this.isTouchDevice.bind(this);

      _attachAnchorLink(el, anchorOptions, isTouchDeviceCallback, readableId);
    }

    /**
     * Attaches an anchor link to a given element.
     * @param  {HTMLElement} el             - Target element.
     * @param  {Object}      options        - AnchorJS configuration.
     * @param  {Function}    isTouchDevice  - Touch detection function.
     * @param  {String}      [readableId]   - Readable label for ARIA.
     */
    function _attachAnchorLink(el, options, isTouchDevice, readableId) {
      var visibleOptionToUse = options.visible;
      if (visibleOptionToUse === 'touch') {
        visibleOptionToUse = isTouchDevice() ? 'always' : 'hover';
      }

      var anchor = document.createElement('a');
      anchor.className = 'anchorjs-link ' + options.class;
      anchor.href = '#' + el.id;
      anchor.setAttribute('aria-label', 'Anchor link for: ' + (readableId || el.id.replace(/-/g, ' ')));
      anchor.setAttribute('data-anchorjs-icon', options.icon);

      if (visibleOptionToUse === 'always') {
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
        el.insertBefore(anchor, el.firstChild);
      } else {
        anchor.style.paddingLeft = '0.375em';
        el.appendChild(anchor);
      }
    }

    /**
     * Removes elements at specified indexes from an array.
     * @param  {Array} elements    - Original array.
     * @param  {Array} indexesToDrop - Array of indexes to remove (in ascending order).
     * @return {Array} - New array without dropped elements.
     */
    function _removeIndexedElements(elements, indexesToDrop) {
      for (var i = 0; i < indexesToDrop.length; i++) {
        var adjustedIndex = indexesToDrop[i] - i;
        if (adjustedIndex >= 0 && adjustedIndex < elements.length) {
          elements.splice(adjustedIndex, 1);
        }
      }
      return elements;
    }

    /**
     * Checks if a class string contains 'anchorjs-link'.
     * @param  {String} className - Class string.
     * @return {Boolean} - true if class contains anchorjs-link.
     */
    function hasAnchorJSClass(className) {
      return (' ' + className + ' ').indexOf(' anchorjs-link ') > -1;
    }

    /**
     * Adds baseline styles for all anchor links.
     */
    function _addBaselineStyles() {
      if (document.head.querySelector('style.anchorjs') !== null) {
        return;
      }

      var style = document.createElement('style');
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

      var anchorjsLinkFontFace =
        ' @font-face {' +
        '   font-family: "anchorjs-icons";' +
        '   src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP) format("truetype");' +
        ' }';

      var pseudoElContent =
        ' [data-anchorjs-icon]::after {' +
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

      var sheet = style.sheet;
      sheet.insertRule(linkRule, sheet.cssRules.length);
      sheet.insertRule(hoverRule, sheet.cssRules.length);
      sheet.insertRule(pseudoElContent, sheet.cssRules.length);
      sheet.insertRule(anchorjsLinkFontFace, sheet.cssRules.length);
    }
  }

  return AnchorJS;
}));