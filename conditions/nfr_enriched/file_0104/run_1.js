```javascript
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
  const ANCHORJS_LINK_CLASS = 'anchorjs-link';
  const ANCHORJS_ICON_FONT = 'anchorjs-icons';

  function AnchorJS(options) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.elements = [];
  }

  AnchorJS.prototype.isTouchDevice = function() {
    return !!(('ontouchstart' in window) || (window.DocumentTouch && document instanceof DocumentTouch));
  };

  AnchorJS.prototype.add = function(selector) {
    const elements = _getElements(selector || 'h1, h2, h3, h4, h5, h6');

    if (elements.length === 0) {
      return false;
    }

    _addBaselineStyles();

    const visibleOptionToUse = _resolveVisibleOption(this.options, this.isTouchDevice());
    const existingIds = _getExistingIds();
    const elementsToAdd = [];

    for (let i = 0; i < elements.length; i++) {
      if (this.hasAnchorJSLink(elements[i])) {
        continue;
      }

      const elementId = _ensureElementId(elements[i], existingIds);
      const anchor = _createAnchorElement(elementId, this.options, visibleOptionToUse);

      _insertAnchor(elements[i], anchor, this.options.placement);
      elementsToAdd.push(elements[i]);
    }

    this.elements = this.elements.concat(elementsToAdd);
    return this;
  };

  AnchorJS.prototype.remove = function(selector) {
    const elements = _getElements(selector);

    for (let i = 0; i < elements.length; i++) {
      const domAnchor = elements[i].querySelector('.' + ANCHORJS_LINK_CLASS);
      if (domAnchor) {
        const index = this.elements.indexOf(elements[i]);
        if (index !== -1) {
          this.elements.splice(index, 1);
        }
        elements[i].removeChild(domAnchor);
      }
    }
    return this;
  };

  AnchorJS.prototype.removeAll = function() {
    this.remove(this.elements);
  };

  AnchorJS.prototype.urlify = function(text) {
    const truncateLength = this.options.truncate || DEFAULT_OPTIONS.truncate;

    return text
      .trim()
      .replace(/\'/gi, '')
      .replace(UNSAFE_CHARS_REGEX, '-')
      .replace(MULTIPLE_HYPHENS_REGEX, '-')
      .substring(0, truncateLength)
      .replace(LEADING_TRAILING_HYPHENS_REGEX, '')
      .toLowerCase();
  };

  AnchorJS.prototype.hasAnchorJSLink = function(el) {
    const hasLeftAnchor = el.firstChild && _hasClass(el.firstChild, ANCHORJS_LINK_CLASS);
    const hasRightAnchor = el.lastChild && _hasClass(el.lastChild, ANCHORJS_LINK_CLASS);
    return hasLeftAnchor || hasRightAnchor;
  };

  function _resolveVisibleOption(options, isTouchDevice) {
    if (options.visible === 'touch') {
      return isTouchDevice ? 'always' : 'hover';
    }
    return options.visible;
  }

  function _getExistingIds() {
    const elements = document.querySelectorAll('[id]');
    return Array.from(elements).map(el => el.id);
  }

  function _ensureElementId(element, existingIds) {
    if (element.hasAttribute('id')) {
      return element.getAttribute('id');
    }

    const baseId = new AnchorJS().urlify(element.textContent);
    const uniqueId = _generateUniqueId(baseId, existingIds);
    element.setAttribute('id', uniqueId);
    existingIds.push(uniqueId);
    return uniqueId;
  }

  function _generateUniqueId(baseId, existingIds) {
    let id = baseId;
    let counter = 0;

    while (existingIds.includes(id)) {
      id = `${baseId}-${counter}`;
      counter++;
    }

    return id;
  }

  function _createAnchorElement(elementId, options, visibleOptionToUse) {
    const readableId = elementId.replace(/-/g, ' ');
    const anchor = document.createElement('a');

    anchor.className = `${ANCHORJS_LINK_CLASS} ${options.class}`.trim();
    anchor.href = `#${elementId}`;
    anchor.setAttribute('aria-label', `Anchor link for: ${readableId}`);
    anchor.setAttribute('data-anchorjs-icon', options.icon);

    if (visibleOptionToUse === 'always') {
      anchor.style.opacity = '1';
    }

    _applyAnchorStyles(anchor, options);
    return anchor;
  }

  function _applyAnchorStyles(anchor, options) {
    if (options.icon === DEFAULT_OPTIONS.icon) {
      anchor.style.font = `1em/1 ${ANCHORJS_ICON_FONT}`;

      if (options.placement === 'left') {
        anchor.style.lineHeight = 'inherit';
      }
    }

    if (options.placement === 'left') {
      anchor.style.position = 'absolute';
      anchor.style.marginLeft = '-1em';
      anchor.style.paddingRight = '0.5em';
    } else {
      anchor.style.paddingLeft = '0.375em';
    }
  }

  function _insertAnchor(element, anchor, placement) {
    if (placement === 'left') {
      element.insertBefore(anchor, element.firstChild);
    } else {
      element.appendChild(anchor);
    }
  }

  function _getElements(input) {
    if (typeof input === 'string' || input instanceof String) {
      return Array.from(document.querySelectorAll(input));
    }

    if (Array.isArray(input) || input instanceof NodeList) {
      return Array.from(input);
    }

    throw new Error('The selector provided to AnchorJS was invalid.');
  }

  function _hasClass(element, className) {
    return (` ${element.className} `).indexOf(` ${className} `) > -1;
  }

  function _addBaselineStyles() {
    if (document.head.querySelector('style.anchorjs') !== null) {
      return;
    }

    const style = document.createElement('style');
    style.className = 'anchorjs';

    const cssRules = _getCSSRules();
    const styleContent = cssRules.join('\n');

    style.appendChild(document.createTextNode(styleContent));

    const firstStyleEl = document.head.querySelector('[rel="stylesheet"], style');
    if (firstStyleEl) {
      document.head.insertBefore(style, firstStyleEl);
    } else {
      document.head.appendChild(style);
    }
  }

  function _getCSSRules() {
    return [
      `.${ANCHORJS_LINK_CLASS} {
        opacity: 0;
        text-decoration: none;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }`,
      `*:hover > .${ANCHORJS_LINK_CLASS},
       .${ANCHORJS_LINK_CLASS}:focus {
        opacity: 1;
      }`,
      `[data-anchorjs-icon]::after {
        content: attr(data-anchorjs-icon);
      }`,
      `@font-face {
        font-family: "${ANCHORJS_ICON_FONT}";
        src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP) format("truetype");
      }`
    ];
  }

  return AnchorJS;
}));
```