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
	var oldOnClick, i, l, methods, context;

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

	// Compatibility shim for browsers lacking stopImmediatePropagation
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

/* -------------------------------------------------------------------------- */
/* Helper methods – single responsibility                                    */
/* -------------------------------------------------------------------------- */

/**
 * Determine if an element needs a native click.
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
 * Determine if an element needs focus after a synthetic click.
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
 * Dispatch a synthetic click event.
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
 * Focus an element safely across platforms.
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
 * Update scroll parent reference for an element.
 * @param {Element} targetElement
 */
FastClick.prototype.updateScrollParent = function (targetElement) {
	'use strict';
	var scrollParent = targetElement.fastClickScrollParent, parent = targetElement;
	if (!scrollParent || !scrollParent.contains(targetElement)) {
		do {
			if (parent.scrollHeight > parent.offsetHeight) {
				scrollParent = parent;
				targetElement.fastClickScrollParent = parent;
				break;
			}
			parent = parent.parentElement;
		} while (parent);
	}
	if (scrollParent) {
		scrollParent.fastClickLastScrollTop = scrollParent.scrollTop;
	}
};

/**
 * Resolve the real target element from an event target (handles text nodes).
 * @param {EventTarget} eventTarget
 * @returns {Element|EventTarget}
 */
FastClick.prototype.getTargetElementFromEventTarget = function (eventTarget) {
	'use strict';
	if (eventTarget.nodeType === Node.TEXT_NODE) {
		return eventTarget.parentNode;
	}
	return eventTarget;
};

/**
 * Find the control associated with a label element.
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

/* -------------------------------------------------------------------------- */
/* Touch handling – split into focused helpers                               */
/* -------------------------------------------------------------------------- */

/**
 * Reset tracking state after a touch sequence.
 * @param {Event} event
 */
FastClick.prototype._resetTracking = function (event) {
	'use strict';
	this.lastClickTime = event.timeStamp;
	this.trackingClick = false;
	this.trackingClickStart = 0;
};

/**
 * Resolve the correct target element for iOS devices with bad target handling.
 * @param {Event} event
 * @param {Element} fallbackTarget
 * @returns {Element}
 */
FastClick.prototype._resolveIOSBadTarget = function (event, fallbackTarget) {
	'use strict';
	var touch = event.changedTouches[0];
	var resolved = document.elementFromPoint(
		touch.pageX - window.pageXOffset,
		touch.pageY - window.pageYOffset
	) || fallbackTarget;
	resolved.fastClickScrollParent = fallbackTarget.fastClickScrollParent;
	return resolved;
};

/**
 * Handle label elements – focus and possibly redirect to associated control.
 * @param {Element} labelElement
 * @returns {Element|null} The element that should receive the synthetic click.
 */
FastClick.prototype._handleLabel = function (labelElement) {
	'use strict';
	var control = this.findControl(labelElement);
	if (control) {
		this.focus(labelElement);
		if (deviceIsAndroid) {
			return null; // Android will handle the click natively.
		}
		return control;
	}
	return null;
};

/**
 * Handle elements that require focus before a synthetic click.
 * @param {Element} target
 * @param {Event} event
 * @param {number} trackingStart
 * @returns {boolean} true if the click handling should stop here.
 */
FastClick.prototype._handleFocus = function (target, event, trackingStart) {
	'use strict';
	var tag = target.tagName.toLowerCase();
	if ((event.timeStamp - trackingStart) > 100 || (deviceIsIOS && window.top !== window && tag === 'input')) {
		this.targetElement = null;
		return true;
	}
	this.focus(target);
	this.sendClick(target, event);
	if (!deviceIsIOS || tag !== 'select') {
		this.targetElement = null;
		event.preventDefault();
	}
	return true;
};

/**
 * Determine whether a synthetic click should be suppressed due to scrolling.
 * @param {Element} target
 * @returns {boolean}
 */
FastClick.prototype._shouldCancelDueToScroll = function (target) {
	'use strict';
	var scrollParent = target.fastClickScrollParent;
	return scrollParent && scrollParent.fastClickLastScrollTop !== scrollParent.scrollTop;
};

/**
 * Process a synthetic click for elements that do not need a native click.
 * @param {Element} target
 * @param {Event} event
 */
FastClick.prototype._processSyntheticClick = function (target, event) {
	'use strict';
	event.preventDefault();
	this.sendClick(target, event);
};

/* -------------------------------------------------------------------------- */
/* Event callbacks – now thin wrappers delegating to helpers                 */
/* -------------------------------------------------------------------------- */

/**
 * Touch start handler – records initial touch data.
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
 * Touch move handler – cancels click tracking if movement exceeds boundary.
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchMove = function (event) {
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
 * Determine if touch movement exceeds the allowed boundary.
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.touchHasMoved = function (event) {
	'use strict';
	var touch = event.changedTouches[0], boundary = this.touchBoundary;
	return Math.abs(touch.pageX - this.touchStartX) > boundary ||
		Math.abs(touch.pageY - this.touchStartY) > boundary;
};

/**
 * Touch end handler – decides whether to synthesize a click.
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchEnd = function (event) {
	'use strict';
	var target = this.targetElement, tag, control;
	if (!this.trackingClick) {
		return true;
	}
	if ((event.timeStamp - this.lastClickTime) < this.tapDelay) {
		this.cancelNextClick = true;
		return true;
	}
	this.cancelNextClick = false;
	this._resetTracking(event);
	if (deviceIsIOSWithBadTarget) {
		target = this._resolveIOSBadTarget(event, target);
	}
	tag = target.tagName.toLowerCase();

	/* Label handling */
	if (tag === 'label') {
		control = this._handleLabel(target);
		if (control === null) {
			return false; // Android native handling
		}
		if (control) {
			target = control;
		}
	}
	/* Focus handling */
	else if (this.needsFocus(target)) {
		if (this._handleFocus(target, event, this.trackingClickStart)) {
			return false;
		}
	}
	/* iOS scroll cancellation */
	if (deviceIsIOS && !deviceIsIOS4 && this._shouldCancelDueToScroll(target)) {
		return true;
	}
	/* Synthetic click for non‑native elements */
	if (!this.needsClick(target)) {
		this._processSyntheticClick(target, event);
	}
	return false;
};

/**
 * Touch cancel handler – resets tracking state.
 */
FastClick.prototype.onTouchCancel = function () {
	'use strict';
	this.trackingClick = false;
	this.targetElement = null;
};

/**
 * Mouse event handler – filters out unwanted synthetic clicks.
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
 * Click event handler – decides whether to allow the native click.
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
 * Destroy FastClick instance – removes all listeners.
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
 * Determine whether FastClick is required for the given layer.
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
 * Factory method – creates a FastClick instance.
 * @param {Element} layer
 * @param {Object} options
 * @returns {FastClick}
 */
FastClick.attach = function (layer, options) {
	'use strict';
	return new FastClick(layer, options);
};

/* Export handling */
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