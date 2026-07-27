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

	// Some old versions of Android don't have Function.prototype.bind
	function bind(method, context) {
		return function() { return method.apply(context, arguments); };
	}


	var methods = ['onMouse', 'onClick', 'onTouchStart', 'onTouchMove', 'onTouchEnd', 'onTouchCancel'];
	var context = this;
	for (var i = 0, l = methods.length; i < l; i++) {
		context[methods[i]] = bind(context[methods[i]], context);
	}

	// Set up event handlers as required
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

	// Hack is required for browsers that don't support Event#stopImmediatePropagation (e.g. Android 2)
	// which is how FastClick normally stops click events bubbling to callbacks registered on the FastClick
	// layer when they are cancelled.
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

	// If a handler is already declared in the element's onclick attribute, it will be fired before
	// FastClick's onClick handler. Fix this by pulling out the user-defined handler function and
	// adding it as listener.
	if (typeof layer.onclick === 'function') {

		// Android browser on at least 3.2 requires a new reference to the function in layer.onclick
		// - the old one won't work if passed to addEventListener directly.
		oldOnClick = layer.onclick;
		layer.addEventListener('click', function(event) {
			oldOnClick(event);
		}, false);
		layer.onclick = null;
	}
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

FastClick.prototype.determineEventType = function(targetElement) {
	'use strict';

	//Issue #159: Android Chrome Select Box does not open with a synthetic click event
	if (deviceIsAndroid && targetElement.tagName.toLowerCase() === 'select') {
		return 'mousedown';
	}

	return 'click';
};


/**
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
 * On touch start, record the position and scroll offset.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchStart = function(event) {
	'use strict';
	var targetElement, touch, selection;

	// Ignore multiple touches, otherwise pinch-to-zoom is prevented if both fingers are on the FastClick element (issue #111).
	if (event.targetTouches.length > 1) {
		return true;
	}

	targetElement = this.getTargetElementFromEventTarget(event.target);
	touch = event.targetTouches[0];

	if (deviceIsIOS) {

		// Only trusted events will deselect text on iOS (issue #49)
		selection = window.getSelection();
		if (selection.rangeCount && !selection.isCollapsed) {
			return true;
		}

		if (!deviceIsIOS4) {

			// Weird things happen on iOS when an alert or confirm dialog is opened from a click event callback (issue #23):
			// when the user next taps anywhere else on the page, new touchstart and touchend events are dispatched
			// with the same identifier as the touch event that previously triggered the click that triggered the alert.
			// Sadly, there is an issue on iOS 4 that causes some normal touch events to have the same identifier as an
			// immediately preceeding touch event (issue #52), so this fix is unavailable on that platform.
			if (touch.identifier === this.lastTouchIdentifier) {
				event.preventDefault();
				return false;
			}

			this.lastTouchIdentifier = touch.identifier;

			// If the target element is a child of a scrollable layer (using -webkit-overflow-scrolling: touch) and:
			// 1) the user does a fling scroll on the scrollable layer
			// 2) the user stops the fling scroll with another tap
			// then the event.target of the last 'touchend' event will be the element that was under the user's finger
			// when the fling scroll was started, causing FastClick to send a click event to that layer - unless a check
			// is made to ensure that a parent layer was not scrolled before sending a synthetic click (issue #42).
			this.updateScrollParent(targetElement);
		}
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
 * Check if touch target has changed.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.isTargetChanged = function(event) {
	'use strict';
	return this.targetElement !== this.getTargetElementFromEventTarget(event.target);
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

	if (this.isTargetChanged(event) || this.touchHasMoved(event)) {
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
 * Check if fast double-tap occurred.
 *
 * @param {number} eventTimeStamp
 * @returns {boolean}
 */
FastClick.prototype.isDoubleTap = function(eventTimeStamp) {
	'use strict';
	return (eventTimeStamp - this.lastClickTime) < this.tapDelay;
};


/**
 * Check if element is label with control.
 *
 * @param {string} tagName
 * @param {Element} element
 * @returns {boolean}
 */
