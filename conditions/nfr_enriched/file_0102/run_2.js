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

// Event handler binding utility
const EventHandlerBinder = {
	bind(method, context) {
		return function() { return method.apply(context, arguments); };
	},

	bindMethods(context, methodNames) {
		methodNames.forEach(name => {
			context[name] = this.bind(context[name], context);
		});
	}
};

// Event listener management
const EventListenerManager = {
	setupEventListeners(layer, handlers) {
		if (DeviceDetection.isAndroid) {
			['mouseover', 'mousedown', 'mouseup'].forEach(event => {
				layer.addEventListener(event, handlers.onMouse, true);
			});
		}

		layer.addEventListener('click', handlers.onClick, true);
		layer.addEventListener('touchstart', handlers.onTouchStart, false);
		layer.addEventListener('touchmove', handlers.onTouchMove, false);
		layer.addEventListener('touchend', handlers.onTouchEnd, false);
		layer.addEventListener('touchcancel', handlers.onTouchCancel, false);
	},

	removeEventListeners(layer, handlers) {
		if (DeviceDetection.isAndroid) {
			['mouseover', 'mousedown', 'mouseup'].forEach(event => {
				layer.removeEventListener(event, handlers.onMouse, true);
			});
		}

		layer.removeEventListener('click', handlers.onClick, true);
		layer.removeEventListener('touchstart', handlers.onTouchStart, false);
		layer.removeEventListener('touchmove', handlers.onTouchMove, false);
		layer.removeEventListener('touchend', handlers.onTouchEnd, false);
		layer.removeEventListener('touchcancel', handlers.onTouchCancel, false);
	},

	patchEventListenersForOldBrowsers(layer) {
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
	},

	migrateExistingOnClickHandler(layer) {
		if (typeof layer.onclick !== 'function') {
			return;
		}

		const oldOnClick = layer.onclick;
		layer.addEventListener('click', event => oldOnClick(event), false);
		layer.onclick = null;
	}
};

// Touch tracking state
class TouchTracker {
	constructor(options = {}) {
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
	}

	reset() {
		this.trackingClick = false;
		this.trackingClickStart = 0;
		this.targetElement = null;
	}

	updateTouchStart(touch) {
		this.touchStartX = touch.pageX;
		this.touchStartY = touch.pageY;
	}

	hasTouchMoved(touch) {
		const dx = Math.abs(touch.pageX - this.touchStartX);
		const dy = Math.abs(touch.pageY - this.touchStartY);
		return dx > this.touchBoundary || dy > this.touchBoundary;
	}
}

