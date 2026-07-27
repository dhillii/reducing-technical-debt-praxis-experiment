class Stats {
    // ... existing code ...

    toJson(options, forToString) {
        // ... existing code ...

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

        // ... existing code ...

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

        const filterModules = (modules) => {
            return modules.filter(createModuleFilter());
        };

        const sortModules = (modules, field) => {
            return modules.sort(sortByField(field));
        };

        const processModule = (module) => {
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
            if (showReasons) {
                obj.reasons = module.reasons.filter(reason => reason.dependency && reason.module).map(reason => {
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
            if (showUsedExports) {
                obj.usedExports = module.used ? module.usedExports : false;
            }
            if (showProvidedExports) {
                obj.providedExports = Array.isArray(module.providedExports) ? module.providedExports : null;
            }
            if (showDepth) {
                obj.depth = module.depth;
            }
            if (showSource && module._source) {
                obj.source = module._source.source();
            }
            return obj;
        };

        const processChunk = (chunk) => {
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
                obj.modules = filterModules(chunk.modules)
                    .sort(sortByField("depth"))
                    .map(processModule);
                obj.filteredModules = chunk.modules.length - obj.modules.length;
                obj.modules = sortModules(obj.modules, sortModules);
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
        };

        // ... existing code ...

        if (showChunks) {
            obj.chunks = compilation.chunks.map(processChunk);
            obj.chunks.sort(sortByField(sortChunks));
        }

        if (showModules) {
            obj.modules = filterModules(compilation.modules)
                .sort(sortByField("depth"))
                .map(processModule);
            obj.filteredModules = compilation.modules.length - obj.modules.length;
            obj.modules = sortModules(obj.modules, sortModules);
        }

        // ... existing code ...
    }

    // ... existing code ...
}