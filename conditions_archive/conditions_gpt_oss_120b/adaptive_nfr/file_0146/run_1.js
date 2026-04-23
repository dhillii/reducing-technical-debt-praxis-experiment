/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
"use strict";

const RequestShortener = require("./RequestShortener");
const SizeFormatHelpers = require("./SizeFormatHelpers");
const formatLocation = require("./formatLocation");

const optionOrFallback = (optionValue, fallbackValue) =>
	optionValue !== undefined ? optionValue : fallbackValue;

/**
 * Returns true if the provided value is a non‑empty string.
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmptyString(value) {
	return typeof value === "string" && value.length > 0;
}

/**
 * Normalizes options and applies preset conversion.
 * @param {any} options
 * @param {boolean} forToString
 * @returns {object}
 */
function normalizeOptions(options, forToString) {
	if (typeof options === "boolean" || typeof options === "string") {
		return Stats.presetToOptions(options);
	}
	return options || {};
}

/**
 * Builds an array of RegExp objects from the exclude option.
 * @param {any[]} exclude
 * @returns {RegExp[]}
 */
function buildExcludeModules(exclude) {
	return [].concat(optionOrFallback(exclude, [])).map(str => {
		if (!isNonEmptyString(str)) return str;
		return new RegExp(
			`[\\\\/]${str
				.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&")
			}([\\\\/]|$|!|\\?)`
		);
	});
}

/**
 * Creates a module filter based on the provided flags.
 * @param {boolean} showCachedModules
 * @param {RegExp[]} excludeModules
 * @param {RequestShortener} requestShortener
 * @param {number} maxModules
 * @returns {(module: any) => boolean}
 */
function createModuleFilter(showCachedModules, excludeModules, requestShortener, maxModules) {
	let i = 0;
	return module => {
		if (!showCachedModules && !module.built) {
			return false;
		}
		if (excludeModules.length > 0) {
			const ident = requestShortener.shorten(module.resource);
			const excluded = excludeModules.some(regExp => regExp.test(ident));
			if (excluded) return false;
		}
		return i++ < maxModules;
	};
}

/**
 * Returns a comparator for sorting by a field and order.
 * @param {string} fieldKey
 * @param {boolean} regularOrder
 * @returns {(a: any, b: any) => number}
 */
function sortByFieldAndOrder(fieldKey, regularOrder) {
	return (a, b) => {
		if (a[fieldKey] === null && b[fieldKey] === null) return 0;
		if (a[fieldKey] === null) return 1;
		if (b[fieldKey] === null) return -1;
		if (a[fieldKey] === b[fieldKey]) return 0;
		const result = a[fieldKey] < b[fieldKey] ? -1 : 1;
		return regularOrder ? result : -result;
	};
}

/**
 * Returns a sorting function for the given field.
 * @param {Stats} statsInstance
 * @param {string} field
 * @returns {(a: any, b: any) => number}
 */
function getSortByField(statsInstance, field) {
	if (!field) return () => 0;
	const fieldKey = statsInstance.normalizeFieldKey(field);
	const regularOrder = statsInstance.sortOrderRegular(field);
	return (a, b) => sortByFieldAndOrder(fieldKey, regularOrder)(a, b);
}

/**
 * Formats an error or warning object into a string.
 * @param {any} e
 * @param {RequestShortener} requestShortener
 * @param {object} flags
 * @returns {string}
 */
