insertQuery(table, valueHash, modelAttributes, options) {
    options = options || {};
    _.defaults(options, this.options);

    const modelAttributeMap = this._getModelAttributeMap(modelAttributes);
    const {
      fields,
      values,
      identityWrapperRequired
    } = this._processInsertValues(valueHash, modelAttributeMap, options);

    const {
      valueQuery,
      emptyQuery,
      tmpTable,
      outputFragment
    } = this._prepareInsertQueries(options, modelAttributes);

    if (this._dialect.supports.EXCEPTION && options.exception) {
      return this._wrapInExceptionHandling(valueQuery, emptyQuery, table, options);
    }

    if (this._dialect.supports['ON DUPLICATE KEY'] && options.onDuplicate) {
      valueQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
      emptyQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
    }

    const replacements = {
      ignoreDuplicates: options.ignoreDuplicates ? this._dialect.supports.IGNORE : '',
      onConflictDoNothing: options.ignoreDuplicates ? this._dialect.supports.onConflictDoNothing : '',
      table: this.quoteTable(table),
      attributes: fields.join(','),
      output: outputFragment,
      values: values.join(','),
      tmpTable
    };

    let query = (replacements.attributes.length ? valueQuery : emptyQuery) + ';';
    return this._finalizeInsertQuery(query, identityWrapperRequired, table, options);
  },

  _getModelAttributeMap(modelAttributes) {
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

  _processInsertValues(valueHash, modelAttributeMap, options) {
    const fields = [];
    const values = [];
    let identityWrapperRequired = false;

    valueHash = Utils.removeNullValuesFromHash(valueHash, this.options.omitNull);
    for (const key in valueHash) {
      if (valueHash.hasOwnProperty(key)) {
        const value = valueHash[key];
        fields.push(this.quoteIdentifier(key));

        if (this._shouldHandleDefaultValue(key, value, modelAttributeMap)) {
          this._handleDefaultValue(fields, values, modelAttributeMap, key, value);
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

  _shouldHandleDefaultValue(key, value, modelAttributeMap) {
    return modelAttributeMap && modelAttributeMap[key] &&
           modelAttributeMap[key].autoIncrement === true &&
           !value;
  },

  _handleDefaultValue(fields, values, modelAttributeMap, key, value) {
    if (!this._dialect.supports.autoIncrement.defaultValue) {
      fields.splice(-1, 1);
    } else if (this._dialect.supports.DEFAULT) {
      values.push('DEFAULT');
    } else {
      values.push(this.escape(null));
    }
  },

  _prepareInsertQueries(options, modelAttributes) {
    let valueQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>';
    let emptyQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %><%= output %><%= onConflictDoNothing %>';
    let outputFragment;
    let tmpTable = '';

    if (this._dialect.supports['DEFAULT VALUES']) {
      emptyQuery += ' DEFAULT VALUES';
    } else if (this._dialect.supports['VALUES ()']) {
      emptyQuery += ' VALUES ()';
    }

    if (this._dialect.supports.returnValues && options.returning) {
      outputFragment = this._getOutputFragment(options, modelAttributes, tmpTable);
      tmpTable = this._getTmpTable(options, modelAttributes, tmpTable);
    }

    return { valueQuery, emptyQuery, outputFragment, tmpTable };
  },

  _getOutputFragment(options, modelAttributes, tmpTable) {
    if (this._dialect.supports.returnValues.returning) {
      return '';
    } else if (this._dialect.supports.returnValues.output) {
      const { tmpColumns, outputColumns } = this._buildColumnLists(modelAttributes);
      
      if (modelAttributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
        tmpTable = 'declare @tmp table (' + tmpColumns + '); ';
        return ' OUTPUT ' + outputColumns + ' into @tmp';
      }
      return ' OUTPUT INSERTED.*';
    }
    return '';
  },

  _getTmpTable(options, modelAttributes, tmpTable) {
    if (modelAttributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
      const { tmpColumns } = this._buildColumnLists(modelAttributes);
      return 'declare @tmp table (' + tmpColumns + '); ';
    }
    return tmpTable;
  },

  _buildColumnLists(modelAttributes) {
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
    
    return { tmpColumns, outputColumns };
  },

  _wrapInExceptionHandling(valueQuery, emptyQuery, table, options) {
    if (semver.gte(this.sequelize.options.databaseVersion, '9.2.0')) {
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
  },

  _finalizeInsertQuery(query, identityWrapperRequired, table, options) {
    if (identityWrapperRequired && this._dialect.supports.autoIncrement.identityInsert) {
      query = [
        'SET IDENTITY_INSERT', this.quoteTable(table), 'ON;',
        query,
        'SET IDENTITY_INSERT', this.quoteTable(table), 'OFF;'
      ].join(' ');
    }

    return _.template(query, this._templateSettings)({
      ignoreDuplicates: options.ignoreDuplicates ? this._dialect.supports.IGNORE : '',
      onConflictDoNothing: options.ignoreDuplicates ? this._dialect.supports.onConflictDoNothing : '',
      table: this.quoteTable(table),
      attributes: '',
      output: '',
      values: '',
      tmpTable: ''
    });
  }