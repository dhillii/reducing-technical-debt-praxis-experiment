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
 * Checks if a value is defined.
 * @param {*} value
 * @returns {boolean}
 */
function isDefined(value) {
	return value !== undefined;
}

/**
 * Checks if a value is a string.
 * @param {*} value
 * @returns {boolean}
 */
function isString(value) {
	return typeof value === "string";
}

/**
 * Checks if a value is a RegExp.
 * @param {*} value
 * @returns {boolean}
 */
function isRegExp(value) {
	return value instanceof RegExp;
}

/**
 * Normalizes warning filters.
 * @param {(string|RegExp|function)[]} filters
 * @returns {function[]}
 */
function normalizeWarningsFilters(filters) {
	return filters.map(filter => {
		if (isString(filter)) {
			return warning => warning.indexOf(filter) > -1;
		}
		if (isRegExp(filter)) {
			return warning => filter.test(warning);
		}
		if (typeof filter === "function") {
			return filter;
		}
		throw new Error(
			`Can only filter warnings with Strings or RegExps. (Given: ${filter})`
		);
	});
}

/**
 * Formats a warning/error message.
 * @param {*} e
 * @param {RequestShortener} requestShortener
 * @param {boolean} showErrorDetails
 * @param {boolean} showModuleTrace
 * @returns {string}
 */
function formatError(e, requestShortener, showErrorDetails, showModuleTrace) {
	let text = "";
	if (typeof e === "string") {
		e = { message: e };
	}
	if (e.chunk) {
		const entryLabel = e.chunk.hasRuntime()
			? " [entry]"
			: e.chunk.isInitial()
			? " [initial]"
			: "";
		text += `chunk ${e.chunk.name || e.chunk.id}${entryLabel}\n`;
	}
	if (e.file) {
		text += `${e.file}\n`;
	}
	if (
		e.module &&
		e.module.readableIdentifier &&
		typeof e.module.readableIdentifier === "function"
	) {
		text += `${e.module.readableIdentifier(requestShortener)}\n`;
	}
	text += e.message;
	if (showErrorDetails && e.details) text += `\n${e.details}`;
	if (showErrorDetails && e.missing)
		text += e.missing.map(item => `\n[${item}]`).join("");
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
 * Creates a module filter based on options.
 * @param {object} opts
 * @param {RequestShortener} requestShortener
 * @returns {function}
 */
function createModuleFilter(opts, requestShortener) {
	let i = 0;
	return module => {
		if (!opts.showCachedModules && !module.built) {
			return false;
		}
		if (opts.excludeModules.length > 0) {
			const ident = requestShortener.shorten(module.resource);
			const excluded = opts.excludeModules.some(regExp => regExp.test(ident));
			if (excluded) return false;
		}
		return i++ < opts.maxModules;
	};
}

/**
 * Sorts two objects by a field and order.
 * @param {string} fieldKey
 * @param {*} a
 * @param {*} b
 * @returns {number}
 */
function sortByFieldAndOrder(fieldKey, a, b) {
	if (a[fieldKey] === null && b[fieldKey] === null) return 0;
	if (a[fieldKey] === null) return 1;
	if (b[fieldKey] === null) return -1;
	if (a[fieldKey] === b[fieldKey]) return 0;
	return a[fieldKey] < b[fieldKey] ? -1 : 1;
}

/**
 * Returns a comparator for a given field with optional order reversal.
 * @param {Stats} stats
 * @param {string} field
 * @returns {function}
 */
function getSortComparator(stats, field) {
	if (!field) return () => 0;
	const fieldKey = stats.normalizeFieldKey(field);
	const regular = stats.sortOrderRegular(field);
	return (a, b) =>
		sortByFieldAndOrder(
			fieldKey,
			regular ? a : b,
			regular ? b : a
		);
}

/**
 * Transforms a module into a plain object.
 * @param {*} module
 * @param {RequestShortener} requestShortener
 * @param {object} opts
 * @returns {object}
 */
function mapModule(module, requestShortener, opts) {
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
		issuerName:
			module.issuer && module.issuer.readableIdentifier(requestShortener),
		profile: module.profile,
		failed: !!module.error,
		errors:
			module.errors && module.dependenciesErrors
				? module.errors.length + module.dependenciesErrors.length
				: undefined,
		warnings:
			module.warnings && module.dependenciesWarnings
				? module.warnings.length + module.dependenciesWarnings.length
				: undefined
	};

	if (opts.showReasons) {
		obj.reasons = module.reasons
			.filter(r => r.dependency && r.module)
			.map(r => {
				const reasonObj = {
					moduleId: r.module.id,
					moduleIdentifier: r.module.identifier(),
					module: r.module.readableIdentifier(requestShortener),
					moduleName: r.module.readableIdentifier(requestShortener),
					type: r.dependency.type,
					userRequest: r.dependency.userRequest
				};
				const locInfo = formatLocation(r.dependency.loc);
				if (locInfo) reasonObj.loc = locInfo;
				return reasonObj;
			})
			.sort((a, b) => a.moduleId - b.moduleId);
	}
	if (opts.showUsedExports) {
		obj.usedExports = module.used ? module.usedExports : false;
	}
	if (opts.showProvidedExports) {
		obj.providedExports = Array.isArray(module.providedExports)
			? module.providedExports
			: null;
	}
	if (opts.showDepth) {
		obj.depth = module.depth;
	}
	if (opts.showSource && module._source) {
		obj.source = module._source.source();
	}
	return obj;
}

