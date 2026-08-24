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
        if (shouldSkipElement(elements[i])) {
          indexesToDrop.push(i);
          continue;
        }

        if (hasIdAttribute(elements[i])) {
          elementID = elements[i].getAttribute('id');
        } else {
          elementID = generateUniqueID(elements[i], idList);
        }

        readableID = elementID.replace(/-/g, ' ');
        anchor = buildAnchor(elementID, readableID, visibleOptionToUse);

        insertAnchor(anchor, elements[i]);
      }

      for (i = 0; i < indexesToDrop.length; i++) {
        elements.splice(indexesToDrop[i] - i, 1);
      }
      this.elements = this.elements.concat(elements);

      return this;
    };

    /**
     * Determines if an element should be skipped during anchor link addition.
     * @param    {HTMLElement}  el - a DOM node
     * @return   {Boolean}     true if element already has an anchor link
     */
    function shouldSkipElement(el) {
      return this.hasAnchorJSLink(el);
    }

    /**
     * Checks if the element has an id attribute.
     * @param    {HTMLElement}  el - a DOM node
     * @return   {Boolean}     true if element has id attribute
     */
    function hasIdAttribute(el) {
      return el.hasAttribute('id');
    }

    /**
     * Generates a unique ID for the element based on text content.
     * @param    {HTMLElement}  element - a DOM node
     * @param    {Array}        idList  - existing ID list to avoid duplicates
     * @return   {String}         unique ID string
     */
    function generateUniqueID(element, idList) {
      var tidyText = this.urlify(element.textContent);
      var newTidyText = tidyText;
      var count = 0;
      var index;

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
      return newTidyText;
    }

    /**
     * Builds an anchor element with appropriate attributes and styles.
     * @param    {String}  elementID       - the ID to link to
     * @param    {String}  readableID      - human-readable version of the ID
     * @param    {String}  visibleOption   - visibility mode ('always' or 'hover')
     * @return   {HTMLElement}             the constructed anchor element
     */
    function buildAnchor(elementID, readableID, visibleOption) {
      var anchor = document.createElement('a');
      var icon = this.options.icon;
      var className = 'anchorjs-link ' + this.options.class;

      anchor.className = className;
      anchor.href = '#' + elementID;
      anchor.setAttribute('aria-label', 'Anchor link for: ' + readableID);
      anchor.setAttribute('data-anchorjs-icon', icon);

      if (visibleOption === 'always') {
        anchor.style.opacity = '1';
      }

      if (icon === '\ue9cb') {
        anchor.style.font = '1em/1 anchorjs-icons';

        if (this.options.placement === 'left') {
          anchor.style.lineHeight = 'inherit';
        }
      }

      return anchor;
    }

    /**
     * Inserts the anchor element into the DOM relative to the target element.
     * @param    {HTMLElement}  anchor    - the anchor element to insert
     * @param    {HTMLElement}  element   - the target element to insert into
     */
    function insertAnchor(anchor, element) {
      if (this.options.placement === 'left') {
        anchor.style.position = 'absolute';
        anchor.style.marginLeft = '-1em';
        anchor.style.paddingRight = '0.5em';
        element.insertBefore(anchor, element.firstChild);
      } else {
        anchor.style.paddingLeft = '0.375em';
        element.appendChild(anchor);
      }
    }