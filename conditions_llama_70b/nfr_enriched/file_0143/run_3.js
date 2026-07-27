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
    // Iterate over dependencies and add them to the dependent module
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
    // ...
}

function addModuleDependencies(_this, module, dependencies, bail, cacheGroup, recursive, callback) {
    // Add module dependencies
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
            handleFactoryCallback(err, dependentModule, _this, module, dependencies, callback);
        });
    }, function finalCallbackAddModuleDependencies(err) {
        // ...
    });
}

class Compilation extends Tapable {
    // ...

    addModuleDependencies(module, dependencies, bail, cacheGroup, recursive, callback) {
        addModuleDependencies(this, module, dependencies, bail, cacheGroup, recursive, callback);
    }

    // ...
}