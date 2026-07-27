}, function factoryCallback(err, dependentModule) {
					let afterFactory;

					/**
					 * @returns {boolean}
					 */
					function isOptional() {
						return dependencies.every(d => d.optional);
					}

					/**
					 * @param {Error} err
					 */
					function handleError(err) {
						if (isOptional()) {
							return warningAndCallback(err);
						}
						return errorAndCallback(err);
					}

					/**
					 * @param {Module} depModule
					 * @param {Array} deps
					 */
					function addDependencies(depModule, deps) {
						for (let i = 0; i < deps.length; i++) {
							const dep = deps[i];
							dep.module = depModule;
							depModule.addReason(module, dep);
						}
					}

					/**
					 * @param {Module} cachedModule
					 */
					function handleCachedModule() {
						dependentModule = _this.getModule(dependentModule);

						if (dependentModule.optional) {
							dependentModule.optional = isOptional();
						}

						addDependencies(dependentModule, dependencies);

						if (_this.profile) {
							if (!module.profile) module.profile = {};
							const time = Date.now() - start;
							if (!module.profile.dependencies || time > module.profile.dependencies) {
								module.profile.dependencies = time;
							}
						}

						return process.nextTick(callback);
					}

					/**
					 * @param {Module} newModule
					 */
					function handleNewModuleInstance(newModule) {
						if (_this.profile) {
							newModule.profile = dependentModule.profile;
						}

						newModule.optional = isOptional();
						newModule.issuer = dependentModule.issuer;
						dependentModule = newModule;

						addDependencies(dependentModule, dependencies);

						if (_this.profile) {
							const afterBuilding = Date.now();
							module.profile.building = afterBuilding - afterFactory;
						}

						if (recursive) {
							return process.nextTick(_this.processModuleDependencies.bind(_this, dependentModule, callback));
						}
						return process.nextTick(callback);
					}

					/**
					 * Handles the case where the dependent module is not a Module instance.
					 */
					function handleNonModuleInstance() {
						dependentModule.optional = isOptional();

						addDependencies(dependentModule, dependencies);

						_this.buildModule(dependentModule, isOptional(), module, dependencies, (buildErr) => {
							if (buildErr) {
								return handleError(buildErr);
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

					if (err) {
						return handleError(new ModuleNotFoundError(module, err, dependencies));
					}

					if (!dependentModule) {
						return process.nextTick(callback);
					}

					if (_this.profile) {
						if (!dependentModule.profile) dependentModule.profile = {};
						afterFactory = Date.now();
						dependentModule.profile.factory = afterFactory - start;
					}

					dependentModule.issuer = module;
					const newModule = _this.addModule(dependentModule, cacheGroup);

					if (!newModule) {
						return handleCachedModule();
					}

					if (newModule instanceof Module) {
						return handleNewModuleInstance(newModule);
					}

					return handleNonModuleInstance();
				});