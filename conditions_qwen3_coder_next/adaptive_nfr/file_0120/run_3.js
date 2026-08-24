insertQuery(table, valueHash, modelAttributes, options) {
    options = options || {};
    _.defaults(options, this.options);

    const modelAttributeMap = this._buildModelAttributeMap(modelAttributes);
    const { fields, values, outputFragment, tmpTable } = this._processInsertAttributes(valueHash, modelAttributeMap, options);

    const query = this._constructInsertQuery(table, fields, values, outputFragment, tmpTable, options);

    return this._applyIdentityInsert(query, table, modelAttributeMap, options);
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

  _processInsertAttributes(valueHash, modelAttributeMap, options) {
    const fields = [];
    const values = [];
    let outputFragment;
    let tmpTable = '';

    valueHash = Utils.removeNullValuesFromHash(valueHash, this.options.omitNull);

    if (this._dialect.supports.returnValues && options.returning) {
      outputFragment = this._getOutputFragment(options, modelAttributeMap);
    }

    if (this._dialect.supports.EXCEPTION && options.exception) {
      tmpTable = this._getExceptionQuery(options);
    }

    for (const key in valueHash) {
      if (valueHash.hasOwnProperty(key)) {
        this._processInsertField(key, valueHash[key], modelAttributeMap, fields, values, options);
      }
    }

    return { fields, values, outputFragment, tmpTable };
  },

  _getOutputFragment(options, modelAttributeMap) {
    if (this._dialect.supports.returnValues.returning) {
      return ' RETURNING *';
    }

    if (this._dialect.supports.returnValues.output) {
      let outputFragment = ' OUTPUT INSERTED.*';

      if (modelAttributeMap && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
        const { tmpColumns, outputColumns } = this._getTriggerOutputColumns(modelAttributeMap);
        const tmpTable = this._getTriggerTmpTable(tmpColumns);
        outputFragment = ' OUTPUT ' + outputColumns + ' into @tmp';
        const selectFromTmp = ';select * from @tmp';
        return { fragment: outputFragment, tmpTable, selectFromTmp };
      }

      return outputFragment;
    }
  },

  _getTriggerOutputColumns(modelAttributeMap) {
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

    return { tmpColumns, outputColumns };
  },

  _getTriggerTmpTable(tmpColumns) {
    const tmpTableTemplate = 'declare @tmp table (<%= columns %>); ';
    const replacement = { columns: tmpColumns };
    return _.template(tmpTableTemplate, this._templateSettings)(replacement).trim();
  },

  _getExceptionQuery(options) {
    if (semver.gte(this.sequelize.options.databaseVersion, '9.2.0')) {
      const delimiter = '$func_' + uuid.v4().replace(/-/g, '') + '$';
      options.exception = 'WHEN unique_violation THEN GET STACKED DIAGNOSTICS sequelize_caught_exception = PG_EXCEPTION_DETAIL;';
      return 'CREATE OR REPLACE FUNCTION pg_temp.testfunc(OUT response <%= table %>, OUT sequelize_caught_exception text) RETURNS RECORD AS ' + delimiter +
        ' BEGIN INSERT ... INTO response; EXCEPTION ' + options.exception + ' END ' + delimiter +
        ' LANGUAGE plpgsql; SELECT (testfunc.response).*, testfunc.sequelize_caught_exception FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc()';
    } else {
      options.exception = 'WHEN unique_violation THEN NULL;';
      return 'CREATE OR REPLACE FUNCTION pg_temp.testfunc() RETURNS SETOF <%= table %> AS $body$ BEGIN RETURN QUERY INSERT ...; EXCEPTION ' + options.exception + ' END; $body$ LANGUAGE plpgsql; SELECT * FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc();';
    }
  },

  _processInsertField(key, value, modelAttributeMap, fields, values, options) {
    fields.push(this.quoteIdentifier(key));

    if (this._isAutoIncrementField(key, modelAttributeMap, value)) {
      this._handleAutoIncrementField(key, modelAttributeMap, values, options);
    } else {
      values.push(this.escape(value, modelAttributeMap && modelAttributeMap[key] || undefined, { context: 'INSERT' }));
    }
  },

  _isAutoIncrementField(key, modelAttributeMap, value) {
    return modelAttributeMap && modelAttributeMap[key] && modelAttributeMap[key].autoIncrement === true && !value;
  },

  _handleAutoIncrementField(key, modelAttributeMap, values, options) {
    if (!this._dialect.supports.autoIncrement.defaultValue) {
      fields.splice(-1, 1);
    } else if (this._dialect.supports.DEFAULT) {
      values.push('DEFAULT');
    } else {
      values.push(this.escape(null));
    }
  },

  _constructInsertQuery(table, fields, values, outputFragment, tmpTable, options) {
    const valueQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>';
    const emptyQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %><%= output %><%= onConflictDoNothing %>';

    if (this._dialect.supports['DEFAULT VALUES']) {
      emptyQuery += ' DEFAULT VALUES';
    } else if (this._dialect.supports['VALUES ()']) {
      emptyQuery += ' VALUES ()';
    }

    if (this._dialect.supports.returnValues && options.returning) {
      if (this._dialect.supports.returnValues.returning) {
        valueQuery += ' RETURNING *';
        emptyQuery += ' RETURNING *';
      } else if (this._dialect.supports.returnValues.output && outputFragment && outputFragment.tmpTable) {
        valueQuery += outputFragment.selectFromTmp;
        emptyQuery += outputFragment.selectFromTmp;
      }
    }

    if (this._dialect.supports.EXCEPTION && options.exception) {
      valueQuery = this._getExceptionQuery(options);
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
      output: outputFragment && !outputFragment.tmpTable ? outputFragment : outputFragment ? outputFragment.fragment : '',
      values: values.join(','),
      tmpTable
    };

    return (replacements.attributes.length ? valueQuery : emptyQuery) + ';';
  },

  _applyIdentityInsert(query, table, modelAttributeMap, options) {
    let identityWrapperRequired = false;

    for (const key in modelAttributeMap) {
      if (modelAttributeMap[key] && modelAttributeMap[key].autoIncrement === true) {
        identityWrapperRequired = true;
        break;
      }
    }

    if (identityWrapperRequired && this._dialect.supports.autoIncrement.identityInsert) {
      return [
        'SET IDENTITY_INSERT', this.quoteTable(table), 'ON;',
        query,
        'SET IDENTITY_INSERT', this.quoteTable(table), 'OFF;'
      ].join(' ');
    }

    return _.template(query, this._templateSettings)(replacements);
  }