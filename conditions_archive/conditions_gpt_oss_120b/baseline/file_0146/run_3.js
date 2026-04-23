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
		if (!warningsFilter) return warnings;
		const normalized = [].concat(warningsFilter).map(filter => {
			if (typeof filter === "string") return w => w.includes(filter);
			if (filter instanceof RegExp) return w => filter.test(w);
			if (typeof filter === "function") return filter;
			throw new Error(`Can only filter warnings with Strings or RegExps. (Given: ${filter})`);
		});
		return warnings.filter(w => !normalized.some(c => c(w)));
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

	/*** option handling ***/
	_prepareOptions(options, forToString) {
		if (typeof options === "boolean" || typeof options === "string")
			options = Stats.presetToOptions(options);
		else if (!options) options = {};

		const opt = options;
		const get = (key, fallback) => optionOrFallback(opt[key], fallback);
		const requestShortener = new RequestShortener(get("context", process.cwd()));

		return {
			requestShortener,
			showPerformance: get("performance", true),
			showHash: get("hash", true),
			showVersion: get("version", true),
			showTimings: get("timings", true),
			showAssets: get("assets", true),
			showEntrypoints: get("entrypoints", !forToString),
			showChunks: get("chunks", true),
			showChunkModules: get("chunkModules", !!forToString),
			showChunkOrigins: get("chunkOrigins", !forToString),
			showModules: get("modules", !forToString),
			showDepth: get("depth", !forToString),
			showCachedModules: get("cached", true),
			showCachedAssets: get("cachedAssets", true),
			showReasons: get("reasons", !forToString),
			showUsedExports: get("usedExports", !forToString),
			showProvidedExports: get("providedExports", !forToString),
			showChildren: get("children", true),
			showSource: get("source", !forToString),
			showModuleTrace: get("moduleTrace", true),
			showErrors: get("errors", true),
			showErrorDetails: get("errorDetails", !forToString),
			showWarnings: get("warnings", true),
			warningsFilter: get("warningsFilter", null),
			showPublicPath: get("publicPath", !forToString),
			excludeModules: [].concat(get("exclude", [])).map(str => {
				if (typeof str !== "string") return str;
				return new RegExp(
					`[\\\\/]${str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&")}([\\\\/]|$|!|\\?)`
				);
			}),
			maxModules: get("maxModules", forToString ? 15 : Infinity),
			sortModules: get("modulesSort", "id"),
			sortChunks: get("chunksSort", "id"),
			sortAssets: get("assetsSort", "")
		};
	}

	/*** sorting helpers ***/
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
		return (a, b) =>
			this._sortByFieldAndOrder(key, regular ? a : b, regular ? b : a);
	}

	/*** module filter ***/
	_createModuleFilter(opts) {
		let i = 0;
		return module => {
			if (!opts.showCachedModules && !module.built) return false;
			if (opts.excludeModules.length) {
				const ident = opts.requestShortener.shorten(module.resource);
				if (opts.excludeModules.some(r => r.test(ident))) return false;
			}
			return i++ < opts.maxModules;
		};
	}

	/*** module serialization ***/
	_serializeModule(module, opts) {
		const rs = opts.requestShortener;
		const obj = {
			id: module.id,
			identifier: module.identifier(),
			name: module.readableIdentifier(rs),
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
			issuerName: module.issuer && module.issuer.readableIdentifier(rs),
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

		if (opts.showReasons) {
			obj.reasons = module.reasons
				.filter(r => r.dependency && r.module)
				.map(r => {
					const o = {
						moduleId: r.module.id,
						moduleIdentifier: r.module.identifier(),
						module: r.module.readableIdentifier(rs),
						moduleName: r.module.readableIdentifier(rs),
						type: r.dependency.type,
						userRequest: r.dependency.userRequest
					};
					const loc = formatLocation(r.dependency.loc);
					if (loc) o.loc = loc;
					return o;
				})
				.sort((a, b) => a.moduleId - b.moduleId);
		}
		if (opts.showUsedExports) obj.usedExports = module.used ? module.usedExports : false;
		if (opts.showProvidedExports)
			obj.providedExports = Array.isArray(module.providedExports)
				? module.providedExports
				: null;
		if (opts.showDepth) obj.depth = module.depth;
		if (opts.showSource && module._source) obj.source = module._source.source();

		return obj;
	}

	/*** assets processing ***/
	_processAssets(obj, opts) {
		const { compilation } = this;
		const assetsByFile = {};

		obj.assets = Object.keys(compilation.assets)
			.map(name => {
				const asset = compilation.assets[name];
				const a = {
					name,
					size: asset.size(),
					chunks: [],
					chunkNames: [],
					emitted: asset.emitted
				};
				if (opts.showPerformance) a.isOverSizeLimit = asset.isOverSizeLimit;
				assetsByFile[name] = a;
				return a;
			})
			.filter(a => opts.showCachedAssets || a.emitted);

		compilation.chunks.forEach(chunk => {
			chunk.files.forEach(file => {
				const a = assetsByFile[file];
				if (!a) return;
				chunk.ids.forEach(id => a.chunks.push(id));
				if (chunk.name) {
					a.chunkNames.push(chunk.name);
					if (obj.assetsByChunkName[chunk.name])
						obj.assetsByChunkName[chunk.name] = [].concat(
							obj.assetsByChunkName[chunk.name],
							[file]
						);
					else obj.assetsByChunkName[chunk.name] = file;
				}
			});
		});

		obj.assets.sort(this._sortByField(opts.sortAssets));
	}

	/*** entrypoints processing ***/
	_processEntrypoints(obj, opts) {
		const { compilation } = this;
		obj.entrypoints = {};
		Object.keys(compilation.entrypoints).forEach(name => {
			const ep = compilation.entrypoints[name];
			const e = {
				chunks: ep.chunks.map(c => c.id),
				assets: ep.chunks.reduce((a, c) => a.concat(c.files || []), [])
			};
			if (opts.showPerformance) e.isOverSizeLimit = ep.isOverSizeLimit;
			obj.entrypoints[name] = e;
		});
	}

	/*** chunks processing ***/
	_processChunks(obj, opts) {
		const { compilation } = this;
		const filter = this._createModuleFilter(opts);
		const serialize = m => this._serializeModule(m, opts);
		const sortBy = f => this._sortByField(f);

		obj.chunks = compilation.chunks.map(chunk => {
			const c = {
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
				parents: chunk.parents.map(p => p.id)
			};

			if (opts.showChunkModules) {
				c.modules = chunk.modules
					.slice()
					.sort(sortBy("depth"))
					.filter(filter)
					.map(serialize);
				c.filteredModules = chunk.modules.length - c.modules.length;
				c.modules.sort(sortBy(opts.sortModules));
			}
			if (opts.showChunkOrigins) {
				c.origins = chunk.origins.map(o => ({
					moduleId: o.module ? o.module.id : undefined,
					module: o.module ? o.module.identifier() : "",
					moduleIdentifier: o.module ? o.module.identifier() : "",
					moduleName: o.module ? o.module.readableIdentifier(opts.requestShortener) : "",
					loc: formatLocation(o.loc),
					name: o.name,
					reasons: o.reasons || []
				}));
			}
			return c;
		});
		obj.chunks.sort(this._sortByField(opts.sortChunks));
	}

	/*** modules processing ***/
	_processModules(obj, opts) {
		const filter = this._createModuleFilter(opts);
		const serialize = m => this._serializeModule(m, opts);
		const sortBy = f => this._sortByField(f);

		obj.modules = this.compilation.modules
			.slice()
			.sort(sortBy("depth"))
			.filter(filter)
			.map(serialize);
		obj.filteredModules = this.compilation.modules.length - obj.modules.length;
		obj.modules.sort(sortBy(opts.sortModules));
	}

	/*** children processing ***/
	_processChildren(obj, opts) {
		const { compilation } = this;
		obj.children = compilation.children.map((child, idx) => {
			const childOpts = Stats.getChildOptions(opts, idx);
			const childStats = new Stats(child).toJson(childOpts, true);
			delete childStats.hash;
			delete childStats.version;
			childStats.name = child.name;
			return childStats;
		});
	}

	/*** errors & warnings ***/
	_processErrorsAndWarnings(obj, opts) {
		const { compilation } = this;
		const formatError = e => {
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
				text += `${e.module.readableIdentifier(opts.requestShortener)}\n`;
			text += e.message;
			if (opts.showErrorDetails && e.details) text += `\n${e.details}`;
			if (opts.showErrorDetails && e.missing)
				text += e.missing.map(i => `\n[${i}]`).join("");
			if (opts.showModuleTrace && e.dependencies && e.origin) {
				text += `\n @ ${e.origin.readableIdentifier(opts.requestShortener)}`;
				e.dependencies.forEach(dep => {
					if (!dep.loc || typeof dep.loc === "string") return;
					const locInfo = formatLocation(dep.loc);
					if (locInfo) text += ` ${locInfo}`;
				});
				let cur = e.origin;
				while (cur.issuer) {
					cur = cur.issuer;
					text += `\n @ ${cur.readableIdentifier(opts.requestShortener)}`;
				}
			}
			return text;
		};

		obj.errors = this.compilation.errors.map(formatError);
		obj.warnings = Stats.filterWarnings(
			this.compilation.warnings.map(formatError),
			opts.warningsFilter
		);

		Object.defineProperty(obj, "_showWarnings", {
			value: opts.showWarnings,
			enumerable: false
		});
		Object.defineProperty(obj, "_showErrors", {
			value: opts.showErrors,
			enumerable: false
		});
	}

	toJson(options, forToString) {
		const opts = this._prepareOptions(options, forToString);
		const obj = {};

		this._processErrorsAndWarnings(obj, opts);

		if (opts.showVersion)
			obj.version = require("../package.json").version;
		if (opts.showHash) obj.hash = this.hash;
		if (opts.showTimings && this.startTime && this.endTime)
			obj.time = this.endTime - this.startTime;
		if (this.compilation.needAdditionalPass) obj.needAdditionalPass = true;
		if (opts.showPublicPath)
			obj.publicPath = this.compilation.mainTemplate.getPublicPath({
				hash: this.compilation.hash
			});

		if (opts.showAssets) {
			obj.assetsByChunkName = {};
			this._processAssets(obj, opts);
		}
		if (opts.showEntrypoints) this._processEntrypoints(obj, opts);
		if (opts.showChunks) this._processChunks(obj, opts);
		if (opts.showModules) this._processModules(obj, opts);
		if (opts.showChildren) this._processChildren(obj, opts);

		return obj;
	}

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
					buf.push(
						useColors === true || useColors[name] === undefined
							? defaultColors[name]
							: useColors[name]
					);
				}
				buf.push(str);
				if (useColors) buf.push("\u001b[39m\u001b[22m");
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
					let l = val.length;
					if (align[c] === "l") fmt(val);
					while (l < colSizes[c] && c !== cols - 1) {
						colors.normal(" ");
						l++;
					}
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
			obj.assets.forEach(a => {
				t.push([
					{ value: a.name, color: getAssetColor(a, colors.green) },
					{
						value: SizeFormatHelpers.formatSize(a.size),
						color: getAssetColor(a, colors.normal)
					},
					{ value: a.chunks.join(", "), color: colors.bold },
					{ value: a.emitted ? "[emitted]" : "", color: colors.green },
					{ value: a.isOverSizeLimit ? "[big]" : "", color: getAssetColor(a, colors.normal) },
					{ value: a.chunkNames.join(", "), color: colors.normal }
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
				ep.assets.forEach(a => {
					colors.normal(" ");
					colors.green(a);
				});
				newline();
			});
		}

		const modulesById = {};
		if (obj.modules) {
			obj.modules.forEach(m => (modulesById[`$${m.identifier}`] = m));
		} else if (obj.chunks) {
			obj.chunks.forEach(ch => {
				if (ch.modules) ch.modules.forEach(m => (modulesById[`$${m.identifier}`] = m));
			});
		}

		const processModuleAttributes = m => {
			colors.normal(" ");
			colors.normal(SizeFormatHelpers.formatSize(m.size));
			if (m.chunks) m.chunks.forEach(c => (colors.normal(" {"), colors.yellow(c), colors.normal("}")));
			if (typeof m.depth === "number") colors.normal(` [depth ${m.depth}]`);
			if (!m.cacheable) colors.red(" [not cacheable]");
			if (m.optional) colors.yellow(" [optional]");
			if (m.built) colors.green(" [built]");
			if (m.prefetched) colors.magenta(" [prefetched]");
			if (m.failed) colors.red(" [failed]");
			if (m.warnings) colors.yellow(` [${m.warnings} warning${m.warnings === 1 ? "" : "s"}]`);
			if (m.errors) colors.red(` [${m.errors} error${m.errors === 1 ? "" : "s"}]`);
		};

		const processModuleContent = (m, prefix) => {
			if (Array.isArray(m.providedExports)) {
				colors.normal(prefix);
				colors.cyan(`[exports: ${m.providedExports.join(", ")}]`);
				newline();
			}
			if (m.usedExports !== undefined && m.usedExports !== true) {
				colors.normal(prefix);
				colors.cyan(m.usedExports === false ? "[no exports used]" : `[only some exports used: ${m.usedExports.join(", ")}]`);
				newline();
			}
			if (m.reasons) {
				m.reasons.forEach(r => {
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
			if (m.profile) {
				colors.normal(prefix);
				let sum = 0;
				const path = [];
				let cur = m;
				while (cur.issuer) {
					cur = cur.issuer;
					path.unshift(cur);
				}
				path.forEach(p => {
					colors.normal("[");
					colors.normal(p.id);
					colors.normal("] ");
					if (p.profile) {
						const t = (p.profile.factory || 0) + (p.profile.building || 0);
						coloredTime(t);
						sum += t;
						colors.normal(" ");
					}
					colors.normal("->");
				});
				Object.keys(m.profile).forEach(k => {
					colors.normal(` ${k}:`);
					const t = m.profile[k];
					coloredTime(t);
					sum += t;
				});
				colors.normal(" = ");
				coloredTime(sum);
				newline();
			}
		};

		if (obj.chunks) {
			obj.chunks.forEach(ch => {
				colors.normal("chunk ");
				if (ch.id < 1000) colors.normal(" ");
				if (ch.id < 100) colors.normal(" ");
				if (ch.id < 10) colors.normal(" ");
				colors.normal("{");
				colors.yellow(ch.id);
				colors.normal("} ");
				colors.green(ch.files.join(", "));
				if (ch.names && ch.names.length) {
					colors.normal(" (");
					colors.normal(ch.names.join(", "));
					colors.normal(")");
				}
				colors.normal(" ");
				colors.normal(SizeFormatHelpers.formatSize(ch.size));
				ch.parents.forEach(p => (colors.normal(" {"), colors.yellow(p), colors.normal("}")));
				if (ch.entry) colors.yellow(" [entry]");
				else if (ch.initial) colors.yellow(" [initial]");
				if (ch.rendered) colors.green(" [rendered]");
				if (ch.recorded) colors.green(" [recorded]");
				newline();

				if (ch.origins) {
					ch.origins.forEach(o => {
						colors.normal("    > ");
						if (o.reasons && o.reasons.length) {
							colors.yellow(o.reasons.join(" "));
							colors.normal(" ");
						}
						if (o.name) {
							colors.normal(o.name);
							colors.normal(" ");
						}
						if (o.module) {
							colors.normal("[");
							colors.normal(o.moduleId);
							colors.normal("] ");
							const mod = modulesById[`$${o.module}`];
							if (mod) {
								colors.bold(mod.name);
								colors.normal(" ");
							}
							if (o.loc) colors.normal(o.loc);
						}
						newline();
					});
				}
				if (ch.modules) {
					ch.modules.forEach(m => {
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
					if (ch.filteredModules > 0) {
						colors.normal(`     + ${ch.filteredModules} hidden modules`);
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
		} else if (options.children && typeof options.children === "object") {
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
```