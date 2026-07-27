addModuleDependencies(module, dependencies, bail, cacheGroup, recursive, callback) {
    let _this = this;
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
        const factory = item[0];

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

        const isOptional = function isOptional() {
            return dependencies.filter(d => !d.optional).length === 0;
        };

        const errorOrWarningAndCallback = function errorOrWarningAndCallback(err) {
            if (isOptional()) {
                return warningAndCallback(err);
            } else {
                return errorAndCallback(err);
            }
        };

        const iterationDependencies = function iterationDependencies(depend) {
            for (let index = 0; index < depend.length; index++) {
                const dep = depend[index];
                dep.module = dependentModule;
                dependentModule.addReason(module, dep);
            }
        };

        factory.create({
            contextInfo: {
                issuer: module.nameForCondition && module.nameForCondition(),
                compiler: _this.compiler.name
            },
            context: module.context,
            dependencies: dependencies
        }, function factoryCallback(err, dependentModule) {
            if (err) {
                return errorOrWarningAndCallback(new ModuleNotFoundError(module, err, dependencies));
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
            const newModule = _this.addModule(dependentModule, cacheGroup);

            if (!newModule) { // from cache
                dependentModule = _this.getModule(dependentModule);

                if (dependentModule.optional) {
                    dependentModule.optional = isOptional();
                }

                iterationDependencies(dependencies);

                if (_this.profile) {
                    if (!module.profile) {
                        module.profile = {};
                    }
                    const time = Date.now() - start;
                    if (!module.profile.dependencies || time > module.profile.dependencies) {
                        module.profile.dependencies = time;
                    }
                }

                return process.nextTick(callback);
            }

            if (newModule instanceof Module) {
                if (_this.profile) {
                    newModule.profile = dependentModule.profile;
                }

                newModule.optional = isOptional();
                newModule.issuer = dependentModule.issuer;
                dependentModule = newModule;

                iterationDependencies(dependencies);

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

            dependentModule.optional = isOptional();

            iterationDependencies(dependencies);

            _this.buildModule(dependentModule, isOptional(), module, dependencies, err => {
                if (err) {
                    return errorOrWarningAndCallback(err);
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
        });
    }, function finalCallbackAddModuleDependencies(err) {
        _this = null;

        if (err) {
            return callback(err);
        }

        return process.nextTick(callback);
    });
}