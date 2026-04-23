/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
"use strict";

const RequestShortener = require("./RequestShortener");
const SizeFormatHelpers = require("./SizeFormatHelpers");
const formatLocation = require("./formatLocation");

const optionOrFallback = (optionValue, fallbackValue) => optionValue !== undefined ? optionValue : fallbackValue;

/**
 * Checks if a warning filter is a string.
 * @param {*} filter
 * @returns {boolean}
 */
function isStringFilter(filter) {
	return typeof filter === "string";
}

/**
 * Checks if a warning filter is a RegExp.
 * @param {*} filter
 * @returns {boolean}
 */
function isRegExpFilter(filter) {
	return filter instanceof RegExp;
}

/**
 * Checks if a warning filter is a function.
 * @param {*} filter
 * @returns {boolean}
 */
function isFunctionFilter(filter) {
	return typeof filter === "function";
}

/**
 * Determines whether the field key is prefixed with "!".
 * @param {string} field
 * @returns {boolean}
 */
function isReversedSort(field) {
	return field[0] === "!";
}

/**
 * Removes the leading "!" from a field key.
 * @param {string} field
 * @returns {string}
 */
function normalizeFieldKey(field) {
	if (field[0] === "!") {
		return field.substr(1);
	}
	return field;
}

/**
 * Returns true if the sort order for the field is regular (not reversed).
 * @param {string} field
 * @returns {boolean}
 */
function isRegularSort(field) {
	return field[0] !== "!";
}

/**
 * Returns a predicate that checks whether a module should be included.
 * @param {Object} requestShortener
 * @param {Array<RegExp>} excludeModules
 * @param {boolean} showCachedModules
 * @param {number} maxModules
 * @returns {(module:any)=>boolean}
 */
