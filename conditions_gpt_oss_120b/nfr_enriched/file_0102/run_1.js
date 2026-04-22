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

	/* state --------------------------------------------------------------- */
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

	/* bind --------------------------------------------------------------- */
	function bind(method, ctx) {
		return function () { return method.apply(ctx, arguments); };
	}
	methods = ['onMouse', 'onClick', 'onTouchStart', 'onTouchMove', 'onTouchEnd', 'onTouchCancel'];
	context = this;
	for (i = 0, l = methods.length; i < l; i++) {
		context[methods[i]] = bind(context[methods[i]], context);
	}

	/* listeners ----------------------------------------------------------- */
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

	/* legacy stopImmediatePropagation hack -------------------------------- */
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

	/* preserve existing onclick attribute --------------------------------- */
	if (typeof layer.onclick === 'function') {
		oldOnClick = layer.onclick;
		layer.addEventListener('click', function (event) {
			oldOnClick(event);
		}, false);
		layer.onclick = null;
	}
}

/* device detection -------------------------------------------------------- */
var deviceIsAndroid = navigator.userAgent.indexOf('Android') > 0;
var deviceIsIOS = /iP(ad|hone|od)/.test(navigator.userAgent);
var deviceIsIOS4 = deviceIsIOS && (/OS 4_\d(_\d)?/).test(navigator.userAgent);
var deviceIsIOSWithBadTarget = deviceIsIOS && (/OS ([6-9]|\d{2})_\d/).test(navigator.userAgent);
var deviceIsBlackBerry10 = navigator.userAgent.indexOf('BB10') > 0;

/* ------------------------------------------------------------------------ */
/* Helper functions – keep each under the complexity threshold               */
/* ------------------------------------------------------------------------ */

/**
 * Returns true if the element should receive a native click.
 * @private
 */
