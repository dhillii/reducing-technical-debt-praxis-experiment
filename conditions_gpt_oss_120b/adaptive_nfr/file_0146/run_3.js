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
 * Determines if a warning should be filtered out.
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
	throw new Error(
		`Can only filter warnings with Strings or RegExps. (Given: ${filter})`
	);
}

/**
 * Checks if a warning passes all filters.
 * @param {string[]} warnings
 * @param {Array<string|RegExp|function>} filters
 * @returns {string[]}
 */
function filterWarnings(warnings, filters) {
	if (!filters) return warnings;
	const normalized = [].concat(filters).map(normalizeWarningFilter);
	return warnings.filter(warning => !normalized.some(check => check(warning)));
}

/**
 * Returns true if the field starts with "!".
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
function normalizeFieldKey(field) {
	return isReversedSort(field) ? field.substr(1) : field;
}

/**
 * Returns true if both values are null.
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
function bothNull(a, b) {
	return a === null && b === null;
}

/**
 * Returns true if a value is null.
 * @param {*} v
 * @returns {boolean}
 */
function isNull(v) {
	return v === null;
}

/**
 * Returns -1, 0, or 1 based on field comparison.
 * @param {object} a
 * @param {object} b
 * @param {string} key
 * @returns {number}
 */
function compareField(a, b, key) {
	if (a[key] === b[key]) return 0;
	return a[key] < b[key] ? -1 : 1;
}

/**
 * Generates a comparator for a given field and order.
 * @param {string} field
 * @param {function(string): string} normalizeKey
 * @returns {function(object, object): number}
 */
function sortByField(field, normalizeKey) {
	if (!field) return () => 0;
	const key = normalizeKey(field);
	const regular = !isReversedSort(field);
	return (a, b) => {
		const left = regular ? a : b;
		const right = regular ? b : a;
		if (bothNull(left[key], right[key])) return 0;
		if (isNull(left[key])) return 1;
		if (isNull(right[key])) return -1;
		return compareField(left, right, key);
	};
}

/**
 * Formats an error object into a string.
 * @param {object|string} e
 * @param {RequestShortener} shortener
 * @param {boolean} showDetails
 * @param {boolean} showModuleTrace
 * @returns {string}
 */
function formatError(e, shortener, showDetails, showModuleTrace) {
	let err = typeof e === "string" ? { message: e } : e;
	let text = "";
	if (err.chunk) {
		text += `chunk ${err.chunk.name || err.chunk.id}${
			err.chunk.hasRuntime() ? " [entry]" : err.chunk.isInitial() ? " [initial]" : ""
		}\n`;
	}
	if (err.file) text += `${err.file}\n`;
	if (err.module && typeof err.module.readableIdentifier === "function") {
		text += `${err.module.readableIdentifier(shortener)}\n`;
	}
	text += err.message;
	if (showDetails && err.details) text += `\n${err.details}`;
	if (showDetails && err.missing) {
		text += err.missing.map(item => `\n[${item}]`).join("");
	}
	if (showModuleTrace && err.dependencies && err.origin) {
		text += `\n @ ${err.origin.readableIdentifier(shortener)}`;
		err.dependencies.forEach(dep => {
			if (!dep.loc || typeof dep.loc === "string") return;
			const locInfo = formatLocation(dep.loc);
			if (!locInfo) return;
			text += ` ${locInfo}`;
		});
		let cur = err.origin;
		while (cur.issuer) {
			cur = cur.issuer;
			text += `\n @ ${cur.readableIdentifier(shortener)}`;
		}
	}
	return text;
}

/**
 * Creates a module filter based on options.
 * @param {object} opts
 * @param {RequestShortener} shortener
 * @returns {function(object): boolean}
 */
function createModuleFilter(opts, shortener) {
	let i = 0;
	return module => {
		if (!opts.showCachedModules && !module.built) return false;
		if (opts.excludeModules.length > 0) {
			const ident = shortener.shorten(module.resource);
			const excluded = opts.excludeModules.some(reg => reg.test(ident));
			if (excluded) return false;
		}
		return i++ < opts.maxModules;
	};
}