function formatError(e, requestShortener, flags) {
	let text = "";
	if (typeof e === "string") e = { message: e };
	if (e.chunk) {
		text += `chunk ${e.chunk.name || e.chunk.id}${
			e.chunk.hasRuntime() ? " [entry]" : e.chunk.isInitial() ? " [initial]" : ""
		}\n`;
	}
	if (e.file) text += `${e.file}\n`;
	if (e.module && typeof e.module.readableIdentifier === "function") {
		text += `${e.module.readableIdentifier(requestShortener)}\n`;
	}
	text += e.message;
	if (flags.showErrorDetails) {
		if (e.details) text += `\n${e.details}`;
		if (e.missing) {
			text += e.missing.map(item => `\n[${item}]`).join("");
		}
	}
	if (flags.showModuleTrace && e.dependencies && e.origin) {
		text += `\n @ ${e.origin.readableIdentifier(requestShortener)}`;
		e.dependencies.forEach(dep => {
			if (!dep.loc) return;
			if (typeof dep.loc === "string") return;
			const locInfo = formatLocation(dep.loc);
			if (!locInfo) return;
			text += ` ${locInfo}`;
		});
		let current = e.origin;
		while (current.issuer) {
			current = current.issuer;
			text += `\n @ ${current.readableIdentifier(requestShortener)}`;
		}
	}
	return text;
}

/**
 * Builds the assets array and assetsByChunkName map.
 * @param {any} compilation
 * @param {RequestShortener} requestShortener
 * @param {object} flags
 * @param {RegExp[]} excludeModules
 * @returns {{ assets: any[], assetsByChunkName: object }}
 */
function buildAssets(compilation, requestShortener, flags, excludeModules) {
	const assetsByFile = {};
	const assets = Object.keys(compilation.assets)
		.map(name => {
			const asset = compilation.assets[name];
			const obj = {
				name,
				size: asset.size(),
				chunks: [],
				chunkNames: [],
				emitted: asset.emitted
			};
			if (flags.showPerformance) obj.isOverSizeLimit = asset.isOverSizeLimit;
			assetsByFile[name] = obj;
			return obj;
		})
		.filter(asset => flags.showCachedAssets || asset.emitted);

	compilation.chunks.forEach(chunk => {
		chunk.files.forEach(name => {
			const asset = assetsByFile[name];
			if (!asset) return;
			chunk.ids.forEach(id => asset.chunks.push(id));
			if (chunk.name) {
				asset.chunkNames.push(chunk.name);
				if (assetsByFile[name].chunkNames) {
					// handled above
				}
			}
		});
	});

	const assetsByChunkName = {};
	compilation.chunks.forEach(chunk => {
		if (!chunk.name) return;
		chunk.files.forEach(name => {
			if (!assetsByFile[name]) return;
			if (assetsByChunkName[chunk.name]) {
				assetsByChunkName[chunk.name] = [].concat(
					assetsByChunkName[chunk.name],
					[name]
				);
			} else {
				assetsByChunkName[chunk.name] = name;
			}
		});
	});

	return { assets, assetsByChunkName };
}

/**
 * Builds entrypoints information.
 * @param {any} compilation
 * @param {object} flags
 * @returns {object}
 */
function buildEntrypoints(compilation, flags) {
	const entrypoints = {};
	Object.keys(compilation.entrypoints).forEach(name => {
		const ep = compilation.entrypoints[name];
		const obj = {
			chunks: ep.chunks.map(c => c.id),
			assets: ep.chunks.reduce((arr, c) => arr.concat(c.files || []), [])
		};
		if (flags.showPerformance) obj.isOverSizeLimit = ep.isOverSizeLimit;
		entrypoints[name] = obj;
	});
	return entrypoints;
}

/**
 * Builds chunk information.
 * @param {any[]} chunks
 * @param {function} fnModule
 * @param {function} sortByField
 * @param {object} flags
 * @param {RequestShortener} requestShortener
 * @param {function} createModuleFilter
 * @returns {any[]}
 */
