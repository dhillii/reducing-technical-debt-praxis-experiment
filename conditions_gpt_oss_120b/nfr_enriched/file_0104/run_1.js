/**
 * AnchorJS - v3.2.2 - 2016-10-05
 * https://github.com/bryanbraun/anchorjs
 * Copyright (c) 2016 Bryan Braun; Licensed MIT
 */

/* eslint-env amd, node */

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

  /**
   * AnchorJS constructor.
   * @param {Object} [options] - Configuration options.
   */
  function AnchorJS(options) {
    this.options = options || {};
    this.elements = [];

    _applyRemainingDefaultOptions(this.options);
  }

  /**
   * Apply default options where missing.
   * @private
   * @param {Object} opts - Options object to mutate.
   */
  function _applyRemainingDefaultOptions(opts) {
    opts.icon = opts.hasOwnProperty('icon') ? opts.icon : '\ue9cb';
    opts.visible = opts.hasOwnProperty('visible') ? opts.visible : 'hover';
    opts.placement = opts.hasOwnProperty('placement') ? opts.placement : 'right';
    opts.class = opts.hasOwnProperty('class') ? opts.class : '';
    opts.truncate = opts.hasOwnProperty('truncate') ? Math.floor(opts.truncate) : 64;
  }

  /**
   * Detect touch capability.
   * @returns {boolean}
   */
  AnchorJS.prototype.isTouchDevice = function () {
    return !!(('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch);
  };

  /**
   * Determine effective visibility option.
   * @private
   * @returns {string}
   */
  AnchorJS.prototype._resolveVisibleOption = function () {
    var opt = this.options.visible;
    if (opt === 'touch') {
      return this.isTouchDevice() ? 'always' : 'hover';
    }
    return opt;
  };

  /**
   * Generate a unique ID for an element based on its text.
   * @private
   * @param {HTMLElement} el - Target element.
   * @param {Set<string>} existingIds - Set of IDs already used on the page.
   * @returns {string}
   */
  AnchorJS.prototype._ensureElementId = function (el, existingIds) {
    if (el.hasAttribute('id')) {
      return el.getAttribute('id');
    }

    var baseId = this.urlify(el.textContent);
    var candidate = baseId;
    var suffix = 0;

    while (existingIds.has(candidate)) {
      suffix += 1;
      candidate = baseId + '-' + suffix;
    }

    existingIds.add(candidate);
    el.setAttribute('id', candidate);
    return candidate;
  };

  /**
   * Create the anchor element for a given target ID.
   * @private
   * @param {string} id - Target element ID.
   * @param {string} readableId - Human‑readable version of the ID.
   * @param {string} visibleOption - Resolved visibility option.
   * @returns {HTMLAnchorElement}
   */
  AnchorJS.prototype._buildAnchor = function (id, readableId, visibleOption) {
    var anchor = document.createElement('a');
    anchor.className = 'anchorjs-link ' + this.options.class;
    anchor.href = '#' + id;
    anchor.setAttribute('aria-label', 'Anchor link for: ' + readableId);
    anchor.setAttribute('data-anchorjs-icon', this.options.icon);

    if (visibleOption === 'always') {
      anchor.style.opacity = '1';
    }

    if (this.options.icon === '\ue9cb') {
      anchor.style.font = '1em/1 anchorjs-icons';
      if (this.options.placement === 'left') {
        anchor.style.lineHeight = 'inherit';
      }
    }

    return anchor;
  };

  /**
   * Apply placement‑specific styles and insert the anchor.
   * @private
   * @param {HTMLAnchorElement} anchor - Anchor element to insert.
   * @param {HTMLElement} target - Element receiving the anchor.
   */
  AnchorJS.prototype._placeAnchor = function (anchor, target) {
    if (this.options.placement === 'left') {
      anchor.style.position = 'absolute';
      anchor.style.marginLeft = '-1em';
      anchor.style.paddingRight = '0.5em';
      target.insertBefore(anchor, target.firstChild);
    } else {
      anchor.style.paddingLeft = '0.375em';
      target.appendChild(anchor);
    }
  };

  /**
   * Add anchor links to page elements.
   * @param {string|Array|NodeList} selector - Target selector or collection.
   * @returns {this}
   */
  AnchorJS.prototype.add = function (selector) {
    _applyRemainingDefaultOptions(this.options);
    var visibleOption = this._resolveVisibleOption();

    if (!selector) {
      selector = 'h1, h2, h3, h4, h5, h6';
    }

    var elements = _getElements(selector);
    if (elements.length === 0) {
      return false;
    }

    _addBaselineStyles();

    var existingIds = new Set(
      [].map.call(document.querySelectorAll('[id]'), function (el) { return el.id; })
    );

    var processed = [];

    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (this.hasAnchorJSLink(el)) {
        continue;
      }

      var id = this._ensureElementId(el, existingIds);
      var readableId = id.replace(/-/g, ' ');
      var anchor = this._buildAnchor(id, readableId, visibleOption);
      this._placeAnchor(anchor, el);
      processed.push(el);
    }

    this.elements = this.elements.concat(processed);
    return this;
  };

  /**
   * Remove anchor links from selected elements.
   * @param {string|Array|NodeList} selector - Target selector or collection.
   * @returns {this}
   */
  AnchorJS.prototype.remove = function (selector) {
    var elements = _getElements(selector);
    for (var i = 0; i < elements.length; i++) {
      var domAnchor = elements[i].querySelector('.anchorjs-link');
      if (!domAnchor) continue;

      var idx = this.elements.indexOf(elements[i]);
      if (idx !== -1) {
        this.elements.splice(idx, 1);
      }
      elements[i].removeChild(domAnchor);
    }
    return this;
  };

  /**
   * Remove all anchor links (used in tests).
   */
  AnchorJS.prototype.removeAll = function () {
    this.remove(this.elements);
  };

  /**
   * Convert arbitrary text into a URL‑friendly ID.
   * @param {string} text - Input text.
   * @returns {string}
   */
  AnchorJS.prototype.urlify = function (text) {
    if (!this.options.truncate) {
      _applyRemainingDefaultOptions(this.options);
    }

    var nonsafeChars = /[& +$,:;=?@"#{}|^~[`%!'\]\.\/\(\)\*\\]/g;
    var trimmed = text.trim();
    var noApostrophe = trimmed.replace(/\'/gi, '');
    var hyphenated = noApostrophe.replace(nonsafeChars, '-');
    var collapsed = hyphenated.replace(/-{2,}/g, '-');
    var truncated = collapsed.substring(0, this.options.truncate);
    var cleaned = truncated.replace(/^-+|-+$/gm, '');
    return cleaned.toLowerCase();
  };

  /**
   * Determine whether an element already contains an AnchorJS link.
   * @param {HTMLElement} el - Target element.
   * @returns {boolean}
   */
  AnchorJS.prototype.hasAnchorJSLink = function (el) {
    var left = el.firstChild && ((' ' + el.firstChild.className + ' ').indexOf(' anchorjs-link ') > -1);
    var right = el.lastChild && ((' ' + el.lastChild.className + ' ').indexOf(' anchorjs-link ') > -1);
    return left || right || false;
  };

  /**
   * Convert selector, NodeList, or array into an array of elements.
   * @private
   * @param {string|Array|NodeList} input - Input collection.
   * @returns {Array<HTMLElement>}
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
   * Insert baseline CSS required for AnchorJS links.
   * @private
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

    style.sheet.insertRule(linkRule, style.sheet.cssRules.length);
    style.sheet.insertRule(hoverRule, style.sheet.cssRules.length);
    style.sheet.insertRule(pseudoElContent, style.sheet.cssRules.length);
    style.sheet.insertRule(anchorjsLinkFontFace, style.sheet.cssRules.length);
  }

  return AnchorJS;
}));