function createModuleFilter(requestShortener, excludeModules, showCachedModules, maxModules) {
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
 * @returns {(a:any,b:any)=>number}
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
 * Returns a comparator for sorting by a field.
 * @param {string} field
 * @returns {(a:any,b:any)=>number}
 */
function getSortComparator(field) {
	if (!field) return () => 0;
	const fieldKey = normalizeFieldKey(field);
	const regular = isRegularSort(field);
	return sortByFieldAndOrder(fieldKey, regular);
}

/**
 * Formats an error object into a string.
 * @param {Object} e
 * @param {RequestShortener} requestShortener
 * @param {boolean} showErrorDetails
 * @param {boolean} showModuleTrace
 * @returns {string}
 */
function formatError(e, requestShortener, showErrorDetails, showModuleTrace) {
	let text = "";
	if (typeof e === "string") e = { message: e };
	if (e.chunk) {
		text += `chunk ${e.chunk.name || e.chunk.id}${e.chunk.hasRuntime() ? " [entry]" : e.chunk.isInitial() ? " [initial]" : ""}\n`;
	}
	if (e.file) text += `${e.file}\n`;
	if (e.module && typeof e.module.readableIdentifier === "function") {
		text += `${e.module.readableIdentifier(requestShortener)}\n`;
	}
	text += e.message;
	if (showErrorDetails && e.details) text += `\n${e.details}`;
	if (showErrorDetails && e.missing) text += e.missing.map(item => `\n[${item}]`).join("");
	if (showModuleTrace && e.dependencies && e.origin) {
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
 * Converts a module object to a plain representation.
 * @param {Object} module
 * @param {RequestShortener} requestShortener
 * @param {Object} flags
 * @returns {Object}
 */
function fnModule(module, requestShortener, flags) {
	const obj = {
		id: module.id,
		identifier: module.identifier(),
		name: module.readableIdentifier(requestShortener),
		index: module.index,
		index2: module.index2,
		size: module.size(),
		cacheable: !!module.cacheable,
		built: !!module.built,
		optional: !!module.optional,
		prefetched: !!module.prefetched,
		chunks: module.chunks.map(chunk => chunk.id),
		assets: Object.keys(module.assets || {}),
		issuer: module.issuer && module.issuer.identifier(),
		issuerId: module.issuer && module.issuer.id,
		issuerName: module.issuer && module.issuer.readableIdentifier(requestShortener),
		profile: module.profile,
		failed: !!module.error,
		errors: module.errors && module.dependenciesErrors && (module.errors.length + module.dependenciesErrors.length),
		warnings: module.errors && module.dependenciesErrors && (module.warnings.length + module.dependenciesWarnings.length)
	};
	if (flags.showReasons) {
		obj.reasons = module.reasons
			.filter(reason => reason.dependency && reason.module)
			.map(reason => {
				const r = {
					moduleId: reason.module.id,
					moduleIdentifier: reason.module.identifier(),
					module: reason.module.readableIdentifier(requestShortener),
					moduleName: reason.module.readableIdentifier(requestShortener),
					type: reason.dependency.type,
					userRequest: reason.dependency.userRequest
				};
				const locInfo = formatLocation(reason.dependency.loc);
				if (locInfo) r.loc = locInfo;
				return r;
			})
			.sort((a, b) => a.moduleId - b.moduleId);
	}
	if (flags.showUsedExports) obj.usedExports = module.used ? module.usedExports : false;
	if (flags.showProvidedExports) obj.providedExports = Array.isArray(module.providedExports) ? module.providedExports : null;
	if (flags.showDepth) obj.depth = module.depth;
	if (flags.showSource && module._source) obj.source = module._source.source();
	return obj;
}

/**
 * Adds version information to the stats object if required.
 * @param {Object} obj
 * @param {boolean} showVersion
 */
function addVersion(obj, showVersion) {
	if (showVersion) {
		obj.version = require("../package.json").version;
	}
}

/**
 * Adds hash information to the stats object if required.
 * @param {Object} obj
 * @param {boolean} showHash
 * @param {string} hash
 */
function addHash(obj, showHash, hash) {
	if (showHash) obj.hash = hash;
}

/**
 * Adds timing information to the stats object if required.
 * @param {Object} obj
 * @param {boolean} showTimings
 * @param {number} startTime
 * @param {number} endTime
 */
function addTimings(obj, showTimings, startTime, endTime) {
	if (showTimings && startTime && endTime) {
		obj.time = endTime - startTime;
	}
}

/**
 * Adds publicPath information to the stats object if required.
 * @param {Object} obj
 * @param {boolean} showPublicPath
 * @param {Object} compilation
 */
function addPublicPath(obj, showPublicPath, compilation) {
	if (showPublicPath) {
		obj.publicPath = compilation.mainTemplate.getPublicPath({
			hash: compilation.hash
		});
	}
}

/**
 * Adds assets information to the stats object if required.
 * @param {Object} obj
 * @param {Object} compilation
 * @param {Object} flags
 * @param {RequestShortener} requestShortener
 */
function addAssets(obj, compilation, flags, requestShortener) {
	if (!flags.showAssets) return;
	const assetsByFile = {};
	obj.assetsByChunkName = {};
	obj.assets = Object.keys(compilation.assets)
		.map(asset => {
			const a = {
				name: asset,
				size: compilation.assets[asset].size(),
				chunks: [],
				chunkNames: [],
				emitted: compilation.assets[asset].emitted
			};
			if (flags.showPerformance) a.isOverSizeLimit = compilation.assets[asset].isOverSizeLimit;
			assetsByFile[asset] = a;
			return a;
		})
		.filter(asset => flags.showCachedAssets || asset.emitted);
	compilation.chunks.forEach(chunk => {
		chunk.files.forEach(asset => {
			if (assetsByFile[asset]) {
				chunk.ids.forEach(id => assetsByFile[asset].chunks.push(id));
				if (chunk.name) {
					assetsByFile[asset].chunkNames.push(chunk.name);
					if (obj.assetsByChunkName[chunk.name])
						obj.assetsByChunkName[chunk.name] = [].concat(obj.assetsByChunkName[chunk.name]).concat([asset]);
					else obj.assetsByChunkName[chunk.name] = asset;
				}
			}
		});
	});
	obj.assets.sort(getSortComparator(flags.sortAssets));
}

/**
 * Adds entrypoints information to the stats object if required.
 * @param {Object} obj
 * @param {Object} compilation
 * @param {Object} flags
 */
function addEntrypoints(obj, compilation, flags) {
	if (!flags.showEntrypoints) return;
	obj.entrypoints = {};
	Object.keys(compilation.entrypoints).forEach(name => {
		const ep = compilation.entrypoints[name];
		const entry = {
			chunks: ep.chunks.map(c => c.id),
			assets: ep.chunks.reduce((arr, c) => arr.concat(c.files || []), [])
		};
		if (flags.showPerformance) entry.isOverSizeLimit = ep.isOverSizeLimit;
		obj.entrypoints[name] = entry;
	});
}

/**
 * Adds chunks information to the stats object if required.
 * @param {Object} obj
 * @param {Object} compilation
 * @param {Object} flags
 * @param {RequestShortener} requestShortener
 */
function addChunks(obj, compilation, flags, requestShortener) {
	if (!flags.showChunks) return;
	obj.chunks = compilation.chunks.map(chunk => {
		const c = {
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
			parents: chunk.parents.map(p => p.id)
		};
		if (flags.showChunkModules) {
			c.modules = chunk.modules
				.slice()
				.sort(getSortComparator("depth"))
				.filter(createModuleFilter(requestShortener, flags.excludeModules, flags.showCachedModules, flags.maxModules))
				.map(m => fnModule(m, requestShortener, flags));
			c.filteredModules = chunk.modules.length - c.modules.length;
			c.modules.sort(getSortComparator(flags.sortModules));
		}
		if (flags.showChunkOrigins) {
			c.origins = chunk.origins.map(origin => ({
				moduleId: origin.module ? origin.module.id : undefined,
				module: origin.module ? origin.module.identifier() : "",
				moduleIdentifier: origin.module ? origin.module.identifier() : "",
				moduleName: origin.module ? origin.module.readableIdentifier(requestShortener) : "",
				loc: formatLocation(origin.loc),
				name: origin.name,
				reasons: origin.reasons || []
			}));
		}
		return c;
	});
	obj.chunks.sort(getSortComparator(flags.sortChunks));
}

/**
 * Adds modules information to the stats object if required.
 * @param {Object} obj
 * @param {Object} compilation
 * @param {Object} flags
 * @param {RequestShortener} requestShortener
 */
function addModules(obj, compilation, flags, requestShortener) {
	if (!flags.showModules) return;
	obj.modules = compilation.modules
		.slice()
		.sort(getSortComparator("depth"))
		.filter(createModuleFilter(requestShortener, flags.excludeModules, flags.showCachedModules, flags.maxModules))
		.map(m => fnModule(m, requestShortener, flags));
	obj.filteredModules = compilation.modules.length - obj.modules.length;
	obj.modules.sort(getSortComparator(flags.sortModules));
}

/**
 * Adds children information to the stats object if required.
 * @param {Object} obj
 * @param {Object} compilation
 * @param {Object} options
 * @param {boolean} forToString
 */
function addChildren(obj, compilation, options, forToString) {
	if (!options.children) return;
	obj.children = compilation.children.map((child, idx) => {
		const childOptions = Stats.getChildOptions(options, idx);
		const childStats = new Stats(child).toJson(childOptions, forToString);
		delete childStats.hash;
		delete childStats.version;
		childStats.name = child.name;
		return childStats;
	});
}

/**
 * Filters warnings according to the provided filter.
 * @param {Array<string>} warnings
 * @param {*} warningsFilter
 * @returns {Array<string>}
 */
function filterWarnings(warnings, warningsFilter) {
	if (!warningsFilter) return warnings;
	const normalized = [].concat(warningsFilter).map(filter => {
		if (isStringFilter(filter)) return warning => warning.indexOf(filter) > -1;
		if (isRegExpFilter(filter)) return warning => filter.test(warning);
		if (isFunctionFilter(filter)) return filter;
		throw new Error(`Can only filter warnings with Strings or RegExps. (Given: ${filter})`);
	});
	return warnings.filter(w => !normalized.some(check => check(w)));
}

/**
 * Returns a predicate that checks whether a module should be shown based on depth.
 * @param {number} depth
 * @returns {boolean}
 */
function isDepthLimited(depth) {
	return depth !== undefined;
}

/**
 * Returns a predicate that checks whether a module should be shown based on source availability.
 * @param {Object} module
 * @returns {boolean}
 */
function hasSource(module) {
	return !!module._source;
}

/**
 * Returns a predicate that checks whether a module should be shown based on cacheability.
 * @param {boolean} showCachedModules
 * @param {Object} module
 * @returns {boolean}
 */
function shouldShowModule(showCachedModules, module) {
	return showCachedModules || module.built;
}

/**
 * Returns a predicate that checks whether an asset should be shown based on caching.
 * @param {boolean} showCachedAssets
 * @param {Object} asset
 * @returns {boolean}
 */
function shouldShowAsset(showCachedAssets, asset) {
	return showCachedAssets || asset.emitted;
}

/**
 * Returns a predicate that checks whether a module should be filtered based on exclusion patterns.
 * @param {Array<RegExp>} excludeModules
 * @param {RequestShortener} requestShortener
 * @param {Object} module
 * @returns {boolean}
 */
function isExcludedModule(excludeModules, requestShortener, module) {
	if (excludeModules.length === 0) return false;
	const ident = requestShortener.shorten(module.resource);
	return excludeModules.some(regExp => regExp.test(ident));
}

/**
 * Returns a predicate that checks whether a module passes all filter criteria.
 * @param {Object} flags
 * @param {RequestShortener} requestShortener
 * @returns {(module:any)=>boolean}
 */
function getCombinedModuleFilter(flags, requestShortener) {
	let i = 0;
	return module => {
		if (!flags.showCachedModules && !module.built) return false;
		if (isExcludedModule(flags.excludeModules, requestShortener, module)) return false;
		return i++ < flags.maxModules;
	};
}

/**
 * Returns a predicate that checks whether an asset passes caching filter.
 * @param {Object} flags
 * @returns {(asset:any)=>boolean}
 */
function getCombinedAssetFilter(flags) {
	return asset => flags.showCachedAssets || asset.emitted;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on depth flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getDepthPredicate(flags) {
	return module => flags.showDepth && typeof module.depth === "number";
}

/**
 * Returns a predicate that checks whether a module should be displayed based on source flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getSourcePredicate(flags) {
	return module => flags.showSource && !!module._source;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on usedExports flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getUsedExportsPredicate(flags) {
	return module => flags.showUsedExports && module.used !== undefined;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on providedExports flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getProvidedExportsPredicate(flags) {
	return module => flags.showProvidedExports && module.providedExports !== undefined;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on reasons flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getReasonsPredicate(flags) {
	return module => flags.showReasons && module.reasons !== undefined;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsPredicate(flags) {
	return module => flags.showErrors && module.errors !== undefined;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsPredicate(flags) {
	return module => flags.showWarnings && module.warnings !== undefined;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on reasons flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChunkOriginsPredicate(flags) {
	return chunk => flags.showChunkOrigins && chunk.origins !== undefined;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on modules flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModulesPredicate(flags) {
	return module => flags.showModules && module.modules !== undefined;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenPredicate(flags) {
	return child => flags.showChildren && child !== undefined;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on assets flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getAssetsPredicate(flags) {
	return asset => flags.showAssets && asset !== undefined;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on entrypoints flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getEntrypointsPredicate(flags) {
	return ep => flags.showEntrypoints && ep !== undefined;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on performance flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getPerformancePredicate(flags) {
	return () => flags.showPerformance;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on hash flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getHashFlagPredicate(flags) {
	return () => flags.showHash;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on version flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getVersionFlagPredicate(flags) {
	return () => flags.showVersion;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on publicPath flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getPublicPathFlagPredicate(flags) {
	return () => flags.showPublicPath;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on timings flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getTimingsFlagPredicate(flags) {
	return () => flags.showTimings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on assets flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getAssetsFlagPredicate(flags) {
	return () => flags.showAssets;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on entrypoints flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getEntrypointsFlagPredicate(flags) {
	return () => flags.showEntrypoints;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on chunks flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChunksFlagPredicate(flags) {
	return () => flags.showChunks;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on modules flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModulesFlagPredicate(flags) {
	return () => flags.showModules;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on chunkModules flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChunkModulesFlagPredicate(flags) {
	return () => flags.showChunkModules;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on chunkOrigins flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChunkOriginsFlagPredicate(flags) {
	return () => flags.showChunkOrigins;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on reasons flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getReasonsFlagPredicate(flags) {
	return () => flags.showReasons;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on usedExports flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getUsedExportsFlagPredicate(flags) {
	return () => flags.showUsedExports;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on providedExports flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getProvidedExportsFlagPredicate(flags) {
	return () => flags.showProvidedExports;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on depth flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getDepthFlagPredicate(flags) {
	return () => flags.showDepth;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on source flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getSourceFlagPredicate(flags) {
	return () => flags.showSource;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on cached flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getCachedFlagPredicate(flags) {
	return () => flags.showCachedModules;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on cachedAssets flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getCachedAssetsFlagPredicate(flags) {
	return () => flags.showCachedAssets;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails flag.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorsFlagPredicate(flags) {
	return () => flags.showErrors;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on warnings.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getWarningsFlagPredicate(flags) {
	return () => flags.showWarnings;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errorDetails.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrorDetailsFlagPredicate(flags) {
	return () => flags.showErrorDetails;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on moduleTrace.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getModuleTraceFlagPredicate(flags) {
	return () => flags.showModuleTrace;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on children.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getChildrenFlagPredicate(flags) {
	return () => flags.showChildren;
}

/**
 * Returns a predicate that checks whether a module should be displayed based on errors.
 * @param {Object} flags
 * @returns {(module:any)=>boolean}
 */
function getErrors