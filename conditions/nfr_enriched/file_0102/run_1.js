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

	/**
	 * Whether a click is currently being tracked.
	 *
	 * @type boolean
	 */
	this.trackingClick = false;


	/**
	 * Timestamp for when click tracking started.
	 *
	 * @type number
	 */
	this.trackingClickStart = 0;


	/**
	 * The element being tracked for a click.
	 *
	 * @type EventTarget
	 */
	this.targetElement = null;


	/**
	 * X-coordinate of touch start event.
	 *
	 * @type number
	 */
	this.touchStartX = 0;


	/**
	 * Y-coordinate of touch start event.
	 *
	 * @type number
	 */
	this.touchStartY = 0;


	/**
	 * ID of the last touch, retrieved from Touch.identifier.
	 *
	 * @type number
	 */
	this.lastTouchIdentifier = 0;


	/**
	 * Touchmove boundary, beyond which a click will be cancelled.
	 *
	 * @type number
	 */
	this.touchBoundary = options.touchBoundary || 10;


	/**
	 * The FastClick layer.
	 *
	 * @type Element
	 */
	this.layer = layer;

	/**
	 * The minimum time between tap(touchstart and touchend) events
	 *
	 * @type number
	 */
	this.tapDelay = options.tapDelay || 200;

	if (FastClick.notNeeded(layer)) {
		return;
	}

	this.initializeEventHandlers();
	this.setupEventListeners();
	this.setupEventInterception();
	this.migrateOnClickHandler();
}


/**
 * Android requires exceptions.
 *
 * @type boolean
 */
var deviceIsAndroid = navigator.userAgent.indexOf('Android') > 0;


/**
 * iOS requires exceptions.
 *
 * @type boolean
 */
var deviceIsIOS = /iP(ad|hone|od)/.test(navigator.userAgent);


/**
 * iOS 4 requires an exception for select elements.
 *
 * @type boolean
 */
var deviceIsIOS4 = deviceIsIOS && (/OS 4_\d(_\d)?/).test(navigator.userAgent);


/**
 * iOS 6.0(+?) requires the target element to be manually derived
 *
 * @type boolean
 */
var deviceIsIOSWithBadTarget = deviceIsIOS && (/OS ([6-9]|\d{2})_\d/).test(navigator.userAgent);

/**
 * BlackBerry requires exceptions.
 *
 * @type boolean
 */
var deviceIsBlackBerry10 = navigator.userAgent.indexOf('BB10') > 0;


/**
 * Bind a method to a context. Polyfill for older Android versions.
 *
 * @param {Function} method The method to bind
 * @param {Object} context The context to bind to
 * @returns {Function} The bound function
 */
function bind(method, context) {
	return function() { return method.apply(context, arguments); };
}


/**
 * Initialize event handler bindings.
 */
FastClick.prototype.initializeEventHandlers = function() {
	'use strict';
	var methods = ['onMouse', 'onClick', 'onTouchStart', 'onTouchMove', 'onTouchEnd', 'onTouchCancel'];
	var context = this;
	for (var i = 0, l = methods.length; i < l; i++) {
		context[methods[i]] = bind(context[methods[i]], context);
	}
};


/**
 * Setup event listeners on the layer.
 */
