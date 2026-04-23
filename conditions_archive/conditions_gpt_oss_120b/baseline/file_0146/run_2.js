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

	/* --------------------------------------------------------------------- */
	/* Static helpers                                                       */
	/* --------------------------------------------------------------------- */

	static filterWarnings(warnings, warningsFilter) {
		if (!warningsFilter) return warnings;

		const normalized = [].concat(warningsFilter).map(filter => {
			if (typeof filter === "string") return w => w.includes(filter);
			if (filter instanceof RegExp) return w => filter.test(w);
			if (typeof filter === "function") return filter;
			throw new Error(`Can only filter warnings with Strings or RegExps. (Given: ${filter})`);
		});

		return warnings.filter(w => !normalized.some(fn => fn(w)));
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
			(acc, name) => {
				acc[name] = str => {
					if (useColors) {
						buf.push(
							useColors === true || useColors[name] === undefined
								? defaultColors[name]
								: useColors[name]
						);
					}
					buf.push(str);
					if (useColors) buf.push("\u001b[39m\u001b[22m");
				};
				return acc;
			},
			{ normal: s => buf.push(s) }
		);

		const coloredTime = time => {
			const base = obj.time ? obj.time / 2 : 800;
			const thresholds = [base, base / 2, base / 4, base / 8];
			if (time < thresholds[3]) colors.normal(`${time}ms`);
			else if (time < thresholds[2]) colors.bold(`${time}ms`);
			else if (time < thresholds[1]) colors.green(`${time}ms`);
			else if (time < thresholds[0]) colors.yellow(`${time}ms`);
			else colors.red(`${time}ms`);
		};

		const newline = () => buf.push("\n");
		const getText = (arr, r, c) => `${arr[r][c].value}`;
		const table = (array, align, splitter) => {
			const rows = array.length;
			const cols = array[0].length;
			const colSizes = new Array(cols).fill(0);

			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					const len = getText(array, r, c).length;
					if (len > colSizes[c]) colSizes[c] = len;
				}
			}

			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					const fmt = array[r][c].color;
					const val = getText(array, r, c);
					const pad = colSizes[c] - val.length;
					if (align[c] === "l") fmt(val);
					for (let i = 0; i < pad && c !== cols - 1; i++) colors.normal(" ");
					if (align[c] === "r") fmt(val);
					if (c + 1 < cols && colSizes[c] !== 0) colors.normal(splitter || "  ");
				}
				newline();
			}
		};

		const getAssetColor = (asset, def) => (asset.isOverSizeLimit ? colors.yellow : def);

		/* ----------------------------------------------------------------- */
		/* Header                                                            */
		/* ----------------------------------------------------------------- */

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

		/* ----------------------------------------------------------------- */
		/* Assets                                                            */
		/* ----------------------------------------------------------------- */

		if (obj.assets && obj.assets.length) {
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
					{ value: SizeFormatHelpers.formatSize(asset.size), color: getAssetColor(asset, colors.normal) },
					{ value: asset.chunks.join(", "), color: colors.bold },
					{ value: asset.emitted ? "[emitted]" : "", color: colors.green },
					{ value: asset.isOverSizeLimit ? "[big]" : "", color: getAssetColor(asset, colors.normal) },
					{ value: asset.chunkNames.join(", "), color: colors.normal }
				]);
			});
			table(t, "rrrlll");
		}

		/* ----------------------------------------------------------------- */
		/* Entrypoints                                                       */
		/* ----------------------------------------------------------------- */

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

		/* ----------------------------------------------------------------- */
		/* Modules & Chunks                                                   */
		/* ----------------------------------------------------------------- */

		const modulesById = {};
		const collectModules = collection => {
			(collection || []).forEach(m => {
				modulesById[`$${m.identifier}`] = m;
			});
		};

		if (obj.modules) collectModules(obj.modules);
		else if (obj.chunks) obj.chunks.forEach(c => collectModules(c.modules));

		const processModuleAttributes = module => {
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
		};

		const processModuleContent = (module, prefix) => {
			if (Array.isArray(module.providedExports)) {
				colors.normal(prefix);
				colors.cyan(`[exports: ${module.providedExports.join(", ")}]`);
				newline();
			}
			if (module.usedExports !== undefined && module.usedExports !== true) {
				colors.normal(prefix);
				colors.cyan(module.usedExports === false ? "[no exports used]" : `[only some exports used: ${module.usedExports.join(", ")}]`);
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
				colors.normal("[");
				colors.normal(m.id);
				colors.normal("] ");
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

		/* ----------------------------------------------------------------- */
		/* Warnings & Errors                                                  */
		/* ----------------------------------------------------------------- */

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

		/* ----------------------------------------------------------------- */
		/* Children                                                           */
		/* ----------------------------------------------------------------- */

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

		if (obj.needAdditionalPass) {
			colors.yellow("Compilation needs an additional pass and will compile again.");
		}

		while (buf[buf.length - 1] === "\n") buf.pop();
		return buf.join("");
	}

	static presetToOptions(name) {
		const pn = (typeof name === "string" && name.toLowerCase()) || name;
		if (!pn || pn === "none") {
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
		} else if (options.children && typeof options.children === "object") {
			inner = options.children;
		}
		if (typeof inner === "boolean" || typeof inner === "string") inner = Stats.presetToOptions(inner);
		if (!inner) return options;
		const child = Object.assign({}, options);
		delete child.children;
		return Object.assign(child, inner);
	}

	/* --------------------------------------------------------------------- */
	/* Instance helpers                                                     */
	/* --------------------------------------------------------------------- */

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

	/* --------------------------------------------------------------------- */
	/* Core conversion                                                       */
	/* --------------------------------------------------------------------- */

	toJson(options, forToString) {
		const opts = this._prepareOptions(options, forToString);
		const requestShortener = new RequestShortener(opts.context);
		const filterModule = this._createModuleFilter(requestShortener, opts);
		const sortByField = this._createSortByField();

		const obj = {
			errors: this.compilation.errors.map(e => this._formatError(e, requestShortener, opts)),
			warnings: Stats.filterWarnings(
				this.compilation.warnings.map(w => this._formatError(w, requestShortener, opts)),
				opts.warningsFilter
			)
		};

		Object.defineProperty(obj, "_showWarnings", { value: opts.warnings, enumerable: false });
		Object.defineProperty(obj, "_showErrors", { value: opts.errors, enumerable: false });

		if (opts.version) obj.version = require("../package.json").version;
		if (opts.hash) obj.hash = this.hash;
		if (opts.timings && this.startTime && this.endTime) obj.time = this.endTime - this.startTime;
		if (this.compilation.needAdditionalPass) obj.needAdditionalPass = true;
		if (opts.publicPath)
			obj.publicPath = this.compilation.mainTemplate.getPublicPath({ hash: this.compilation.hash });

		if (opts.assets) this._processAssets(obj, requestShortener, sortByField, opts);
		if (opts.entrypoints) this._processEntrypoints(obj, opts);
		if (opts.chunks) this._processChunks(obj, requestShortener, sortByField, filterModule, opts);
		if (opts.modules) this._processModules(obj, requestShortener, sortByField, filterModule, opts);
		if (opts.children) this._processChildren(obj, opts, forToString);

		return obj;
	}

	toString(options) {
		if (typeof options === "boolean" || typeof options === "string") options = Stats.presetToOptions(options);
		else if (!options) options = {};

		const useColors = optionOrFallback(options.colors, false);
		const obj = this.toJson(options, true);
		return Stats.jsonToString(obj, useColors);
	}

	/* --------------------------------------------------------------------- */
	/* Private helpers                                                       */
	/* --------------------------------------------------------------------- */

	_prepareOptions(options, forToString) {
		if (typeof options === "boolean" || typeof options === "string") options = Stats.presetToOptions(options);
		else if (!options) options = {};

		const cwd = process.cwd();
		return {
			context: optionOrFallback(options.context, cwd),
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
			exclude: [].concat(optionOrFallback(options.exclude, [])).map(str => {
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
	}

	_createModuleFilter(requestShortener, opts) {
		let count = 0;
		return module => {
			if (!opts.cached && !module.built) return false;
			if (opts.exclude.length) {
				const ident = requestShortener.shorten(module.resource);
				if (opts.exclude.some(r => r.test(ident))) return false;
			}
			return count++ < opts.maxModules;
		};
	}

	_createSortByField() {
		return field => (a, b) => {
			if (!field) return 0;
			const key = this.normalizeFieldKey(field);
			const regular = this.sortOrderRegular(field);
			const left = regular ? a : b;
			const right = regular ? b : a;
			if (left[key] === null && right[key] === null) return 0;
			if (left[key] === null) return 1;
			if (right[key] === null) return -1;
			if (left[key] === right[key]) return 0;
			return left[key] < right[key] ? -1 : 1;
		};
	}

	_formatError(e, requestShortener, opts) {
		let err = typeof e === "string" ? { message: e } : e;
		let text = "";
		if (err.chunk) {
			text += `chunk ${err.chunk.name || err.chunk.id}${err.chunk.hasRuntime() ? " [entry]" : err.chunk.isInitial() ? " [initial]" : ""}\n`;
		}
		if (err.file) text += `${err.file}\n`;
		if (err.module && typeof err.module.readableIdentifier === "function")
			text += `${err.module.readableIdentifier(requestShortener)}\n`;
		text += err.message;
		if (opts.errorDetails && err.details) text += `\n${err.details}`;
		if (opts.errorDetails && err.missing) text += err.missing.map(i => `\n[${i}]`).join("");
		if (opts.moduleTrace && err.dependencies && err.origin) {
			text += `\n @ ${err.origin.readableIdentifier(requestShortener)}`;
			err.dependencies.forEach(dep => {
				if (!dep.loc || typeof dep.loc === "string") return;
				const locInfo = formatLocation(dep.loc);
				if (locInfo) text += ` ${locInfo}`;
			});
			let cur = err.origin;
			while (cur.issuer) {
				cur = cur.issuer;
				text += `\n @ ${cur.readableIdentifier(requestShortener)}`;
			}
		}
		return text;
	}

	_processAssets(obj, requestShortener, sortByField, opts) {
		const assetsByFile = {};
		obj.assetsByChunkName = {};
		obj.assets = Object.keys(this.compilation.assets)
			.map(name => {
				const asset = this.compilation.assets[name];
				const a = {
					name,
					size: asset.size(),
					chunks: [],
					chunkNames: [],
					emitted: asset.emitted
				};
				if (opts.performance) a.isOverSizeLimit = asset.isOverSizeLimit;
				assetsByFile[name] = a;
				return a;
			})
			.filter(a => opts.cachedAssets || a.emitted);

		this.compilation.chunks.forEach(chunk => {
			chunk.files.forEach(file => {
				const a = assetsByFile[file];
				if (!a) return;
				chunk.ids.forEach(id => a.chunks.push(id));
				if (chunk.name) {
					a.chunkNames.push(chunk.name);
					if (obj.assetsByChunkName[chunk.name])
						obj.assetsByChunkName[chunk.name] = [].concat(obj.assetsByChunkName[chunk.name], file);
					else obj.assetsByChunkName[chunk.name] = file;
				}
			});
		});

		obj.assets.sort(sortByField(opts.assetsSort));
	}

	_processEntrypoints(obj, opts) {
		obj.entrypoints = {};
		Object.keys(this.compilation.entrypoints).forEach(name => {
			const ep = this.compilation.entrypoints[name];
			const entry = {
				chunks: ep.chunks.map(c => c.id),
				assets: ep.chunks.reduce((a, c) => a.concat(c.files || []), [])
			};
			if (opts.performance) entry.isOverSizeLimit = ep.isOverSizeLimit;
			obj.entrypoints[name] = entry;
		});
	}

	_processChunks(obj, requestShortener, sortByField, filterModule, opts) {
		obj.chunks = this.compilation.chunks.map(chunk => {
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

			if (opts.chunkModules) {
				ch.modules = chunk.modules
					.slice()
					.sort(sortByField("depth"))
					.filter(filterModule)
					.map(m => this._moduleToJson(m, requestShortener, opts));
				ch.filteredModules = chunk.modules.length - ch.modules.length;
				ch.modules.sort(sortByField(opts.modulesSort));
			}
			if (opts.chunkOrigins) {
				ch.origins = chunk.origins.map(origin => ({
					moduleId: origin.module ? origin.module.id : undefined,
					module: origin.module ? origin.module.identifier() : "",
					moduleIdentifier: origin.module ? origin.module.identifier() : "",
					moduleName: origin.module ? origin.module.readableIdentifier(requestShortener) : "",
					loc: formatLocation(origin.loc),
					name: origin.name,
					reasons: origin.reasons || []
				}));
			}
			return ch;
		});
		obj.chunks.sort(sortByField(opts.chunksSort));
	}

	_processModules(obj, requestShortener, sortByField, filterModule, opts) {
		obj.modules = this.compilation.modules
			.slice()
			.sort(sortByField("depth"))
			.filter(filterModule)
			.map(m => this._moduleToJson(m, requestShortener, opts));
		obj.filteredModules = this.compilation.modules.length - obj.modules.length;
		obj.modules.sort(sortByField(opts.modulesSort));
	}

	_processChildren(obj, opts, forToString) {
		obj.children = this.compilation.children.map((child, idx) => {
			const childOpts = Stats.getChildOptions(opts, idx);
			const childStats = new Stats(child).toJson(childOpts, forToString);
			delete childStats.hash;
			delete childStats.version;
			childStats.name = child.name;
			return childStats;
		});
	}

	_moduleToJson(module, requestShortener, opts) {
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
			issuerName: module.issuer && module.issuer.readableIdentifier(requestShortener),
			profile: module.profile,
			failed: !!module.error,
			errors: module.errors && module.dependenciesErrors && (module.errors.length + module.dependenciesErrors.length),
			warnings: module.errors && module.dependenciesErrors && (module.warnings.length + module.dependenciesWarnings.length)
		};

		if (opts.reasons) {
			json.reasons = module.reasons
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
		if (opts.usedExports) json.usedExports = module.used ? module.usedExports : false;
		if (opts.providedExports) json.providedExports = Array.isArray(module.providedExports) ? module.providedExports : null;
		if (opts.depth) json.depth = module.depth;
		if (opts.source && module._source) json.source = module._source.source();

		return json;
	}
}

module.exports = Stats;