FastClick.prototype.isLabelWithControl = function(tagName, element) {
	'use strict';
	if (tagName !== 'label') {
		return false;
	}
	var control = this.findControl(element);
	return !!control;
};


/**
 * Check if should handle label focus.
 *
 * @param {string} tagName
 * @param {Element} element
 * @returns {boolean}
 */
FastClick.prototype.shouldHandleLabelFocus = function(tagName, element) {
	'use strict';
	if (!this.isLabelWithControl(tagName, element)) {
		return false;
	}
	if (deviceIsAndroid) {
		return false;
	}
	return true;
};


/**
 * Check if should focus element.
 *
 * @param {number} trackingClickStart
 * @param {number} eventTimeStamp
 * @param {string} tagName
 * @returns {boolean}
 */
FastClick.prototype.shouldFocusElement = function(trackingClickStart, eventTimeStamp, tagName) {
	'use strict';
	var timeDiff = eventTimeStamp - trackingClickStart;
	if (timeDiff > 100) {
		return true;
	}
	if (deviceIsIOS && window.top !== window && tagName === 'input') {
		return true;
	}
	return false;
};


/**
 * Check if should prevent default for select.
 *
 * @param {string} tagName
 * @returns {boolean}
 */
FastClick.prototype.shouldPreventDefaultForSelect = function(tagName) {
	'use strict';
	if (deviceIsIOS && tagName === 'select') {
		return false;
	}
	return true;
};


/**
 * Check if scrolled during tap.
 *
 * @param {Element} element
 * @returns {boolean}
 */
FastClick.prototype.isScrolledDuringTap = function(element) {
	'use strict';
	var scrollParent = element.fastClickScrollParent;
	if (!scrollParent) {
		return false;
	}
	return scrollParent.fastClickLastScrollTop !== scrollParent.scrollTop;
};


/**
 * On touch end, determine whether to send a click event at once.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchEnd = function(event) {
	'use strict';
	var forElement, trackingClickStart, targetTagName, touch, targetElement = this.targetElement;

	if (!this.trackingClick) {
		return true;
	}

	if (this.isDoubleTap(event.timeStamp)) {
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
		targetElement = document.elementFromPoint(touch.pageX - window.pageXOffset, touch.pageY - window.pageYOffset) || targetElement;
		targetElement.fastClickScrollParent = this.targetElement.fastClickScrollParent;
	}

	targetTagName = targetElement.tagName.toLowerCase();

	if (this.shouldHandleLabelFocus(targetTagName, targetElement)) {
		this.focus(targetElement);
		return false;
	}

	if (this.needsFocus(targetElement)) {
		return this.handleNeedsFocusElement(targetElement, event, trackingClickStart, targetTagName);
	}

	if (deviceIsIOS && !deviceIsIOS4) {
		if (this.isScrolledDuringTap(targetElement)) {
			return true;
		}
	}

	if (!this.needsClick(targetElement)) {
		event.preventDefault();
		this.sendClick(targetElement, event);
	}

	return false;
};


/**
 * Handle element that needs focus.
 *
 * @param {Element} targetElement
 * @param {Event} event
 * @param {number} trackingClickStart
 * @param {string} targetTagName
 * @returns {boolean}
 */
