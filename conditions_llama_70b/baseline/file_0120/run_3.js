insertQuery(table, valueHash, modelAttributes, options) {
  options = options || {};
  _.defaults(options, this.options);

  const queryGenerator = {
    modelAttributeMap: {},
    fields: [],
    values: [],
    query: '',
    valueQuery: '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>',
    emptyQuery: '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %><%= output %><%= onConflictDoNothing %>',
    outputFragment: '',
    identityWrapperRequired: false,
    tmpTable: ''
  };

  if (modelAttributes) {
    _.each(modelAttributes, (attribute, key) => {
      queryGenerator.modelAttributeMap[key] = attribute;
      if (attribute.field) {
        queryGenerator.modelAttributeMap[attribute.field] = attribute;
      }
    });
  }

  if (this._dialect.supports['DEFAULT VALUES']) {
    queryGenerator.emptyQuery += ' DEFAULT VALUES';
  } else if (this._dialect.supports['VALUES ()']) {
    queryGenerator.emptyQuery += ' VALUES ()';
  }

  if (this._dialect.supports.returnValues && options.returning) {
    if (this._dialect.supports.returnValues.returning) {
      queryGenerator.valueQuery += ' RETURNING *';
      queryGenerator.emptyQuery += ' RETURNING *';
    } else if (this._dialect.supports.returnValues.output) {
      queryGenerator.outputFragment = ' OUTPUT INSERTED.*';

      if (modelAttributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
        let tmpColumns = '';
        let outputColumns = '';
        queryGenerator.tmpTable = 'declare @tmp table (<%= columns %>); ';

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

        queryGenerator.tmpTable = _.template(queryGenerator.tmpTable, this._templateSettings)(replacement).trim();
        queryGenerator.outputFragment = ' OUTPUT ' + outputColumns + ' into @tmp';
        const selectFromTmp = ';select * from @tmp';

        queryGenerator.valueQuery += selectFromTmp;
        queryGenerator.emptyQuery += selectFromTmp;
      }
    }
  }

  if (this._dialect.supports.EXCEPTION && options.exception) {
    if (semver.gte(this.sequelize.options.databaseVersion, '9.2.0')) {
      const delimiter = '$func_' + uuid.v4().replace(/-/g, '') + '$';

      options.exception = 'WHEN unique_violation THEN GET STACKED DIAGNOSTICS sequelize_caught_exception = PG_EXCEPTION_DETAIL;';
      queryGenerator.valueQuery = 'CREATE OR REPLACE FUNCTION pg_temp.testfunc(OUT response <%= table %>, OUT sequelize_caught_exception text) RETURNS RECORD AS ' + delimiter +
        ' BEGIN ' + queryGenerator.valueQuery + ' INTO response; EXCEPTION ' + options.exception + ' END ' + delimiter +
        ' LANGUAGE plpgsql; SELECT (testfunc.response).*, testfunc.sequelize_caught_exception FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc()';
    } else {
      options.exception = 'WHEN unique_violation THEN NULL;';
      queryGenerator.valueQuery = 'CREATE OR REPLACE FUNCTION pg_temp.testfunc() RETURNS SETOF <%= table %> AS $body$ BEGIN RETURN QUERY ' + queryGenerator.valueQuery + '; EXCEPTION ' + options.exception + ' END; $body$ LANGUAGE plpgsql; SELECT * FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc();';
    }
  }

  if (this._dialect.supports['ON DUPLICATE KEY'] && options.onDuplicate) {
    queryGenerator.valueQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
    queryGenerator.emptyQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
  }

  valueHash = Utils.removeNullValuesFromHash(valueHash, this.options.omitNull);
  for (const key in valueHash) {
    if (valueHash.hasOwnProperty(key)) {
      const value = valueHash[key];
      queryGenerator.fields.push(this.quoteIdentifier(key));

      if (queryGenerator.modelAttributeMap && queryGenerator.modelAttributeMap[key] && queryGenerator.modelAttributeMap[key].autoIncrement === true && !value) {
        if (!this._dialect.supports.autoIncrement.defaultValue) {
          queryGenerator.fields.splice(-1, 1);
        } else if (this._dialect.supports.DEFAULT) {
          queryGenerator.values.push('DEFAULT');
        } else {
          queryGenerator.values.push(this.escape(null));
        }
      } else {
        if (queryGenerator.modelAttributeMap && queryGenerator.modelAttributeMap[key] && queryGenerator.modelAttributeMap[key].autoIncrement === true) {
          queryGenerator.identityWrapperRequired = true;
        }

        queryGenerator.values.push(this.escape(value, queryGenerator.modelAttributeMap && queryGenerator.modelAttributeMap[key] || undefined, { context: 'INSERT' }));
      }
    }
  }

  const replacements = {
    ignoreDuplicates: options.ignoreDuplicates ? this._dialect.supports.IGNORE : '',
    onConflictDoNothing: options.ignoreDuplicates ? this._dialect.supports.onConflictDoNothing : '',
    table: this.quoteTable(table),
    attributes: queryGenerator.fields.join(','),
    output: queryGenerator.outputFragment,
    values: queryGenerator.values.join(','),
    tmpTable: queryGenerator.tmpTable
  };

  queryGenerator.query = (replacements.attributes.length ? queryGenerator.valueQuery : queryGenerator.emptyQuery) + ';';
  if (queryGenerator.identityWrapperRequired && this._dialect.supports.autoIncrement.identityInsert) {
    queryGenerator.query = [
      'SET IDENTITY_INSERT', this.quoteTable(table), 'ON;',
      queryGenerator.query,
      'SET IDENTITY_INSERT', this.quoteTable(table), 'OFF;'
    ].join(' ');
  }

  return _.template(queryGenerator.query, this._templateSettings)(replacements);
}