/**
 * Adds assets information to the result object.
 * @param {object} result
 * @param {*} compilation
 * @param {object} opts
 * @param {RequestShortener} requestShortener
 */
function addAssets(result, compilation, opts, requestShortener) {
	const assetsByFile = {};
	result.assetsByChunkName = {};
	result.assets = Object.keys(compilation.assets)
		.map(assetName => {
			const asset = compilation.assets[assetName];
			const obj = {
				name: assetName,
				size: asset.size(),
				chunks: [],
				chunkNames: [],
				emitted: asset.emitted
			};
			if (opts.showPerformance) {
				obj.isOverSizeLimit = asset.isOverSizeLimit;
			}
			assetsByFile[assetName] = obj;
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
				if (result.assetsByChunkName[chunk.name]) {
					result.assetsByChunkName[chunk.name] = [].concat(
						result.assetsByChunkName[chunk.name],
						[file]
					);
				} else {
					result.assetsByChunkName[chunk.name] = file;
				}
			}
		});
	});
	result.assets.sort(getSortComparator(this, opts.sortAssets));
}

/**
 * Adds entrypoints information to the result object.
 * @param {object} result
 * @param {*} compilation
 * @param {object} opts
 */
function addEntrypoints(result, compilation, opts) {
	result.entrypoints = {};
	Object.keys(compilation.entrypoints).forEach(name => {
		const ep = compilation.entrypoints[name];
		const entryObj = {
			chunks: ep.chunks.map(c => c.id),
			assets: ep.chunks.reduce((arr, c) => arr.concat(c.files || []), [])
		};
		if (opts.showPerformance) {
			entryObj.isOverSizeLimit = ep.isOverSizeLimit;
		}
		result.entrypoints[name] = entryObj;
	});
}

/**
 * Adds chunks information to the result object.
 * @param {object} result
 * @param {*} compilation
 * @param {object} opts
 * @param {RequestShortener} requestShortener
 */
function addChunks(result, compilation, opts, requestShortener) {
	const moduleFilter = createModuleFilter(opts, requestShortener);
	result.chunks = compilation.chunks.map(chunk => {
		const chunkObj = {
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
			chunkObj.modules = chunk.modules
				.slice()
				.sort(getSortComparator(this, "depth"))
				.filter(moduleFilter)
				.map(m => mapModule(m, requestShortener, opts));
			chunkObj.filteredModules = chunk.modules.length - chunkObj.modules.length;
			chunkObj.modules.sort(getSortComparator(this, opts.sortModules));
		}
		if (opts.showChunkOrigins) {
			chunkObj.origins = chunk.origins.map(origin => ({
				moduleId: origin.module ? origin.module.id : undefined,
				module: origin.module ? origin.module.identifier() : "",
				moduleIdentifier: origin.module ? origin.module.identifier() : "",
				moduleName: origin.module
					? origin.module.readableIdentifier(requestShortener)
					: "",
				loc: formatLocation(origin.loc),
				name: origin.name,
				reasons: origin.reasons || []
			}));
		}
		return chunkObj;
	});
	result.chunks.sort(getSortComparator(this, opts.sortChunks));
}

