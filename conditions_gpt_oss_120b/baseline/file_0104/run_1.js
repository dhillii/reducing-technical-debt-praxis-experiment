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

  function AnchorJS(options) {
    this.options = options || {};
    this.elements = [];

    _applyRemainingDefaultOptions(this.options);
  }

  /* -------------------------------------------------------------------------- *
   *  Default options handling
   * -------------------------------------------------------------------------- */
  function _applyRemainingDefaultOptions(opts) {
    opts.icon = opts.hasOwnProperty('icon') ? opts.icon : '\ue9cb';
    opts.visible = opts.hasOwnProperty('visible') ? opts.visible : 'hover';
    opts.placement = opts.hasOwnProperty('placement') ? opts.placement : 'right';
    opts.class = opts.hasOwnProperty('class') ? opts.class : '';
    opts.truncate = opts.hasOwnProperty('truncate') ? Math.floor(opts.truncate) : 64;
  }

  /* -------------------------------------------------------------------------- *
   *  Utility helpers
   * -------------------------------------------------------------------------- */
  AnchorJS.prototype.isTouchDevice = function () {
    return !!(('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch);
  };

  function _getElements(input) {
    if (typeof input === 'string' || input instanceof String) {
      return [].slice.call(document.querySelectorAll(input));
    }
    if (Array.isArray(input) || input instanceof NodeList) {
      return [].slice.call(input);
    }
    throw new Error('The selector provided to AnchorJS was invalid.');
  }

  function _addBaselineStyles() {
    if (document.head.querySelector('style.anchorjs')) return;

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
    var pseudoElContent =
      ' [data-anchorjs-icon]::after {' +
      '   content: attr(data-anchorjs-icon);' +
      ' }';
    var anchorjsLinkFontFace =
      ' @font-face {' +
      '   font-family: "anchorjs-icons";' +
      '   src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP) format("truetype");' +
      ' }';

    style.className = 'anchorjs';
    style.appendChild(document.createTextNode(''));

    var firstStyleEl = document.head.querySelector('[rel="stylesheet"], style');
    if (firstStyleEl) {
      document.head.insertBefore(style, firstStyleEl);
    } else {
      document.head.appendChild(style);
    }

    style.sheet.insertRule(linkRule, 0);
    style.sheet.insertRule(hoverRule, 1);
    style.sheet.insertRule(pseudoElContent, 2);
    style.sheet.insertRule(anchorjsLinkFontFace, 3);
  }

  function _generateUniqueId(base, existingIds) {
    var candidate = base;
    var count = 0;
    while (existingIds.indexOf(candidate) !== -1) {
      candidate = base + '-' + ++count;
    }
    existingIds.push(candidate);
    return candidate;
  }

  function _createAnchor(id, readableId, options, visible) {
    var anchor = document.createElement('a');
    anchor.className = 'anchorjs-link ' + options.class;
    anchor.href = '#' + id;
    anchor.setAttribute('aria-label', 'Anchor link for: ' + readableId);
    anchor.setAttribute('data-anchorjs-icon', options.icon);

    if (visible === 'always') anchor.style.opacity = '1';

    if (options.icon === '\ue9cb') {
      anchor.style.font = '1em/1 anchorjs-icons';
      if (options.placement === 'left') anchor.style.lineHeight = 'inherit';
    }

    return anchor;
  }

  function _applyPlacement(anchor, element, placement) {
    if (placement === 'left') {
      anchor.style.position = 'absolute';
      anchor.style.marginLeft = '-1em';
      anchor.style.paddingRight = '0.5em';
      element.insertBefore(anchor, element.firstChild);
    } else {
      anchor.style.paddingLeft = '0.375em';
      element.appendChild(anchor);
    }
  }

  /* -------------------------------------------------------------------------- *
   *  Public API
   * -------------------------------------------------------------------------- */
  AnchorJS.prototype.add = function (selector) {
    var elements = _getElements(selector || 'h1, h2, h3, h4, h5, h6');
    if (!elements.length) return false;

    _applyRemainingDefaultOptions(this.options);
    var visible = this.options.visible;
    if (visible === 'touch') visible = this.isTouchDevice() ? 'always' : 'hover';

    _addBaselineStyles();

    var existingIds = [].map.call(document.querySelectorAll('[id]'), function (el) {
      return el.id;
    });

    var filtered = elements.filter(function (el) {
      return !this.hasAnchorJSLink(el);
    }, this);

    filtered.forEach(function (el) {
      var id = el.getAttribute('id');
      if (!id) {
        var tidy = this.urlify(el.textContent);
        id = _generateUniqueId(tidy, existingIds);
        el.setAttribute('id', id);
      }

      var readable = id.replace(/-/g, ' ');
      var anchor = _createAnchor(id, readable, this.options, visible);
      _applyPlacement(anchor, el, this.options.placement);
    }, this);

    this.elements = this.elements.concat(filtered);
    return this;
  };

  AnchorJS.prototype.remove = function (selector) {
    var elements = _getElements(selector);
    elements.forEach(function (el) {
      var anchor = el.querySelector('.anchorjs-link');
      if (!anchor) return;

      var idx = this.elements.indexOf(el);
      if (idx !== -1) this.elements.splice(idx, 1);
      el.removeChild(anchor);
    }, this);
    return this;
  };

  AnchorJS.prototype.removeAll = function () {
    this.remove(this.elements);
  };

  AnchorJS.prototype.urlify = function (text) {
    if (!this.options.truncate) _applyRemainingDefaultOptions(this.options);
    var nonsafe = /[& +$,:;=?@"#{}|^~[`%!'\]\.\/\(\)\*\\]/g;
    return text
      .trim()
      .replace(/\'/gi, '')
      .replace(nonsafe, '-')
      .replace(/-{2,}/g, '-')
      .substring(0, this.options.truncate)
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  };

  AnchorJS.prototype.hasAnchorJSLink = function (el) {
    var left = el.firstChild && (' ' + (el.firstChild.className || '') + ' ').indexOf(' anchorjs-link ') > -1;
    var right = el.lastChild && (' ' + (el.lastChild.className || '') + ' ').indexOf(' anchorjs-link ') > -1;
    return left || right;
  };

  return AnchorJS;
}));