```javascript
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

class Stats {
	constructor(compilation) {
		this.compilation = compilation;
		this.hash = compilation.hash;
	}

	static filterWarnings(warnings, warningsFilter) {
		if (!warningsFilter) {
			return warnings;
		}

		const normalizedFilters = [].concat(warningsFilter).map(filter => 
			Stats.createWarningFilter(filter)
		);
		
		return warnings.filter(warning => 
			!normalizedFilters.some(check => check(warning))
		);
	}

	static createWarningFilter(filter) {
		if (typeof filter === "string") {
			return warning => warning.indexOf(filter) > -1;
		}
		if (filter instanceof RegExp) {
			return warning => filter.test(warning);
		}
		if (typeof filter === "function") {
			return filter;
		}
		throw new Error(`Can only filter warnings with Strings or RegExps. (Given: ${filter})`);
	}

	hasWarnings() {
		return this.compilation.warnings.length > 0;
	}

	hasErrors() {
		return this.compilation.errors.length > 0;
	}

	normalizeFieldKey(field) {
		return field[0] === "!" ? field.substr(1) : field;
	}

	sortOrderRegular(field) {
		return field[0] !== "!";
	}

	toJson(options, forToString) {
		options = this.normalizeOptions(options);
		const compilation = this.compilation;
		const requestShortener = new RequestShortener(optionOrFallback(options.context, process.cwd()));
		
		const config = this.buildConfig(options, forToString);
		const excludeModules = this.buildExcludeModules(options, requestShortener);

		const obj = {
			errors: compilation.errors.map(e => this.formatError(e, config, requestShortener)),
			warnings: Stats.filterWarnings(
				compilation.warnings.map(e => this.formatError(e, config, requestShortener)),
				config.warningsFilter
			)
		};

		Object.defineProperty(obj, "_showWarnings", {
			value: config.showWarnings,
			enumerable: false
		});
		Object.defineProperty(obj, "_showErrors", {
			value: config.showErrors,
			enumerable: false
		});

		this.addBasicInfo(obj, config);
		this.addAssets(obj, compilation, config, requestShortener);
		this.addEntrypoints(obj, compilation, config);
		this.addChunks(obj, compilation, config, requestShortener, excludeModules);
		this.addModules(obj, compilation, config, requestShortener, excludeModules);
		this.addChildren(obj, options, forToString);

		return obj;
	}

	normalizeOptions(options) {
		if (typeof options === "boolean" || typeof options === "string") {
			return Stats.presetToOptions(options);
		}
		return options || {};
	}

	buildConfig(options, forToString) {
		return {
			performance: optionOrFallback(options.performance, true),
			hash: optionOrFallback(options.hash, true),
			version: optionOrFallback(options.version, true),
			timings: optionOrFallback(options.timings, true),
			assets: optionOrFallback(options.assets, true),
			entrypoints: optionOrFallback(options.entrypoints, !forToString),
			chunks: optionOrFallback(options.chunks, true),
			chunkModules: optionOrFallback(options.chunkModules, !!forToString),
			chunkOrigins: optionOrFallback(options.chunkOrigins, !forToString),
			modules: optionOrFallback(options.modules, !forToString),
			depth: optionOrFallback(options.depth, !forToString),
			cachedModules: optionOrFallback(options.cached, true),
			cachedAssets: optionOrFallback(options.cachedAssets, true),
			reasons: optionOrFallback(options.reasons, !forToString),
			usedExports: optionOrFallback(options.usedExports, !forToString),
			providedExports: optionOrFallback(options.providedExports, !forToString),
			children: optionOrFallback(options.children, true),
			source: optionOrFallback(options.source, !forToString),
			moduleTrace: optionOrFallback(options.moduleTrace, true),
			errors: optionOrFallback(options.errors, true),
			errorDetails: optionOrFallback(options.errorDetails, !forToString),
			warnings: optionOrFallback(options.warnings, true),
			warningsFilter: optionOrFallback(options.warningsFilter, null),
			publicPath: optionOrFallback(options.publicPath, !forToString),
			maxModules: optionOrFallback(options.maxModules, forToString ? 15 : Infinity),
			modulesSort: optionOrFallback(options.modulesSort, "id"),
			chunksSort: optionOrFallback(options.chunksSort, "id"),
			assetsSort: optionOrFallback(options.assetsSort, "")
		};
	}

	buildExcludeModules(options, requestShortener) {
		const excludePatterns = [].concat(optionOrFallback(options.exclude, []));
		return excludePatterns.map(str => {
			if (typeof str !== "string") return str;
			return new RegExp(`[\\\\/]${str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&")}([\\\\/]|$|!|\\?)`);
		});
	}

	createModuleFilter(config, excludeModules, requestShortener) {
		let i = 0;
		return module => {
			if (!config.cachedModules && !module.built) {
				return false;
			}
			if (excludeModules.length > 0) {
				const ident = requestShortener.shorten(module.resource);
				if (excludeModules.some(regExp => regExp.test(ident))) {
					return false;
				}
			}
			return i++ < config.maxModules;
		};
	}

	sortByField(field) {
		return (a, b) => {
			if (!field) {
				return 0;
			}
			const fieldKey = this.normalizeFieldKey(field);
			const sortIsRegular = this.sortOrderRegular(field);
			return this.sortByFieldAndOrder(fieldKey, sortIsRegular ? a : b, sortIsRegular ? b : a);
		};
	}

	sortByFieldAndOrder(fieldKey, a, b) {
		if (a[fieldKey] === null && b[fieldKey] === null) return 0;
		if (a[fieldKey] === null) return 1;
		if (b[fieldKey] === null) return -1;
		if (a[fieldKey] === b[fieldKey]) return 0;
		return a[fieldKey] < b[fieldKey] ? -1 : 1;
	}

	formatError(e, config, requestShortener) {
		if (typeof e === "string") {
			e = { message: e };
		}

		let text = "";
		
		if (e.chunk) {
			const chunkType = e.chunk.hasRuntime() ? " [entry]" : e.chunk.isInitial() ? " [initial]" : "";
			text += `chunk ${e.chunk.name || e.chunk.id}${chunkType}\n`;
		}
		
		if (e.file) {
			text += `${e.file}\n`;
		}
		
		if (e.module && e.module.readableIdentifier && typeof e.module.readableIdentifier === "function") {
			text += `${e.module.readableIdentifier(requestShortener)}\n`;
		}
		
		text += e.message;
		
		if (config.errorDetails && e.details) {
			text += `\n${e.details}`;
		}
		
		if (config.errorDetails && e.missing) {
			text += e.missing.map(item => `\n[${item}]`).join("");
		}
		
		if (config.moduleTrace && e.dependencies && e.origin) {
			text += this.formatErrorTrace(e, requestShortener);
		}
		
		return text;
	}

	formatErrorTrace(e, requestShortener) {
		let text = `\n @ ${e.origin.readableIdentifier(requestShortener)}`;
		
		e.dependencies.forEach(dep => {
			if (!dep.loc || typeof dep.loc === "string") return;
			const locInfo = formatLocation(dep.loc);
			if (locInfo) text += ` ${locInfo}`;
		});
		
		let current = e.origin;
		while (current.issuer) {
			current = current.issuer;
			text += `\n @ ${current.readableIdentifier(requestShortener)}`;
		}
		
		return text;
	}

	addBasicInfo(obj, config) {
		if (config.version) {
			obj.version = require("../package.json").version;
		}
		if (config.hash) obj.hash = this.hash;
		if (config.timings && this.startTime && this.endTime) {
			obj.time = this.endTime - this.startTime;
		}
		if (this.compilation.needAdditionalPass) {
			obj.needAdditionalPass = true;
		}
		if (config.publicPath) {
			obj.publicPath = this.compilation.mainTemplate.getPublicPath({
				hash: this.compilation.hash
			});
		}
	}

	addAssets(obj, compilation, config, requestShortener) {
		if (!config.assets) return;

		const assetsByFile = {};
		obj.assetsByChunkName = {};
		obj.assets = Object.keys(compilation.assets)
			.map(asset => this.createAssetObject(asset, compilation, config, assetsByFile))
			.filter(asset => config.cachedAssets || asset.emitted);

		this.linkAssetsToChunks(compilation, assetsByFile, obj);
		obj.assets.sort(this.sortByField(config.assetsSort));
	}

	createAssetObject(asset, compilation, config, assetsByFile) {
		const obj = {
			name: asset,
			size: compilation.assets[asset].size(),
			chunks: [],
			chunkNames: [],
			emitted: compilation.assets[asset].emitted
		};

		if (config.performance) {
			obj.isOverSizeLimit = compilation.assets[asset].isOverSizeLimit;
		}

		assetsByFile[asset] = obj;
		return obj;
	}

	linkAssetsToChunks(compilation, assetsByFile, obj) {
		compilation.chunks.forEach(chunk => {
			chunk.files.forEach(asset => {
				if (!assetsByFile[asset]) return;
				
				chunk.ids.forEach(id => {
					assetsByFile[asset].chunks.push(id);
				});
				
				if (chunk.name) {
					assetsByFile[asset].chunkNames.push(chunk.name);
					obj.assetsByChunkName[chunk.name] = obj.assetsByChunkName[chunk.name]
						? [].concat(obj.assetsByChunkName[chunk.name]).concat([asset])
						: asset;
				}
			});
		});
	}

	addEntrypoints(obj, compilation, config) {
		if (!config.entrypoints) return;

		obj.entrypoints = {};
		Object.keys(compilation.entrypoints).forEach(name => {
			const ep = compilation.entrypoints[name];
			obj.entrypoints[name] = {
				chunks: ep.chunks.map(c => c.id),
				assets: ep.chunks.reduce((array, c) => array.concat(c.files || []), [])
			};
			if (config.performance) {
				obj.entrypoints[name].isOverSizeLimit = ep.isOverSizeLimit;
			}
		});
	}

	createModuleObject(module, config, requestShortener) {
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

		if (config.reasons) {
			obj.reasons = module.reasons
				.filter(reason => reason.dependency && reason.module)
				.map(reason => this.createReasonObject(reason, requestShortener))
				.sort((a, b) => a.moduleId - b.moduleId);
		}

		if (config.usedExports) {
			obj.usedExports = module.used ? module.usedExports : false;
		}

		if (config.providedExports) {
			obj.providedExports = Array.isArray(module.providedExports) ? module.providedExports : null;
		}

		if (config.depth) {
			obj.depth = module.depth;
		}

		if (config.source && module._source) {
			obj.source = module._source.source();
		}

		return obj;
	}

	createReasonObject(reason, requestShortener) {
		const obj = {
			moduleId: reason.module.id,
			moduleIdentifier: reason.module.identifier(),
			module: reason.module.readableIdentifier(requestShortener),
			moduleName: reason.module.readableIdentifier(requestShortener),
			type: reason.dependency.type,
			userRequest: reason.dependency.userRequest
		};
		const locInfo = formatLocation(reason.dependency.loc);
		if (locInfo) obj.loc = locInfo;
		return obj;
	}

	addChunks(obj, compilation, config, requestShortener, excludeModules) {
		if (!config.chunks) return;

		obj.chunks = compilation.chunks.map(chunk => 
			this.createChunkObject(chunk, config, requestShortener, excludeModules)
		);
		obj.chunks.sort(this.sortByField(config.chunksSort));
	}

	createChunkObject(chunk, config, requestShortener, excludeModules) {
		const obj = {