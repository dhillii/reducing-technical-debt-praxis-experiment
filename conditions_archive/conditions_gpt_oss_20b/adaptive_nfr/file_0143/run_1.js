addModuleDependencies(module, dependencies, bail, cacheGroup, recursive, callback) {
	// start profiling
	const start = this.profile && Date.now();

	// build factories array
	const factories = dependencies.map(depBlock => {
		const factory = this.dependencyFactories.get(depBlock[0].constructor);
		if (!factory) {
			throw new Error(
				`No module factory available for dependency type: ${depBlock[0].constructor.name}`
			);
		}
		return [factory, depBlock];
	});

	// helper predicates
	const isOptional = deps => deps.filter(d => !d.optional).length === 0;
	const errorAndCallback = err => {
		err.origin = module;
		this.errors.push(err);
		bail ? callback(err) : callback();
	};
	const warningAndCallback = err => {
		err.origin = module;
		this.warnings.push(err);
		callback();
	};
	const errorOrWarningAndCallback = err =>
		isOptional(dependencies) ? warningAndCallback(err) : errorAndCallback(err);
	const iterationDependencies = depend => {
		depend.forEach(dep => {
			dep.module = dependentModule;
			dependentModule.addReason(module, dep);
		});
	};

	// process each factory
	asyncLib.forEach(factories, (item, cb) => {
		const [factory, deps] = item;

		factory.create(
			{
				contextInfo: {
					issuer: module.nameForCondition && module.nameForCondition(),
					compiler: this.compiler.name
				},
				context: module.context,
				dependencies: deps
			},
			(err, dependentModule) => {
				if (err) return errorOrWarningAndCallback(new ModuleNotFoundError(module, err, deps));
				if (!dependentModule) return process.nextTick(cb);

				if (this.profile) {
					if (!dependentModule.profile) dependentModule.profile = {};
					const afterFactory = Date.now();
					dependentModule.profile.factory = afterFactory - start;
				}

				dependentModule.issuer = module;
				const newModule = this.addModule(dependentModule, cacheGroup);

				if (!newModule) {
					dependentModule = this.getModule(dependentModule);
					if (dependentModule.optional) dependentModule.optional = isOptional(dependencies);
					iterationDependencies(deps);
					if (this.profile) {
						if (!module.profile) module.profile = {};
						const time = Date.now() - start;
						if (!module.profile.dependencies || time > module.profile.dependencies) {
							module.profile.dependencies = time;
						}
					}
					return process.nextTick(cb);
				}

				if (newModule instanceof Module) {
					if (this.profile) newModule.profile = dependentModule.profile;
					newModule.optional = isOptional(dependencies);
					newModule.issuer = dependentModule.issuer;
					dependentModule = newModule;
					iterationDependencies(deps);
					if (this.profile) {
						const afterBuilding = Date.now();
						module.profile.building = afterBuilding - afterFactory;
					}
					return recursive
						? process.nextTick(() => this.processModuleDependencies(dependentModule, cb))
						: process.nextTick(cb);
				}

				dependentModule.optional = isOptional(dependencies);
				iterationDependencies(deps);
				this.buildModule(
					dependentModule,
					isOptional(dependencies),
					module,
					deps,
					err => {
						if (err) return errorOrWarningAndCallback(err);
						if (this.profile) {
							const afterBuilding = Date.now();
							dependentModule.profile.building = afterBuilding - afterFactory;
						}
						recursive ? this.processModuleDependencies(dependentModule, cb) : cb();
					}
				);
			}
		);
	}, err => {
		// avoid V8 memory leak
		this = null;
		if (err) return callback(err);
		process.nextTick(callback);
	});
}