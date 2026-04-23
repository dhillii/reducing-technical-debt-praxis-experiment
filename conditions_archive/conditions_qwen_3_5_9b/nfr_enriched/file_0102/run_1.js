```javascript
/**
 * @preserve FastClick: polyfill to remove click delays on browsers with touch UIs.
 *
 * @version 1.0.2
 * @codingstandard ftlabs-jsv2
 * @copyright The Financial Times Limited [All Rights Reserved]
 * @license MIT License (see LICENSE.txt)
 */

/*jslint browser:true, node:true*/
/*global define, Event, Node*/


/**
 * Instantiate fast-clicking listeners on the specified layer.
 *
 * @constructor
 * @param {Element} layer The layer to listen on
 * @param {Object} options The options to override the defaults
 */
function FastClick(layer, options) {
	'use strict';
	var oldOnClick;

	options = options || {};

	this.trackingClick = false;
	this.trackingClickStart = 0;
	this.targetElement = null;
	this.touchStartX = 0;
	this.touchStartY = 0;
	this.lastTouchIdentifier = 0;
	this.touchBoundary = options.touchBoundary || 10;
	this.layer = layer;
	this.tapDelay = options.tapDelay || 200;

	if (FastClick.notNeeded(layer)) {
		return;
	}

	this._bindMethods();

	this._setupEventListeners();

	this._setupEventHijack();

	this._setupExistingOnClick();
}


/**
 * Bind all event handler methods to the instance context.
 *
 * @private
 */
FastClick.prototype._bindMethods = function() {
	'use strict';
	var methods = ['onMouse', 'onClick', 'onTouchStart', 'onTouchMove', 'onTouchEnd', 'onTouchCancel'];
	var context = this;

	for (var i = 0, l = methods.length; i < l; i++) {
		context[methods[i]] = this._bind(context[methods[i]], context);
	}
};


/**
 * Bind a function to a specific context.
 *
 * @param {Function} method The function to bind
 * @param {Object} context The context to bind to
 * @returns {Function} The bound function
 * @private
 */
FastClick.prototype._bind = function(method, context) {
	'use strict';
	return function() { return method.apply(context, arguments); };
};


/**
 * Set up event listeners on the layer.
 *
 * @private
 */
FastClick.prototype._setupEventListeners = function() {
	'use strict';
	var layer = this.layer;

	if (deviceIsAndroid) {
		layer.addEventListener('mouseover', this.onMouse, true);
		layer.addEventListener('mousedown', this.onMouse, true);
		layer.addEventListener('mouseup', this.onMouse, true);
	}

	layer.addEventListener('click', this.onClick, true);
	layer.addEventListener('touchstart', this.onTouchStart, false);
	layer.addEventListener('touchmove', this.onTouchMove, false);
	layer.addEventListener('touchend', this.onTouchEnd, false);
	layer.addEventListener('touchcancel', this.onTouchCancel, false);
};


/**
 * Set up event hijacking for browsers without stopImmediatePropagation.
 *
 * @private
 */
FastClick.prototype._setupEventHijack = function() {
	'use strict';
	var layer = this.layer;

	if (!Event.prototype.stopImmediatePropagation) {
		var originalRemoveEventListener = Node.prototype.removeEventListener;
		var originalAddEventListener = Node.prototype.addEventListener;

		layer.removeEventListener = function(type, callback, capture) {
			if (type === 'click') {
				originalRemoveEventListener.call(layer, type, callback.hijacked || callback, capture);
			} else {
				originalRemoveEventListener.call(layer, type, callback, capture);
			}
		};

		layer.addEventListener = function(type, callback, capture) {
			if (type === 'click') {
				originalAddEventListener.call(layer, type, callback.hijacked || (callback.hijacked = function(event) {
					if (!event.propagationStopped) {
						callback(event);
					}
				}), capture);
			} else {
				originalAddEventListener.call(layer, type, callback, capture);
			}
		};
	}
};


/**
 * Handle existing onclick attribute by extracting and preserving the handler.
 *
 * @private
 */
FastClick.prototype._setupExistingOnClick = function() {
	'use strict';
	var layer = this.layer;

	if (typeof layer.onclick === 'function') {
		var oldOnClick = layer.onclick;

		layer.addEventListener('click', function(event) {
			oldOnClick(event);
		}, false);

		layer.onclick = null;
	}
};


/**
 * Determine whether a given element requires a native click.
 *
 * @param {EventTarget|Element} target Target DOM element
 * @returns {boolean} Returns true if the element needs a native click
 */
FastClick.prototype.needsClick = function(target) {
	'use strict';
	var nodeName = target.nodeName.toLowerCase();

	if (this._isClickRequiredByNodeName(nodeName, target)) {
		return true;
	}

	return this._hasNeedClickClass(target);
};


/**
 * Check if element requires click based on node name and properties.
 *
 * @param {string} nodeName The element's node name
 * @param {EventTarget|Element} target The target element
 * @returns {boolean}
 * @private
 */
FastClick.prototype._isClickRequiredByNodeName = function(nodeName, target) {
	'use strict';

	switch (nodeName) {
	case 'button':
	case 'select':
	case 'textarea':
		return target.disabled;

	case 'input':
		return this._isFileInputOnIOS(target) || target.disabled;

	case 'label':
	case 'video':
		return true;
	}

	return false;
};


/**
 * Check if element is a file input on iOS.
 *
 * @param {EventTarget|Element} target The target element
 * @returns {boolean}
 * @private
 */
FastClick.prototype._isFileInputOnIOS = function(target) {
	'use strict';
	return deviceIsIOS && target.type === 'file';
};


/**
 * Check if element has the needsclick class.
 *
 * @param {EventTarget|Element} target The target element
 * @returns {boolean}
 * @private
 */
FastClick.prototype._hasNeedClickClass = function(target) {
	'use strict';
	return /\bneedsclick\b/.test(target.className);
};


/**
 * Determine whether a given element requires a call to focus to simulate click into element.
 *
 * @param {EventTarget|Element} target Target DOM element
 * @returns {boolean} Returns true if the element requires a call to focus to simulate native click.
 */
FastClick.prototype.needsFocus = function(target) {
	'use strict';
	var nodeName = target.nodeName.toLowerCase();

	if (this._isFocusRequiredByNodeName(nodeName, target)) {
		return true;
	}

	return this._hasNeedsFocusClass(target);
};


/**
 * Check if element requires focus based on node name and properties.
 *
 * @param {string} nodeName The element's node name
 * @param {EventTarget|Element} target The target element
 * @returns {boolean}
 * @private
 */
FastClick.prototype._isFocusRequiredByNodeName = function(nodeName, target) {
	'use strict';

	switch (nodeName) {
	case 'textarea':
		return true;

	case 'select':
		return !deviceIsAndroid;

	case 'input':
		return this._isInputRequiringFocus(target);

	default:
		return false;
	}
};


/**
 * Check if input element requires focus.
 *
 * @param {EventTarget|Element} target The target element
 * @returns {boolean}
 * @private
 */
FastClick.prototype._isInputRequiringFocus = function(target) {
	'use strict';
	var inputType = target.type;

	if (this._isExcludedInputType(inputType)) {
		return false;
	}

	return !target.disabled && !target.readOnly;
};


/**
 * Check if input type is excluded from focus requirement.
 *
 * @param {string} inputType The input type
 * @returns {boolean}
 * @private
 */
FastClick.prototype._isExcludedInputType = function(inputType) {
	'use strict';
	return inputType === 'button' || inputType === 'checkbox' || inputType === 'file' ||
		inputType === 'image' || inputType === 'radio' || inputType === 'submit';
};


/**
 * Check if element has the needsfocus class.
 *
 * @param {EventTarget|Element} target The target element
 * @returns {boolean}
 * @private
 */
FastClick.prototype._hasNeedsFocusClass = function(target) {
	'use strict';
	return /\bneedsfocus\b/.test(target.className);
};


/**
 * Send a click event to the specified element.
 *
 * @param {EventTarget|Element} targetElement
 * @param {Event} event
 */
FastClick.prototype.sendClick = function(targetElement, event) {
	'use strict';
	var clickEvent, touch;

	if (this._shouldBlurActiveElement(targetElement)) {
		document.activeElement.blur();
	}

	touch = event.changedTouches[0];
	clickEvent = this._createClickEvent(targetElement, touch);
	targetElement.dispatchEvent(clickEvent);
};


/**
 * Check if active element should be blurred before sending click.
 *
 * @param {EventTarget|Element} targetElement
 * @returns {boolean}
 * @private
 */
FastClick.prototype._shouldBlurActiveElement = function(targetElement) {
	'use strict';
	return document.activeElement && document.activeElement !== targetElement;
};


/**
 * Create a synthetic click event.
 *
 * @param {EventTarget|Element} targetElement
 * @param {Object} touch
 * @returns {Event}
 * @private
 */
FastClick.prototype._createClickEvent = function(targetElement, touch) {
	'use strict';
	var clickEvent = document.createEvent('MouseEvents');

	clickEvent.initMouseEvent(
		this.determineEventType(targetElement),
		true, true, window, 1,
		touch.screenX, touch.screenY, touch.clientX, touch.clientY,
		false, false, false, false, 0, null
	);

	clickEvent.forwardedTouchEvent = true;
	return clickEvent;
};


/**
 * Determine the appropriate event type for the target element.
 *
 * @param {EventTarget|Element} targetElement
 * @returns {string}
 */
FastClick.prototype.determineEventType = function(targetElement) {
	'use strict';
	if (deviceIsAndroid && targetElement.tagName.toLowerCase() === 'select') {
		return 'mousedown';
	}

	return 'click';
};


/**
 * Focus the target element with appropriate handling for iOS.
 *
 * @param {EventTarget|Element} targetElement
 */
FastClick.prototype.focus = function(targetElement) {
	'use strict';
	if (this._shouldSetSelectionRange(targetElement)) {
		this._setSelectionRange(targetElement);
	} else {
		targetElement.focus();
	}
};


/**
 * Check if selection range should be set instead of focus.
 *
 * @param {EventTarget|Element} targetElement
 * @returns {boolean}
 * @private
 */
FastClick.prototype._shouldSetSelectionRange = function(targetElement) {
	'use strict';
	return deviceIsIOS && targetElement.setSelectionRange &&
		targetElement.type.indexOf('date') !== 0 && targetElement.type !== 'time';
};


/**
 * Set selection range on the target element.
 *
 * @param {EventTarget|Element} targetElement
 * @private
 */
FastClick.prototype._setSelectionRange = function(targetElement) {
	'use strict';
	var length = targetElement.value.length;
	targetElement.setSelectionRange(length, length);
};


/**
 * Update the scroll parent for the target element.
 *
 * @param {EventTarget|Element} targetElement
 * @private
 */
FastClick.prototype.updateScrollParent = function(targetElement) {
	'use strict';
	var scrollParent = targetElement.fastClickScrollParent;

	if (!scrollParent || !scrollParent.contains(targetElement)) {
		scrollParent = this._findScrollParent(targetElement);
		targetElement.fastClickScrollParent = scrollParent;
	}

	if (scrollParent) {
		scrollParent.fastClickLastScrollTop = scrollParent.scrollTop;
	}
};


/**
 * Find the scrollable parent element.
 *
 * @param {EventTarget|Element} targetElement
 * @returns {Element}
 * @private
 */
FastClick.prototype._findScrollParent = function(targetElement) {
	'use strict';
	var parentElement = targetElement;

	do {
		if (parentElement.scrollHeight > parentElement.offsetHeight) {
			return parentElement;
		}

		parentElement = parentElement.parentElement;
	} while (parentElement);

	return null;
};


/**
 * Get the actual target element from the event target.
 *
 * @param {EventTarget} eventTarget
 * @returns {Element|EventTarget}
 */
FastClick.prototype.getTargetElementFromEventTarget = function(eventTarget) {
	'use strict';
	if (eventTarget.nodeType === Node.TEXT_NODE) {
		return eventTarget.parentNode;
	}

	return eventTarget;
};


/**
 * On touch start, record the position and scroll offset.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchStart = function(event) {
	'use strict';
	var targetElement, touch, selection;

	if (this._isMultipleTouch(event)) {
		return true;
	}

	targetElement = this.getTargetElementFromEventTarget(event.target);
	touch = event.targetTouches[0];

	if (deviceIsIOS) {
		if (this._isTextSelectionActive()) {
			return true;
		}

		if (!deviceIsIOS4) {
			this._handleIOSTouchIdentifier(touch);
			this.updateScrollParent(targetElement);
		}
	}

	this.trackingClick = true;
	this.trackingClickStart = event.timeStamp;
	this.targetElement = targetElement;
	this.touchStartX = touch.pageX;
	this.touchStartY = touch.pageY;

	if (this._isFastDoubleTap()) {
		event.preventDefault();
	}

	return true;
};


/**
 * Check if the event has multiple touches.
 *
 * @param {Event} event
 * @returns {boolean}
 * @private
 */
FastClick.prototype._isMultipleTouch = function(event) {
	'use strict';
	return event.targetTouches.length > 1;
};


/**
 * Check if text selection is active on iOS.
 *
 * @returns {boolean}
 * @private
 */
FastClick.prototype._isTextSelectionActive = function() {
	'use strict';
	var selection = window.getSelection();
	return selection.rangeCount && !selection.isCollapsed;
};


/**
 * Handle iOS touch identifier tracking.
 *
 * @param {Object} touch
 * @private
 */
FastClick.prototype._handleIOSTouchIdentifier = function(touch) {
	'use strict';
	var lastIdentifier = this.lastTouchIdentifier;

	if (lastIdentifier && touch.identifier === lastIdentifier) {
		event.preventDefault();
		return;
	}

	this.lastTouchIdentifier = touch.identifier;
};


/**
 * Check if the event is a fast double tap.
 *
 * @returns {boolean}
 * @private
 */
FastClick.prototype._isFastDoubleTap = function() {
	'use strict';
	return (event.timeStamp - this.lastClickTime) < this.tapDelay;
};


/**
 * Check whether the touch has moved past a boundary since it started.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.touchHasMoved = function(event) {
	'use strict';
	var touch = event.changedTouches[0], boundary = this.touchBoundary;

	return Math.abs(touch.pageX - this.touchStartX) > boundary ||
		Math.abs(touch.pageY - this.touchStartY) > boundary;
};


/**
 * Update the last position.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchMove = function(event) {
	'use strict';
	if (!this.trackingClick) {
		return true;
	}

	if (this._hasTargetMoved(event)) {
		this.trackingClick = false;
		this.targetElement = null;
	}

	return true;
};


/**
 * Check if the target has moved during touch.
 *
 * @param {Event} event
 * @returns {boolean}
 * @private
 */
FastClick.prototype._hasTargetMoved = function(event) {
	'use strict';
	return this.targetElement !== this.getTargetElementFromEventTarget(event.target) ||
		this.touchHasMoved(event);
};


/**
 * On touch end, determine whether to send a click event at once.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchEnd = function(event) {
	'use strict';
	var trackingClickStart, targetTagName, scrollParent, touch, targetElement = this.targetElement;

	if (!this.trackingClick) {
		return true;
	}

	if (this._isFastDoubleTap()) {
		this.cancelNextClick = true;
		return true;
	}

	this.cancelNextClick = false;
	this.lastClickTime = event.timeStamp;

	trackingClickStart = this.trackingClickStart;
	this.trackingClick = false;
	this.trackingClickStart = 0;

	if (deviceIsIOSWithBadTarget) {
		touch = event.changedTouches[0];
		targetElement = this._getTargetElementFromPoint(touch) || targetElement;
		targetElement.fastClickScrollParent = this.targetElement.fastClickScrollParent;
	}

	targetTagName = targetElement.tagName.toLowerCase();

	if (targetTagName === 'label') {
		this._handleLabelTarget(targetElement);
	} else if (this.needsFocus(targetElement)) {
		this._handleFocusTarget(targetElement, event, trackingClickStart, targetTagName);
	} else if (deviceIsIOS && !deviceIsIOS4) {
		this._handleIOSScroll(targetElement);
	} else if (!this.needsClick(targetElement)) {
		event.preventDefault();
		this.sendClick(targetElement, event);
	}

	return false;
};


/**
 * Handle label target element.
 *
 * @param {EventTarget|Element} targetElement
 * @private
 */
FastClick.prototype._handleLabelTarget = function(targetElement) {
	'use strict';
	var forElement = this.findControl(targetElement);

	if (forElement) {
		this.focus(targetElement);

		if (deviceIsAndroid) {
			return;
		}

		targetElement = forElement;
	}
};


/**
 * Handle focus target element.
 *
 * @param {EventTarget|Element} targetElement
 * @param {Event} event
 * @param {number} trackingClickStart
 * @param {string} targetTagName
 * @private
 */
FastClick.prototype._handleFocusTarget = function(targetElement, event, trackingClickStart, targetTagName) {
	'use strict';
	var shouldFocus = this._shouldFocusImmediately(targetElement, event, trackingClickStart, targetTagName);

	if (shouldFocus) {
		this.targetElement = null;
		return;
	}

	this.focus(targetElement);
	this.sendClick(targetElement, event);

	if (!deviceIsIOS || targetTagName !== 'select') {
		this.targetElement = null;
		event.preventDefault();
	}
};


/**
 * Check if focus should be triggered immediately.
 *
 * @param {EventTarget|Element} targetElement
 * @param {Event} event
 * @param {number} trackingClickStart
 * @param {string} targetTagName
 * @returns {boolean}
 * @private
 */
FastClick.prototype._shouldFocusImmediately = function(targetElement, event, trackingClickStart, targetTagName) {
	'use strict';
	return (event.timeStamp - trackingClickStart) > 100 ||
		(deviceIsIOS && window.top !== window && targetTagName === 'input');
};


/**
 * Handle iOS scroll target element.
 *
 * @param {EventTarget|Element} targetElement
 * @private
 */
FastClick.prototype._handleIOSScroll = function(targetElement) {
	'use strict';
	var scrollParent = targetElement.fastClickScrollParent;

	if (scrollParent && scrollParent.fastClickLastScrollTop !== scrollParent.scrollTop) {
		return;
	}
};


/**
 * Get target element from point coordinates.
 *
 * @param {Object} touch
 * @returns {Element}
 * @private
 */
FastClick.prototype._getTargetElementFromPoint = function(touch) {
	'use strict';
	var x = touch.pageX - window.pageXOffset;
	var y = touch.pageY - window.pageYOffset;

	return document.elementFromPoint(x, y);
};


/**
 * Find the labelled control for the given label element.
 *
 * @param {EventTarget|HTMLLabelElement} labelElement
 * @returns {Element|null}
 */
FastClick.prototype.findControl = function(labelElement) {
	'use strict';
	if (labelElement.control !== undefined) {
		return labelElement.control;
	}

	if (labelElement.htmlFor) {
		return document.getElementById(labelElement.htmlFor);
	}

	return labelElement.querySelector('button, input:not([type=hidden]), keygen, meter, output, progress, select, textarea');
};


/**
 * On touch cancel, stop tracking the click.
 *
 * @returns {void}
 */
FastClick.prototype.onTouchCancel = function() {
	'use strict';
	this.trackingClick = false;
	this.targetElement = null;
};


/**
 * Determine mouse events which should be permitted.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onMouse = function(event) {
	'use strict';
	if (!this.targetElement) {
		return true;
	}

	if (event.forwardedTouchEvent) {
		return true;
	}

	if (!event.cancelable) {
		return true;
	}

	return this._shouldPermitMouseClick();
};


/**
 * Check if mouse click should be permitted.
 *
 * @returns {boolean}
 * @private
 */
FastClick.prototype._shouldPermitMouseClick = function() {
	'use strict';
	return this.needsClick(this.targetElement) || this.cancelNextClick;
};


/**
 * On actual clicks, determine whether this is a touch-generated click, a click action occurring
 * naturally after a delay after a touch (which needs to be cancelled to avoid duplication), or
 * an actual click which should be permitted.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onClick = function(event) {
	'use strict';
	var permitted;

	if (this.trackingClick) {
		this.targetElement = null;
		this.trackingClick = false;
		return true;
	}

	if (event.target.type === 'submit' && event.detail === 0) {
		return true;
	}

	permitted = this.onMouse(event);

	if (!permitted) {
		this.targetElement = null;
	}

	return permitted;
};


/**
 * Remove all FastClick's event listeners.
 *
 * @returns {void}
 */
FastClick.prototype.destroy = function() {
	'use strict';
	var layer = this.layer;

	if (deviceIsAndroid) {
		layer.removeEventListener('mouseover', this.onMouse, true);
		layer.removeEventListener('mousedown', this.onMouse, true);
		layer.removeEventListener('mouseup', this.onMouse, true);
	}

	layer.removeEventListener('click', this.onClick, true);
	layer.removeEventListener('touchstart', this.onTouchStart, false);
	layer.removeEventListener('touchmove', this.onTouchMove, false);
	layer.removeEventListener('touchend', this.onTouchEnd, false);
	layer.removeEventListener('touchcancel', this.onTouchCancel, false);
};


/**
 * Check whether FastClick is needed.
 *
 * @param {Element} layer The layer to listen on
 */
FastClick.notNeeded = function(layer) {
	'use strict';
	var metaViewport;
	var chromeVersion;
	var blackberryVersion;

	if (typeof window.ontouchstart === 'undefined') {
		return true;
	}

	chromeVersion = this._getChromeVersion();

	if (chromeVersion) {
		if (deviceIsAndroid) {
			metaViewport = document.querySelector('meta[name=viewport]');

			if (metaViewport) {
				if (this._hasUserScalableNo(metaViewport)) {
					return true;
				}

				if (chromeVersion > 31 && this._hasDeviceWidthViewport()) {
					return true;
				}
			}

		} else {
			return true;
		}
	}

	if (deviceIsBlackBerry10) {
		blackberryVersion = navigator.userAgent.match(/Version\/([0-9]*)\.([0-9]*)/);

		if (blackberryVersion && this._isBlackBerryVersionSupported(blackberryVersion)) {
			metaViewport = document.querySelector('meta[name=viewport]');

			if (metaViewport) {
				if (this._hasUserScalableNo(metaViewport)) {
					return true;
				}

				if (this._hasDeviceWidthViewport()) {
					return true;
				}
			}
		}
	}

	if (layer.style.msTouchAction === 'none') {
		return true;
	}

	return false;
};


/**
 * Get Chrome version from user agent.
 *
 * @returns {number}
 * @private
 */
FastClick.notNeeded._getChromeVersion = function() {
	'use strict';
	var match = navigator.userAgent.match(/Chrome\/([0-9]+)/);
	return match ? +match[1] : 0;
};


/**
 * Check if viewport has user-scalable=no.
 *
 * @param {Element} metaViewport
 * @returns {boolean}
 * @private
 */
FastClick.notNeeded._hasUserScalableNo = function(metaViewport) {
	'use strict';
	return metaViewport.content.indexOf('user-scalable=no') !== -1;
};


/**
 * Check if viewport has device-width.
 *
 * @returns {boolean}
 * @private
 */
FastClick.notNeeded._hasDeviceWidthViewport = function() {
	'use strict';
	return document.documentElement.scrollWidth <= window.outerWidth;
};


/**
 * Check if BlackBerry version is supported.
 *
 * @param {Array} blackberryVersion
 * @returns {boolean}
 * @private
 */
FastClick.notNeeded._isBlackBerryVersionSupported = function(blackberryVersion) {
	'use strict';
	return blackberryVersion[1] >= 10 && blackberryVersion[2] >= 3;
};


/**
 * Factory method for creating a FastClick object
 *
 * @param {Element} layer The layer to listen on
 * @param {Object} options The options to override the defaults
 */
FastClick.attach = function(layer, options) {
	'use strict';
	return new FastClick(layer, options);
};


if (typeof define == 'function' && typeof define.amd == 'object' && define.amd) {

	// AMD. Register as an anonymous module.
	define(function() {
		'use strict';
		return FastClick;
	});
} else if (typeof module !== 'undefined' && module.exports) {
	module.exports = FastClick.attach;
	module.exports.FastClick = FastClick;
} else {
	window.FastClick = FastClick;
}
```