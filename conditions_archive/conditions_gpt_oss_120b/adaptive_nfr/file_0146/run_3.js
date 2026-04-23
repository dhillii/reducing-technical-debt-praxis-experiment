/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
"use strict";

const RequestShortener = require("./RequestShortener");
const SizeFormatHelpers = require("./SizeFormatHelpers");
const formatLocation = require("./formatLocation");

/**
 * Returns the provided option value if defined, otherwise the fallback.
 * @param {*} optionValue
 * @param {*} fallbackValue
 * @returns {*}
 */
const optionOrFallback = (optionValue, fallbackValue) =>
	optionValue !== undefined ? optionValue : fallbackValue;

/**
 * Determines if a warning should be filtered.
 * @param {string|RegExp|function} filter
 * @returns {function(string): boolean}
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
	throw new Error(`Can only filter warnings with Strings or RegExps. (Given: ${filter})`);
}

/**
 * Checks whether the given warning matches any of the normalized filters.
 * @param {string} warning
 * @param {Array<function(string): boolean>} filters
 * @returns {boolean}
 */
function isWarningSuppressed(warning, filters) {
	return filters.some(check => check(warning));
}

/**
 * Returns true if the field starts with a "!".
 * @param {string} field
 * @returns {boolean}
 */
function isReversedSort(field) {
	return field[0] === "!";
}

/**
 * Returns the field name without a leading "!".
 * @param {string} field
 * @returns {string}
 */
function stripSortPrefix(field) {
	return isReversedSort(field) ? field.substr(1) : field;
}

/**
 * Returns true if the given module should be included based on caching and exclusion rules.
 * @param {Object} module
 * @param {boolean} showCachedModules
 * @param {Array<RegExp>} excludeModules
 * @param {RequestShortener} requestShortener
 * @param {number} maxModules
 * @param {Object} counter
 * @returns {boolean}
 */
function shouldIncludeModule(module, showCachedModules, excludeModules, requestShortener, maxModules, counter) {
	if (!showCachedModules && !module.built) return false;
	if (excludeModules.length > 0) {
		const ident = requestShortener.shorten(module.resource);
		if (excludeModules.some(regExp => regExp.test(ident))) return false;
	}
	return counter.i++ < maxModules;
}

/**
 * Returns a comparator for sorting by a field and order.
 * @param {string} field
 * @param {boolean} regularOrder
 * @returns {function(Object, Object): number}
 */
function createFieldComparator(field, regularOrder) {
	const fieldKey = stripSortPrefix(field);
	return (a, b) => {
		const av = a[fieldKey];
		const bv = b[fieldKey];
		if (av === null && bv === null) return 0;
		if (av === null) return 1;
		if (bv === null) return -1;
		if (av === bv) return 0;
		const result = av < bv ? -1 : 1;
		return regularOrder ? result : -result;
	};
}

/**
 * Formats an error object into a string.
 * @param {Object|string} e
 * @param {RequestShortener} requestShortener
 * @param {boolean} showErrorDetails
 * @param {boolean} showModuleTrace
 * @returns {string}
 */
function formatError(e, requestShortener, showErrorDetails, showModuleTrace) {
	let err = typeof e === "string" ? { message: e } : e;
	let text = "";

	if (err.chunk) {
		const chunk = err.chunk;
		text += `chunk ${chunk.name || chunk.id}${chunk.hasRuntime() ? " [entry]" : chunk.isInitial() ? " [initial]" : ""}\n`;
	}
	if (err.file) text += `${err.file}\n`;
	if (err.module && typeof err.module.readableIdentifier === "function") {
		text += `${err.module.readableIdentifier(requestShortener)}\n`;
	}
	text += err.message;
	if (showErrorDetails && err.details) text += `\n${err.details}`;
	if (showErrorDetails && err.missing) text += err.missing.map(item => `\n[${item}]`).join("");
	if (showModuleTrace && err.dependencies && err.origin) {
		text += `\n @ ${err.origin.readableIdentifier(requestShortener)}`;
		err.dependencies.forEach(dep => {
			if (!dep.loc || typeof dep.loc === "string") return;
			const locInfo = formatLocation(dep.loc);
			if (!locInfo) return;
			text += ` ${locInfo}`;
		});
		let current = err.origin;
		while (current.issuer) {
			current = current.issuer;
			text += `\n @ ${current.readableIdentifier(requestShortener)}`;
		}
	}
	return text;
}

