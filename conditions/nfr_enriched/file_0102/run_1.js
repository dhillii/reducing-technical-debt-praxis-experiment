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
const DeviceDetector = {
	isAndroid: navigator.userAgent.indexOf('Android') > 0,
	isIOS: /iP(ad|hone|od)/.test(navigator.userAgent),
	isIOS4: false,
	isIOSWithBadTarget: false,
	isBlackBerry10: navigator.userAgent.indexOf('BB10') > 0,
	chromeVersion: +(/Chrome\/([0-9]+)/.exec(navigator.userAgent) || [, 0])[1],

	init() {
		this.isIOS4 = this.isIOS && (/OS 4_\d(_\d)?/).test(navigator.userAgent);
		this.isIOSWithBadTarget = this.isIOS && (/OS ([6-9]|\d{2})_\d/).test(navigator.userAgent);
	}
};

DeviceDetector.init();

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
	androidEvents: ['mouseover', 'mousedown', 'mouseup'],
	touchEvents: ['touchstart', 'touchmove', 'touchend', 'touchcancel'],
	allEvents: ['click'],

	attach(layer, handlers) {
		if (DeviceDetector.isAndroid) {
			this.androidEvents.forEach(event => {
				layer.addEventListener(event, handlers.onMouse, true);
			});
		}

		this.allEvents.forEach(event => {
			layer.addEventListener(event, handlers.onClick, true);
		});

		this.touchEvents.forEach(event => {
			const useCapture = event === 'touchstart';
			layer.addEventListener(event, handlers[`on${this.capitalize(event)}`], useCapture);
		});
	},

	detach(layer, handlers) {
		if (DeviceDetector.isAndroid) {
			this.androidEvents.forEach(event => {
				layer.removeEventListener(event, handlers.onMouse, true);
			});
		}

		this.allEvents.forEach(event => {
			layer.removeEventListener(event, handlers.onClick, true);
		});

		this.touchEvents.forEach(event => {
			const useCapture = event === 'touchstart';
			layer.removeEventListener(event, handlers[`on${this.capitalize(event)}`], useCapture);
		});
	},

	capitalize(str) {
		return str.charAt(0).toUpperCase() + str.slice(1);
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

// Element classification
const ElementClassifier = {
	needsClick(target) {
		const nodeName = target.nodeName.toLowerCase();
		const disabledElements = ['button', 'select', 'textarea'];

		if (disabledElements.includes(nodeName) && target.disabled) {
			return true;
		}

		if (nodeName === 'input') {
			if ((DeviceDetector.isIOS && target.type === 'file') || target.disabled) {
				return true;
			}
		}

		if (['label', 'video'].includes(nodeName)) {
			return true;
		}

		return (/\bneedsclick\b/).test(target.className);
	},

	needsFocus(target) {
		const nodeName = target.nodeName.toLowerCase();

		if (nodeName === 'textarea') {
			return true;
		}

		if (nodeName === 'select') {
			return !DeviceDetector.isAndroid;
		}

		if (nodeName === 'input') {
			const nonFocusableTypes = ['button', 'checkbox', 'file', 'image', 'radio', 'submit'];
			if (nonFocusableTypes.includes(target.type)) {
				return false;
			}
			return !target.disabled && !target.readOnly;
		}

		return (/\bneedsfocus\b/).test(target.className);
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

	hasMoved(touch) {
		const deltaX = Math.abs(touch.pageX - this.touchStartX);
		const deltaY = Math.abs(touch.pageY - this.touchStartY);
		return deltaX > this.touchBoundary || deltaY > this.touchBoundary;
	}
}

// Click event synthesis
class ClickSynthesizer {
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

	static determineEventType(targetElement) {
		if (DeviceDetector.isAndroid && targetElement.tagName.toLowerCase() === 'select') {
			return 'mousedown';
		}
		return 'click';
	}

	static focus(targetElement) {
		if (DeviceDetector.isIOS && targetElement.setSelectionRange &&
			targetElement.type.indexOf('date') !== 0 && targetElement.type !== 'time') {
			const length = targetElement.value.length;
			targetElement.setSelectionRange(length, length);
		} else {
			targetElement.focus();
		}
	}
}

// Label control finder
class LabelControlFinder {
	static find(labelElement) {
		if (labelElement.control !== undefined) {
			return labelElement.control;
		}

		if (labelElement.htmlFor) {
			return document.getElementById(labelElement.htmlFor);
		}

		return labelElement.querySelector('button, input:not([type=hidden]), keygen, meter, output, progress, select, textarea');
	}
}

// Scroll parent tracking
class ScrollParentTracker {
	static update(targetElement) {
		let scrollParent = targetElement.fastClickScrollParent;

		if (!scrollParent || !scrollParent.contains(targetElement)) {
			let parentElement = targetElement;
			while (parentElement) {
				if (parentElement.scrollHeight > parentElement.offsetHeight) {
					scrollParent = parentElement;
					targetElement.fastClickScrollParent = parentElement;
					break;
				}
				parentElement = parentElement.parentElement;
			}
		}

		if (scrollParent) {
			scrollParent.fastClickLastScrollTop = scrollParent.scrollTop;
		}
	}

	static hasScrolled(targetElement) {
		const scrollParent = targetElement.fastClickScrollParent;
		return scrollParent && scrollParent.fastClickLastScrollTop !== scrollParent.scrollTop;
	}
}

/**
 * FastClick: main class
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

	PropagationPolyfill.apply(layer);
	EventListenerManager.attach(layer, this);
	this.attachExistingOnClickHandler(layer);
}

FastClick.prototype.attachExistingOnClickHandler = function(layer) {
	if (typeof layer.onclick === 'function') {
		const oldOnClick = layer.onclick;
		layer.addEventListener('click', (event) => oldOnClick(event), false);
		layer.onclick = null;
	}
};

FastClick.prototype.getTargetElementFromEventTarget = function(eventTarget) {
	return eventTarget.nodeType === Node.TEXT_NODE ? eventTarget.parentNode : eventTarget;
};

FastClick.prototype.onTouchStart = function(event) {
	'use strict';

	if (event.targetTouches.length > 1) {
		return true;
	}

	const targetElement = this.getTargetElementFromEventTarget(event.target);
	const touch = event.targetTouches[0];

	if (DeviceDetector.isIOS) {
		const selection = window.getSelection();
		if (selection.rangeCount && !selection.isCollapsed) {
			return true;
		}

		if (!DeviceDetector.isIOS4 && touch.identifier === this.tracker.lastTouchIdentifier) {
			event.preventDefault();
			return false;
		}

		this.tracker.lastTouchIdentifier = touch.identifier;

		if (!DeviceDetector.isIOS4) {
			ScrollParentTracker.update(targetElement);
		}
	}

	this.tracker.trackingClick = true;
	this.tracker.trackingClickStart = event.timeStamp;
	this.tracker.targetElement = targetElement;
	this.tracker.touchStartX = touch.pageX;
	this.tracker.touchStartY = touch.pageY;

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

	const currentTarget = this.getTargetElementFromEventTarget(event.target);
	if (currentTarget !== this.tracker.targetElement || this.tracker.hasMoved(event.changedTouches[0])) {
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
	let targetElement = this.tracker.targetElement;
	this.tracker.reset();

	if (DeviceDetector.isIOSWithBadTarget) {
		const touch = event.changedTouches[0];
		targetElement = document.elementFromPoint(
			touch.pageX - window.pageXOffset,
			touch.pageY - window.pageYOffset
		) || targetElement;
		targetElement.fastClickScrollParent = this.tracker.targetElement.fastClickScrollParent;
	}

	const targetTagName = targetElement.tagName.toLowerCase();

	if (targetTagName === 'label') {
		const forElement = LabelControlFinder.find(targetElement);
		if (forElement) {
			ClickSynthesizer.focus(targetElement);
			if (DeviceDetector.isAndroid) {
				return false;
			}
			targetElement = forElement;
		}
	} else if (ElementClassifier.needsFocus(targetElement)) {
		if ((event.timeStamp - trackingClickStart) > 100 ||
			(DeviceDetector.isIOS && window.top !== window && targetTagName === 'input')) {
			this.tracker.targetElement = null;
			return false;
		}

		ClickSynthesizer.focus(targetElement);
		ClickSynthesizer.sendClick(targetElement, event);

		if (!DeviceDetector.isIOS || targetTagName !== 'select') {
			this.tracker.targetElement = null;
			event.preventDefault();
		}

		return false;
	}

	if (DeviceDetector.isIOS && !DeviceDetector.isIOS4 && ScrollParentTracker.hasScrolled(targetElement)) {
		return true;
	}

	if (!ElementClassifier.needsClick(targetElement)) {
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

	if (event.forwardedTouchEvent || !event.cancelable) {
		return true;
	}

	if (!ElementClassifier.needsClick(this.tracker.targetElement) || this.tracker.cancelNextClick) {
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

	const permitted