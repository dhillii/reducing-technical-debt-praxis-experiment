/**
 * Returns an insert into command. Parameters: table name + hash of attribute-value-pairs.
 * @private
 */
insertQuery(table, valueHash, modelAttributes, options) {
  options = options || {};
  _.defaults(options, this.options);

  if (!modelAttributes) {
    return this._insertQueryWithoutModelAttributes(table, valueHash, options);
  }

  const modelAttributeMap = this._createModelAttributeMap(modelAttributes);
  const fields = [];
  const values = [];
  let query;
  let valueQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>';
  let emptyQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %><%= output %><%= onConflictDoNothing %>';
  let outputFragment;
  let identityWrapperRequired = false;
  let tmpTable = '';         //tmpTable declaration for trigger

  if (this._dialect.supports['DEFAULT VALUES']) {
    emptyQuery += ' DEFAULT VALUES';
  } else if (this._dialect.supports['VALUES ()']) {
    emptyQuery += ' VALUES ()';
  }

  if (this._dialect.supports.returnValues && options.returning) {
    outputFragment = this._getOutputFragment(options, modelAttributes, tmpTable);
  }

  if (this._dialect.supports.EXCEPTION && options.exception) {
    valueQuery = this._getExceptionQuery(options, valueQuery);
  }

  if (this._dialect.supports['ON DUPLICATE KEY'] && options.onDuplicate) {
    valueQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
    emptyQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
  }

  valueHash = Utils.removeNullValuesFromHash(valueHash, this.options.omitNull);
  this._populateFieldsAndValues(modelAttributeMap, fields, values, valueHash);

  const replacements = {
    ignoreDuplicates: options.ignoreDuplicates ? this._dialect.supports.IGNORE : '',
    onConflictDoNothing: options.ignoreDuplicates ? this._dialect.supports.onConflictDoNothing : '',
    table: this.quoteTable(table),
    attributes: fields.join(','),
    output: outputFragment,
    values: values.join(','),
    tmpTable
  };

  query = (replacements.attributes.length ? valueQuery : emptyQuery) + ';';
  if (identityWrapperRequired && this._dialect.supports.autoIncrement.identityInsert) {
    query = [
      'SET IDENTITY_INSERT', this.quoteTable(table), 'ON;',
      query,
      'SET IDENTITY_INSERT', this.quoteTable(table), 'OFF;'
    ].join(' ');
  }

  return _.template(query, this._templateSettings)(replacements);
}

_createModelAttributeMap(modelAttributes) {
  const modelAttributeMap = {};
  _.each(modelAttributes, (attribute, key) => {
    modelAttributeMap[key] = attribute;
    if (attribute.field) {
      modelAttributeMap[attribute.field] = attribute;
    }
  });
  return modelAttributeMap;
}

_insertQueryWithoutModelAttributes(table, valueHash, options) {
  const fields = [];
  const values = [];
  let query;
  let valueQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>';
  let emptyQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %><%= output %><%= onConflictDoNothing %>';
  let outputFragment;
  let tmpTable = '';         //tmpTable declaration for trigger

  if (this._dialect.supports['DEFAULT VALUES']) {
    emptyQuery += ' DEFAULT VALUES';
  } else if (this._dialect.supports['VALUES ()']) {
    emptyQuery += ' VALUES ()';
  }

  if (this._dialect.supports.returnValues && options.returning) {
    outputFragment = this._getOutputFragment(options, null, tmpTable);
  }

  if (this._dialect.supports.EXCEPTION && options.exception) {
    valueQuery = this._getExceptionQuery(options, valueQuery);
  }

  if (this._dialect.supports['ON DUPLICATE KEY'] && options.onDuplicate) {
    valueQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
    emptyQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
  }

  valueHash = Utils.removeNullValuesFromHash(valueHash, this.options.omitNull);
  this._populateFieldsAndValues(null, fields, values, valueHash);

  const replacements = {
    ignoreDuplicates: options.ignoreDuplicates ? this._dialect.supports.IGNORE : '',
    onConflictDoNothing: options.ignoreDuplicates ? this._dialect.supports.onConflictDoNothing : '',
    table: this.quoteTable(table),
    attributes: fields.join(','),
    output: outputFragment,
    values: values.join(','),
    tmpTable
  };

  query = (replacements.attributes.length ? valueQuery : emptyQuery) + ';';

  return _.template(query, this._templateSettings)(replacements);
}

