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
		this.addAssets(obj, config, compilation, sortByField);
		this.addEntrypoints(obj, config, compilation);
		this.addChunks(obj, config, compilation, createModuleFilter, sortByField);
		this.addModules(obj, config, compilation, createModuleFilter, sortByField);
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
		if (typeof e === "string") {
			e = { message: e };
		}

		let text = "";
		text += this.formatErrorChunk(e);
		text += this.formatErrorFile(e);
		text += this.formatErrorModule(e, requestShortener);
		text += e.message;
		text += this.formatErrorDetails(e, config);
		text += this.formatErrorTrace(e, config, requestShortener);

		return text;
	}

	formatErrorChunk(e) {
		if (!e.chunk) return "";
		const chunkType = e.chunk.hasRuntime() ? " [entry]" : e.chunk.isInitial() ? " [initial]" : "";
		return `chunk ${e.chunk.name || e.chunk.id}${chunkType}\n`;
	}

	formatErrorFile(e) {
		return e.file ? `${e.file}\n` : "";
	}

	formatErrorModule(e, requestShortener) {
		if (!e.module || !e.module.readableIdentifier || typeof e.module.readableIdentifier !== "function") {
			return "";
		}
		return `${e.module.readableIdentifier(requestShortener)}\n`;
	}

	formatErrorDetails(e, config) {
		let text = "";
		if (config.errorDetails && e.details) text += `\n${e.details}`;
		if (config.errorDetails && e.missing) text += e.missing.map(item => `\n[${item}]`).join("");
		return text;
	}

	formatErrorTrace(e, config, requestShortener) {
		if (!config.moduleTrace || !e.dependencies || !e.origin) {
			return "";
		}

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
		if (config.hash) obj.hash = this.hash;
		if (config.version) {
			obj.version = require("../package.json").version;
		}
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

	addAssets(obj, config, compilation, sortByField) {
		if (!config.assets) return;

		const assetsByFile = {};
		obj.assetsByChunkName = {};
		obj.assets = Object.keys(compilation.assets)
			.map(asset => this.createAssetObject(asset, compilation, config, assetsByFile))
			.filter(asset => config.cachedAssets || asset.emitted);

		this.linkAssetsToChunks(compilation, assetsByFile, obj);
		obj.assets.sort(sortByField(config.sortAssets));
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
					const existing = obj.assetsByChunkName[chunk.name];
					obj.assetsByChunkName[chunk.name] = existing 
						? [].concat(existing).concat([asset])
						: asset;
				}
			});
		});
	}

	addEntrypoints(obj, config, compilation) {
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

	addChunks(obj, config, compilation, createModuleFilter, sortByField) {
		if (!config.chunks) return;

		obj.chunks = compilation.chunks.map(chunk => 
			this.createChunkObject(chunk, config, createModuleFilter, sortByField)
		);
		obj.chunks.sort(sortByField(config.sortChunks));
	}

	createChunkObject(chunk, config, createModuleFilter, sortByField) {
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

		if (config.chunkModules) {
			const modules = chunk.modules
				.slice()
				.sort(sortByField("depth"))
				.filter(createModuleFilter());
			obj.modules = modules.map(m => this.createModuleObject(m, config));
			obj.filteredModules = chunk.modules.length - obj.modules.length;
			obj.modules.sort(sortByField(config.sortModules));
		}

		if (config.chunkOrigins) {
			obj.origins = chunk.origins.map(origin => this.createOriginObject(origin));
		}

		return obj;
	}

	addModules(obj, config, compilation, createModuleFilter, sortByField) {
		if (!config.modules) return;

		const modules = compilation.modules
			.slice()
			.sort(sortByField("depth"))
			.filter(createModuleFilter());
		obj.modules = modules.map(m => this.createModuleObject(m, config));
		obj.filteredModules = compilation.modules.length - obj.modules.length;
		obj.modules.sort(sortByField(config.sortModules));
	}

	createModuleObject(module, config) {
		const obj = {
			id: module.id,
			identifier: module.identifier(),
			name: module.readableIdentifier(this.requestShortener),
			index: module.index,