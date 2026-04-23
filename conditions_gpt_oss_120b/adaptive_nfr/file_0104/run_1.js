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
    const self = this;
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
     * Resolve the effective visibility option.
     * @param {String} visible - Original visible option
     * @returns {String}
     */
    function _resolveVisibleOption(visible) {
      if (visible === 'touch') {
        return self.isTouchDevice() ? 'always' : 'hover';
      }
      return visible;
    }

    /**
     * Collect all existing IDs on the page.
     * @returns {Array<string>}
     */
    function _collectExistingIds() {
      const els = document.querySelectorAll('[id]');
      return Array.prototype.map.call(els, el => el.id);
    }

    /**
     * Ensure the element has an ID, generating one if necessary.
     * @param {Element} el
     * @param {Array<string>} idList
     * @returns {String}
     */
    function _ensureElementId(el, idList) {
      if (el.hasAttribute('id')) {
        return el.getAttribute('id');
      }
      const tidy = self.urlify(el.textContent);
      let candidate = tidy;
      let count = 0;
      while (idList.includes(candidate)) {
        count += 1;
        candidate = `${tidy}-${count}`;
      }
      idList.push(candidate);
      el.setAttribute('id', candidate);
      return candidate;
    }

    /**
     * Create the anchor element for a given ID.
     * @param {String} id
     * @param {String} readableID
     * @param {String} visibleOption
     * @returns {HTMLAnchorElement}
     */
    function _createAnchor(id, readableID, visibleOption) {
      const anchor = document.createElement('a');
      anchor.className = 'anchorjs-link ' + self.options.class;
      anchor.href = '#' + id;
      anchor.setAttribute('aria-label', 'Anchor link for: ' + readableID);
      anchor.setAttribute('data-anchorjs-icon', self.options.icon);
      if (visibleOption === 'always') {
        anchor.style.opacity = '1';
      }
      if (self.options.icon === '\ue9cb') {
        anchor.style.font = '1em/1 anchorjs-icons';
        if (self.options.placement === 'left') {
          anchor.style.lineHeight = 'inherit';
        }
      }
      return anchor;
    }

    /**
     * Apply placement styles and insert the anchor into the element.
     * @param {HTMLAnchorElement} anchor
     * @param {Element} el
     */
    function _applyPlacement(anchor, el) {
      if (self.options.placement === 'left') {
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
     * Add anchor links to page elements.
     * @param {String|Array|Nodelist} selector
     * @return {this|false}
     */
    this.add = function (selector) {
      _applyRemainingDefaultOptions(self.options);
      const visibleOption = _resolveVisibleOption(self.options.visible);
      const effectiveSelector = selector || 'h1, h2, h3, h4, h5, h6';
      const elements = _getElements(effectiveSelector);
      if (elements.length === 0) {
        return false;
      }
      _addBaselineStyles();

      const existingIds = _collectExistingIds();
      const processedElements = [];

      elements.forEach(el => {
        if (self.hasAnchorJSLink(el)) {
          return;
        }
        const elementID = _ensureElementId(el, existingIds);
        const readableID = elementID.replace(/-/g, ' ');
        const anchor = _createAnchor(elementID, readableID, visibleOption);
        _applyPlacement(anchor, el);
        processedElements.push(el);
      });

      self.elements = self.elements.concat(processedElements);
      return self;
    };

    /**
     * Removes all anchorjs-links from elements targed by the selector.
     * @param  {String|Array|Nodelist} selector
     * @return {this}
     */
    this.remove = function (selector) {
      const elements = _getElements(selector);
      for (let i = 0; i < elements.length; i++) {
        const domAnchor = elements[i].querySelector('.anchorjs-link');
        if (domAnchor) {
          const index = self.elements.indexOf(elements[i]);
          if (index !== -1) {
            self.elements.splice(index, 1);
          }
          elements[i].removeChild(domAnchor);
        }
      }
      return self;
    };

    /**
     * Removes all anchorjs links. Mostly used for tests.
     */
    this.removeAll = function () {
      self.remove(self.elements);
    };

    /**
     * Urlify - Refine text so it makes a good ID.
     *
     * @param  {String} text
     * @return {String}
     */
    this.urlify = function (text) {
      const nonsafeChars = /[& +$,:;=?@"#{}|^~[`%!'\]\.\/\(\)\*\\]/g;
      if (!self.options.truncate) {
        _applyRemainingDefaultOptions(self.options);
      }
      const urlText = text.trim()
        .replace(/\'/gi, '')
        .replace(nonsafeChars, '-')
        .replace(/-{2,}/g, '-')
        .substring(0, self.options.truncate)
        .replace(/^-+|-+$/gm, '')
        .toLowerCase();
      return urlText;
    };

    /**
     * Determines if this element already has an AnchorJS link on it.
     * @param {Element} el
     * @return {Boolean}
     */
    this.hasAnchorJSLink = function (el) {
      return _hasLeftAnchor(el) || _hasRightAnchor(el);
    };

    /**
     * @param {String} className
     * @returns {Boolean}
     */
    function _hasAnchorLinkClass(className) {
      return (' ' + className + ' ').indexOf(' anchorjs-link ') > -1;
    }

    /**
     * @param {Element} el
     * @returns {Boolean}
     */
    function _hasLeftAnchor(el) {
      return el.firstChild && _hasAnchorLinkClass(el.firstChild.className);
    }

    /**
     * @param {Element} el
     * @returns {Boolean}
     */
    function _hasRightAnchor(el) {
      return el.lastChild && _hasAnchorLinkClass(el.lastChild.className);
    }

    /**
     * Turns a selector, nodeList, or array of elements into an array of elements.
     * @param {String|Array|Nodelist} input
     * @return {Array}
     */
    function _getElements(input) {
      let elements;
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
        '   src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP';
      const pseudoElContent =
        ' [data-anchorjs-icon]::after {' +
        '   content: attr(data-anchorjs-icon);' +
        ' }';
      style.className = 'anchorjs';
      style.appendChild(document.createTextNode(''));
      const firstStyleEl = document.head.querySelector('[rel="stylesheet"], style');
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