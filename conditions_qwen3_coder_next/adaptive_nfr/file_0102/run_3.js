FastClick.prototype.onTouchMove = function(event) {
	'use strict';

	if (!this.trackingClick) {
		return true;
	}

	if (!this.isTrackingTarget(event.target) || this.touchHasMoved(event)) {
		this.cancelClickTracking();
	}

	return true;
};

/**
 * Checks if the current touch target matches the tracked target element.
 * @param {EventTarget} target
 * @returns {boolean}
 */
FastClick.prototype.isTrackingTarget = function(target) {
	'use strict';
	return this.targetElement === this.getTargetElementFromEventTarget(target);
};

/**
 * Cancels click tracking state.
 * @returns {void}
 */
FastClick.prototype.cancelClickTracking = function() {
	'use strict';
	this.trackingClick = false;
	this.targetElement = null;
};