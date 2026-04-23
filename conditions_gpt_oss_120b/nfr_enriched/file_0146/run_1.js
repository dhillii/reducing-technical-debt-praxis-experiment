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

	/* ---------- Warning filtering ---------- */
	static filterWarnings(warnings, warningsFilter) {
		if (!warningsFilter) return warnings;
		const normalized = [].concat(warningsFilter).map(filter => {
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
		});
		return warnings.filter(w => !normalized.some(check => check(w)));
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

	/* ---------- toJson helpers ---------- */
	_createModuleFilter(showCachedModules, requestShortener, excludeModules, maxModules) {
		let i = 0;
		return module => {
			if (!showCachedModules && !module.built) return false;
			if (excludeModules.length > 0) {
				const ident = requestShortener.shorten(module.resource);
				if (excludeModules.some(reg => reg.test(ident))) return false;
			}
			return i++ < maxModules;
		};
	}
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
		return (a, b) =>
			this._sortByFieldAndOrder(
				fieldKey,
				regular ? a : b,
				regular ? b : a
			);
	}
	_formatError(e, requestShortener, showErrorDetails, showModuleTrace) {
		let text = "";
		if (typeof e === "string") e = { message: e };
		if (e.chunk) {
			text += `chunk ${e.chunk.name || e.chunk.id}${
				e.chunk.hasRuntime()
					? " [entry]"
					: e.chunk.isInitial()
					? " [initial]"
					: ""
			}\n`;
		}
		if (e.file) text += `${e.file}\n`;
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
	_buildAssets(compilation, requestShortener, showPerformance, showCachedAssets) {
		const assetsByFile = {};
		const assets = Object.keys(compilation.assets)
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
					if (asset.chunkNames) {
						// handled later
					}
				}
			});
		});
		return { assets, assetsByFile };
	}
	_buildEntryPoints(compilation, showPerformance) {
		const entrypoints = {};
		Object.keys(compilation.entrypoints).forEach(name => {
			const ep = compilation.entrypoints[name];
			const obj = {
				chunks: ep.chunks.map(c => c.id),
				assets: ep.chunks.reduce((a, c) => a.concat(c.files || []), [])
			};
			if (showPerformance) obj.isOverSizeLimit = ep.isOverSizeLimit;
			entrypoints[name] = obj;
		});
		return entrypoints;
	}
	_buildChunks(compilation, requestShortener, sortModules, sortChunks, sortAssets, showChunkModules, showChunkOrigins, createModuleFilter, fnModule) {
		const chunks = compilation.chunks.map(chunk => {
			const obj = {
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
			if (showChunkModules) {
				obj.modules = chunk.modules
					.slice()
					.sort(this._sortByField("depth"))
					.filter(createModuleFilter())
					.map(fnModule);
				obj.filteredModules = chunk.modules.length - obj.modules.length;
				obj.modules.sort(this._sortByField(sortModules));
			}
			if (showChunkOrigins) {
				obj.origins = chunk.origins.map(origin => ({
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
			return obj;
		});
		chunks.sort(this._sortByField(sortChunks));
		if (sortAssets) chunks.forEach(c => c.assets && c.assets.sort(this._sortByField(sortAssets)));
		return chunks;
	}
	_buildModules(compilation, requestShortener, sortModules, createModuleFilter, fnModule) {
		const modules = compilation.modules
			.slice()
			.sort(this._sortByField("depth"))
			.filter(createModuleFilter())
			.map(fnModule);
		const filtered = compilation.modules.length - modules.length;
		modules.sort(this._sortByField(sortModules));
		return { modules, filtered };
	}
	_buildChildren(compilation, options, forToString) {
		return compilation.children.map((child, idx) => {
			const childOptions = Stats.getChildOptions(options, idx);
			const childStats = new Stats(child).toJson(childOptions, forToString);
			delete childStats.hash;
			delete childStats.version;
			childStats.name = child.name;
			return childStats;
		});
	}
	/* ---------- toJson ---------- */
	toJson(options, forToString) {
		if (typeof options === "boolean" || typeof options === "string") {
			options = Stats.presetToOptions(options);
		} else if (!options) {
			options = {};
		}
		const compilation = this.compilation;
		const requestShortener = new RequestShortener(
			optionOrFallback(options.context, process.cwd())
		);
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
			if (typeof str !== "string") return str;
			return new RegExp(
				`[\\\\/]${str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&")}([\\\\/]|$|!|\\?)`
			);
		});
		const maxModules = optionOrFallback(
			options.maxModules,
			forToString ? 15 : Infinity
		);
		const sortModules = optionOrFallback(options.modulesSort, "id");
		const sortChunks = optionOrFallback(options.chunksSort, "id");
		const sortAssets = optionOrFallback(options.assetsSort, "");

		const createModuleFilter = () =>
			this._createModuleFilter(
				showCachedModules,
				requestShortener,
				excludeModules,
				maxModules
			);
		const fnModule = module => {
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
				chunks: module.chunks.map(c => c.id),
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
			if (showReasons) {
				obj.reasons = module.reasons
					.filter(r => r.dependency && r.module)
					.map(r => {
						const o = {
							moduleId: r.module.id,
							moduleIdentifier: r.module.identifier(),
							module: r.module.readableIdentifier(requestShortener),
							moduleName: r.module.readableIdentifier(requestShortener),
							type: r.dependency.type,
							userRequest: r.dependency.userRequest
						};
						const locInfo = formatLocation(r.dependency.loc);
						if (locInfo) o.loc = locInfo;
						return o;
					})
					.sort((a, b) => a.moduleId - b.moduleId);
			}
			if (showUsedExports) obj.usedExports = module.used ? module.usedExports : false;
			if (showProvidedExports)
				obj.providedExports = Array.isArray(module.providedExports)
					? module.providedExports
					: null;
			if (showDepth) obj.depth = module.depth;
			if (showSource && module._source) obj.source = module._source.source();
			return obj;
		};

		const obj = {
			errors: compilation.errors.map(e =>
				this._formatError(e, requestShortener, showErrorDetails, showModuleTrace)
			),
			warnings: Stats.filterWarnings(
				compilation.warnings.map(e =>
					this._formatError(e, requestShortener, showErrorDetails, showModuleTrace)
				),
				warningsFilter
			)
		};

		Object.defineProperty(obj, "_showWarnings", {
			value: showWarnings,
			enumerable: false
		});
		Object.defineProperty(obj, "_showErrors", {
			value: showErrors,
			enumerable: false
		});

		if (showVersion) obj.version = require("../package.json").version;
		if (showHash) obj.hash = this.hash;
		if (showTimings && this.startTime && this.endTime) obj.time = this.endTime - this.startTime;
		if (compilation.needAdditionalPass) obj.needAdditionalPass = true;
		if (showPublicPath) {
			obj.publicPath = this.compilation.mainTemplate.getPublicPath({
				hash: this.compilation.hash
			});
		}
		if (showAssets) {
			const { assets, assetsByFile } = this._buildAssets(
				compilation,
				requestShortener,
				showPerformance,
				showCachedAssets
			);
			obj.assets = assets;
			obj.assetsByChunkName = {};
			compilation.chunks.forEach(chunk => {
				chunk.files.forEach(file => {
					const asset = assetsByFile[file];
					if (!asset) return;
					chunk.ids.forEach(id => asset.chunks.push(id));
					if (chunk.name) {
						asset.chunkNames.push(chunk.name);
						if (obj.assetsByChunkName[chunk.name])
							obj.assetsByChunkName[chunk.name] = [].concat(
								obj.assetsByChunkName[chunk.name],
								[file]
							);
						else obj.assetsByChunkName[chunk.name] = file;
					}
				});
			});
			obj.assets.sort(this._sortByField(sortAssets));
		}
		if (showEntrypoints) obj.entrypoints = this._buildEntryPoints(compilation, showPerformance);
		if (showChunks) {
			obj.chunks = this._buildChunks(
				compilation,
				requestShortener,
				sortModules,
				sortChunks,
				sortAssets,
				showChunkModules,
				showChunkOrigins,
				createModuleFilter,
				fnModule
			);
		}
		if (showModules) {
			const { modules, filtered } = this._buildModules(
				compilation,
				requestShortener,
				sortModules,
				createModuleFilter,
				fnModule
			);
			obj.modules = modules;
			obj.filteredModules = filtered;
		}
		if (showChildren) obj.children = this._buildChildren(compilation, options, forToString);
		return obj;
	}
	/* ---------- toString ---------- */
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
	/* ---------- jsonToString helpers ---------- */
	static _createColorFuncs(useColors, customColors) {
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
					const col = useColors === true || useColors[name] === undefined
						? defaultColors[name]
						: useColors[name];
					obj._buf.push(col);
				}
				obj._buf.push(str);
				if (useColors) obj._buf.push("\u001b[39m\u001b[22m");
			};
			return obj;
		}, { normal: s => obj._buf.push(s), _buf: [] });
		return colors;
	}
	static _coloredTime(time, obj, colors) {
		const thresholds = obj.time
			? [obj.time / 2, obj.time / 4, obj.time / 8, obj.time / 16]
			: [800, 400, 200, 100];
		if (time < thresholds[3]) colors.normal(`${time}ms`);
		else if (time < thresholds[2]) colors.bold(`${time}ms`);
		else if (time < thresholds[1]) colors.green(`${time}ms`);
		else if (time < thresholds[0]) colors.yellow(`${time}ms`);
		else colors.red(`${time}ms`);
	}
	static _table(array, align, splitter, colors) {
		const rows = array.length;
		const cols = array[0].length;
		const colSizes = new Array(cols).fill(0);
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const val = `${array[r][c].value}`;
				if (val.length > colSizes[c]) colSizes[c] = val.length;
			}
		}
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const fmt = array[r][c].color;
				const val = `${array[r][c].value}`;
				let len = val.length;
				if (align[c] === "l") fmt(val);
				while (len < colSizes[c] && c !== cols - 1) {
					colors.normal(" ");
					len++;
				}
				if (align[c] === "r") fmt(val);
				if (c + 1 < cols && colSizes[c] !== 0) colors.normal(splitter || "  ");
			}
			colors._buf.push("\n");
		}
	}
	static _processModuleAttributes(module, colors) {
		colors.normal(" ");
		colors.normal(SizeFormatHelpers.formatSize(module.size));
		if (module.chunks) module.chunks.forEach(ch => {
			colors.normal(" {");
			colors.yellow(ch);
			colors.normal("}");
		});
		if (typeof module.depth === "number") colors.normal(` [depth ${module.depth}]`);
		if (!module.cacheable) colors.red(" [not cacheable]");
		if (module.optional) colors.yellow(" [optional]");
		if (module.built) colors.green(" [built]");
		if (module.prefetched) colors.magenta(" [prefetched]");
		if (module.failed) colors.red(" [failed]");
		if (module.warnings) colors.yellow(` [${module.warnings} warning${module.warnings === 1 ? "" : "s"}]`);
		if (module.errors) colors.red(` [${module.errors} error${module.errors === 1 ? "" : "s"}]`);
	}
	static _processModuleContent(module, prefix, colors) {
		if (Array.isArray(module.providedExports)) {
			colors.normal(prefix);
			colors.cyan(`[exports: ${module.providedExports.join(", ")}]`);
			colors._buf.push("\n");
		}
		if (module.usedExports !== undefined) {
			if (module.usedExports !== true) {
				colors.normal(prefix);
				if (module.usedExports === false) colors.cyan("[no exports used]");
				else colors.cyan(`[only some exports used: ${module.usedExports.join(", ")}]`);
				colors._buf.push("\n");
			}
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
				if (r.loc) {
					colors.normal(" ");
					colors.normal(r.loc);
				}
				colors._buf.push("\n");
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
				colors.normal("[");
				colors.normal(m.id);
				colors.normal("] ");
				if (m.profile) {
					const t = (m.profile.factory || 0) + (m.profile.building || 0);
					Stats._coloredTime(t, {}, colors);
					sum += t;
					colors.normal(" ");
				}
				colors.normal("->");
			});
			Object.keys(module.profile).forEach(key => {
				colors.normal(` ${key}:`);
				const t = module.profile[key];
				Stats._coloredTime(t, {}, colors);
				sum += t;
			});
			colors.normal(" = ");
			Stats._coloredTime(sum, {}, colors);
			colors._buf.push("\n");
		}
	}
	/* ---------- jsonToString ---------- */
	static jsonToString(obj, useColors) {
		const colors = Stats._createColorFuncs(useColors);
		const buf = colors._buf;

		if (obj.hash) {
			colors.normal("Hash: ");
			colors.bold(obj.hash);
			buf.push("\n");
		}
		if (obj.version) {
			colors.normal("Version: webpack ");
			colors.bold(obj.version);
			buf.push("\n");
		}
		if (typeof obj.time === "number") {
			colors.normal("Time: ");
			colors.bold(obj.time);
			colors.normal("ms");
			buf.push("\n");
		}
		if (obj.publicPath) {
			colors.normal("PublicPath: ");
			colors.bold(obj.publicPath);
			buf.push("\n");
		}
		if (obj.assets && obj.assets.length > 0) {
			const tableData = [
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
				const assetColor = asset.isOverSizeLimit ? colors.yellow : colors.green;
				tableData.push([
					{ value: asset.name, color: assetColor },
					{ value: SizeFormatHelpers.formatSize(asset.size), color: asset.isOverSizeLimit ? colors.yellow : colors.normal },
					{ value: asset.chunks.join(", "), color: colors.bold },
					{ value: asset.emitted ? "[emitted]" : "", color: colors.green },
					{ value: asset.isOverSizeLimit ? "[big]" : "", color: asset.isOverSizeLimit ? colors.yellow : colors.normal },
					{ value: asset.chunkNames.join(", "), color: colors.normal }
				]);
			});
			Stats._table(tableData, "rrrlll", null, colors);
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
				ep.assets.forEach(a => {
					colors.normal(" ");
					colors.green(a);
				});
				buf.push("\n");
			});
		}
		const modulesById = {};
		if (obj.modules) {
			obj.modules.forEach(m => {
				modulesById[`$${m.identifier}`] = m;
			});
		} else if (obj.chunks) {
			obj.chunks.forEach(ch => {
				if (ch.modules) {
					ch.modules.forEach(m => {
						modulesById[`$${m.identifier}`] = m;
					});
				}
			});
		}
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
				chunk.parents.forEach(p => {
					colors.normal(" {");
					colors.yellow(p);
					colors.normal("}");
				});
				if (chunk.entry) colors.yellow(" [entry]");
				else if (chunk.initial) colors.yellow(" [initial]");
				if (chunk.rendered) colors.green(" [rendered]");
				if (chunk.recorded) colors.green(" [recorded]");
				buf.push("\n");
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
							const mod = modulesById[`$${origin.module}`];
							if (mod) {
								colors.bold(mod.name);
								colors.normal(" ");
							}
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
						colors.normal("[");
						colors.normal(mod.id);
						colors.normal("] ");
						colors.bold(mod.name);
						Stats._processModuleAttributes(mod, colors);
						buf.push("\n");
						Stats._processModuleContent(mod, "        ", colors);
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
				colors.normal("[");
				colors.normal(mod.id);
				colors.normal("] ");
				colors.bold(mod.name || mod.identifier);
				Stats._processModuleAttributes(mod, colors);
				buf.push("\n");
				Stats._processModuleContent(mod, "       ", colors);
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
						colors.normal("Child ");
						colors.bold(child.name);
						colors.normal(":");
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
		if (obj.needAdditionalPass) {
			colors.yellow("Compilation needs an additional pass and will compile again.");
		}
		while (buf[buf.length - 1] === "\n") buf.pop();
		return buf.join("");
	}
	/* ---------- preset & child options ---------- */
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
		const child = Object.assign({}, options);
		delete child.children;
		return Object.assign(child, inner);
	}
}
module.exports = Stats;