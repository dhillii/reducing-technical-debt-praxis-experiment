/**
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchMove = function(event) {
	'use strict';
	if (!this.trackingClick) {
		return true;
	}

	if (this.hasMoveViolation(event)) {
		this.cancelTracking();
	}

	return true;
};

/**
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.hasMoveViolation = function(event) {
	'use strict';
	var moved = this.touchHasMoved(event);
	var targetChanged = this.targetElement !== this.getTargetElementFromEventTarget(event.target);

	return moved || targetChanged;
};

/**
 * @returns {void}
 */
FastClick.prototype.cancelTracking = function() {
	'use strict';
	this.trackingClick = false;
	this.targetElement = null;
};