FastClick.prototype._needsClick = function (target) {
	'use strict';
	switch (target.nodeName.toLowerCase()) {
	case 'button':
	case 'select':
	case 'textarea':
		return !!target.disabled;
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
 * Returns true if the element should be focused on touch.
 * @private
 */
FastClick.prototype._needsFocus = function (target) {
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
 * Determines the synthetic event type for a given element.
 * @private
 */
FastClick.prototype._determineEventType = function (targetElement) {
	'use strict';
	if (deviceIsAndroid && targetElement.tagName.toLowerCase() === 'select') {
		return 'mousedown';
	}
	return 'click';
};

/**
 * Returns true if the touch has moved beyond the allowed boundary.
 * @private
 */
FastClick.prototype._touchHasMoved = function (event) {
	'use strict';
	var touch = event.changedTouches[0];
	return Math.abs(touch.pageX - this.touchStartX) > this.touchBoundary ||
	       Math.abs(touch.pageY - this.touchStartY) > this.touchBoundary;
};

/**
 * Handles label elements – focuses the label and optionally redirects to its control.
 * @private
 */
FastClick.prototype._handleLabel = function (labelElement, event) {
	'use strict';
	var control = this.findControl(labelElement);
	if (control) {
		this.focus(labelElement);
		if (deviceIsAndroid) {
			return false;
		}
		return control;
	}
	return labelElement;
};

/**
 * Handles focusable elements – focuses and optionally sends a synthetic click.
 * @private
 */
FastClick.prototype._handleFocusable = function (targetElement, event, trackingStart) {
	'use strict';
	var tag = targetElement.tagName.toLowerCase();
	if ((event.timeStamp - trackingStart) > 100 ||
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
 * Determines whether a synthetic click should be suppressed due to scrolling.
 * @private
 */
FastClick.prototype._shouldSuppressSyntheticClick = function (targetElement) {
	'use strict';
	if (!deviceIsIOS || deviceIsIOS4) {
		return false;
	}
	var scrollParent = targetElement.fastClickScrollParent;
	return scrollParent && scrollParent.fastClickLastScrollTop !== scrollParent.scrollTop;
};

/**
 * Sends a synthetic click event to the target element.
 * @private
 */
FastClick.prototype._sendSyntheticClick = function (targetElement, event) {
	'use strict';
	var clickEvent, touch = event.changedTouches[0];
	if (document.activeElement && document.activeElement !== targetElement) {
		document.activeElement.blur();
	}
	clickEvent = document.createEvent('MouseEvents');
	clickEvent.initMouseEvent(
		this._determineEventType(targetElement),
		true, true, window, 1,
		touch.screenX, touch.screenY,
		touch.clientX, touch.clientY,
		false, false, false, false,
		0, null
	);
	clickEvent.forwardedTouchEvent = true;
	targetElement.dispatchEvent(clickEvent);
};

/**
 * Finds the control associated with a label element.
 * @private
 */
FastClick.prototype._findControl = function (labelElement) {
	'use strict';
	if (labelElement.control !== undefined) {
		return labelElement.control;
	}
	if (labelElement.htmlFor) {
		return document.getElementById(labelElement.htmlFor);
	}
	return labelElement.querySelector('button, input:not([type=hidden]), keygen, meter, output, progress, select, textarea');
};

/* ------------------------------------------------------------------------ */
/* Public prototype methods – thin wrappers delegating to helpers           */
/* ------------------------------------------------------------------------ */

FastClick.prototype.needsClick = function (target) {
	'use strict';
	return this._needsClick(target);
};

FastClick.prototype.needsFocus = function (target) {
	'use strict';
	return this._needsFocus(target);
};

FastClick.prototype.sendClick = function (targetElement, event) {
	'use strict';
	this._sendSyntheticClick(targetElement, event);
};

FastClick.prototype.determineEventType = function (targetElement) {
	'use strict';
	return this._determineEventType(targetElement);
};

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

FastClick.prototype.getTargetElementFromEventTarget = function (eventTarget) {
	'use strict';
	if (eventTarget.nodeType === Node.TEXT_NODE) {
		return eventTarget.parentNode;
	}
	return eventTarget;
};

FastClick.prototype.findControl = function (labelElement) {
	'use strict';
	return this._findControl(labelElement);
};

FastClick.prototype.onTouchStart = function (event) {
	'use strict';
	if (event.targetTouches.length > 1) {
		return true;
	}
	var targetElement = this.getTargetElementFromEventTarget(event.target);
	var touch = event.targetTouches[0];

	if (deviceIsIOS) {
		var selection = window.getSelection();
		if (selection.rangeCount && !selection.isCollapsed) {
			return true;
		}
		if (!deviceIsIOS4) {
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

FastClick.prototype.onTouchMove = function (event) {
	'use strict';
	if (!this.trackingClick) {
		return true;
	}
	if (this.targetElement !== this.getTargetElementFromEventTarget(event.target) || this._touchHasMoved(event)) {
		this.trackingClick = false;
		this.targetElement = null;
	}
	return true;
};

FastClick.prototype.onTouchEnd = function (event) {
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

	var trackingStart = this.trackingClickStart;
	this.trackingClick = false;
	this.trackingClickStart = 0;
	var targetElement = this.targetElement;

	if (deviceIsIOSWithBadTarget) {
		var touch = event.changedTouches[0];
		targetElement = document.elementFromPoint(
			touch.pageX - window.pageXOffset,
			touch.pageY - window.pageYOffset
		) || targetElement;
		targetElement.fastClickScrollParent = this.targetElement.fastClickScrollParent;
	}
	var tag = targetElement.tagName.toLowerCase();

	if (tag === 'label') {
		var newTarget = this._handleLabel(targetElement, event);
		if (newTarget !== targetElement) {
			targetElement = newTarget;
		}
	} else if (this.needsFocus(targetElement)) {
		return this._handleFocusable(targetElement, event, trackingStart);
	}

	if (this._shouldSuppressSyntheticClick(targetElement)) {
		return true;
	}

	if (!this.needsClick(targetElement)) {
		event.preventDefault();
		this._sendSyntheticClick(targetElement, event);
	}
	return false;
};

FastClick.prototype.onTouchCancel = function () {
	'use strict';
	this.trackingClick = false;
	this.targetElement = null;
};

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
 * Determines whether FastClick is required for the given layer.
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
		if (blackberryVersion && blackberryVersion[1] >= 10 && blackberryVersion[2] >= 3) {
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