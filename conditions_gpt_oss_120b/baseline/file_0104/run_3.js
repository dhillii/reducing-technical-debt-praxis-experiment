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
      _applyRemainingDefaultOptions(this.options);
      const visibleOption = this._resolveVisibleOption();

      const elements = _getElements(selector || 'h1, h2, h3, h4, h5, h6');
      if (!elements.length) return false;

      _addBaselineStyles();

      const existingIds = Array.from(document.querySelectorAll('[id]')).map(el => el.id);
      const processed = [];

      elements.forEach(el => {
        if (this.hasAnchorJSLink(el)) return;

        const elementID = this._ensureElementId(el, existingIds);
        const readableID = elementID.replace(/-/g, ' ');
        const anchor = this._buildAnchor(elementID, readableID, visibleOption);
        this._placeAnchor(el, anchor);
        processed.push(el);
      });

      this.elements = this.elements.concat(processed);
      return this;
    };

    this._resolveVisibleOption = function () {
      let opt = this.options.visible;
      if (opt === 'touch') {
        opt = this.isTouchDevice() ? 'always' : 'hover';
      }
      return opt;
    };

    this._ensureElementId = function (el, idList) {
      if (el.hasAttribute('id')) {
        return el.getAttribute('id');
      }
      const base = this.urlify(el.textContent);
      let candidate = base;
      let counter = 0;
      while (idList.includes(candidate)) {
        counter += 1;
        candidate = `${base}-${counter}`;
      }
      idList.push(candidate);
      el.setAttribute('id', candidate);
      return candidate;
    };

    this._buildAnchor = function (id, readableId, visibleOption) {
      const a = document.createElement('a');
      a.className = `anchorjs-link ${this.options.class}`;
      a.href = `#${id}`;
      a.setAttribute('aria-label', `Anchor link for: ${readableId}`);
      a.setAttribute('data-anchorjs-icon', this.options.icon);

      if (visibleOption === 'always') a.style.opacity = '1';

      if (this.options.icon === '\ue9cb') {
        a.style.font = '1em/1 anchorjs-icons';
        if (this.options.placement === 'left') a.style.lineHeight = 'inherit';
      }
      return a;
    };

    this._placeAnchor = function (el, anchor) {
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

    this.remove = function (selector) {
      const elements = _getElements(selector);
      elements.forEach(el => {
        const domAnchor = el.querySelector('.anchorjs-link');
        if (!domAnchor) return;
        const idx = this.elements.indexOf(el);
        if (idx !== -1) this.elements.splice(idx, 1);
        el.removeChild(domAnchor);
      });
      return this;
    };

    this.removeAll = function () {
      this.remove(this.elements);
    };

    this.urlify = function (text) {
      if (!this.options.truncate) _applyRemainingDefaultOptions(this.options);
      const nonsafeChars = /[& +$,:;=?@"#{}|^~[`%!'\]\.\/\(\)\*\\]/g;
      return text
        .trim()
        .replace(/\'/gi, '')
        .replace(nonsafeChars, '-')
        .replace(/-{2,}/g, '-')
        .substring(0, this.options.truncate)
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
    };

    this.hasAnchorJSLink = function (el) {
      const left = el.firstChild && (` ${el.firstChild.className} `).includes(' anchorjs-link ');
      const right = el.lastChild && (` ${el.lastChild.className} `).includes(' anchorjs-link ');
      return left || right;
    };

    function _getElements(input) {
      if (typeof input === 'string' || input instanceof String) {
        return Array.from(document.querySelectorAll(input));
      }
      if (Array.isArray(input) || input instanceof NodeList) {
        return Array.from(input);
      }
      throw new Error('The selector provided to AnchorJS was invalid.');
    }

    function _addBaselineStyles() {
      if (document.head.querySelector('style.anchorjs')) return;

      const style = document.createElement('style');
      const linkRule = ' .anchorjs-link {opacity: 0;text-decoration: none;-webkit-font-smoothing: antialiased;-moz-osx-font-smoothing: grayscale;}';
      const hoverRule = ' *:hover > .anchorjs-link,.anchorjs-link:focus {opacity: 1;}';
      const fontFace = ' @font-face {font-family: "anchorjs-icons";src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP) format("truetype");}';
      const pseudo = ' [data-anchorjs-icon]::after {content: attr(data-anchorjs-icon);}';

      style.className = 'anchorjs';
      style.appendChild(document.createTextNode(''));

      const first = document.head.querySelector('[rel="stylesheet"], style');
      if (first) document.head.insertBefore(style, first);
      else document.head.appendChild(style);

      const sheet = style.sheet;
      sheet.insertRule(linkRule, sheet.cssRules.length);
      sheet.insertRule(hoverRule, sheet.cssRules.length);
      sheet.insertRule(pseudo, sheet.cssRules.length);
      sheet.insertRule(fontFace, sheet.cssRules.length);
    }
  }

  return AnchorJS;
}));