FastClick.prototype.setupEventListeners = function() {
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
 * Setup event interception for browsers without stopImmediatePropagation support.
 */
FastClick.prototype.setupEventInterception = function() {
	'use strict';
	var layer = this.layer;

	if (!Event.prototype.stopImmediatePropagation) {
		layer.removeEventListener = function(type, callback, capture) {
			var rmv = Node.prototype.removeEventListener;
			if (type === 'click') {
				rmv.call(layer, type, callback.hijacked || callback, capture);
			} else {
				rmv.call(layer, type, callback, capture);
			}
		};

		layer.addEventListener = function(type, callback, capture) {
			var adv = Node.prototype.addEventListener;
			if (type === 'click') {
				adv.call(layer, type, callback.hijacked || (callback.hijacked = function(event) {
					if (!event.propagationStopped) {
						callback(event);
					}
				}), capture);
			} else {
				adv.call(layer, type, callback, capture);
			}
		};
	}
};


/**
 * Migrate onclick handler from element attribute to event listener.
 */
FastClick.prototype.migrateOnClickHandler = function() {
	'use strict';
	var layer = this.layer;
	var oldOnClick;

	if (typeof layer.onclick === 'function') {
		oldOnClick = layer.onclick;
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
	switch (target.nodeName.toLowerCase()) {

	// Don't send a synthetic click to disabled inputs (issue #62)
	case 'button':
	case 'select':
	case 'textarea':
		if (target.disabled) {
			return true;
		}

		break;
	case 'input':

		// File inputs need real clicks on iOS 6 due to a browser bug (issue #68)
		if ((deviceIsIOS && target.type === 'file') || target.disabled) {
			return true;
		}

		break;
	case 'label':
	case 'video':
		return true;
	}

	return (/\bneedsclick\b/).test(target.className);
};


/**
 * Determine whether a given element requires a call to focus to simulate click into element.
 *
 * @param {EventTarget|Element} target Target DOM element
 * @returns {boolean} Returns true if the element requires a call to focus to simulate native click.
 */
FastClick.prototype.needsFocus = function(target) {
	'use strict';
	switch (target.nodeName.toLowerCase()) {
	case 'textarea':
		return true;
	case 'select':
		return !deviceIsAndroid;
	case 'input':
		switch (target.type) {
		case 'button':
		case 'checkbox':
		case 'file':
		case 'image':
		case 'radio':
		case 'submit':
			return false;
		}

		// No point in attempting to focus disabled inputs
		return !target.disabled && !target.readOnly;
	default:
		return (/\bneedsfocus\b/).test(target.className);
	}
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

	// On some Android devices activeElement needs to be blurred otherwise the synthetic click will have no effect (#24)
	if (document.activeElement && document.activeElement !== targetElement) {
		document.activeElement.blur();
	}

	touch = event.changedTouches[0];

	// Synthesise a click event, with an extra attribute so it can be tracked
	clickEvent = document.createEvent('MouseEvents');
	clickEvent.initMouseEvent(this.determineEventType(targetElement), true, true, window, 1, touch.screenX, touch.screenY, touch.clientX, touch.clientY, false, false, false, false, 0, null);
	clickEvent.forwardedTouchEvent = true;
	targetElement.dispatchEvent(clickEvent);
};

/**
 * Determine the appropriate event type for the target element.
 *
 * @param {EventTarget|Element} targetElement
 * @returns {string} The event type name
 */
FastClick.prototype.determineEventType = function(targetElement) {
	'use strict';

	//Issue #159: Android Chrome Select Box does not open with a synthetic click event
	if (deviceIsAndroid && targetElement.tagName.toLowerCase() === 'select') {
		return 'mousedown';
	}

	return 'click';
};


/**
 * Focus the target element with appropriate handling for different input types.
 *
 * @param {EventTarget|Element} targetElement
 */
FastClick.prototype.focus = function(targetElement) {
	'use strict';
	var length;

	// Issue #160: on iOS 7, some input elements (e.g. date datetime) throw a vague TypeError on setSelectionRange. These elements don't have an integer value for the selectionStart and selectionEnd properties, but unfortunately that can't be used for detection because accessing the properties also throws a TypeError. Just check the type instead. Filed as Apple bug #15122724.
	if (deviceIsIOS && targetElement.setSelectionRange && targetElement.type.indexOf('date') !== 0 && targetElement.type !== 'time') {
		length = targetElement.value.length;
		targetElement.setSelectionRange(length, length);
	} else {
		targetElement.focus();
	}
};


/**
 * Check whether the given target element is a child of a scrollable layer and if so, set a flag on it.
 *
 * @param {EventTarget|Element} targetElement
 */
FastClick.prototype.updateScrollParent = function(targetElement) {
	'use strict';
	var scrollParent, parentElement;

	scrollParent = targetElement.fastClickScrollParent;

	// Attempt to discover whether the target element is contained within a scrollable layer. Re-check if the
	// target element was moved to another parent.
	if (!scrollParent || !scrollParent.contains(targetElement)) {
		parentElement = targetElement;
		do {
			if (parentElement.scrollHeight > parentElement.offsetHeight) {
				scrollParent = parentElement;
				targetElement.fastClickScrollParent = parentElement;
				break;
			}

			parentElement = parentElement.parentElement;
		} while (parentElement);
	}

	// Always update the scroll top tracker if possible.
	if (scrollParent) {
		scrollParent.fastClickLastScrollTop = scrollParent.scrollTop;
	}
};


/**
 * Get the target element from an event target, handling text nodes.
 *
 * @param {EventTarget} targetElement
 * @returns {Element|EventTarget}
 */
FastClick.prototype.getTargetElementFromEventTarget = function(eventTarget) {
	'use strict';

	// On some older browsers (notably Safari on iOS 4.1 - see issue #56) the event target may be a text node.
	if (eventTarget.nodeType === Node.TEXT_NODE) {
		return eventTarget.parentNode;
	}

	return eventTarget;
};


/**
 * Check if touch tracking should be cancelled based on iOS selection state.
 *
 * @returns {boolean} True if tracking should be cancelled
 */
FastClick.prototype.shouldCancelTrackingForIOSSelection = function() {
	'use strict';
	if (!deviceIsIOS) {
		return false;
	}

	var selection = window.getSelection();
	return selection.rangeCount && !selection.isCollapsed;
};


/**
 * Handle duplicate touch identifier on iOS (issue #52).
 *
 * @param {Touch} touch The touch object
 * @param {Event} event The touch event
 * @returns {boolean} True if event should continue, false if prevented
 */
FastClick.prototype.handleDuplicateTouchIdentifier = function(touch, event) {
	'use strict';
	if (deviceIsIOS4) {
		return true;
	}

	if (touch.identifier === this.lastTouchIdentifier) {
		event.preventDefault();
		return false;
	}

	this.lastTouchIdentifier = touch.identifier;
	return true;
};


/**
 * On touch start, record the position and scroll offset.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchStart = function(event) {
	'use strict';
	var targetElement, touch;

	// Ignore multiple touches, otherwise pinch-to-zoom is prevented if both fingers are on the FastClick element (issue #111).
	if (event.targetTouches.length > 1) {
		return true;
	}

	targetElement = this.getTargetElementFromEventTarget(event.target);
	touch = event.targetTouches[0];

	if (this.shouldCancelTrackingForIOSSelection()) {
		return true;
	}

	if (!this.handleDuplicateTouchIdentifier(touch, event)) {
		return false;
	}

	if (deviceIsIOS && !deviceIsIOS4) {
		this.updateScrollParent(targetElement);
	}

	this.trackingClick = true;
	this.trackingClickStart = event.timeStamp;
	this.targetElement = targetElement;

	this.touchStartX = touch.pageX;
	this.touchStartY = touch.pageY;

	// Prevent phantom clicks on fast double-tap (issue #36)
	if ((event.timeStamp - this.lastClickTime) < this.tapDelay) {
		event.preventDefault();
	}

	return true;
};


/**
 * Based on a touchmove event object, check whether the touch has moved past a boundary since it started.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.touchHasMoved = function(event) {
	'use strict';
	var touch = event.changedTouches[0], boundary = this.touchBoundary;

	if (Math.abs(touch.pageX - this.touchStartX) > boundary || Math.abs(touch.pageY - this.touchStartY) > boundary) {
		return true;
	}

	return false;
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

	// If the touch has moved, cancel the click tracking
	if (this.targetElement !== this.getTargetElementFromEventTarget(event.target) || this.touchHasMoved(event)) {
		this.trackingClick = false;
		this.targetElement = null;
	}

	return true;
};


/**
 * Attempt to find the labelled control for the given label element.
 *
 * @param {EventTarget|HTMLLabelElement} labelElement
 * @returns {Element|null}
 */
FastClick.prototype.findControl = function(labelElement) {
	'use strict';

	// Fast path for newer browsers supporting the HTML5 control attribute
	if (labelElement.control !== undefined) {
		return labelElement.control;
	}

	// All browsers under test that support touch events also support the HTML5 htmlFor attribute
	if (labelElement.htmlFor) {
		return document.getElementById(labelElement.htmlFor);
	}

	// If no for attribute exists, attempt to retrieve the first labellable descendant element
	// the list of which is defined here: http://www.w3.org/TR/html5/forms.html#category-label
	return labelElement.querySelector('button, input:not([type=hidden]), keygen, meter, output, progress, select, textarea');
};


/**
 * Handle label element click by focusing the associated control.
 *
 * @param {Element} targetElement The label element
 * @returns {Element|null} The control element or null
 */
FastClick.prototype.handleLabelClick = function(targetElement) {
	'use strict';
	var forElement = this.findControl(targetElement);
	if (forElement) {
		this.focus(targetElement);
		if (deviceIsAndroid) {
			return null;
		}
		return forElement;
	}
	return null;
};


/**
 * Determine if the event should be prevented based on timing and device.
 *
 * @param {Event} event The touch event
 * @param {number} trackingClickStart The tracking start timestamp
 * @param {string} targetTagName The target element tag name
 * @returns {boolean} True if event should be prevented
 */
FastClick.prototype.shouldPreventEventForTiming = function(event, trackingClickStart, targetTagName) {
	'use strict';
	if ((event.timeStamp - trackingClickStart) > 100) {
		return true;
	}

	if (deviceIsIOS && window.top !== window && targetTagName === 'input') {
		return true;
	}

	return false;
};


/**
 * Handle focus-required element on touch end.
 *
 * @param {Element} targetElement The target element
 * @param {Event} event The touch event
 * @param {number} trackingClickStart The tracking start timestamp
 * @returns {boolean} True if event was handled
 */
FastClick.prototype.handleFocusElement = function(targetElement, event, trackingClickStart) {
	'use strict';
	var targetTagName = targetElement.tagName.toLowerCase();

	if (this.shouldPreventEventForTiming(event, trackingClickStart, targetTagName)) {
		this.targetElement = null;
		return false;
	}

	this.focus(targetElement);
	this.sendClick(targetElement, event);

	// Select elements need the event to go through on iOS 4, otherwise the selector menu won't open.
	// Also this breaks opening selects when VoiceOver is active on iOS6, iOS7 (and possibly others)
	if (!deviceIsIOS || targetTagName !== 'select') {
		this.targetElement = null;
		event.preventDefault();
	}

	return false;
};


/**
 * Check if scrolling occurred on the scroll parent.
 *
 * @param {Element} targetElement The target element
 * @returns {boolean} True if scrolling occurred
 */
FastClick.prototype.hasScrollParentScrolled = function(targetElement) {
	'use strict';
	if (deviceIsIOS && !deviceIsIOS4) {
		var scrollParent = targetElement.fastClickScrollParent;
		if (scrollParent && scrollParent.fastClickLastScrollTop !== scrollParent.scrollTop) {
			return true;
		}
	}
	return false;
};


/**
 * Redetect target element on iOS with bad target support.
 *
 * @param {Event} event The touch event
 * @returns {Element} The redetected target element
 */
FastClick.prototype.redetectTargetElement = function(event) {
	'use strict';
	var touch = event.changedTouches[0];
	var targetElement = document.elementFromPoint(touch.pageX - window.pageXOffset, touch.pageY - window.pageYOffset) || this.targetElement;
	targetElement.fastClickScrollParent = this.targetElement.fastClickScrollParent;
	return targetElement;
};


/**
 * On touch end, determine whether to send a click event at once.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchEnd = function(event) {
	'use strict';
	var trackingClickStart, targetTagName, targetElement = this.targetElement;

	if (!this.trackingClick) {
		return true;
	}

	// Prevent phantom clicks on fast double-tap (issue #36)
	if ((event.timeStamp - this.lastClickTime) < this.tapDelay) {
		this.cancelNextClick = true;
		return true;
	}

	// Reset to prevent wrong click cancel on input (issue #156).
	this.cancelNextClick = false;

	this.lastClickTime = event.timeStamp;

	trackingClickStart = this.trackingClickStart;
	this.trackingClick = false;
	this.trackingClickStart = 0;

	// On some iOS devices, the targetElement supplied with the event is invalid if the layer
	// is performing a transition or scroll, and has to be re-detected manually. Note that
	// for this to function correctly, it must be called *after* the event target is checked!
	// See issue #57; also filed as rdar://13048589 .
	if (deviceIsIOSWithBadTarget) {
		targetElement = this.redetectTargetElement(event);
	}

	targetTagName = targetElement.tagName.toLowerCase();
	if (targetTagName === 'label') {
		var forElement = this.handleLabelClick(targetElement);
		if (forElement) {
			targetElement = forElement;
		}
	} else if (this.needsFocus(targetElement)) {
		return this.handleFocusElement(targetElement, event, trackingClickStart);
	}

	if (this.hasScrollParentScrolled(targetElement)) {
		return true;
	}

	// Prevent the actual click from going though - unless the target element is marked as requiring
	// real clicks or if it is in the whitelist in which case only non-programmatic clicks are permitted.
	if (!this.needsClick(targetElement)) {
		event.preventDefault();
		this.sendClick(targetElement, event);
	}

	return false;
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
 * Determine if mouse event should be prevented.
 *
 * @param {Event} event The mouse event
 * @returns {boolean} True if event should be prevented
 */
FastClick.prototype.shouldPreventMouseEvent = function(event) {
	'use strict';
	if (!this.needsClick(this.targetElement) || this.cancelNextClick) {
		return true;
	}
	return false;
};


/**
 * Stop event propagation with fallback for older browsers.
 *
 * @param {Event} event The event to stop
 */
FastClick.prototype.stopEventPropagation = function(event) {
	'use strict';
	if (event.stopImmediatePropagation) {
		event.stopImmediatePropagation();
	} else {
		// Part of the hack for browsers that don't support Event#stopImmediatePropagation (e.g. Android 2)
		event.propagationStopped = true;
	}

	event.stopPropagation();
	event.preventDefault();
};


/**
 * Determine mouse events which should be permitted.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onMouse = function(event) {
	'use strict';

	// If a target element was never set (because a touch event was never fired) allow the event
	if (!this.targetElement) {
		return true;
	}

	if (event.forwardedTouchEvent) {
		return true;
	}

	// Programmatically generated events targeting a specific element should be permitted
	if (!event.cancelable) {
		return true;
	}

	// Derive and check the target element to see whether the mouse event needs to be permitted;
	// unless explicitly enabled, prevent non-touch click events from triggering actions,
	// to prevent ghost/doubleclicks.
	if (this.shouldPreventMouseEvent(event)) {
		this.stopEventPropagation(event);
		return false;
	}

	// If the mouse event is permitted, return true for the action to go through.
	return true;
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

	// It's possible for another FastClick-like library delivered with third-party code to fire a click event before FastClick does (issue #44). In that case, set the click-tracking flag back to false and return early. This will cause onTouchEnd to return early.
	if (this.trackingClick) {
		this.targetElement = null;
		this.trackingClick = false;
		return true;
	}

	// Very odd behaviour on iOS (issue #18): if a submit element is present inside a form and the user hits enter in the iOS simulator or clicks the Go button on the pop-up OS keyboard the a kind of 'fake' click event will be triggered with the submit-type input element as the target.
	if (event.target.type === 'submit' && event.detail === 0) {
		return true;
	}

	permitted = this.onMouse(event);

	// Only unset targetElement if the click is not permitted. This will ensure that the check for !targetElement in onMouse fails and the browser's click doesn't go through.
	if (!permitted) {
		this.targetElement = null;
	}

	// If clicks are permitted, return true for the action to go through.
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
 * Check Chrome version from user agent.
 *
 * @returns {number} Chrome version or 0 for other browsers
 */
function getChromeVersion() {
	'use strict';
	return +(/Chrome\/([0-9]+)/.exec(navigator.userAgent) || [,0])[1];
}


/**
 * Check if Chrome on Android needs FastClick.
 *
 * @param {number} chromeVersion The Chrome version
 * @returns {boolean} True if FastClick is not needed
 */
function shouldSkipChromeAndroid(chromeVersion) {
	'use strict';
	var metaViewport = document.querySelector('meta[name=viewport]');

	if (!metaViewport) {
		return false;
	}

	// Chrome on Android with user-scalable="no" doesn't need FastClick (issue #89)
	if (metaViewport.content.indexOf('user-scalable=no') !== -1) {
		return true;
	}

	// Chrome 32 and above with width=device-width or less don't need FastClick
	if (chromeVersion > 31 && document.documentElement.scrollWidth <= window.outerWidth) {
		return true;
	}

	return false;
}


/**
 * Check if BlackBerry 10.3+ needs FastClick.
 *
 * @returns {boolean} True if FastClick is not needed
 */
function shouldSkipBlackBerry10() {
	'use strict';
	var blackberryVersion = navigator.userAgent.match(/Version\/([0-9]*)\.([0-9]*)/);

	if (!blackberryVersion || blackberryVersion[1] < 10 || blackberryVersion[2] < 3) {
		return false;
	}

	var metaViewport = document.querySelector('meta[name=viewport]');

	if (!metaViewport) {
		return false;
	}

	// user-scalable=no eliminates click delay.
	if (metaViewport.content.indexOf('user-scalable=no') !== -1) {
		return true;
	}

	// width=device-width (or less than device-width) eliminates click delay.
	if (document.documentElement.scrollWidth <= window.outerWidth) {
		return true;
	}

	return false;
}


/**
 * Check whether FastClick is needed.
 *
 * @param {Element} layer The layer to listen on
 * @returns {boolean} True if FastClick is not needed
 */
FastClick.notNeeded = function(layer) {
	'use strict';
	var chromeVersion;

	// Devices that don't support touch don't need FastClick
	if (typeof window.ontouchstart === 'undefined') {
		return true;
	}

	// Chrome version - zero for other browsers
	chromeVersion = getChromeVersion();

	if (chromeVersion) {
		if (deviceIsAndroid) {
			return shouldSkipChromeAndroid(chromeVersion);
		}

		// Chrome desktop doesn't need FastClick (issue #15)
		return true;
	}

	if (deviceIsBlackBerry10) {
		return shouldSkipBlackBerry10();
	}

	// IE10 with -ms-touch-action: none, which disables double-tap-to-zoom (issue #97)
	if (layer.style.msTouchAction === 'none') {
		return true;
	}

	return false;
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