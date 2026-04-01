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

	// Extract module filtering and sorting configuration
	_getModuleConfig(options, forToString) {
		const excludeModules = [].concat(optionOrFallback(options.exclude, [])).map(str => {
			if(typeof str !== "string") return str;
			return new RegExp(`[\\\\/]${str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&")}([\\\\/]|$|!|\\?)`);
		});
		return {
			excludeModules,
			maxModules: optionOrFallback(options.maxModules, forToString ? 15 : Infinity),
			sortModules: optionOrFallback(options.modulesSort, "id"),
			sortChunks: optionOrFallback(options.chunksSort, "id"),
			sortAssets: optionOrFallback(options.assetsSort, ""),
			warningsFilter: optionOrFallback(options.warningsFilter, null)
		};
	}

	// Format error with reduced complexity
	_formatError(e, requestShortener, displayOpts) {
		let text = "";
		if(typeof e === "string") {
			e = { message: e };
		}

		text += this._formatErrorHeader(e);
		text += e.message;
		text += this._formatErrorDetails(e, displayOpts);
		text += this._formatErrorTrace(e, requestShortener, displayOpts);

		return text;
	}

	_formatErrorHeader(e) {
		let text = "";
		if(e.chunk) {
			text += `chunk ${e.chunk.name || e.chunk.id}${e.chunk.hasRuntime() ? " [entry]" : e.chunk.isInitial() ? " [initial]" : ""}\n`;
		}
		if(e.file) {
			text += `${e.file}\n`;
		}
		if(e.module && e.module.readableIdentifier && typeof e.module.readableIdentifier === "function") {
			text += `${e.module.readableIdentifier(requestShortener)}\n`;
		}
		return text;
	}

	_formatErrorDetails(e, displayOpts) {
		let text = "";
		if(displayOpts.showErrorDetails && e.details) {
			text += `\n${e.details}`;
		}
		if(displayOpts.showErrorDetails && e.missing) {
			text += e.missing.map(item => `\n[${item}]`).join("");
		}
		return text;
	}

	_formatErrorTrace(e, requestShortener, displayOpts) {
		let text = "";
		if(displayOpts.showModuleTrace && e.dependencies && e.origin) {
			text += `\n @ ${e.origin.readableIdentifier(requestShortener)}`;
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
		}
		return text;
	}

	// Create module filter function
	_createModuleFilter(showCachedModules, excludeModules, maxModules, requestShortener) {
		let i = 0;
		return module => {
			if(!showCachedModules && !module.built) {
				return false;
			}
			if(excludeModules.length > 0) {
				const ident = requestShortener.shorten(module.resource);
				const excluded = excludeModules.some(regExp => regExp.test(ident));
				if(excluded) return false;
			}
			return i++ < maxModules;
		};
	}

	// Create sort function
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

	_sortByFieldAndOrder(fieldKey, a, b) {
		if(a[fieldKey] === null && b[fieldKey] === null) return 0;
		if(a[fieldKey] === null) return 1;
		if(b[fieldKey] === null) return -1;
		if(a[fieldKey] === b[fieldKey]) return 0;
		return a[fieldKey] < b[fieldKey] ? -1 : 1;
	}

	// Build module object
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
			obj.reasons = this._buildModuleReasons(module, requestShortener);
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

	_buildModuleReasons(module, requestShortener) {
		return module.reasons.filter(reason => reason.dependency && reason.module).map(reason => {
			const obj = {
				moduleId: reason.module.id,
				moduleIdentifier: reason.module.identifier(),
				module: reason.module.readableIdentifier(requestShortener),
				moduleName: reason.module.readableIdentifier(requestShortener),
				type: reason.dependency.type,
				userRequest: reason.dependency.userRequest
			};
			const locInfo = formatLocation(reason.dependency.loc);
			if(locInfo) obj.loc = locInfo;
			return obj;
		}).sort((a, b) => a.moduleId - b.moduleId);
	}

	// Build chunk object
	_buildChunkObject(chunk, requestShortener, displayOpts, createModuleFilter, sortByField) {
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
				.sort(sortByField("depth"))
				.filter(createModuleFilter())
				.map(m => this._buildModuleObject(m, requestShortener, displayOpts));
			obj.filteredModules = chunk.modules.length - obj.modules.length;
			obj.modules.sort(sortByField(displayOpts.sortModules));
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

	// Build assets section
	_buildAssetsSection(compilation, displayOpts, sortByField) {
		const assetsByFile = {};
		const assetsByChunkName = {};
		const assets = Object.keys(compilation.assets).map(asset => {
			const obj = {
				name: asset,
				size: compilation.assets[asset].size(),
				chunks: [],
				chunkNames: [],
				emitted: compilation.assets[asset].emitted
			};

			if(displayOpts.showPerformance) {
				obj.isOverSizeLimit = compilation.assets[asset].isOverSizeLimit;
			}

			assetsByFile[asset] = obj;
			return obj;
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

		assets.sort(sortByField(displayOpts.sortAssets));
		return { assets, assetsByChunkName };
	}

	toJson(options, forToString) {
		options = this._normalizeOptions(options, forToString);
		const displayOpts = this._getDisplayOptions(options, forToString);
		const moduleConfig = this._getModuleConfig(options, forToString);

		const compilation = this.compilation;
		const requestShortener = new RequestShortener(optionOrFallback(options.context, process.cwd()));

		const createModuleFilter = () => this._createModuleFilter(
			displayOpts.showCachedModules,
			moduleConfig.excludeModules,
			moduleConfig.maxModules,
			requestShortener
		);

		const sortByField = (field) => this._createSortByField(field);

		const obj = {
			errors: compilation.errors.map(e => this._formatError(e, requestShortener, displayOpts)),