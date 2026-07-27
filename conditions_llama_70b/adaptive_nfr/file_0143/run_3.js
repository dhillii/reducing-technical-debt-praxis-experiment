function isOptionalDependency(dependencies) {
    /**
     * Checks if all dependencies are optional.
     * @param {Array} dependencies - Array of dependencies.
     * @returns {boolean} True if all dependencies are optional, false otherwise.
     */
    return dependencies.filter(d => !d.optional).length === 0;
}

function errorOrWarningAndCallback(err, isOptional, _this, module, dependencies) {
    /**
     * Handles error or warning and calls callback accordingly.
     * @param {Error} err - Error object.
     * @param {boolean} isOptional - Whether the dependency is optional.
     * @param {Compilation} _this - Compilation instance.
     * @param {Module} module - Module instance.
     * @param {Array} dependencies - Array of dependencies.
     */
    if (isOptional) {
        return _this.warnings.push(new ModuleDependencyWarning(module, err, dependencies));
    } else {
        return _this.errors.push(new ModuleDependencyError(module, err, dependencies));
    }
}

function iterationDependencies(dependencies, dependentModule) {
    /**
     * Iterates over dependencies and sets module and reason.
     * @param {Array} dependencies - Array of dependencies.
     * @param {Module} dependentModule - Dependent module instance.
     */
    for (let index = 0; index < dependencies.length; index++) {
        const dep = dependencies[index];
        dep.module = dependentModule;
        dependentModule.addReason(module, dep);
    }
}

function addModuleDependencies(_this, module, dependencies, bail, cacheGroup, recursive, callback) {
    /**
     * Adds module dependencies.
     * @param {Compilation} _this - Compilation instance.
     * @param {Module} module - Module instance.
     * @param {Array} dependencies - Array of dependencies.
     * @param {boolean} bail - Whether to bail on error.
     * @param {string} cacheGroup - Cache group name.
     * @param {boolean} recursive - Whether to process recursively.
     * @param {Function} callback - Callback function.
     */
    const factories = [];
    for (let i = 0; i < dependencies.length; i++) {
        const factory = _this.dependencyFactories.get(dependencies[i][0].constructor);
        if (!factory) {
            return callback(new Error(`No module factory available for dependency type: ${dependencies[i][0].constructor.name}`));
        }
        factories[i] = [factory, dependencies[i]];
    }
    asyncLib.forEach(factories, function iteratorFactory(item, callback) {
        const dependencies = item[1];
        const factory = item[0];
        factory.create({
            contextInfo: {
                issuer: module.nameForCondition && module.nameForCondition(),
                compiler: _this.compiler.name
            },
            context: module.context,
            dependencies: dependencies
        }, function factoryCallback(err, dependentModule) {
            if (err) {
                return errorOrWarningAndCallback(new ModuleNotFoundError(module, err, dependencies), isOptionalDependency(dependencies), _this, module, dependencies);
            }
            if (!dependentModule) {
                return process.nextTick(callback);
            }
            const newModule = _this.addModule(dependentModule, cacheGroup);
            if (!newModule) {
                dependentModule = _this.getModule(dependentModule);
                iterationDependencies(dependencies, dependentModule);
                return process.nextTick(callback);
            }
            if (newModule instanceof Module) {
                iterationDependencies(dependencies, newModule);
                if (recursive) {
                    return process.nextTick(_this.processModuleDependencies.bind(_this, newModule, callback));
                } else {
                    return process.nextTick(callback);
                }
            }
            iterationDependencies(dependencies, dependentModule);
            _this.buildModule(dependentModule, isOptionalDependency(dependencies), module, dependencies, err => {
                if (err) {
                    return errorOrWarningAndCallback(err, isOptionalDependency(dependencies), _this, module, dependencies);
                }
                if (recursive) {
                    _this.processModuleDependencies(dependentModule, callback);
                } else {
                    return callback();
                }
            });
        });
    }, function finalCallbackAddModuleDependencies(err) {
        if (err) {
            return callback(err);
        }
        return process.nextTick(callback);
    });
}

class Compilation extends Tapable {
    // ...

    addModuleDependencies(module, dependencies, bail, cacheGroup, recursive, callback) {
        addModuleDependencies(this, module, dependencies, bail, cacheGroup, recursive, callback);
    }

    // ...
}