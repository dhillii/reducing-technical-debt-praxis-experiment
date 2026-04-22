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
    this.isTouchDevice = function () {
      return !!(('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch);
    };

    /**
     * Determines if the visible option should be forced to 'always'.
     * @param {string} visible - The visible option value.
     * @returns {boolean}
     */
    function _isTouchVisible(visible) {
      return visible === 'touch';
    }

    /**
     * Returns true when the visible option resolves to 'always'.
     * @param {string} visible - The resolved visible option.
     * @returns {boolean}
     */
    function _isAlwaysVisible(visible) {
      return visible === 'always';
    }

    /**
     * Returns true when the configured icon is the default icon.
     * @param {string} icon - The icon option.
     * @returns {boolean}
     */
    function _isDefaultIcon(icon) {
      return icon === '\ue9cb';
    }

    /**
     * Returns true when the placement option is 'left'.
     * @param {string} placement - The placement option.
     * @returns {boolean}
     */
    function _isPlacementLeft(placement) {
      return placement === 'left';
    }

    /**
     * Guard clause to ensure a selector is always defined.
     * @param {any} selector
     * @returns {string}
     */
    function _resolveSelector(selector) {
      return selector || 'h1, h2, h3, h4, h5, h6';
    }

    /**
     * Generates a unique ID for an element based on its text content.
     * @param {HTMLElement} el - The element to generate an ID for.
     * @param {Array<string>} existingIds - List of IDs already present in the document.
     * @returns {string}
     */
    function _generateId(el, existingIds) {
      var tidyText = this.urlify(el.textContent);
      var newId = tidyText;
      var count = 0;
      var index;

      do {
        index = existingIds.indexOf(newId);
        if (index !== -1) {
          count += 1;
          newId = tidyText + '-' + count;
        }
      } while (index !== -1);

      existingIds.push(newId);
      return newId;
    }

    /**
     * Creates an anchor element for a given target ID.
     * @param {string} elementID - The target element ID.
     * @param {string} readableID - Human‑readable version of the ID.
     * @returns {HTMLAnchorElement}
     */
    function _createAnchor(elementID, readableID) {
      var anchor = document.createElement('a');
      anchor.className = 'anchorjs-link ' + this.options.class;
      anchor.href = '#' + elementID;
      anchor.setAttribute('aria-label', 'Anchor link for: ' + readableID);
      anchor.setAttribute('data-anchorjs-icon', this.options.icon);
      return anchor;
    }

    /**
     * Applies visibility, icon, and placement styles to the anchor.
     * @param {HTMLAnchorElement} anchor
     */
    function _styleAnchor(anchor) {
      if (_isAlwaysVisible(this.options.visible)) {
        anchor.style.opacity = '1';
      }

      if (_isDefaultIcon(this.options.icon)) {
        anchor.style.font = '1em/1 anchorjs-icons';
        if (_isPlacementLeft(this.options.placement)) {
          anchor.style.lineHeight = 'inherit';
        }
      }
    }

    /**
     * Inserts the anchor into the target element based on placement.
     * @param {HTMLAnchorElement} anchor
     * @param {HTMLElement} target
     */
    function _insertAnchor(anchor, target) {
      if (_isPlacementLeft(this.options.placement)) {
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
     * @param {String|Array|Nodelist} selector - Target selector.
     * @returns {this}
     */
    this.add = function (selector) {
      var elements,
          elsWithIds,
          idList,
          visibleOption,
          existingIds,
          i,
          element,
          elementID,
          readableID,
          anchor;

      // Re‑apply defaults in case options were mutated.
      _applyRemainingDefaultOptions(this.options);

      visibleOption = this.options.visible;
      if (_isTouchVisible(visibleOption)) {
        visibleOption = this.isTouchDevice() ? 'always' : 'hover';
        this.options.visible = visibleOption;
      }

      selector = _resolveSelector(selector);
      elements = _getElements(selector);
      if (elements.length === 0) {
        return false;
      }

      _addBaselineStyles();

      // Build a list of existing IDs to avoid collisions.
      elsWithIds = document.querySelectorAll('[id]');
      idList = [].map.call(elsWithIds, function (el) {
        return el.id;
      });

      // Filter out elements that already have an AnchorJS link.
      elements = elements.filter(function (el) {
        return !this.hasAnchorJSLink(el);
      }, this);

      // Process each element.
      for (i = 0; i < elements.length; i++) {
        element = elements[i];

        if (element.hasAttribute('id')) {
          elementID = element.getAttribute('id');
        } else {
          elementID = _generateId.call(this, element, idList);
          element.setAttribute('id', elementID);
        }

        readableID = elementID.replace(/-/g, ' ');
        anchor = _createAnchor.call(this, elementID, readableID);
        _styleAnchor.call(this, anchor);
        _insertAnchor.call(this, anchor, element);
      }

      this.elements = this.elements.concat(elements);
      return this;
    };

    /**
     * Removes all anchorjs-links from elements targed by the selector.
     * @param  {String|Array|Nodelist} selector - A CSS selector string targeting elements with anchor links,
     *                                            OR a nodeList / array containing the DOM elements.
     * @return {this}                           - The AnchorJS object
     */
    this.remove = function (selector) {
      var index,
          domAnchor,
          elements = _getElements(selector);

      for (var i = 0; i < elements.length; i++) {
        domAnchor = elements[i].querySelector('.anchorjs-link');
        if (!domAnchor) {
          continue;
        }
        index = this.elements.indexOf(elements[i]);
        if (index !== -1) {
          this.elements.splice(index, 1);
        }
        elements[i].removeChild(domAnchor);
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
     * @param  {String} text - Any text. Usually pulled from the webpage element we are linking to.
     * @return {String}      - hyphen-delimited text for use in IDs and URLs.
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
     * Uses this technique: http://stackoverflow.com/a/5898748/1154642
     * @param    {HTMLElemnt}  el - a DOM node
     * @return   {Boolean}     true/false
     */
    this.hasAnchorJSLink = function (el) {
      var hasLeftAnchor = el.firstChild && ((' ' + el.firstChild.className + ' ').indexOf(' anchorjs-link ') > -1),
          hasRightAnchor = el.lastChild && ((' ' + el.lastChild.className + ' ').indexOf(' anchorjs-link ') > -1);

      return hasLeftAnchor || hasRightAnchor || false;
    };

    /**
     * Turns a selector, nodeList, or array of elements into an array of elements (so we can use array methods).
     * It also throws errors on any other inputs. Used to handle inputs to .add and .remove.
     * @param  {String|Array|Nodelist} input - A CSS selector string targeting elements with anchor links,
     *                                         OR a nodeList / array containing the DOM elements.
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