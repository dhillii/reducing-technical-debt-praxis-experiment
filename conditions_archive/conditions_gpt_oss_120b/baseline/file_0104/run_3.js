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

    const DEFAULTS = {
      icon: '\ue9cb',
      visible: 'hover',
      placement: 'right',
      class: '',
      truncate: 64
    };

    const applyDefaults = (opts) => {
      Object.keys(DEFAULTS).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(opts, key)) {
          opts[key] = DEFAULTS[key];
        } else if (key === 'truncate') {
          opts[key] = Math.floor(opts[key]);
        }
      });
    };

    applyDefaults(this.options);

    this.isTouchDevice = () => !!(('ontouchstart' in window) || (window.DocumentTouch && document instanceof DocumentTouch));

    this.add = (selector) => {
      applyDefaults(this.options);
      const visible = this._resolveVisibleOption(this.options.visible);
      const elements = this._getElements(selector || 'h1, h2, h3, h4, h5, h6');

      if (!elements.length) return false;

      this._addBaselineStyles();

      const existingIds = new Set(
        Array.from(document.querySelectorAll('[id]')).map((el) => el.id)
      );

      const processed = [];

      elements.forEach((el) => {
        if (this.hasAnchorJSLink(el)) return;

        const id = this._ensureId(el, existingIds);
        const anchor = this._createAnchor(el, id, visible);
        this._insertAnchor(el, anchor);
        processed.push(el);
      });

      this.elements = this.elements.concat(processed);
      return this;
    };

    this.remove = (selector) => {
      const elements = this._getElements(selector);
      elements.forEach((el) => {
        const anchor = el.querySelector('.anchorjs-link');
        if (!anchor) return;
        const idx = this.elements.indexOf(el);
        if (idx !== -1) this.elements.splice(idx, 1);
        el.removeChild(anchor);
      });
      return this;
    };

    this.removeAll = () => this.remove(this.elements);

    this.urlify = (text) => {
      if (!this.options.truncate) applyDefaults(this.options);
      const nonsafe = /[& +$,:;=?@"#{}|^~[`%!'\]\.\/\(\)\*\\]/g;
      return text
        .trim()
        .replace(/\'/gi, '')
        .replace(nonsafe, '-')
        .replace(/-{2,}/g, '-')
        .substring(0, this.options.truncate)
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
    };

    this.hasAnchorJSLink = (el) => {
      const left = el.firstChild && (` ${el.firstChild.className} `).includes(' anchorjs-link ');
      const right = el.lastChild && (` ${el.lastChild.className} `).includes(' anchorjs-link ');
      return left || right;
    };

    this._resolveVisibleOption = (opt) => {
      if (opt !== 'touch') return opt;
      return this.isTouchDevice() ? 'always' : 'hover';
    };

    this._ensureId = (el, idSet) => {
      if (el.hasAttribute('id')) {
        const existing = el.getAttribute('id');
        idSet.add(existing);
        return existing;
      }

      const base = this.urlify(el.textContent);
      let candidate = base;
      let counter = 0;

      while (idSet.has(candidate)) {
        candidate = `${base}-${counter++}`;
      }

      el.setAttribute('id', candidate);
      idSet.add(candidate);
      return candidate;
    };

    this._createAnchor = (el, id, visible) => {
      const readable = id.replace(/-/g, ' ');
      const a = document.createElement('a');

      a.className = `anchorjs-link ${this.options.class}`;
      a.href = `#${id}`;
      a.setAttribute('aria-label', `Anchor link for: ${readable}`);
      a.setAttribute('data-anchorjs-icon', this.options.icon);

      if (visible === 'always') a.style.opacity = '1';

      if (this.options.icon === '\ue9cb') {
        a.style.font = '1em/1 anchorjs-icons';
        if (this.options.placement === 'left') a.style.lineHeight = 'inherit';
      }

      return a;
    };

    this._insertAnchor = (el, anchor) => {
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

    this._getElements = (input) => {
      if (typeof input === 'string' || input instanceof String) {
        return Array.from(document.querySelectorAll(input));
      }
      if (Array.isArray(input) || input instanceof NodeList) {
        return Array.from(input);
      }
      throw new Error('The selector provided to AnchorJS was invalid.');
    };

    this._addBaselineStyles = () => {
      if (document.head.querySelector('style.anchorjs')) return;

      const style = document.createElement('style');
      const rules = [
        `.anchorjs-link {opacity:0;text-decoration:none;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}`,
        `*:hover > .anchorjs-link,.anchorjs-link:focus {opacity:1;}`,
        `[data-anchorjs-icon]::after {content:attr(data-anchorjs-icon);}`,
        `@font-face {font-family:"anchorjs-icons";src:url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP)`
      ];

      style.className = 'anchorjs';
      style.appendChild(document.createTextNode(''));

      const ref = document.head.querySelector('[rel="stylesheet"], style');
      if (ref) {
        document.head.insertBefore(style, ref);
      } else {
        document.head.appendChild(style);
      }

      const sheet = style.sheet;
      rules.forEach((r) => sheet.insertRule(r, sheet.cssRules.length));
    };
  }

  return AnchorJS;
}));