function isOptionalDependency(dependencies) {
    // Check if all dependencies are optional
    return dependencies.filter(d => !d.optional).length === 0;
}

function errorOrWarningAndCallback(err, isOptional, _this, module, dependencies) {
    // Handle error or warning based on whether the dependency is optional
    if (isOptional) {
        err.origin = module;
        _this.warnings.push(err);
    } else {
        err.origin = module;
        err.dependencies = dependencies;
        _this.errors.push(err);
    }
}

function iterationDependencies(dependencies, dependentModule) {
    // Iterate over dependencies and add reasons to the dependent module
    for (let index = 0; index < dependencies.length; index++) {
        const dep = dependencies[index];
        dep.module = dependentModule;
        dependentModule.addReason(module, dep);
    }
}

function handleFactoryCallback(err, dependentModule, _this, module, dependencies, callback) {
    // Handle the factory callback
    if (err) {
        return errorOrWarningAndCallback(new ModuleNotFoundError(module, err, dependencies), isOptionalDependency(dependencies), _this, module, dependencies);
    }
    if (!dependentModule) {
        return process.nextTick(callback);
    }
    if (_this.profile) {
        if (!dependentModule.profile) {
            dependentModule.profile = {};
        }
        const afterFactory = Date.now();
        dependentModule.profile.factory = afterFactory - start;
    }

    dependentModule.issuer = module;
    const newModule = _this.addModule(dependentModule);
    if (!newModule) { // from cache
        dependentModule = _this.getModule(dependentModule);

        if (dependentModule.optional) {
            dependentModule.optional = isOptionalDependency(dependencies);
        }

        iterationDependencies(dependencies, dependentModule);

        if (_this.profile) {
            const afterBuilding = Date.now();
            module.profile.dependencies = afterBuilding - start;
        }

        return process.nextTick(callback);
    }

    if (newModule instanceof Module) {
        if (_this.profile) {
            newModule.profile = dependentModule.profile;
        }

        newModule.optional = isOptionalDependency(dependencies);
        newModule.issuer = dependentModule.issuer;
        dependentModule = newModule;

        iterationDependencies(dependencies, dependentModule);

        if (_this.profile) {
            const afterBuilding = Date.now();
            module.profile.building = afterBuilding - afterFactory;
        }

        if (recursive) {
            return process.nextTick(_this.processModuleDependencies.bind(_this, dependentModule, callback));
        } else {
            return process.nextTick(callback);
        }
    }

    dependentModule.optional = isOptionalDependency(dependencies);

    iterationDependencies(dependencies, dependentModule);

    _this.buildModule(dependentModule, isOptionalDependency(dependencies), module, dependencies, err => {
        if (err) {
            return errorOrWarningAndCallback(err, isOptionalDependency(dependencies), _this, module, dependencies);
        }

        if (_this.profile) {
            const afterBuilding = Date.now();
            dependentModule.profile.building = afterBuilding - afterFactory;
        }

        if (recursive) {
            _this.processModuleDependencies(dependentModule, callback);
        } else {
            return callback();
        }
    });
}

function addModuleDependencies(_this, module, dependencies, bail, cacheGroup, recursive, callback) {
    // Add module dependencies
    let _this = _this;
    const start = _this.profile && Date.now();

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

        const errorAndCallback = function errorAndCallback(err) {
            err.origin = module;
            _this.errors.push(err);
            if (bail) {
                callback(err);
            } else {
                callback();
            }
        };
        const warningAndCallback = function warningAndCallback(err) {
            err.origin = module;
            _this.warnings.push(err);
            callback();
        };

        const factory = item[0];
        factory.create({
            contextInfo: {
                issuer: module.nameForCondition && module.nameForCondition(),
                compiler: _this.compiler.name
            },
            context: module.context,
            dependencies: dependencies
        }, function factoryCallback(err, dependentModule) {
            handleFactoryCallback(err, dependentModule, _this, module, dependencies, callback);
        });
    }, function finalCallbackAddModuleDependencies(err) {
        // In V8, the Error objects keep a reference to the functions on the stack. These warnings &
        // errors are created inside closures that keep a reference to the Compilation, so errors are
        // leaking the Compilation object. Setting _this to null workarounds the following issue in V8.
        // https://bugs.chromium.org/p/chromium/issues/detail?id=612191
        _this = null;

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