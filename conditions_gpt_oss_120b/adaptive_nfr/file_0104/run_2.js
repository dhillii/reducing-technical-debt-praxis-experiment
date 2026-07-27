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
    var self = this;
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
     * Determine the effective visibility option based on device capabilities.
     * @param {Object} opts - Options object
     * @param {Boolean} isTouch - Result of isTouchDevice()
     * @return {String}
     */
    function _resolveVisibleOption(opts, isTouch) {
      var opt = opts.visible;
      if (opt === 'touch') {
        opt = isTouch ? 'always' : 'hover';
      }
      return opt;
    }

    /**
     * Returns true if the provided element already contains an AnchorJS link.
     * @param {HTMLElement} el
     * @return {Boolean}
     */
    function _hasExistingAnchor(el) {
      return self.hasAnchorJSLink(el);
    }

    /**
     * Returns true if the element already has an id attribute.
     * @param {HTMLElement} el
     * @return {Boolean}
     */
    function _elementHasId(el) {
      return el.hasAttribute('id');
    }

    /**
     * Returns true when the configured icon is the default icon.
     * @return {Boolean}
     */
    function _isDefaultIcon() {
      return self.options.icon === '\ue9cb';
    }

    /**
     * Returns true when the placement option is set to 'left'.
     * @return {Boolean}
     */
    function _isPlacementLeft() {
      return self.options.placement === 'left';
    }

    /**
     * Returns true when the visibility option is 'always'.
     * @param {String} visibleOption
     * @return {Boolean}
     */
    function _isAlwaysVisible(visibleOption) {
      return visibleOption === 'always';
    }

    /**
     * Collects all existing IDs on the page.
     * @return {Array<string>}
     */
    function _collectExistingIds() {
      var elsWithIds = document.querySelectorAll('[id]');
      return [].map.call(elsWithIds, function (el) {
        return el.id;
      });
    }

    /**
     * Generates a unique ID for the element if it lacks one.
     * @param {HTMLElement} el
     * @param {Array<string>} idList
     * @return {String}
     */
    function _resolveElementId(el, idList) {
      if (_elementHasId(el)) {
        return el.getAttribute('id');
      }

      var base = self.urlify(el.textContent);
      var candidate = base;
      var count = 0;

      while (idList.indexOf(candidate) !== -1) {
        count += 1;
        candidate = base + '-' + count;
      }

      idList.push(candidate);
      el.setAttribute('id', candidate);
      return candidate;
    }

    /**
     * Creates the anchor element with appropriate attributes.
     * @param {String} elementID
     * @param {String} readableID
     * @param {String} visibleOption
     * @return {HTMLElement}
     */
    function _createAnchor(elementID, readableID, visibleOption) {
      var anchor = document.createElement('a');
      anchor.className = 'anchorjs-link ' + self.options.class;
      anchor.href = '#' + elementID;
      anchor.setAttribute('aria-label', 'Anchor link for: ' + readableID);
      anchor.setAttribute('data-anchorjs-icon', self.options.icon);

      if (_isAlwaysVisible(visibleOption)) {
        anchor.style.opacity = '1';
      }

      return anchor;
    }

    /**
     * Applies default icon styling when the default icon is used.
     * @param {HTMLElement} anchor
     */
    function _applyIconStyles(anchor) {
      if (_isDefaultIcon()) {
        anchor.style.font = '1em/1 anchorjs-icons';
        if (_isPlacementLeft()) {
          anchor.style.lineHeight = 'inherit';
        }
      }
    }

    /**
     * Positions the anchor based on the placement option.
     * @param {HTMLElement} anchor
     * @param {HTMLElement} targetEl
     */
    function _applyPlacement(anchor, targetEl) {
      if (_isPlacementLeft()) {
        anchor.style.position = 'absolute';
        anchor.style.marginLeft = '-1em';
        anchor.style.paddingRight = '0.5em';
        targetEl.insertBefore(anchor, targetEl.firstChild);
      } else {
        anchor.style.paddingLeft = '0.375em';
        targetEl.appendChild(anchor);
      }
    }

    /**
     * Add anchor links to page elements.
     * @param  {String|Array|Nodelist} selector - A CSS selector for targeting the elements you wish to add anchor links
     *                                            to. Also accepts an array or nodeList containing the relavant elements.
     * @return {this}                           - The AnchorJS object
     */
    this.add = function (selector) {
      // Guard: default selector
      if (!selector) {
        selector = 'h1, h2, h3, h4, h5, h6';
      }

      // Reapply defaults in case options were mutated externally.
      _applyRemainingDefaultOptions(self.options);

      var visibleOption = _resolveVisibleOption(self.options, self.isTouchDevice());

      var elements = _getElements(selector);
      if (elements.length === 0) {
        return false;
      }

      _addBaselineStyles();

      var idList = _collectExistingIds();
      var indexesToDrop = [];

      for (var i = 0; i < elements.length; i++) {
        var el = elements[i];

        if (_hasExistingAnchor(el)) {
          indexesToDrop.push(i);
          continue;
        }

        var elementID = _resolveElementId(el, idList);
        var readableID = elementID.replace(/-/g, ' ');
        var anchor = _createAnchor(elementID, readableID, visibleOption);

        _applyIconStyles(anchor);
        _applyPlacement(anchor, el);
      }

      // Remove elements that already had anchors.
      for (var j = 0; j < indexesToDrop.length; j++) {
        elements.splice(indexesToDrop[j] - j, 1);
      }

      self.elements = self.elements.concat(elements);
      return self;
    };

    /**
     * Removes all anchorjs-links from elements targed by the selector.
     * @param  {String|Array|Nodelist} selector - A CSS selector string targeting elements with anchor links,
     *                                       	  	OR a nodeList / array containing the DOM elements.
     * @return {this}                           - The AnchorJS object
     */
    this.remove = function (selector) {
      var index,
        domAnchor,
        elements = _getElements(selector);

      for (var i = 0; i < elements.length; i++) {
        domAnchor = elements[i].querySelector('.anchorjs-link');
        if (domAnchor) {
          index = self.elements.indexOf(elements[i]);
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

      if (!self.options.truncate) {
        _applyRemainingDefaultOptions(self.options);
      }

      urlText = text
        .trim()
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
     *                                       	 OR a nodeList / array containing the DOM elements.
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
          '   src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP') +
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