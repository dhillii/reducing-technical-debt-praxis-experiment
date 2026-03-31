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
  const ANCHORJS_STYLE_CLASS = 'anchorjs';

  function applyDefaultOptions(opts) {
    Object.keys(DEFAULT_OPTIONS).forEach(key => {
      if (!opts.hasOwnProperty(key)) {
        opts[key] = DEFAULT_OPTIONS[key];
      }
    });
    if (opts.truncate !== undefined) {
      opts.truncate = Math.floor(opts.truncate);
    }
  }

  function getElements(input) {
    if (typeof input === 'string' || input instanceof String) {
      return Array.from(document.querySelectorAll(input));
    }
    if (Array.isArray(input) || input instanceof NodeList) {
      return Array.from(input);
    }
    throw new Error('The selector provided to AnchorJS was invalid.');
  }

  function isTouchDevice() {
    return !!(('ontouchstart' in window) || (window.DocumentTouch && document instanceof DocumentTouch));
  }

  function getVisibleOption(visibleOption) {
    if (visibleOption === 'touch') {
      return isTouchDevice() ? 'always' : 'hover';
    }
    return visibleOption;
  }

  function generateUniqueId(baseId, existingIds) {
    let id = baseId;
    let count = 0;

    while (existingIds.includes(id)) {
      id = `${baseId}-${count}`;
      count += 1;
    }

    return id;
  }

  function createAnchorElement(elementId, readableId, options, visibleOption) {
    const anchor = document.createElement('a');
    anchor.className = `${ANCHORJS_LINK_CLASS} ${options.class}`.trim();
    anchor.href = `#${elementId}`;
    anchor.setAttribute('aria-label', `Anchor link for: ${readableId}`);
    anchor.setAttribute('data-anchorjs-icon', options.icon);

    if (visibleOption === 'always') {
      anchor.style.opacity = '1';
    }

    if (options.icon === DEFAULT_OPTIONS.icon) {
      anchor.style.font = '1em/1 anchorjs-icons';
      if (options.placement === 'left') {
        anchor.style.lineHeight = 'inherit';
      }
    }

    return anchor;
  }

  function positionAnchor(anchor, element, placement) {
    if (placement === 'left') {
      anchor.style.position = 'absolute';
      anchor.style.marginLeft = '-1em';
      anchor.style.paddingRight = '0.5em';
      element.insertBefore(anchor, element.firstChild);
    } else {
      anchor.style.paddingLeft = '0.375em';
      element.appendChild(anchor);
    }
  }

  function addBaselineStyles() {
    if (document.head.querySelector(`style.${ANCHORJS_STYLE_CLASS}`) !== null) {
      return;
    }

    const style = document.createElement('style');
    style.className = ANCHORJS_STYLE_CLASS;

    const cssRules = [
      ` .${ANCHORJS_LINK_CLASS} {
        opacity: 0;
        text-decoration: none;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }`,
      ` *:hover > .${ANCHORJS_LINK_CLASS},
      .${ANCHORJS_LINK_CLASS}:focus {
        opacity: 1;
      }`,
      ` @font-face {
        font-family: "anchorjs-icons";
        src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP) format("truetype");
      }`,
      ` [data-anchorjs-icon]::after {
        content: attr(data-anchorjs-icon);
      }`
    ];

    style.appendChild(document.createTextNode(''));

    const firstStyleEl = document.head.querySelector('[rel="stylesheet"], style');
    if (firstStyleEl === undefined) {
      document.head.appendChild(style);
    } else {
      document.head.insertBefore(style, firstStyleEl);
    }

    cssRules.forEach(rule => {
      style.sheet.insertRule(rule, style.sheet.cssRules.length);
    });
  }

  function AnchorJS(options) {
    this.options = options || {};
    this.elements = [];

    applyDefaultOptions(this.options);
  }

  AnchorJS.prototype.isTouchDevice = isTouchDevice;

  AnchorJS.prototype.add = function(selector) {
    applyDefaultOptions(this.options);

    const visibleOption = getVisibleOption(this.options.visible);
    const targetSelector = selector || 'h1, h2, h3, h4, h5, h6';
    const elements = getElements(targetSelector);

    if (elements.length === 0) {
      return false;
    }

    addBaselineStyles();

    const existingIds = Array.from(document.querySelectorAll('[id]')).map(el => el.id);
    const elementsToAdd = [];

    elements.forEach(element => {
      if (this.hasAnchorJSLink(element)) {
        return;
      }

      let elementId = element.getAttribute('id');

      if (!elementId) {
        const baseId = this.urlify(element.textContent);
        elementId = generateUniqueId(baseId, existingIds);
        element.setAttribute('id', elementId);
        existingIds.push(elementId);
      }

      const readableId = elementId.replace(/-/g, ' ');
      const anchor = createAnchorElement(elementId, readableId, this.options, visibleOption);

      positionAnchor(anchor, element, this.options.placement);
      elementsToAdd.push(element);
    });

    this.elements = this.elements.concat(elementsToAdd);
    return this;
  };

  AnchorJS.prototype.remove = function(selector) {
    const elements = getElements(selector);

    elements.forEach(element => {
      const domAnchor = element.querySelector(`.${ANCHORJS_LINK_CLASS}`);
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

  AnchorJS.prototype.removeAll = function() {
    this.remove(this.elements);
  };

  AnchorJS.prototype.urlify = function(text) {
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

  AnchorJS.prototype.hasAnchorJSLink = function(el) {
    const hasLeftAnchor = el.firstChild && 
      (` ${el.firstChild.className} `).includes(` ${ANCHORJS_LINK_CLASS} `);
    const hasRightAnchor = el.lastChild && 
      (` ${el.lastChild.className} `).includes(` ${ANCHORJS_LINK_CLASS} `);

    return hasLeftAnchor || hasRightAnchor;
  };

  return AnchorJS;
}));
```