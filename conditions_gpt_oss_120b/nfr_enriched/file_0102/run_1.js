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

function FastClick(layer, options) {
	'use strict';
	var oldOnClick, methods, context, i, l;

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

	// Simple bind polyfill for older Android browsers
	function bind(method, ctx) {
		return function () { return method.apply(ctx, arguments); };
	}

	methods = ['onMouse', 'onClick', 'onTouchStart', 'onTouchMove', 'onTouchEnd', 'onTouchCancel'];
	context = this;
	for (i = 0, l = methods.length; i < l; i++) {
		context[methods[i]] = bind(context[methods[i]], context);
	}

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

	// Hack for browsers lacking stopImmediatePropagation (e.g., Android 2)
	if (!Event.prototype.stopImmediatePropagation) {
		layer.removeEventListener = function (type, callback, capture) {
			var rmv = Node.prototype.removeEventListener;
			if (type === 'click') {
				rmv.call(layer, type, callback.hijacked || callback, capture);
			} else {
				rmv.call(layer, type, callback, capture);
			}
		};

		layer.addEventListener = function (type, callback, capture) {
			var adv = Node.prototype.addEventListener;
			if (type === 'click') {
				adv.call(layer, type, callback.hijacked || (callback.hijacked = function (event) {
					if (!event.propagationStopped) {
						callback(event);
					}
				}), capture);
			} else {
				adv.call(layer, type, callback, capture);
			}
		};
	}

	// Preserve existing onclick handler
	if (typeof layer.onclick === 'function') {
		oldOnClick = layer.onclick;
		layer.addEventListener('click', function (event) {
			oldOnClick(event);
		}, false);
		layer.onclick = null;
	}
}

/* Device detection */
var deviceIsAndroid = navigator.userAgent.indexOf('Android') > 0;
var deviceIsIOS = /iP(ad|hone|od)/.test(navigator.userAgent);
var deviceIsIOS4 = deviceIsIOS && (/OS 4_\d(_\d)?/).test(navigator.userAgent);
var deviceIsIOSWithBadTarget = deviceIsIOS && (/OS ([6-9]|\d{2})_\d/).test(navigator.userAgent);
var deviceIsBlackBerry10 = navigator.userAgent.indexOf('BB10') > 0;

/**
 * Determine whether a given element requires a native click.
 *
 * @param {EventTarget|Element} target
 * @returns {boolean}
 */
