FastClick.prototype.onTouchMove = function(event) {
    'use strict';
    if (!this.trackingClick) {
        return true;
    }

    if (!this.isTargetElementValid(event)) {
        this.cancelClickTracking();
        return true;
    }

    if (this.hasTouchMoved(event)) {
        this.cancelClickTracking();
    }

    return true;
};

/**
 * Check if the target element is valid.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.isTargetElementValid = function(event) {
    'use strict';
    return this.targetElement === this.getTargetElementFromEventTarget(event.target);
};

/**
 * Check if the touch has moved.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.hasTouchMoved = function(event) {
    'use strict';
    var touch = event.changedTouches[0], boundary = this.touchBoundary;
    return Math.abs(touch.pageX - this.touchStartX) > boundary || Math.abs(touch.pageY - this.touchStartY) > boundary;
};

/**
 * Cancel the click tracking.
 *
 * @returns {void}
 */
FastClick.prototype.cancelClickTracking = function() {
    'use strict';
    this.trackingClick = false;
    this.targetElement = null;
};