FastClick.prototype.onTouchMove = function(event) {
    'use strict';
    if (!this.trackingClick) {
        return true;
    }

    if (!this.isTouchMoveValid(event)) {
        this.cancelClickTracking();
        return true;
    }

    return true;
};

/**
 * Check if touch move is valid.
 * 
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.isTouchMoveValid = function(event) {
    'use strict';
    return this.targetElement === this.getTargetElementFromEventTarget(event.target) && !this.touchHasMoved(event);
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