FastClick.prototype.needsClick = function (target) {
	'use strict';
	switch (target.nodeName.toLowerCase()) {
	case 'button':
	case 'select':
	case 'textarea':
		if (target.disabled) {
			return true;
		}
		break;
	case 'input':
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
 * Determine whether a given element requires a focus call to simulate a click.
 *
 * @param {EventTarget|Element} target
 * @returns {boolean}
 */
FastClick.prototype.needsFocus = function (target) {
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
		return !target.disabled && !target.readOnly;
	default:
		return (/\bneedsfocus\b/).test(target.className);
	}
};

/**
 * Send a synthetic click event.
 *
 * @param {Element} targetElement
 * @param {Event} event
 */
FastClick.prototype.sendClick = function (targetElement, event) {
	'use strict';
	var clickEvent, touch;

	if (document.activeElement && document.activeElement !== targetElement) {
		document.activeElement.blur();
	}

	touch = event.changedTouches[0];
	clickEvent = document.createEvent('MouseEvents');
	clickEvent.initMouseEvent(this.determineEventType(targetElement), true, true, window, 1,
		touch.screenX, touch.screenY, touch.clientX, touch.clientY,
		false, false, false, false, 0, null);
	clickEvent.forwardedTouchEvent = true;
	targetElement.dispatchEvent(clickEvent);
};

/**
 * Choose appropriate event type for synthetic click.
 *
 * @param {Element} targetElement
 * @returns {string}
 */
FastClick.prototype.determineEventType = function (targetElement) {
	'use strict';
	if (deviceIsAndroid && targetElement.tagName.toLowerCase() === 'select') {
		return 'mousedown';
	}
	return 'click';
};

/**
 * Focus an element, handling iOS quirks.
 *
 * @param {Element} targetElement
 */
FastClick.prototype.focus = function (targetElement) {
	'use strict';
	var length;
	if (deviceIsIOS && targetElement.setSelectionRange && targetElement.type.indexOf('date') !== 0 && targetElement.type !== 'time') {
		length = targetElement.value.length;
		targetElement.setSelectionRange(length, length);
	} else {
		targetElement.focus();
	}
};

/**
 * Update scroll parent information for a target element.
 *
 * @param {Element} targetElement
 */
FastClick.prototype.updateScrollParent = function (targetElement) {
	'use strict';
	var scrollParent = targetElement.fastClickScrollParent, parentElement = targetElement;

	if (!scrollParent || !scrollParent.contains(targetElement)) {
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
 * Resolve event target when it may be a text node.
 *
 * @param {EventTarget} eventTarget
 * @returns {Element}
 */
FastClick.prototype.getTargetElementFromEventTarget = function (eventTarget) {
	'use strict';
	if (eventTarget.nodeType === Node.TEXT_NODE) {
		return eventTarget.parentNode;
	}
	return eventTarget;
};

/**
 * Handle touch start events.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchStart = function (event) {
	'use strict';
	var targetElement, touch, selection;

	if (event.targetTouches.length > 1) {
		return true;
	}

	targetElement = this.getTargetElementFromEventTarget(event.target);
	touch = event.targetTouches[0];

	if (deviceIsIOS) {
		selection = window.getSelection();
		if (selection.rangeCount && !selection.isCollapsed) {
			return true;
		}
		if (!deviceIsIOS4 && touch.identifier === this.lastTouchIdentifier) {
			event.preventDefault();
			return false;
		}
		if (!deviceIsIOS4) {
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
 * Determine if a touch has moved beyond the allowed boundary.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.touchHasMoved = function (event) {
	'use strict';
	var touch = event.changedTouches[0];
	return Math.abs(touch.pageX - this.touchStartX) > this.touchBoundary ||
		Math.abs(touch.pageY - this.touchStartY) > this.touchBoundary;
};

/**
 * Handle touch move events.
 *
 * @param {Event} event
 */
FastClick.prototype.onTouchMove = function (event) {
	'use strict';
	if (!this.trackingClick) {
		return;
	}
	if (this.targetElement !== this.getTargetElementFromEventTarget(event.target) || this.touchHasMoved(event)) {
		this.trackingClick = false;
		this.targetElement = null;
	}
};

/**
 * Find the control associated with a label element.
 *
 * @param {HTMLLabelElement} labelElement
 * @returns {Element|null}
 */
FastClick.prototype.findControl = function (labelElement) {
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
 * Process label elements during touch end.
 *
 * @param {Element} targetElement
 * @returns {{element: Element, focusNeeded: boolean}|null}
 */
FastClick.prototype._processLabel = function (targetElement) {
	'use strict';
	var forElement = this.findControl(targetElement);
	if (forElement) {
		this.focus(targetElement);
		if (deviceIsAndroid) {
			return null;
		}
		return { element: forElement, focusNeeded: false };
	}
	return null;
};

/**
 * Handle focus requirements during touch end.
 *
 * @param {Element} targetElement
 * @param {number} trackingClickStart
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype._handleFocusOnTouchEnd = function (targetElement, trackingClickStart, event) {
	'use strict';
	var tag = targetElement.tagName.toLowerCase();

	if ((event.timeStamp - trackingClickStart) > 100 ||
		(deviceIsIOS && window.top !== window && tag === 'input')) {
		this.targetElement = null;
		return false;
	}
	this.focus(targetElement);
	this.sendClick(targetElement, event);

	if (!deviceIsIOS || tag !== 'select') {
		this.targetElement = null;
		event.preventDefault();
	}
	return false;
};

/**
 * Determine whether a synthetic click should be suppressed due to scrolling.
 *
 * @param {Element} targetElement
 * @returns {boolean}
 */
FastClick.prototype._shouldSuppressClickForScroll = function (targetElement) {
	'use strict';
	if (!deviceIsIOS || deviceIsIOS4) {
		return false;
	}
	var scrollParent = targetElement.fastClickScrollParent;
	return scrollParent && scrollParent.fastClickLastScrollTop !== scrollParent.scrollTop;
};

/**
 * Handle touch end events.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchEnd = function (event) {
	'use strict';
	var targetElement = this.targetElement, trackingClickStart = this.trackingClickStart, tagName, touch;

	if (!this.trackingClick) {
		return true;
	}
	if ((event.timeStamp - this.lastClickTime) < this.tapDelay) {
		this.cancelNextClick = true;
		return true;
	}
	this.cancelNextClick = false;
	this.lastClickTime = event.timeStamp;
	this.trackingClick = false;
	this.trackingClickStart = 0;

	if (deviceIsIOSWithBadTarget) {
		touch = event.changedTouches[0];
		targetElement = document.elementFromPoint(
			touch.pageX - window.pageXOffset,
			touch.pageY - window.pageYOffset
		) || targetElement;
		targetElement.fastClickScrollParent = this.targetElement.fastClickScrollParent;
	}

	tagName = targetElement.tagName.toLowerCase();

	if (tagName === 'label') {
		var labelResult = this._processLabel(targetElement);
		if (labelResult) {
			targetElement = labelResult.element;
		} else {
			return false;
		}
	} else if (this.needsFocus(targetElement)) {
		return this._handleFocusOnTouchEnd(targetElement, trackingClickStart, event);
	}

	if (this._shouldSuppressClickForScroll(targetElement)) {
		return true;
	}

	if (!this.needsClick(targetElement)) {
		event.preventDefault();
		this.sendClick(targetElement, event);
	}
	return false;
};

/**
 * Handle touch cancel events.
 */
FastClick.prototype.onTouchCancel = function () {
	'use strict';
	this.trackingClick = false;
	this.targetElement = null;
};

/**
 * Determine whether a mouse event should be allowed.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onMouse = function (event) {
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
	if (!this.needsClick(this.targetElement) || this.cancelNextClick) {
		if (event.stopImmediatePropagation) {
			event.stopImmediatePropagation();
		} else {
			event.propagationStopped = true;
		}
		event.stopPropagation();
		event.preventDefault();
		return false;
	}
	return true;
};

/**
 * Handle click events, filtering synthetic clicks.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onClick = function (event) {
	'use strict';
	if (this.trackingClick) {
		this.targetElement = null;
		this.trackingClick = false;
		return true;
	}
	if (event.target.type === 'submit' && event.detail === 0) {
		return true;
	}
	var permitted = this.onMouse(event);
	if (!permitted) {
		this.targetElement = null;
	}
	return permitted;
};

/**
 * Remove all FastClick event listeners.
 */
FastClick.prototype.destroy = function () {
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
 * Determine if FastClick is required for a given layer.
 *
 * @param {Element} layer
 * @returns {boolean}
 */
FastClick.notNeeded = function (layer) {
	'use strict';
	var metaViewport, chromeVersion, blackberryVersion;

	if (typeof window.ontouchstart === 'undefined') {
		return true;
	}
	chromeVersion = +(/Chrome\/([0-9]+)/.exec(navigator.userAgent) || [, 0])[1];
	if (chromeVersion) {
		if (deviceIsAndroid) {
			metaViewport = document.querySelector('meta[name=viewport]');
			if (metaViewport) {
				if (metaViewport.content.indexOf('user-scalable=no') !== -1) {
					return true;
				}
				if (chromeVersion > 31 && document.documentElement.scrollWidth <= window.outerWidth) {
					return true;
				}
			}
		} else {
			return true;
		}
	}
	if (deviceIsBlackBerry10) {
		blackberryVersion = navigator.userAgent.match(/Version\/([0-9]*)\.([0-9]*)/);
		if (blackberryVersion[1] >= 10 && blackberryVersion[2] >= 3) {
			metaViewport = document.querySelector('meta[name=viewport]');
			if (metaViewport) {
				if (metaViewport.content.indexOf('user-scalable=no') !== -1) {
					return true;
				}
				if (document.documentElement.scrollWidth <= window.outerWidth) {
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
 * Factory method for creating a FastClick instance.
 *
 * @param {Element} layer
 * @param {Object} options
 * @returns {FastClick}
 */
FastClick.attach = function (layer, options) {
	'use strict';
	return new FastClick(layer, options);
};

if (typeof define === 'function' && typeof define.amd === 'object' && define.amd) {
	define(function () {
		'use strict';
		return FastClick;
	});
} else if (typeof module !== 'undefined' && module.exports) {
	module.exports = FastClick.attach;
	module.exports.FastClick = FastClick;
} else {
	window.FastClick = FastClick;
}