addModuleDependencies(module, dependencies, bail, cacheGroup, recursive, callback) {
	// Capture this for use in nested callbacks
	const self = this;
	const start = self.profile && Date.now();

	// Build an array of [factory, dependencyBlock] pairs
	const factories = dependencies.map(depBlock => {
		const factory = self.dependencyFactories.get(depBlock[0].constructor);
		if (!factory) {
			throw new Error(`No module factory available for dependency type: ${depBlock[0].constructor.name}`);
		}
		return [factory, depBlock];
	});

	// Helper to process a single factory
	const processFactory = (factory, depBlock, cb) => {
		const deps = depBlock;

		const errorAndCallback = err => {
			err.origin = module;
			self.errors.push(err);
			cb(bail ? err : undefined);
		};

		const warningAndCallback = err => {
			err.origin = module;
			self.warnings.push(err);
			cb();
		};

		const isOptional = () => deps.filter(d => !d.optional).length === 0;

		const iterationDependencies = depend => {
			depend.forEach(dep => {
				dep.module = dependentModule;
				dependentModule.addReason(module, dep);
			});
		};

		const errorOrWarningAndCallback = err => {
			if (isOptional()) {
				warningAndCallback(err);
			} else {
				errorAndCallback(err);
			}
		};

		factory.create(
			{
				contextInfo: {
					issuer: module.nameForCondition && module.nameForCondition(),
					compiler: self.compiler.name
				},
				context: module.context,
				dependencies: deps
			},
			(err, dependentModule) => {
				if (err) {
					return errorOrWarningAndCallback(new ModuleNotFoundError(module, err, deps));
				}
				if (!dependentModule) {
					return process.nextTick(cb);
				}

				if (self.profile) {
					if (!dependentModule.profile) dependentModule.profile = {};
					const afterFactory = Date.now();
					dependentModule.profile.factory = afterFactory - start;
				}

				dependentModule.issuer = module;
				const newModule = self.addModule(dependentModule, cacheGroup);

				if (!newModule) {
					// module already existed
					dependentModule = self.getModule(dependentModule);
					if (dependentModule.optional) dependentModule.optional = isOptional();
					iterationDependencies(deps);

					if (self.profile) {
						if (!module.profile) module.profile = {};
						const time = Date.now() - start;
						if (!module.profile.dependencies || time > module.profile.dependencies) {
							module.profile.dependencies = time;
						}
					}
					return process.nextTick(cb);
				}

				if (newModule instanceof Module) {
					if (self.profile) newModule.profile = dependentModule.profile;
					newModule.optional = isOptional();
					newModule.issuer = dependentModule.issuer;
					dependentModule = newModule;
					iterationDependencies(deps);

					if (self.profile) {
						const afterBuilding = Date.now();
						module.profile.building = afterBuilding - afterFactory;
					}

					return recursive
						? process.nextTick(self.processModuleDependencies.bind(self, dependentModule, cb))
						: process.nextTick(cb);
				}

				// newModule is true (module added)
				dependentModule.optional = isOptional();
				iterationDependencies(deps);

				self.buildModule(
					dependentModule,
					isOptional(),
					module,
					deps,
					err => {
						if (err) return errorOrWarningAndCallback(err);

						if (self.profile) {
							const afterBuilding = Date.now();
							dependentModule.profile.building = afterBuilding - afterFactory;
						}

						if (recursive) {
							self.processModuleDependencies(dependentModule, cb);
						} else {
							cb();
						}
					}
				);
			}
		);
	};

	asyncLib.forEach(
		factories,
		(item, cb) => processFactory(item[0], item[1], cb),
		err => {
			// Avoid leaking this reference in V8
			self = null;
			if (err) return callback(err);
			process.nextTick(callback);
		}
	);
}