_getOutputFragment(options, modelAttributes, tmpTable) {
  let outputFragment;
  if (this._dialect.supports.returnValues.returning) {
    outputFragment = ' RETURNING *';
  } else if (this._dialect.supports.returnValues.output) {
    outputFragment = ' OUTPUT INSERTED.*';

    //To capture output rows when there is a trigger on MSSQL DB
    if (modelAttributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
      tmpTable = 'declare @tmp table (<%= columns %>); ';
      let tmpColumns = '';
      let outputColumns = '';
      for (const modelKey in modelAttributes) {
        const attribute = modelAttributes[modelKey];
        if (!(attribute.type instanceof DataTypes.VIRTUAL)) {
          if (tmpColumns.length > 0) {
            tmpColumns += ',';
            outputColumns += ',';
          }

          tmpColumns += this.quoteIdentifier(attribute.field) + ' ' + attribute.type.toSql();
          outputColumns += 'INSERTED.' + this.quoteIdentifier(attribute.field);
        }
      }

      const replacement = {
        columns: tmpColumns
      };

      tmpTable = _.template(tmpTable, this._templateSettings)(replacement).trim();
      outputFragment = ' OUTPUT ' + outputColumns + ' into @tmp';
      const selectFromTmp = ';select * from @tmp';

      return outputFragment + selectFromTmp;
    }
  }
  return outputFragment;
}

_getExceptionQuery(options, valueQuery) {
  if (semver.gte(this.sequelize.options.databaseVersion, '9.2.0')) {
    // >= 9.2 - Use a UUID but prefix with 'func_' (numbers first not allowed)
    const delimiter = '$func_' + uuid.v4().replace(/-/g, '') + '$';

    options.exception = 'WHEN unique_violation THEN GET STACKED DIAGNOSTICS sequelize_caught_exception = PG_EXCEPTION_DETAIL;';
    valueQuery = 'CREATE OR REPLACE FUNCTION pg_temp.testfunc(OUT response <%= table %>, OUT sequelize_caught_exception text) RETURNS RECORD AS ' + delimiter +
      ' BEGIN ' + valueQuery + ' INTO response; EXCEPTION ' + options.exception + ' END ' + delimiter +
      ' LANGUAGE plpgsql; SELECT (testfunc.response).*, testfunc.sequelize_caught_exception FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc()';
  } else {
    options.exception = 'WHEN unique_violation THEN NULL;';
    valueQuery = 'CREATE OR REPLACE FUNCTION pg_temp.testfunc() RETURNS SETOF <%= table %> AS $body$ BEGIN RETURN QUERY ' + valueQuery + '; EXCEPTION ' + options.exception + ' END; $body$ LANGUAGE plpgsql; SELECT * FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc();';
  }
  return valueQuery;
}

_populateFieldsAndValues(modelAttributeMap, fields, values, valueHash) {
  for (const key in valueHash) {
    if (valueHash.hasOwnProperty(key)) {
      const value = valueHash[key];
      fields.push(this.quoteIdentifier(key));

      // SERIALS' can't be NULL in postgresql, use DEFAULT where supported
      if (modelAttributeMap && modelAttributeMap[key] && modelAttributeMap[key].autoIncrement === true && !value) {
        if (!this._dialect.supports.autoIncrement.defaultValue) {
          fields.splice(-1, 1);
        } else if (this._dialect.supports.DEFAULT) {
          values.push('DEFAULT');
        } else {
          values.push(this.escape(null));
        }
      } else {
        if (modelAttributeMap && modelAttributeMap[key] && modelAttributeMap[key].autoIncrement === true) {
          // TODO: check if this is the correct place to set identityWrapperRequired
          // identityWrapperRequired = true;
        }

        values.push(this.escape(value, modelAttributeMap && modelAttributeMap[key] || undefined, { context: 'INSERT' }));
      }
    }
  }
}