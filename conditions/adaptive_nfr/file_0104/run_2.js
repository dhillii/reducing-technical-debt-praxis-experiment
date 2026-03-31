```javascript
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

  const DEFAULT_OPTIONS = {
    icon: '\ue9cb',
    visible: 'hover',
    placement: 'right',
    class: '',
    truncate: 64
  };

  const UNSAFE_CHARS_REGEX = /[& +$,:;=?@"#{}|^~[`%!'\]\.\/\(\)\*\\]/g;
  const MULTIPLE_HYPHENS_REGEX = /-{2,}/g;
  const LEADING_TRAILING_HYPHENS_REGEX = /^-+|-+$/gm;

  function applyDefaultOptions(opts) {
    Object.keys(DEFAULT_OPTIONS).forEach(key => {
      if (!opts.hasOwnProperty(key)) {
        opts[key] = DEFAULT_OPTIONS[key];
      }
    });
  }

  function getElements(input) {
    if (typeof input === 'string' || input instanceof String) {
      return [].slice.call(document.querySelectorAll(input));
    }
    if (Array.isArray(input) || input instanceof NodeList) {
      return [].slice.call(input);
    }
    throw new Error('The selector provided to AnchorJS was invalid.');
  }

  function isTouchDevice() {
    return !!(('ontouchstart' in window) || (window.DocumentTouch && document instanceof DocumentTouch));
  }

  function getExistingIds() {
    const elsWithIds = document.querySelectorAll('[id]');
    return [].map.call(elsWithIds, el => el.id);
  }

  function generateUniqueId(baseId, existingIds) {
    let newId = baseId;
    let count = 0;

    while (existingIds.indexOf(newId) !== -1) {
      newId = `${baseId}-${count}`;
      count += 1;
    }

    existingIds.push(newId);
    return newId;
  }

  function createAnchorElement(elementId, readableId, options, visibleOptionToUse) {
    const anchor = document.createElement('a');
    anchor.className = `anchorjs-link ${options.class}`;
    anchor.href = `#${elementId}`;
    anchor.setAttribute('aria-label', `Anchor link for: ${readableId}`);
    anchor.setAttribute('data-anchorjs-icon', options.icon);

    if (visibleOptionToUse === 'always') {
      anchor.style.opacity = '1';
    }

    if (options.icon === '\ue9cb') {
      anchor.style.font = '1em/1 anchorjs-icons';
      if (options.placement === 'left') {
        anchor.style.lineHeight = 'inherit';
      }
    }

    applyAnchorStyles(anchor, options);
    return anchor;
  }

  function applyAnchorStyles(anchor, options) {
    if (options.placement === 'left') {
      anchor.style.position = 'absolute';
      anchor.style.marginLeft = '-1em';
      anchor.style.paddingRight = '0.5em';
    } else {
      anchor.style.paddingLeft = '0.375em';
    }
  }

  function insertAnchor(element, anchor, options) {
    if (options.placement === 'left') {
      element.insertBefore(anchor, element.firstChild);
    } else {
      element.appendChild(anchor);
    }
  }

  function addBaselineStyles() {
    if (document.head.querySelector('style.anchorjs') !== null) {
      return;
    }

    const style = document.createElement('style');
    style.className = 'anchorjs';
    style.appendChild(document.createTextNode(''));

    const cssRules = getCSSRules();
    cssRules.forEach(rule => {
      style.sheet.insertRule(rule, style.sheet.cssRules.length);
    });

    const firstStyleEl = document.head.querySelector('[rel="stylesheet"], style');
    if (firstStyleEl === undefined) {
      document.head.appendChild(style);
    } else {
      document.head.insertBefore(style, firstStyleEl);
    }
  }

  function getCSSRules() {
    return [
      ' .anchorjs-link { opacity: 0; text-decoration: none; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }',
      ' *:hover > .anchorjs-link, .anchorjs-link:focus { opacity: 1; }',
      ' [data-anchorjs-icon]::after { content: attr(data-anchorjs-icon); }',
      ' @font-face { font-family: "anchorjs-icons"; src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP) format("truetype"); }'
    ];
  }

  function AnchorJS(options) {
    this.options = options || {};
    this.elements = [];
    applyDefaultOptions(this.options);

    this.isTouchDevice = isTouchDevice;

    this.add = function(selector) {
      applyDefaultOptions(this.options);

      let visibleOptionToUse = this.options.visible;
      if (visibleOptionToUse === 'touch') {
        visibleOptionToUse = this.isTouchDevice() ? 'always' : 'hover';
      }

      const targetSelector = selector || 'h1, h2, h3, h4, h5, h6';
      const elements = getElements(targetSelector);

      if (elements.length === 0) {
        return false;
      }

      addBaselineStyles();

      const idList = getExistingIds();
      const indexesToDrop = [];

      elements.forEach((element, i) => {
        if (this.hasAnchorJSLink(element)) {
          indexesToDrop.push(i);
          return;
        }

        let elementId;
        if (element.hasAttribute('id')) {
          elementId = element.getAttribute('id');
        } else {
          const tidyText = this.urlify(element.textContent);
          elementId = generateUniqueId(tidyText, idList);
          element.setAttribute('id', elementId);
        }

        const readableId = elementId.replace(/-/g, ' ');
        const anchor = createAnchorElement(elementId, readableId, this.options, visibleOptionToUse);
        insertAnchor(element, anchor, this.options);
      });

      indexesToDrop.reverse().forEach(index => {
        elements.splice(index, 1);
      });

      this.elements = this.elements.concat(elements);
      return this;
    };

    this.remove = function(selector) {
      const elements = getElements(selector);

      elements.forEach(element => {
        const domAnchor = element.querySelector('.anchorjs-link');
        if (domAnchor) {
          const index = this.elements.indexOf(element);
          if (index !== -1) {
            this.elements.splice(index, 1);
          }
          element.removeChild(domAnchor);
        }
      });

      return this;
    };

    this.removeAll = function() {
      this.remove(this.elements);
    };

    this.urlify = function(text) {
      if (!this.options.truncate) {
        applyDefaultOptions(this.options);
      }

      return text
        .trim()
        .replace(/\'/gi, '')
        .replace(UNSAFE_CHARS_REGEX, '-')
        .replace(MULTIPLE_HYPHENS_REGEX, '-')
        .substring(0, this.options.truncate)
        .replace(LEADING_TRAILING_HYPHENS_REGEX, '')
        .toLowerCase();
    };

    this.hasAnchorJSLink = function(el) {
      const hasLeftAnchor = el.firstChild && ((' ' + el.firstChild.className + ' ').indexOf(' anchorjs-link ') > -1);
      const hasRightAnchor = el.lastChild && ((' ' + el.lastChild.className + ' ').indexOf(' anchorjs-link ') > -1);
      return hasLeftAnchor || hasRightAnchor || false;
    };
  }

  return AnchorJS;
}));
```