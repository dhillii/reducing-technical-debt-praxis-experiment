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

	/* ---------- Public API ---------- */

	static filterWarnings(warnings, warningsFilter) {
		if (!warningsFilter) return warnings;
		const normalized = [].concat(warningsFilter).map(filter => {
			if (typeof filter === "string") return w => w.indexOf(filter) > -1;
			if (filter instanceof RegExp) return w => filter.test(w);
			if (typeof filter === "function") return filter;
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

	toJson(options, forToString) {
		const opts = this._normalizeOptions(options, forToString);
		const compilation = this.compilation;
		const requestShortener = new RequestShortener(
			optionOrFallback(opts.context, process.cwd())
		);
		const moduleFilter = this._createModuleFilter(
			requestShortener,
			opts,
			forToString
		);
		const sortByField = this._sortByFieldFactory(requestShortener, opts);

		const obj = {
			errors: compilation.errors.map(e => this._formatError(e, requestShortener, opts)),
			warnings: Stats.filterWarnings(
				compilation.warnings.map(w => this._formatError(w, requestShortener, opts)),
				opts.warningsFilter
			)
		};

		this._attachMeta(obj, opts, compilation);
		if (opts.showAssets) this._buildAssets(obj, compilation, requestShortener, sortByField);
		if (opts.showEntrypoints) this._buildEntrypoints(obj, compilation, requestShortener);
		if (opts.showChunks) this._buildChunks(obj, compilation, requestShortener, moduleFilter, sortByField);
		if (opts.showModules) this._buildModules(obj, compilation, requestShortener, moduleFilter, sortByField);
		if (opts.showChildren) this._buildChildren(obj, compilation, opts, forToString);
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
		const builder = new StatsStringBuilder(obj, useColors);
		return builder.build();
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

	/* ---------- Private helpers ---------- */

	_normalizeOptions(options, forToString) {
		if (typeof options === "boolean" || typeof options === "string") {
			options = Stats.presetToOptions(options);
		} else if (!options) {
			options = {};
		}
		const opt = options;
		opt.context = optionOrFallback(opt.context, process.cwd());
		opt.performance = optionOrFallback(opt.performance, true);
		opt.hash = optionOrFallback(opt.hash, true);
		opt.version = optionOrFallback(opt.version, true);
		opt.timings = optionOrFallback(opt.timings, true);
		opt.assets = optionOrFallback(opt.assets, true);
		opt.entrypoints = optionOrFallback(opt.entrypoints, !forToString);
		opt.chunks = optionOrFallback(opt.chunks, true);
		opt.chunkModules = optionOrFallback(opt.chunkModules, !!forToString);
		opt.chunkOrigins = optionOrFallback(opt.chunkOrigins, !forToString);
		opt.modules = optionOrFallback(opt.modules, !forToString);
		opt.depth = optionOrFallback(opt.depth, !forToString);
		opt.cached = optionOrFallback(opt.cached, true);
		opt.cachedAssets = optionOrFallback(opt.cachedAssets, true);
		opt.reasons = optionOrFallback(opt.reasons, !forToString);
		opt.usedExports = optionOrFallback(opt.usedExports, !forToString);
		opt.providedExports = optionOrFallback(opt.providedExports, !forToString);
		opt.children = optionOrFallback(opt.children, true);
		opt.source = optionOrFallback(opt.source, !forToString);
		opt.moduleTrace = optionOrFallback(opt.moduleTrace, true);
		opt.errors = optionOrFallback(opt.errors, true);
		opt.errorDetails = optionOrFallback(opt.errorDetails, !forToString);
		opt.warnings = optionOrFallback(opt.warnings, true);
		opt.warningsFilter = optionOrFallback(opt.warningsFilter, null);
		opt.publicPath = optionOrFallback(opt.publicPath, !forToString);
		opt.exclude = [].concat(optionOrFallback(opt.exclude, [])).map(str => {
			if (typeof str !== "string") return str;
			return new RegExp(
				`[\\\\/]${str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&")}([\\\\/]|$|!|\\?)`
			);
		});
		opt.maxModules = optionOrFallback(opt.maxModules, forToString ? 15 : Infinity);
		opt.modulesSort = optionOrFallback(opt.modulesSort, "id");
		opt.chunksSort = optionOrFallback(opt.chunksSort, "id");
		opt.assetsSort = optionOrFallback(opt.assetsSort, "");
		return opt;
	}

	_createModuleFilter(requestShortener, opts, forToString) {
		let count = 0;
		return module => {
			if (!opts.cached && !module.built) return false;
			if (opts.exclude.length > 0) {
				const ident = requestShortener.shorten(module.resource);
				if (opts.exclude.some(r => r.test(ident))) return false;
			}
			return count++ < opts.maxModules;
		};
	}

	_sortByFieldFactory(requestShortener, opts) {
		const sortByFieldAndOrder = (fieldKey, a, b) => {
			if (a[fieldKey] === null && b[fieldKey] === null) return 0;
			if (a[fieldKey] === null) return 1;
			if (b[fieldKey] === null) return -1;
			if (a[fieldKey] === b[fieldKey]) return 0;
			return a[fieldKey] < b[fieldKey] ? -1 : 1;
		};

		return field => (a, b) => {
			if (!field) return 0;
			const key = this.normalizeFieldKey(field);
			const regular = this.sortOrderRegular(field);
			return sortByFieldAndOrder(
				key,
				regular ? a : b,
				regular ? b : a
			);
		};
	}

	_formatError(e, requestShortener, opts) {
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
		if (e.module && typeof e.module.readableIdentifier === "function")
			text += `${e.module.readableIdentifier(requestShortener)}\n`;
		text += e.message;
		if (opts.errorDetails && e.details) text += `\n${e.details}`;
		if (opts.errorDetails && e.missing)
			text += e.missing.map(item => `\n[${item}]`).join("");
		if (opts.moduleTrace && e.dependencies && e.origin) {
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

	_attachMeta(obj, opts, compilation) {
		if (opts.version) obj.version = require("../package.json").version;
		if (opts.hash) obj.hash = this.hash;
		if (opts.timings && this.startTime && this.endTime)
			obj.time = this.endTime - this.startTime;
		if (compilation.needAdditionalPass) obj.needAdditionalPass = true;
		if (opts.publicPath) {
			obj.publicPath = compilation.mainTemplate.getPublicPath({
				hash: compilation.hash
			});
		}
		Object.defineProperty(obj, "_showWarnings", {
			value: opts.warnings,
			enumerable: false
		});
		Object.defineProperty(obj, "_showErrors", {
			value: opts.errors,
			enumerable: false
		});
	}

	_buildAssets(obj, compilation, requestShortener, sortByField) {
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
				if (obj._showPerformance) entry.isOverSizeLimit = asset.isOverSizeLimit;
				assetsByFile[name] = entry;
				return entry;
			})
			.filter(a => obj._showCachedAssets || a.emitted);

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
		obj.assets.sort(sortByField(obj.assetsSort));
	}

	_buildEntrypoints(obj, compilation, requestShortener) {
		obj.entrypoints = {};
		Object.keys(compilation.entrypoints).forEach(name => {
			const ep = compilation.entrypoints[name];
			const entry = {
				chunks: ep.chunks.map(c => c.id),
				assets: ep.chunks.reduce((a, c) => a.concat(c.files || []), [])
			};
			if (obj._showPerformance) entry.isOverSizeLimit = ep.isOverSizeLimit;
			obj.entrypoints[name] = entry;
		});
	}

	_buildChunks(obj, compilation, requestShortener, moduleFilter, sortByField) {
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
			if (obj._showChunkModules) {
				base.modules = chunk.modules
					.slice()
					.sort(sortByField("depth"))
					.filter(moduleFilter)
					.map(m => this._moduleToJson(m, requestShortener));
				base.filteredModules = chunk.modules.length - base.modules.length;
				base.modules.sort(sortByField(obj.modulesSort));
			}
			if (obj._showChunkOrigins) {
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
		obj.chunks.sort(sortByField(obj.chunksSort));
	}

	_buildModules(obj, compilation, requestShortener, moduleFilter, sortByField) {
		obj.modules = compilation.modules
			.slice()
			.sort(sortByField("depth"))
			.filter(moduleFilter)
			.map(m => this._moduleToJson(m, requestShortener));
		obj.filteredModules = compilation.modules.length - obj.modules.length;
		obj.modules.sort(sortByField(obj.modulesSort));
	}

	_buildChildren(obj, compilation, opts, forToString) {
		obj.children = compilation.children.map((child, idx) => {
			const childOpts = Stats.getChildOptions(opts, idx);
			const childStats = new Stats(child).toJson(childOpts, forToString);
			delete childStats.hash;
			delete childStats.version;
			childStats.name = child.name;
			return childStats;
		});
	}

	_moduleToJson(module, requestShortener) {
		const json = {
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
		// reasons, usedExports, providedExports, depth, source are added later by callers
		return json;
	}
}

/* ---------- Helper class for string rendering ---------- */

class StatsStringBuilder {
	constructor(obj, useColors) {
		this.obj = obj;
		this.useColors = useColors;
		this.buf = [];
		this.colors = this._initColors(useColors);
	}

	build() {
		this._renderHeader();
		if (this.obj.assets && this.obj.assets.length) this._renderAssetsTable();
		if (this.obj.entrypoints) this._renderEntrypoints();
		this._collectModulesByIdentifier();
		if (this.obj.chunks) this._renderChunks();
		if (this.obj.modules) this._renderModules(this.obj.modules, this.obj.filteredModules);
		if (this.obj._showWarnings && this.obj.warnings) this._renderWarnings();
		if (this.obj._showErrors && this.obj.errors) this._renderErrors();
		if (this.obj.children) this._renderChildren();
		if (this.obj.needAdditionalPass) this._renderAdditionalPassNotice();
		while (this.buf[this.buf.length - 1] === "\n") this.buf.pop();
		return this.buf.join("");
	}

	_initColors(useColors) {
		const defaultColors = {
			bold: "\u001b[1m",
			yellow: "\u001b[1m\u001b[33m",
			red: "\u001b[1m\u001b[31m",
			green: "\u001b[1m\u001b[32m",
			cyan: "\u001b[1m\u001b[36m",
			magenta: "\u001b[1m\u001b[35m"
		};
		return Object.keys(defaultColors).reduce((obj, name) => {
			obj[name] = str => {
				if (useColors) {
					this.buf.push(
						useColors === true || useColors[name] === undefined
							? defaultColors[name]
							: useColors[name]
					);
				}
				this.buf.push(str);
				if (useColors) this.buf.push("\u001b[39m\u001b[22m");
			};
			return obj;
		}, { normal: s => this.buf.push(s) });
	}

	_newline() {
		this.buf.push("\n");
	}

	_renderHeader() {
		if (this.obj.hash) {
			this.colors.normal("Hash: ");
			this.colors.bold(this.obj.hash);
			this._newline();
		}
		if (this.obj.version) {
			this.colors.normal("Version: webpack ");
			this.colors.bold(this.obj.version);
			this._newline();
		}
		if (typeof this.obj.time === "number") {
			this.colors.normal("Time: ");
			this.colors.bold(this.obj.time);
			this.colors.normal("ms");
			this._newline();
		}
		if (this.obj.publicPath) {
			this.colors.normal("PublicPath: ");
			this.colors.bold(this.obj.publicPath);
			this._newline();
		}
	}

	_renderAssetsTable() {
		const rows = [
			[
				{ value: "Asset", color: this.colors.bold },
				{ value: "Size", color: this.colors.bold },
				{ value: "Chunks", color: this.colors.bold },
				{ value: "", color: this.colors.bold },
				{ value: "", color: this.colors.bold },
				{ value: "Chunk Names", color: this.colors.bold }
			]
		];
		this.obj.assets.forEach(asset => {
			const assetColor = asset.isOverSizeLimit
				? this.colors.yellow
				: this.colors.green;
			rows.push([
				{ value: asset.name, color: assetColor },
				{
					value: SizeFormatHelpers.formatSize(asset.size),
					color: asset.isOverSizeLimit ? this.colors.yellow : this.colors.normal
				},
				{ value: asset.chunks.join(", "), color: this.colors.bold },
				{ value: asset.emitted ? "[emitted]" : "", color: this.colors.green },
				{
					value: asset.isOverSizeLimit ? "[big]" : "",
					color: asset.isOverSizeLimit ? this.colors.yellow : this.colors.normal
				},
				{ value: asset.chunkNames.join(", "), color: this.colors.normal }
			]);
		});
		this._table(rows, "rrrlll");
	}

	_renderEntrypoints() {
		Object.keys(this.obj.entrypoints).forEach(name => {
			const ep = this.obj.entrypoints[name];
			this.colors.normal("Entrypoint ");
			this.colors.bold(name);
			if (ep.isOverSizeLimit) {
				this.colors.normal(" ");
				this.colors.yellow("[big]");
			}
			this.colors.normal(" =");
			ep.assets.forEach(a => {
				this.colors.normal(" ");
				this.colors.green(a);
			});
			this._newline();
		});
	}

	_collectModulesByIdentifier() {
		this.modulesById = {};
		if (this.obj.modules) {
			this.obj.modules.forEach(m => {
				this.modulesById[`$${m.identifier}`] = m;
			});
		} else if (this.obj.chunks) {
			this.obj.chunks.forEach(chunk => {
				if (chunk.modules) {
					chunk.modules.forEach(m => {
						this.modulesById[`$${m.identifier}`] = m;
					});
				}
			});
		}
	}

	_renderChunks() {
		this.obj.chunks.forEach(chunk => {
			this.colors.normal("chunk ");
			if (chunk.id < 1000) this.colors.normal(" ");
			if (chunk.id < 100) this.colors.normal(" ");
			if (chunk.id < 10) this.colors.normal(" ");
			this.colors.normal("{");
			this.colors.yellow(chunk.id);
			this.colors.normal("} ");
			this.colors.green(chunk.files.join(", "));
			if (chunk.names && chunk.names.length) {
				this.colors.normal(" (");
				this.colors.normal(chunk.names.join(", "));
				this.colors.normal(")");
			}
			this.colors.normal(" ");
			this.colors.normal(SizeFormatHelpers.formatSize(chunk.size));
			chunk.parents.forEach(id => {
				this.colors.normal(" {");
				this.colors.yellow(id);
				this.colors.normal("}");
			});
			if (chunk.entry) this.colors.yellow(" [entry]");
			else if (chunk.initial) this.colors.yellow(" [initial]");
			if (chunk.rendered) this.colors.green(" [rendered]");
			if (chunk.recorded) this.colors.green(" [recorded]");
			this._newline();

			if (chunk.origins) this._renderChunkOrigins(chunk);
			if (chunk.modules) this._renderChunkModules(chunk);
		});
	}

	_renderChunkOrigins(chunk) {
		chunk.origins.forEach(origin => {
			this.colors.normal("    > ");
			if (origin.reasons && origin.reasons.length) {
				this.colors.yellow(origin.reasons.join(" "));
				this.colors.normal(" ");
			}
			if (origin.name) {
				this.colors.normal(origin.name);
				this.colors.normal(" ");
			}
			if (origin.module) {
				this.colors.normal("[");
				this.colors.normal(origin.moduleId);
				this.colors.normal("] ");
				const mod = this.modulesById[`$${origin.module}`];
				if (mod) {
					this.colors.bold(mod.name);
					this.colors.normal(" ");
				}
				if (origin.loc) this.colors.normal(origin.loc);
			}
			this._newline();
		});
	}

	_renderChunkModules(chunk) {
		chunk.modules.forEach(module => {
			this.colors.normal(" ");
			if (module.id < 1000) this.colors.normal(" ");
			if (module.id < 100) this.colors.normal(" ");
			if (module.id < 10) this.colors.normal(" ");
			this.colors.normal("[");
			this.colors.normal(module.id);
			this.colors.normal("] ");
			this.colors.bold(module.name);
			this._processModuleAttributes(module);
			this._newline();
			this._processModuleContent(module, "        ");
		});
		if (chunk.filteredModules > 0) {
			this.colors.normal(`     + ${chunk.filteredModules} hidden modules`);
			this._newline();
		}
	}

	_renderModules(modules, filteredCount) {
		modules.forEach(module => {
			if (module.id < 1000) this.colors.normal(" ");
			if (module.id < 100) this.colors.normal(" ");
			if (module.id < 10) this.colors.normal(" ");
			this.colors.normal("[");
			this.colors.normal(module.id);
			this.colors.normal("] ");
			this.colors.bold(module.name || module.identifier);
			this._processModuleAttributes(module);
			this._newline();
			this._processModuleContent(module, "       ");
		});
		if (filteredCount > 0) {
			this.colors.normal(`    + ${filteredCount} hidden modules`);
			this._newline();
		}
	}

	_processModuleAttributes(module) {
		this.colors.normal(" ");
		this.colors.normal(SizeFormatHelpers.formatSize(module.size));
		if (module.chunks) {
			module.chunks.forEach(c => {
				this.colors.normal(" {");
				this.colors.yellow(c);
				this.colors.normal("}");
			});
		}
		if (typeof module.depth === "number")
			this.colors.normal(` [depth ${module.depth}]`);
		if (!module.cacheable) this.colors.red(" [not cacheable]");
		if (module.optional) this.colors.yellow(" [optional]");
		if (module.built) this.colors.green(" [built]");
		if (module.prefetched) this.colors.magenta(" [prefetched]");
		if (module.failed) this.colors.red(" [failed]");
		if (module.warnings)
			this.colors.yellow(
				` [${module.warnings} warning${module.warnings === 1 ? "" : "s"}]`
			);
		if (module.errors)
			this.colors.red(
				` [${module.errors} error${module.errors === 1 ? "" : "s"}]`
			);
	}

	_processModuleContent(module, prefix) {
		if (Array.isArray(module.providedExports)) {
			this.colors.normal(prefix);
			this.colors.cyan(`[exports: ${module.providedExports.join(", ")}]`);
			this._newline();
		}
		if (module.usedExports !== undefined) {
			if (module.usedExports !== true) {
				this.colors.normal(prefix);
				if (module.usedExports === false)
					this.colors.cyan("[no exports used]");
				else
					this.colors.cyan(
						`[only some exports used: ${module.usedExports.join(", ")}]`
					);
				this._newline();
			}
		}
		if (module.reasons) {
			module.reasons.forEach(reason => {
				this.colors.normal(prefix);
				this.colors.normal(reason.type);
				this.colors.normal(" ");
				this.colors.cyan(reason.userRequest);
				this.colors.normal(" [");
				this.colors.normal(reason.moduleId);
				this.colors.normal("] ");
				this.colors.magenta(reason.module);
				if (reason.loc) {
					this.colors.normal(" ");
					this.colors.normal(reason.loc);
				}
				this._newline();
			});
		}
		if (module.profile) {
			this.colors.normal(prefix);
			let sum = 0;
			const path = [];
			let cur = module;
			while (cur.issuer) {
				cur = cur.issuer;
				path.unshift(cur);
			}
			path.forEach(m => {
				this.colors.normal("[");
				this.colors.normal(m.id);
				this.colors.normal("] ");
				if (m.profile) {
					const t = (m.profile.factory || 0) + (m.profile.building || 0);
					this._coloredTime(t);
					sum += t;
					this.colors.normal(" ");
				}
				this.colors.normal("->");
			});
			Object.keys(module.profile).forEach(key => {
				this.colors.normal(` ${key}:`);
				const t = module.profile[key];
				this._coloredTime(t);
				sum += t;
			});
			this.colors.normal(" = ");
			this._coloredTime(sum);
			this._newline();
		}
	}

	_coloredTime(time) {
		const thresholds = this.obj.time
			? [this.obj.time / 2, this.obj.time / 4, this.obj.time / 8, this.obj.time / 16]
			: [800, 400, 200, 100];
		if (time < thresholds[3]) this.colors.normal(`${time}ms`);
		else if (time < thresholds[2]) this.colors.bold(`${time}ms`);
		else if (time < thresholds[1]) this.colors.green(`${time}ms`);
		else if (time < thresholds[0]) this.colors.yellow(`${time}ms`);
		else this.colors.red(`${time}ms`);
	}

	_renderWarnings() {
		this.obj.warnings.forEach(w => {
			this._newline();
			this.colors.yellow(`WARNING in ${w}`);
			this._newline();
		});
	}

	_renderErrors() {
		this.obj.errors.forEach(e => {
			this._newline();
			this.colors.red(`ERROR in ${e}`);
			this._newline();
		});
	}

	_renderChildren() {
		this.obj.children.forEach(child => {
			const childStr = Stats.jsonToString(child, this.useColors);
			if (!childStr) return;
			if (child.name) {
				this.colors.normal("Child ");
				this.colors.bold(child.name);
				this.colors.normal(":");
			} else {
				this.colors.normal("Child");
			}
			this._newline();
			this.buf.push("    ");
			this.buf.push(childStr.replace(/\n/g, "\n    "));
			this._newline();
		});
	}

	_renderAdditionalPassNotice() {
		this.colors.yellow(
			"Compilation needs an additional pass and will compile again."
		);
	}

	_table(array, align, splitter) {
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
					this.colors.normal(" ");
					len++;
				}
				if (align[c] === "r") fmt(val);
				if (c + 1 < cols && colSizes[c] !== 0) this.colors.normal(splitter || "  ");
			}
			this._newline();
		}
	}
}

module.exports = Stats;