/**
 * Transforms a module into a plain object.
 * @param {object} module
 * @param {RequestShortener} shortener
 * @param {object} flags
 * @returns {object}
 */
function mapModule(module, shortener, flags) {
	const obj = {
		id: module.id,
		identifier: module.identifier(),
		name: module.readableIdentifier(shortener),
		index: module.index,
		index2: module.index2,
		size: module.size(),
		cacheable: !!module.cacheable,
		built: !!module.built,
		optional: !!module.optional,
		prefetched: !!module.prefetched,
		chunks: module.chunks.map(c => c.id),
		assets: Object.keys(module.assets || {}),
		issuer: module.issuer && module.issuer.identifier(),
		issuerId: module.issuer && module.issuer.id,
		issuerName: module.issuer && module.issuer.readableIdentifier(shortener),
		profile: module.profile,
		failed: !!module.error,
		errors:
			module.errors && module.dependenciesErrors
				? module.errors.length + module.dependenciesErrors.length
				: undefined,
		warnings:
			module.errors && module.dependenciesErrors
				? module.warnings.length + module.dependenciesWarnings.length
				: undefined
	};
	if (flags.showReasons) {
		obj.reasons = module.reasons
			.filter(r => r.dependency && r.module)
			.map(r => {
				const reasonObj = {
					moduleId: r.module.id,
					moduleIdentifier: r.module.identifier(),
					module: r.module.readableIdentifier(shortener),
					moduleName: r.module.readableIdentifier(shortener),
					type: r.dependency.type,
					userRequest: r.dependency.userRequest
				};
				const locInfo = formatLocation(r.dependency.loc);
				if (locInfo) reasonObj.loc = locInfo;
				return reasonObj;
			})
			.sort((a, b) => a.moduleId - b.moduleId);
	}
	if (flags.showUsedExports) obj.usedExports = module.used ? module.usedExports : false;
	if (flags.showProvidedExports)
		obj.providedExports = Array.isArray(module.providedExports) ? module.providedExports : null;
	if (flags.showDepth) obj.depth = module.depth;
	if (flags.showSource && module._source) obj.source = module._source.source();
	return obj;
}

/**
 * Adds version information to the result object.
 * @param {object} result
 * @param {boolean} showVersion
 */
function addVersion(result, showVersion) {
	if (!showVersion) return;
	result.version = require("../package.json").version;
}

/**
 * Adds hash information to the result object.
 * @param {object} result
 * @param {boolean} showHash
 * @param {string} hash
 */
function addHash(result, showHash, hash) {
	if (!showHash) return;
	result.hash = hash;
}

/**
 * Adds timing information to the result object.
 * @param {object} result
 * @param {boolean} showTimings
 * @param {number} start
 * @param {number} end
 */
function addTimings(result, showTimings, start, end) {
	if (!showTimings || !start || !end) return;
	result.time = end - start;
}

/**
 * Adds publicPath information to the result object.
 * @param {object} result
 * @param {boolean} showPublicPath
 * @param {object} compilation
 */
function addPublicPath(result, showPublicPath, compilation) {
	if (!showPublicPath) return;
	result.publicPath = compilation.mainTemplate.getPublicPath({
		hash: compilation.hash
	});
}

/**
 * Adds assets information to the result object.
 * @param {object} result
 * @param {boolean} showAssets
 * @param {boolean} showPerformance
 * @param {boolean} showCachedAssets
 * @param {object} compilation
 * @param {RequestShortener} shortener
 * @param {function(string,object,object):number} sortFn
 */
function addAssets(
	result,
	showAssets,
	showPerformance,
	showCachedAssets,
	compilation,
	shortener,
	sortFn
) {
	if (!showAssets) return;
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
			if (showPerformance) obj.isOverSizeLimit = asset.isOverSizeLimit;
			assetsByFile[name] = obj;
			return obj;
		})
		.filter(a => showCachedAssets || a.emitted);
	compilation.chunks.forEach(chunk => {
		chunk.files.forEach(file => {
			const asset = assetsByFile[file];
			if (!asset) return;
			chunk.ids.forEach(id => asset.chunks.push(id));
			if (chunk.name) {
				asset.chunkNames.push(chunk.name);
				if (result.assetsByChunkName[chunk.name])
					result.assetsByChunkName[chunk.name] = [].concat(
						result.assetsByChunkName[chunk.name],
						[file]
					);
				else result.assetsByChunkName[chunk.name] = file;
			}
		});
	});
	result.assets.sort(sortFn);
}

