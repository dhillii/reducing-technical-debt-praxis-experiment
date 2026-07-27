function isOptional(dependencies) {
    // Check if all dependencies are optional
    return dependencies.filter(d => !d.optional).length === 0;
}

function errorOrWarningAndCallback(err, module, dependencies, _this, bail) {
    // Handle error or warning based on whether dependencies are optional
    if (isOptional(dependencies)) {
        const warning = new ModuleDependencyWarning(module, err, dependencies);
        _this.warnings.push(warning);
    } else {
        const error = new ModuleDependencyError(module, err, dependencies);
        _this.errors.push(error);
        if (bail) {
            throw error;
        }
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

function handleFactoryResult(err, dependentModule, module, dependencies, _this, callback, bail) {
    // Handle the result of the factory callback
    if (err) {
        return errorOrWarningAndCallback(new ModuleNotFoundError(module, err, dependencies), module, dependencies, _this, bail);
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
            handleFactoryResult(err, dependentModule, module, dependencies, _this, callback, bail);
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