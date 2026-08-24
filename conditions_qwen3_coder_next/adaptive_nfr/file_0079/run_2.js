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

    // Validate requirements

    const requirements = item.requirements;
    Hoek.assert(!requirements.node || Somever.match(process.version, requirements.node), 'Plugin', item.name, 'requires node version', requirements.node, 'but found', process.version);
    Hoek.assert(!requirements.hapi || Somever.match(this.version, requirements.hapi), 'Plugin', item.name, 'requires hapi version', requirements.hapi, 'but found', this.version);

    // Protect against multiple registrations

    const connectionless = _isConnectionless(item, selection);
    if (connectionless) {
        _handleConnectionlessRegistration(item, registrationData);
    }

    const connections = _filterConnections(item, selection, registrationData);
    if (_shouldSkipRegistration(item, connectionless, connections)) {
        return next();
    }

    selection.connections = (connectionless ? null : connections);
    selection._single();

    if (item.dependencies) {
        selection.dependency(item.dependencies);
    }

    if (connectionless) {
        selection.connection = this.root.connection;
    }

    // Register

    item.register(selection, item.pluginOptions || {}, next);
};

const _isConnectionless = (item, selection) => {
    return (item.connections === 'conditional' ? selection.connections.length === 0 : !item.connections);
};

const _handleConnectionlessRegistration = (item, registrationData) => {
    if (this.root._registrations[item.name]) {
        if (item.options.once) {
            return;
        }

        Hoek.assert(item.multiple, 'Plugin', item.name, 'already registered');
    }
    else {
        this.root._registrations[item.name] = registrationData;
    }
};

const _filterConnections = (item, selection, registrationData) => {
    const connections = [];
    if (!selection.connections) {
        return connections;
    }

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

    return connections;
};

const _shouldSkipRegistration = (item, connectionless, connections) => {
    return item.options.once &&
        !connectionless &&
        !connections.length;
};