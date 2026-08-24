/**
 * Check if the tracking click has not been initiated.
 *
 * @param {FastClick} instance The FastClick instance
 * @returns {boolean}
 */
function isNotTrackingClick(instance) {
	return !instance.trackingClick;
}

/**
 * Check if the touch move has exceeded the defined boundary.
 *
 * @param {FastClick} instance The FastClick instance
 * @param {Event} event The touchmove event
 * @returns {boolean}
 */
function touchHasMovedBoundary(instance, event) {
	var touch = event.changedTouches[0];
	var boundary = instance.touchBoundary;

	return Math.abs(touch.pageX - instance.touchStartX) > boundary ||
		Math.abs(touch.pageY - instance.touchStartY) > boundary;
}

/**
 * Check if the target element has changed during touchmove.
 *
 * @param {FastClick} instance The FastClick instance
 * @param {Event} event The touchmove event
 * @returns {boolean}
 */
function targetElementChanged(instance, event) {
	return instance.targetElement !== instance.getTargetElementFromEventTarget(event.target);
}

/**
 * Handle touchmove event to cancel click tracking when necessary.
 *
 * @param {Event} event The touchmove event
 * @returns {boolean}
 */
FastClick.prototype.onTouchMove = function(event) {
	'use strict';
	if (isNotTrackingClick(this)) {
		return true;
	}

	if (targetElementChanged(this, event) || touchHasMovedBoundary(this, event)) {
		this.trackingClick = false;
		this.targetElement = null;
	}

	return true;
};