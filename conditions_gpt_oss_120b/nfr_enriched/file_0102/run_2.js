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
/* Helper methods – keep each function focused and low‑complexity               */
/* -------------------------------------------------------------------------- */

/**
 * Determine whether an element requires a native click.
 */
FastClick.prototype.needsClick = function (target) {
	'use strict';
	switch (target.nodeName.toLowerCase()) {
	case 'button':
	case 'select':
	case 'textarea':
		return !!target.disabled;
	case 'input':
		return (deviceIsIOS && target.type === 'file') || target.disabled;
	case 'label':
	case 'video':
		return true;
	}
	return (/\bneedsclick\b/).test(target.className);
};

/**
 * Determine whether an element requires focus to simulate a click.
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
 */
FastClick.prototype.sendClick = function (targetElement, event) {
	'use strict';
	var clickEvent, touch = event.changedTouches[0];

	if (document.activeElement && document.activeElement !== targetElement) {
		document.activeElement.blur();
	}

	clickEvent = document.createEvent('MouseEvents');
	clickEvent.initMouseEvent(this._determineEventType(targetElement), true, true, window, 1,
		touch.screenX, touch.screenY, touch.clientX, touch.clientY,
		false, false, false, false, 0, null);
	clickEvent.forwardedTouchEvent = true;
	targetElement.dispatchEvent(clickEvent);
};

/**
 * Choose the appropriate event type for synthetic clicks.
 */
FastClick.prototype._determineEventType = function (targetElement) {
	'use strict';
	if (deviceIsAndroid && targetElement.tagName.toLowerCase() === 'select') {
		return 'mousedown';
	}
	return 'click';
};

/**
 * Focus an element safely across platforms.
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
 */
FastClick.prototype.updateScrollParent = function (targetElement) {
	'use strict';
	var scrollParent = targetElement.fastClickScrollParent, parent = targetElement;
	if (!scrollParent || !scrollParent.contains(targetElement)) {
		while (parent) {
			if (parent.scrollHeight > parent.offsetHeight) {
				scrollParent = parent;
				targetElement.fastClickScrollParent = parent;
				break;
			}
			parent = parent.parentElement;
		}
	}
	if (scrollParent) {
		scrollParent.fastClickLastScrollTop = scrollParent.scrollTop;
	}
};

/**
 * Resolve the true target element when a text node is received.
 */
FastClick.prototype.getTargetElementFromEventTarget = function (eventTarget) {
	'use strict';
	return (eventTarget.nodeType === Node.TEXT_NODE) ? eventTarget.parentNode : eventTarget;
};

/**
 * Find the control associated with a label element.
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
 * Determine if a touch has moved beyond the allowed boundary.
 */
FastClick.prototype.touchHasMoved = function (event) {
	'use strict';
	var touch = event.changedTouches[0];
	return Math.abs(touch.pageX - this.touchStartX) > this.touchBoundary ||
		Math.abs(touch.pageY - this.touchStartY) > this.touchBoundary;
};

/* -------------------------------------------------------------------------- */
/* Event handlers – each delegates to a focused helper to keep complexity low   */
/* -------------------------------------------------------------------------- */

FastClick.prototype.onTouchStart = function (event) {
	'use strict';
	if (event.targetTouches.length > 1) {
		return true;
	}
	return this._handleTouchStart(event);
};

FastClick.prototype._handleTouchStart = function (event) {
	'use strict';
	var target = this.getTargetElementFromEventTarget(event.target);
	var touch = event.targetTouches[0];
	var selection;

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
			this.updateScrollParent(target);
		}
	}

	this.trackingClick = true;
	this.trackingClickStart = event.timeStamp;
	this.targetElement = target;
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
	if (this.targetElement !== this.getTargetElementFromEventTarget(event.target) || this.touchHasMoved(event)) {
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

	this.trackingClick = false;
	this.trackingClickStart = 0;

	var target = this._resolveTargetElement(event);
	if (!target) {
		return true;
	}
	return this._processTouchEnd(event, target);
};

FastClick.prototype._resolveTargetElement = function (event) {
	'use strict';
	var target = this.targetElement;
	if (deviceIsIOSWithBadTarget) {
		var touch = event.changedTouches[0];
		target = document.elementFromPoint(
			touch.pageX - window.pageXOffset,
			touch.pageY - window.pageYOffset
		) || target;
		if (target) {
			target.fastClickScrollParent = this.targetElement.fastClickScrollParent;
		}
	}
	return target;
};

FastClick.prototype._processTouchEnd = function (event, target) {
	'use strict';
	var tag = target.tagName.toLowerCase();

	if (tag === 'label') {
		var control = this.findControl(target);
		if (control) {
			this.focus(target);
			if (deviceIsAndroid) {
				return false;
			}
			target = control;
		}
	} else if (this.needsFocus(target)) {
		if ((event.timeStamp - this.trackingClickStart) > 100 ||
			(deviceIsIOS && window.top !== window && tag === 'input')) {
			this.targetElement = null;
			return false;
		}
		this.focus(target);
		this.sendClick(target, event);
		if (!deviceIsIOS || tag !== 'select') {
			this.targetElement = null;
			event.preventDefault();
		}
		return false;
	}

	if (deviceIsIOS && !deviceIsIOS4) {
		var scrollParent = target.fastClickScrollParent;
		if (scrollParent && scrollParent.fastClickLastScrollTop !== scrollParent.scrollTop) {
			return true;
		}
	}

	if (!this.needsClick(target)) {
		event.preventDefault();
		this.sendClick(target, event);
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
 * Determine whether FastClick is required for the given layer.
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