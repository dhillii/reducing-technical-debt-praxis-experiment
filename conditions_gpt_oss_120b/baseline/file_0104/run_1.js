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

    function _applyRemainingDefaultOptions(opts) {
      opts.icon = opts.hasOwnProperty('icon') ? opts.icon : '\ue9cb';
      opts.visible = opts.hasOwnProperty('visible') ? opts.visible : 'hover';
      opts.placement = opts.hasOwnProperty('placement') ? opts.placement : 'right';
      opts.class = opts.hasOwnProperty('class') ? opts.class : '';
      opts.truncate = opts.hasOwnProperty('truncate') ? Math.floor(opts.truncate) : 64;
    }

    _applyRemainingDefaultOptions(this.options);

    this.isTouchDevice = function () {
      return !!(('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch);
    };

    this.add = function (selector) {
      var visible = _resolveVisibleOption(this.options.visible, this.isTouchDevice);
      var elements = _getElements(selector || 'h1, h2, h3, h4, h5, h6');

      if (!elements.length) return false;

      _addBaselineStyles();

      var existingIds = _collectExistingIds();

      var processed = elements.reduce(function (acc, el, idx) {
        if (this.hasAnchorJSLink(el)) {
          return acc;
        }

        var id = _ensureElementId(el, existingIds);
        var anchor = _createAnchor(el, id, visible);
        _applyPlacement(el, anchor, this.options.placement);
        acc.push(el);
        return acc;
      }.bind(this), []);

      this.elements = this.elements.concat(processed);
      return this;
    };

    this.remove = function (selector) {
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

    this.removeAll = function () {
      this.remove(this.elements);
    };

    this.urlify = function (text) {
      if (!this.options.truncate) _applyRemainingDefaultOptions(this.options);
      var nonsafeChars = /[& +$,:;=?@"#{}|^~[`%!'\]\.\/\(\)\*\\]/g;
      return text.trim()
        .replace(/\'/gi, '')
        .replace(nonsafeChars, '-')
        .replace(/-{2,}/g, '-')
        .substring(0, this.options.truncate)
        .replace(/^-+|-+$/gm, '')
        .toLowerCase();
    };

    this.hasAnchorJSLink = function (el) {
      var left = el.firstChild && ((' ' + el.firstChild.className + ' ').indexOf(' anchorjs-link ') > -1);
      var right = el.lastChild && ((' ' + el.lastChild.className + ' ').indexOf(' anchorjs-link ') > -1);
      return left || right || false;
    };

    function _resolveVisibleOption(visibleOption, isTouchFn) {
      if (visibleOption !== 'touch') return visibleOption;
      return isTouchFn() ? 'always' : 'hover';
    }

    function _collectExistingIds() {
      var nodes = document.querySelectorAll('[id]');
      return [].map.call(nodes, function (el) { return el.id; });
    }

    function _ensureElementId(el, idList) {
      if (el.hasAttribute('id')) return el.getAttribute('id');

      var base = this.urlify(el.textContent);
      var candidate = base;
      var count = 0;

      while (idList.indexOf(candidate) !== -1) {
        candidate = base + '-' + count;
        count++;
      }

      idList.push(candidate);
      el.setAttribute('id', candidate);
      return candidate;
    }

    function _createAnchor(el, id, visible) {
      var readable = id.replace(/-/g, ' ');
      var a = document.createElement('a');
      a.className = 'anchorjs-link ' + this.options.class;
      a.href = '#' + id;
      a.setAttribute('aria-label', 'Anchor link for: ' + readable);
      a.setAttribute('data-anchorjs-icon', this.options.icon);

      if (visible === 'always') a.style.opacity = '1';

      if (this.options.icon === '\ue9cb') {
        a.style.font = '1em/1 anchorjs-icons';
        if (this.options.placement === 'left') a.style.lineHeight = 'inherit';
      }

      return a;
    }

    function _applyPlacement(el, anchor, placement) {
      if (placement === 'left') {
        anchor.style.position = 'absolute';
        anchor.style.marginLeft = '-1em';
        anchor.style.paddingRight = '0.5em';
        el.insertBefore(anchor, el.firstChild);
      } else {
        anchor.style.paddingLeft = '0.375em';
        el.appendChild(anchor);
      }
    }

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
      var linkRule = ' .anchorjs-link {opacity: 0;text-decoration: none;-webkit-font-smoothing: antialiased;-moz-osx-font-smoothing: grayscale;}';
      var hoverRule = ' *:hover > .anchorjs-link,.anchorjs-link:focus {opacity: 1;}';
      var fontFace = ' @font-face {font-family: "anchorjs-icons";src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP) format("truetype");}';
      var pseudo = ' [data-anchorjs-icon]::after {content: attr(data-anchorjs-icon);}';

      style.className = 'anchorjs';
      style.appendChild(document.createTextNode(''));

      var first = document.head.querySelector('[rel="stylesheet"], style');
      if (first) {
        document.head.insertBefore(style, first);
      } else {
        document.head.appendChild(style);
      }

      var sheet = style.sheet;
      sheet.insertRule(linkRule, sheet.cssRules.length);
      sheet.insertRule(hoverRule, sheet.cssRules.length);
      sheet.insertRule(pseudo, sheet.cssRules.length);
      sheet.insertRule(fontFace, sheet.cssRules.length);
    }
  }

  return AnchorJS;
}));