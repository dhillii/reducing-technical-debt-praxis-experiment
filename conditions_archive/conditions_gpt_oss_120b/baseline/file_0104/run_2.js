/*!
 * AnchorJS - v3.2.2
 * https://github.com/bryanbraun/anchorjs
 * Licensed MIT
 */
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

  const DEFAULTS = {
    icon: '\ue9cb',
    visible: 'hover',
    placement: 'right',
    class: '',
    truncate: 64
  };

  class AnchorJS {
    constructor(options = {}) {
      this.options = Object.assign({}, DEFAULTS, options);
      this.elements = [];
    }

    /* --------------------------------------------------------------------- *
     *  Public API
     * --------------------------------------------------------------------- */

    add(selector) {
      this._applyDefaults();

      const visible = this._resolveVisibleOption();
      const elements = this._getElements(selector || 'h1, h2, h3, h4, h5, h6');
      if (!elements.length) return false;

      this._addBaselineStyles();

      const existingIds = this._collectExistingIds();
      const newElements = [];

      elements.forEach(el => {
        if (this.hasAnchorJSLink(el)) return;
        const id = this._ensureId(el, existingIds);
        const anchor = this._buildAnchor(el, id, visible);
        this._insertAnchor(el, anchor);
        newElements.push(el);
      });

      this.elements = this.elements.concat(newElements);
      return this;
    }

    remove(selector) {
      const elements = this._getElements(selector);
      elements.forEach(el => {
        const anchor = el.querySelector('.anchorjs-link');
        if (!anchor) return;
        const idx = this.elements.indexOf(el);
        if (idx !== -1) this.elements.splice(idx, 1);
        el.removeChild(anchor);
      });
      return this;
    }

    removeAll() {
      return this.remove(this.elements);
    }

    urlify(text) {
      this._applyDefaults();
      const nonsafe = /[& +$,:;=?@"#{}|^~[`%!'\]\.\/\(\)\*\\]/g;
      return text
        .trim()
        .replace(/\'/gi, '')
        .replace(nonsafe, '-')
        .replace(/-{2,}/g, '-')
        .substring(0, this.options.truncate)
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
    }

    hasAnchorJSLink(el) {
      const left = el.firstChild && (` ${el.firstChild.className} `).includes(' anchorjs-link ');
      const right = el.lastChild && (` ${el.lastChild.className} `).includes(' anchorjs-link ');
      return left || right;
    }

    isTouchDevice() {
      return !!(('ontouchstart' in window) || (window.DocumentTouch && document instanceof DocumentTouch));
    }

    /* --------------------------------------------------------------------- *
     *  Private helpers
     * --------------------------------------------------------------------- */

    _applyDefaults() {
      // Ensure all default options are present (useful after external mutation)
      this.options = Object.assign({}, DEFAULTS, this.options);
      this.options.truncate = Math.floor(this.options.truncate);
    }

    _resolveVisibleOption() {
      let v = this.options.visible;
      if (v === 'touch') v = this.isTouchDevice() ? 'always' : 'hover';
      return v;
    }

    _getElements(input) {
      if (typeof input === 'string' || input instanceof String) {
        return Array.from(document.querySelectorAll(input));
      }
      if (Array.isArray(input) || input instanceof NodeList) {
        return Array.from(input);
      }
      throw new Error('The selector provided to AnchorJS was invalid.');
    }

    _collectExistingIds() {
      return Array.from(document.querySelectorAll('[id]')).map(el => el.id);
    }

    _ensureId(el, idList) {
      if (el.hasAttribute('id')) return el.getAttribute('id');

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
    }

    _buildAnchor(el, id, visible) {
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
    }

    _insertAnchor(el, anchor) {
      if (this.options.placement === 'left') {
        anchor.style.position = 'absolute';
        anchor.style.marginLeft = '-1em';
        anchor.style.paddingRight = '0.5em';
        el.insertBefore(anchor, el.firstChild);
      } else {
        anchor.style.paddingLeft = '0.375em';
        el.appendChild(anchor);
      }
    }

    _addBaselineStyles() {
      if (document.head.querySelector('style.anchorjs')) return;

      const style = document.createElement('style');
      style.className = 'anchorjs';
      style.appendChild(document.createTextNode(''));

      const first = document.head.querySelector('[rel="stylesheet"], style');
      if (first) document.head.insertBefore(style, first);
      else document.head.appendChild(style);

      const sheet = style.sheet;
      sheet.insertRule('.anchorjs-link {opacity:0;text-decoration:none;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}', 0);
      sheet.insertRule('*:hover > .anchorjs-link,.anchorjs-link:focus {opacity:1;}', 0);
      sheet.insertRule('[data-anchorjs-icon]::after {content:attr(data-anchorjs-icon);}', 0);
      sheet.insertRule('@font-face {font-family:"anchorjs-icons";src:url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP);}', 0);
    }
  }

  return AnchorJS;
}));