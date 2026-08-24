FastClick.prototype.onTouchMove = function(event) {
	'use strict';
	if (!this.trackingClick) {
		return true;
	}

	if (this.isTouchOutsideBoundary(event) || this.isTouchTargetChanged(event)) {
		this.cancelTracking();
	}

	return true;
};

FastClick.prototype.isTouchOutsideBoundary = function(event) {
	var touch = event.changedTouches[0];
	var boundary = this.touchBoundary;

	return (
		Math.abs(touch.pageX - this.touchStartX) > boundary ||
		Math.abs(touch.pageY - this.touchStartY) > boundary
	);
};

FastClick.prototype.isTouchTargetChanged = function(event) {
	return this.targetElement !== this.getTargetElementFromEventTarget(event.target);
};

FastClick.prototype.cancelTracking = function() {
	'use strict';
	this.trackingClick = false;
	this.targetElement = null;
};