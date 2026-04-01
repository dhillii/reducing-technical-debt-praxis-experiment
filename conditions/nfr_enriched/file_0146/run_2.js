```javascript
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
"use strict";

const RequestShortener = require("./RequestShortener");
const SizeFormatHelpers = require("./SizeFormatHelpers");
const formatLocation = require("./formatLocation");

const optionOrFallback = (optionValue, fallbackValue) => optionValue !== undefined ? optionValue : fallbackValue;

class Stats {
	constructor(compilation) {
		this.compilation = compilation;
		this.hash = compilation.hash;
	}

	static filterWarnings(warnings, warningsFilter) {
		if(!warningsFilter) {
			return warnings;
		}

		const normalizedWarningsFilters = [].concat(warningsFilter).map(filter => {
			if(typeof filter === "string") {
				return warning => warning.indexOf(filter) > -1;
			}

			if(filter instanceof RegExp) {
				return warning => filter.test(warning);
			}

			if(typeof filter === "function") {
				return filter;
			}

			throw new Error(`Can only filter warnings with Strings or RegExps. (Given: ${filter})`);
		});
		return warnings.filter(warning => {
			return !normalizedWarningsFilters.some(check => check(warning));
		});
	}

	hasWarnings() {
		return this.compilation.warnings.length > 0;
	}

	hasErrors() {
		return this.compilation.errors.length > 0;
	}

	normalizeFieldKey(field) {
		if(field[0] === "!") {
			return field.substr(1);
		}
		return field;
	}

	sortOrderRegular(field) {
		if(field[0] === "!") {
			return false;
		}
		return true;
	}

	// Extract options normalization logic
	_normalizeOptions(options, forToString) {
		if(typeof options === "boolean" || typeof options === "string") {
			options = Stats.presetToOptions(options);
		} else if(!options) {
			options = {};
		}
		return options;
	}

	// Extract display options configuration
	_getDisplayOptions(options, forToString) {
		return {
			showPerformance: optionOrFallback(options.performance, true),
			showHash: optionOrFallback(options.hash, true),
			showVersion: optionOrFallback(options.version, true),
			showTimings: optionOrFallback(options.timings, true),
			showAssets: optionOrFallback(options.assets, true),
			showEntrypoints: optionOrFallback(options.entrypoints, !forToString),
			showChunks: optionOrFallback(options.chunks, true),
			showChunkModules: optionOrFallback(options.chunkModules, !!forToString),
			showChunkOrigins: optionOrFallback(options.chunkOrigins, !forToString),
			showModules: optionOrFallback(options.modules, !forToString),
			showDepth: optionOrFallback(options.depth, !forToString),
			showCachedModules: optionOrFallback(options.cached, true),
			showCachedAssets: optionOrFallback(options.cachedAssets, true),
			showReasons: optionOrFallback(options.reasons, !forToString),
			showUsedExports: optionOrFallback(options.usedExports, !forToString),
			showProvidedExports: optionOrFallback(options.providedExports, !forToString),
			showChildren: optionOrFallback(options.children, true),
			showSource: optionOrFallback(options.source, !forToString),
			showModuleTrace: optionOrFallback(options.moduleTrace, true),
			showErrors: optionOrFallback(options.errors, true),
			showErrorDetails: optionOrFallback(options.errorDetails, !forToString),
			showWarnings: optionOrFallback(options.warnings, true),
			showPublicPath: optionOrFallback(options.publicPath, !forToString)
		};
	}

	// Extract filter and sort options
	_getFilterAndSortOptions(options, forToString) {
		const excludeModules = [].concat(optionOrFallback(options.exclude, [])).map(str => {
			if(typeof str !== "string") return str;
			return new RegExp(`[\\\\/]${str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&")}([\\\\/]|$|!|\\?)`);
		});

		return {
			warningsFilter: optionOrFallback(options.warningsFilter, null),
			excludeModules: excludeModules,
			maxModules: optionOrFallback(options.maxModules, forToString ? 15 : Infinity),
			sortModules: optionOrFallback(options.modulesSort, "id"),
			sortChunks: optionOrFallback(options.chunksSort, "id"),
			sortAssets: optionOrFallback(options.assetsSort, "")
		};
	}

	// Create module filter function
	_createModuleFilter(excludeModules, maxModules, showCachedModules, requestShortener) {
		let i = 0;
		return module => {
			if(!showCachedModules && !module.built) {
				return false;
			}
			if(excludeModules.length > 0) {
				const ident = requestShortener.shorten(module.resource);
				const excluded = excludeModules.some(regExp => regExp.test(ident));
				if(excluded)
					return false;
			}
			return i++ < maxModules;
		};
	}

	// Create sort comparator
	_createSortByField(field) {
		return (a, b) => {
			if(!field) {
				return 0;
			}

			const fieldKey = this.normalizeFieldKey(field);
			const sortIsRegular = this.sortOrderRegular(field);

			return this._sortByFieldAndOrder(fieldKey, sortIsRegular ? a : b, sortIsRegular ? b : a);
		};
	}

	// Compare two objects by field
	_sortByFieldAndOrder(fieldKey, a, b) {
		if(a[fieldKey] === null && b[fieldKey] === null) return 0;
		if(a[fieldKey] === null) return 1;
		if(b[fieldKey] === null) return -1;
		if(a[fieldKey] === b[fieldKey]) return 0;
		return a[fieldKey] < b[fieldKey] ? -1 : 1;
	}

	// Format error message with details
	_formatError(e, showErrorDetails, showModuleTrace, requestShortener) {
		let text = "";
		if(typeof e === "string")
			e = { message: e };
		
		if(e.chunk) {
			text += `chunk ${e.chunk.name || e.chunk.id}${e.chunk.hasRuntime() ? " [entry]" : e.chunk.isInitial() ? " [initial]" : ""}\n`;
		}
		if(e.file) {
			text += `${e.file}\n`;
		}
		if(e.module && e.module.readableIdentifier && typeof e.module.readableIdentifier === "function") {
			text += `${e.module.readableIdentifier(requestShortener)}\n`;
		}
		text += e.message;
		if(showErrorDetails && e.details) text += `\n${e.details}`;
		if(showErrorDetails && e.missing) text += e.missing.map(item => `\n[${item}]`).join("");
		
		if(showModuleTrace && e.dependencies && e.origin) {
			text += this._formatErrorTrace(e, requestShortener);
		}
		return text;
	}

	// Format error trace information
	_formatErrorTrace(e, requestShortener) {
		let text = `\n @ ${e.origin.readableIdentifier(requestShortener)}`;
		e.dependencies.forEach(dep => {
			if(!dep.loc) return;
			if(typeof dep.loc === "string") return;
			const locInfo = formatLocation(dep.loc);
			if(!locInfo) return;
			text += ` ${locInfo}`;
		});
		let current = e.origin;
		while(current.issuer) {
			current = current.issuer;
			text += `\n @ ${current.readableIdentifier(requestShortener)}`;
		}
		return text;
	}

	// Build module object for JSON output
	_buildModuleObject(module, requestShortener, displayOpts) {
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

		if(displayOpts.showReasons) {
			obj.reasons = module.reasons.filter(reason => reason.dependency && reason.module).map(reason => {
				const reasonObj = {
					moduleId: reason.module.id,
					moduleIdentifier: reason.module.identifier(),
					module: reason.module.readableIdentifier(requestShortener),
					moduleName: reason.module.readableIdentifier(requestShortener),
					type: reason.dependency.type,
					userRequest: reason.dependency.userRequest
				};
				const locInfo = formatLocation(reason.dependency.loc);
				if(locInfo) reasonObj.loc = locInfo;
				return reasonObj;
			}).sort((a, b) => a.moduleId - b.moduleId);
		}
		if(displayOpts.showUsedExports) {
			obj.usedExports = module.used ? module.usedExports : false;
		}
		if(displayOpts.showProvidedExports) {
			obj.providedExports = Array.isArray(module.providedExports) ? module.providedExports : null;
		}
		if(displayOpts.showDepth) {
			obj.depth = module.depth;
		}
		if(displayOpts.showSource && module._source) {
			obj.source = module._source.source();
		}
		return obj;
	}

	// Build chunk object for JSON output
	_buildChunkObject(chunk, displayOpts, createModuleFilter, requestShortener) {
		const obj = {
			id: chunk.id,
			rendered: chunk.rendered,
			initial: chunk.isInitial(),
			entry: chunk.hasRuntime(),
			recorded: chunk.recorded,
			extraAsync: !!chunk.extraAsync,
			size: chunk.modules.reduce((size, module) => size + module.size(), 0),
			names: chunk.name ? [chunk.name] : [],
			files: chunk.files.slice(),
			hash: chunk.renderedHash,
			parents: chunk.parents.map(c => c.id)
		};

		if(displayOpts.showChunkModules) {
			obj.modules = chunk.modules
				.slice()
				.sort(this._createSortByField("depth"))
				.filter(createModuleFilter())
				.map(m => this._buildModuleObject(m, requestShortener, displayOpts));
			obj.filteredModules = chunk.modules.length - obj.modules.length;
			obj.modules.sort(this._createSortByField(displayOpts.sortModules));
		}

		if(displayOpts.showChunkOrigins) {
			obj.origins = chunk.origins.map(origin => ({
				moduleId: origin.module ? origin.module.id : undefined,
				module: origin.module ? origin.module.identifier() : "",
				moduleIdentifier: origin.module ? origin.module.identifier() : "",
				moduleName: origin.module ? origin.module.readableIdentifier(requestShortener) : "",
				loc: formatLocation(origin.loc),
				name: origin.name,
				reasons: origin.reasons || []
			}));
		}

		return obj;
	}

	// Process assets and build asset objects
	_processAssets(compilation, displayOpts, sortAssets) {
		const assetsByFile = {};
		const assetsByChunkName = {};
		const assets = Object.keys(compilation.assets).map(asset => {
			const assetObj = {
				name: asset,
				size: compilation.assets[asset].size(),
				chunks: [],
				chunkNames: [],
				emitted: compilation.assets[asset].emitted
			};

			if(displayOpts.showPerformance) {
				assetObj.isOverSizeLimit = compilation.assets[asset].isOverSizeLimit;
			}

			assetsByFile[asset] = assetObj;
			return assetObj;
		}).filter(asset => displayOpts.showCachedAssets || asset.emitted);

		compilation.chunks.forEach(chunk => {
			chunk.files.forEach(asset => {
				if(assetsByFile[asset]) {
					chunk.ids.forEach(id => {
						assetsByFile[asset].chunks.push(id);
					});
					if(chunk.name) {
						assetsByFile[asset].chunkNames.push(chunk.name);
						if(assetsByChunkName[chunk.name])
							assetsByChunkName[chunk.name] = [].concat(assetsByChunkName[chunk.name]).concat([asset]);
						else
							assetsByChunkName[chunk.name] = asset;
					}
				}
			});
		});

		assets.sort(this._createSortByField(sortAssets));
		return { assets, assetsByChunkName };
	}

	toJson(options, forToString) {
		options = this._normalizeOptions(options, forToString);
		const compilation = this.compilation;
		const requestShortener = new RequestShortener(optionOrFallback(options.context, process.cwd()));
		
		const displayOpts = this._getDisplayOptions(options, forToString);
		const filterOpts = this._getFilterAndSortOptions(options, forToString);

		const createModuleFilter = () => this._createModuleFilter(
			filterOpts.excludeModules,
			filterOpts.maxModules,
			displayOpts.showCachedModules,
			requestShortener
		);

		const obj = {
			errors: compilation.errors.map(e => this._formatError(e, displayOpts.showErrorDetails, displayOpts.showModuleTrace, requestShortener)),
			warnings: Stats.filterWarnings(compilation.warnings.map(e => this._formatError(e, displayOpts.showErrorDetails, displayOpts.showModuleTrace, requestShortener)), filterOpts.warningsFilter)
		};

		Object.defineProperty(obj, "_showWarnings", {
			value: displayOpts.showWarnings,
			enumerable: false
		});
		Object.defineProperty(obj, "_show