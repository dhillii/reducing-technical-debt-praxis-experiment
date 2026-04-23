/*******************************************************************************
 * FastClick – polyfill to remove click delays on browsers with touch UIs.
 * Refactored for maintainability and reduced complexity.
 ******************************************************************************/

/*jslint browser:true, node:true*/
/*global define, Event, Node*/

/**
 * Instantiate fast‑clicking listeners on the specified layer.
 *
 * @constructor
 * @param {Element} layer The layer to listen on
 * @param {Object} [options] Options to override the defaults
 */
function FastClick(layer, options) {
	'use strict';
	var oldOnClick, i, l, methods, context;

	options = options || {};

	/* state --------------------------------------------------------------- */
	this.trackingClick          = false;
	this.trackingClickStart     = 0;
	this.targetElement          = null;
	this.touchStartX            = 0;
	this.touchStartY            = 0;
	this.lastTouchIdentifier    = 0;
	this.touchBoundary          = options.touchBoundary || 10;
	this.layer                  = layer;
	this.tapDelay               = options.tapDelay || 200;

	if (FastClick.notNeeded(layer)) {
		return;
	}

	/* bind methods -------------------------------------------------------- */
	function bind(method, ctx) {
		return function () { return method.apply(ctx, arguments); };
	}
	methods = ['onMouse', 'onClick', 'onTouchStart', 'onTouchMove', 'onTouchEnd', 'onTouchCancel'];
	context = this;
	for (i = 0, l = methods.length; i < l; i++) {
		context[methods[i]] = bind(context[methods[i]], context);
	}

	/* attach listeners ---------------------------------------------------- */
	if (deviceIsAndroid) {
		layer.addEventListener('mouseover', this.onMouse, true);
		layer.addEventListener('mousedown',  this.onMouse, true);
		layer.addEventListener('mouseup',    this.onMouse, true);
	}
	layer.addEventListener('click',      this.onClick,      true);
	layer.addEventListener('touchstart', this.onTouchStart, false);
	layer.addEventListener('touchmove',  this.onTouchMove,  false);
	layer.addEventListener('touchend',   this.onTouchEnd,   false);
	layer.addEventListener('touchcancel',this.onTouchCancel,false);

	/* legacy stopImmediatePropagation hack -------------------------------- */
	if (!Event.prototype.stopImmediatePropagation) {
		_fastClickPatchEventPropagation(layer);
	}

	/* preserve existing onclick attribute --------------------------------- */
	if (typeof layer.onclick === 'function') {
		oldOnClick = layer.onclick;
		layer.addEventListener('click', function (event) { oldOnClick(event); }, false);
		layer.onclick = null;
	}
}

/* device detection -------------------------------------------------------- */
var deviceIsAndroid          = navigator.userAgent.indexOf('Android') > 0;
var deviceIsIOS              = /iP(ad|hone|od)/.test(navigator.userAgent);
var deviceIsIOS4             = deviceIsIOS && (/OS 4_\d(_\d)?/).test(navigator.userAgent);
var deviceIsIOSWithBadTarget = deviceIsIOS && (/OS ([6-9]|\d{2})_\d/).test(navigator.userAgent);
var deviceIsBlackBerry10     = navigator.userAgent.indexOf('BB10') > 0;

