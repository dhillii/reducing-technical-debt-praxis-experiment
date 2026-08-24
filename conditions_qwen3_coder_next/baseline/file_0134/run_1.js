convertType({
    attribute = {},
    modelName = '',
    attributeName = '',
    rootType = 'query',
    action = '',
  }) {
    if (isScalarAttribute(attribute)) {
      return this.convertScalarType(attribute, rootType, action);
    }

    if (attribute.type === 'component') {
      return this.convertComponentType(attribute, modelName, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return this.convertDynamicZoneType(attribute, modelName, attributeName, rootType);
    }

    const ref = attribute.model || attribute.collection;

    if (ref && ref !== '*') {
      return this.convertAssociationType(attribute, ref, rootType, action);
    }

    return this.convertDefaultType(attribute, rootType);
  },

  convertScalarType(attribute, rootType, action) {
    const typeMap = {
      boolean: 'Boolean',
      integer: 'Int',
      biginteger: 'Long',
      float: 'Float',
      decimal: 'Float',
      json: 'JSON',
      date: 'Date',
      time: 'Time',
      datetime: 'DateTime',
      timestamp: 'DateTime',
      enumeration: () => this.convertEnumType(attribute, attributeName, modelName),
    };

    let type = typeMap[attribute.type] || 'String';
    if (typeof type === 'function') {
      type = type();
    }

    if (attribute.required && this.isNonNullable(required => rootType !== 'mutation' || (action !== 'update' && attribute.default === undefined))) {
      type += '!';
    }

    return type;
  },

  convertComponentType(attribute, modelName, rootType, action) {
    const { required, repeatable, component } = attribute;
    const globalId = strapi.components[component].globalId;
    let typeName = required === true ? globalId : globalId;

    if (rootType === 'mutation') {
      const singularFormatted = _.upperFirst(toSingular(globalId));
      typeName = action === 'update' ? `edit${singularFormatted}Input` : `${singularFormatted}Input${required ? '!' : ''}`;
    }

    return repeatable === true ? `[${typeName}]` : typeName;
  },

  convertDynamicZoneType(attribute, modelName, attributeName, rootType) {
    const { required } = attribute;
    const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
    let typeName = unionName;

    if (rootType === 'mutation') {
      typeName = `${unionName}Input!`;
    }

    return `[${typeName}]${required ? '!' : ''}`;
  },

  convertAssociationType(attribute, ref, rootType, action) {
    const { collection } = attribute;
    const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
    const plural = !_.isEmpty(collection);

    if (rootType === 'mutation') {
      return plural ? '[ID]' : 'ID';
    }

    return plural ? `[${globalId}]` : globalId;
  },

  convertDefaultType(attribute, rootType) {
    if (rootType === 'mutation') {
      return attribute.model ? 'ID' : '[ID]';
    }

    return attribute.model ? 'Morph' : '[Morph]';
  },