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

    this.add = function (selector) {
      _applyRemainingDefaultOptions(this.options);

      let visibleOptionToUse = this.options.visible;
      if (visibleOptionToUse === 'touch') {
        visibleOptionToUse = this.isTouchDevice() ? 'always' : 'hover';
      }

      if (!selector) {
        selector = 'h1, h2, h3, h4, h5, h6';
      }

      const elements = _getElements(selector);
      if (elements.length === 0) {
        return false;
      }

      _addBaselineStyles();

      const idList = Array.from(document.querySelectorAll('[id]')).map(el => el.id);
      const processedElements = [];

      elements.forEach(el => {
        if (this.hasAnchorJSLink(el)) {
          return;
        }

        const elementID = el.id || generateId(el, idList);
        const readableID = elementID.replace(/-/g, ' ');
        const anchor = createAnchor(elementID, readableID);

        if (visibleOptionToUse === 'always') {
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
          el.insertBefore(anchor, el.firstChild);
        } else {
          anchor.style.paddingLeft = '0.375em';
          el.appendChild(anchor);
        }

        processedElements.push(el);
      });

      this.elements = this.elements.concat(processedElements);
      return this;

      function generateId(el, list) {
        const tidyText = this.urlify(el.textContent);
        let newTidyText = tidyText;
        let count = 0;
        while (list.includes(newTidyText)) {
          newTidyText = `${tidyText}-${count++}`;
        }
        list.push(newTidyText);
        el.setAttribute('id', newTidyText);
        return newTidyText;
      }

      function createAnchor(id, readable) {
        const a = document.createElement('a');
        a.className = 'anchorjs-link ' + this.options.class;
        a.href = '#' + id;
        a.setAttribute('aria-label', 'Anchor link for: ' + readable);
        a.setAttribute('data-anchorjs-icon', this.options.icon);
        return a;
      }
    };

    this.remove = function (selector) {
      const elements = _getElements(selector);
      elements.forEach(el => {
        const domAnchor = el.querySelector('.anchorjs-link');
        if (domAnchor) {
          const index = this.elements.indexOf(el);
          if (index !== -1) {
            this.elements.splice(index, 1);
          }
          el.removeChild(domAnchor);
        }
      });
      return this;
    };

    this.removeAll = function () {
      this.remove(this.elements);
    };

    this.urlify = function (text) {
      const nonsafeChars = /[& +$,:;=?@"#{}|^~[`%!'\]\.\/\(\)\*\\]/g;
      if (!this.options.truncate) {
        _applyRemainingDefaultOptions(this.options);
      }
      return text.trim()
        .replace(/\'/gi, '')
        .replace(nonsafeChars, '-')
        .replace(/-{2,}/g, '-')
        .substring(0, this.options.truncate)
        .replace(/^-+|-+$/gm, '')
        .toLowerCase();
    };

    this.hasAnchorJSLink = function (el) {
      const hasLeftAnchor = el.firstChild && (' ' + el.firstChild.className + ' ').indexOf(' anchorjs-link ') > -1;
      const hasRightAnchor = el.lastChild && (' ' + el.lastChild.className + ' ').indexOf(' anchorjs-link ') > -1;
      return hasLeftAnchor || hasRightAnchor || false;
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

      const style = document.createElement('style');
      const linkRule =
        ' .anchorjs-link {' +
        '   opacity: 0;' +
        '   text-decoration: none;' +
        '   -webkit-font-smoothing: antialiased;' +
        '   -moz-osx-font-smoothing: grayscale;' +
        ' }';
      const hoverRule =
        ' *:hover > .anchorjs-link,' +
        ' .anchorjs-link:focus  {' +
        '   opacity: 1;' +
        ' }';
      const anchorjsLinkFontFace =
        ' @font-face {' +
        '   font-family: "anchorjs-icons";' +
        '   src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP) format("truetype");' +
        ' }';
      const pseudoElContent =
        ' [data-anchorjs-icon]::after {' +
        '   content: attr(data-anchorjs-icon);' +
        ' }';
      const firstStyleEl = document.head.querySelector('[rel="stylesheet"], style');

      style.className = 'anchorjs';
      style.appendChild(document.createTextNode(''));

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