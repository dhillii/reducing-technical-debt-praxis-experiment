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
		
		const opts = this._normalizeOptions(options, forToString);
		const excludeModules = this._buildExcludeModules(options);

		const createModuleFilter = () => {
			let i = 0;
			return module => {
				if(!opts.showCachedModules && !module.built) {
					return false;
				}
				if(excludeModules.length > 0) {
					const ident = requestShortener.shorten(module.resource);
					const excluded = excludeModules.some(regExp => regExp.test(ident));
					if(excluded)
						return false;
				}
				return i++ < opts.maxModules;
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

		const formatError = (e) => this._formatError(e, requestShortener, opts);

		const obj = {
			errors: compilation.errors.map(formatError),
			warnings: Stats.filterWarnings(compilation.warnings.map(formatError), opts.warningsFilter)
		};

		Object.defineProperty(obj, "_showWarnings", {
			value: opts.showWarnings,
			enumerable: false
		});
		Object.defineProperty(obj, "_showErrors", {
			value: opts.showErrors,
			enumerable: false
		});

		this._addVersionInfo(obj, opts);
		this._addHashInfo(obj, opts);
		this._addTimingInfo(obj, opts);
		this._addPublicPathInfo(obj, opts);
		this._addAssetsInfo(obj, opts, sortByField);
		this._addEntrypointsInfo(obj, opts);
		this._addChunksInfo(obj, opts, createModuleFilter, sortByField, fnModule);
		this._addModulesInfo(obj, opts, createModuleFilter, sortByField, fnModule);
		this._addChildrenInfo(obj, options, forToString);

		const fnModule = (module) => this._formatModule(module, requestShortener, opts);

		if(compilation.needAdditionalPass) {
			obj.needAdditionalPass = true;
		}

		return obj;
	}

	_normalizeOptions(options, forToString) {
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
			warningsFilter: optionOrFallback(options.warningsFilter, null),
			showPublicPath: optionOrFallback(options.publicPath, !forToString),
			maxModules: optionOrFallback(options.maxModules, forToString ? 15 : Infinity),
			sortModules: optionOrFallback(options.modulesSort, "id"),
			sortChunks: optionOrFallback(options.chunksSort, "id"),
			sortAssets: optionOrFallback(options.assetsSort, "")
		};
	}

	_buildExcludeModules(options) {
		return [].concat(optionOrFallback(options.exclude, [])).map(str => {
			if(typeof str !== "string") return str;
			return new RegExp(`[\\\\/]${str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&")}([\\\\/]|$|!|\\?)`);
		});
	}

	_formatError(e, requestShortener, opts) {
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
		if(opts.showErrorDetails && e.details) text += `\n${e.details}`;
		if(opts.showErrorDetails && e.missing) text += e.missing.map(item => `\n[${item}]`).join("");
		
		if(opts.showModuleTrace && e.dependencies && e.origin) {
			text += this._formatModuleTrace(e, requestShortener);
		}
		return text;
	}

	_formatModuleTrace(e, requestShortener) {
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

	_addVersionInfo(obj, opts) {
		if(opts.showVersion) {
			obj.version = require("../package.json").version;
		}
	}

	_addHashInfo(obj, opts) {
		if(opts.showHash) obj.hash = this.hash;
	}

	_addTimingInfo(obj, opts) {
		if(opts.showTimings && this.startTime && this.endTime) {
			obj.time = this.endTime - this.startTime;
		}
	}

	_addPublicPathInfo(obj, opts) {
		if(opts.showPublicPath) {
			obj.publicPath = this.compilation.mainTemplate.getPublicPath({
				hash: this.compilation.hash
			});
		}
	}

	_addAssetsInfo(obj, opts, sortByField) {
		if(!opts.showAssets) return;

		const assetsByFile = {};
		obj.assetsByChunkName = {};
		obj.assets = Object.keys(this.compilation.assets).map(asset => {
			const assetObj = {
				name: asset,
				size: this.compilation.assets[asset].size(),
				chunks: [],
				chunkNames: [],
				emitted: this.compilation.assets[asset].emitted
			};

			if(opts.showPerformance) {
				assetObj.isOverSizeLimit = this.compilation.assets[asset].isOverSizeLimit;
			}

			assetsByFile[asset] = assetObj;
			return assetObj;
		}).filter(asset => opts.showCachedAssets || asset.emitted);

		this.compilation.chunks.forEach(chunk => {
			chunk.files.forEach(asset => {
				if(assetsByFile[asset]) {
					chunk.ids.forEach(id => {
						assetsByFile[asset].chunks.push(id);
					});
					if(chunk.name) {
						assetsByFile[asset].chunkNames.push(chunk.name);
						if(obj.assetsByChunkName[chunk.name])
							obj.assetsByChunkName[chunk.name] = [].concat(obj.assetsByChunkName[chunk.name]).concat([asset]);
						else
							obj.assetsByChunkName[chunk.name] = asset;
					}
				}
			});
		});
		obj.assets.sort(sortByField(opts.sortAssets));
	}

	_addEntrypointsInfo(obj, opts) {
		if(!opts.showEntrypoints) return;

		obj.entrypoints = {};
		Object.keys(this.compilation.entrypoints).forEach(name => {
			const ep = this.compilation.entrypoints[name];
			obj.entrypoints[name] = {
				chunks: ep.chunks.map(c => c.id),
				assets: ep.chunks.reduce((array, c) => array.concat(c.files || []), [])
			};
			if(opts.showPerformance) {
				obj.entrypoints[name].isOverSizeLimit = ep.isOverSizeLimit;
			}
		});
	}

	_formatModule(module, requestShortener, opts) {
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
		if(opts.showReasons) {
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
		if(opts.showUsedExports) {
			obj.usedExports = module.used ? module.usedExports : false;
		}
		if(opts.showProvidedExports) {
			obj.providedExports = Array.isArray(module.providedExports) ? module.providedExports : null;
		}
		if(opts.showDepth) {
			obj.depth = module.depth;
		}
		if(opts.showSource && module._source) {
			obj.source = module._source.source();
		}
		return obj;
	}

	_addChunksInfo(obj, opts, createModuleFilter, sortByField, fnModule) {
		if(!opts.showChunks) return;

		obj.chunks = this.compilation.chunks.map(chunk => {
			const chunkObj = {
				id: chunk.id,
				rendered: chunk.rendered,
				initial: chunk.isInitial(),
				entry: chunk.hasRuntime(),
				recorded: chunk.recorded,
				extraAsync: