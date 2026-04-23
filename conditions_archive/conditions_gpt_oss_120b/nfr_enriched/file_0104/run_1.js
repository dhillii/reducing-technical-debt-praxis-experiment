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
     * @param {Object} opts - Options object to be normalized.
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
     * Detects touch capability using Modernizr's approach.
     * @return {boolean}
     */
    this.isTouchDevice = function () {
      return !!(('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch);
    };

    /**
     * Determines the effective visibility option based on device capabilities.
     * @param {string} visibleOption - Original visibility option.
     * @returns {string}
     */
    function _resolveVisibility(visibleOption) {
      if (visibleOption === 'touch') {
        return this.isTouchDevice() ? 'always' : 'hover';
      }
      return visibleOption;
    }

    /**
     * Retrieves an array of DOM elements from a selector, NodeList, or array.
     * @param {string|Array|NodeList} input
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
     * Gathers all existing element IDs on the page.
     * @returns {Array<string>}
     */
    function _collectExistingIds() {
      var elsWithIds = document.querySelectorAll('[id]');
      return [].map.call(elsWithIds, function (el) {
        return el.id;
      });
    }

    /**
     * Generates a unique ID for an element based on its text content.
     * @param {HTMLElement} element
     * @param {Array<string>} existingIds
     * @returns {string}
     */
    function _generateUniqueId(element, existingIds) {
      var baseId = this.urlify(element.textContent);
      var candidate = baseId;
      var counter = 0;

      while (existingIds.indexOf(candidate) !== -1) {
        counter += 1;
        candidate = baseId + '-' + counter;
      }

      existingIds.push(candidate);
      element.setAttribute('id', candidate);
      return candidate;
    }

    /**
     * Creates the anchor element for a given target ID.
     * @param {string} targetId
     * @param {string} readableId
     * @returns {HTMLAnchorElement}
     */
    function _createAnchor(targetId, readableId) {
      var anchor = document.createElement('a');
      anchor.className = 'anchorjs-link ' + this.options.class;
      anchor.href = '#' + targetId;
      anchor.setAttribute('aria-label', 'Anchor link for: ' + readableId);
      anchor.setAttribute('data-anchorjs-icon', this.options.icon);
      return anchor;
    }

    /**
     * Applies visibility styling to the anchor.
     * @param {HTMLAnchorElement} anchor
     * @param {string} visibility - 'always' or 'hover'
     */
    function _applyVisibility(anchor, visibility) {
      if (visibility === 'always') {
        anchor.style.opacity = '1';
      }
    }

    /**
     * Applies icon‑specific styling (font and line‑height) to the anchor.
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
     * Inserts the anchor into the target element according to placement.
     * @param {HTMLElement} element
     * @param {HTMLAnchorElement} anchor
     */
    function _insertAnchor(element, anchor) {
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

    /**
     * Adds anchor links to page elements.
     * @param {string|Array|NodeList} selector
     * @returns {this}
     */
    this.add = function (selector) {
      var elements,
          visibleOption,
          existingIds,
          indexesToDrop = [];

      // Re‑apply defaults in case options were mutated externally.
      _applyRemainingDefaultOptions(this.options);
      visibleOption = _resolveVisibility.call(this, this.options.visible);
      elements = _getElements(selector || 'h1, h2, h3, h4, h5, h6');

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

        var targetId = el.getAttribute('id') || _generateUniqueId.call(this, el, existingIds);
        var readableId = targetId.replace(/-/g, ' ');
        var anchor = _createAnchor.call(this, targetId, readableId);

        _applyVisibility(anchor, visibleOption);
        _applyIconStyles.call(this, anchor);
        _insertAnchor.call(this, el, anchor);
      }

      // Remove elements that already contained anchors.
      for (var j = 0; j < indexesToDrop.length; j++) {
        elements.splice(indexesToDrop[j] - j, 1);
      }

      this.elements = this.elements.concat(elements);
      return this;
    };

    /**
     * Removes all anchorjs-links from elements targeted by the selector.
     * @param {string|Array|NodeList} selector
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
     *
     * To do this, we remove apostrophes, replace nonsafe characters with hyphens,
     * remove extra hyphens, truncate, trim hyphens, and make lowercase.
     *
     * @param {string} text - Any text. Usually pulled from the webpage element we are linking to.
     * @returns {string}
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
     * @returns {boolean}
     */
    this.hasAnchorJSLink = function (el) {
      var hasLeftAnchor = el.firstChild && ((' ' + el.firstChild.className + ' ').indexOf(' anchorjs-link ') > -1),
          hasRightAnchor = el.lastChild && ((' ' + el.lastChild.className + ' ').indexOf(' anchorjs-link ') > -1);
      return hasLeftAnchor || hasRightAnchor || false;
    };

    /**
     * Adds baseline CSS rules required for AnchorJS links.
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