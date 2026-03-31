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
	
	init() {
		this.isIOS4 = this.isIOS && (/OS 4_\d(_\d)?/).test(navigator.userAgent);
		this.isIOSWithBadTarget = this.isIOS && (/OS ([6-9]|\d{2})_\d/).test(navigator.userAgent);
	}
};
DeviceDetector.init();

// Event binding utility
const EventBinder = {
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
const EventManager = {
	setupEventListeners(layer, context) {
		const listeners = [
			{ event: 'click', handler: 'onClick', capture: true },
			{ event: 'touchstart', handler: 'onTouchStart', capture: false },
			{ event: 'touchmove', handler: 'onTouchMove', capture: false },
			{ event: 'touchend', handler: 'onTouchEnd', capture: false },
			{ event: 'touchcancel', handler: 'onTouchCancel', capture: false }
		];
		
		if (DeviceDetector.isAndroid) {
			listeners.unshift(
				{ event: 'mouseover', handler: 'onMouse', capture: true },
				{ event: 'mousedown', handler: 'onMouse', capture: true },
				{ event: 'mouseup', handler: 'onMouse', capture: true }
			);
		}
		
		listeners.forEach(({ event, handler, capture }) => {
			layer.addEventListener(event, context[handler], capture);
		});
	},
	
	removeEventListeners(layer, context) {
		const listeners = [
			{ event: 'click', handler: 'onClick', capture: true },
			{ event: 'touchstart', handler: 'onTouchStart', capture: false },
			{ event: 'touchmove', handler: 'onTouchMove', capture: false },
			{ event: 'touchend', handler: 'onTouchEnd', capture: false },
			{ event: 'touchcancel', handler: 'onTouchCancel', capture: false }
		];
		
		if (DeviceDetector.isAndroid) {
			listeners.unshift(
				{ event: 'mouseover', handler: 'onMouse', capture: true },
				{ event: 'mousedown', handler: 'onMouse', capture: true },
				{ event: 'mouseup', handler: 'onMouse', capture: true }
			);
		}
		
		listeners.forEach(({ event, handler, capture }) => {
			layer.removeEventListener(event, context[handler], capture);
		});
	},
	
	setupPropagationHack(layer) {
		if (Event.prototype.stopImmediatePropagation) return;
		
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
	
	migrateOnClickHandler(layer) {
		if (typeof layer.onclick !== 'function') return;
		
		const oldOnClick = layer.onclick;
		layer.addEventListener('click', (event) => oldOnClick(event), false);
		layer.onclick = null;
	}
};

// Touch state management
class TouchState {
	constructor() {
		this.trackingClick = false;
		this.trackingClickStart = 0;
		this.targetElement = null;
		this.touchStartX = 0;
		this.touchStartY = 0;
		this.lastTouchIdentifier = 0;
		this.lastClickTime = 0;
		this.cancelNextClick = false;
	}
	
	reset() {
		this.trackingClick = false;
		this.trackingClickStart = 0;
		this.targetElement = null;
	}
	
	startTracking(event, targetElement) {
		const touch = event.targetTouches[0];
		this.trackingClick = true;
		this.trackingClickStart = event.timeStamp;
		this.targetElement = targetElement;
		this.touchStartX = touch.pageX;
		this.touchStartY = touch.pageY;
	}
}

// Target element utilities
const TargetUtils = {
	getFromEventTarget(eventTarget) {
		if (eventTarget.nodeType === Node.TEXT_NODE) {
			return eventTarget.parentNode;
		}
		return eventTarget;
	},
	
	findControl(labelElement) {
		if (labelElement.control !== undefined) {
			return labelElement.control;
		}
		if (labelElement.htmlFor) {
			return document.getElementById(labelElement.htmlFor);
		}
		return labelElement.querySelector('button, input:not([type=hidden]), keygen, meter, output, progress, select, textarea');
	}
};

// Click validation
const ClickValidator = {
	needsClick(target) {
		const nodeName = target.nodeName.toLowerCase();
		
		if (['button', 'select', 'textarea'].includes(nodeName)) {
			return target.disabled;
		}
		
		if (nodeName === 'input') {
			if ((DeviceDetector.isIOS && target.type === 'file') || target.disabled) {
				return true;
			}
			return false;
		}
		
		if (['label', 'video'].includes(nodeName)) {
			return true;
		}
		
		return (/\bneedsclick\b/).test(target.className);
	},
	
	needsFocus(target) {
		const nodeName = target.nodeName.toLowerCase();
		
		if (nodeName === 'textarea') return true;
		if (nodeName === 'select') return !DeviceDetector.isAndroid;
		
		if (nodeName === 'input') {
			if (['button', 'checkbox', 'file', 'image', 'radio', 'submit'].includes(target.type)) {
				return false;
			}
			return !target.disabled && !target.readOnly;
		}
		
		return (/\bneedsfocus\b/).test(target.className);
	},
	
	touchHasMoved(touchStartX, touchStartY, event, boundary) {
		const touch = event.changedTouches[0];
		return Math.abs(touch.pageX - touchStartX) > boundary || 
		       Math.abs(touch.pageY - touchStartY) > boundary;
	}
};

// Scroll parent tracking
const ScrollParentTracker = {
	update(targetElement) {
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
	},
	
	hasScrolled(targetElement) {
		const scrollParent = targetElement.fastClickScrollParent;
		return scrollParent && scrollParent.fastClickLastScrollTop !== scrollParent.scrollTop;
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
	
	options = options || {};
	
	this.layer = layer;
	this.touchBoundary = options.touchBoundary || 10;
	this.tapDelay = options.tapDelay || 200;
	this.touchState = new TouchState();
	
	if (FastClick.notNeeded(layer)) {
		return;
	}
	
	const methodNames = ['onMouse', 'onClick', 'onTouchStart', 'onTouchMove', 'onTouchEnd', 'onTouchCancel'];
	EventBinder.bindMethods(this, methodNames);
	
	EventManager.setupEventListeners(layer, this);
	EventManager.setupPropagationHack(layer);
	EventManager.migrateOnClickHandler(layer);
}

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
	
	clickEvent.initMouseEvent(eventType, true, true, window, 1, touch.screenX, touch.screenY, touch.clientX, touch.clientY, false, false, false, false, 0, null);
	clickEvent.forwardedTouchEvent = true;
	targetElement.dispatchEvent(clickEvent);
};

FastClick.prototype.determineEventType = function(targetElement) {
	'use strict';
	if (DeviceDetector.isAndroid && targetElement.tagName.toLowerCase() === 'select') {
		return 'mousedown';
	}
	return 'click';
};

/**
 * @param {EventTarget|Element} targetElement
 */
FastClick.prototype.focus = function(targetElement) {
	'use strict';
	
	if (DeviceDetector.isIOS && targetElement.setSelectionRange && 
	    targetElement.type.indexOf('date') !== 0 && targetElement.type !== 'time') {
		const length = targetElement.value.length;
		targetElement.setSelectionRange(length, length);
	} else {
		targetElement.focus();
	}
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
	
	const targetElement = TargetUtils.getFromEventTarget(event.target);
	const touch = event.targetTouches[0];
	
	if (DeviceDetector.isIOS) {
		const selection = window.getSelection();
		if (selection.rangeCount && !selection.isCollapsed) {
			return true;
		}
		
		if (!DeviceDetector.isIOS4) {
			if (touch.identifier === this.touchState.lastTouchIdentifier) {
				event.preventDefault();
				return false;
			}
			
			this.touchState.lastTouchIdentifier = touch.identifier;
			ScrollParentTracker.update(targetElement);
		}
	}
	
	this.touchState.startTracking(event, targetElement);
	
	if ((event.timeStamp - this.touchState.lastClickTime) < this.tapDelay) {
		event.preventDefault();
	}
	
	return true;
};

/**
 * Update the last position.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchMove = function(event) {
	'use strict';
	
	if (!this.touchState.trackingClick) {
		return true;
	}
	
	const targetElement = TargetUtils.getFromEventTarget(event.target);
	if (this.touchState.targetElement !== targetElement || 
	    ClickValidator.touchHasMoved(this.touchState.touchStartX, this.touchState.touchStartY, event, this.touchBoundary)) {
		this.touchState.reset();
	}
	
	return true;
};

/**
 * On touch end, determine whether to send a click event at once.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchEnd = function(event) {
	'use strict';
	
	if (!this.touchState.trackingClick) {
		return true;
	}
	
	if ((event.timeStamp - this.touchState.lastClickTime) < this.tapDelay) {
		this.touchState.cancelNextClick = true;
		return true;
	}
	
	this.touchState.cancelNextClick = false;
	this.touchState.lastClickTime = event.timeStamp;
	
	const trackingClickStart = this.touchState.trackingClickStart;
	let targetElement = this.touchState.targetElement;
	this.touchState.reset();
	
	if (DeviceDetector.isIOSWithBadTarget) {
		const touch = event.changedTouches[0];
		targetElement = document.elementFromPoint(touch.pageX - window.pageXOffset, touch.pageY - window.pageYOffset) || targetElement;
		targetElement.fastClickScrollParent = this.touchState.targetElement?.fastClickScrollParent;
	}
	
	const targetTagName = targetElement.tagName.toLowerCase();
	
	if (targetTagName === 'label') {
		const forElement = TargetUtils.findControl(targetElement);
		if (forElement) {
			this.focus(targetElement);
			if (DeviceDetector.isAndroid) {
				return false;
			}
			targetElement = forElement;
		}
	} else if (ClickValidator.needsFocus(targetElement)) {
		if ((event.timeStamp - trackingClickStart) > 100 || 
		    (DeviceDetector.isIOS && window.top !== window && targetTagName === 'input')) {
			return false;
		}
		
		this.focus(targetElement);
		this.sendClick(targetElement, event);
		
		if (!DeviceDetector.isIOS || targetTagName !== 'select') {
			event.preventDefault();