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

// Device detection
const DeviceDetection = {
	isAndroid: navigator.userAgent.indexOf('Android') > 0,
	isIOS: /iP(ad|hone|od)/.test(navigator.userAgent),
	isIOS4: false,
	isIOSWithBadTarget: false,
	isBlackBerry10: navigator.userAgent.indexOf('BB10') > 0,

	init() {
		this.isIOS4 = this.isIOS && (/OS 4_\d(_\d)?/).test(navigator.userAgent);
		this.isIOSWithBadTarget = this.isIOS && (/OS ([6-9]|\d{2})_\d/).test(navigator.userAgent);
	}
};

DeviceDetection.init();

// Utility functions
const Utils = {
	bind(method, context) {
		return function() { return method.apply(context, arguments); };
	},

	getChromeVersion() {
		const match = /Chrome\/([0-9]+)/.exec(navigator.userAgent);
		return +(match ? match[1] : 0);
	},

	getBlackBerryVersion() {
		return navigator.userAgent.match(/Version\/([0-9]*)\.([0-9]*)/);
	},

	getViewportMeta() {
		return document.querySelector('meta[name=viewport]');
	}
};

// Event handler binding
const EventHandlers = {
	bindHandlers(context, layer) {
		const methods = ['onMouse', 'onClick', 'onTouchStart', 'onTouchMove', 'onTouchEnd', 'onTouchCancel'];
		methods.forEach(method => {
			context[method] = Utils.bind(context[method], context);
		});
	},

	attachListeners(layer) {
		if (DeviceDetection.isAndroid) {
			layer.addEventListener('mouseover', this.onMouse, true);
			layer.addEventListener('mousedown', this.onMouse, true);
			layer.addEventListener('mouseup', this.onMouse, true);
		}

		layer.addEventListener('click', this.onClick, true);
		layer.addEventListener('touchstart', this.onTouchStart, false);
		layer.addEventListener('touchmove', this.onTouchMove, false);
		layer.addEventListener('touchend', this.onTouchEnd, false);
		layer.addEventListener('touchcancel', this.onTouchCancel, false);
	},

	removeListeners(layer) {
		if (DeviceDetection.isAndroid) {
			layer.removeEventListener('mouseover', this.onMouse, true);
			layer.removeEventListener('mousedown', this.onMouse, true);
			layer.removeEventListener('mouseup', this.onMouse, true);
		}

		layer.removeEventListener('click', this.onClick, true);
		layer.removeEventListener('touchstart', this.onTouchStart, false);
		layer.removeEventListener('touchmove', this.onTouchMove, false);
		layer.removeEventListener('touchend', this.onTouchEnd, false);
		layer.removeEventListener('touchcancel', this.onTouchCancel, false);
	}
};

