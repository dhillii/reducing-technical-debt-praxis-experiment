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
        if (!opts.hasOwnProperty(key)) {
          opts[key] = DEFAULTS[key];
        } else if (key === 'truncate') {
          opts[key] = Math.floor(opts[key]);
        }
      });
    };

    applyDefaults(this.options);

    this.isTouchDevice = () => !!(('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch);

    this._resolveVisibility = () => {
      let vis = this.options.visible;
      if (vis === 'touch') {
        vis = this.isTouchDevice() ? 'always' : 'hover';
      }
      return vis;
    };

    this._getElements = (input) => {
      if (typeof input === 'string' || input instanceof String) {
        return [].slice.call(document.querySelectorAll(input));
      }
      if (Array.isArray(input) || input instanceof NodeList) {
        return [].slice.call(input);
      }
      throw new Error('The selector provided to AnchorJS was invalid.');
    };

    this._collectExistingIds = () => {
      const els = document.querySelectorAll('[id]');
      return [].map.call(els, (el) => el.id);
    };

    this._generateUniqueId = (base, existingIds) => {
      let id = base;
      let count = 0;
      while (existingIds.includes(id)) {
        id = `${base}-${count}`;
        count += 1;
      }
      existingIds.push(id);
      return id;
    };

    this._createAnchor = (id, readable) => {
      const a = document.createElement('a');
      a.className = `anchorjs-link ${this.options.class}`;
      a.href = `#${id}`;
      a.setAttribute('aria-label', `Anchor link for: ${readable}`);
      a.setAttribute('data-anchorjs-icon', this.options.icon);
      return a;
    };

    this._applyVisibility = (anchor, visibility) => {
      if (visibility === 'always') {
        anchor.style.opacity = '1';
      }
    };

    this._applyIconStyles = (anchor) => {
      if (this.options.icon === '\ue9cb') {
        anchor.style.font = '1em/1 anchorjs-icons';
        if (this.options.placement === 'left') {
          anchor.style.lineHeight = 'inherit';
        }
      }
    };

    this._placeAnchor = (anchor, element) => {
      if (this.options.placement === 'left') {
        anchor.style.position = 'absolute';
        anchor.style.marginLeft = '-1em';
        anchor.style.paddingRight = '0.5em';
        element.insertBefore(anchor, element.firstChild);
      } else {
        anchor.style.paddingLeft = '0.375em';
        element.appendChild(anchor);
      }
    };

    this.add = (selector) => {
      applyDefaults(this.options);
      const visibility = this._resolveVisibility();

      const elements = this._getElements(selector || 'h1, h2, h3, h4, h5, h6');
      if (!elements.length) return false;

      _addBaselineStyles();

      const existingIds = this._collectExistingIds();

      const newElements = elements.filter((el) => !this.hasAnchorJSLink(el)).map((el) => {
        let id = el.getAttribute('id');
        if (!id) {
          const tidy = this.urlify(el.textContent);
          id = this._generateUniqueId(tidy, existingIds);
          el.setAttribute('id', id);
        }
        const readable = id.replace(/-/g, ' ');
        const anchor = this._createAnchor(id, readable);
        this._applyVisibility(anchor, visibility);
        this._applyIconStyles(anchor);
        this._placeAnchor(anchor, el);
        return el;
      });

      this.elements = this.elements.concat(newElements);
      return this;
    };

    this.remove = (selector) => {
      const elements = this._getElements(selector);
      elements.forEach((el) => {
        const anchor = el.querySelector('.anchorjs-link');
        if (anchor) {
          const idx = this.elements.indexOf(el);
          if (idx !== -1) this.elements.splice(idx, 1);
          el.removeChild(anchor);
        }
      });
      return this;
    };

    this.removeAll = () => {
      this.remove(this.elements);
    };

    this.urlify = (text) => {
      if (!this.options.truncate) applyDefaults(this.options);
      const nonsafe = /[& +$,:;=?@"#{}|^~[`%!'\]\.\/\(\)\*\\]/g;
      return text.trim()
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
    if (first) {
      document.head.insertBefore(style, first);
    } else {
      document.head.appendChild(style);
    }

    const sheet = style.sheet;
    sheet.insertRule(linkRule, sheet.cssRules.length);
    sheet.insertRule(hoverRule, sheet.cssRules.length);
    sheet.insertRule(pseudo, sheet.cssRules.length);
    sheet.insertRule(fontFace, sheet.cssRules.length);
  }

  return AnchorJS;
}));