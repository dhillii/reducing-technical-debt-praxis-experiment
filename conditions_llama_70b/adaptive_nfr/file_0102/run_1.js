FastClick.prototype.onTouchMove = function(event) {
    'use strict';
    if (!this.trackingClick) {
        return true;
    }

    if (!this.isTouchMoveWithinBoundary(event)) {
        this.cancelClickTracking();
        return true;
    }

    if (!this.isTargetElementStillTheSame(event)) {
        this.cancelClickTracking();
    }

    return true;
};

/**
 * Check if touch move is within the allowed boundary.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.isTouchMoveWithinBoundary = function(event) {
    'use strict';
    var touch = event.changedTouches[0];
    var boundary = this.touchBoundary;

    return !(Math.abs(touch.pageX - this.touchStartX) > boundary || Math.abs(touch.pageY - this.touchStartY) > boundary);
};

/**
 * Check if the target element is still the same.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.isTargetElementStillTheSame = function(event) {
    'use strict';
    return this.targetElement === this.getTargetElementFromEventTarget(event.target);
};

/**
 * Cancel click tracking.
 *
 * @returns {void}
 */
FastClick.prototype.cancelClickTracking = function() {
    'use strict';
    this.trackingClick = false;
    this.targetElement = null;
};