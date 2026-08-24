this.add = function(selector) {
      var elements,
          idList,
          visibleOptionToUse;

      _applyRemainingDefaultOptions(this.options);
      visibleOptionToUse = _normalizeVisibleOption(this.options.visible, this.isTouchDevice());

      if (!selector) {
        selector = DEFAULT_SELECTORS;
      }

      elements = _getElements(selector);
      if (elements.length === 0) {
        return false;
      }

      _addBaselineStyles();
      idList = _buildExistingIdList();

      elements = _processElements(elements, idList, this);
      this.elements = this.elements.concat(elements);

      return this;
    };

    /**
     * Normalizes the 'visible' option based on device type.
     * @param {String} visibleOption - The configured visible option
     * @param {Function} isTouchDeviceCheck - Touch device detection function
     * @return {String} - 'always' or 'hover'
     */
    function _normalizeVisibleOption(visibleOption, isTouchDeviceCheck) {
      if (visibleOption !== 'touch') {
        return visibleOption;
      }
      return isTouchDeviceCheck() ? 'always' : 'hover';
    }

    /**
     * Processes each element to add anchor links.
     * @param {Array} elements - DOM elements to process
     * @param {Array} existingIds - List of current IDs on the page
     * @param {Object} anchorInstance - AnchorJS instance reference
     * @return {Array} - Elements that received anchor links
     */
    function _processElements(elements, existingIds, anchorInstance) {
      var indexesToDrop = [],
          processedElements = [];

      for (var i = 0; i < elements.length; i++) {
        if (anchorInstance.hasAnchorJSLink(elements[i])) {
          indexesToDrop.push(i);
          continue;
        }

        _ensureElementHasId(elements[i], existingIds, anchorInstance);
        _appendAnchorLink(elements[i], anchorInstance);

        processedElements.push(elements[i]);
      }

      _removeSkippedElements(elements, indexesToDrop);

      return processedElements;
    }

    /**
     * Ensures the element has a unique ID, assigning one if necessary.
     * @param {HTMLElement} element - The DOM element to process
     * @param {Array} idList - Existing ID list for uniqueness checks
     * @param {Object} anchorInstance - AnchorJS instance reference
     */
    function _ensureElementHasId(element, idList, anchorInstance) {
      var elementID;

      if (element.hasAttribute('id')) {
        elementID = element.getAttribute('id');
      } else {
        elementID = _generateUniqueID(element.textContent, idList, anchorInstance.options.truncate);
        element.setAttribute('id', elementID);
      }
    }

    /**
     * Generates a unique ID from text content using urlify and deduplication logic.
     * @param {String} text - Text content to convert to ID
     * @param {Array} idList - Existing ID list
     * @param {Number} truncateLength - Max length for ID truncation
     * @return {String} - Unique ID string
     */
    function _generateUniqueID(text, idList, truncateLength) {
      var baseID = truncateLength ? text.trim().toLowerCase().replace(/\'/gi, '').replace(/[& +$,:;=?@"#{}|^~[`%!'\]\.\/\(\)\*\\]/g, '-').replace(/-{2,}/g, '-').substring(0, truncateLength).replace(/^-+|-+$/gm, '') : text.trim().toLowerCase(),
          candidateID = baseID,
          count = 0;

      while (idList.indexOf(candidateID) !== -1) {
        candidateID = baseID + '-' + count;
        count += 1;
      }

      idList.push(candidateID);
      return candidateID;
    }

    /**
     * Appends an anchor link to the given element based on configuration.
     * @param {HTMLElement} element - DOM element to attach the anchor to
     * @param {Object} instanceOptions - Current AnchorJS instance options
     */
    function _appendAnchorLink(element, instanceOptions) {
      var anchor = document.createElement('a'),
          readableID = element.id.replace(/-/g, ' ');

      anchor.className = 'anchorjs-link ' + instanceOptions.class;
      anchor.href = '#' + element.id;
      anchor.setAttribute('aria-label', 'Anchor link for: ' + readableID);
      anchor.setAttribute('data-anchorjs-icon', instanceOptions.icon);

      _applyVisibilityStyles(anchor, instanceOptions.visible);
      _applyFloatingStyles(anchor, instanceOptions.placement);

      if (instanceOptions.placement === 'left') {
        element.insertBefore(anchor, element.firstChild);
      } else {
        element.appendChild(anchor);
      }
    }

    /**
     * Applies visibility (opacity) styles to the anchor.
     * @param {HTMLElement} anchor - The anchor element
     * @param {String} visibleMode - 'always' or 'hover'
     */
    function _applyVisibilityStyles(anchor, visibleMode) {
      if (visibleMode === 'always') {
        anchor.style.opacity = '1';
      } else {
        anchor.style.opacity = '0';
      }
    }

    /**
     * Applies positioning and spacing styles for the anchor.
     * @param {HTMLElement} anchor - The anchor element
     * @param {String} placement - 'left' or 'right'
     */
    function _applyFloatingStyles(anchor, placement) {
      if (placement === 'left') {
        anchor.style.position = 'absolute';
        anchor.style.marginLeft = '-1em';
        anchor.style.paddingRight = '0.5em';
      } else {
        anchor.style.paddingLeft = '0.375em';
      }

      if (placement === 'left' && anchor.style.font !== undefined) {
        anchor.style.lineHeight = 'inherit';
      }
    }

    /**
     * Removes elements from input array that were skipped during processing.
     * @param {Array} elements - Original element array
     * @param {Array} indexesToDrop - Array of indexes to remove
     */
    function _removeSkippedElements(elements, indexesToDrop) {
      for (var i = 0; i < indexesToDrop.length; i++) {
        elements.splice(indexesToDrop[i] - i, 1);
      }
    }

    /**
     * Builds an array of existing IDs from the document for uniqueness checks.
     * @return {Array} - Array of existing ID strings
     */
    function _buildExistingIdList() {
      var existingElements = document.querySelectorAll('[id]');
      return [].map.call(existingElements, function(el) {
        return el.id;
      });
    }

    var DEFAULT_SELECTORS = 'h1, h2, h3, h4, h5, h6';