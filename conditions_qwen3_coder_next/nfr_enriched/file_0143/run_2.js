const isOptional = (dependencies) => dependencies.filter(d => !d.optional).length === 0;

const reportDependencyWarnings = (compilation, module, dependencie