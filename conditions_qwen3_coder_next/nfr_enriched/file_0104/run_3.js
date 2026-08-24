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
     * Normalizes the selector input to a default value if needed.
     * @param {String|Array|NodeList} selector - User-provided selector
     * @return {String} - Valid selector string
     */
    function _normalizeSelector(selector) {
      if (!selector) {
        return 'h1, h2, h3, h4, h5, h6';
      }
      return selector;
    }

    /**
     * Processes all elements to add anchor links.
     * @param {Object} anchorInstance - The AnchorJS instance
     * @param {Array} elements - DOM elements to process
     * @param {Array} idList - Existing IDs on the page
     * @param {String} visibleOptionToUse - Effective visibility setting
     * @return {this} - The AnchorJS instance
     */
    function _processElements(anchorInstance, elements, idList, visibleOptionToUse) {
      var indexesToDrop = [];

      elements = elements.filter(function(el, index) {
        if (anchorInstance.hasAnchorJSLink(el)) {
          indexesToDrop.push(index);
          return false;
        }
        return true;
      });

      elements.forEach(function(el) {
        _processSingleElement(el, idList, anchorInstance, visibleOptionToUse);
      });

      _removeDroppedElements(elements, indexesToDrop);
      anchorInstance.elements = anchorInstance.elements.concat(elements);

      return anchorInstance;
    }

    /**
     * Processes a single element to add an anchor link.
     * @param {HTMLElement} el - DOM element to process
     * @param {Array} idList - Existing IDs on the page
     * @param {Object} anchorInstance - The AnchorJS instance
     * @param {String} visibleOptionToUse - Effective visibility setting
     */
    function _processSingleElement(el, idList, anchorInstance, visibleOptionToUse) {
      var elementID = _getElementId(el, idList, anchorInstance);
      var readableID = elementID.replace(/-/g, ' ');
      var anchor = _buildAnchor(elementID, readableID, anchorInstance, visibleOptionToUse);

      _positionAnchor(anchor, el, anchorInstance.options.placement);
    }

    /**
     * Gets or generates an ID for the element.
     * @param {HTMLElement} el - DOM element
     * @param {Array} idList - Existing IDs on the page
     * @param {Object} anchorInstance - The AnchorJS instance
     * @return {String} - Element ID
     */
    function _getElementId(el, idList, anchorInstance) {
      if (el.hasAttribute('id')) {
        return el.getAttribute('id');
      }

      var tidyText = anchorInstance.urlify(el.textContent);
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

      idList.push(newTidyText);
      el.setAttribute('id', newTidyText);
      return newTidyText;
    }

    /**
     * Builds the anchor DOM element.
     * @param {String} elementID - Element ID to link to
     * @param {String} readableID - Human-readable version of ID
     * @param {Object} anchorInstance - The AnchorJS instance
     * @param {String} visibleOptionToUse - Effective visibility setting
     * @return {HTMLElement} - The anchor element
     */
    function _buildAnchor(elementID, readableID, anchorInstance, visibleOptionToUse) {
      var anchor = document.createElement('a');
      var options = anchorInstance.options;

      anchor.className = 'anchorjs-link ' + options.class;
      anchor.href = '#' + elementID;
      anchor.setAttribute('aria-label', 'Anchor link for: ' + readableID);
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

      return anchor;
    }

    /**
     * Positions the anchor element relative to the heading.
     * @param {HTMLElement} anchor - The anchor element
     * @param {HTMLElement} el - The heading element
     * @param {String} placement - 'left' or 'right'
     */
    function _positionAnchor(anchor, el, placement) {
      if (placement === 'left') {
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
     * Removes elements marked for dropping from the array.
     * @param {Array} elements - Array of elements to filter
     * @param {Array} indexesToDrop - Array of indexes to remove
     */
    function _removeDroppedElements(elements, indexesToDrop) {
      indexesToDrop.forEach(function(dropIndex, offset) {
        elements.splice(dropIndex - offset, 1);
      });
    }

    /**
     * Builds a list of existing IDs on the page.
     * @return {Array} - Array of existing IDs
     */
    function _buildIdList() {
      var elsWithIds = document.querySelectorAll('[id]');
      return [].map.call(elsWithIds, function(el) {
        return el.id;
      });
    }