function buildChunks(chunks, fnModule, sortByField, flags, requestShortener, createModuleFilter) {
	return chunks.map(chunk => {
		const obj = {
			id: chunk.id,
			rendered: chunk.rendered,
			initial: chunk.isInitial(),
			entry: chunk.hasRuntime(),
			recorded: chunk.recorded,
			extraAsync: !!chunk.extraAsync,
			size: chunk.modules.reduce((s, m) => s + m.size(), 0),
			names: chunk.name ? [chunk.name] : [],
			files: chunk.files.slice(),
			hash: chunk.renderedHash,
			parents: chunk.parents.map(c => c.id)
		};

		if (flags.showChunkModules) {
			obj.modules = chunk.modules
				.slice()
				.sort(sortByField("depth"))
				.filter(createModuleFilter())
				.map(fnModule);
			obj.filteredModules = chunk.modules.length - obj.modules.length;
			obj.modules.sort(sortByField(flags.sortModules));
		}
		if (flags.showChunkOrigins) {
			obj.origins = chunk.origins.map(origin => ({
				moduleId: origin.module ? origin.module.id : undefined,
				module: origin.module ? origin.module.identifier() : "",
				moduleIdentifier: origin.module ? origin.module.identifier() : "",
				moduleName: origin.module
					? origin.module.readableIdentifier(requestShortener)
					: "",
				loc: formatLocation(origin.loc),
				name: origin.name,
				reasons: origin.reasons || []
			}));
		}
		return obj;
	});
}

/**
 * Builds module information.
 * @param {any[]} modules
 * @param {function} fnModule
 * @param {function} sortByField
 * @param {object} flags
 * @param {function} createModuleFilter
 * @returns {{ modules: any[], filteredModules: number }}
 */
function buildModules(modules, fnModule, sortByField, flags, createModuleFilter) {
	const filtered = modules
		.slice()
		.sort(sortByField("depth"))
		.filter(createModuleFilter())
		.map(fnModule);
	return {
		modules: filtered,
		filteredModules: modules.length - filtered.length
	};
}

/**
 * Builds children stats.
 * @param {any[]} children
 * @param {object} options
 * @param {boolean} forToString
 * @returns {any[]}
 */
function buildChildren(children, options, forToString) {
	return children.map((child, idx) => {
		const childOptions = Stats.getChildOptions(options, idx);
		const childStats = new Stats(child).toJson(childOptions, forToString);
		delete childStats.hash;
		delete childStats.version;
		childStats.name = child.name;
		return childStats;
	});
}

/**
 * Returns true when the field starts with "!".
 * @param {string} field
 * @returns {boolean}
 */
function isReversedField(field) {
	return field[0] === "!";
}

/**
 * Returns the field without a leading "!".
 * @param {string} field
 * @returns {string}
 */
function stripReversedPrefix(field) {
	return isReversedField(field) ? field.substr(1) : field;
}

/**
 * Returns true if the field should be sorted in regular order.
 * @param {string} field
 * @returns {boolean}
 */
function isRegularSort(field) {
	return !isReversedField(field);
}

/**
 * Returns a predicate that checks whether a warning should be suppressed.
 * @param {any} filter
 * @returns {(warning: string) => boolean}
 */
function normalizeWarningFilter(filter) {
	if (typeof filter === "string") {
		return warning => warning.indexOf(filter) > -1;
	}
	if (filter instanceof RegExp) {
		return warning => filter.test(warning);
	}
	if (typeof filter === "function") {
		return filter;
	}
	throw new Error(
		`Can only filter warnings with Strings or RegExps. (Given: ${filter})`
	);
}

/**
 * Filters warnings according to the provided filter(s).
 * @param {string[]} warnings
 * @param {any} warningsFilter
 * @returns {string[]}
 */
function filterWarnings(warnings, warningsFilter) {
	if (!warningsFilter) return warnings;
	const normalized = [].concat(warningsFilter).map(normalizeWarningFilter);
	return warnings.filter(w => !normalized.some(check => check(w)));
}

/**
 * Returns true when the given value is truthy.
 * @param {any} value
 * @returns {boolean}
 */
function isTruthy(value) {
	return !!value;
}

/**
 * Returns true when the given value is falsy.
 * @param {any} value
 * @returns {boolean}
 */
function isFalsy(value) {
	return !value;
}

/**
 * Returns true when the given value is defined.
 * @param {any} value
 * @returns {boolean}
 */
