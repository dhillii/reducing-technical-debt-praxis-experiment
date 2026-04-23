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

  /**
   * AnchorJS constructor.
   * @param {Object} [options] - Configuration options.
   */
  function AnchorJS(options) {
    this.options = options || {};
    this.elements = [];

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Apply default options for any missing keys.
     * @param {Object} opts - Options object to mutate.
     */
    function applyDefaultOptions(opts) {
      opts.icon = opts.hasOwnProperty('icon') ? opts.icon : '\ue9cb';
      opts.visible = opts.hasOwnProperty('visible') ? opts.visible : 'hover';
      opts.placement = opts.hasOwnProperty('placement') ? opts.placement : 'right';
      opts.class = opts.hasOwnProperty('class') ? opts.class : '';
      opts.truncate = opts.hasOwnProperty('truncate') ? Math.floor(opts.truncate) : 64;
    }

    applyDefaultOptions(this.options);

    /**
     * Determine if the current device supports touch.
     * @returns {boolean}
     */
    this.isTouchDevice = function () {
      return !!(('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch);
    };

    /**
     * Guard: is the visible option set to touch?
     * @param {string} visible - Current visible option.
     * @returns {boolean}
     */
    function isTouchVisible(visible) {
      return visible === 'touch';
    }

    /**
     * Resolve the effective visibility option.
     * @returns {string}
     */
    function resolveVisibleOption() {
      var visible = this.options.visible;
      if (isTouchVisible(visible)) {
        return this.isTouchDevice() ? 'always' : 'hover';
      }
      return visible;
    }

    /**
     * Guard: selector is falsy.
     * @param {*} selector
     * @returns {boolean}
     */
    function isSelectorMissing(selector) {
      return !selector;
    }

    /**
     * Guard: element already contains an AnchorJS link.
     * @param {Element} el
     * @returns {boolean}
     */
    function hasExistingAnchor(el) {
      var left = el.firstChild && ((' ' + el.firstChild.className + ' ').indexOf(' anchorjs-link ') > -1);
      var right = el.lastChild && ((' ' + el.lastChild.className + ' ').indexOf(' anchorjs-link ') > -1);
      return left || right;
    }

    /**
     * Guard: element already has an id attribute.
     * @param {Element} el
     * @returns {boolean}
     */
    function hasIdAttribute(el) {
      return el.hasAttribute('id');
    }

    /**
     * Generate a unique id for an element based on its text content.
     * @param {Element} el
     * @param {Array<string>} existingIds
     * @returns {string}
     */
    function generateUniqueId(el, existingIds) {
      var base = this.urlify(el.textContent);
      var candidate = base;
      var count = 0;
      while (existingIds.indexOf(candidate) !== -1) {
        candidate = base + '-' + count;
        count += 1;
      }
      existingIds.push(candidate);
      return candidate;
    }

    /**
     * Create the anchor element for a target heading.
     * @param {string} id - Target element id.
     * @param {string} readableId - Human‑readable id.
     * @returns {HTMLAnchorElement}
     */
    function createAnchor(id, readableId) {
      var a = document.createElement('a');
      a.className = 'anchorjs-link ' + this.options.class;
      a.href = '#' + id;
      a.setAttribute('aria-label', 'Anchor link for: ' + readableId);
      a.setAttribute('data-anchorjs-icon', this.options.icon);
      return a;
    }

    /**
     * Guard: icon is the default icon.
     * @returns {boolean}
     */
    function isDefaultIcon() {
      return this.options.icon === '\ue9cb';
    }

    /**
     * Guard: placement is left.
     * @returns {boolean}
     */
    function isPlacementLeft() {
      return this.options.placement === 'left';
    }

    /**
     * Apply style rules to the anchor based on current options.
     * @param {HTMLAnchorElement} anchor
     */
    function styleAnchor(anchor) {
      if (this.visibleOption === 'always') {
        anchor.style.opacity = '1';
      }
      if (isDefaultIcon.call(this)) {
        anchor.style.font = '1em/1 anchorjs-icons';
        if (isPlacementLeft.call(this)) {
          anchor.style.lineHeight = 'inherit';
        }
      }
    }

    /**
     * Insert the anchor into the heading according to placement.
     * @param {Element} heading
     * @param {HTMLAnchorElement} anchor
     */
    function insertAnchor(heading, anchor) {
      if (isPlacementLeft.call(this)) {
        anchor.style.position = 'absolute';
        anchor.style.marginLeft = '-1em';
        anchor.style.paddingRight = '0.5em';
        heading.insertBefore(anchor, heading.firstChild);
      } else {
        anchor.style.paddingLeft = '0.375em';
        heading.appendChild(anchor);
      }
    }

    // -------------------------------------------------------------------------
    // Public methods
    // -------------------------------------------------------------------------

    /**
     * Add anchor links to page elements.
     * @param {string|Array|NodeList} selector
     * @returns {this|false}
     */
    this.add = function (selector) {
      applyDefaultOptions(this.options);
      this.visibleOption = resolveVisibleOption.call(this);

      if (isSelectorMissing(selector)) {
        selector = 'h1, h2, h3, h4, h5, h6';
      }

      var elements = _getElements(selector);
      if (elements.length === 0) {
        return false;
      }

      _addBaselineStyles();

      var existingIds = [].map.call(document.querySelectorAll('[id]'), function (el) {
        return el.id;
      });

      var indexesToDrop = [];

      for (var i = 0; i < elements.length; i++) {
        var el = elements[i];

        if (hasExistingAnchor(el)) {
          indexesToDrop.push(i);
          continue;
        }

        var id = hasIdAttribute(el) ? el.getAttribute('id') : generateUniqueId.call(this, el, existingIds);
        if (!hasIdAttribute(el)) {
          el.setAttribute('id', id);
        }

        var readable = id.replace(/-/g, ' ');
        var anchor = createAnchor.call(this, id, readable);
        styleAnchor.call(this, anchor);
        insertAnchor.call(this, el, anchor);
      }

      // Remove elements that already had anchors.
      for (var j = 0; j < indexesToDrop.length; j++) {
        elements.splice(indexesToDrop[j] - j, 1);
      }

      this.elements = this.elements.concat(elements);
      return this;
    };

    /**
     * Remove anchor links from selected elements.
     * @param {string|Array|NodeList} selector
     * @returns {this}
     */
    this.remove = function (selector) {
      var elements = _getElements(selector);
      for (var i = 0; i < elements.length; i++) {
        var domAnchor = elements[i].querySelector('.anchorjs-link');
        if (!domAnchor) {
          continue;
        }
        var idx = this.elements.indexOf(elements[i]);
        if (idx !== -1) {
          this.elements.splice(idx, 1);
        }
        elements[i].removeChild(domAnchor);
      }
      return this;
    };

    /**
     * Remove all anchor links (used mainly in tests).
     */
    this.removeAll = function () {
      this.remove(this.elements);
    };

    /**
     * Convert arbitrary text into a URL‑friendly id.
     * @param {string} text
     * @returns {string}
     */
    this.urlify = function (text) {
      var nonsafe = /[& +$,:;=?@"#{}|^~[`%!'\]\.\/\(\)\*\\]/g;

      if (!this.options.truncate) {
        applyDefaultOptions(this.options);
      }

      var url = text.trim()
        .replace(/\'/gi, '')
        .replace(nonsafe, '-')
        .replace(/-{2,}/g, '-')
        .substring(0, this.options.truncate)
        .replace(/^-+|-+$/gm, '')
        .toLowerCase();

      return url;
    };

    /**
     * Determine whether an element already contains an AnchorJS link.
     * @param {Element} el
     * @returns {boolean}
     */
    this.hasAnchorJSLink = function (el) {
      return hasExistingAnchor(el);
    };

    /**
     * Convert selector / nodeList / array into an array of elements.
     * @param {string|Array|NodeList} input
     * @returns {Array<Element>}
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
     * Add baseline CSS rules required by AnchorJS.
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
      var fontFaceRule =
        ' @font-face {' +
        '   font-family: "anchorjs-icons";' +
        '   src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP');
      var pseudoRule =
        ' [data-anchorjs-icon]::after {' +
        '   content: attr(data-anchorjs-icon);' +
        ' }';
      var firstStyleEl;

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
      style.sheet.insertRule(pseudoRule, style.sheet.cssRules.length);
      style.sheet.insertRule(fontFaceRule, style.sheet.cssRules.length);
    }
  }

  return AnchorJS;
}));