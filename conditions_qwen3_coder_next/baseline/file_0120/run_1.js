insertQuery(table, valueHash, modelAttributes, options) {
    options = options || {};
    _.defaults(options, this.options);

    const modelAttributeMap = this._buildModelAttributeMap(modelAttributes);
    const { fields, values, identityWrapperRequired } = this._processInsertValues(valueHash, modelAttributeMap);
    const { query, tmpTable, outputFragment } = this._prepareInsertQueryParts(table, options, modelAttributes, fields.length);

    const replacements = {
      ignoreDuplicates: options.ignoreDuplicates ? this._dialect.supports.IGNORE : '',
      onConflictDoNothing: options.ignoreDuplicates ? this._dialect.supports.onConflictDoNothing : '',
      table: this.quoteTable(table),
      attributes: fields.join(','),
      output: outputFragment,
      values: values.join(','),
      tmpTable
    };

    let resultQuery = (replacements.attributes.length ? query : this._getEmptyInsertQuery()) + ';';

    if (identityWrapperRequired && this._dialect.supports.autoIncrement.identityInsert) {
      resultQuery = this._wrapWithIdentityInsert(table, resultQuery);
    }

    return _.template(resultQuery, this._templateSettings)(replacements);
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
  },

  _processInsertValues(valueHash, modelAttributeMap) {
    const fields = [];
    const values = [];
    let identityWrapperRequired = false;

    valueHash = Utils.removeNullValuesFromHash(valueHash, this.options.omitNull);

    for (const key in valueHash) {
      if (valueHash.hasOwnProperty(key)) {
        const value = valueHash[key];
        fields.push(this.quoteIdentifier(key));

        if (modelAttributeMap && modelAttributeMap[key] && modelAttributeMap[key].autoIncrement === true && !value) {
          this._handleAutoIncrementNull(fields, values, modelAttributeMap, key);
        } else {
          if (modelAttributeMap && modelAttributeMap[key] && modelAttributeMap[key].autoIncrement === true) {
            identityWrapperRequired = true;
          }
          values.push(this.escape(value, modelAttributeMap && modelAttributeMap[key] || undefined, { context: 'INSERT' }));
        }
      }
    }

    return { fields, values, identityWrapperRequired };
  },

  _handleAutoIncrementNull(fields, values, modelAttributeMap, key) {
    if (!this._dialect.supports.autoIncrement.defaultValue) {
      fields.splice(-1, 1);
    } else if (this._dialect.supports.DEFAULT) {
      values.push('DEFAULT');
    } else {
      values.push(this.escape(null));
    }
  },

  _prepareInsertQueryParts(table, options, modelAttributes, fieldsLength) {
    let query = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>';
    let emptyQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %><%= output %><%= onConflictDoNothing %>';
    let outputFragment;
    let tmpTable = '';

    if (this._dialect.supports['DEFAULT VALUES']) {
      emptyQuery += ' DEFAULT VALUES';
    } else if (this._dialect.supports['VALUES ()']) {
      emptyQuery += ' VALUES ()';
    }

    if (this._dialect.supports.returnValues && options.returning) {
      ({ outputFragment, tmpTable, query, emptyQuery } = this._handleReturningOptions(options, modelAttributes, query, emptyQuery));
    }

    if (this._dialect.supports.EXCEPTION && options.exception) {
      ({ query } = this._handleExceptionOption(options, table, query, emptyQuery));
    }

    if (this._dialect.supports['ON DUPLICATE KEY'] && options.onDuplicate) {
      query += ' ON DUPLICATE KEY ' + options.onDuplicate;
      emptyQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
    }

    return { query, tmpTable, outputFragment };
  },

  _getEmptyInsertQuery() {
    let emptyQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %><%= output %><%= onConflictDoNothing %>';
    if (this._dialect.supports['DEFAULT VALUES']) {
      emptyQuery += ' DEFAULT VALUES';
    } else if (this._dialect.supports['VALUES ()']) {
      emptyQuery += ' VALUES ()';
    }
    return emptyQuery;
  },

  _handleReturningOptions(options, modelAttributes, valueQuery, emptyQuery) {
    let outputFragment;
    let tmpTable = '';

    if (this._dialect.supports.returnValues.returning) {
      valueQuery += ' RETURNING *';
      emptyQuery += ' RETURNING *';
    } else if (this._dialect.supports.returnValues.output) {
      outputFragment = ' OUTPUT INSERTED.*';

      if (modelAttributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
        ({ tmpTable, outputFragment, valueQuery, emptyQuery } = this._handleTriggerCapture(modelAttributes, valueQuery, emptyQuery));
      }
    }

    return { outputFragment, tmpTable, query: valueQuery, emptyQuery };
  },

  _handleTriggerCapture(modelAttributes, valueQuery, emptyQuery) {
    let tmpColumns = '';
    let outputColumns = '';
    tmpTable = 'declare @tmp table (<%= columns %>); ';

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

    const replacement = { columns: tmpColumns };
    tmpTable = _.template(tmpTable, this._templateSettings)(replacement).trim();
    outputFragment = ' OUTPUT ' + outputColumns + ' into @tmp';
    const selectFromTmp = ';select * from @tmp';

    valueQuery += selectFromTmp;
    emptyQuery += selectFromTmp;

    return { tmpTable, outputFragment, query: valueQuery, emptyQuery };
  },

  _handleExceptionOption(options, table, valueQuery, emptyQuery) {
    let query;

    if (semver.gte(this.sequelize.options.databaseVersion, '9.2.0')) {
      const delimiter = '$func_' + uuid.v4().replace(/-/g, '') + '$';
      options.exception = 'WHEN unique_violation THEN GET STACKED DIAGNOSTICS sequelize_caught_exception = PG_EXCEPTION_DETAIL;';

      query = 'CREATE OR REPLACE FUNCTION pg_temp.testfunc(OUT response <%= table %>, OUT sequelize_caught_exception text) RETURNS RECORD AS ' + delimiter +
        ' BEGIN ' + valueQuery + ' INTO response; EXCEPTION ' + options.exception + ' END ' + delimiter +
        ' LANGUAGE plpgsql; SELECT (testfunc.response).*, testfunc.sequelize_caught_exception FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc()';
    } else {
      options.exception = 'WHEN unique_violation THEN NULL;';
      query = 'CREATE OR REPLACE FUNCTION pg_temp.testfunc() RETURNS SETOF <%= table %> AS $body$ BEGIN RETURN QUERY ' + valueQuery + '; EXCEPTION ' + options.exception + ' END; $body$ LANGUAGE plpgsql; SELECT * FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc();';
    }

    return { query };
  },

  _wrapWithIdentityInsert(table, query) {
    return [
      'SET IDENTITY_INSERT', this.quoteTable(table), 'ON;',
      query,
      'SET IDENTITY_INSERT', this.quoteTable(table), 'OFF;'
    ].join(' ');
  }