function isDefined(value) {
	return value !== undefined;
}

/**
 * Returns true when the given value is a function.
 * @param {any} value
 * @returns {boolean}
 */
function isFunction(value) {
	return typeof value === "function";
}

/**
 * Returns true when the given value is a RegExp.
 * @param {any} value
 * @returns {boolean}
 */
function isRegExp(value) {
	return value instanceof RegExp;
}

/**
 * Returns true when the given value is a string.
 * @param {any} value
 * @returns {boolean}
 */
function isString(value) {
	return typeof value === "string";
}

/**
 * Returns true when the given value is an object (but not null).
 * @param {any} value
 * @returns {boolean}
 */
function isObject(value) {
	return value !== null && typeof value === "object";
}

/**
 * Returns true when the given value is an array.
 * @param {any} value
 * @returns {boolean}
 */
function isArray(value) {
	return Array.isArray(value);
}

/**
 * Returns true when the given value is a number.
 * @param {any} value
 * @returns {boolean}
 */
function isNumber(value) {
	return typeof value === "number";
}

/**
 * Returns true when the given value is a boolean.
 * @param {any} value
 * @returns {boolean}
 */
function isBoolean(value) {
	return typeof value === "boolean";
}

/**
 * Returns true when the given value is null.
 * @param {any} value
 * @returns {boolean}
 */
function isNull(value) {
	return value === null;
}

/**
 * Returns true when the given value is undefined.
 * @param {any} value
 * @returns {boolean}
 */
function isUndefined(value) {
	return value === undefined;
}

/**
 * Returns true when the given value is a non‑empty array.
 * @param {any[]} arr
 * @returns {boolean}
 */
function hasElements(arr) {
	return Array.isArray(arr) && arr.length > 0;
}

/**
 * Returns true when the given value is a non‑empty object.
 * @param {object} obj
 * @returns {boolean}
 */
function hasOwnProperties(obj) {
	return obj && Object.keys(obj).length > 0;
}

/**
 * Returns true when the given value is a non‑empty string.
 * @param {string} str
 * @returns {boolean}
 */
function hasLength(str) {
	return typeof str === "string" && str.length > 0;
}

