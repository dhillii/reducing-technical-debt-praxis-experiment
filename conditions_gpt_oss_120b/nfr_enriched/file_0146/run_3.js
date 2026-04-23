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
		const normalizedWarningsFilters = [].concat(warningsFilter).map(filter => {
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
		});
		return warnings.filter(warning => !normalizedWarningsFilters.some(check => check(warning)));
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

	/*** Helper: create module filter ***/
	_createModuleFilter(requestShortener, excludeModules, maxModules, showCachedModules) {
		let i = 0;
		return module => {
			if (!showCachedModules && !module.built) {
				return false;
			}
			if (excludeModules.length > 0) {
				const ident = requestShortener.shorten(module.resource);
				if (excludeModules.some(regExp => regExp.test(ident))) {
					return false;
				}
			}
			return i++ < maxModules;
		};
	}

	/*** Helper: sort comparator ***/
	_sortByFieldAndOrder(fieldKey, a, b) {
		if (a[fieldKey] === null && b[fieldKey] === null) return 0;
		if (a[fieldKey] === null) return 1;
		if (b[fieldKey] === null) return -1;
		if (a[fieldKey] === b[fieldKey]) return 0;
		return a[fieldKey] < b[fieldKey] ? -1 : 1;
	}

	_sortByField(field) {
		if (!field) return () => 0;
		const fieldKey = this.normalizeFieldKey(field);
		const regular = this.sortOrderRegular(field);
		return (a, b) => this._sortByFieldAndOrder(fieldKey, regular ? a : b, regular ? b : a);
	}

	/*** Helper: format error/warning ***/
	_formatError(e, requestShortener, showErrorDetails, showModuleTrace) {
		let text = "";
		if (typeof e === "string") e = { message: e };
		if (e.chunk) {
			text += `chunk ${e.chunk.name || e.chunk.id}${e.chunk.hasRuntime() ? " [entry]" : e.chunk.isInitial() ? " [initial]" : ""}\n`;
		}
		if (e.file) text += `${e.file}\n`;
		if (e.module && typeof e.module.readableIdentifier === "function") {
			text += `${e.module.readableIdentifier(requestShortener)}\n`;
		}
		text += e.message;
		if (showErrorDetails && e.details) text += `\n${e.details}`;
		if (showErrorDetails && e.missing) text += e.missing.map(item => `\n[${item}]`).join("");
		if (showModuleTrace && e.dependencies && e.origin) {
			text += `\n @ ${e.origin.readableIdentifier(requestShortener)}`;
			e.dependencies.forEach(dep => {
				if (!dep.loc || typeof dep.loc === "string") return;
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

	/*** Helper: map module to JSON ***/
	_mapModule(module, requestShortener, flags) {
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

	/*** Helper: add assets ***/
	_addAssets(obj, compilation, requestShortener, flags) {
		if (!flags.showAssets) return;
		const assetsByFile = {};
		obj.assetsByChunkName = {};
		obj.assets = Object.keys(compilation.assets)
			.map(name => {
				const assetInfo = compilation.assets[name];
				const assetObj = {
					name,
					size: assetInfo.size(),
					chunks: [],
					chunkNames: [],
					emitted: assetInfo.emitted
				};
				if (flags.showPerformance) assetObj.isOverSizeLimit = assetInfo.isOverSizeLimit;
				assetsByFile[name] = assetObj;
				return assetObj;
			})
			.filter(asset => flags.showCachedAssets || asset.emitted);
		compilation.chunks.forEach(chunk => {
			chunk.files.forEach(file => {
				const asset = assetsByFile[file];
				if (!asset) return;
				chunk.ids.forEach(id => asset.chunks.push(id));
				if (chunk.name) {
					asset.chunkNames.push(chunk.name);
					if (obj.assetsByChunkName[chunk.name])
						obj.assetsByChunkName[chunk.name] = [].concat(obj.assetsByChunkName[chunk.name]).concat([file]);
					else obj.assetsByChunkName[chunk.name] = file;
				}
			});
		});
		obj.assets.sort(this._sortByField(flags.sortAssets));
	}

	/*** Helper: add entrypoints ***/
	_addEntryPoints(obj, compilation, flags) {
		if (!flags.showEntrypoints) return;
		obj.entrypoints = {};
		Object.keys(compilation.entrypoints).forEach(name => {
			const ep = compilation.entrypoints[name];
			const entry = {
				chunks: ep.chunks.map(c => c.id),
				assets: ep.chunks.reduce((arr, c) => arr.concat(c.files || []), [])
			};
			if (flags.showPerformance) entry.isOverSizeLimit = ep.isOverSizeLimit;
			obj.entrypoints[name] = entry;
		});
	}

	/*** Helper: add chunks ***/
	_addChunks(obj, compilation, requestShortener, flags) {
		if (!flags.showChunks) return;
		const createModuleFilter = this._createModuleFilter(requestShortener, flags.excludeModules, flags.maxModules, flags.showCachedModules);
		obj.chunks = compilation.chunks.map(chunk => {
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
			if (flags.showChunkModules) {
				chunkObj.modules = chunk.modules
					.slice()
					.sort(this._sortByField("depth"))
					.filter(createModuleFilter)
					.map(m => this._mapModule(m, requestShortener, flags));
				chunkObj.filteredModules = chunk.modules.length - chunkObj.modules.length;
				chunkObj.modules.sort(this._sortByField(flags.sortModules));
			}
			if (flags.showChunkOrigins) {
				chunkObj.origins = chunk.origins.map(origin => ({
					moduleId: origin.module ? origin.module.id : undefined,
					module: origin.module ? origin.module.identifier() : "",
					moduleIdentifier: origin.module ? origin.module.identifier() : "",
					moduleName: origin.module ? origin.module.readableIdentifier(requestShortener) : "",
					loc: formatLocation(origin.loc),
					name: origin.name,
					reasons: origin.reasons || []
				}));
			}
			return chunkObj;
		});
		obj.chunks.sort(this._sortByField(flags.sortChunks));
	}

	/*** Helper: add modules ***/
	_addModules(obj, compilation, requestShortener, flags) {
		if (!flags.showModules) return;
		const createModuleFilter = this._createModuleFilter(requestShortener, flags.excludeModules, flags.maxModules, flags.showCachedModules);
		obj.modules = compilation.modules
			.slice()
			.sort(this._sortByField("depth"))
			.filter(createModuleFilter)
			.map(m => this._mapModule(m, requestShortener, flags));
		obj.filteredModules = compilation.modules.length - obj.modules.length;
		obj.modules.sort(this._sortByField(flags.sortModules));
	}

	/*** Helper: add children ***/
	_addChildren(obj, compilation, options, forToString) {
		if (!options.children) return;
		obj.children = compilation.children.map((child, idx) => {
			const childOptions = Stats.getChildOptions(options, idx);
			const childStats = new Stats(child).toJson(childOptions, forToString);
			delete childStats.hash;
			delete childStats.version;
			childStats.name = child.name;
			return childStats;
		});
	}

	toJson(options, forToString) {
		if (typeof options === "boolean" || typeof options === "string") {
			options = Stats.presetToOptions(options);
		} else if (!options) {
			options = {};
		}
		const compilation = this.compilation;
		const requestShortener = new RequestShortener(optionOrFallback(options.context, process.cwd()));
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
				return new RegExp(`[\\\\/]${str.replace(/[\\-\\[\\]\\/\\{\\}\\(\\)\\*\\+\\?\\.\\\\\\^\\$\\|]/g, "\\$&")}([\\\\/]|$|!|\\?)`);
			}),
			maxModules: optionOrFallback(options.maxModules, forToString ? 15 : Infinity),
			sortModules: optionOrFallback(options.modulesSort, "id"),
			sortChunks: optionOrFallback(options.chunksSort, "id"),
			sortAssets: optionOrFallback(options.assetsSort, "")
		};

		const formatError = e => this._formatError(e, requestShortener, flags.showErrorDetails, flags.showModuleTrace);
		const obj = {
			errors: compilation.errors.map(formatError),
			warnings: Stats.filterWarnings(compilation.warnings.map(formatError), flags.warningsFilter)
		};

		Object.defineProperty(obj, "_showWarnings", { value: flags.showWarnings, enumerable: false });
		Object.defineProperty(obj, "_showErrors", { value: flags.showErrors, enumerable: false });

		if (flags.showVersion) obj.version = require("../package.json").version;
		if (flags.showHash) obj.hash = this.hash;
		if (flags.showTimings && this.startTime && this.endTime) obj.time = this.endTime - this.startTime;
		if (compilation.needAdditionalPass) obj.needAdditionalPass = true;
		if (flags.showPublicPath) {
			obj.publicPath = compilation.mainTemplate.getPublicPath({ hash: compilation.hash });
		}

		this._addAssets(obj, compilation, requestShortener, flags);
		this._addEntryPoints(obj, compilation, flags);
		this._addChunks(obj, compilation, requestShortener, flags);
		this._addModules(obj, compilation, requestShortener, flags);
		this._addChildren(obj, compilation, options, forToString);

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

	/*** Helper: colored time output ***/
	static _coloredTime(buf, colors, time, reference) {
		const thresholds = reference ? [reference / 2, reference / 4, reference / 8, reference / 16] : [800, 400, 200, 100];
		if (time < thresholds[3]) colors.normal(`${time}ms`);
		else if (time < thresholds[2]) colors.bold(`${time}ms`);
		else if (time < thresholds[1]) colors.green(`${time}ms`);
		else if (time < thresholds[0]) colors.yellow(`${time}ms`);
		else colors.red(`${time}ms`);
	}

	/*** Helper: render table ***/
	static _renderTable(buf, colors, array, align, splitter) {
		const rows = array.length;
		const cols = array[0].length;
		const colSizes = new Array(cols).fill(0);
		const getText = (r, c) => `${array[r][c].value}`;
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const len = getText(r, c).length;
				if (len > colSizes[c]) colSizes[c] = len;
			}
		}
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const { color } = array[r][c];
				const value = getText(r, c);
				const pad = colSizes[c] - value.length;
				if (align[c] === "l") color(value);
				colors.normal(" ".repeat(pad));
				if (align[c] === "r") color(value);
				if (c + 1 < cols && colSizes[c] !== 0) colors.normal(splitter || "  ");
			}
			buf.push("\n");
		}
	}

	/*** Helper: process module attributes ***/
	static _processModuleAttributes(buf, colors, module) {
		colors.normal(" ");
		colors.normal(SizeFormatHelpers.formatSize(module.size));
		if (module.chunks) module.chunks.forEach(ch => { colors.normal(" {"); colors.yellow(ch); colors.normal("}"); });
		if (typeof module.depth === "number") colors.normal(` [depth ${module.depth}]`);
		if (!module.cacheable) colors.red(" [not cacheable]");
		if (module.optional) colors.yellow(" [optional]");
		if (module.built) colors.green(" [built]");
		if (module.prefetched) colors.magenta(" [prefetched]");
		if (module.failed) colors.red(" [failed]");
		if (module.warnings) colors.yellow(` [${module.warnings} warning${module.warnings === 1 ? "" : "s"}]`);
		if (module.errors) colors.red(` [${module.errors} error${module.errors === 1 ? "" : "s"}]`);
	}

	/*** Helper: process module content ***/
	static _processModuleContent(buf, colors, module, prefix) {
		if (Array.isArray(module.providedExports)) {
			colors.normal(prefix);
			colors.cyan(`[exports: ${module.providedExports.join(", ")}]`);
			buf.push("\n");
		}
		if (module.usedExports !== undefined && module.usedExports !== true) {
			colors.normal(prefix);
			if (module.usedExports === false) colors.cyan("[no exports used]");
			else colors.cyan(`[only some exports used: ${module.usedExports.join(", ")}]`);
			buf.push("\n");
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
				if (reason.loc) { colors.normal(" "); colors.normal(reason.loc); }
				buf.push("\n");
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
					Stats._coloredTime(buf, colors, t, null);
					sum += t;
					colors.normal(" ");
				}
				colors.normal("->");
			});
			Object.keys(module.profile).forEach(key => {
				colors.normal(` ${key}:`);
				const t = module.profile[key];
				Stats._coloredTime(buf, colors, t, null);
				sum += t;
			});
			colors.normal(" = ");
			Stats._coloredTime(buf, colors, sum, null);
			buf.push("\n");
		}
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
		const colors = Object.keys(defaultColors).reduce((obj, name) => {
			obj[name] = str => {
				if (useColors) {
					buf.push(useColors === true || useColors[name] === undefined ? defaultColors[name] : useColors[name]);
				}
				buf.push(str);
				if (useColors) buf.push("\u001b[39m\u001b[22m");
			};
			return obj;
		}, { normal: s => buf.push(s) });

		if (obj.hash) { colors.normal("Hash: "); colors.bold(obj.hash); buf.push("\n"); }
		if (obj.version) { colors.normal("Version: webpack "); colors.bold(obj.version); buf.push("\n"); }
		if (typeof obj.time === "number") { colors.normal("Time: "); colors.bold(obj.time); colors.normal("ms"); buf.push("\n"); }
		if (obj.publicPath) { colors.normal("PublicPath: "); colors.bold(obj.publicPath); buf.push("\n"); }

		if (obj.assets && obj.assets.length) {
			const table = [[
				{ value: "Asset", color: colors.bold },
				{ value: "Size", color: colors.bold },
				{ value: "Chunks", color: colors.bold },
				{ value: "", color: colors.bold },
				{ value: "", color: colors.bold },
				{ value: "Chunk Names", color: colors.bold }
			]];
			obj.assets.forEach(a => {
				const assetColor = a.isOverSizeLimit ? colors.yellow : colors.green;
				table.push([
					{ value: a.name, color: assetColor },
					{ value: SizeFormatHelpers.formatSize(a.size), color: a.isOverSizeLimit ? colors.normal : colors.normal },
					{ value: a.chunks.join(", "), color: colors.bold },
					{ value: a.emitted ? "[emitted]" : "", color: colors.green },
					{ value: a.isOverSizeLimit ? "[big]" : "", color: a.isOverSizeLimit ? colors.normal : colors.normal },
					{ value: a.chunkNames.join(", "), color: colors.normal }
				]);
			});
			Stats._renderTable(buf, colors, table, "rrrlll");
		}

		if (obj.entrypoints) {
			Object.keys(obj.entrypoints).forEach(name => {
				const ep = obj.entrypoints[name];
				colors.normal("Entrypoint "); colors.bold(name);
				if (ep.isOverSizeLimit) { colors.normal(" "); colors.yellow("[big]"); }
				colors.normal(" =");
				ep.assets.forEach(a => { colors.normal(" "); colors.green(a); });
				buf.push("\n");
			});
		}

		const modulesById = {};
		if (obj.modules) {
			obj.modules.forEach(m => { modulesById[`$${m.identifier}`] = m; });
		} else if (obj.chunks) {
			obj.chunks.forEach(ch => {
				if (ch.modules) ch.modules.forEach(m => { modulesById[`$${m.identifier}`] = m; });
			});
		}

		if (obj.chunks) {
			obj.chunks.forEach(chunk => {
				colors.normal("chunk ");
				if (chunk.id < 1000) colors.normal(" ");
				if (chunk.id < 100) colors.normal(" ");
				if (chunk.id < 10) colors.normal(" ");
				colors.normal("{"); colors.yellow(chunk.id); colors.normal("} ");
				colors.green(chunk.files.join(", "));
				if (chunk.names && chunk.names.length) {
					colors.normal(" ("); colors.normal(chunk.names.join(", ")); colors.normal(")");
				}
				colors.normal(" "); colors.normal(SizeFormatHelpers.formatSize(chunk.size));
				chunk.parents.forEach(p => { colors.normal(" {"); colors.yellow(p); colors.normal("}"); });
				if (chunk.entry) colors.yellow(" [entry]");
				else if (chunk.initial) colors.yellow(" [initial]");
				if (chunk.rendered) colors.green(" [rendered]");
				if (chunk.recorded) colors.green(" [recorded]");
				buf.push("\n");
				if (chunk.origins) {
					chunk.origins.forEach(origin => {
						colors.normal("    > ");
						if (origin.reasons && origin.reasons.length) { colors.yellow(origin.reasons.join(" ")); colors.normal(" "); }
						if (origin.name) { colors.normal(origin.name); colors.normal(" "); }
						if (origin.module) {
							colors.normal("["); colors.normal(origin.moduleId); colors.normal("] ");
							const mod = modulesById[`$${origin.module}`];
							if (mod) { colors.bold(mod.name); colors.normal(" "); }
							if (origin.loc) colors.normal(origin.loc);
						}
						buf.push("\n");
					});
				}
				if (chunk.modules) {
					chunk.modules.forEach(mod => {
						colors.normal(" ");
						if (mod.id < 1000) colors.normal(" ");
						if (mod.id < 100) colors.normal(" ");
						if (mod.id < 10) colors.normal(" ");
						colors.normal("["); colors.normal(mod.id); colors.normal("] ");
						colors.bold(mod.name);
						Stats._processModuleAttributes(buf, colors, mod);
						buf.push("\n");
						Stats._processModuleContent(buf, colors, mod, "        ");
					});
					if (chunk.filteredModules > 0) {
						colors.normal(`     + ${chunk.filteredModules} hidden modules`);
						buf.push("\n");
					}
				}
			});
		}

		if (obj.modules) {
			obj.modules.forEach(mod => {
				if (mod.id < 1000) colors.normal(" ");
				if (mod.id < 100) colors.normal(" ");
				if (mod.id < 10) colors.normal(" ");
				colors.normal("["); colors.normal(mod.id); colors.normal("] ");
				colors.bold(mod.name || mod.identifier);
				Stats._processModuleAttributes(buf, colors, mod);
				buf.push("\n");
				Stats._processModuleContent(buf, colors, mod, "       ");
			});
			if (obj.filteredModules > 0) {
				colors.normal(`    + ${obj.filteredModules} hidden modules`);
				buf.push("\n");
			}
		}

		if (obj._showWarnings && obj.warnings) {
			obj.warnings.forEach(w => {
				buf.push("\n");
				colors.yellow(`WARNING in ${w}`);
				buf.push("\n");
			});
		}
		if (obj._showErrors && obj.errors) {
			obj.errors.forEach(e => {
				buf.push("\n");
				colors.red(`ERROR in ${e}`);
				buf.push("\n");
			});
		}
		if (obj.children) {
			obj.children.forEach(child => {
				const childStr = Stats.jsonToString(child, useColors);
				if (childStr) {
					if (child.name) {
						colors.normal("Child "); colors.bold(child.name); colors.normal(":");
					} else {
						colors.normal("Child");
					}
					buf.push("\n");
					buf.push("    ");
					buf.push(childStr.replace(/\n/g, "\n    "));
					buf.push("\n");
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