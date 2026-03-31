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

// Event handler binding utility
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
	setupAndroidListeners(layer, handlers) {
		if (DeviceDetector.isAndroid) {
			['mouseover', 'mousedown', 'mouseup'].forEach(event => {
				layer.addEventListener(event, handlers.onMouse, true);
			});
		}
	},
	
	setupTouchListeners(layer, handlers) {
		const touchEvents = [
			{ name: 'click', handler: 'onClick', capture: true },
			{ name: 'touchstart', handler: 'onTouchStart', capture: false },
			{ name: 'touchmove', handler: 'onTouchMove', capture: false },
			{ name: 'touchend', handler: 'onTouchEnd', capture: false },
			{ name: 'touchcancel', handler: 'onTouchCancel', capture: false }
		];
		
		touchEvents.forEach(({ name, handler, capture }) => {
			layer.addEventListener(name, handlers[handler], capture);
		});
	},
	
	setupEventPropagationHack(layer) {
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
	
	migrateInlineClickHandler(layer) {
		if (typeof layer.onclick !== 'function') return;
		
		const oldOnClick = layer.onclick;
		layer.addEventListener('click', (event) => oldOnClick(event), false);
		layer.onclick = null;
	}
};

// Touch state management
class TouchState {
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
const TargetElementUtils = {
	getFromEventTarget(eventTarget) {
		if (eventTarget.nodeType === Node.TEXT_NODE) {
			return eventTarget.parentNode;
		}
		return eventTarget;
	},
	
	needsClick(target) {
		const nodeName = target.nodeName.toLowerCase();
		
		const clickRequiredElements = {
			'button': () => target.disabled,
			'select': () => target.disabled,
			'textarea': () => target.disabled,
			'input': () => (DeviceDetector.isIOS && target.type === 'file') || target.disabled,
			'label': () => true,
			'video': () => true
		};
		
		if (clickRequiredElements[nodeName]) {
			return clickRequiredElements[nodeName]();
		}
		
		return (/\bneedsclick\b/).test(target.className);
	},
	
	needsFocus(target) {
		const nodeName = target.nodeName.toLowerCase();
		
		if (nodeName === 'textarea') return true;
		if (nodeName === 'select') return !DeviceDetector.isAndroid;
		
		if (nodeName === 'input') {
			const noFocusTypes = ['button', 'checkbox', 'file', 'image', 'radio', 'submit'];
			if (noFocusTypes.includes(target.type)) return false;
			return !target.disabled && !target.readOnly;
		}
		
		return (/\bneedsfocus\b/).test(target.className);
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

// Focus management
const FocusManager = {
	focus(targetElement) {
		if (DeviceDetector.isIOS && targetElement.setSelectionRange && 
			targetElement.type.indexOf('date') !== 0 && targetElement.type !== 'time') {
			const length = targetElement.value.length;
			targetElement.setSelectionRange(length, length);
		} else {
			targetElement.focus();
		}
	},
	
	blurActiveElement(targetElement) {
		if (document.activeElement && document.activeElement !== targetElement) {
			document.activeElement.blur();
		}
	}
};

// Click event synthesis
const ClickSynthesizer = {
	determineEventType(targetElement) {
		if (DeviceDetector.isAndroid && targetElement.tagName.toLowerCase() === 'select') {
			return 'mousedown';
		}
		return 'click';
	},
	
	send(targetElement, event) {
		FocusManager.blurActiveElement(targetElement);
		
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
	}
};

/**
 * FastClick constructor
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
	this.touchState = new TouchState(options);
	
	const handlers = {
		onMouse: this.onMouse.bind(this),
		onClick: this.onClick.bind(this),
		onTouchStart: this.onTouchStart.bind(this),
		onTouchMove: this.onTouchMove.bind(this),
		onTouchEnd: this.onTouchEnd.bind(this),
		onTouchCancel: this.onTouchCancel.bind(this)
	};
	
	this.handlers = handlers;
	
	EventManager.setupAndroidListeners(layer, handlers);
	EventManager.setupTouchListeners(layer, handlers);
	EventManager.setupEventPropagationHack(layer);
	EventManager.migrateInlineClickHandler(layer);
}

FastClick.prototype.onTouchStart = function(event) {
	'use strict';
	
	if (event.targetTouches.length > 1) {
		return true;
	}
	
	const targetElement = TargetElementUtils.getFromEventTarget(event.target);
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
	
	if ((event.timeStamp - this.touchState.lastClickTime) < this.touchState.tapDelay) {
		event.preventDefault();
	}
	
	return true;
};

FastClick.prototype.touchHasMoved = function(event) {
	'use strict';
	const touch = event.changedTouches[0];
	const boundary = this.touchState.touchBoundary;
	
	return Math.abs(touch.pageX - this.touchState.touchStartX) > boundary ||
		   Math.abs(touch.pageY - this.touchState.touchStartY) > boundary;
};

FastClick.prototype.onTouchMove = function(event) {
	'use strict';
	
	if (!this.touchState.trackingClick) {
		return true;
	}
	
	if (this.touchState.targetElement !== TargetElementUtils.getFromEventTarget(event.target) ||
		this.touchHasMoved(event)) {
		this.touchState.reset();
	}
	
	return true;
};

FastClick.prototype.onTouchEnd = function(event) {
	'use strict';
	
	if (!this.touchState.trackingClick) {
		return true;
	}
	
	if ((event.timeStamp - this.touchState.lastClickTime) < this.touchState.tapDelay) {
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
		targetElement = document.elementFromPoint(
			touch.pageX - window.pageXOffset,
			touch.pageY - window.pageYOffset
		) || targetElement;
		targetElement.fastClickScrollParent = this.touchState.targetElement?.fastClickScrollParent;
	}
	
	const targetTagName = targetElement.tagName.toLowerCase();
	
	if (targetTagName === 'label') {
		const forElement = TargetElementUtils.findControl(targetElement);
		if (forElement) {
			FocusManager.focus(targetElement);
			if (DeviceDetector.isAndroid) {
				return false;
			}
			targetElement = forElement;
		}
	} else if (TargetElementUtils.needsFocus(targetElement)) {
		if ((event.timeStamp - trackingClickStart) > 100 ||
			(DeviceDetector.isIOS && window.top !== window && targetTagName === 'input')) {
			this.touchState.targetElement = null;
			return false;
		}
		
		FocusManager.focus(targetElement);
		ClickSynthesizer.send(targetElement, event);
		
		if (!DeviceDetector.isIOS || targetTagName !== 'select') {
			this.touchState.targetElement = null;
			event.preventDefault();
		}
		
		return false;
	}
	
	if (DeviceDetector.isIOS && !DeviceDetector.isIOS4) {
		if (ScrollParentTracker.hasScrolled(targetElement)) {
			return true;
		}
	}
	
	if (!TargetElementUtils.needsClick(targetElement)) {
		event.preventDefault();
		ClickSynthesizer.send(targetElement, event);
	}
	
	return false;
};

FastClick.prototype.onTouchCancel = function() {
	'use strict';
	this.touchState.reset();
};

FastClick.prototype.onMouse = function(event) {
	'use strict';
	
	if (!this.touchState.targetElement) {
		return true;
	}
	
	if (event.forwardedTouchEvent) {
		return true;
	}
	
	if (!event.cancelable) {
		return true;
	}
	
	if (!TargetElementUtils.needsClick(this.touchState.targetElement) || this.touchState.cancelNextClick) {
		if (event.stopImmediatePropagation) {
			event.stopImmediatePropagation();
		} else {
			event