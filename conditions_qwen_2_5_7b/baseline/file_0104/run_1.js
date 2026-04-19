```javascript
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

    _applyRemainingDefaultOptions(this.options);

    this.isTouchDevice = function() {
      return !!(('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch);
    };

    this.add = function(selector) {
      var elements = _getElements(selector);
      if (elements.length === 0) {
        return false;
      }

      _addBaselineStyles();

      var idList = Array.from(document.querySelectorAll('[id]')).map(el => el.id);
      elements.forEach(element => {
        if (this.hasAnchorJSLink(element)) {
          return;
        }

        var elementID = element.getAttribute('id') || this.urlify(element.textContent);
        element.setAttribute('id', elementID);

        var readableID = elementID.replace(/-/g, ' ');
        var anchor = document.createElement('a');
        anchor.className = 'anchorjs-link ' + this.options.class;
        anchor.href = '#' + elementID;
        anchor.setAttribute('aria-label', 'Anchor link for: ' + readableID);
        anchor.setAttribute('data-anchorjs-icon', this.options.icon);

        if (this.options.visible === 'always') {
          anchor.style.opacity = '1';
        }

        if (this.options.icon === '\ue9cb') {
          anchor.style.font = '1em/1 anchorjs-icons';
          if (this.options.placement === 'left') {
            anchor.style.lineHeight = 'inherit';
          }
        }

        if (this.options.placement === 'left') {
          anchor.style.position = 'absolute';
          anchor.style.marginLeft = '-1em';
          anchor.style.paddingRight = '0.5em';
          element.insertBefore(anchor, element.firstChild);
        } else {
          anchor.style.paddingLeft = '0.375em';
          element.appendChild(anchor);
        }
      });

      this.elements = this.elements.concat(elements);

      return this;
    };

    this.remove = function(selector) {
      var elements = _getElements(selector);
      elements.forEach(element => {
        var anchor = element.querySelector('.anchorjs-link');
        if (anchor) {
          this.elements.splice(this.elements.indexOf(element), 1);
          element.removeChild(anchor);
        }
      });

      return this;
    };

    this.removeAll = function() {
      this.remove(this.elements);
    };

    this.urlify = function(text) {
      if (!this.options.truncate) {
        _applyRemainingDefaultOptions(this.options);
      }

      return text.trim()
        .replace(/\'/gi, '')
        .replace(/&| +|,$|:|;|=|@|#|\{|\}|\||^|~|\[|\]|\{||\}|\||\^|\~|`|!|'|%|&|(|)|*|+|,|-|.|/|:;|=|@|\\|{|}|~|[\]|\(|\)|\*|\\|\/|\(|\)|\*\\/g, '-')
        .replace(/-{2,}/g, '-')
        .substring(0, this.options.truncate)
        .replace(/^-+|-+$/gm, '')
        .toLowerCase();
    };

    this.hasAnchorJSLink = function(el) {
      return el.querySelector('.anchorjs-link') !== null;
    };

    function _getElements(input) {
      if (typeof input === 'string' || input instanceof String) {
        return [].slice.call(document.querySelectorAll(input));
      } else if (Array.isArray(input) || input instanceof NodeList) {
        return [].slice.call(input);
      } else {
        throw new Error('The selector provided to AnchorJS was invalid.');
      }
    }

    function _addBaselineStyles() {
      if (document.head.querySelector('style.anchorjs') !== null) {
        return;
      }

      var style = document.createElement('style');
      style.className = 'anchorjs';
      style.appendChild(document.createTextNode(''));
      document.head.insertBefore(style, document.head.querySelector('[rel="stylesheet"], style'));

      style.sheet.insertRule('.anchorjs-link { opacity: 0; text-decoration: none; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }', style.sheet.cssRules.length);
      style.sheet.insertRule('*:hover > .anchorjs-link, .anchorjs-link:focus { opacity: 1; }', style.sheet.cssRules.length);
      style.sheet.insertRule('[data-anchorjs-icon]::after { content: attr(data-anchorjs-icon); }', style.sheet.cssRules.length);
      style.sheet.insertRule('@font-face { font-family: "anchorjs-icons"; src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP) format("truetype");', style.sheet.cssRules.length);
    }

    _applyRemainingDefaultOptions(this.options);
  }

  return AnchorJS;
}));
```