/**
 * Transforms a module into a plain object.
 * @param {Object} module
 * @param {RequestShortener} requestShortener
 * @param {Object} flags
 * @returns {Object}
 */
function mapModule(module, requestShortener, flags) {
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
 * Adds assets information to the result object.
 * @param {Object} result
 * @param {Object} compilation
 * @param {Object} opts
 * @param {RequestShortener} requestShortener
 */
function addAssets(result, compilation, opts, requestShortener) {
	if (!opts.showAssets) return;
	const assetsByFile = {};
	result.assetsByChunkName = {};
	result.assets = Object.keys(compilation.assets)
		.map(name => {
			const asset = compilation.assets[name];
			const obj = {
				name,
				size: asset.size(),
				chunks: [],
				chunkNames: [],
				emitted: asset.emitted
			};
			if (opts.showPerformance) obj.isOverSizeLimit = asset.isOverSizeLimit;
			assetsByFile[name] = obj;
			return obj;
		})
		.filter(asset => opts.showCachedAssets || asset.emitted);

	compilation.chunks.forEach(chunk => {
		chunk.files.forEach(file => {
			const assetObj = assetsByFile[file];
			if (!assetObj) return;
			chunk.ids.forEach(id => assetObj.chunks.push(id));
			if (chunk.name) {
				assetObj.chunkNames.push(chunk.name);
				if (result.assetsByChunkName[chunk.name])
					result.assetsByChunkName[chunk.name] = [].concat(result.assetsByChunkName[chunk.name], file);
				else result.assetsByChunkName[chunk.name] = file;
			}
		});
	});
	result.assets.sort(createFieldComparator(opts.sortAssets, true));
}

/**
 * Adds entrypoints information to the result object.
 * @param {Object} result
 * @param {Object} compilation
 * @param {Object} opts
 */
function addEntrypoints(result, compilation, opts) {
	if (!opts.showEntrypoints) return;
	result.entrypoints = {};
	Object.keys(compilation.entrypoints).forEach(name => {
		const ep = compilation.entrypoints[name];
		const entry = {
			chunks: ep.chunks.map(c => c.id),
			assets: ep.chunks.reduce((arr, c) => arr.concat(c.files || []), [])
		};
		if (opts.showPerformance) entry.isOverSizeLimit = ep.isOverSizeLimit;
		result.entrypoints[name] = entry;
	});
}

/**
 * Adds chunk information to the result object.
 * @param {Object} result
 * @param {Object} compilation
 * @param {Object} opts
 * @param {RequestShortener} requestShortener
 */
function addChunks(result, compilation, opts, requestShortener) {
	if (!opts.showChunks) return;
	const moduleFilter = createModuleFilter(opts, requestShortener);
	result.chunks = compilation.chunks.map(chunk => {
		const base = {
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

		if (opts.showChunkModules) {
			base.modules = chunk.modules
				.slice()
				.sort(createFieldComparator("depth", true))
				.filter(moduleFilter)
				.map(m => mapModule(m, requestShortener, opts));
			base.filteredModules = chunk.modules.length - base.modules.length;
			base.modules.sort(createFieldComparator(opts.sortModules, true));
		}
		if (opts.showChunkOrigins) {
			base.origins = chunk.origins.map(origin => ({
				moduleId: origin.module ? origin.module.id : undefined,
				module: origin.module ? origin.module.identifier() : "",
				moduleIdentifier: origin.module ? origin.module.identifier() : "",
				moduleName: origin.module ? origin.module.readableIdentifier(requestShortener) : "",
				loc: formatLocation(origin.loc),
				name: origin.name,
				reasons: origin.reasons || []
			}));
		}
		return base;
	});
	result.chunks.sort(createFieldComparator(opts.sortChunks, true));
}

/**
 * Adds module information to the result object.
 * @param {Object} result
 * @param {Object} compilation
 * @param {Object} opts
 * @param {RequestShortener} requestShortener
 */
function addModules(result, compilation, opts, requestShortener) {
	if (!opts.showModules) return;
	const moduleFilter = createModuleFilter(opts, requestShortener);
	result.modules = compilation.modules
		.slice()
		.sort(createFieldComparator("depth", true))
		.filter(moduleFilter)
		.map(m => mapModule(m, requestShortener, opts));
	result.filteredModules = compilation.modules.length - result.modules.length;
	result.modules.sort(createFieldComparator(opts.sortModules, true));
}

/**
 * Adds child compilation information to the result object.
 * @param {Object} result
 * @param {Object} compilation
 * @param {Object} opts
 * @param {boolean} forToString
 */
function addChildren(result, compilation, opts, forToString) {
	if (!opts.showChildren) return;
	result.children = compilation.children.map((child, idx) => {
		const childOpts = Stats.getChildOptions(opts, idx);
		const childStats = new Stats(child).toJson(childOpts, forToString);
		delete childStats.hash;
		delete childStats.version;
		childStats.name = child.name;
		return childStats;
	});
}

/**
 * Creates a module filter based on options.
 * @param {Object} opts
 * @param {RequestShortener} requestShortener
 * @returns {function(Object): boolean}
 */
function createModuleFilter(opts, requestShortener) {
	let counter = { i: 0 };
	return module => shouldIncludeModule(
		module,
		opts.showCachedModules,
		opts.excludeModules,
		requestShortener,
		opts.maxModules,
		counter
	);
}

/**
 * Normalizes the options argument for toJson.
 * @param {*} options
 * @param {boolean} forToString
 * @returns {Object}
 */
function normalizeToJsonOptions(options, forToString) {
	if (typeof options === "boolean" || typeof options === "string") {
		return Stats.presetToOptions(options);
	}
	return options || {};
}

/**
 * Builds the options object used throughout toJson.
 * @param {Object} rawOpts
 * @param {boolean} forToString
 * @param {RequestShortener} requestShortener
 * @returns {Object}
 */
function buildOptions(rawOpts, forToString, requestShortener) {
	const opt = rawOpts;
	const exclude = [].concat(optionOrFallback(opt.exclude, [])).map(str => {
		if (typeof str !== "string") return str;
		return new RegExp(`[\\\\/]${str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&")}([\\\\/]|$|!|\\?)`);
	});
	return {
		context: optionOrFallback(opt.context, process.cwd()),
		performance: optionOrFallback(opt.performance, true),
		hash: optionOrFallback(opt.hash, true),
		version: optionOrFallback(opt.version, true),
		timings: optionOrFallback(opt.timings, true),
		assets: optionOrFallback(opt.assets, true),
		entrypoints: optionOrFallback(opt.entrypoints, !forToString),
		chunks: optionOrFallback(opt.chunks, true),
		chunkModules: optionOrFallback(opt.chunkModules, !!forToString),
		chunkOrigins: optionOrFallback(opt.chunkOrigins, !forToString),
		modules: optionOrFallback(opt.modules, !forToString),
		depth: optionOrFallback(opt.depth, !forToString),
		cachedModules: optionOrFallback(opt.cached, true),
		cachedAssets: optionOrFallback(opt.cachedAssets, true),
		reasons: optionOrFallback(opt.reasons, !forToString),
		usedExports: optionOrFallback(opt.usedExports, !forToString),
		providedExports: optionOrFallback(opt.providedExports, !forToString),
		children: optionOrFallback(opt.children, true),
		source: optionOrFallback(opt.source, !forToString),
		moduleTrace: optionOrFallback(opt.moduleTrace, true),
		errors: optionOrFallback(opt.errors, true),
		errorDetails: optionOrFallback(opt.errorDetails, !forToString),
		warnings: optionOrFallback(opt.warnings, true),
		warningsFilter: optionOrFallback(opt.warningsFilter, null),
		publicPath: optionOrFallback(opt.publicPath, !forToString),
		excludeModules: exclude,
		maxModules: optionOrFallback(opt.maxModules, forToString ? 15 : Infinity),
		sortModules: optionOrFallback(opt.modulesSort, "id"),
		sortChunks: optionOrFallback(opt.chunksSort, "id"),
		sortAssets: optionOrFallback(opt.assetsSort, ""),
		showPerformance: optionOrFallback(opt.performance, true),
		showHash: optionOrFallback(opt.hash, true),
		showVersion: optionOrFallback(opt.version, true),
		showTimings: optionOrFallback(opt.timings, true),
		showAssets: optionOrFallback(opt.assets, true),
		showEntrypoints: optionOrFallback(opt.entrypoints, !forToString),
		showChunks: optionOrFallback(opt.chunks, true),
		showChunkModules: optionOrFallback(opt.chunkModules, !!forToString),
		showChunkOrigins: optionOrFallback(opt.chunkOrigins, !forToString),
		showModules: optionOrFallback(opt.modules, !forToString),
		showDepth: optionOrFallback(opt.depth, !forToString),
		showCachedModules: optionOrFallback(opt.cached, true),
		showCachedAssets: optionOrFallback(opt.cachedAssets, true),
		showReasons: optionOrFallback(opt.reasons, !forToString),
		showUsedExports: optionOrFallback(opt.usedExports, !forToString),
		showProvidedExports: optionOrFallback(opt.providedExports, !forToString),
		showChildren: optionOrFallback(opt.children, true),
		showSource: optionOrFallback(opt.source, !forToString),
		showModuleTrace: optionOrFallback(opt.moduleTrace, true),
		showErrors: optionOrFallback(opt.errors, true),
		showErrorDetails: optionOrFallback(opt.errorDetails, !forToString),
		showWarnings: optionOrFallback(opt.warnings, true),
		warningsFilter: optionOrFallback(opt.warningsFilter, null),
		showPublicPath: optionOrFallback(opt.publicPath, !forToString)
	};
}

/**
 * Main Stats class.
 */
class Stats {
	constructor(compilation) {
		this.compilation = compilation;
		this.hash = compilation.hash;
	}

	static filterWarnings(warnings, warningsFilter) {
		if (!warningsFilter) return warnings;
		const filters = [].concat(warningsFilter).map(normalizeWarningFilter);
		return warnings.filter(warning => !isWarningSuppressed(warning, filters));
	}

	hasWarnings() {
		return this.compilation.warnings.length > 0;
	}

	hasErrors() {
		return this.compilation.errors.length > 0;
	}

	normalizeFieldKey(field) {
		return stripSortPrefix(field);
	}

	sortOrderRegular(field) {
		return !isReversedSort(field);
	}

	toJson(options, forToString) {
		const rawOpts = normalizeToJsonOptions(options, forToString);
		const requestShortener = new RequestShortener(optionOrFallback(rawOpts.context, process.cwd()));
		const opts = buildOptions(rawOpts, forToString, requestShortener);
		const compilation = this.compilation;

		const result = {
			errors: compilation.errors.map(e => formatError(e, requestShortener, opts.showErrorDetails, opts.showModuleTrace)),
			warnings: Stats.filterWarnings(compilation.warnings.map(e => formatError(e, requestShortener, opts.showErrorDetails, opts.showModuleTrace)), opts.warningsFilter)
		};

		Object.defineProperty(result, "_showWarnings", { value: opts.showWarnings, enumerable: false });
		Object.defineProperty(result, "_showErrors", { value: opts.showErrors, enumerable: false });

		if (opts.showVersion) result.version = require("../package.json").version;
		if (opts.showHash) result.hash = this.hash;
		if (opts.showTimings && this.startTime && this.endTime) result.time = this.endTime - this.startTime;
		if (compilation.needAdditionalPass) result.needAdditionalPass = true;
		if (opts.showPublicPath) {
			result.publicPath = compilation.mainTemplate.getPublicPath({ hash: compilation.hash });
		}

		addAssets(result, compilation, opts, requestShortener);
		addEntrypoints(result, compilation, opts);
		addChunks(result, compilation, opts, requestShortener);
		addModules(result, compilation, opts, requestShortener);
		addChildren(result, compilation, opts, forToString);

		return result;
	}

	toString(options) {
		if (typeof options === "boolean" || typeof options === "string") {
			options = Stats.presetToOptions(options);
		} else if (!options) {
			options = {};
		}
		const useColors = optionOrFallback(options.colors, false);
		const obj = this.toJson(options, true);
		return Stats.jsonToString(obj, useColors);
	}

	static jsonToString(obj, useColors) {
		const buf = [];

		const defaultColors = {
			bold: "\u001b[1m",
			yellow: "\u001b[1m\u001b[33m",
			red: "\u001b[1m\u001b[31m",
			green: "\u001b[1m\u001b[32m",
			cyan: "\u001b[1m\u001b[36m",
			magenta: "\u001b[1m\u001b[35m"
		};

		const colors = Object.keys(defaultColors).reduce((obj, color) => {
			obj[color] = str => {
				if (useColors) {
					buf.push(useColors === true || useColors[color] === undefined ? defaultColors[color] : useColors[color]);
				}
				buf.push(str);
				if (useColors) buf.push("\u001b[39m\u001b[22m");
			};
			return obj;
		}, { normal: str => buf.push(str) });

		const coloredTime = time => {
			const base = obj.time ? [obj.time / 2, obj.time / 4, obj.time / 8, obj.time / 16] : [800, 400, 200, 100];
			if (time < base[3]) colors.normal(`${time}ms`);
			else if (time < base[2]) colors.bold(`${time}ms`);
			else if (time < base[1]) colors.green(`${time}ms`);
			else if (time < base[0]) colors.yellow(`${time}ms`);
			else colors.red(`${time}ms`);
		};

		const newline = () => buf.push("\n");
		const getText = (arr, r, c) => arr[r][c].value;

		const table = (array, align, splitter) => {
			const rows = array.length;
			const cols = array[0].length;
			const colSizes = new Array(cols).fill(0);
			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					const val = `${getText(array, r, c)}`;
					if (val.length > colSizes[c]) colSizes[c] = val.length;
				}
			}
			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					const fmt = array[r][c].color;
					const val = `${getText(array, r, c)}`;
					let len = val.length;
					if (align[c] === "l") fmt(val);
					for (; len < colSizes[c] && c !== cols - 1; len++) colors.normal(" ");
					if (align[c] === "r") fmt(val);
					if (c + 1 < cols && colSizes[c] !== 0) colors.normal(splitter || "  ");
				}
				newline();
			}
		};

		const getAssetColor = (asset, def) => (asset.isOverSizeLimit ? colors.yellow : def);

		if (obj.hash) {
			colors.normal("Hash: ");
			colors.bold(obj.hash);
			newline();
		}
		if (obj.version) {
			colors.normal("Version: webpack ");
			colors.bold(obj.version);
			newline();
		}
		if (typeof obj.time === "number") {
			colors.normal("Time: ");
			colors.bold(obj.time);
			colors.normal("ms");
			newline();
		}
		if (obj.publicPath) {
			colors.normal("PublicPath: ");
			colors.bold(obj.publicPath);
			newline();
		}

		if (obj.assets && obj.assets.length) {
			const t = [[
				{ value: "Asset", color: colors.bold },
				{ value: "Size", color: colors.bold },
				{ value: "Chunks", color: colors.bold },
				{ value: "", color: colors.bold },
				{ value: "", color: colors.bold },
				{ value: "Chunk Names", color: colors.bold }
			]];
			obj.assets.forEach(asset => {
				t.push([
					{ value: asset.name, color: getAssetColor(asset, colors.green) },
					{ value: SizeFormatHelpers.formatSize(asset.size), color: getAssetColor(asset, colors.normal) },
					{ value: asset.chunks.join(", "), color: colors.bold },
					{ value: asset.emitted ? "[emitted]" : "", color: colors.green },
					{ value: asset.isOverSizeLimit ? "[big]" : "", color: getAssetColor(asset, colors.normal) },
					{ value: asset.chunkNames.join(", "), color: colors.normal }
				]);
			});
			table(t, "rrrlll");
		}
		if (obj.entrypoints) {
			Object.keys(obj.entrypoints).forEach(name => {
				const ep = obj.entrypoints[name];
				colors.normal("Entrypoint ");
				colors.bold(name);
				if (ep.isOverSizeLimit) colors.normal(" ").yellow("[big]");
				colors.normal(" =");
				ep.assets.forEach(a => {
					colors.normal(" ");
					colors.green(a);
				});
				newline();
			});
		}

		const modulesById = {};
		if (obj.modules) {
			obj.modules.forEach(m => modulesById[`$${m.identifier}`] = m);
		} else if (obj.chunks) {
			obj.chunks.forEach(ch => {
				if (ch.modules) ch.modules.forEach(m => modulesById[`$${m.identifier}`] = m);
			});
		}

		const processModuleAttributes = module => {
			colors.normal(" ");
			colors.normal(SizeFormatHelpers.formatSize(module.size));
			if (module.chunks) module.chunks.forEach(c => { colors.normal(" {"); colors.yellow(c); colors.normal("}"); });
			if (typeof module.depth === "number") colors.normal(` [depth ${module.depth}]`);
			if (!module.cacheable) colors.red(" [not cacheable]");
			if (module.optional) colors.yellow(" [optional]");
			if (module.built) colors.green(" [built]");
			if (module.prefetched) colors.magenta(" [prefetched]");
			if (module.failed) colors.red(" [failed]");
			if (module.warnings) colors.yellow(` [${module.warnings} warning${module.warnings === 1 ? "" : "s"}]`);
			if (module.errors) colors.red(` [${module.errors} error${module.errors === 1 ? "" : "s"}]`);
		};

		const processModuleContent = (module, prefix) => {
			if (Array.isArray(module.providedExports)) {
				colors.normal(prefix);
				colors.cyan(`[exports: ${module.providedExports.join(", ")}]`);
				newline();
			}
			if (module.usedExports !== undefined && module.usedExports !== true) {
				colors.normal(prefix);
				if (module.usedExports === false) colors.cyan("[no exports used]");
				else colors.cyan(`[only some exports used: ${module.usedExports.join(", ")}]`);
				newline();
			}
			if (module.reasons) {
				module.reasons.forEach(r => {
					colors.normal(prefix);
					colors.normal(r.type);
					colors.normal(" ");
					colors.cyan(r.userRequest);
					colors.normal(" [");
					colors.normal(r.moduleId);
					colors.normal("] ");
					colors.magenta(r.module);
					if (r.loc) { colors.normal(" "); colors.normal(r.loc); }
					newline();
				});
			}
			if (module.profile) {
				colors.normal(prefix);
				let sum = 0;
				const path = [];
				let cur = module;
				while (cur.issuer) {
					cur = cur.issuer;
					path.unshift(cur);
				}
				path.forEach(m => {
					colors.normal("["); colors.normal(m.id); colors.normal("] ");
					if (m.profile) {
						const t = (m.profile.factory || 0) + (m.profile.building || 0);
						coloredTime(t);
						sum += t;
						colors.normal(" ");
					}
					colors.normal("->");
				});
				Object.keys(module.profile).forEach(k => {
					colors.normal(` ${k}:`);
					const t = module.profile[k];
					coloredTime(t);
					sum += t;
				});
				colors.normal(" = ");
				coloredTime(sum);
				newline();
			}
		};

		if (obj.chunks) {
			obj.chunks.forEach(chunk => {
				colors.normal("chunk ");
				if (chunk.id < 1000) colors.normal(" ");
				if (chunk.id < 100) colors.normal(" ");
				if (chunk.id < 10) colors.normal(" ");
				colors.normal("{");
				colors.yellow(chunk.id);
				colors.normal("} ");
				colors.green(chunk.files.join(", "));
				if (chunk.names && chunk.names.length) {
					colors.normal(" (");
					colors.normal(chunk.names.join(", "));
					colors.normal(")");
				}
				colors.normal(" ");
				colors.normal(SizeFormatHelpers.formatSize(chunk.size));
				chunk.parents.forEach(id => { colors.normal(" {"); colors.yellow(id); colors.normal("}"); });
				if (chunk.entry) colors.yellow(" [entry]");
				else if (chunk.initial) colors.yellow(" [initial]");
				if (chunk.rendered) colors.green(" [rendered]");
				if (chunk.recorded) colors.green(" [recorded]");
				newline();

				if (chunk.origins) {
					chunk.origins.forEach(origin => {
						colors.normal("    > ");
						if (origin.reasons && origin.reasons.length) {
							colors.yellow(origin.reasons.join(" "));
							colors.normal(" ");
						}
						if (origin.name) {
							colors.normal(origin.name);
							colors.normal(" ");
						}
						if (origin.module) {
							colors.normal("["); colors.normal(origin.moduleId); colors.normal("] ");
							const mod = modulesById[`$${origin.module}`];
							if (mod) { colors.bold(mod.name); colors.normal(" "); }
							if (origin.loc) colors.normal(origin.loc);
						}
						newline();
					});
				}
				if (chunk.modules) {
					chunk.modules.forEach(m => {
						colors.normal(" ");
						if (m.id < 1000) colors.normal(" ");
						if (m.id < 100) colors.normal(" ");
						if (m.id < 10) colors.normal(" ");
						colors.normal("["); colors.normal(m.id); colors.normal("] ");
						colors.bold(m.name);
						processModuleAttributes(m);
						newline();
						processModuleContent(m, "        ");
					});
					if (chunk.filteredModules > 0) {
						colors.normal(`     + ${chunk.filteredModules} hidden modules`);
						newline();
					}
				}
			});
		}
		if (obj.modules) {
			obj.modules.forEach(m => {
				if (m.id < 1000) colors.normal(" ");
				if (m.id < 100) colors.normal(" ");
				if (m.id < 10) colors.normal(" ");
				colors.normal("["); colors.normal(m.id); colors.normal("] ");
				colors.bold(m.name || m.identifier);
				processModuleAttributes(m);
				newline();
				processModuleContent(m, "       ");
			});
			if (obj.filteredModules > 0) {
				colors.normal(`    + ${obj.filteredModules} hidden modules`);
				newline();
			}
		}
		if (obj._showWarnings && obj.warnings) {
			obj.warnings.forEach(w => {
				newline();
				colors.yellow(`WARNING in ${w}`);
				newline();
			});
		}
		if (obj._showErrors && obj.errors) {
			obj.errors.forEach(e => {
				newline();
				colors.red(`ERROR in ${e}`);
				newline();
			});
		}
		if (obj.children) {
			obj.children.forEach(child => {
				const childStr = Stats.jsonToString(child, useColors);
				if (childStr) {
					if (child.name) {
						colors.normal("Child ");
						colors.bold(child.name);
						colors.normal(":");
					} else colors.normal("Child");
					newline();
					buf.push("    ");
					buf.push(childStr.replace(/\n/g, "\n    "));
					newline();
				}
			});
		}
		if (obj.needAdditionalPass) colors.yellow("Compilation needs an additional pass and will compile again.");

		while (buf[buf.length - 1] === "\n") buf.pop();
		return buf.join("");
	}

	static presetToOptions(name) {
		const pn = (typeof name === "string" && name.toLowerCase()) || name;
		if (pn === "none" || !pn) {
			return {
				hash: false,
				version: false,
				timings: false,
				assets: false,
				entrypoints: false,
				chunks: false,
				chunkModules: false,
				modules: false,
				reasons: false,
				depth: false,
				usedExports: false,
				providedExports: false,
				children: false,
				source: false,
				errors: false,
				errorDetails: false,
				warnings: false,
				publicPath: false,
				performance: false
			};
		}
		return {
			hash: pn !== "errors-only" && pn !== "minimal",
			version: pn === "verbose",
			timings: pn !== "errors-only" && pn !== "minimal",
			assets: pn === "verbose",
			entrypoints: pn === "verbose",
			chunks: pn !== "errors-only",
			chunkModules: pn === "verbose",
			errorDetails: pn !== "errors-only" && pn !== "minimal",
			reasons: pn === "verbose",
			depth: pn === "verbose",
			usedExports: pn === "verbose",
			providedExports: pn === "verbose",
			colors: true,
			performance: true
		};
	}

	static getChildOptions(options, idx) {
		let inner;
		if (Array.isArray(options.children)) {
			if (idx < options.children.length) inner = options.children[idx];
		} else if (typeof options.children === "object" && options.children) {
			inner = options.children;
		}
		if (typeof inner === "boolean" || typeof inner === "string") inner = Stats.presetToOptions(inner);
		if (!inner) return options;
		const childOpts = Object.assign({}, options);
		delete childOpts.children;
		return Object.assign(childOpts, inner);
	}
}

module.exports = Stats;