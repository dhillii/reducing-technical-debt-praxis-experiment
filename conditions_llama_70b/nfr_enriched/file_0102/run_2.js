FastClick.prototype.onTouchMove = function(event) {
    'use strict';
    if (!this.trackingClick) {
        return this.cancelEvent(event);
    }

    if (this.targetElement !== this.getTargetElementFromEventTarget(event.target) || this.touchHasMoved(event)) {
        this.trackingClick = false;
        this.targetElement = null;
    }

    return this.cancelEvent(event);
};

FastClick.prototype.cancelEvent = function(event) {
    // Prevent phantom clicks on fast double-tap
    event.preventDefault();
    return true;
};