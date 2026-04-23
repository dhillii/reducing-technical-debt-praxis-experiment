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
     * @return {Boolean}
     */
    this.isTouchDevice = function () {
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
     * Build a list of existing IDs in the document to avoid duplicates.
     * @returns {Array<string>}
     */
    function _collectExistingIds() {
      var els = document.querySelectorAll('[id]');
      return [].map.call(els, function (el) { return el.id; });
    }

    /**
     * Generate a unique ID for an element based on its text content.
     * @param {string} base - The base ID derived from text.
     * @param {Array<string>} existing - List of IDs already present.
     * @returns {string}
     */
    function _generateUniqueId(base, existing) {
      var candidate = base;
      var count = 0;
      while (existing.indexOf(candidate) !== -1) {
        candidate = base + '-' + count;
        count += 1;
      }
      existing.push(candidate);
      return candidate;
    }

    /**
     * Create the anchor element with appropriate attributes.
     * @param {string} id - Target element ID.
     * @param {string} readable - Human‑readable version of the ID.
     * @returns {HTMLAnchorElement}
     */
    function _createAnchor(id, readable) {
      var a = document.createElement('a');
      a.className = 'anchorjs-link ' + this.options.class;
      a.href = '#' + id;
      a.setAttribute('aria-label', 'Anchor link for: ' + readable);
      a.setAttribute('data-anchorjs-icon', this.options.icon);
      return a;
    }

    /**
     * Apply icon‑specific styling to the anchor element.
     * @param {HTMLAnchorElement} anchor
     */
    function _applyIconStyles(anchor) {
      if (this.options.icon === '\ue9cb') {
        anchor.style.font = '1em/1 anchorjs-icons';
        if (this.options.placement === 'left') {
          anchor.style.lineHeight = 'inherit';
        }
      }
    }

    /**
     * Insert the anchor into the target element based on placement option.
     * @param {HTMLElement} target
     * @param {HTMLAnchorElement} anchor
     */
    function _insertAnchor(target, anchor) {
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
     * @param {String|Array|Nodelist} selector
     * @returns {this|false}
     */
    this.add = function (selector) {
      var elements,
          visibleOption,
          existingIds,
          indexesToDrop = [];

      _applyRemainingDefaultOptions(this.options);
      visibleOption = _resolveVisibleOption.call(this);

      if (!selector) {
        selector = 'h1, h2, h3, h4, h5, h6';
      }

      elements = _getElements(selector);
      if (elements.length === 0) {
        return false;
      }

      _addBaselineStyles();

      existingIds = _collectExistingIds();

      for (var i = 0; i < elements.length; i++) {
        var el = elements[i];

        if (this.hasAnchorJSLink(el)) {
          indexesToDrop.push(i);
          continue;
        }

        var elementID;
        if (el.hasAttribute('id')) {
          elementID = el.getAttribute('id');
        } else {
          var tidy = this.urlify(el.textContent);
          elementID = _generateUniqueId(tidy, existingIds);
          el.setAttribute('id', elementID);
        }

        var readableID = elementID.replace(/-/g, ' ');
        var anchor = _createAnchor.call(this, elementID, readableID);

        if (visibleOption === 'always') {
          anchor.style.opacity = '1';
        }

        _applyIconStyles.call(this, anchor);
        _insertAnchor.call(this, el, anchor);
      }

      // Remove elements that already had anchors.
      for (var j = 0; j < indexesToDrop.length; j++) {
        elements.splice(indexesToDrop[j] - j, 1);
      }

      this.elements = this.elements.concat(elements);
      return this;
    };

    /**
     * Removes all anchorjs-links from elements targed by the selector.
     * @param {String|Array|Nodelist} selector
     * @returns {this}
     */
    this.remove = function (selector) {
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
    this.removeAll = function () {
      this.remove(this.elements);
    };

    /**
     * Urlify - Refine text so it makes a good ID.
     * @param {String} text
     * @returns {String}
     */
    this.urlify = function (text) {
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
     * @param {HTMLElement} el
     * @returns {Boolean}
     */
    this.hasAnchorJSLink = function (el) {
      var left = el.firstChild && ((' ' + el.firstChild.className + ' ').indexOf(' anchorjs-link ') > -1);
      var right = el.lastChild && ((' ' + el.lastChild.className + ' ').indexOf(' anchorjs-link ') > -1);
      return left || right || false;
    };

    /**
     * Turns a selector, nodeList, or array of elements into an array of elements.
     * @param {String|Array|Nodelist} input
     * @returns {Array}
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