this.add = function(selector) {
      var elements,
          visibleOptionToUse,
          idList;

      _applyRemainingDefaultOptions(this.options);
      visibleOptionToUse = _resolveVisibleOption(this.options, this.isTouchDevice);
      selector = _normalizeSelector(selector);
      elements = _getElements(selector);

      if (elements.length === 0) {
        return false;
      }

      _addBaselineStyles();
      idList = _buildIdList();

      return _processElements(this, elements, idList, visibleOptionToUse);
    };

    /**
     * Resolves the effective visible option based on device type and configuration.
     * @param {Object} options - AnchorJS options
     * @param {Function} isTouchDevice - Function to detect touch capability
     * @return {String} - 'always' or 'hover'
     */
    function _resolveVisibleOption(options, isTouchDevice) {
      var visibleOption = options.visible;
      if (visibleOption === 'touch') {
        return isTouchDevice() ? 'always' : 'hover';
      }
      return visibleOption;
    }

    /**
     * Normalizes the selector to a default value if none provided.
     * @param {String|Array|NodeList} selector - Input selector
     * @return {String} - Normalized selector
     */
    function _normalizeSelector(selector) {
      return selector || 'h1, h2, h3, h4, h5, h6';
    }

    /**
     * Builds a list of existing IDs to prevent duplicates.
     * @return {Array} - Array of existing element IDs
     */
    function _buildIdList() {
      var elsWithIds = document.querySelectorAll('[id]');
      return [].map.call(elsWithIds, function(el) {
        return el.id;
      });
    }

    /**
     * Processes elements to add anchor links.
     * @param {Object} anchorJS - AnchorJS instance
     * @param {Array} elements - Elements to process
     * @param {Array} idList - Existing ID list
     * @param {String} visibleOptionToUse - Effective visible option
     * @return {this} - AnchorJS instance
     */
    function _processElements(anchorJS, elements, idList, visibleOptionToUse) {
      var indexesToDrop = [];

      for (var i = 0; i < elements.length; i++) {
        if (anchorJS.hasAnchorJSLink(elements[i])) {
          indexesToDrop.push(i);
          continue;
        }

        _ensureElementHasId(elements[i], idList);
      }

      for (var j = 0; j < indexesToDrop.length; j++) {
        elements.splice(indexesToDrop[j] - j, 1);
      }

      anchorJS.elements = anchorJS.elements.concat(elements);
      return anchorJS;
    }

    /**
     * Ensures an element has a unique ID, generating one if necessary.
     * @param {Element} element - DOM element
     * @param {Array} idList - Existing ID list
     */
    function _ensureElementHasId(element, idList) {
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
          if (count > 0) {
            newTidyText = tidyText + '-' + count;
          }
          index = idList.indexOf(newTidyText);
          count += 1;
        } while (index !== -1);

        idList.push(newTidyText);
        element.setAttribute('id', newTidyText);
        elementID = newTidyText;
      }

      _createAndInsertAnchor(element, elementID, this.options, this.isTouchDevice);
    }

    /**
     * Creates and inserts an anchor link into the element.
     * @param {Element} element - DOM element
     * @param {String} elementID - Target ID
     * @param {Object} options - AnchorJS options
     * @param {Function} isTouchDevice - Function to detect touch capability
     */
    function _createAndInsertAnchor(element, elementID, options, isTouchDevice) {
      var anchor = document.createElement('a'),
          readableID = elementID.replace(/-/g, ' ');

      anchor.className = 'anchorjs-link ' + options.class;
      anchor.href = '#' + elementID;
      anchor.setAttribute('aria-label', 'Anchor link for: ' + readableID);
      anchor.setAttribute('data-anchorjs-icon', options.icon);

      if (options.visible === 'always') {
        anchor.style.opacity = '1';
      }

      if (options.icon === '\ue9cb') {
        anchor.style.font = '1em/1 anchorjs-icons';
        if (options.placement === 'left') {
          anchor.style.lineHeight = 'inherit';
        }
      }

      if (options.placement === 'left') {
        anchor.style.position = 'absolute';
        anchor.style.marginLeft = '-1em';
        anchor.style.paddingRight = '0.5em';
        element.insertBefore(anchor, element.firstChild);
      } else {
        anchor.style.paddingLeft = '0.375em';
        element.appendChild(anchor);
      }
    }