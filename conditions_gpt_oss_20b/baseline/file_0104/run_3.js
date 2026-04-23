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
      return !!(('ontouchstart' in window) || (window.DocumentTouch && document instanceof DocumentTouch));
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
      if (document.head.querySelector('style.anchorjs') !== null) return;
      var style = document.createElement('style');
      var linkRule = ' .anchorjs-link { opacity: 0; text-decoration: none; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }';
      var hoverRule = ' *:hover > .anchorjs-link, .anchorjs-link:focus  { opacity: 1; }';
      var anchorjsLinkFontFace = ' @font-face { font-family: "anchorjs-icons"; src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP)';
      var pseudoElContent = ' [data-anchorjs-icon]::after { content: attr(data-anchorjs-icon); }';
      style.className = 'anchorjs';
      style.appendChild(document.createTextNode(''));
      var firstStyleEl = document.head.querySelector('[rel="stylesheet"], style');
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
    function _uniqueId(base, idList) {
      var candidate = base;
      var count = 0;
      while (idList.indexOf(candidate) !== -1) {
        candidate = base + '-' + count;
        count++;
      }
      idList.push(candidate);
      return candidate;
    }
    function _createAnchor(elementID, readableID, opts) {
      var anchor = document.createElement('a');
      anchor.className = 'anchorjs-link ' + opts.class;
      anchor.href = '#' + elementID;
      anchor.setAttribute('aria-label', 'Anchor link for: ' + readableID);
      anchor.setAttribute('data-anchorjs-icon', opts.icon);
      if (opts.icon === '\ue9cb') {
        anchor.style.font = '1em/1 anchorjs-icons';
        if (opts.placement === 'left') {
          anchor.style.lineHeight = 'inherit';
        }
      }
      return anchor;
    }
    function _applyAnchorStyles(anchor, visibleOption, opts) {
      if (visibleOption === 'always') {
        anchor.style.opacity = '1';
      }
    }
    function _insertAnchor(el, anchor, opts) {
      if (opts.placement === 'left') {
        anchor.style.position = 'absolute';
        anchor.style.marginLeft = '-1em';
        anchor.style.paddingRight = '0.5em';
        el.insertBefore(anchor, el.firstChild);
      } else {
        anchor.style.paddingLeft = '0.375em';
        el.appendChild(anchor);
      }
    }
    this.add = function (selector) {
      _applyRemainingDefaultOptions(this.options);
      var visibleOption = this.options.visible === 'touch' ? (this.isTouchDevice() ? 'always' : 'hover') : this.options.visible;
      if (!selector) selector = 'h1, h2, h3, h4, h5, h6';
      var elements = _getElements(selector);
      if (elements.length === 0) return false;
      _addBaselineStyles();
      var elsWithIds = document.querySelectorAll('[id]');
      var idList = Array.from(elsWithIds, function (el) { return el.id; });
      var newElements = [];
      elements.forEach(function (el) {
        if (this.hasAnchorJSLink(el)) return;
        var elementID;
        if (el.hasAttribute('id')) {
          elementID = el.getAttribute('id');
        } else {
          var tidy = this.urlify(el.textContent);
          elementID = _uniqueId(tidy, idList);
          el.setAttribute('id', elementID);
        }
        var readableID = elementID.replace(/-/g, ' ');
        var anchor = _createAnchor(elementID, readableID, this.options);
        _applyAnchorStyles(anchor, visibleOption, this.options);
        _insertAnchor(el, anchor, this.options);
        newElements.push(el);
      }, this);
      this.elements = this.elements.concat(newElements);
      return this;
    };
    this.remove = function (selector) {
      var elements = _getElements(selector);
      elements.forEach(function (el) {
        var domAnchor = el.querySelector('.anchorjs-link');
        if (domAnchor) {
          var index = this.elements.indexOf(el);
          if (index !== -1) this.elements.splice(index, 1);
          el.removeChild(domAnchor);
        }
      }, this);
      return this;
    };
    this.removeAll = function () {
      this.remove(this.elements);
    };
    this.urlify = function (text) {
      var nonsafeChars = /[& +$,:;=?@"#{}|^~[`%!'\]\.\/\(\)\*\\]/g;
      if (!this.options.truncate) _applyRemainingDefaultOptions(this.options);
      var urlText = text.trim()
        .replace(/\'/gi, '')
        .replace(nonsafeChars, '-')
        .replace(/-{2,}/g, '-')
        .substring(0, this.options.truncate)
        .replace(/^-+|-+$/gm, '')
        .toLowerCase();
      return urlText;
    };
    this.hasAnchorJSLink = function (el) {
      var hasLeftAnchor = el.firstChild && ((' ' + el.firstChild.className + ' ').indexOf(' anchorjs-link ') > -1);
      var hasRightAnchor = el.lastChild && ((' ' + el.lastChild.className + ' ').indexOf(' anchorjs-link ') > -1);
      return hasLeftAnchor || hasRightAnchor || false;
    };
  }
  return AnchorJS;
}));