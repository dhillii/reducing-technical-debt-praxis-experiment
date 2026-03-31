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

  const ICON_FONT_FAMILY = 'anchorjs-icons';
  const ANCHOR_CLASS = 'anchorjs-link';

  function AnchorJS(options) {
    this.options = options || {};
    this.elements = [];
    this._applyDefaultOptions();
  }

  AnchorJS.prototype._applyDefaultOptions = function() {
    Object.keys(DEFAULT_OPTIONS).forEach(key => {
      if (!this.options.hasOwnProperty(key)) {
        this.options[key] = DEFAULT_OPTIONS[key];
      }
    });
  };

  AnchorJS.prototype.isTouchDevice = function() {
    return !!(('ontouchstart' in window) || 
              (window.DocumentTouch && document instanceof DocumentTouch));
  };

  AnchorJS.prototype.add = function(selector) {
    this._applyDefaultOptions();

    const visibleOptionToUse = this._getVisibleOption();
    const elements = this._getElements(selector || 'h1, h2, h3, h4, h5, h6');

    if (elements.length === 0) {
      return false;
    }

    _addBaselineStyles();

    const idList = this._getExistingIds();
    const indexesToDrop = [];

    elements.forEach((element, i) => {
      if (this.hasAnchorJSLink(element)) {
        indexesToDrop.push(i);
        return;
      }

      const elementID = this._getOrCreateElementId(element, idList);
      const anchor = this._createAnchorElement(elementID, visibleOptionToUse);
      this._insertAnchor(element, anchor);
    });

    this._removeDroppedElements(elements, indexesToDrop);
    this.elements = this.elements.concat(elements);

    return this;
  };

  AnchorJS.prototype._getVisibleOption = function() {
    let visible = this.options.visible;
    if (visible === 'touch') {
      visible = this.isTouchDevice() ? 'always' : 'hover';
    }
    return visible;
  };

  AnchorJS.prototype._getExistingIds = function() {
    const elsWithIds = document.querySelectorAll('[id]');
    return [].map.call(elsWithIds, el => el.id);
  };

  AnchorJS.prototype._getOrCreateElementId = function(element, idList) {
    if (element.hasAttribute('id')) {
      return element.getAttribute('id');
    }

    const tidyText = this.urlify(element.textContent);
    const newId = this._generateUniqueId(tidyText, idList);
    element.setAttribute('id', newId);
    idList.push(newId);
    return newId;
  };

  AnchorJS.prototype._generateUniqueId = function(baseId, idList) {
    let newId = baseId;
    let count = 0;

    while (idList.indexOf(newId) !== -1) {
      newId = `${baseId}-${count}`;
      count++;
    }

    return newId;
  };

  AnchorJS.prototype._createAnchorElement = function(elementID, visibleOption) {
    const readableID = elementID.replace(/-/g, ' ');
    const anchor = document.createElement('a');

    anchor.className = `${ANCHOR_CLASS} ${this.options.class}`;
    anchor.href = `#${elementID}`;
    anchor.setAttribute('aria-label', `Anchor link for: ${readableID}`);
    anchor.setAttribute('data-anchorjs-icon', this.options.icon);

    if (visibleOption === 'always') {
      anchor.style.opacity = '1';
    }

    this._applyAnchorStyles(anchor);
    return anchor;
  };

  AnchorJS.prototype._applyAnchorStyles = function(anchor) {
    if (this.options.icon === DEFAULT_OPTIONS.icon) {
      anchor.style.font = `1em/1 ${ICON_FONT_FAMILY}`;

      if (this.options.placement === 'left') {
        anchor.style.lineHeight = 'inherit';
      }
    }

    if (this.options.placement === 'left') {
      anchor.style.position = 'absolute';
      anchor.style.marginLeft = '-1em';
      anchor.style.paddingRight = '0.5em';
    } else {
      anchor.style.paddingLeft = '0.375em';
    }
  };

  AnchorJS.prototype._insertAnchor = function(element, anchor) {
    if (this.options.placement === 'left') {
      element.insertBefore(anchor, element.firstChild);
    } else {
      element.appendChild(anchor);
    }
  };

  AnchorJS.prototype._removeDroppedElements = function(elements, indexesToDrop) {
    indexesToDrop.reverse().forEach(index => {
      elements.splice(index, 1);
    });
  };

  AnchorJS.prototype.remove = function(selector) {
    const elements = this._getElements(selector);

    elements.forEach(element => {
      const domAnchor = element.querySelector(`.${ANCHOR_CLASS}`);
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
    const nonsafeChars = /[& +$,:;=?@"#{}|^~[`%!'\]\.\/\(\)\*\\]/g;

    if (!this.options.truncate) {
      this._applyDefaultOptions();
    }

    return text
      .trim()
      .replace(/\'/gi, '')
      .replace(nonsafeChars, '-')
      .replace(/-{2,}/g, '-')
      .substring(0, this.options.truncate)
      .replace(/^-+|-+$/gm, '')
      .toLowerCase();
  };

  AnchorJS.prototype.hasAnchorJSLink = function(el) {
    const hasLeftAnchor = el.firstChild && 
      (` ${el.firstChild.className} `).indexOf(` ${ANCHOR_CLASS} `) > -1;
    const hasRightAnchor = el.lastChild && 
      (` ${el.lastChild.className} `).indexOf(` ${ANCHOR_CLASS} `) > -1;

    return hasLeftAnchor || hasRightAnchor;
  };

  AnchorJS.prototype._getElements = function(input) {
    if (typeof input === 'string' || input instanceof String) {
      return [].slice.call(document.querySelectorAll(input));
    } else if (Array.isArray(input) || input instanceof NodeList) {
      return [].slice.call(input);
    } else {
      throw new Error('The selector provided to AnchorJS was invalid.');
    }
  };

  function _addBaselineStyles() {
    if (document.head.querySelector('style.anchorjs') !== null) {
      return;
    }

    const style = document.createElement('style');
    style.className = 'anchorjs';

    const cssRules = [
      ` .${ANCHOR_CLASS} {
        opacity: 0;
        text-decoration: none;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }`,
      ` *:hover > .${ANCHOR_CLASS},
      .${ANCHOR_CLASS}:focus {
        opacity: 1;
      }`,
      ` [data-anchorjs-icon]::after {
        content: attr(data-anchorjs-icon);
      }`,
      ` @font-face {
        font-family: "${ICON_FONT_FAMILY}";
        src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP) format("truetype");
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

  return AnchorJS;
}));
```