// Element utilities
const ElementUtils = {
	getTargetElement(eventTarget) {
		return eventTarget.nodeType === Node.TEXT_NODE ? eventTarget.parentNode : eventTarget;
	},

	findLabelControl(labelElement) {
		if (labelElement.control !== undefined) {
			return labelElement.control;
		}

		if (labelElement.htmlFor) {
			return document.getElementById(labelElement.htmlFor);
		}

		return labelElement.querySelector('button, input:not([type=hidden]), keygen, meter, output, progress, select, textarea');
	},

	needsClick(target) {
		const nodeName = target.nodeName.toLowerCase();

		switch (nodeName) {
			case 'button':
			case 'select':
			case 'textarea':
				return target.disabled;
			case 'input':
				if ((DeviceDetection.isIOS && target.type === 'file') || target.disabled) {
					return true;
				}
				return false;
			case 'label':
			case 'video':
				return true;
			default:
				return (/\bneedsclick\b/).test(target.className);
		}
	},

	needsFocus(target) {
		const nodeName = target.nodeName.toLowerCase();

		switch (nodeName) {
			case 'textarea':
				return true;
			case 'select':
				return !DeviceDetection.isAndroid;
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
	},

	updateScrollParent(targetElement) {
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
	}
};

// Click event synthesis
class ClickSynthesizer {
	static determineEventType(targetElement) {
		if (DeviceDetection.isAndroid && targetElement.tagName.toLowerCase() === 'select') {
			return 'mousedown';
		}
		return 'click';
	}

	static sendClick(targetElement, event) {
		if (document.activeElement && document.activeElement !== targetElement) {
			document.activeElement.blur();
		}

		const touch = event.changedTouches[0];
		const clickEvent = document.createEvent('MouseEvents');
		const eventType = this.determineEventType(targetElement);

		clickEvent.initMouseEvent(
			eventType, true, true, window, 1,
			touch.screenX, touch.screenY,
			touch.clientX, touch.clientY,
			false, false, false, false, 0, null
		);
		clickEvent.forwardedTouchEvent = true;
		targetElement.dispatchEvent(clickEvent);
	}

	static focus(targetElement) {
		if (DeviceDetection.isIOS && targetElement.setSelectionRange &&
			targetElement.type.indexOf('date') !== 0 && targetElement.type !== 'time') {
			const length = targetElement.value.length;
			targetElement.setSelectionRange(length, length);
		} else {
			targetElement.focus();
		}
	}
}

/**
 * FastClick: Instantiate fast-clicking listeners on the specified layer.
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

	this.layer = layer;
	this.tracker = new TouchTracker(options);

	const methodNames = ['onMouse', 'onClick', 'onTouchStart', 'onTouchMove', 'onTouchEnd', 'onTouchCancel'];
	EventHandlerBinder.bindMethods(this, methodNames);

	EventListenerManager.patchEventListenersForOldBrowsers(layer);
	EventListenerManager.setupEventListeners(layer, this);
	EventListenerManager.migrateExistingOnClickHandler(layer);
}

FastClick.prototype.onTouchStart = function(event) {
	'use strict';

	if (event.targetTouches.length > 1) {
		return true;
	}

	const targetElement = ElementUtils.getTargetElement(event.target);
	const touch = event.targetTouches[0];

	if (DeviceDetection.isIOS) {
		const selection = window.getSelection();
		if (selection.rangeCount && !selection.isCollapsed) {
			return true;
		}

		if (!DeviceDetection.isIOS4 && touch.identifier === this.tracker.lastTouchIdentifier) {
			event.preventDefault();
			return false;
		}

		this.tracker.lastTouchIdentifier = touch.identifier;

		if (!DeviceDetection.isIOS4) {
			ElementUtils.updateScrollParent(targetElement);
		}
	}

	this.tracker.trackingClick = true;
	this.tracker.trackingClickStart = event.timeStamp;
	this.tracker.targetElement = targetElement;
	this.tracker.updateTouchStart(touch);

	if ((event.timeStamp - this.tracker.lastClickTime) < this.tracker.tapDelay) {
		event.preventDefault();
	}

	return true;
};

FastClick.prototype.onTouchMove = function(event) {
	'use strict';

	if (!this.tracker.trackingClick) {
		return true;
	}

	const targetElement = ElementUtils.getTargetElement(event.target);
	if (targetElement !== this.tracker.targetElement || this.tracker.hasTouchMoved(event.changedTouches[0])) {
		this.tracker.reset();
	}

	return true;
};

FastClick.prototype.onTouchEnd = function(event) {
	'use strict';

	if (!this.tracker.trackingClick) {
		return true;
	}

	if ((event.timeStamp - this.tracker.lastClickTime) < this.tracker.tapDelay) {
		this.tracker.cancelNextClick = true;
		return true;
	}

	this.tracker.cancelNextClick = false;
	this.tracker.lastClickTime = event.timeStamp;

	const trackingClickStart = this.tracker.trackingClickStart;
	this.tracker.reset();

	let targetElement = this.tracker.targetElement;

	if (DeviceDetection.isIOSWithBadTarget) {
		const touch = event.changedTouches[0];
		targetElement = document.elementFromPoint(
			touch.pageX - window.pageXOffset,
			touch.pageY - window.pageYOffset
		) || targetElement;
		targetElement.fastClickScrollParent = this.tracker.targetElement.fastClickScrollParent;
	}

	const targetTagName = targetElement.tagName.toLowerCase();

	if (targetTagName === 'label') {
		const forElement = ElementUtils.findLabelControl(targetElement);
		if (forElement) {
			ClickSynthesizer.focus(forElement);
			if (DeviceDetection.isAndroid) {
				return false;
			}
			targetElement = forElement;
		}
	} else if (ElementUtils.needsFocus(targetElement)) {
		if ((event.timeStamp - trackingClickStart) > 100 ||
			(DeviceDetection.isIOS && window.top !== window && targetTagName === 'input')) {
			this.tracker.targetElement = null;
			return false;
		}

		ClickSynthesizer.focus(targetElement);
		ClickSynthesizer.sendClick(targetElement, event);

		if (!DeviceDetection.isIOS || targetTagName !== 'select') {
			this.tracker.targetElement = null;
			event.preventDefault();
		}

		return false;
	}

	if (DeviceDetection.isIOS && !DeviceDetection.isIOS4) {
		const scrollParent = targetElement.fastClickScrollParent;
		if (scrollParent && scrollParent.fastClickLastScrollTop !== scrollParent.scrollTop) {
			return true;
		}
	}

	if (!ElementUtils.needsClick(targetElement)) {
		event.preventDefault();
		ClickSynthesizer.sendClick(targetElement, event);
	}

	return false;
};

FastClick.prototype.onTouchCancel = function() {
	'use strict';
	this.tracker.reset();
};

FastClick.prototype.onMouse = function(event) {
	'use strict';

	if (!this.tracker.targetElement) {
		return true;
	}

	if (event.forwardedTouchEvent) {
		return true;
	}

	if (!event.cancelable) {
		return true;
	}

	if (!ElementUtils.needsClick(this.tracker.targetElement) || this.tracker.cancelNextClick) {
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

FastClick.prototype.onClick = function(event) {
	'use strict';

	if (this.tracker.trackingClick) {
		this.tracker.reset();
		return true;
	}

	if (event.target.type === 'submit' && event.detail === 0) {
		return true;
	}

	const permitted = this.onMouse(event);

	if (!permitted) {
		this.tracker.targetElement = null;
	}

	return permitted;
};

FastClick.prototype.destroy = function() {
	'use strict';
	EventListenerManager.removeEventListeners(this.layer, this);
};

/**
 * Check whether