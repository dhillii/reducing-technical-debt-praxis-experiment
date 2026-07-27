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

        const processModuleAttributes = (module) => {
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

        return obj;
    }

    // ... existing code ...

    static jsonToString(obj, useColors) {
        // ... existing code ...

        const getAssetColor = (asset, defaultColor) => {
            if (asset.isOverSizeLimit) {
                return colors.yellow;
            }

            return defaultColor;
        };

        // ... existing code ...

        const table = (array, align, splitter) => {
            const rows = array.length;
            const cols = array[0].length;
            const colSizes = new Array(cols);
            for (let col = 0; col < cols; col++)
                colSizes[col] = 0;
            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    const value = `${getText(array, row, col)}`;
                    if (value.length > colSizes[col]) {
                        colSizes[col] = value.length;
                    }
                }
            }
            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    const format = array[row][col].color;
                    const value = `${getText(array, row, col)}`;
                    let l = value.length;
                    if (align[col] === "l")
                        format(value);
                    for (; l < colSizes[col] && col !== cols - 1; l++)
                        colors.normal(" ");
                    if (align[col] === "r")
                        format(value);
                    if (col + 1 < cols && colSizes[col] !== 0)
                        colors.normal(splitter || "  ");
                }
                newline();
            }
        };

        // ... existing code ...

        const coloredTime = (time) => {
            let times = [800, 400, 200, 100];
            if (obj.time) {
                times = [obj.time / 2, obj.time / 4, obj.time / 8, obj.time / 16];
            }
            if (time < times[3])
                colors.normal(`${time}ms`);
            else if (time < times[2])
                colors.bold(`${time}ms`);
            else if (time < times[1])
                colors.green(`${time}ms`);
            else if (time < times[0])
                colors.yellow(`${time}ms`);
            else
                colors.red(`${time}ms`);
        };

        // ... existing code ...
    }

    // ... existing code ...
}

module.exports = Stats;