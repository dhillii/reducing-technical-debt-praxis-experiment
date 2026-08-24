function _isTouchDevice() {
  return !!(('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch);
}

function _shouldUseAlwaysVisibility(visibleOption, isTouch) {
  return visibleOption === 'touch' ? isTouch : visibleOption === 'always';
}

function _hasExistingAnchorJSLink(element, isLeftPlacement) {
  var targetNode = isLeftPlacement ? element.firstChild : element.lastChild;
  return targetNode && ((' ' + targetNode.className + ' ').indexOf(' anchorjs-link ') > -1);
}

function _hasIdAttribute(element) {
  return element.hasAttribute('id');
}

function _getIdFromElement(element) {
  return element.getAttribute('id');
}

function _isElementAlreadyProcessed(indexesToDrop, currentIndex) {
  return indexesToDrop.indexOf(currentIndex) !== -1;
}

function _isIdAlreadyInList(idList, candidateId) {
  return idList.indexOf(candidateId) !== -1;
}

function _generateUniqueID(tidyText, idList) {
  var newTidyText = tidyText;
  var count = 0;
  var index;

  do {
    if (count > 0) {
      newTidyText = tidyText + '-' + count;
    }
    index = idList.indexOf(newTidyText);
    count += 1;
  } while (index !== -1);

  return newTidyText;
}

function _isLeftPlacement(placement) {
  return placement === 'left';
}

function _isAlwaysVisible(visibleOptionToUse) {
  return visibleOptionToUse === 'always';
}

function _isDefaultIcon(icon) {
  return icon === '\ue9cb';
}

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

this.add = function(selector) {
  var elements,
      elsWithIds,
      idList,
      elementID,
      i,
      index,
      count,
      tidyText,
      newTidyText,
      readableID,
      anchor,
      visibleOptionToUse,
      indexesToDrop = [];

  _applyRemainingDefaultOptions(this.options);

  visibleOptionToUse = this.options.visible;
  if (_shouldUseAlwaysVisibility(visibleOptionToUse, this.isTouchDevice())) {
    visibleOptionToUse = 'always';
  }

  if (!selector) {
    selector = 'h1, h2, h3, h4, h5, h6';
  }

  elements = _getElements(selector);

  if (elements.length === 0) {
    return false;
  }

  _addBaselineStyles();

  elsWithIds = document.querySelectorAll('[id]');
  idList = [].map.call(elsWithIds, function assign(el) {
    return el.id;
  });

  for (i = 0; i < elements.length; i++) {
    if (_isElementAlreadyProcessed(indexesToDrop, i)) {
      continue;
    }

    if (_hasExistingAnchorJSLink(elements[i], this.options.placement === 'left')) {
      indexesToDrop.push(i);
      continue;
    }

    if (_hasIdAttribute(elements[i])) {
      elementID = _getIdFromElement(elements[i]);
    } else {
      tidyText = this.urlify(elements[i].textContent);
      newTidyText = _generateUniqueID(tidyText, idList);
      idList.push(newTidyText);
      elements[i].setAttribute('id', newTidyText);
      elementID = newTidyText;
    }

    readableID = elementID.replace(/-/g, ' ');

    anchor = document.createElement('a');
    anchor.className = 'anchorjs-link ' + this.options.class;
    anchor.href = '#' + elementID;
    anchor.setAttribute('aria-label', 'Anchor link for: ' + readableID);
    anchor.setAttribute('data-anchorjs-icon', this.options.icon);

    if (_isAlwaysVisible(visibleOptionToUse)) {
      anchor.style.opacity = '1';
    }

    if (_isDefaultIcon(this.options.icon)) {
      anchor.style.font = '1em/1 anchorjs-icons';

      if (_isLeftPlacement(this.options.placement)) {
        anchor.style.lineHeight = 'inherit';
      }
    }

    if (_isLeftPlacement(this.options.placement)) {
      anchor.style.position = 'absolute';
      anchor.style.marginLeft = '-1em';
      anchor.style.paddingRight = '0.5em';
      elements[i].insertBefore(anchor, elements[i].firstChild);
    } else {
      anchor.style.paddingLeft = '0.375em';
      elements[i].appendChild(anchor);
    }
  }

  for (i = 0; i < indexesToDrop.length; i++) {
    elements.splice(indexesToDrop[i] - i, 1);
  }
  this.elements = this.elements.concat(elements);

  return this;
};