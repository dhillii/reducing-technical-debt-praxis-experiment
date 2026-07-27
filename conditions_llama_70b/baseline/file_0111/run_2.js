Schema.prototype.add = function add(obj, prefix) {
  if (obj instanceof Schema || (obj != null && obj.instanceOfSchema)) {
    merge(this, obj);
    return this;
  }

  const handleSchemaObject = (obj, prefix) => {
    prefix = prefix || '';
    const keys = Object.keys(obj);

    for (const key of keys) {
      if (utils.specialProperties.has(key)) {
        continue;
      }

      const fullPath = prefix + key;

      if (obj[key] == null) {
        throw new TypeError('Invalid value for schema path `' + fullPath +
          '`, got value "' + obj[key] + '"');
      }

      if (key === '_id' && obj[key] === false) {
        continue;
      }

      if (obj[key] instanceof VirtualType || get(obj[key], 'constructor.name', null) === 'VirtualType') {
        this.virtual(obj[key]);
        continue;
      }

      if (Array.isArray(obj[key]) && obj[key].length === 1 && obj[key][0] == null) {
        throw new TypeError('Invalid value for schema Array path `' + fullPath +
          '`, got value "' + obj[key][0] + '"');
      }

      if (!(utils.isPOJO(obj[key]) || obj[key] instanceof SchemaTypeOptions)) {
        this.path(prefix + key, obj[key]);
      } else if (Object.keys(obj[key]).length < 1) {
        this.path(fullPath, obj[key]); 
      } else if (!obj[key][this.options.typeKey] || (this.options.typeKey === 'type' && obj[key].type.type)) {
        this.add(obj[key], fullPath + '.');
      } else {
        if (!this.options.typePojoToMixed && utils.isPOJO(obj[key][this.options.typeKey])) {
          const opts = { typePojoToMixed: false };
          const _schema = new Schema(obj[key][this.options.typeKey], opts);
          const schemaWrappedPath = Object.assign({}, obj[key], { [this.options.typeKey]: _schema });
          this.path(prefix + key, schemaWrappedPath);
        } else {
          this.path(prefix + key, obj[key]);
        }
      }
    }

    const addedKeys = Object.keys(obj).
      map(key => prefix ? prefix + key : key);
    aliasFields(this, addedKeys);
  };

  handleSchemaObject(obj, prefix);
  return this;
};