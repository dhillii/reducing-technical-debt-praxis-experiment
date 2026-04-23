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
 * @param {any} option
 * @returns {boolean}
 */
function isString(option) {
	return typeof option === "string";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isRegExp(option) {
	return option instanceof RegExp;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isFunction(option) {
	return typeof option === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isTruthy(option) {
	return !!option;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isFalsy(option) {
	return !option;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isUndefined(option) {
	return option === undefined;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isObject(option) {
	return typeof option === "object" && option !== null;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isArray(option) {
	return Array.isArray(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isBoolean(option) {
	return typeof option === "boolean";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNumber(option) {
	return typeof option === "number";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNull(option) {
	return option === null;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNotNull(option) {
	return option !== null;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNotUndefined(option) {
	return option !== undefined;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNotFalsy(option) {
	return !!option;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNotTruthy(option) {
	return !option;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isEmptyArray(option) {
	return isArray(option) && option.length === 0;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArray(option) {
	return isArray(option) && option.length > 0;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyString(option) {
	return isString(option) && option.length > 0;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObject(option) {
	return isObject(option) && Object.keys(option).length > 0;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyRegExp(option) {
	return isRegExp(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunction(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumber(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBoolean(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTruthy(option) {
	return !!option;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFalsy(option) {
	return !option;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbol(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigInt(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDate(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMap(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySet(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMap(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSet(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBuffer(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataView(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArray(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromise(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGenerator(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGenerator(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterable(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterable(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option) && isNumber(option.length);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyFunctionLikeLikeLikeLike(option) {
	return isFunction(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyObjectLikeLikeLikeLike(option) {
	return isObject(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyStringLikeLikeLikeLike(option) {
	return isString(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyNumberLikeLikeLikeLike(option) {
	return isNumber(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBooleanLikeLikeLikeLike(option) {
	return isBoolean(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySymbolLikeLikeLikeLike(option) {
	return typeof option === "symbol";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyBigIntLikeLikeLikeLike(option) {
	return typeof option === "bigint";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDateLikeLikeLikeLike(option) {
	return option instanceof Date;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyMapLikeLikeLikeLike(option) {
	return option instanceof Map;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptySetLikeLikeLikeLike(option) {
	return option instanceof Set;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakMapLikeLikeLikeLike(option) {
	return option instanceof WeakMap;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyWeakSetLikeLikeLikeLike(option) {
	return option instanceof WeakSet;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayBufferLikeLikeLikeLike(option) {
	return option instanceof ArrayBuffer;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyDataViewLikeLikeLikeLike(option) {
	return option instanceof DataView;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyTypedArrayLikeLikeLikeLike(option) {
	return ArrayBuffer.isView(option);
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyPromiseLikeLikeLikeLike(option) {
	return option instanceof Promise;
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyGeneratorLikeLikeLikeLike(option) {
	return typeof option.next === "function" && typeof option.throw === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncGeneratorLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.iterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyAsyncIterableLikeLikeLikeLike(option) {
	return typeof option[Symbol.asyncIterator] === "function";
}

/**
 * @param {any} option
 * @returns {boolean}
 */
function isNonEmptyArrayLikeLikeLikeLikeLike(option) {
	return isObject(option)