/**
 * Adds entrypoints information to the result object.
 * @param {object} result
 * @param {boolean} showEntrypoints
 * @param {object} compilation
 * @param {boolean} showPerformance
 */
function addEntrypoints(result, showEntrypoints, compilation, showPerformance) {
	if (!showEntrypoints) return;
	result.entrypoints = {};
	Object.keys(compilation.entrypoints).forEach(name => {
		const ep = compilation.entrypoints[name];
		const entry = {
			chunks: ep.chunks.map(c => c.id),
			assets: ep.chunks.reduce((arr, c) => arr.concat(c.files || []), [])
		};
		if (showPerformance) entry.isOverSizeLimit = ep.isOverSizeLimit;
		result.entrypoints[name] = entry;
	});
}

/**
 * Adds chunks information to the result object.
 * @param {object} result
 * @param {boolean} showChunks
 * @param {object} compilation
 * @param {RequestShortener} shortener
 * @param {object} flags
 * @param {function(string,object,object):number} sortChunkFn
 * @param {function(string,object,object):number} sortModuleFn
 */
function addChunks(
	result,
	showChunks,
	compilation,
shortener,
flags,
sortChunkFn,
sortModuleFn
) {
	if (!showChunks) return;
	result.chunks = compilation.chunks.map(chunk => {
		const ch = {
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
		if (flags.showChunkModules) {
			ch.modules = chunk.modules
				.slice()
				.sort(sortByField("depth", normalizeFieldKey))
				.filter(createModuleFilter(flags, shortener))
				.map(m => mapModule(m, shortener, flags));
			ch.filteredModules = chunk.modules.length - ch.modules.length;
			ch.modules.sort(sortModuleFn);
		}
		if (flags.showChunkOrigins) {
			ch.origins = chunk.origins.map(origin => ({
				moduleId: origin.module ? origin.module.id : undefined,
				module: origin.module ? origin.module.identifier() : "",
				moduleIdentifier: origin.module ? origin.module.identifier() : "",
				moduleName: origin.module
					? origin.module.readableIdentifier(shortener)
					: "",
				loc: formatLocation(origin.loc),
				name: origin.name,
				reasons: origin.reasons || []
			}));
		}
		return ch;
	});
	result.chunks.sort(sortChunkFn);
}

/**
 * Adds modules information to the result object.
 * @param {object} result
 * @param {boolean} showModules
 * @param {object} compilation
 * @param {RequestShortener} shortener
 * @param {object} flags
 * @param {function(string,object,object):number} sortModuleFn
 */
function addModules(
	result,
	showModules,
	compilation,
shortener,
flags,
sortModuleFn
) {
	if (!showModules) return;
	result.modules = compilation.modules
		.slice()
		.sort(sortByField("depth", normalizeFieldKey))
		.filter(createModuleFilter(flags, shortener))
		.map(m => mapModule(m, shortener, flags));
	result.filteredModules = compilation.modules.length - result.modules.length;
	result.modules.sort(sortModuleFn);
}

/**
 * Adds children information to the result object.
 * @param {object} result
 * @param {boolean} showChildren
 * @param {object} compilation
 * @param {object} options
 * @param {boolean} forToString
 */
function addChildren(result, showChildren, compilation, options, forToString) {
	if (!showChildren) return;
	result.children = compilation.children.map((child, idx) => {
		const childOpts = Stats.getChildOptions(options, idx);
		const childStats = new Stats(child).toJson(childOpts, forToString);
		delete childStats.hash;
		delete childStats.version;
		childStats.name = child.name;
		return childStats;
	});
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
		return filterWarnings(warnings, warningsFilter);
	}

	hasWarnings() {
		return this.compilation.warnings.length > 0;
	}

	hasErrors() {
		return this.compilation.errors.length > 0;
	}

	normalizeFieldKey(field) {
		return normalizeFieldKey(field);
	}

	sortOrderRegular(field) {
		return !isReversedSort(field);
	}

	toJson(options, forToString) {
		if (typeof options === "boolean" || typeof options === "string") {
			options = Stats.presetToOptions(options);
		} else if (!options) {
			options = {};
		}
		const compilation = this.compilation;
		const shortener = new RequestShortener(
			optionOrFallback(options.context, process.cwd())
		);
		const flags = {
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
			excludeModules: [].concat(optionOrFallback(options.exclude, [])).map(str => {
				if (typeof str !== "string") return str;
				return new RegExp(
					`[\\\\/]${str.replace(/[\\-\\[\\]\\/\\{\\}\\(\\)\\*\\+\\?\\.\\\\\\^\\$\\|]/g, "\\$&")}([\\\\/]|$|!|\\?)`
				);
			}),
			maxModules: optionOrFallback(options.maxModules, forToString ? 15 : Infinity),
			modulesSort: optionOrFallback(options.modulesSort, "id"),
			chunksSort: optionOrFallback(options.chunksSort, "id"),
			assetsSort: optionOrFallback(options.assetsSort, "")
		};

		const obj = {
			errors: compilation.errors.map(e =>
				formatError(e, shortener, flags.showErrorDetails, flags.showModuleTrace)
			),
			warnings: Stats.filterWarnings(
				compilation.warnings.map(e =>
					formatError(e, shortener, flags.showErrorDetails, flags.showModuleTrace)
				),
				flags.warningsFilter
			)
		};

		Object.defineProperty(obj, "_showWarnings", {
			value: flags.showWarnings,
			enumerable: false
		});
		Object.defineProperty(obj, "_showErrors", {
			value: flags.showErrors,
			enumerable: false
		});

		addVersion(obj, flags.showVersion);
		addHash(obj, flags.showHash, this.hash);
		addTimings(obj, flags.showTimings, this.startTime, this.endTime);
		if (compilation.needAdditionalPass) obj.needAdditionalPass = true;
		addPublicPath(obj, flags.showPublicPath, compilation);
		addAssets(
			obj,
			flags.showAssets,
			flags.showPerformance,
			flags.showCachedAssets,
			compilation,
			shortener,
			sortByField(flags.assetsSort, normalizeFieldKey)
		);
		addEntrypoints(
			obj,
			flags.showEntrypoints,
			compilation,
			flags.showPerformance
		);
		addChunks(
			obj,
			flags.showChunks,
			compilation,
			shortener,
			flags,
			sortByField(flags.chunksSort, normalizeFieldKey),
			sortByField(flags.modulesSort, normalizeFieldKey)
		);
		addModules(
			obj,
			flags.showModules,
			compilation,
			shortener,
			flags,
			sortByField(flags.modulesSort, normalizeFieldKey)
		);
		addChildren(
			obj,
			flags.showChildren,
			compilation,
			options,
			forToString
		);
		return obj;
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
		const colors = Object.keys(defaultColors).reduce(
			(acc, color) => {
				acc[color] = str => {
					if (useColors) {
						buf.push(
							useColors === true || useColors[color] === undefined
								? defaultColors[color]
								: useColors[color]
						);
					}
					buf.push(str);
					if (useColors) buf.push("\u001b[39m\u001b[22m");
				};
				return acc;
			},
			{
				normal: str => buf.push(str)
			}
		);
		const coloredTime = time => {
			let times = [800, 400, 200, 100];
			if (obj.time) times = [obj.time / 2, obj.time / 4, obj.time / 8, obj.time / 16];
			if (time < times[3]) colors.normal(`${time}ms`);
			else if (time < times[2]) colors.bold(`${time}ms`);
			else if (time < times[1]) colors.green(`${time}ms`);
			else if (time < times[0]) colors.yellow(`${time}ms`);
			else colors.red(`${time}ms`);
		};
		const newline = () => buf.push("\n");
		const getText = (arr, row, col) => arr[row][col].value;
		const table = (array, align, splitter) => {
			const rows = array.length;
			const cols = array[0].length;
			const colSizes = new Array(cols);
			for (let col = 0; col < cols; col++) colSizes[col] = 0;
			for (let row = 0; row < rows; row++) {
				for (let col = 0; col < cols; col++) {
					const value = `${getText(array, row, col)}`;
					if (value.length > colSizes[col]) colSizes[col] = value.length;
				}
			}
			for (let row = 0; row < rows; row++) {
				for (let col = 0; col < cols; col++) {
					const format = array[row][col].color;
					const value = `${getText(array, row, col)}`;
					let l = value.length;
					if (align[col] === "l") format(value);
					for (; l < colSizes[col] && col !== cols - 1; l++) colors.normal(" ");
					if (align[col] === "r") format(value);
					if (col + 1 < cols && colSizes[col] !== 0) colors.normal(splitter || "  ");
				}
				newline();
			}
		};
		const getAssetColor = (asset, defaultColor) => {
			if (asset.isOverSizeLimit) return colors.yellow;
			return defaultColor;
		};
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
		if (obj.assets && obj.assets.length > 0) {
			const t = [
				[
					{ value: "Asset", color: colors.bold },
					{ value: "Size", color: colors.bold },
					{ value: "Chunks", color: colors.bold },
					{ value: "", color: colors.bold },
					{ value: "", color: colors.bold },
					{ value: "Chunk Names", color: colors.bold }
				]
			];
			obj.assets.forEach(asset => {
				t.push([
					{ value: asset.name, color: getAssetColor(asset, colors.green) },
					{
						value: SizeFormatHelpers.formatSize(asset.size),
						color: getAssetColor(asset, colors.normal)
					},
					{ value: asset.chunks.join(", "), color: colors.bold },
					{ value: asset.emitted ? "[emitted]" : "", color: colors.green },
					{
						value: asset.isOverSizeLimit ? "[big]" : "",
						color: getAssetColor(asset, colors.normal)
					},
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
				if (ep.isOverSizeLimit) {
					colors.normal(" ");
					colors.yellow("[big]");
				}
				colors.normal(" =");
				ep.assets.forEach(asset => {
					colors.normal(" ");
					colors.green(asset);
				});
				newline();
			});
		}
		const modulesByIdentifier = {};
		if (obj.modules) {
			obj.modules.forEach(m => {
				modulesByIdentifier[`$${m.identifier}`] = m;
			});
		} else if (obj.chunks) {
			obj.chunks.forEach(chunk => {
				if (chunk.modules) {
					chunk.modules.forEach(m => {
						modulesByIdentifier[`$${m.identifier}`] = m;
					});
				}
			});
		}
		const processModuleAttributes = module => {
			colors.normal(" ");
			colors.normal(SizeFormatHelpers.formatSize(module.size));
			if (module.chunks) {
				module.chunks.forEach(chunk => {
					colors.normal(" {");
					colors.yellow(chunk);
					colors.normal("}");
				});
			}
			if (typeof module.depth === "number") {
				colors.normal(` [depth ${module.depth}]`);
			}
			if (!module.cacheable) colors.red(" [not cacheable]");
			if (module.optional) colors.yellow(" [optional]");
			if (module.built) colors.green(" [built]");
			if (module.prefetched) colors.magenta(" [prefetched]");
			if (module.failed) colors.red(" [failed]");
			if (module.warnings)
				colors.yellow(` [${module.warnings} warning${module.warnings === 1 ? "" : "s"}]`);
			if (module.errors)
				colors.red(` [${module.errors} error${module.errors === 1 ? "" : "s"}]`);
		};
		const processModuleContent = (module, prefix) => {
			if (Array.isArray(module.providedExports)) {
				colors.normal(prefix);
				colors.cyan(`[exports: ${module.providedExports.join(", ")}]`);
				newline();
			}
			if (module.usedExports !== undefined) {
				if (module.usedExports !== true) {
					colors.normal(prefix);
					if (module.usedExports === false) colors.cyan("[no exports used]");
					else colors.cyan(`[only some exports used: ${module.usedExports.join(", ")}]`);
					newline();
				}
			}
			if (module.reasons) {
				module.reasons.forEach(reason => {
					colors.normal(prefix);
					colors.normal(reason.type);
					colors.normal(" ");
					colors.cyan(reason.userRequest);
					colors.normal(" [");
					colors.normal(reason.moduleId);
					colors.normal("] ");
					colors.magenta(reason.module);
					if (reason.loc) {
						colors.normal(" ");
						colors.normal(reason.loc);
					}
					newline();
				});
			}
			if (module.profile) {
				colors.normal(prefix);
				let sum = 0;
				const path = [];
				let current = module;
				while (current.issuer) {
					path.unshift((current = current.issuer));
				}
				path.forEach(m => {
					colors.normal("[");
					colors.normal(m.id);
					colors.normal("] ");
					if (m.profile) {
						const time = (m.profile.factory || 0) + (m.profile.building || 0);
						coloredTime(time);
						sum += time;
						colors.normal(" ");
					}
					colors.normal("->");
				});
				Object.keys(module.profile).forEach(key => {
					colors.normal(` ${key}:`);
					const time = module.profile[key];
					coloredTime(time);
					sum += time;
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
				if (chunk.names && chunk.names.length > 0) {
					colors.normal(" (");
					colors.normal(chunk.names.join(", "));
					colors.normal(")");
				}
				colors.normal(" ");
				colors.normal(SizeFormatHelpers.formatSize(chunk.size));
				chunk.parents.forEach(id => {
					colors.normal(" {");
					colors.yellow(id);
					colors.normal("}");
				});
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
							colors.normal("[");
							colors.normal(origin.moduleId);
							colors.normal("] ");
							const mod = modulesByIdentifier[`$${origin.module}`];
							if (mod) {
								colors.bold(mod.name);
								colors.normal(" ");
							}
							if (origin.loc) colors.normal(origin.loc);
						}
						newline();
					});
				}
				if (chunk.modules) {
					chunk.modules.forEach(module => {
						colors.normal(" ");
						if (module.id < 1000) colors.normal(" ");
						if (module.id < 100) colors.normal(" ");
						if (module.id < 10) colors.normal(" ");
						colors.normal("[");
						colors.normal(module.id);
						colors.normal("] ");
						colors.bold(module.name);
						processModuleAttributes(module);
						newline();
						processModuleContent(module, "        ");
					});
					if (chunk.filteredModules > 0) {
						colors.normal(`     + ${chunk.filteredModules} hidden modules`);
						newline();
					}
				}
			});
		}
		if (obj.modules) {
			obj.modules.forEach(module => {
				if (module.id < 1000) colors.normal(" ");
				if (module.id < 100) colors.normal(" ");
				if (module.id < 10) colors.normal(" ");
				colors.normal("[");
				colors.normal(module.id);
				colors.normal("] ");
				colors.bold(module.name || module.identifier);
				processModuleAttributes(module);
				newline();
				processModuleContent(module, "       ");
			});
			if (obj.filteredModules > 0) {
				colors.normal(`    + ${obj.filteredModules} hidden modules`);
				newline();
			}
		}
		if (obj._showWarnings && obj.warnings) {
			obj.warnings.forEach(warning => {
				newline();
				colors.yellow(`WARNING in ${warning}`);
				newline();
			});
		}
		if (obj._showErrors && obj.errors) {
			obj.errors.forEach(error => {
				newline();
				colors.red(`ERROR in ${error}`);
				newline();
			});
		}
		if (obj.children) {
			obj.children.forEach(child => {
				const childString = Stats.jsonToString(child, useColors);
				if (childString) {
					if (child.name) {
						colors.normal("Child ");
						colors.bold(child.name);
						colors.normal(":");
					} else {
						colors.normal("Child");
					}
					newline();
					buf.push("    ");
					buf.push(childString.replace(/\n/g, "\n    "));
					newline();
				}
			});
		}
		if (obj.needAdditionalPass) {
			colors.yellow("Compilation needs an additional pass and will compile again.");
		}
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
		if (typeof inner === "boolean" || typeof inner === "string")
			inner = Stats.presetToOptions(inner);
		if (!inner) return options;
		const childOptions = Object.assign({}, options);
		delete childOptions.children;
		return Object.assign(childOptions, inner);
	}
}

module.exports = Stats;