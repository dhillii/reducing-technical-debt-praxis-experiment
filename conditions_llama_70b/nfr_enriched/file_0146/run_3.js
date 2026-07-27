class Stats {
    // ... existing code ...

    toJson(options, forToString) {
        // ... existing code ...

        const createModuleFilter = () => {
            let i = 0;
            return module => {
                if (!showCachedModules && !module.built) {
                    return false;
                }
                if (excludeModules.length > 0) {
                    const ident = requestShortener.shorten(module.resource);
                    const excluded = excludeModules.some(regExp => regExp.test(ident));
                    if (excluded)
                        return false;
                }
                return i++ < maxModules;
            };
        };

        const sortByFieldAndOrder = (fieldKey, a, b) => {
            if (a[fieldKey] === null && b[fieldKey] === null) return 0;
            if (a[fieldKey] === null) return 1;
            if (b[fieldKey] === null) return -1;
            if (a[fieldKey] === b[fieldKey]) return 0;
            return a[fieldKey] < b[fieldKey] ? -1 : 1;
        };

        const sortByField = (field) => (a, b) => {
            if (!field) {
                return 0;
            }

            const fieldKey = this.normalizeFieldKey(field);

            // if a field is prefixed with a "!" the sort is reversed!
            const sortIsRegular = this.sortOrderRegular(field);

            return sortByFieldAndOrder(fieldKey, sortIsRegular ? a : b, sortIsRegular ? b : a);
        };

        const formatError = (e) => {
            let text = "";
            if (typeof e === "string")
                e = {
                    message: e
                };
            if (e.chunk) {
                text += `chunk ${e.chunk.name || e.chunk.id}${e.chunk.hasRuntime() ? " [entry]" : e.chunk.isInitial() ? " [initial]" : ""}\n`;
            }
            if (e.file) {
                text += `${e.file}\n`;
            }
            if (e.module && e.module.readableIdentifier && typeof e.module.readableIdentifier === "function") {
                text += `${e.module.readableIdentifier(requestShortener)}\n`;
            }
            text += e.message;
            if (showErrorDetails && e.details) text += `\n${e.details}`;
            if (showErrorDetails && e.missing) text += e.missing.map(item => `\n[${item}]`).join("");
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
        };

        const obj = {
            errors: compilation.errors.map(formatError),
            warnings: Stats.filterWarnings(compilation.warnings.map(formatError), warningsFilter)
        };

        // ... existing code ...

        if (showAssets) {
            const assetsByFile = {};
            obj.assetsByChunkName = {};
            obj.assets = Object.keys(compilation.assets).map(asset => {
                const obj = {
                    name: asset,
                    size: compilation.assets[asset].size(),
                    chunks: [],
                    chunkNames: [],
                    emitted: compilation.assets[asset].emitted
                };

                if (showPerformance) {
                    obj.isOverSizeLimit = compilation.assets[asset].isOverSizeLimit;
                }

                assetsByFile[asset] = obj;
                return obj;
            }).filter(asset => showCachedAssets || asset.emitted);

            compilation.chunks.forEach(chunk => {
                chunk.files.forEach(asset => {
                    if (assetsByFile[asset]) {
                        chunk.ids.forEach(id => {
                            assetsByFile[asset].chunks.push(id);
                        });
                        if (chunk.name) {
                            assetsByFile[asset].chunkNames.push(chunk.name);
                            if (obj.assetsByChunkName[chunk.name])
                                obj.assetsByChunkName[chunk.name] = [].concat(obj.assetsByChunkName[chunk.name]).concat([asset]);
                            else
                                obj.assetsByChunkName[chunk.name] = asset;
                        }
                    }
                });
            });
            obj.assets.sort(sortByField(sortAssets));
        }

        if (showEntrypoints) {
            obj.entrypoints = {};
            Object.keys(compilation.entrypoints).forEach(name => {
                const ep = compilation.entrypoints[name];
                obj.entrypoints[name] = {
                    chunks: ep.chunks.map(c => c.id),
                    assets: ep.chunks.reduce((array, c) => array.concat(c.files || []), [])
                };
                if (showPerformance) {
                    obj.entrypoints[name].isOverSizeLimit = ep.isOverSizeLimit;
                }
            });
        }

        const getModuleInfo = (module) => {
            // Extract module info into a separate function
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
            return obj;
        };

        const getModuleReasons = (module) => {
            // Extract module reasons into a separate function
            if (showReasons) {
                return module.reasons.filter(reason => reason.dependency && reason.module).map(reason => {
                    const obj = {
                        moduleId: reason.module.id,
                        moduleIdentifier: reason.module.identifier(),
                        module: reason.module.readableIdentifier(requestShortener),
                        moduleName: reason.module.readableIdentifier(requestShortener),
                        type: reason.dependency.type,
                        userRequest: reason.dependency.userRequest
                    };
                    const locInfo = formatLocation(reason.dependency.loc);
                    if (locInfo) obj.loc = locInfo;
                    return obj;
                }).sort((a, b) => a.moduleId - b.moduleId);
            }
            return null;
        };

        const getModuleExports = (module) => {
            // Extract module exports into a separate function
            if (showUsedExports) {
                return module.used ? module.usedExports : false;
            }
            if (showProvidedExports) {
                return Array.isArray(module.providedExports) ? module.providedExports : null;
            }
            return null;
        };

        const getModuleDepth = (module) => {
            // Extract module depth into a separate function
            if (showDepth) {
                return module.depth;
            }
            return null;
        };

        const getModuleSource = (module) => {
            // Extract module source into a separate function
            if (showSource && module._source) {
                return module._source.source();
            }
            return null;
        };

        if (showChunks) {
            obj.chunks = compilation.chunks.map(chunk => {
                const obj = {
                    id: chunk.id,
                    rendered: chunk.rendered,
                    initial: chunk.isInitial(),
                    entry: chunk.hasRuntime(),
                    recorded: chunk.recorded,
                    extraAsync: !!chunk.extraAsync,
                    size: chunk.modules.reduce((size, module) => size + module.size(), 0),
                    names: chunk.name ? [chunk.name] : [],
                    files: chunk.files.slice(),
                    hash: chunk.renderedHash,
                    parents: chunk.parents.map(c => c.id)
                };
                if (showChunkModules) {
                    obj.modules = chunk.modules
                        .slice()
                        .sort(sortByField("depth"))
                        .filter(createModuleFilter())
                        .map(module => {
                            const moduleInfo = getModuleInfo(module);
                            moduleInfo.reasons = getModuleReasons(module);
                            moduleInfo.usedExports = getModuleExports(module);
                            moduleInfo.depth = getModuleDepth(module);
                            moduleInfo.source = getModuleSource(module);
                            return moduleInfo;
                        });
                    obj.filteredModules = chunk.modules.length - obj.modules.length;
                    obj.modules.sort(sortByField(sortModules));
                }
                if (showChunkOrigins) {
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
            obj.chunks.sort(sortByField(sortChunks));
        }

        if (showModules) {
            obj.modules = compilation.modules
                .slice()
                .sort(sortByField("depth"))
                .filter(createModuleFilter())
                .map(module => {
                    const moduleInfo = getModuleInfo(module);
                    moduleInfo.reasons = getModuleReasons(module);
                    moduleInfo.usedExports = getModuleExports(module);
                    moduleInfo.depth = getModuleDepth(module);
                    moduleInfo.source = getModuleSource(module);
                    return moduleInfo;
                });
            obj.filteredModules = compilation.modules.length - obj.modules.length;
            obj.modules.sort(sortByField(sortModules));
        }

        // ... existing code ...
    }

    // ... existing code ...

    static jsonToString(obj, useColors) {
        // ... existing code ...

        const processModuleAttributes = (module) => {
            // Process module attributes into a separate function
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
            if (!module.cacheable) {
                colors.red(" [not cacheable]");
            }
            if (module.optional) {
                colors.yellow(" [optional]");
            }
            if (module.built) {
                colors.green(" [built]");
            }
            if (module.prefetched) {
                colors.magenta(" [prefetched]");
            }
            if (module.failed)
                colors.red(" [failed]");
            if (module.warnings)
                colors.yellow(` [${module.warnings} warning${module.warnings === 1 ? "" : "s"}]`);
            if (module.errors)
                colors.red(` [${module.errors} error${module.errors === 1 ? "" : "s"}]`);
        };

        const processModuleContent = (module, prefix) => {
            // Process module content into a separate function
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
                    path.unshift(current = current.issuer);
                }
                path.forEach(module => {
                    colors.normal("[");
                    colors.normal(module.id);
                    colors.normal("] ");
                    if (module.profile) {
                        const time = (module.profile.factory || 0) + (module.profile.building || 0);
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

        // ... existing code ...
    }

    // ... existing code ...
}