/**
 * Adds modules information to the result object.
 * @param {object} result
 * @param {*} compilation
 * @param {object} opts
 * @param {RequestShortener} requestShortener
 */
function addModules(result, compilation, opts, requestShortener) {
	const moduleFilter = createModuleFilter(opts, requestShortener);
	result.modules = compilation.modules
		.slice()
		.sort(getSortComparator(this, "depth"))
		.filter(moduleFilter)
		.map(m => mapModule(m, requestShortener, opts));
	result.filteredModules = compilation.modules.length - result.modules.length;
	result.modules.sort(getSortComparator(this, opts.sortModules));
}

/**
 * Adds children stats to the result object.
 * @param {object} result
 * @param {*} compilation
 * @param {object} options
 * @param {boolean} forToString
 */
function addChildren(result, compilation, options, forToString) {
	result.children = compilation.children.map((child, idx) => {
		const childOptions = Stats.getChildOptions(options, idx);
		const childStats = new Stats(child).toJson(childOptions, forToString);
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
		if (!warningsFilter) {
			return warnings;
		}
		const normalized = normalizeWarningsFilters([].concat(warningsFilter));
		return warnings.filter(warning => !normalized.some(check => check(warning)));
	}

	hasWarnings() {
		return this.compilation.warnings.length > 0;
	}

	hasErrors() {
		return this.compilation.errors.length > 0;
	}

	normalizeFieldKey(field) {
		if (field[0] === "!") {
			return field.substr(1);
		}
		return field;
	}

	sortOrderRegular(field) {
		if (field[0] === "!") {
			return false;
		}
		return true;
	}

	toJson(options, forToString) {
		if (isString(options) || typeof options === "boolean") {
			options = Stats.presetToOptions(options);
		} else if (!options) {
			options = {};
		}

		const compilation = this.compilation;
		const requestShortener = new RequestShortener(
			optionOrFallback(options.context, process.cwd())
		);
		const opts = {
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
				if (!isString(str)) return str;
				return new RegExp(
					`[\\\\/]${str.replace(/[\\-\\[\\]\\/\\{\\}\\(\\)\\*\\+\\?\\.\\\\\\^\\$\\|]/g, "\\$&")}([\\\\/]|$|!|\\?)`
				);
			}),
			maxModules: optionOrFallback(
				options.maxModules,
				forToString ? 15 : Infinity
			),
			sortModules: optionOrFallback(options.modulesSort, "id"),
			sortChunks: optionOrFallback(options.chunksSort, "id"),
			sortAssets: optionOrFallback(options.assetsSort, ""),
			requestShortener
		};

		const result = {
			errors: compilation.errors.map(e =>
				formatError(e, requestShortener, opts.showErrorDetails, opts.showModuleTrace)
			),
			warnings: Stats.filterWarnings(
				compilation.warnings.map(e =>
					formatError(e, requestShortener, opts.showErrorDetails, opts.showModuleTrace)
				),
				opts.warningsFilter
			)
		};

		Object.defineProperty(result, "_showWarnings", {
			value: opts.showWarnings,
			enumerable: false
		});
		Object.defineProperty(result, "_showErrors", {
			value: opts.showErrors,
			enumerable: false
		});

		if (opts.showVersion) {
			result.version = require("../package.json").version;
		}
		if (opts.showHash) result.hash = this.hash;
		if (opts.showTimings && this.startTime && this.endTime) {
			result.time = this.endTime - this.startTime;
		}
		if (compilation.needAdditionalPass) {
			result.needAdditionalPass = true;
		}
		if (opts.showPublicPath) {
			result.publicPath = compilation.mainTemplate.getPublicPath({
				hash: compilation.hash
			});
		}
		if (opts.showAssets) {
			addAssets.call(this, result, compilation, opts, requestShortener);
		}
		if (opts.showEntrypoints) {
			addEntrypoints(result, compilation, opts);
		}
		if (opts.showChunks) {
			addChunks.call(this, result, compilation, opts, requestShortener);
		}
		if (opts.showModules) {
			addModules.call(this, result, compilation, opts, requestShortener);
		}
		if (opts.showChildren) {
			addChildren(result, compilation, options, forToString);
		}
		return result;
	}

	toString(options) {
		if (isString(options) || typeof options === "boolean") {
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
					if (useColors) {
						buf.push("\u001b[39m\u001b[22m");
					}
				};
				return acc;
			},
			{
				normal: str => buf.push(str)
			}
		);

		const coloredTime = time => {
			let times = [800, 400, 200, 100];
			if (obj.time) {
				times = [
					obj.time / 2,
					obj.time / 4,
					obj.time / 8,
					obj.time / 16
				];
			}
			if (time < times[3]) colors.normal(`${time}ms`);
			else if (time < times[2]) colors.bold(`${time}ms`);
			else if (time < times[1]) colors.green(`${time}ms`);
			else if (time < times[0]) colors.yellow(`${time}ms`);
			else colors.red(`${time}ms`);
		};

		const newline = () => buf.push("\n");
		const getText = (arr, row, col) => `${arr[row][col].value}`;

		const table = (array, align, splitter) => {
			const rows = array.length;
			const cols = array[0].length;
			const colSizes = new Array(cols).fill(0);
			for (let row = 0; row < rows; row++) {
				for (let col = 0; col < cols; col++) {
					const value = getText(array, row, col);
					if (value.length > colSizes[col]) colSizes[col] = value.length;
				}
			}
			for (let row = 0; row < rows; row++) {
				for (let col = 0; col < cols; col++) {
					const format = array[row][col].color;
					const value = getText(array, row, col);
					let l = value.length;
					if (align[col] === "l") format(value);
					for (; l < colSizes[col] && col !== cols - 1; l++)
						colors.normal(" ");
					if (align[col] === "r") format(value);
					if (col + 1 < cols && colSizes[col] !== 0)
						colors.normal(splitter || "  ");
				}
				newline();
			}
		};

		const getAssetColor = (asset, defaultColor) =>
			asset.isOverSizeLimit ? colors.yellow : defaultColor;

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
					{
						value: asset.name,
						color: getAssetColor(asset, colors.green)
					},
					{
						value: SizeFormatHelpers.formatSize(asset.size),
						color: getAssetColor(asset, colors.normal)
					},
					{
						value: asset.chunks.join(", "),
						color: colors.bold
					},
					{
						value: asset.emitted ? "[emitted]" : "",
						color: colors.green
					},
					{
						value: asset.isOverSizeLimit ? "[big]" : "",
						color: getAssetColor(asset, colors.normal)
					},
					{
						value: asset.chunkNames.join(", "),
						color: colors.normal
					}
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
					if (module.usedExports === false)
						colors.cyan("[no exports used]");
					else
						colors.cyan(`[only some exports used: ${module.usedExports.join(", ")}]`);
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
							if (origin.loc) {
								colors.normal(origin.loc);
							}
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
			colors.yellow(
				"Compilation needs an additional pass and will compile again."
			);
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
		let innerOptions;
		if (Array.isArray(options.children)) {
			if (idx < options.children.length) innerOptions = options.children[idx];
		} else if (typeof options.children === "object" && options.children) {
			innerOptions = options.children;
		}
		if (typeof innerOptions === "boolean" || typeof innerOptions === "string")
			innerOptions = Stats.presetToOptions(innerOptions);
		if (!innerOptions) return options;
		const childOptions = Object.assign({}, options);
		delete childOptions.children;
		return Object.assign(childOptions, innerOptions);
	}
}

module.exports = Stats;