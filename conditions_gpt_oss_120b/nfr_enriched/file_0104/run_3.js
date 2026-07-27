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
     * Determine the effective visibility option based on user settings and device capabilities.
     * @returns {string}
     */
    function _resolveVisibleOption() {
      var opt = this.options.visible;
      if (opt === 'touch') {
        opt = this.isTouchDevice() ? 'always' : 'hover';
      }
      return opt;
    }

    /**
     * Generate a unique ID for an element if it lacks one.
     * @param {Element} el
     * @param {Array<string>} existingIds
     * @returns {string}
     */
    function _ensureElementId(el, existingIds) {
      if (el.hasAttribute('id')) {
        return el.getAttribute('id');
      }
      var base = this.urlify(el.textContent);
      var candidate = base;
      var count = 0;
      while (existingIds.indexOf(candidate) !== -1) {
        candidate = base + '-' + count;
        count++;
      }
      existingIds.push(candidate);
      el.setAttribute('id', candidate);
      return candidate;
    }

    /**
     * Create an anchor element for a given target ID.
     * @param {string} targetId
     * @param {string} readableId
     * @returns {HTMLAnchorElement}
     */
    function _buildAnchor(targetId, readableId) {
      var a = document.createElement('a');
      a.className = 'anchorjs-link ' + this.options.class;
      a.href = '#' + targetId;
      a.setAttribute('aria-label', 'Anchor link for: ' + readableId);
      a.setAttribute('data-anchorjs-icon', this.options.icon);
      return a;
    }

    /**
     * Apply style rules to the anchor based on visibility and icon options.
     * @param {HTMLAnchorElement} anchor
     * @param {string} visibility
     */
    function _styleAnchor(anchor, visibility) {
      if (visibility === 'always') {
        anchor.style.opacity = '1';
      }
      if (this.options.icon === '\ue9cb') {
        anchor.style.font = '1em/1 anchorjs-icons';
        if (this.options.placement === 'left') {
          anchor.style.lineHeight = 'inherit';
        }
      }
    }

    /**
     * Insert the anchor into the target element according to placement option.
     * @param {HTMLAnchorElement} anchor
     * @param {Element} target
     */
    function _placeAnchor(anchor, target) {
      if (this.options.placement === 'left') {
        anchor.style.position = 'absolute';
        anchor.style.marginLeft = '-1em';
        anchor.style.paddingRight = '0.5em';
        target.insertBefore(anchor, target.firstChild);
      } else {
        anchor.style.paddingLeft = '0.375em';
        target.appendChild(anchor);
      }
    }

    /**
     * Add anchor links to page elements.
     * @param  {String|Array|Nodelist} selector
     * @return {this}
     */
    this.add = function(selector) {
      _applyRemainingDefaultOptions(this.options);
      var visibility = _resolveVisibleOption.call(this);

      if (!selector) {
        selector = 'h1, h2, h3, h4, h5, h6';
      }

      var elements = _getElements(selector);
      if (elements.length === 0) {
        return false;
      }

      _addBaselineStyles();

      var existingIdEls = document.querySelectorAll('[id]');
      var idList = [].map.call(existingIdEls, function (el) { return el.id; });

      // Filter out elements that already have an AnchorJS link.
      var freshElements = elements.filter(function (el) {
        return !this.hasAnchorJSLink(el);
      }, this);

      freshElements.forEach(function (el) {
        var elementID = _ensureElementId.call(this, el, idList);
        var readableID = elementID.replace(/-/g, ' ');
        var anchor = _buildAnchor.call(this, elementID, readableID);
        _styleAnchor.call(this, anchor, visibility);
        _placeAnchor.call(this, anchor, el);
      }, this);

      this.elements = this.elements.concat(freshElements);
      return this;
    };

    /**
     * Removes all anchorjs-links from elements targed by the selector.
     * @param  {String|Array|Nodelist} selector
     * @return {this}
     */
    this.remove = function(selector) {
      var elements = _getElements(selector);
      for (var i = 0; i < elements.length; i++) {
        var domAnchor = elements[i].querySelector('.anchorjs-link');
        if (domAnchor) {
          var idx = this.elements.indexOf(elements[i]);
          if (idx !== -1) {
            this.elements.splice(idx, 1);
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
     * @param  {String} text
     * @return {String}
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
     * Determines if this element already has an AnchorJS link on it.
     * @param    {HTMLElemnt}  el
     * @return   {Boolean}
     */
    this.hasAnchorJSLink = function(el) {
      var hasLeft = el.firstChild && ((' ' + el.firstChild.className + ' ').indexOf(' anchorjs-link ') > -1);
      var hasRight = el.lastChild && ((' ' + el.lastChild.className + ' ').indexOf(' anchorjs-link ') > -1);
      return hasLeft || hasRight || false;
    };

    /**
     * Turns a selector, nodeList, or array of elements into an array of elements.
     * @param  {String|Array|Nodelist} input
     * @return {Array}
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
     * Adds baseline styles to the page, used by all AnchorJS links regardless of configuration.
     */
    function _addBaselineStyles() {
      if (document.head.querySelector('style.anchorjs') !== null) {
        return;
      }

      var style = document.createElement('style'),
          linkRule =
          ' .anchorjs-link {' +
          '   opacity: 0;' +
          '   text-decoration: none;' +
          '   -webkit-font-smoothing: antialiased;' +
          '   -moz-osx-font-smoothing: grayscale;' +
          ' }',
          hoverRule =
          ' *:hover > .anchorjs-link,' +
          ' .anchorjs-link:focus  {' +
          '   opacity: 1;' +
          ' }',
          anchorjsLinkFontFace =
          ' @font-face {' +
          '   font-family: "anchorjs-icons";' +
          '   src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP) format("truetype");' +
          ' }',
          pseudoElContent =
          ' [data-anchorjs-icon]::after {' +
          '   content: attr(data-anchorjs-icon);' +
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