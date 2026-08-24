this.root._registring = true;

    const each = (item, next) => {

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

        this._validateRequirements(item);
        this._handleRegistration(item, registrationData, selection, next);
    };

    Items.serial(registrations, each, (err) => {

        this.root._registring = false;
        return Hoek.nextTick(callback)(err);
    });
};

internals.Plugin.prototype._validateRequirements = function (item) {

    const requirements = item.requirements;
    Hoek.assert(!requirements.node || Somever.match(process.version, requirements.node), 'Plugin', item.name, 'requires node version', requirements.node, 'but found', process.version);
    Hoek.assert(!requirements.hapi || Somever.match(this.version, requirements.hapi), 'Plugin', item.name, 'requires hapi version', requirements.hapi, 'but found', this.version);
};

internals.Plugin.prototype._handleRegistration = function (item, registrationData, selection, next) {

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

            return next();
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