/* ------------------------------------------------------------------------ */
/* Helper – patch Event#stopImmediatePropagation for old browsers          */
/* ------------------------------------------------------------------------ */
function _fastClickPatchEventPropagation(layer) {
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

/* ------------------------------------------------------------------------ */
/* FastClick prototype methods                                             */
/* ------------------------------------------------------------------------ */

/**
 * Determine whether a given element requires a native click.
 *
 * @param {EventTarget|Element} target Target DOM element
 * @returns {boolean}
 */
FastClick.prototype.needsClick = function (target) {
	'use strict';
	switch (target.nodeName.toLowerCase()) {
		case 'button':
		case 'select':
		case 'textarea':
			if (target.disabled) { return true; }
			break;
		case 'input':
			if ((deviceIsIOS && target.type === 'file') || target.disabled) { return true; }
			break;
		case 'label':
		case 'video':
			return true;
	}
	return (/\bneedsclick\b/).test(target.className);
};

/**
 * Determine whether a given element requires a call to focus to simulate click.
 *
 * @param {EventTarget|Element} target Target DOM element
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
 * Send a synthetic click event to the target element.
 *
 * @param {EventTarget|Element} targetElement
 * @param {Event} event
 */
FastClick.prototype.sendClick = function (targetElement, event) {
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
 * Choose the appropriate event type for a synthetic click.
 *
 * @private
 * @param {Element} targetElement
 * @returns {string}
 */
FastClick.prototype._determineEventType = function (targetElement) {
	'use strict';
	if (deviceIsAndroid && targetElement.tagName.toLowerCase() === 'select') {
		return 'mousedown';
	}
	return 'click';
};

/**
 * Focus the given element, handling iOS quirks.
 *
 * @param {EventTarget|Element} targetElement
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
 * @param {EventTarget|Element} targetElement
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
 * Resolve the real target element when the event target is a text node.
 *
 * @param {EventTarget} eventTarget
 * @returns {Element|EventTarget}
 */
FastClick.prototype.getTargetElementFromEventTarget = function (eventTarget) {
	'use strict';
	return (eventTarget.nodeType === Node.TEXT_NODE) ? eventTarget.parentNode : eventTarget;
};

/* ------------------------------------------------------------------------ */
/* Touch handling helpers                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Determine whether the touch has moved beyond the allowed boundary.
 *
 * @private
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype._touchHasMoved = function (event) {
	'use strict';
	var touch = event.changedTouches[0];
	return Math.abs(touch.pageX - this.touchStartX) > this.touchBoundary ||
	       Math.abs(touch.pageY - this.touchStartY) > this.touchBoundary;
};

/**
 * Reset tracking state after a touch sequence ends or is cancelled.
 *
 * @private
 */
FastClick.prototype._resetTracking = function () {
	'use strict';
	this.trackingClick = false;
	this.targetElement = null;
};

/* ------------------------------------------------------------------------ */
/* Event listeners                                                          */
/* ------------------------------------------------------------------------ */

/**
 * Touch start handler – records initial state.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchStart = function (event) {
	'use strict';
	if (event.targetTouches.length > 1) { return true; }

	var target = this.getTargetElementFromEventTarget(event.target),
	    touch  = event.targetTouches[0];

	if (deviceIsIOS && _iosShouldIgnoreSelection()) { return true; }

	if (deviceIsIOS && !deviceIsIOS4 && touch.identifier === this.lastTouchIdentifier) {
		event.preventDefault();
		return false;
	}

	if (deviceIsIOS && !deviceIsIOS4) {
		this.lastTouchIdentifier = touch.identifier;
		this.updateScrollParent(target);
	}

	this.trackingClick      = true;
	this.trackingClickStart = event.timeStamp;
	this.targetElement      = target;
	this.touchStartX        = touch.pageX;
	this.touchStartY        = touch.pageY;

	if ((event.timeStamp - this.lastClickTime) < this.tapDelay) {
		event.preventDefault();
	}

	return true;
};

/**
 * Touch move handler – cancels click tracking if movement exceeds boundary.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchMove = function (event) {
	'use strict';
	if (!this.trackingClick) { return true; }

	if (this.targetElement !== this.getTargetElementFromEventTarget(event.target) || this._touchHasMoved(event)) {
		this._resetTracking();
	}

	return true;
};

/**
 * Touch end handler – decides whether to synthesize a click.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchEnd = function (event) {
	'use strict';
	if (!this.trackingClick) { return true; }

	if ((event.timeStamp - this.lastClickTime) < this.tapDelay) {
		this.cancelNextClick = true;
		return true;
	}

	this.cancelNextClick = false;
	this.lastClickTime   = event.timeStamp;

	var target = this.targetElement;
	var trackingStart = this.trackingClickStart;
	this._resetTracking();

	if (deviceIsIOSWithBadTarget) {
		target = _resolveBadTarget(event, target);
	}

	var tag = target.tagName.toLowerCase();

	if (tag === 'label') {
		var control = this.findControl(target);
		if (control) {
			this.focus(target);
			if (deviceIsAndroid) { return false; }
			target = control;
		}
	} else if (this.needsFocus(target)) {
		if (_shouldFocusEarly(event.timeStamp, trackingStart, target)) {
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
		if (_wasScrolledDuringTap(target)) { return true; }
	}

	if (!this.needsClick(target)) {
		event.preventDefault();
		this.sendClick(target, event);
	}

	return false;
};

/**
 * Touch cancel handler – clears tracking state.
 */
FastClick.prototype.onTouchCancel = function () {
	'use strict';
	this._resetTracking();
};

/**
 * Mouse event handler – filters out synthetic mouse events.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onMouse = function (event) {
	'use strict';
	if (!this.targetElement) { return true; }
	if (event.forwardedTouchEvent) { return true; }
	if (!event.cancelable) { return true; }

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
	if (!permitted) { this.targetElement = null; }
	return permitted;
};

/* ------------------------------------------------------------------------ */
/* Utility methods                                                          */
/* ------------------------------------------------------------------------ */

/**
 * Find the control associated with a label element.
 *
 * @param {EventTarget|HTMLLabelElement} labelElement
 * @returns {Element|null}
 */
FastClick.prototype.findControl = function (labelElement) {
	'use strict';
	if (labelElement.control !== undefined) { return labelElement.control; }
	if (labelElement.htmlFor) { return document.getElementById(labelElement.htmlFor); }
	return labelElement.querySelector('button, input:not([type=hidden]), keygen, meter, output, progress, select, textarea');
};

/**
 * Destroy all FastClick listeners attached to the layer.
 */
FastClick.prototype.destroy = function () {
	'use strict';
	var layer = this.layer;

	if (deviceIsAndroid) {
		layer.removeEventListener('mouseover', this.onMouse, true);
		layer.removeEventListener('mousedown',  this.onMouse, true);
		layer.removeEventListener('mouseup',    this.onMouse, true);
	}
	layer.removeEventListener('click',      this.onClick,      true);
	layer.removeEventListener('touchstart', this.onTouchStart, false);
	layer.removeEventListener('touchmove',  this.onTouchMove,  false);
	layer.removeEventListener('touchend',   this.onTouchEnd,   false);
	layer.removeEventListener('touchcancel',this.onTouchCancel,false);
};

/* ------------------------------------------------------------------------ */
/* FastClick static helpers                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Determine whether FastClick is required for the given layer.
 *
 * @param {Element} layer The layer to listen on
 * @returns {boolean}
 */
FastClick.notNeeded = function (layer) {
	'use strict';
	if (typeof window.ontouchstart === 'undefined') { return true; }

	var chromeVersion = _getChromeVersion();
	if (chromeVersion) {
		if (deviceIsAndroid) {
			var meta = document.querySelector('meta[name=viewport]');
			if (meta) {
				if (meta.content.indexOf('user-scalable=no') !== -1) { return true; }
				if (chromeVersion > 31 && document.documentElement.scrollWidth <= window.outerWidth) { return true; }
			}
		} else {
			return true; // Chrome desktop
		}
	}

	if (deviceIsBlackBerry10 && _isBlackBerrySupported()) { return true; }

	if (layer.style.msTouchAction === 'none') { return true; }

	return false;
};

/**
 * Attach FastClick to a layer.
 *
 * @param {Element} layer The layer to listen on
 * @param {Object} [options] Options to override the defaults
 * @returns {FastClick}
 */
FastClick.attach = function (layer, options) {
	'use strict';
	return new FastClick(layer, options);
};

/* ------------------------------------------------------------------------ */
/* Internal helper functions                                                */
/* ------------------------------------------------------------------------ */

function _getChromeVersion() {
	var match = /Chrome\/([0-9]+)/.exec(navigator.userAgent);
	return match ? +match[1] : 0;
}

function _isBlackBerrySupported() {
	var versionMatch = navigator.userAgent.match(/Version\/([0-9]*)\.([0-9]*)/);
	if (!versionMatch) { return false; }
	var major = +versionMatch[1], minor = +versionMatch[2];
	if (major < 10 || (major === 10 && minor < 3)) { return false; }

	var meta = document.querySelector('meta[name=viewport]');
	if (!meta) { return false; }
	if (meta.content.indexOf('user-scalable=no') !== -1) { return true; }
	if (document.documentElement.scrollWidth <= window.outerWidth) { return true; }

	return false;
}

function _iosShouldIgnoreSelection() {
	var sel = window.getSelection();
	return sel.rangeCount && !sel.isCollapsed;
}

function _resolveBadTarget(event, fallbackTarget) {
	var touch = event.changedTouches[0];
	var target = document.elementFromPoint(
		touch.pageX - window.pageXOffset,
		touch.pageY - window.pageYOffset
	) || fallbackTarget;
	target.fastClickScrollParent = fallbackTarget.fastClickScrollParent;
	return target;
}

function _shouldFocusEarly(eventTime, trackingStart, target) {
	var tag = target.tagName.toLowerCase();
	if ((eventTime - trackingStart) > 100) { return false; }
	if (deviceIsIOS && window.top !== window && tag === 'input') { return false; }
	return true;
}

function _wasScrolledDuringTap(target) {
	var scrollParent = target.fastClickScrollParent;
	return scrollParent && scrollParent.fastClickLastScrollTop !== scrollParent.scrollTop;
}

/* ------------------------------------------------------------------------ */
/* Module export                                                            */
/* ------------------------------------------------------------------------ */
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