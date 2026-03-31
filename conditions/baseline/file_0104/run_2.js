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
  const ICON_FONT_FAMILY = 'anchorjs-icons';
  const ANCHOR_CLASS = 'anchorjs-link';

  function AnchorJS(options) {
    this.options = Object.assign({}, DEFAULT_OPTIONS, options);
    this.elements = [];
  }

  AnchorJS.prototype.isTouchDevice = function() {
    return !!(('ontouchstart' in window) || 
              (window.DocumentTouch && document instanceof DocumentTouch));
  };

  AnchorJS.prototype.add = function(selector) {
    selector = selector || 'h1, h2, h3, h4, h5, h6';
    
    const elements = _getElements(selector);
    if (elements.length === 0) {
      return false;
    }

    _addBaselineStyles();

    const visibleOption = this._getVisibleOption();
    const existingIds = _getExistingIds();
    const elementsToAdd = [];

    for (let i = 0; i < elements.length; i++) {
      if (this.hasAnchorJSLink(elements[i])) {
        continue;
      }

      const elementId = this._getOrCreateElementId(elements[i], existingIds);
      const anchor = this._createAnchorElement(elementId, visibleOption);
      
      this._insertAnchor(elements[i], anchor);
      elementsToAdd.push(elements[i]);
    }

    this.elements = this.elements.concat(elementsToAdd);
    return this;
  };

  AnchorJS.prototype._getVisibleOption = function() {
    let visible = this.options.visible;
    if (visible === 'touch') {
      visible = this.isTouchDevice() ? 'always' : 'hover';
    }
    return visible;
  };

  AnchorJS.prototype._getOrCreateElementId = function(element, existingIds) {
    if (element.hasAttribute('id')) {
      return element.getAttribute('id');
    }

    const baseId = this.urlify(element.textContent);
    const uniqueId = _generateUniqueId(baseId, existingIds);
    
    element.setAttribute('id', uniqueId);
    existingIds.push(uniqueId);
    
    return uniqueId;
  };

  AnchorJS.prototype._createAnchorElement = function(elementId, visibleOption) {
    const readableId = elementId.replace(/-/g, ' ');
    const anchor = document.createElement('a');
    
    anchor.className = `${ANCHOR_CLASS} ${this.options.class}`.trim();
    anchor.href = `#${elementId}`;
    anchor.setAttribute('aria-label', `Anchor link for: ${readableId}`);
    anchor.setAttribute('data-anchorjs-icon', this.options.icon);

    if (visibleOption === 'always') {
      anchor.style.opacity = '1';
    }

    this._applyAnchorStyles(anchor);
    
    return anchor;
  };

  AnchorJS.prototype._applyAnchorStyles = function(anchor) {
    if (this.options.icon === '\ue9cb') {
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

  AnchorJS.prototype.remove = function(selector) {
    const elements = _getElements(selector);

    for (let i = 0; i < elements.length; i++) {
      const domAnchor = elements[i].querySelector(`.${ANCHOR_CLASS}`);
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
    return text
      .trim()
      .replace(/\'/gi, '')
      .replace(UNSAFE_CHARS_REGEX, '-')
      .replace(/-{2,}/g, '-')
      .substring(0, this.options.truncate)
      .replace(/^-+|-+$/gm, '')
      .toLowerCase();
  };

  AnchorJS.prototype.hasAnchorJSLink = function(el) {
    const hasLeftAnchor = el.firstChild && 
                          _hasClass(el.firstChild, ANCHOR_CLASS);
    const hasRightAnchor = el.lastChild && 
                           _hasClass(el.lastChild, ANCHOR_CLASS);

    return hasLeftAnchor || hasRightAnchor;
  };

  function _hasClass(el, className) {
    return (` ${el.className} `).indexOf(` ${className} `) > -1;
  }

  function _getElements(input) {
    if (typeof input === 'string' || input instanceof String) {
      return Array.from(document.querySelectorAll(input));
    } else if (Array.isArray(input) || input instanceof NodeList) {
      return Array.from(input);
    } else {
      throw new Error('The selector provided to AnchorJS was invalid.');
    }
  }

  function _getExistingIds() {
    return Array.from(document.querySelectorAll('[id]')).map(el => el.id);
  }

  function _generateUniqueId(baseId, existingIds) {
    let id = baseId;
    let count = 0;

    while (existingIds.includes(id)) {
      id = `${baseId}-${count}`;
      count++;
    }

    return id;
  }

  function _addBaselineStyles() {
    if (document.head.querySelector('style.anchorjs')) {
      return;
    }

    const style = document.createElement('style');
    style.className = 'anchorjs';

    const cssRules = _getCSSRules();
    
    const firstStyleEl = document.head.querySelector('[rel="stylesheet"], style');
    if (firstStyleEl) {
      document.head.insertBefore(style, firstStyleEl);
    } else {
      document.head.appendChild(style);
    }

    cssRules.forEach(rule => {
      style.sheet.insertRule(rule, style.sheet.cssRules.length);
    });
  }

  function _getCSSRules() {
    return [
      ' .anchorjs-link {' +
      '   opacity: 0;' +
      '   text-decoration: none;' +
      '   -webkit-font-smoothing: antialiased;' +
      '   -moz-osx-font-smoothing: grayscale;' +
      ' }',
      
      ' *:hover > .anchorjs-link,' +
      ' .anchorjs-link:focus {' +
      '   opacity: 1;' +
      ' }',
      
      ' [data-anchorjs-icon]::after {' +
      '   content: attr(data-anchorjs-icon);' +
      ' }',
      
      ' @font-face {' +
      '   font-family: "anchorjs-icons";' +
      '   src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP) format("truetype");' +
      ' }'
    ];
  }

  return AnchorJS;
}));
```