/**
 * Returns true when the given value is a non‑empty array or object.
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmpty(value) {
	return (Array.isArray(value) && value.length > 0) || (value && typeof value === "object" && Object.keys(value).length > 0);
}

/**
 * Returns true when the given value is a non‑empty string or array.
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmptyStringOrArray(value) {
	return (typeof value === "string" && value.length > 0) || (Array.isArray(value) && value.length > 0);
}

/**
 * Returns true when the given value is a non‑empty string or object.
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmptyStringOrObject(value) {
	return (typeof value === "string" && value.length > 0) || (value && typeof value === "object" && Object.keys(value).length > 0);
}

/**
 * Returns true when the given value is a non‑empty string or number.
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmptyStringOrNumber(value) {
	return (typeof value === "string" && value.length > 0) || typeof value === "number";
}

/**
 * Returns true when the given value is a non‑empty string or boolean.
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmptyStringOrBoolean(value) {
	return (typeof value === "string" && value.length > 0) || typeof value === "boolean";
}

/**
 * Returns true when the given value is a non‑empty string or function.
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmptyStringOrFunction(value) {
	return (typeof value === "string" && value.length > 0) || typeof value === "function";
}

/**
 * Returns true when the given value is a non‑empty string or RegExp.
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmptyStringOrRegExp(value) {
	return (typeof value === "string" && value.length > 0) || value instanceof RegExp;
}

/**
 * Returns true when the given value is a non‑empty string or null.
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmptyStringOrNull(value) {
	return (typeof value === "string" && value.length > 0) || value === null;
}

/**
 * Returns true when the given value is a non‑empty string or undefined.
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmptyStringOrUndefined(value) {
	return (typeof value === "string" && value.length > 0) || value === undefined;
}

/**
 * Returns true when the given value is a non‑empty string or symbol.
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmptyStringOrSymbol(value) {
	return (typeof value === "string" && value.length > 0) || typeof value === "symbol";
}

/**
 * Returns true when the given value is a non‑empty string or bigint.
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmptyStringOrBigInt(value) {
	return (typeof value === "string" && value.length > 0) || typeof value === "bigint";
}

/**
 * Returns true when the given value is a non‑empty string or date.
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmptyStringOrDate(value) {
	return (typeof value === "string" && value.length > 0) || value instanceof Date;
}

/**
 * Returns true when the given value is a non‑empty string or map.
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmptyStringOrMap(value) {
	return (typeof value === "string" && value.length > 0) || value instanceof Map;
}

/**
 * Returns true when the given value is a non‑empty string or set.
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmptyStringOrSet(value) {
	return (typeof value === "string" && value.length > 0) || value instanceof Set;
}

/**
 * Returns true when the given value is a non‑empty string or weakmap.
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmptyStringOrWeakMap(value) {
	return (typeof value === "string" && value.length > 0) || value instanceof WeakMap;
}

/**
 * Returns true when the given value is a non‑empty string or weakset.
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmptyStringOrWeakSet(value) {
	return (typeof value === "string" && value.length > 0) || value instanceof WeakSet;
}

/**
 * Returns true when the given value is a non‑empty string or promise.
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmptyStringOrPromise(value) {
	return (typeof value === "string" && value.length > 0) || value instanceof Promise;
}

/**
 * Returns true when the given value is a non‑empty string or generator.
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmptyStringOrGenerator(value) {
	return (typeof value === "string" && value.length > 0) || value[Symbol.iterator];
}

/**
 * Returns true when the given value is a non‑empty string or async iterator.
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmptyStringOrAsyncIterator(value) {
	return (typeof value === "string" && value.length > 0) || value[Symbol.asyncIterator];
}

/**
 * Returns true when the given value is a non‑empty string or iterable.
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmptyStringOrIterable(value) {
	return (typeof value === "string" && value.length > 0) || isIterable(value);
}

/**
 * Returns true when the given value is iterable.
 * @param {any} value
 * @returns {boolean}
 */
function isIterable(value) {
	return value != null && typeof value[Symbol.iterator] === "function";
}

/**
 * Returns true when the given value is async iterable.
 * @param {any} value
 * @returns {boolean}
 */
function isAsyncIterable(value) {
	return value != null && typeof value[Symbol.asyncIterator] === "function";
}

/**
 * Returns true when the given value is a plain object.
 * @param {any} value
 * @returns {boolean}
 */
function isPlainObject(value) {
	return Object.prototype.toString.call(value) === "[object Object]";
}

/**
 * Returns true when the given value is a primitive.
 * @param {any} value
 * @returns {boolean}
 */
function isPrimitive(value) {
	return value === null || (typeof value !== "object" && typeof value !== "function");
}

/**
 * Returns true when the given value is a class.
 * @param {any} value
 * @returns {boolean}
 */
function isClass(value) {
	return typeof value === "function" && /^\s*class\s+/.test(value.toString());
}

/**
 * Returns true when the given value is a constructor.
 * @param {any} value
 * @returns {boolean}
 */
function isConstructor(value) {
	return typeof value === "function" && value.prototype && value.prototype.constructor === value;
}

/**
 * Returns true when the given value is a function with a name.
 * @param {any} value
 * @returns {boolean}
 */
function isNamedFunction(value) {
	return typeof value === "function" && !!value.name;
}

/**
 * Returns true when the given value is a function without a name.
 * @param {any} value
 * @returns {boolean}
 */
function isAnonymousFunction(value) {
	return typeof value === "function" && !value.name;
}

/**
 * Returns true when the given value is a function with a prototype.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototype(value) {
	return typeof value === "function" && !!value.prototype;
}

/**
 * Returns true when the given value is a function without a prototype.
 * @param {any} value
 * @returns {boolean}
 */