// Polyfill for stopImmediatePropagation
function setupEventPolyfill(layer) {
	if (Event.prototype.stopImmediatePropagation) {
		return;
	}

	const originalRemoveEventListener = layer.removeEventListener;
	const originalAddEventListener = layer.addEventListener;

	layer.removeEventListener = function(type, callback, capture) {
		const rmv = Node.prototype.removeEventListener;
		if (type === 'click') {
			rmv.call(layer, type, callback.hijacked || callback, capture);
		} else {
			rmv.call(layer, type, callback, capture);
		}
	};

	layer.addEventListener = function(type, callback, capture) {
		const adv = Node.prototype.addEventListener;
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

function handleExistingOnClick(layer) {
	if (typeof layer.onclick !== 'function') {
		return;
	}

	const oldOnClick = layer.onclick;
	layer.addEventListener('click', function(event) {
		oldOnClick(event);
	}, false);
	layer.onclick = null;
}

/**
 * FastClick constructor
 * @constructor
 * @param {Element} layer The layer to listen on
 * @param {Object} options The options to override the defaults
 */
function FastClick(layer, options) {
	'use strict';

	options = options || {};

	// State properties
	this.trackingClick = false;
	this.trackingClickStart = 0;
	this.targetElement = null;
	this.touchStartX = 0;
	this.touchStartY = 0;
	this.lastTouchIdentifier = 0;
	this.lastClickTime = 0;
	this.cancelNextClick = false;

	// Configuration
	this.layer = layer;
	this.touchBoundary = options.touchBoundary || 10;
	this.tapDelay = options.tapDelay || 200;

	if (FastClick.notNeeded(layer)) {
		return;
	}

	EventHandlers.bindHandlers(this, layer);
	EventHandlers.attachListeners.call(this, layer);
	setupEventPolyfill(layer);
	handleExistingOnClick(layer);
}

/**
 * Determine whether a given element requires a native click.
 * @param {EventTarget|Element} target Target DOM element
 * @returns {boolean}
 */
FastClick.prototype.needsClick = function(target) {
	'use strict';
	const nodeName = target.nodeName.toLowerCase();

	const disabledElements = ['button', 'select', 'textarea'];
	if (disabledElements.includes(nodeName) && target.disabled) {
		return true;
	}

	if (nodeName === 'input') {
		if ((DeviceDetection.isIOS && target.type === 'file') || target.disabled) {
			return true;
		}
	}

	if (['label', 'video'].includes(nodeName)) {
		return true;
	}

	return (/\bneedsclick\b/).test(target.className);
};

/**
 * Determine whether a given element requires focus to simulate click.
 * @param {EventTarget|Element} target Target DOM element
 * @returns {boolean}
 */
FastClick.prototype.needsFocus = function(target) {
	'use strict';
	const nodeName = target.nodeName.toLowerCase();

	if (nodeName === 'textarea') {
		return true;
	}

	if (nodeName === 'select') {
		return !DeviceDetection.isAndroid;
	}

	if (nodeName === 'input') {
		const nonFocusableTypes = ['button', 'checkbox', 'file', 'image', 'radio', 'submit'];
		if (nonFocusableTypes.includes(target.type)) {
			return false;
		}
		return !target.disabled && !target.readOnly;
	}

	return (/\bneedsfocus\b/).test(target.className);
};

/**
 * Send a click event to the specified element.
 * @param {EventTarget|Element} targetElement
 * @param {Event} event
 */
FastClick.prototype.sendClick = function(targetElement, event) {
	'use strict';

	if (document.activeElement && document.activeElement !== targetElement) {
		document.activeElement.blur();
	}

	const touch = event.changedTouches[0];
	const clickEvent = document.createEvent('MouseEvents');
	const eventType = this.determineEventType(targetElement);

	clickEvent.initMouseEvent(eventType, true, true, window, 1, touch.screenX, touch.screenY, touch.clientX, touch.clientY, false, false, false, false, 0, null);
	clickEvent.forwardedTouchEvent = true;
	targetElement.dispatchEvent(clickEvent);
};

/**
 * Determine the appropriate event type for the target element.
 * @param {EventTarget|Element} targetElement
 * @returns {string}
 */
FastClick.prototype.determineEventType = function(targetElement) {
	'use strict';
	if (DeviceDetection.isAndroid && targetElement.tagName.toLowerCase() === 'select') {
		return 'mousedown';
	}
	return 'click';
};

/**
 * Focus on the target element.
 * @param {EventTarget|Element} targetElement
 */
FastClick.prototype.focus = function(targetElement) {
	'use strict';

	if (DeviceDetection.isIOS && targetElement.setSelectionRange && 
		targetElement.type.indexOf('date') !== 0 && targetElement.type !== 'time') {
		const length = targetElement.value.length;
		targetElement.setSelectionRange(length, length);
	} else {
		targetElement.focus();
	}
};

/**
 * Update scroll parent tracking.
 * @param {EventTarget|Element} targetElement
 */
FastClick.prototype.updateScrollParent = function(targetElement) {
	'use strict';

	let scrollParent = targetElement.fastClickScrollParent;

	if (!scrollParent || !scrollParent.contains(targetElement)) {
		let parentElement = targetElement;
		do {
			if (parentElement.scrollHeight > parentElement.offsetHeight) {
				scrollParent = parentElement;
				targetElement.fastClickScrollParent = parentElement;
				break;
			}
			parentElement = parentElement.parentElement;
		} while (parentElement);
	}

	if (scrollParent) {
		scrollParent.fastClickLastScrollTop = scrollParent.scrollTop;
	}
};

/**
 * Get the target element from event target.
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
 * Handle touch start event.
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchStart = function(event) {
	'use strict';

	if (event.targetTouches.length > 1) {
		return true;
	}

	const targetElement = this.getTargetElementFromEventTarget(event.target);
	const touch = event.targetTouches[0];

	if (DeviceDetection.isIOS) {
		const selection = window.getSelection();
		if (selection.rangeCount && !selection.isCollapsed) {
			return true;
		}

		if (!DeviceDetection.isIOS4) {
			if (touch.identifier === this.lastTouchIdentifier) {
				event.preventDefault();
				return false;
			}

			this.lastTouchIdentifier = touch.identifier;
			this.updateScrollParent(targetElement);
		}
	}

	this.trackingClick = true;
	this.trackingClickStart = event.timeStamp;
	this.targetElement = targetElement;
	this.touchStartX = touch.pageX;
	this.touchStartY = touch.pageY;

	if ((event.timeStamp - this.lastClickTime) < this.tapDelay) {
		event.preventDefault();
	}

	return true;
};

/**
 * Check whether touch has moved past boundary.
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.touchHasMoved = function(event) {
	'use strict';
	const touch = event.changedTouches[0];
	const boundary = this.touchBoundary;

	return Math.abs(touch.pageX - this.touchStartX) > boundary || 
		   Math.abs(touch.pageY - this.touchStartY) > boundary;
};

/**
 * Handle touch move event.
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchMove = function(event) {
	'use strict';

	if (!this.trackingClick) {
		return true;
	}

	if (this.targetElement !== this.getTargetElementFromEventTarget(event.target) || this.touchHasMoved(event)) {
		this.trackingClick = false;
		this.targetElement = null;
	}

	return true;
};

/**
 * Find the labelled control for a label element.
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
 * Handle touch end event.
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchEnd = function(event) {
	'use strict';

	if (!this.trackingClick) {
		return true;
	}

	if ((event.timeStamp - this.lastClickTime) < this.tapDelay) {
		this.cancelNextClick = true;
		return true;
	}

	this.cancelNextClick = false;
	this.lastClickTime = event.timeStamp;

	const trackingClickStart = this.trackingClickStart;
	this.trackingClick = false;
	this.trackingClickStart = 0;

	let targetElement = this.targetElement;

	if (DeviceDetection.isIOSWithBadTarget) {
		const touch = event.changedTouches[0];
		targetElement = document.elementFromPoint(touch.pageX - window.pageXOffset, touch.pageY - window.pageYOffset) || targetElement;
		targetElement.fastClickScrollParent = this.targetElement.fastClickScrollParent;
	}

	const targetTagName = targetElement.tagName.toLowerCase();

	if (targetTagName === 'label') {
		const forElement = this.findControl(targetElement);
		if (forElement) {
			this.focus(targetElement);
			if (DeviceDetection.isAndroid) {
				return false;
			}
			targetElement = forElement;
		}
	} else if (this.needsFocus(targetElement)) {
		if ((event.timeStamp - trackingClickStart) > 100 || 
			(DeviceDetection.isIOS && window.top !== window && targetTagName === 'input')) {
			this.targetElement = null;
			return false;
		}

		this.focus(targetElement);
		this.sendClick(targetElement, event);

		if (!DeviceDetection.isIOS || targetTagName !== 'select') {
			this.targetElement = null;
			event.preventDefault();
		}

		return false;
	}

	if (DeviceDetection.isIOS && !DeviceDetection.isIOS4) {
		const scrollParent = targetElement.fastClickScrollParent;