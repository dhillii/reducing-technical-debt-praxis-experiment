}, function factoryCallback(err, dependentModule) {
					if (err) {
						return errorOrWarningAndCallback(new ModuleNotFoundError(module, err, dependencies));
					}
					if (!dependentModule) {
						return process.nextTick(callback);
					}

					const optional = isOptional();
					const afterFactory = _this.profile ? Date.now() - start : 0;
					if (_this.profile) {
						if (!dependentModule.profile) dependentModule.profile = {};
						dependentModule.profile.factory = afterFactory;
					}

					dependentModule.issuer = module;
					const newModule = _this.addModule(dependentModule, cacheGroup);

					if (!newModule) {
						dependentModule = _this.getModule(dependentModule);
						if (dependentModule.optional) dependentModule.optional = optional;
						iterationDependencies(dependencies);
						if (_this.profile) {
							if (!module.profile) module.profile = {};
							const time = Date.now() - start;
							if (!module.profile.dependencies || time > module.profile.dependencies) {
								module.profile.dependencies = time;
							}
						}
						return process.nextTick(callback);
					}

					if (newModule instanceof Module) {
						if (_this.profile) newModule.profile = dependentModule.profile;
						newModule.optional = optional;
						newModule.issuer = dependentModule.issuer;
						dependentModule = newModule;
						iterationDependencies(dependencies);
						if (_this.profile) {
							module.profile.building = Date.now() - afterFactory;
						}
						if (recursive) {
							return process.nextTick(_this.processModuleDependencies.bind(_this, dependentModule, callback));
						}
						return process.nextTick(callback);
					}

					dependentModule.optional = optional;
					iterationDependencies(dependencies);
					_this.buildModule(dependentModule, optional, module, dependencies, err => {
						if (err) return errorOrWarningAndCallback(err);
						if (_this.profile) {
							dependentModule.profile.building = Date.now() - afterFactory;
						}
						if (recursive) {
							_this.processModuleDependencies(dependentModule, callback);
						} else {
							callback();
						}
					});
				});