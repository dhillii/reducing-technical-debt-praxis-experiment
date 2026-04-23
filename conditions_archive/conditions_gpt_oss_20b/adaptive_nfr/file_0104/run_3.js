/**
 * AnchorJS - v3.2.2 - 2016-10-05
 * https://github.com/umdjs/umd/blob/master/templates/returnExports.js
 */

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

    this.isTouchDevice = function() {
      return !!(('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch);
    };

    /**
     * Determines the visible option to use based on the current device.
     * @param {Object} opts - Options object
     * @param {Boolean} isTouch - Whether the device is touch capable
     * @return {String} - The resolved visible option
     */
    function getVisibleOption(opts, isTouch) {
      if (opts.visible === 'touch') {
        return isTouch ? 'always' : 'hover';
      }
      return opts.visible;
    }

    /**
     * Retrieves a list of existing IDs in the document.
     * @return {Array<string>} - Array of ID strings
     */
    function getExistingIds() {
      const els = document.querySelectorAll('[id]');
      return Array.from(els, el => el.id);
    }

    /**
     * Generates a unique ID for an element, ensuring no duplicates.
     * @param {HTMLElement} el - The element to generate an ID for
     * @param {Array<string>} idList - List of existing IDs
     * @param {Function} urlify - Function to urlify text
     * @return {string} - The generated ID
     */
    function generateId(el, idList, urlify) {
      if (el.hasAttribute('id')) {
        return el.getAttribute('id');
      }
      const tidy = urlify(el.textContent);
      let newTidy = tidy;
      let count = 0;
      let index;
      do {
        if (index !== undefined) {
          newTidy = tidy + '-' + count;
        }
        index = idList.indexOf(newTidy);
        count += 1;
      } while (index !== -1);
      idList.push(newTidy);
      el.setAttribute('id', newTidy);
      return newTidy;
    }

    /**
     * Creates an anchor element for a given ID and readable text.
     * @param {string} elementID - The ID to link to
     * @param {string} readableID - Human readable text for aria-label
     * @param {Object} opts - Options object
     * @return {HTMLElement} - The anchor element
     */
    function createAnchor(elementID, readableID, opts) {
      const anchor = document.createElement('a');
      anchor.className = 'anchorjs-link ' + opts.class;
      anchor.href = '#' + elementID;
      anchor.setAttribute('aria-label', 'Anchor link for: ' + readableID);
      anchor.setAttribute('data-anchorjs-icon', opts.icon);
      return anchor;
    }

    /**
     * Applies styles to the anchor based on options.
     * @param {HTMLElement} anchor - The anchor element
     * @param {string} visibleOption - The resolved visible option
     * @param {Object} opts - Options object
     */
    function applyAnchorStyles(anchor, visibleOption, opts) {
      if (visibleOption === 'always') {
        anchor.style.opacity = '1';
      }
      if (opts.icon === '\ue9cb') {
        anchor.style.font = '1em/1 anchorjs-icons';
        if (opts.placement === 'left') {
          anchor.style.lineHeight = 'inherit';
        }
      }
    }

    /**
     * Inserts the anchor into the element based on placement.
     * @param {HTMLElement} el - The target element
     * @param {HTMLElement} anchor - The anchor element
     * @param {Object} opts - Options object
     */
    function insertAnchor(el, anchor, opts) {
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

    /**
     * Removes elements at specified indexes from the array.
     * @param {Array} elements - Array of elements
     * @param {Array<number>} indexesToDrop - Indexes to remove
     */
    function dropIndexes(elements, indexesToDrop) {
      for (let i = 0; i < indexesToDrop.length; i++) {
        elements.splice(indexesToDrop[i] - i, 1);
      }
    }

    this.add = function(selector) {
      _applyRemainingDefaultOptions(this.options);
      const visibleOption = getVisibleOption(this.options, this.isTouchDevice());
      const sel = selector || 'h1, h2, h3, h4, h5, h6';
      const elements = _getElements(sel);
      if (elements.length === 0) {
        return false;
      }
      _addBaselineStyles();
      const idList = getExistingIds();
      const indexesToDrop = [];
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (this.hasAnchorJSLink(el)) {
          indexesToDrop.push(i);
          continue;
        }
        const elementID = generateId(el, idList, this.urlify.bind(this));
        const readableID = elementID.replace(/-/g, ' ');
        const anchor = createAnchor(elementID, readableID, this.options);
        applyAnchorStyles(anchor, visibleOption, this.options);
        insertAnchor(el, anchor, this.options);
      }
      dropIndexes(elements, indexesToDrop);
      this.elements = this.elements.concat(elements);
      return this;
    };

    this.remove = function(selector) {
      var index,
          domAnchor,
          elements = _getElements(selector);

      for (var i = 0; i < elements.length; i++) {
        domAnchor = elements[i].querySelector('.anchorjs-link');
        if (domAnchor) {
          index = this.elements.indexOf(elements[i]);
          if (index !== -1) {
            this.elements.splice(index, 1);
          }
          elements[i].removeChild(domAnchor);
        }
      }
      return this;
    };

    this.removeAll = function() {
      this.remove(this.elements);
    };

    this.urlify = function(text) {
      var nonsafeChars = /[& +$,:;=?@"#{}|^~[`%!'\]\.\/\(\)\*\\]/g,
          urlText;

      if (!this.options.truncate) {
        _applyRemainingDefaultOptions(this.options);
      }

      urlText = text.trim()
                    .replace(/\'/gi, '')
                    .replace(nonsafeChars, '-')
                    .replace(/-{2,}/g, '-')
                    .substring(0, this.options.truncate)
                    .replace(/^-+|-+$/gm, '')
                    .toLowerCase();

      return urlText;
    };

    this.hasAnchorJSLink = function(el) {
      var hasLeftAnchor = el.firstChild && ((' ' + el.firstChild.className + ' ').indexOf(' anchorjs-link ') > -1),
          hasRightAnchor = el.lastChild && ((' ' + el.lastChild.className + ' ').indexOf(' anchorjs-link ') > -1);

      return hasLeftAnchor || hasRightAnchor || false;
    };

    function _getElements(input) {
      var elements;
      if (typeof input === 'string' || input instanceof String) {
        elements = [].slice.call(document.querySelectorAll(input));
      } else if (Array.isArray(input) || input instanceof NodeList) {
        elements = [].slice.call(input);
      } else {
        throw new Error('The selector provided to AnchorJS was invalid.');
      }
      return elements;
    }

    function _addBaselineStyles() {
      if (document.head.querySelector('style.anchorjs') !== null) {
        return;
      }

      var style = document.createElement('style'),
          linkRule =
          ' .anchorjs-link {'                       +
          '   opacity: 0;'                          +
          '   text-decoration: none;'               +
          '   -webkit-font-smoothing: antialiased;' +
          '   -moz-osx-font-smoothing: grayscale;'  +
          ' }',
          hoverRule =
          ' *:hover > .anchorjs-link,'              +
          ' .anchorjs-link:focus  {'                +
          '   opacity: 1;'                          +
          ' }',
          anchorjsLinkFontFace =
          ' @font-face {'                           +
          '   font-family: "anchorjs-icons";'       +
          '   src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP) format("truetype");' +
          ' }',
          pseudoElContent =
          ' [data-anchorjs-icon]::after {'          +
          '   content: attr(data-anchorjs-icon);'   +
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
  }

  return AnchorJS;
}));