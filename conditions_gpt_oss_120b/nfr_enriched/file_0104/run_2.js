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
     * Assigns default values to any missing option properties.
     * @param {Object} opts - Options object to populate.
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
     * Detects touch support using Modernizr criteria.
     * @return {boolean}
     */
    this.isTouchDevice = function () {
      return !!(('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch);
    };

    /**
     * Resolves the effective visibility option, handling the "touch" shortcut.
     * @param {string} visible - Original visibility option.
     * @returns {string}
     */
    const _resolveVisibleOption = (visible) => {
      if (visible === 'touch') {
        return this.isTouchDevice() ? 'always' : 'hover';
      }
      return visible;
    };

    /**
     * Retrieves a list of all existing element IDs on the page.
     * @returns {Array<string>}
     */
    const _collectExistingIds = () => {
      const els = document.querySelectorAll('[id]');
      return Array.prototype.map.call(els, el => el.id);
    };

    /**
     * Generates a unique ID for an element, avoiding collisions with existing IDs.
     * @param {Element} el - Target element.
     * @param {Array<string>} idList - Mutable list of IDs already used.
     * @returns {string}
     */
    const _ensureElementId = (el, idList) => {
      if (el.hasAttribute('id')) {
        return el.getAttribute('id');
      }
      const baseId = this.urlify(el.textContent);
      let candidate = baseId;
      let counter = 0;
      while (idList.includes(candidate)) {
        counter += 1;
        candidate = `${baseId}-${counter}`;
      }
      idList.push(candidate);
      el.setAttribute('id', candidate);
      return candidate;
    };

    /**
     * Creates the anchor element with appropriate attributes and styles.
     * @param {string} elementId - ID of the target element.
     * @param {string} readableId - Human‑readable version of the ID.
     * @param {string} visibility - Resolved visibility option.
     * @returns {HTMLAnchorElement}
     */
    const _buildAnchor = (elementId, readableId, visibility) => {
      const anchor = document.createElement('a');
      anchor.className = 'anchorjs-link ' + this.options.class;
      anchor.href = '#' + elementId;
      anchor.setAttribute('aria-label', 'Anchor link for: ' + readableId);
      anchor.setAttribute('data-anchorjs-icon', this.options.icon);

      if (visibility === 'always') {
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
     * Inserts the anchor into the target element according to placement option.
     * @param {Element} el - Target element.
     * @param {HTMLAnchorElement} anchor - Anchor to insert.
     */
    const _placeAnchor = (el, anchor) => {
      if (this.options.placement === 'left') {
        anchor.style.position = 'absolute';
        anchor.style.marginLeft = '-1em';
        anchor.style.paddingRight = '0.5em';
        el.insertBefore(anchor, el.firstChild);
      } else {
        anchor.style.paddingLeft = '0.375em';
        el.appendChild(anchor);
      }
    };

    /**
     * Add anchor links to page elements.
     * @param {string|Array|NodeList} selector - Target selector or collection.
     * @returns {this|false}
     */
    this.add = function (selector) {
      // Re‑apply defaults in case options were mutated externally.
      _applyRemainingDefaultOptions(this.options);

      const visibility = _resolveVisibleOption(this.options.visible);
      const targetSelector = selector || 'h1, h2, h3, h4, h5, h6';
      const elements = _getElements(targetSelector);

      if (elements.length === 0) {
        return false;
      }

      _addBaselineStyles();

      const existingIds = _collectExistingIds();
      const indexesToDrop = [];

      elements.forEach((el, i) => {
        if (this.hasAnchorJSLink(el)) {
          indexesToDrop.push(i);
          return;
        }

        const elementId = _ensureElementId(el, existingIds);
        const readableId = elementId.replace(/-/g, ' ');
        const anchor = _buildAnchor(elementId, readableId, visibility);
        _placeAnchor(el, anchor);
      });

      // Remove elements that already contained anchors.
      for (let i = 0; i < indexesToDrop.length; i++) {
        elements.splice(indexesToDrop[i] - i, 1);
      }

      this.elements = this.elements.concat(elements);
      return this;
    };

    /**
     * Removes all anchorjs-links from elements targeted by the selector.
     * @param {string|Array|NodeList} selector - Target selector or collection.
     * @returns {this}
     */
    this.remove = function (selector) {
      const elements = _getElements(selector);
      for (let i = 0; i < elements.length; i++) {
        const domAnchor = elements[i].querySelector('.anchorjs-link');
        if (domAnchor) {
          const idx = this.elements.indexOf(elements[i]);
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
     *
     * @param {string} text - Input text.
     * @returns {string}
     */
    this.urlify = function (text) {
      const nonsafeChars = /[& +$,:;=?@"#{}|^~[`%!'\]\.\/\(\)\*\\]/g;
      if (!this.options.truncate) {
        _applyRemainingDefaultOptions(this.options);
      }
      const urlText = text.trim()
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
     * @param {HTMLElement} el - Target element.
     * @returns {boolean}
     */
    this.hasAnchorJSLink = function (el) {
      const hasLeft = el.firstChild && ((' ' + el.firstChild.className + ' ').indexOf(' anchorjs-link ') > -1);
      const hasRight = el.lastChild && ((' ' + el.lastChild.className + ' ').indexOf(' anchorjs-link ') > -1);
      return hasLeft || hasRight || false;
    };

    /**
     * Normalises selector, NodeList, or array into an array of elements.
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
     * Adds baseline CSS rules required by AnchorJS.
     */
    function _addBaselineStyles() {
      if (document.head.querySelector('style.anchorjs') !== null) {
        return;
      }
      const style = document.createElement('style');
      const linkRule =
        ' .anchorjs-link {' +
        '   opacity: 0;' +
        '   text-decoration: none;' +
        '   -webkit-font-smoothing: antialiased;' +
        '   -moz-osx-font-smoothing: grayscale;' +
        ' }';
      const hoverRule =
        ' *:hover > .anchorjs-link,' +
        ' .anchorjs-link:focus  {' +
        '   opacity: 1;' +
        ' }';
      const anchorjsLinkFontFace =
        ' @font-face {' +
        '   font-family: "anchorjs-icons";' +
        '   src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP) format("truetype");' +
        ' }';
      const pseudoElContent =
        ' [data-anchorjs-icon]::after {' +
        '   content: attr(data-anchorjs-icon);' +
        ' }';
      const firstStyleEl = document.head.querySelector('[rel="stylesheet"], style');

      style.className = 'anchorjs';
      style.appendChild(document.createTextNode('')); // WebKit quirk.

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