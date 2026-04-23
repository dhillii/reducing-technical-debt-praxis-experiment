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
		return warnings.filter(w => !normalized.some(fn => fn(w)));
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
	_formatError(e, requestShortener, showErrorDetails, showModuleTrace) {
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
		if (showErrorDetails && e.details) text += `\n${e.details}`;
		if (showErrorDetails && e.missing) text += e.missing.map(i => `\n[${i}]`).join("");
		if (showModuleTrace && e.dependencies && e.origin) {
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
	_sortByField(field) {
		if (!field) return () => 0;
		const key = this.normalizeFieldKey(field);
		const regular = this.sortOrderRegular(field);
		return (a, b) => {
			const av = a[key];
			const bv = b[key];
			if (av === null && bv === null) return 0;
			if (av === null) return 1;
			if (bv === null) return -1;
			if (av === bv) return 0;
			const res = av < bv ? -1 : 1;
			return regular ? res : -res;
		};
	}
	_buildAssets(compilation, requestShortener, opts) {
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
				if (opts.showPerformance) obj.isOverSizeLimit = asset.isOverSizeLimit;
				assetsByFile[name] = obj;
				return obj;
			})
			.filter(a => opts.showCachedAssets || a.emitted);
		compilation.chunks.forEach(chunk => {
			chunk.files.forEach(file => {
				const a = assetsByFile[file];
				if (!a) return;
				chunk.ids.forEach(id => a.chunks.push(id));
				if (chunk.name) {
					a.chunkNames.push(chunk.name);
					if (opts.assetsByChunkName[chunk.name])
						opts.assetsByChunkName[chunk.name] = [].concat(
							opts.assetsByChunkName[chunk.name],
							[file]
						);
					else opts.assetsByChunkName[chunk.name] = file;
				}
			});
		});
		assets.sort(this._sortByField(opts.sortAssets));
		return { assets, assetsByChunkName: opts.assetsByChunkName };
	}
	_buildEntryPoints(compilation, showPerformance) {
		const eps = {};
		Object.keys(compilation.entrypoints).forEach(name => {
			const ep = compilation.entrypoints[name];
			const obj = {
				chunks: ep.chunks.map(c => c.id),
				assets: ep.chunks.reduce((a, c) => a.concat(c.files || []), [])
			};
			if (showPerformance) obj.isOverSizeLimit = ep.isOverSizeLimit;
			eps[name] = obj;
		});
		return eps;
	}
	_buildChunks(compilation, requestShortener, opts, createModuleFilter, fnModule) {
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
			if (opts.showChunkModules) {
				obj.modules = chunk.modules
					.slice()
					.sort(this._sortByField("depth"))
					.filter(createModuleFilter())
					.map(fnModule);
				obj.filteredModules = chunk.modules.length - obj.modules.length;
				obj.modules.sort(this._sortByField(opts.sortModules));
			}
			if (opts.showChunkOrigins) {
				obj.origins = chunk.origins.map(origin => ({
					moduleId: origin.module ? origin.module.id : undefined,
					module: origin.module ? origin.module.identifier() : "",
					moduleIdentifier: origin.module ? origin.module.identifier() : "",
					moduleName: origin.module ? origin.module.readableIdentifier(requestShortener) : "",
					loc: formatLocation(origin.loc),
					name: origin.name,
					reasons: origin.reasons || []
				}));
			}
			return obj;
		});
		chunks.sort(this._sortByField(opts.sortChunks));
		return chunks;
	}
	_buildModules(compilation, requestShortener, opts, createModuleFilter, fnModule) {
		const modules = compilation.modules
			.slice()
			.sort(this._sortByField("depth"))
			.filter(createModuleFilter())
			.map(fnModule);
		const filtered = compilation.modules.length - modules.length;
		modules.sort(this._sortByField(opts.sortModules));
		return { modules, filtered };
	}
	toJson(options, forToString) {
		if (typeof options === "boolean" || typeof options === "string")
			options = Stats.presetToOptions(options);
		else if (!options) options = {};

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
				if (typeof str !== "string") return str;
				return new RegExp(
					`[\\\\/]${str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&")}([\\\\/]|$|!|\\?)`
				);
			}),
			maxModules: optionOrFallback(options.maxModules, forToString ? 15 : Infinity),
			sortModules: optionOrFallback(options.modulesSort, "id"),
			sortChunks: optionOrFallback(options.chunksSort, "id"),
			sortAssets: optionOrFallback(options.assetsSort, ""),
			assetsByChunkName: {}
		};

		const createModuleFilter = () => {
			let i = 0;
			return module => {
				if (!opts.showCachedModules && !module.built) return false;
				if (opts.excludeModules.length) {
					const ident = requestShortener.shorten(module.resource);
					if (opts.excludeModules.some(r => r.test(ident))) return false;
				}
				return i++ < opts.maxModules;
			};
		};

		const fnModule = module => {
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
					module.warnings && module.dependenciesWarnings
						? module.warnings.length + module.dependenciesWarnings.length
						: undefined
			};
			if (opts.showReasons) {
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
			if (opts.showUsedExports) base.usedExports = module.used ? module.usedExports : false;
			if (opts.showProvidedExports)
				base.providedExports = Array.isArray(module.providedExports)
					? module.providedExports
					: null;
			if (opts.showDepth) base.depth = module.depth;
			if (opts.showSource && module._source) base.source = module._source.source();
			return base;
		};

		const obj = {
			errors: compilation.errors.map(e =>
				this._formatError(e, requestShortener, opts.showErrorDetails, opts.showModuleTrace)
			),
			warnings: Stats.filterWarnings(
				compilation.warnings.map(w =>
					this._formatError(w, requestShortener, opts.showErrorDetails, opts.showModuleTrace)
				),
				opts.warningsFilter
			)
		};

		Object.defineProperty(obj, "_showWarnings", {
			value: opts.showWarnings,
			enumerable: false
		});
		Object.defineProperty(obj, "_showErrors", {
			value: opts.showErrors,
			enumerable: false
		});

		if (opts.showVersion) obj.version = require("../package.json").version;
		if (opts.showHash) obj.hash = this.hash;
		if (opts.showTimings && this.startTime && this.endTime) obj.time = this.endTime - this.startTime;
		if (compilation.needAdditionalPass) obj.needAdditionalPass = true;
		if (opts.showPublicPath)
			obj.publicPath = this.compilation.mainTemplate.getPublicPath({
				hash: this.compilation.hash
			});

		if (opts.showAssets) {
			const assetsRes = this._buildAssets(compilation, requestShortener, opts);
			obj.assets = assetsRes.assets;
			obj.assetsByChunkName = assetsRes.assetsByChunkName;
		}
		if (opts.showEntrypoints) obj.entrypoints = this._buildEntryPoints(compilation, opts.showPerformance);
		if (opts.showChunks)
			obj.chunks = this._buildChunks(
				compilation,
				requestShortener,
				opts,
				createModuleFilter,
				fnModule
			);
		if (opts.showModules) {
			const modRes = this._buildModules(
				compilation,
				requestShortener,
				opts,
				createModuleFilter,
				fnModule
			);
			obj.modules = modRes.modules;
			obj.filteredModules = modRes.filtered;
		}
		if (opts.showChildren) {
			obj.children = compilation.children.map((child, idx) => {
				const childOpts = Stats.getChildOptions(options, idx);
				const childObj = new Stats(child).toJson(childOpts, forToString);
				delete childObj.hash;
				delete childObj.version;
				childObj.name = child.name;
				return childObj;
			});
		}
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
		const getText = (arr, r, c) => arr[r][c].value;
		const table = (array, align, splitter) => {
			const rows = array.length;
			const cols = array[0].length;
			const colSizes = new Array(cols).fill(0);
			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					const len = `${getText(array, r, c)}`.length;
					if (len > colSizes[c]) colSizes[c] = len;
				}
			}
			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					const fmt = array[r][c].color;
					const val = `${getText(array, r, c)}`;
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
				ep.assets.forEach(a => {
					colors.normal(" ");
					colors.green(a);
				});
				newline();
			});
		}
		const modulesByIdentifier = {};
		if (obj.modules) {
			obj.modules.forEach(m => (modulesByIdentifier[`$${m.identifier}`] = m));
		} else if (obj.chunks) {
			obj.chunks.forEach(c => {
				if (c.modules) c.modules.forEach(m => (modulesByIdentifier[`$${m.identifier}`] = m));
			});
		}

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