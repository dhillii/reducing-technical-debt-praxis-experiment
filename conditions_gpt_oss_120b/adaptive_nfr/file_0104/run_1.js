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
     * @return {Boolean} true if the current device supports touch.
     */
    this.isTouchDevice = function () {
      return !!(('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch);
    };

    /**
     * Determines whether the provided element already contains an AnchorJS link.
     * @param {HTMLElement} el - Target element.
     * @return {Boolean} True if an AnchorJS link exists.
     */
    this.hasAnchorJSLink = function (el) {
      var hasLeftAnchor = el.firstChild && ((' ' + el.firstChild.className + ' ').indexOf(' anchorjs-link ') > -1);
      var hasRightAnchor = el.lastChild && ((' ' + el.lastChild.className + ' ').indexOf(' anchorjs-link ') > -1);
      return hasLeftAnchor || hasRightAnchor || false;
    };

    /**
     * Guard predicate: element has an id attribute.
     * @param {HTMLElement} el
     * @return {Boolean}
     */
    function _hasIdAttribute(el) {
      return el.hasAttribute('id');
    }

    /**
     * Guard predicate: using the default icon.
     * @param {String} icon
     * @return {Boolean}
     */
    function _isDefaultIcon(icon) {
      return icon === '\ue9cb';
    }

    /**
     * Guard predicate: placement is left.
     * @param {String} placement
     * @return {Boolean}
     */
    function _isPlacementLeft(placement) {
      return placement === 'left';
    }

    /**
     * Guard predicate: visible option forces always visibility.
     * @param {String} visible
     * @return {Boolean}
     */
    function _isAlwaysVisible(visible) {
      return visible === 'always';
    }

    /**
     * Generates a unique ID based on a base string and an existing ID list.
     * @param {String} base - The base ID string.
     * @param {Array<string>} idList - List of IDs already present in the document.
     * @return {String} Unique ID.
     */
    function _generateUniqueId(base, idList) {
      var candidate = base;
      var count = 0;
      while (idList.indexOf(candidate) !== -1) {
        count += 1;
        candidate = base + '-' + count;
      }
      return candidate;
    }

    /**
     * Add anchor links to page elements.
     * @param {String|Array|NodeList} selector - CSS selector or collection of elements.
     * @return {this}
     */
    this.add = function (selector) {
      // Reapply defaults in case options were overwritten.
      _applyRemainingDefaultOptions(this.options);

      var visible = this.options.visible;
      if (visible === 'touch') {
        visible = this.isTouchDevice() ? 'always' : 'hover';
      }

      if (!selector) {
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

      var processed = [];

      for (var i = 0; i < elements.length; i++) {
        var el = elements[i];

        if (this.hasAnchorJSLink(el)) {
          continue;
        }

        var elementID;
        if (_hasIdAttribute(el)) {
          elementID = el.getAttribute('id');
        } else {
          var tidy = this.urlify(el.textContent);
          elementID = _generateUniqueId(tidy, existingIds);
          existingIds.push(elementID);
          el.setAttribute('id', elementID);
        }

        var readableID = elementID.replace(/-/g, ' ');
        var anchor = document.createElement('a');
        anchor.className = 'anchorjs-link ' + this.options.class;
        anchor.href = '#' + elementID;
        anchor.setAttribute('aria-label', 'Anchor link for: ' + readableID);
        anchor.setAttribute('data-anchorjs-icon', this.options.icon);

        if (_isAlwaysVisible(visible)) {
          anchor.style.opacity = '1';
        }

        if (_isDefaultIcon(this.options.icon)) {
          anchor.style.font = '1em/1 anchorjs-icons';
          if (_isPlacementLeft(this.options.placement)) {
            anchor.style.lineHeight = 'inherit';
          }
        }

        if (_isPlacementLeft(this.options.placement)) {
          anchor.style.position = 'absolute';
          anchor.style.marginLeft = '-1em';
          anchor.style.paddingRight = '0.5em';
          el.insertBefore(anchor, el.firstChild);
        } else {
          anchor.style.paddingLeft = '0.375em';
          el.appendChild(anchor);
        }

        processed.push(el);
      }

      this.elements = this.elements.concat(processed);
      return this;
    };

    /**
     * Removes all anchorjs-links from elements targeted by the selector.
     * @param {String|Array|NodeList} selector - CSS selector or collection.
     * @return {this}
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
     * Removes all anchorjs links. Mostly used for tests.
     */
    this.removeAll = function () {
      this.remove(this.elements);
    };

    /**
     * Urlify - Refine text so it makes a good ID.
     * @param {String} text - Any text.
     * @return {String} Hyphen-delimited text for IDs and URLs.
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
     * Turns a selector, nodeList, or array of elements into an array.
     * @param {String|Array|NodeList} input
     * @return {Array}
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