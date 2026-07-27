internals.Plugin.prototype.register = function (plugins /*, [options], callback */) {

    let options = (typeof arguments[1] === 'object' ? arguments[1] : {});
    const callback = (typeof arguments[1] === 'object' ? arguments[2] : arguments[1]);

    if (!callback) {
        return Promises.wrap(this, this.register, [plugins, options]);
    }

    options = Schema.apply('register', options);

    const registrations = [];
    plugins = [].concat(plugins);
    for (let i = 0; i < plugins.length; ++i) {
        let plugin = plugins[i];

        if (typeof plugin === 'function') {
            if (!plugin.register) { 
                plugin = { register: plugin };
            }
            else {
                plugin = Hoek.shallow(plugin);  
            }
        }

        if (plugin.register.register) {                             
            plugin.register = plugin.register.register;
        }

        plugin = Schema.apply('plugin', plugin);

        const attributes = plugin.register.attributes;
        const registration = {
            register: plugin.register,
            name: attributes.name || attributes.pkg.name,
            version: attributes.version || attributes.pkg.version,
            multiple: attributes.multiple,
            pluginOptions: plugin.options,
            dependencies: attributes.dependencies,
            connections: attributes.connections,
            requirements: attributes.requirements,
            options: {
                once: attributes.once || (plugin.once !== undefined ? plugin.once : options.once),
                routes: {
                    prefix: plugin.routes.prefix || options.routes.prefix,
                    vhost: plugin.routes.vhost || options.routes.vhost
                },
                select: plugin.select || options.select
            }
        };

        registrations.push(registration);
    }

    this.root._registring = true;

    const processRegistration = (item, next) => {
        const selection = this._select(item.options.select, item.name);
        selection.realm.modifiers.route.prefix = item.options.routes.prefix;
        selection.realm.modifiers.route.vhost = item.options.routes.vhost;
        selection.realm.pluginOptions = item.pluginOptions || {};

        const registrationData = {
            version: item.version,
            name: item.name,
            options: item.pluginOptions,
            attributes: item.register.attributes
        };

        validateRequirements(item, registrationData, next);
    };

    const validateRequirements = (item, registrationData, next) => {
        const requirements = item.requirements;
        Hoek.assert(!requirements.node || Somever.match(process.version, requirements.node), 'Plugin', item.name, 'requires node version', requirements.node, 'but found', process.version);
        Hoek.assert(!requirements.hapi || Somever.match(this.version, requirements.hapi), 'Plugin', item.name, 'requires hapi version', requirements.hapi, 'but found', this.version);

        protectAgainstMultipleRegistrations(item, registrationData, next);
    };

    const protectAgainstMultipleRegistrations = (item, registrationData, next) => {
        const connectionless = (item.connections === 'conditional' ? selection.connections.length === 0 : !item.connections);
        if (connectionless) {
            if (this.root._registrations[item.name]) {
                if (item.options.once) {
                    return next();
                }

                Hoek.assert(item.multiple, 'Plugin', item.name, 'already registered');
            }
            else {
                this.root._registrations[item.name] = registrationData;
            }
        }

        const connections = [];
        if (selection.connections) {
            for (let i = 0; i < selection.connections.length; ++i) {
                const connection = selection.connections[i];
                if (connection.registrations[item.name]) {
                    if (item.options.once) {
                        continue;
                    }

                    Hoek.assert(item.multiple, 'Plugin', item.name, 'already registered in:', connection.info.uri);
                }
                else {
                    connection.registrations[item.name] = registrationData;
                }

                connections.push(connection);
            }

            if (item.options.once &&
                !connectionless &&
                !connections.length) {

                return next();                                              // All the connections already registered
            }
        }

        selection.connections = (connectionless ? null : connections);
        selection._single();

        if (item.dependencies) {
            selection.dependency(item.dependencies);
        }

        if (connectionless) {
            selection.connection = this.root.connection;
        }

        item.register(selection, item.pluginOptions || {}, next);
    };

    Items.serial(registrations, processRegistration, (err) => {

        this.root._registring = false;
        return Hoek.nextTick(callback)(err);
    });
};