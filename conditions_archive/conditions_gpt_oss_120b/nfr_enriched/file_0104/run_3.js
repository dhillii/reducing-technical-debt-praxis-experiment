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

    /** Apply default options where missing. */
    function applyDefaultOptions(opts) {
      opts.icon = opts.hasOwnProperty('icon') ? opts.icon : '\ue9cb';
      opts.visible = opts.hasOwnProperty('visible') ? opts.visible : 'hover';
      opts.placement = opts.hasOwnProperty('placement') ? opts.placement : 'right';
      opts.class = opts.hasOwnProperty('class') ? opts.class : '';
      opts.truncate = opts.hasOwnProperty('truncate') ? Math.floor(opts.truncate) : 64;
    }

    applyDefaultOptions(this.options);

    /** Detect touch devices (Modernizr style). */
    this.isTouchDevice = function () {
      return !!(('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch);
    };

    /** Convert selector / nodeList / array into an array of elements. */
    function getElements(input) {
      if (typeof input === 'string' || input instanceof String) {
        return [].slice.call(document.querySelectorAll(input));
      }
      if (Array.isArray(input) || input instanceof NodeList) {
        return [].slice.call(input);
      }
      throw new Error('The selector provided to AnchorJS was invalid.');
    }

    /** Ensure baseline CSS is present once per page. */
    function addBaselineStyles() {
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

    /** Determine the effective visibility option based on device. */
    function resolveVisibilityOption() {
      var opt = this.options.visible;
      if (opt === 'touch') {
        opt = this.isTouchDevice() ? 'always' : 'hover';
      }
      return opt;
    }

    /** Generate a unique ID for an element, avoiding collisions. */
    function generateUniqueId(base, existingIds) {
      var candidate = base,
          count = 0,
          idx;

      while ((idx = existingIds.indexOf(candidate)) !== -1) {
        count += 1;
        candidate = base + '-' + count;
      }
      existingIds.push(candidate);
      return candidate;
    }

    /** Create the anchor element with appropriate attributes and styles. */
    function createAnchor(id, readable, visibility) {
      var anchor = document.createElement('a');
      anchor.className = 'anchorjs-link ' + this.options.class;
      anchor.href = '#' + id;
      anchor.setAttribute('aria-label', 'Anchor link for: ' + readable);
      anchor.setAttribute('data-anchorjs-icon', this.options.icon);

      if (visibility === 'always') {
        anchor.style.opacity = '1';
      }

      if (this.options.icon === '\ue9cb') {
        anchor.style.font = '1em/1 anchorjs-icons';
        if (this.options.placement === 'left') {
          anchor.style.lineHeight = 'inherit';
        }
      }
      return anchor;
    }

    /** Insert the anchor into the target element based on placement option. */
    function insertAnchor(target, anchor) {
      if (this.options.placement === 'left') {
        anchor.style.position = 'absolute';
        anchor.style.marginLeft = '-1em';
        anchor.style.paddingRight = '0.5em';
        target.insertBefore(anchor, target.firstChild);
      } else {
        anchor.style.paddingLeft = '0.375em';
        target.appendChild(anchor);
      }
    }

    /** Add anchor links to page elements. */
    this.add = function (selector) {
      var elements = selector ? getElements(selector) : getElements('h1, h2, h3, h4, h5, h6');
      if (elements.length === 0) {
        return false;
      }

      applyDefaultOptions(this.options);
      var visibility = resolveVisibilityOption.call(this);
      addBaselineStyles();

      var existingIds = [].map.call(document.querySelectorAll('[id]'), function (el) {
        return el.id;
      });

      var processed = [];

      for (var i = 0; i < elements.length; i++) {
        var el = elements[i];

        if (this.hasAnchorJSLink(el)) {
          continue;
        }

        var id = el.getAttribute('id');
        if (!id) {
          var tidy = this.urlify(el.textContent);
          id = generateUniqueId(tidy, existingIds);
          el.setAttribute('id', id);
        }

        var readable = id.replace(/-/g, ' ');
        var anchor = createAnchor.call(this, id, readable, visibility);
        insertAnchor.call(this, el, anchor);
        processed.push(el);
      }

      this.elements = this.elements.concat(processed);
      return this;
    };

    /** Remove anchor links from selected elements. */
    this.remove = function (selector) {
      var elements = getElements(selector);
      for (var i = 0; i < elements.length; i++) {
        var anchor = elements[i].querySelector('.anchorjs-link');
        if (anchor) {
          var idx = this.elements.indexOf(elements[i]);
          if (idx !== -1) {
            this.elements.splice(idx, 1);
          }
          elements[i].removeChild(anchor);
        }
      }
      return this;
    };

    /** Remove all anchor links (used in tests). */
    this.removeAll = function () {
      this.remove(this.elements);
    };

    /** Convert arbitrary text into a URL‑friendly ID. */
    this.urlify = function (text) {
      var nonsafe = /[& +$,:;=?@"#{}|^~[`%!'\]\.\/\(\)\*\\]/g;
      if (!this.options.truncate) {
        applyDefaultOptions(this.options);
      }
      return text
        .trim()
        .replace(/\'/gi, '')
        .replace(nonsafe, '-')
        .replace(/-{2,}/g, '-')
        .substring(0, this.options.truncate)
        .replace(/^-+|-+$/gm, '')
        .toLowerCase();
    };

    /** Determine whether an element already contains an AnchorJS link. */
    this.hasAnchorJSLink = function (el) {
      var left = el.firstChild && ((' ' + el.firstChild.className + ' ').indexOf(' anchorjs-link ') > -1);
      var right = el.lastChild && ((' ' + el.lastChild.className + ' ').indexOf(' anchorjs-link ') > -1);
      return left || right || false;
    };
  }

  return AnchorJS;
}));