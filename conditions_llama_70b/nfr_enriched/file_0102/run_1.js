FastClick.prototype.onTouchMove = function(event) {
    'use strict';
    if (!this.trackingClick) {
        return this.handleNonTrackingClick(event);
    }

    return this.handleTrackingClick(event);
};

FastClick.prototype.handleNonTrackingClick = function(event) {
    // If not tracking a click, do nothing and allow the event to propagate
    return true;
};

FastClick.prototype.handleTrackingClick = function(event) {
    // If the touch has moved, cancel the click tracking
    if (this.targetElement !== this.getTargetElementFromEventTarget(event.target) || this.touchHasMoved(event)) {
        this.trackingClick = false;
        this.targetElement = null;
    }

    return true;
};