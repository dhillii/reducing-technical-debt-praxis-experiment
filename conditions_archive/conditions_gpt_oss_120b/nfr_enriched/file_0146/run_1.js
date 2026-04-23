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

	/* ---------- Public static helpers ---------- */

	static filterWarnings(warnings, warningsFilter) {
		if (!warningsFilter) return warnings;
		const normalized = [].concat(warningsFilter).map(filter => {
			if (typeof filter === "string") return w => w.indexOf(filter) > -1;
			if (filter instanceof RegExp) return w => filter.test(w);
			if (typeof filter === "function") return filter;
			throw new Error(`Can only filter warnings with Strings or RegExps. (Given: ${filter})`);
		});
		return warnings.filter(w => !normalized.some(c => c(w)));
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
		const child = Object.assign({}, options);
		delete child.children;
		return Object.assign(child, inner);
	}

	/* ---------- Instance helpers ---------- */

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

	/* ---------- Core conversion ---------- */

	toJson(options, forToString) {
		if (typeof options === "boolean" || typeof options === "string")
			options = Stats.presetToOptions(options);
		else if (!options) options = {};

		const compilation = this.compilation;
		const requestShortener = new RequestShortener(
			optionOrFallback(options.context, process.cwd())
		);
		const flags = this._extractFlags(options, forToString);
		const excludeModules = this._prepareExcludeModules(options);
		const maxModules = optionOrFallback(
			options.maxModules,
			forToString ? 15 : Infinity
		);
		const sortModules = optionOrFallback(options.modulesSort, "id");
		const sortChunks = optionOrFallback(options.chunksSort, "id");
		const sortAssets = optionOrFallback(options.assetsSort, "");

		const moduleFilter = this._createModuleFilter(
			requestShortener,
			excludeModules,
			flags.showCachedModules,
			maxModules
		);

		const obj = {
			errors: compilation.errors.map(e => this._formatError(e, requestShortener, flags)),
			warnings: Stats.filterWarnings(
				compilation.warnings.map(w => this._formatError(w, requestShortener, flags)),
				flags.warningsFilter
			)
		};

		this._attachMeta(obj, flags);
		if (flags.showAssets) this._buildAssets(obj, compilation, requestShortener, flags, sortAssets);
		if (flags.showEntrypoints) this._buildEntrypoints(obj, compilation, flags);
		if (flags.showChunks) this._buildChunks(obj, compilation, requestShortener, flags, moduleFilter, sortChunks, sortModules);
		if (flags.showModules) this._buildModules(obj, compilation, requestShortener, flags, moduleFilter, sortModules);
		if (flags.showChildren) this._buildChildren(obj, compilation, options, forToString);

		return obj;
	}

	/* ---------- Flag extraction ---------- */

	_extractFlags(options, forToString) {
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
			showPublicPath: optionOrFallback(options.publicPath, !forToString)
		};
	}

	_prepareExcludeModules(options) {
		return [].concat(optionOrFallback(options.exclude, [])).map(str => {
			if (typeof str !== "string") return str;
			return new RegExp(
				`[\\\\/]${str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&")}([\\\\/]|$|!|\\?)`
			);
		});
	}

	/* ---------- Module filter ---------- */

	_createModuleFilter(requestShortener, excludeModules, showCached, maxModules) {
		let i = 0;
		return module => {
			if (!showCached && !module.built) return false;
			if (excludeModules.length) {
				const ident = requestShortener.shorten(module.resource);
				if (excludeModules.some(r => r.test(ident))) return false;
			}
			return i++ < maxModules;
		};
	}

	/* ---------- Sorting helpers ---------- */

	_sortByFieldAndOrder(fieldKey, a, b) {
		if (a[fieldKey] === null && b[fieldKey] === null) return 0;
		if (a[fieldKey] === null) return 1;
		if (b[fieldKey] === null) return -1;
		if (a[fieldKey] === b[fieldKey]) return 0;
		return a[fieldKey] < b[fieldKey] ? -1 : 1;
	}
	_sortByField(field) {
		if (!field) return () => 0;
		const key = this.normalizeFieldKey(field);
		const regular = this.sortOrderRegular(field);
		return (a, b) => this._sortByFieldAndOrder(key, regular ? a : b, regular ? b : a);
	}

	/* ---------- Error formatting ---------- */

	_formatError(e, requestShortener, flags) {
		let text = "";
		if (typeof e === "string") e = { message: e };
		if (e.chunk) {
			text += `chunk ${e.chunk.name || e.chunk.id}${
				e.chunk.hasRuntime() ? " [entry]" : e.chunk.isInitial() ? " [initial]" : ""
			}\n`;
		}
		if (e.file) text += `${e.file}\n`;
		if (e.module && typeof e.module.readableIdentifier === "function")
			text += `${e.module.readableIdentifier(requestShortener)}\n`;
		text += e.message;
		if (flags.showErrorDetails && e.details) text += `\n${e.details}`;
		if (flags.showErrorDetails && e.missing)
			text += e.missing.map(item => `\n[${item}]`).join("");
		if (flags.showModuleTrace && e.dependencies && e.origin) {
			text += `\n @ ${e.origin.readableIdentifier(requestShortener)}`;
			e.dependencies.forEach(dep => {
				if (!dep.loc || typeof dep.loc === "string") return;
				const locInfo = formatLocation(dep.loc);
				if (locInfo) text += ` ${locInfo}`;
			});
			let cur = e.origin;
			while (cur.issuer) {
				cur = cur.issuer;
				text += `\n @ ${cur.readableIdentifier(requestShortener)}`;
			}
		}
		return text;
	}

	/* ---------- Meta data attachment ---------- */

	_attachMeta(obj, flags) {
		Object.defineProperty(obj, "_showWarnings", {
			value: flags.showWarnings,
			enumerable: false
		});
		Object.defineProperty(obj, "_showErrors", {
			value: flags.showErrors,
			enumerable: false
		});
		if (flags.showVersion) obj.version = require("../package.json").version;
		if (flags.showHash) obj.hash = this.hash;
		if (flags.showTimings && this.startTime && this.endTime) obj.time = this.endTime - this.startTime;
		if (this.compilation.needAdditionalPass) obj.needAdditionalPass = true;
		if (flags.showPublicPath) {
			obj.publicPath = this.compilation.mainTemplate.getPublicPath({
				hash: this.compilation.hash
			});
		}
	}

	/* ---------- Asset building ---------- */

	_buildAssets(obj, compilation, requestShortener, flags, sortAssets) {
		const assetsByFile = {};
		obj.assetsByChunkName = {};
		obj.assets = Object.keys(compilation.assets)
			.map(name => {
				const asset = compilation.assets[name];
				const entry = {
					name,
					size: asset.size(),
					chunks: [],
					chunkNames: [],
					emitted: asset.emitted
				};
				if (flags.showPerformance) entry.isOverSizeLimit = asset.isOverSizeLimit;
				assetsByFile[name] = entry;
				return entry;
			})
			.filter(a => flags.showCachedAssets || a.emitted);

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

	/* ---------- Entrypoint building ---------- */

	_buildEntrypoints(obj, compilation, flags) {
		obj.entrypoints = {};
		Object.keys(compilation.entrypoints).forEach(name => {
			const ep = compilation.entrypoints[name];
			const entry = {
				chunks: ep.chunks.map(c => c.id),
				assets: ep.chunks.reduce((a, c) => a.concat(c.files || []), [])
			};
			if (flags.showPerformance) entry.isOverSizeLimit = ep.isOverSizeLimit;
			obj.entrypoints[name] = entry;
		});
	}

	/* ---------- Chunk building ---------- */

	_buildChunks(obj, compilation, requestShortener, flags, moduleFilter, sortChunks, sortModules) {
		const fnModule = this._moduleToJson.bind(this, requestShortener, flags);
		obj.chunks = compilation.chunks.map(chunk => {
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
			if (flags.showChunkModules) {
				base.modules = chunk.modules
					.slice()
					.sort(this._sortByField("depth"))
					.filter(moduleFilter)
					.map(fnModule);
				base.filteredModules = chunk.modules.length - base.modules.length;
				base.modules.sort(this._sortByField(sortModules));
			}
			if (flags.showChunkOrigins) {
				base.origins = chunk.origins.map(origin => ({
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
			return base;
		});
		obj.chunks.sort(this._sortByField(sortChunks));
	}

	/* ---------- Module building ---------- */

	_buildModules(obj, compilation, requestShortener, flags, moduleFilter, sortModules) {
		const fnModule = this._moduleToJson.bind(this, requestShortener, flags);
		obj.modules = compilation.modules
			.slice()
			.sort(this._sortByField("depth"))
			.filter(moduleFilter)
			.map(fnModule);
		obj.filteredModules = compilation.modules.length - obj.modules.length;
		obj.modules.sort(this._sortByField(sortModules));
	}

	/* ---------- Child stats building ---------- */

	_buildChildren(obj, compilation, options, forToString) {
		obj.children = compilation.children.map((child, idx) => {
			const childOptions = Stats.getChildOptions(options, idx);
			const childStats = new Stats(child).toJson(childOptions, forToString);
			delete childStats.hash;
			delete childStats.version;
			childStats.name = child.name;
			return childStats;
		});
	}

	/* ---------- Module JSON conversion ---------- */

	_moduleToJson(requestShortener, flags, module) {
		const base = {
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
			issuerName: module.issuer && module.issuer.readableIdentifier(requestShortener),
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
			base.reasons = module.reasons
				.filter(r => r.dependency && r.module)
				.map(r => {
					const obj = {
						moduleId: r.module.id,
						moduleIdentifier: r.module.identifier(),
						module: r.module.readableIdentifier(requestShortener),
						moduleName: r.module.readableIdentifier(requestShortener),
						type: r.dependency.type,
						userRequest: r.dependency.userRequest
					};
					const locInfo = formatLocation(r.dependency.loc);
					if (locInfo) obj.loc = locInfo;
					return obj;
				})
				.sort((a, b) => a.moduleId - b.moduleId);
		}
		if (flags.showUsedExports) base.usedExports = module.used ? module.usedExports : false;
		if (flags.showProvidedExports)
			base.providedExports = Array.isArray(module.providedExports) ? module.providedExports : null;
		if (flags.showDepth) base.depth = module.depth;
		if (flags.showSource && module._source) base.source = module._source.source();
		return base;
	}

	/* ---------- String conversion ---------- */

	toString(options) {
		if (typeof options === "boolean" || typeof options === "string")
			options = Stats.presetToOptions(options);
		else if (!options) options = {};

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

		const colors = Object.keys(defaultColors).reduce((c, name) => {
			c[name] = str => {
				if (useColors) {
					c.push(
						useColors === true || useColors[name] === undefined
							? defaultColors[name]
							: useColors[name]
					);
				}
				c.push(str);
				if (useColors) c.push("\u001b[39m\u001b[22m");
			};
			return c;
		}, { normal: s => buf.push(s) });

		const coloredTime = time => {
			const thresholds = obj.time
				? [obj.time / 2, obj.time / 4, obj.time / 8, obj.time / 16]
				: [800, 400, 200, 100];
			if (time < thresholds[3]) colors.normal(`${time}ms`);
			else if (time < thresholds[2]) colors.bold(`${time}ms`);
			else if (time < thresholds[1]) colors.green(`${time}ms`);
			else if (time < thresholds[0]) colors.yellow(`${time}ms`);
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
					while (len < colSizes[c] && c !== cols - 1) {
						colors.normal(" ");
						len++;
					}
					if (align[c] === "r") fmt(val);
					if (c + 1 < cols && colSizes[c] !== 0) colors.normal(splitter || "  ");
				}
				newline();
			}
		};

		const getAssetColor = (asset, def) => (asset.isOverSizeLimit ? colors.yellow : def);

		/* Header */
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

		/* Assets */
		if (obj.assets && obj.assets.length) {
			const rows = [
				[
					{ value: "Asset", color: colors.bold },
					{ value: "Size", color: colors.bold },
					{ value: "Chunks", color: colors.bold },
					{ value: "", color: colors.bold },
					{ value: "", color: colors.bold },
					{ value: "Chunk Names", color: colors.bold }
				]
			];
			obj.assets.forEach(a => {
				rows.push([
					{ value: a.name, color: getAssetColor(a, colors.green) },
					{ value: SizeFormatHelpers.formatSize(a.size), color: getAssetColor(a, colors.normal) },
					{ value: a.chunks.join(", "), color: colors.bold },
					{ value: a.emitted ? "[emitted]" : "", color: colors.green },
					{ value: a.isOverSizeLimit ? "[big]" : "", color: getAssetColor(a, colors.normal) },
					{ value: a.chunkNames.join(", "), color: colors.normal }
				]);
			});
			table(rows, "rrrlll");
		}

		/* Entrypoints */
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
				newline();
			});
		}

		/* Build module lookup for origins */
		const modulesById = {};
		if (obj.modules) {
			obj.modules.forEach(m => (modulesById[`$${m.identifier}`] = m));
		} else if (obj.chunks) {
			obj.chunks.forEach(ch => {
				if (ch.modules) ch.modules.forEach(m => (modulesById[`$${m.identifier}`] = m));
			});
		}

		/* Helper: module attributes */
		const renderModuleAttributes = module => {
			colors.normal(" ");
			colors.normal(SizeFormatHelpers.formatSize(module.size));
			if (module.chunks) module.chunks.forEach(c => {
				colors.normal(" {");
				colors.yellow(c);
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
		};

		/* Helper: module content */
		const renderModuleContent = (module, prefix) => {
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
					if (r.loc) {
						colors.normal(" ");
						colors.normal(r.loc);
					}
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
					colors.normal("[");
					colors.normal(m.id);
					colors.normal("] ");
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

		/* Chunks */
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
				chunk.parents.forEach(p => {
					colors.normal(" {");
					colors.yellow(p);
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
							const mod = modulesById[`$${origin.module}`];
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
					chunk.modules.forEach(m => {
						colors.normal(" ");
						if (m.id < 1000) colors.normal(" ");
						if (m.id < 100) colors.normal(" ");
						if (m.id < 10) colors.normal(" ");
						colors.normal("[");
						colors.normal(m.id);
						colors.normal("] ");
						colors.bold(m.name);
						renderModuleAttributes(m);
						newline();
						renderModuleContent(m, "        ");
					});
					if (chunk.filteredModules > 0) {
						colors.normal(`     + ${chunk.filteredModules} hidden modules`);
						newline();
					}
				}
			});
		}

		/* Modules (no chunks) */
		if (obj.modules) {
			obj.modules.forEach(m => {
				if (m.id < 1000) colors.normal(" ");
				if (m.id < 100) colors.normal(" ");
				if (m.id < 10) colors.normal(" ");
				colors.normal("[");
				colors.normal(m.id);
				colors.normal("] ");
				colors.bold(m.name || m.identifier);
				renderModuleAttributes(m);
				newline();
				renderModuleContent(m, "       ");
			});
			if (obj.filteredModules > 0) {
				colors.normal(`    + ${obj.filteredModules} hidden modules`);
				newline();
			}
		}

		/* Warnings & Errors */
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

		/* Children */
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

		/* Additional pass notice */
		if (obj.needAdditionalPass) colors.yellow("Compilation needs an additional pass and will compile again.");

		while (buf[buf.length - 1] === "\n") buf.pop();
		return buf.join("");
	}
}

module.exports = Stats;