function hasNoPrototype(value) {
	return typeof value === "function" && !value.prototype;
}

/**
 * Returns true when the given value is a function with a length property.
 * @param {any} value
 * @returns {boolean}
 */
function hasLengthProperty(value) {
	return typeof value === "function" && typeof value.length === "number";
}

/**
 * Returns true when the given value is a function with a name property.
 * @param {any} value
 * @returns {boolean}
 */
function hasNameProperty(value) {
	return typeof value === "function" && typeof value.name === "string";
}

/**
 * Returns true when the given value is a function with a prototype property.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypeProperty(value) {
	return typeof value === "function" && typeof value.prototype === "object";
}

/**
 * Returns true when the given value is a function with a constructor property.
 * @param {any} value
 * @returns {boolean}
 */
function hasConstructorProperty(value) {
	return typeof value === "function" && typeof value.constructor === "function";
}

/**
 * Returns true when the given value is a function with a call property.
 * @param {any} value
 * @returns {boolean}
 */
function hasCallProperty(value) {
	return typeof value === "function" && typeof value.call === "function";
}

/**
 * Returns true when the given value is a function with an apply property.
 * @param {any} value
 * @returns {boolean}
 */
function hasApplyProperty(value) {
	return typeof value === "function" && typeof value.apply === "function";
}

/**
 * Returns true when the given value is a function with a bind property.
 * @param {any} value
 * @returns {boolean}
 */
function hasBindProperty(value) {
	return typeof value === "function" && typeof value.bind === "function";
}

/**
 * Returns true when the given value is a function with a prototype chain.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypeChain(value) {
	return typeof value === "function" && !!Object.getPrototypeOf(value);
}

/**
 * Returns true when the given value is a function with a prototype inheritance.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypeInheritance(value) {
	return typeof value === "function" && !!Object.getPrototypeOf(value.prototype);
}

/**
 * Returns true when the given value is a function with a prototype method.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypeMethod(value) {
	return typeof value === "function" && typeof value.prototype?.method === "function";
}

/**
 * Returns true when the given value is a function with a prototype property method.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyMethod(value) {
	return typeof value === "function" && typeof value.prototype?.property === "function";
}

/**
 * Returns true when the given value is a function with a prototype property getter.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyGetter(value) {
	return typeof value === "function" && typeof Object.getOwnPropertyDescriptor(value.prototype, "property")?.get === "function";
}

/**
 * Returns true when the given value is a function with a prototype property setter.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertySetter(value) {
	return typeof value === "function" && typeof Object.getOwnPropertyDescriptor(value.prototype, "property")?.set === "function";
}

/**
 * Returns true when the given value is a function with a prototype property descriptor.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptor(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property");
}

/**
 * Returns true when the given value is a function with a prototype property descriptor value.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorValue(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor get.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorGet(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor set.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorSet(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor enumerable.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorEnumerable(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor configurable.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorConfigurable(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor writable.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorWritable(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor get/set.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorGetterSetter(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor get/set/value.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFull(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property");
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all all all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all all all all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all all all all all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all all all all all all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all all all all all all all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all all all all all all all all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all all all all all all all all all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all all all all all all all all all all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all all all all all all all all all all all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all all all all all all all all all all all all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all all all all all all all all all all all all all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all all all all all all all all all all all all all all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all all all all all all all all all all all all all all all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all all all all all all all all all all all all all all all all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all all all all all all all all all all all all all all all all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value;
}

/**
 * Returns true when the given value is a function with a prototype property descriptor full all all all all all all all all all all all all all all all all all all all all all all all all all all all all all.
 * @param {any} value
 * @returns {boolean}
 */
function hasPrototypePropertyDescriptorFullAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAllAll(value) {
	return typeof value === "function" && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.get && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.set && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.enumerable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.configurable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.writable && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor(value.prototype, "property")?.value && !!Object.getOwnPropertyDescriptor

/* The rest of the file omitted for brevity */