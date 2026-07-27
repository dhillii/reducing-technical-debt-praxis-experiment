addModuleDependencies(module, dependencies, bail, cacheGroup, recursive, callback) {
    let _this = this;
    const start = _this.profile && Date.now();

    const factories = dependencies.map(dependency => {
        const factory = _this.dependencyFactories.get(dependency[0].constructor);
        if (!factory) {
            return callback(new Error(`No module factory available for dependency type: ${dependency[0].constructor.name}`));
        }
        return [factory, dependency];
    });

    asyncLib.forEach(factories, (item, callback) => {
        const factory = item[0];
        const dependencies = item[1];

        const errorAndCallback = (err) => {
            err.origin = module;
            _this.errors.push(err);
            if (bail) {
                callback(err);
            } else {
                callback();
            }
        };

        const warningAndCallback = (err) => {
            err.origin = module;
            _this.warnings.push(err);
            callback();
        };

        factory.create({
            contextInfo: {
                issuer: module.nameForCondition && module.nameForCondition(),
                compiler: _this.compiler.name
            },
            context: module.context,
            dependencies: dependencies
        }, (err, dependentModule) => {
            if (err) {
                return errorAndCallback(new ModuleNotFoundError(module, err, dependencies));
            }
            if (!dependentModule) {
                return process.nextTick(callback);
            }

            const isOptional = dependencies.every(d => d.optional);

            const iterationDependencies = (depend) => {
                depend.forEach(d => {
                    d.module = dependentModule;
                    dependentModule.addReason(module, d);
                });
            };

            if (_this.profile) {
                if (!dependentModule.profile) {
                    dependentModule.profile = {};
                }
                const afterFactory = Date.now();
                dependentModule.profile.factory = afterFactory - start;
            }

            dependentModule.issuer = module;
            const newModule = _this.addModule(dependentModule, cacheGroup);

            if (!newModule) {
                dependentModule = _this.getModule(dependentModule);

                if (dependentModule.optional) {
                    dependentModule.optional = isOptional;
                }

                iterationDependencies(dependencies);

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

                dependentModule = newModule;

                dependentModule.optional = isOptional;
                dependentModule.issuer = dependentModule.issuer;

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

            dependentModule.optional = isOptional;

            iterationDependencies(dependencies);

            _this.buildModule(dependentModule, isOptional, module, dependencies, (err) => {
                if (err) {
                    return errorAndCallback(err);
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
    }, (err) => {
        _this = null;

        if (err) {
            return callback(err);
        }

        return process.nextTick(callback);
    });
}