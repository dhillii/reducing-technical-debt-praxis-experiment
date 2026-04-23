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
     * @param {String|Array|Nodelist} selector - A CSS selector for targeting the elements you wish to add anchor links
     * @return {this} - The AnchorJS object
     */
    this.add = function(selector) {
      var elements = _getElements(selector);
      if (elements.length === 0) {
        return false;
      }

      _addBaselineStyles();

      var visibleOptionToUse = _getVisibleOption();
      var idList = _getIdList();

      elements.forEach(function(element) {
        if (this.hasAnchorJSLink(element)) {
          return;
        }

        var elementID = _getElementID(element, idList);
        var anchor = _createAnchor(elementID, visibleOptionToUse);

        _appendAnchor(element, anchor);
      }, this);

      this.elements = this.elements.concat(elements);

      return this;
    };

    /**
     * Removes all anchorjs-links from elements targeted by the selector.
     * @param {String|Array|Nodelist} selector - A CSS selector string targeting elements with anchor links,
     * @return {this} - The AnchorJS object
     */
    this.remove = function(selector) {
      var elements = _getElements(selector);

      elements.forEach(function(element) {
        var domAnchor = element.querySelector('.anchorjs-link');
        if (domAnchor) {
          var index = this.elements.indexOf(element);
          if (index !== -1) {
            this.elements.splice(index, 1);
          }
          element.removeChild(domAnchor);
        }
      }, this);

      return this;
    };

    /**
     * Removes all anchorjs links.
     */
    this.removeAll = function() {
      this.remove(this.elements);
    };

    /**
     * Urlify - Refine text so it makes a good ID.
     * @param {String} text - Any text.
     * @return {String} - hyphen-delimited text for use in IDs and URLs.
     */
    this.urlify = function(text) {
      if (!this.options.truncate) {
        _applyRemainingDefaultOptions(this.options);
      }

      var urlText = text.trim()
        .replace(/\'/gi, '')
        .replace(/[& +$,:;=?@"#{}|^~[`%!'\]\.\/\(\)\*\\]/g, '-')
        .replace(/-{2,}/g, '-')
        .substring(0, this.options.truncate)
        .replace(/^-+|-+$/gm, '')
        .toLowerCase();

      return urlText;
    };

    /**
     * Determines if this element already has an AnchorJS link on it.
     * @param {HTMLElemnt} el - a DOM node
     * @return {Boolean} - true/false
     */
    this.hasAnchorJSLink = function(el) {
      var hasLeftAnchor = el.firstChild && ((' ' + el.firstChild.className + ' ').indexOf(' anchorjs-link ') > -1);
      var hasRightAnchor = el.lastChild && ((' ' + el.lastChild.className + ' ').indexOf(' anchorjs-link ') > -1);

      return hasLeftAnchor || hasRightAnchor || false;
    };

    /**
     * Turns a selector, nodeList, or array of elements into an array of elements.
     * @param {String|Array|Nodelist} input - A CSS selector string targeting elements with anchor links,
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
      var linkRule = ' .anchorjs-link { opacity: 0; text-decoration: none; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }';
      var hoverRule = ' *:hover > .anchorjs-link, .anchorjs-link:focus  { opacity: 1; }';
      var anchorjsLinkFontFace = ' @font-face { font-family: "anchorjs-icons"; src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP) format("truetype");';
      var pseudoElContent = ' [data-anchorjs-icon]::after { content: attr(data-anchorjs-icon); }';

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
     * Get visible option.
     * @return {String} - visible option
     */
    function _getVisibleOption() {
      var visibleOptionToUse = this.options.visible;
      if (visibleOptionToUse === 'touch') {
        visibleOptionToUse = this.isTouchDevice() ? 'always' : 'hover';
      }
      return visibleOptionToUse;
    }

    /**
     * Get id list.
     * @return {Array} - id list
     */
    function _getIdList() {
      var elsWithIds = document.querySelectorAll('[id]');
      return [].map.call(elsWithIds, function assign(el) {
        return el.id;
      });
    }

    /**
     * Get element id.
     * @param {HTMLElement} element - element
     * @param {Array} idList - id list
     * @return {String} - element id
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

      element.setAttribute('id', newTidyText);
      return newTidyText;
    }

    /**
     * Create anchor.
     * @param {String} elementID - element id
     * @param {String} visibleOptionToUse - visible option
     * @return {HTMLElement} - anchor
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
     * Append anchor.
     * @param {HTMLElement} element - element
     * @param {HTMLElement} anchor - anchor
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
  }

  return AnchorJS;
}));