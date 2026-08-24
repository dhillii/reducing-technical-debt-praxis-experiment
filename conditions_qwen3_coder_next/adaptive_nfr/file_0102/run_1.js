FastClick.prototype.onTouchMove = function(event) {
	'use strict';

	// Skip processing if not tracking a click
	if (!this.trackingClick) {
		return true;
	}

	// Cancel tracking if touch moved outside boundaries or target changed
	if (this.hasTouchMoved(event) || this.hasTargetChanged(event)) {
		this.cancelTracking();
	}

	return true;
};

/**
 * Check if the touch has moved beyond the defined boundary.
 * @param {Event} event - Touch move event
 * @returns {boolean}
 */
FastClick.prototype.hasTouchMoved = function(event) {
	'use strict';
	var touch = event.changedTouches[0];
	var boundary = this.touchBoundary;

	return Math.abs(touch.pageX - this.touchStartX) > boundary ||
	       Math.abs(touch.pageY - this.touchStartY) > boundary;
};

/**
 * Check if the touch target element has changed.
 * @param {Event} event - Touch move event
 * @returns {boolean}
 */
FastClick.prototype.hasTargetChanged = function(event) {
	'use strict';
	return this.targetElement !== this.getTargetElementFromEventTarget(event.target);
};

/**
 * Cancel current click tracking state.
 * @returns {void}
 */
FastClick.prototype.cancelTracking = function() {
	'use strict';
	this.trackingClick = false;
	this.targetElement = null;
};