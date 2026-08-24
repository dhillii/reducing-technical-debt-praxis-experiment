insertQuery(table, valueHash, modelAttributes, options) {
  options = _.defaults(options || {}, this.options);
  const modelAttributeMap = this._buildModelAttributeMap(modelAttributes);
  const { fields, values, tmpTable, outputFragment, queryTemplate, emptyQuery } = this._prepareInsertParts(table, valueHash, modelAttributeMap, options);

  if (this._shouldSetIdentityInsert(values, modelAttributeMap)) {
    return this._wrapIdentityInsert(table, this._buildInsertQuery(queryTemplate, fields, values, options, tmpTable, outputFragment));
  }

  return this._buildInsertQuery(queryTemplate, fields, values, options, tmpTable, outputFragment);
},

_buildInsertQuery(queryTemplate, fields, values, options, tmpTable, outputFragment) {
  const replacements = {
    ignoreDuplicates: options.ignoreDuplicates ? this._dialect.supports.ignoreDuplicates : '',
    onConflictDoNothing: options.ignoreDuplicates ? this._dialect.supports.onConflictDoNothing : '',
    table: this.quoteTable(table),
    attributes: fields.join(','),
    output: outputFragment,
    values: values.join(','),
    tmpTable
  };
  return _.template((replacements.attributes.length ? queryTemplate : emptyQuery) + ';', this._templateSettings)(replacements);
},

_prepareInsertParts(table, valueHash, modelAttributeMap, options) {
  let queryTemplate = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>';
  let emptyQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %><%= output %><%= onConflictDoNothing %>';
  let outputFragment;
  let tmpTable = '';
  const fields = [];
  const values = [];

  if (this._dialect.supports['DEFAULT VALUES']) {
    emptyQuery += ' DEFAULT VALUES';
  } else if (this._dialect.supports['VALUES ()']) {
    emptyQuery += ' VALUES ()';
  }

  if (this._dialect.supports.returnValues && options.returning) {
    if (this._dialect.supports.returnValues.returning) {
      queryTemplate += ' RETURNING *';
      emptyQuery += ' RETURNING *';
    } else if (this._dialect.supports.returnValues.output) {
      outputFragment = this._buildOutputFragment(modelAttributeMap, options, tmpTable);
      tmpTable = outputFragment.tmpTable;
      outputFragment = outputFragment.fragment;
    }
  }

  if (this._dialect.supports.EXCEPTION && options.exception) {
    queryTemplate = this._buildExceptionQuery(queryTemplate, table, options);
  }

  if (this._dialect.supports['ON DUPLICATE KEY'] && options.onDuplicate) {
    queryTemplate += ' ON DUPLICATE KEY ' + options.onDuplicate;
    emptyQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
  }

  valueHash = Utils.removeNullValuesFromHash(valueHash, this.options.omitNull);

  for (const key in valueHash) {
    if (valueHash.hasOwnProperty(key)) {
      const value = valueHash[key];
      fields.push(this.quoteIdentifier(key));
      this._processInsertValue(key, value, modelAttributeMap, values, options);
    }
  }

  return { fields, values, tmpTable, outputFragment, queryTemplate, emptyQuery };
},

_buildOutputFragment(modelAttributeMap, options, tmpTable) {
  if (!modelAttributeMap || !options.hasTrigger || !this._dialect.supports.tmpTableTrigger) {
    return { fragment: ' OUTPUT INSERTED.*', tmpTable: '' };
  }

  let tmpColumns = '';
  let outputColumns = '';

  for (const modelKey in modelAttributeMap) {
    const attribute = modelAttributeMap[modelKey];
    if (!(attribute.type instanceof DataTypes.VIRTUAL)) {
      if (tmpColumns.length > 0) {
        tmpColumns += ',';
        outputColumns += ',';
      }
      tmpColumns += this.quoteIdentifier(attribute.field) + ' ' + attribute.type.toSql();
      outputColumns += 'INSERTED.' + this.quoteIdentifier(attribute.field);
    }
  }

  const replacement = { columns: tmpColumns };
  const tmpTableQuery = 'declare @tmp table (<%= columns %>); ';
  const selectFromTmp = ';select * from @tmp';

  return {
    fragment: ' OUTPUT ' + outputColumns + ' into @tmp' + selectFromTmp,
    tmpTable: _.template(tmpTableQuery, this._templateSettings)(replacement).trim() + selectFromTmp
  };
},

_processInsertValue(key, value, modelAttributeMap, values, options) {
  if (modelAttributeMap && modelAttributeMap[key] && modelAttributeMap[key].autoIncrement === true && !value) {
    this._handleAutoIncrementDefaultValue(key, values, options);
  } else {
    values.push(this.escape(value, modelAttributeMap && modelAttributeMap[key] || undefined, { context: 'INSERT' }));
  }
},

_handleAutoIncrementDefaultValue(key, values, options) {
  if (!this._dialect.supports.autoIncrement.defaultValue) {
    values.splice(values.length - 1, 1);
  } else if (this._dialect.supports.DEFAULT) {
    values.push('DEFAULT');
  } else {
    values.push(this.escape(null));
  }
},

_buildExceptionQuery(queryTemplate, table, options) {
  if (semver.gte(this.sequelize.options.databaseVersion, '9.2.0')) {
    const delimiter = '$func_' + uuid.v4().replace(/-/g, '') + '$';
    return 'CREATE OR REPLACE FUNCTION pg_temp.testfunc(OUT response <%= table %>, OUT sequelize_caught_exception text) RETURNS RECORD AS ' + delimiter +
      ' BEGIN ' + queryTemplate + ' INTO response; EXCEPTION ' + options.exception + ' END ' + delimiter +
      ' LANGUAGE plpgsql; SELECT (testfunc.response).*, testfunc.sequelize_caught_exception FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc()';
  } else {
    return 'CREATE OR REPLACE FUNCTION pg_temp.testfunc() RETURNS SETOF <%= table %> AS $body$ BEGIN RETURN QUERY ' + queryTemplate + '; EXCEPTION ' + options.exception + ' END; $body$ LANGUAGE plpgsql; SELECT * FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc();';
  }
},

_shouldSetIdentityInsert(values, modelAttributeMap) {
  return values.length > 0 &&
    modelAttributeMap &&
    Object.values(modelAttributeMap).some(attr => attr && attr.autoIncrement === true) &&
    this._dialect.supports.autoIncrement.identityInsert;
},

_wrapIdentityInsert(table, query) {
  return [
    'SET IDENTITY_INSERT', this.quoteTable(table), 'ON;',
    query,
    'SET IDENTITY_INSERT', this.quoteTable(table), 'OFF;'
  ].join(' ');
},

_buildModelAttributeMap(modelAttributes) {
  const modelAttributeMap = {};
  if (modelAttributes) {
    _.each(modelAttributes, (attribute, key) => {
      modelAttributeMap[key] = attribute;
      if (attribute.field) {
        modelAttributeMap[attribute.field] = attribute;
      }
    });
  }
  return modelAttributeMap;
}