FastClick.prototype.handleNeedsFocusElement = function(targetElement, event, trackingClickStart, targetTagName) {
	'use strict';

	if (this.shouldFocusElement(trackingClickStart, event.timeStamp, targetTagName)) {
		this.targetElement = null;
		return false;
	}

	this.focus(targetElement);
	this.sendClick(targetElement, event);

	if (this.shouldPreventDefaultForSelect(targetTagName)) {
		this.targetElement = null;
		event.preventDefault();
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
 * Check if should allow mouse event.
 *
 * @returns {boolean}
 */
FastClick.prototype.shouldAllowMouseEvent = function() {
	'use strict';
	if (!this.targetElement) {
		return true;
	}
	return false;
};


/**
 * Check if is forwarded touch event.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.isForwardedTouchEvent = function(event) {
	'use strict';
	return !!event.forwardedTouchEvent;
};


/**
 * Check if event is cancelable.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.isEventCancelable = function(event) {
	'use strict';
	return !event.cancelable;
};


/**
 * Check if should block mouse event.
 *
 * @returns {boolean}
 */
FastClick.prototype.shouldBlockMouseEvent = function() {
	'use strict';
	if (!this.needsClick(this.targetElement) || this.cancelNextClick) {
		return true;
	}
	return false;
};


/**
 * Determine mouse events which should be permitted.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onMouse = function(event) {
	'use strict';

	if (this.shouldAllowMouseEvent()) {
		return true;
	}

	if (this.isForwardedTouchEvent(event)) {
		return true;
	}

	if (this.isEventCancelable(event)) {
		return true;
	}

	if (!this.shouldBlockMouseEvent()) {
		return true;
	}

	if (event.stopImmediatePropagation) {
		event.stopImmediatePropagation();
	} else {
		event.propagationStopped = true;
	}

	event.stopPropagation();
	event.preventDefault();

	return false;
};


/**
 * Check if is tracking click.
 *
 * @returns {boolean}
 */
FastClick.prototype.isTrackingClick = function() {
	'use strict';
	return this.trackingClick;
};


/**
 * Check if is submit with no detail.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.isSubmitWithNoDetail = function(event) {
	'use strict';
	return event.target.type === 'submit' && event.detail === 0;
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

	if (this.isTrackingClick()) {
		this.targetElement = null;
		this.trackingClick = false;
		return true;
	}

	if (this.isSubmitWithNoDetail(event)) {
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
 * Check if device supports touch.
 *
 * @returns {boolean}
 */
FastClick.prototype.deviceSupportsTouch = function() {
	'use strict';
	return typeof window.ontouchstart !== 'undefined';
};


/**
 * Check if Chrome needs FastClick.
 *
 * @param {number} chromeVersion
 * @returns {boolean}
 */
FastClick.prototype.chromeNeedsFastClick = function(chromeVersion) {
	'use strict';
	if (!chromeVersion) {
		return false;
	}

	if (deviceIsAndroid) {
		return this.chromeAndroidNeedsFastClick(chromeVersion);
	}

	return false;
};


/**
 * Check if Chrome on Android needs FastClick.
 *
 * @param {number} chromeVersion
 * @returns {boolean}
 */
FastClick.prototype.chromeAndroidNeedsFastClick = function(chromeVersion) {
	'use strict';
	var metaViewport = document.querySelector('meta[name=viewport]');

	if (!metaViewport) {
		return true;
	}

	if (metaViewport.content.indexOf('user-scalable=no') !== -1) {
		return false;
	}

	if (chromeVersion > 31 && document.documentElement.scrollWidth <= window.outerWidth) {
		return false;
	}

	return true;
};


/**
 * Check if BlackBerry 10.3+ needs FastClick.
 *
 * @returns {boolean}
 */
FastClick.prototype.blackberryNeedsFastClick = function() {
	'use strict';
	var blackberryVersion = navigator.userAgent.match(/Version\/([0-9]*)\.([0-9]*)/);

	if (!blackberryVersion || blackberryVersion[1] < 10 || blackberryVersion[2] < 3) {
		return true;
	}

	var metaViewport = document.querySelector('meta[name=viewport]');

	if (!metaViewport) {
		return true;
	}

	if (metaViewport.content.indexOf('user-scalable=no') !== -1) {
		return false;
	}

	if (document.documentElement.scrollWidth <= window.outerWidth) {
		return false;
	}

	return true;
};


/**
 * Check whether FastClick is needed.
 *
 * @param {Element} layer The layer to listen on
 */
FastClick.notNeeded = function(layer) {
	'use strict';
	var chromeVersion;

	if (typeof window.ontouchstart === 'undefined') {
		return true;
	}

	chromeVersion = +(/Chrome\/([0-9]+)/.exec(navigator.userAgent) || [,0])[1];

	if (chromeVersion) {
		var instance = new FastClick(layer);
		if (!instance.chromeNeedsFastClick(chromeVersion)) {
			return true;
		}
	}

	if (deviceIsBlackBerry10) {
		var instance2 = new FastClick(layer);
		if (!instance2.blackberryNeedsFastClick()) {
			return true;
		}
	}

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