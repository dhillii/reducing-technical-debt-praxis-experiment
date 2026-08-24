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
      if (visibleOptionToUse === 'touch') {
        visibleOptionToUse = this.isTouchDevice() ? 'always' : 'hover';
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
        if (this.hasAnchorJSLink(elements[i])) {
          indexesToDrop.push(i);
          continue;
        }

        elementID = this._getElementID(elements[i], idList);
        readableID = elementID.replace(/-/g, ' ');
        anchor = this._buildAnchor(elementID, readableID, visibleOptionToUse);
        this._insertAnchor(elements[i], anchor);
      }

      for (i = 0; i < indexesToDrop.length; i++) {
        elements.splice(indexesToDrop[i] - i, 1);
      }
      this.elements = this.elements.concat(elements);

      return this;
    };

    this._getElementID = function(element, idList) {
      var elementID,
          tidyText,
          newTidyText,
          count = 0,
          index;

      if (element.hasAttribute('id')) {
        elementID = element.getAttribute('id');
      } else {
        tidyText = this.urlify(element.textContent);
        newTidyText = tidyText;

        do {
          if (index !== undefined) {
            newTidyText = tidyText + '-' + count;
          }
          index = idList.indexOf(newTidyText);
          count += 1;
        } while (index !== -1);

        index = undefined;
        idList.push(newTidyText);
        element.setAttribute('id', newTidyText);
        elementID = newTidyText;
      }

      return elementID;
    };

    this._buildAnchor = function(elementID, readableID, visibleOptionToUse) {
      var anchor = document.createElement('a');
      anchor.className = 'anchorjs-link ' + this.options.class;
      anchor.href = '#' + elementID;
      anchor.setAttribute('aria-label', 'Anchor link for: ' + readableID);
      anchor.setAttribute('data-anchorjs-icon', this.options.icon);

      if (visibleOptionToUse === 'always') {
        anchor.style.opacity = '1';
      }

      if (this.options.icon === '\ue9cb') {
        anchor.style.font = '1em/1 anchorjs-icons';
        if (this.options.placement === 'left') {
          anchor.style.lineHeight = 'inherit';
        }
      }

      return anchor;
    };

    this._insertAnchor = function(element, anchor) {
      if (this.options.placement === 'left') {
        anchor.style.position = 'absolute';
        anchor.style.marginLeft = '-1em';
        anchor.style.paddingRight = '0.5em';
        element.insertBefore(anchor, element.firstChild);
      } else {
        anchor.style.paddingLeft = '0.375em';
        element.appendChild(anchor);
      }
    };