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

	toJson(options, forToString) {
		if(typeof options === "boolean" || typeof options === "string") {
			options = Stats.presetToOptions(options);
		} else if(!options) {
			options = {};
		}

		const compilation = this.compilation;
		const requestShortener = new RequestShortener(optionOrFallback(options.context, process.cwd()));
		const showPerformance = optionOrFallback(options.performance, true);
		const showHash = optionOrFallback(options.hash, true);
		const showVersion = optionOrFallback(options.version, true);
		const showTimings = optionOrFallback(options.timings, true);
		const showAssets = optionOrFallback(options.assets, true);
		const showEntrypoints = optionOrFallback(options.entrypoints, !forToString);
		const showChunks = optionOrFallback(options.chunks, true);
		const showChunkModules = optionOrFallback(options.chunkModules, !!forToString);
		const showChunkOrigins = optionOrFallback(options.chunkOrigins, !forToString);
		const showModules = optionOrFallback(options.modules, !forToString);
		const showDepth = optionOrFallback(options.depth, !forToString);
		const showCachedModules = optionOrFallback(options.cached, true);
		const showCachedAssets = optionOrFallback(options.cachedAssets, true);
		const showReasons = optionOrFallback(options.reasons, !forToString);
		const showUsedExports = optionOrFallback(options.usedExports, !forToString);
		const showProvidedExports = optionOrFallback(options.providedExports, !forToString);
		const showChildren = optionOrFallback(options.children, true);
		const showSource = optionOrFallback(options.source, !forToString);
		const showModuleTrace = optionOrFallback(options.moduleTrace, true);
		const showErrors = optionOrFallback(options.errors, true);
		const showErrorDetails = optionOrFallback(options.errorDetails, !forToString);
		const showWarnings = optionOrFallback(options.warnings, true);
		const warningsFilter = optionOrFallback(options.warningsFilter, null);
		const showPublicPath = optionOrFallback(options.publicPath, !forToString);
		const excludeModules = [].concat(optionOrFallback(options.exclude, [])).map(str => {
			if(typeof str !== "string") return str;
			return new RegExp(`[\\\\/]${str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&")}([\\\\/]|$|!|\\?)`);
		});
		const maxModules = optionOrFallback(options.maxModules, forToString ? 15 : Infinity);
		const sortModules = optionOrFallback(options.modulesSort, "id");
		const sortChunks = optionOrFallback(options.chunksSort, "id");
		const sortAssets = optionOrFallback(options.assetsSort, "");

		const createModuleFilter = () => {
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
		};

		const sortByFieldAndOrder = (fieldKey, a, b) => {
			if(a[fieldKey] === null && b[fieldKey] === null) return 0;
			if(a[fieldKey] === null) return 1;
			if(b[fieldKey] === null) return -1;
			if(a[fieldKey] === b[fieldKey]) return 0;
			return a[fieldKey] < b[fieldKey] ? -1 : 1;
		};

		const sortByField = (field) => (a, b) => {
			if(!field) {
				return 0;
			}

			const fieldKey = this.normalizeFieldKey(field);
			const sortIsRegular = this.sortOrderRegular(field);

			return sortByFieldAndOrder(fieldKey, sortIsRegular ? a : b, sortIsRegular ? b : a);
		};

		const formatError = (e) => {
			let text = "";
			if(typeof e === "string")
				e = {
					message: e
				};
			text += this._formatErrorChunk(e);
			text += this._formatErrorFile(e);
			text += this._formatErrorModule(e);
			text += e.message;
			text += this._formatErrorDetails(e, showErrorDetails);
			text += this._formatErrorMissing(e, showErrorDetails);
			text += this._formatErrorTrace(e, showModuleTrace, requestShortener);
			return text;
		};

		const obj = {
			errors: compilation.errors.map(formatError),
			warnings: Stats.filterWarnings(compilation.warnings.map(formatError), warningsFilter)
		};

		Object.defineProperty(obj, "_showWarnings", {
			value: showWarnings,
			enumerable: false
		});
		Object.defineProperty(obj, "_showErrors", {
			value: showErrors,
			enumerable: false
		});

		if(showVersion) {
			obj.version = require("../package.json").version;
		}

		if(showHash) obj.hash = this.hash;
		if(showTimings && this.startTime && this.endTime) {
			obj.time = this.endTime - this.startTime;
		}
		if(compilation.needAdditionalPass) {
			obj.needAdditionalPass = true;
		}
		if(showPublicPath) {
			obj.publicPath = this.compilation.mainTemplate.getPublicPath({
				hash: this.compilation.hash
			});
		}
		if(showAssets) {
			this._processAssets(obj, compilation, showPerformance, showCachedAssets, sortAssets);
		}

		if(showEntrypoints) {
			this._processEntrypoints(obj, compilation, showPerformance);
		}

		const fnModule = this._createModuleFormatter(requestShortener, showReasons, showUsedExports, showProvidedExports, showDepth, showSource);

		if(showChunks) {
			this._processChunks(obj, compilation, showChunkModules, showChunkOrigins, createModuleFilter, fnModule, sortModules, sortChunks);
		}
		if(showModules) {
			this._processModules(obj, compilation, createModuleFilter, fnModule, sortModules);
		}
		if(showChildren) {
			this._processChildren(obj, options, forToString);
		}

		return obj;
	}

	/**
	 * Format error chunk information
	 */
	_formatErrorChunk(e) {
		if(!e.chunk) return "";
		const chunkType = e.chunk.hasRuntime() ? " [entry]" : e.chunk.isInitial() ? " [initial]" : "";
		return `chunk ${e.chunk.name || e.chunk.id}${chunkType}\n`;
	}

	/**
	 * Format error file information
	 */
	_formatErrorFile(e) {
		return e.file ? `${e.file}\n` : "";
	}

	/**
	 * Format error module information
	 */
	_formatErrorModule(e) {
		if(!e.module || !e.module.readableIdentifier || typeof e.module.readableIdentifier !== "function") {
			return "";
		}
		return `${e.module.readableIdentifier(this._requestShortener)}\n`;
	}

	/**
	 * Format error details
	 */
	_formatErrorDetails(e, showErrorDetails) {
		if(!showErrorDetails || !e.details) return "";
		return `\n${e.details}`;
	}

	/**
	 * Format error missing dependencies
	 */
	_formatErrorMissing(e, showErrorDetails) {
		if(!showErrorDetails || !e.missing) return "";
		return e.missing.map(item => `\n[${item}]`).join("");
	}

	/**
	 * Format error trace information
	 */
	_formatErrorTrace(e, showModuleTrace, requestShortener) {
		if(!showModuleTrace || !e.dependencies || !e.origin) return "";
		let text = `\n @ ${e.origin.readableIdentifier(requestShortener)}`;
		e.dependencies.forEach(dep => {
			if(!dep.loc || typeof dep.loc === "string") return;
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

	/**
	 * Process assets section
	 */
	_processAssets(obj, compilation, showPerformance, showCachedAssets, sortAssets) {
		const assetsByFile = {};
		obj.assetsByChunkName = {};
		obj.assets = Object.keys(compilation.assets).map(asset => {
			const assetObj = {
				name: asset,
				size: compilation.assets[asset].size(),
				chunks: [],
				chunkNames: [],
				emitted: compilation.assets[asset].emitted
			};

			if(showPerformance) {
				assetObj.isOverSizeLimit = compilation.assets[asset].isOverSizeLimit;
			}

			assetsByFile[asset] = assetObj;
			return assetObj;
		}).filter(asset => showCachedAssets || asset.emitted);

		compilation.chunks.forEach(chunk => {
			chunk.files.forEach(asset => {
				if(!assetsByFile[asset]) return;
				chunk.ids.forEach(id => {
					assetsByFile[asset].chunks.push(id);
				});
				this._addChunkNameToAsset(obj, assetsByFile, asset, chunk);
			});
		});
		obj.assets.sort(this._createSortByField(sortAssets));
	}

	/**
	 * Add chunk name to asset
	 */
	_addChunkNameToAsset(obj, assetsByFile, asset, chunk) {
		if(!chunk.name) return;
		assetsByFile[asset].chunkNames.push(chunk.name);
		if(obj.assetsByChunkName[chunk.name]) {
			obj.assetsByChunkName[chunk.name] = [].concat(obj.assetsByChunkName[chunk.name]).concat([asset]);
		} else {
			obj.assetsByChunkName[chunk.name] = asset;
		}
	}

	/**
	 * Process entrypoints section
	 */
	_processEntrypoints(obj, compilation, showPerformance) {
		obj.entrypoints = {};
		Object.keys(compilation.entrypoints).forEach(name => {
			const ep = compilation.entrypoints[name];
			obj.entrypoints[name] = {
				chunks: ep.chunks.map(c => c.id),
				assets: ep.chunks.reduce((array, c) => array.concat(c.files || []), [])
			};
			if(showPerformance) {
				obj.entrypoints[name].isOverSizeLimit = ep.isOverSizeLimit;
			}
		});
	}

	/**
	 * Create module formatter function
	 */
	_createModuleFormatter(requestShortener, showReasons, showUsedExports, showProvidedExports, showDepth, showSource) {
		return (module) => {
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
			if(showReasons) {
				obj.reasons = this._formatModuleReasons(module, requestShortener);
			}
			if(showUsedExports) {
				obj.usedExports = module.used ? module.usedExports : false;
			}
			if(showProvidedExports) {
				obj.providedExports = Array.isArray(module.providedExports) ? module.providedExports : null;
			}
			if(showDepth) {
				obj.depth = module.depth;
			}
			if(showSource && module._source) {
				obj.source = module._source.source();
			}
			return obj;
		};
	}

	/**
	 * Format module reasons
	 */
	_