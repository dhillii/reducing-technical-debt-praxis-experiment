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
		
		const config = this.extractConfig(options, forToString);
		const excludeModules = this.buildExcludeModules(options);

		const createModuleFilter = () => this.createModuleFilterFn(config, excludeModules, requestShortener);
		const sortByField = (field) => this.createSortFn(field);
		const formatError = (e) => this.formatError(e, config, requestShortener);

		const obj = {
			errors: compilation.errors.map(formatError),
			warnings: Stats.filterWarnings(compilation.warnings.map(formatError), config.warningsFilter)
		};

		this.attachHiddenProperties(obj, config);
		this.addVersionInfo(obj, config);
		this.addTimingInfo(obj, config);
		this.addPublicPath(obj, config);
		this.addAssets(obj, config, sortByField);
		this.addEntrypoints(obj, config);
		this.addChunks(obj, config, createModuleFilter, sortByField);
		this.addModules(obj, config, createModuleFilter, sortByField);
		this.addChildren(obj, options, forToString);

		return obj;
	}

	normalizeOptions(options) {
		if (typeof options === "boolean" || typeof options === "string") {
			return Stats.presetToOptions(options);
		}
		return options || {};
	}

	extractConfig(options, forToString) {
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
			cached: optionOrFallback(options.cached, true),
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
			sortModules: optionOrFallback(options.modulesSort, "id"),
			sortChunks: optionOrFallback(options.chunksSort, "id"),
			sortAssets: optionOrFallback(options.assetsSort, "")
		};
	}

	buildExcludeModules(options) {
		return [].concat(optionOrFallback(options.exclude, [])).map(str => {
			if (typeof str !== "string") return str;
			return new RegExp(`[\\\\/]${str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&")}([\\\\/]|$|!|\\?)`);
		});
	}

	createModuleFilterFn(config, excludeModules, requestShortener) {
		let i = 0;
		return module => {
			if (!config.cached && !module.built) {
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

	createSortFn(field) {
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
		let text = "";
		if (typeof e === "string") {
			e = { message: e };
		}

		this.addErrorChunkInfo(text, e);
		this.addErrorFileInfo(text, e);
		this.addErrorModuleInfo(text, e, requestShortener);
		text += e.message;

		if (config.errorDetails && e.details) text += `\n${e.details}`;
		if (config.errorDetails && e.missing) text += e.missing.map(item => `\n[${item}]`).join("");
		if (config.moduleTrace && e.dependencies && e.origin) {
			text += this.formatErrorTrace(e, requestShortener);
		}

		return text;
	}

	addErrorChunkInfo(text, e) {
		if (e.chunk) {
			text += `chunk ${e.chunk.name || e.chunk.id}${e.chunk.hasRuntime() ? " [entry]" : e.chunk.isInitial() ? " [initial]" : ""}\n`;
		}
		return text;
	}

	addErrorFileInfo(text, e) {
		if (e.file) {
			text += `${e.file}\n`;
		}
		return text;
	}

	addErrorModuleInfo(text, e, requestShortener) {
		if (e.module && e.module.readableIdentifier && typeof e.module.readableIdentifier === "function") {
			text += `${e.module.readableIdentifier(requestShortener)}\n`;
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

	attachHiddenProperties(obj, config) {
		Object.defineProperty(obj, "_showWarnings", {
			value: config.warnings,
			enumerable: false
		});
		Object.defineProperty(obj, "_showErrors", {
			value: config.errors,
			enumerable: false
		});
	}

	addVersionInfo(obj, config) {
		if (config.version) {
			obj.version = require("../package.json").version;
		}
		if (config.hash) obj.hash = this.hash;
	}

	addTimingInfo(obj, config) {
		if (config.timings && this.startTime && this.endTime) {
			obj.time = this.endTime - this.startTime;
		}
		if (this.compilation.needAdditionalPass) {
			obj.needAdditionalPass = true;
		}
	}

	addPublicPath(obj, config) {
		if (config.publicPath) {
			obj.publicPath = this.compilation.mainTemplate.getPublicPath({
				hash: this.compilation.hash
			});
		}
	}

	addAssets(obj, config, sortByField) {
		if (!config.assets) return;

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

			if (config.performance) {
				assetObj.isOverSizeLimit = this.compilation.assets[asset].isOverSizeLimit;
			}

			assetsByFile[asset] = assetObj;
			return assetObj;
		}).filter(asset => config.cachedAssets || asset.emitted);

		this.compilation.chunks.forEach(chunk => {
			chunk.files.forEach(asset => {
				if (assetsByFile[asset]) {
					chunk.ids.forEach(id => {
						assetsByFile[asset].chunks.push(id);
					});
					if (chunk.name) {
						assetsByFile[asset].chunkNames.push(chunk.name);
						obj.assetsByChunkName[chunk.name] = obj.assetsByChunkName[chunk.name] ?
							[].concat(obj.assetsByChunkName[chunk.name]).concat([asset]) :
							asset;
					}
				}
			});
		});
		obj.assets.sort(sortByField(config.sortAssets));
	}

	addEntrypoints(obj, config) {
		if (!config.entrypoints) return;

		obj.entrypoints = {};
		Object.keys(this.compilation.entrypoints).forEach(name => {
			const ep = this.compilation.entrypoints[name];
			obj.entrypoints[name] = {
				chunks: ep.chunks.map(c => c.id),
				assets: ep.chunks.reduce((array, c) => array.concat(c.files || []), [])
			};
			if (config.performance) {
				obj.entrypoints[name].isOverSizeLimit = ep.isOverSizeLimit;
			}
		});
	}

	buildModuleObject(module, config, requestShortener) {
		const moduleObj = {
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
			moduleObj.reasons = module.reasons
				.filter(reason => reason.dependency && reason.module)
				.map(reason => this.buildReasonObject(reason, requestShortener))
				.sort((a, b) => a.moduleId - b.moduleId);
		}

		if (config.usedExports) {
			moduleObj.usedExports = module.used ? module.usedExports : false;
		}

		if (config.providedExports) {
			moduleObj.providedExports = Array.isArray(module.providedExports) ? module.providedExports : null;
		}

		if (config.depth) {
			moduleObj.depth = module.depth;
		}

		if (config.source && module._source) {
			moduleObj.source = module._source.source();
		}

		return moduleObj;
	}

	buildReasonObject(reason, requestShortener) {
		const reasonObj = {
			moduleId: reason.module.id,
			moduleIdentifier: reason.module.identifier(),
			module: reason.module.readableIdentifier(requestShortener),
			moduleName: reason.module.readableIdentifier(requestShortener),
			type: reason.dependency.type,
			userRequest: reason.dependency.userRequest
		};
		const locInfo = formatLocation(reason.dependency.loc);
		if (locInfo) reasonObj.loc = locInfo;
		return reasonObj;
	}

	addChunks(obj, config, createModuleFilter, sortByField) {
		if (!config.chunks