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
const EventHandlerBinder = {
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
const PropagationPolyfill = {
	apply(layer) {
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
};

/**
 * Instantiate fast-clicking listeners on the specified layer.
 *
 * @constructor
 * @param {Element} layer The layer to listen on
 * @param {Object} options The options to override the defaults
 */
function FastClick(layer, options) {
	'use strict';

	if (FastClick.notNeeded(layer)) {
		return;
	}

	options = options || {};

	this.trackingClick = false;
	this.trackingClickStart = 0;
	this.targetElement = null;
	this.touchStartX = 0;
	this.touchStartY = 0;
	this.lastTouchIdentifier = 0;
	this.lastClickTime = 0;
	this.cancelNextClick = false;
	this.touchBoundary = options.touchBoundary || 10;
	this.tapDelay = options.tapDelay || 200;
	this.layer = layer;

	EventHandlerBinder.bindHandlers(this, layer);
	EventHandlerBinder.attachListeners.call(this, layer);
	PropagationPolyfill.apply(layer);

	this.attachExistingOnClickHandler(layer);
}

/**
 * Attach existing onclick handler as event listener
 *
 * @param {Element} layer
 */
FastClick.prototype.attachExistingOnClickHandler = function(layer) {
	'use strict';

	if (typeof layer.onclick === 'function') {
		const oldOnClick = layer.onclick;
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
 * Determine whether a given element requires a call to focus to simulate click into element.
 *
 * @param {EventTarget|Element} target Target DOM element
 * @returns {boolean} Returns true if the element requires a call to focus to simulate native click.
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
 *
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

	clickEvent.initMouseEvent(
		eventType, true, true, window, 1,
		touch.screenX, touch.screenY, touch.clientX, touch.clientY,
		false, false, false, false, 0, null
	);
	clickEvent.forwardedTouchEvent = true;
	targetElement.dispatchEvent(clickEvent);
};

/**
 * Determine the appropriate event type for the target element
 *
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
 * Focus on the target element
 *
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
 * Check whether the given target element is a child of a scrollable layer
 *
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
 * Get the target element from event target
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
 * Check whether the touch has moved past a boundary since it started.
 *
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

	if (this.targetElement !== this.getTargetElementFromEventTarget(event.target) || 
		this.touchHasMoved(event)) {
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

	if (labelElement.control !== undefined) {
		return labelElement.control;
	}

	if (labelElement.htmlFor) {
		return document.getElementById(labelElement.htmlFor);
	}

	return labelElement.querySelector('button, input:not([type=hidden]), keygen, meter, output, progress, select, textarea');
};

/**
 * On touch end, determine whether to send a click event at once.
 *
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
		targetElement = document.elementFromPoint(
			touch.pageX - window.pageXOffset,
			touch.pageY - window.pageYOffset
		) || targetElement;
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