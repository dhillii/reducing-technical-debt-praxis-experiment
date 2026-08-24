convertType({
    attribute = {},
    modelName = '',
    attributeName = '',
    rootType = 'query',
    action = '',
  }) {
    if (isScalarAttribute(attribute)) {
      return this.convertScalarType(attribute);
    }

    if (attribute.type === 'component') {
      return this.handleComponentType(attribute, modelName, rootType, action);
    }

    if (attribute.type === 'dynamiczone') {
      return this.handleDynamicZoneType(attribute, modelName, rootType);
    }

    return this.handleAssociationType(attribute, rootType);
  },

  convertScalarType(attribute) {
    let type = 'String';

    switch (attribute.type) {
      case 'boolean':
        type = 'Boolean';
        break;
      case 'integer':
        type = 'Int';
        break;
      case 'biginteger':
        type = 'Long';
        break;
      case 'float':
      case 'decimal':
        type = 'Float';
        break;
      case 'json':
        type = 'JSON';
        break;
      case 'date':
        type = 'Date';
        break;
      case 'time':
        type = 'Time';
        break;
      case 'datetime':
      case 'timestamp':
        type = 'DateTime';
        break;
      case 'enumeration':
        type = this.convertEnumType(attribute, modelName, attributeName);
        break;
    }

    if (attribute.required) {
      const isNonRequiredOnUpdate =
        rootType === 'mutation' && action === 'update' && attribute.default !== undefined;
      if (!isNonRequiredOnUpdate) {
        type += '!';
      }
    }

    return type;
  },

  handleComponentType(attribute, modelName, rootType, action) {
    const { required, repeatable, component } = attribute;
    const globalId = strapi.components[component].globalId;
    let typeName = required === true ? `${globalId}` : globalId;

    if (rootType === 'mutation') {
      typeName =
        action === 'update'
          ? `edit${_.upperFirst(toSingular(globalId))}Input`
          : `${_.upperFirst(toSingular(globalId))}Input${required ? '!' : ''}`;
    }

    return repeatable === true ? `[${typeName}]` : `${typeName}`;
  },

  handleDynamicZoneType(attribute, modelName, rootType) {
    const { required } = attribute;
    const attributeName = attribute.attributeName || '';
    const unionName = `${modelName}${_.upperFirst(_.camelCase(attributeName))}DynamicZone`;
    let typeName = unionName;

    if (rootType === 'mutation') {
      typeName = `${unionName}Input!`;
    }

    return `[${typeName}]${required ? '!' : ''}`;
  },

  handleAssociationType(attribute, rootType) {
    const { model, collection } = attribute;
    const ref = model || collection;

    if (!ref || ref === '*') {
      return rootType === 'mutation' 
        ? (model ? 'ID' : '[ID]') 
        : (model ? 'Morph' : '[Morph]');
    }

    const globalId = strapi.db.getModel(ref, attribute.plugin).globalId;
    const plural = !_.isEmpty(collection);

    if (rootType === 'mutation') {
      return '[ID]';
    }

    return plural ? `[${globalId}]` : globalId;
  }