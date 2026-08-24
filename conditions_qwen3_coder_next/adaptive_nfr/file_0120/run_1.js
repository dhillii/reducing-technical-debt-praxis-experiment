insertQuery(table, valueHash, modelAttributes, options) {
    options = options || {};
    _.defaults(options, this.options);

    const modelAttributeMap = this._buildModelAttributeMap(modelAttributes);
    const { fields, values, outputFragment, tmpTable } = this._processInsertAttributes(valueHash, modelAttributeMap, options);

    const query = this._constructInsertQuery(table, fields, values, outputFragment, tmpTable, options, modelAttributeMap);

    return _.template(query, this._templateSettings)({
      ignoreDuplicates: options.ignoreDuplicates ? this._dialect.supports.IGNORE : '',
      onConflictDoNothing: options.ignoreDuplicates ? this._dialect.supports.onConflictDoNothing : '',
      table: this.quoteTable(table),
      attributes: fields.join(','),
      output: outputFragment,
      values: values.join(','),
      tmpTable
    });
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
      tmpTable = this._getTmpTable(options, modelAttributeMap);
    }

    for (const key in valueHash) {
      if (valueHash.hasOwnProperty(key)) {
        this._processInsertField(key, valueHash[key], modelAttributeMap, fields, values);
      }
    }

    return { fields, values, outputFragment, tmpTable };
  },

  _getOutputFragment(options, modelAttributes) {
    if (this._dialect.supports.returnValues.returning) {
      return ' RETURNING *';
    }

    if (this._dialect.supports.returnValues.output) {
      if (modelAttributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
        return this._getTriggerOutputFragment(modelAttributes);
      }
      return ' OUTPUT INSERTED.*';
    }
  },

  _getTriggerOutputFragment(modelAttributes) {
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
    return ' OUTPUT ' + outputColumns + ' into @tmp';
  },

  _getTmpTable(options, modelAttributes) {
    if (modelAttributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
      return this._buildTmpTable(modelAttributes);
    }
    return '';
  },

  _buildTmpTable(modelAttributes) {
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
    return tmpTable;
  },

  _processInsertField(key, value, modelAttributeMap, fields, values) {
    fields.push(this.quoteIdentifier(key));

    if (this._isAutoIncrementField(key, modelAttributeMap, value)) {
      this._handleAutoIncrementField(key, modelAttributeMap, values);
    } else {
      values.push(this.escape(value, modelAttributeMap && modelAttributeMap[key] || undefined, { context: 'INSERT' }));
    }
  },

  _isAutoIncrementField(key, modelAttributeMap, value) {
    return modelAttributeMap && modelAttributeMap[key] && modelAttributeMap[key].autoIncrement === true && !value;
  },

  _handleAutoIncrementField(key, modelAttributeMap, values) {
    if (!this._dialect.supports.autoIncrement.defaultValue) {
      fields.splice(-1, 1);
    } else if (this._dialect.supports.DEFAULT) {
      values.push('DEFAULT');
    } else {
      values.push(this.escape(null));
    }
  },

  _constructInsertQuery(table, fields, values, outputFragment, tmpTable, options, modelAttributeMap) {
    let valueQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>';
    let emptyQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %><%= output %><%= onConflictDoNothing %>';

    if (this._dialect.supports['DEFAULT VALUES']) {
      emptyQuery += ' DEFAULT VALUES';
    } else if (this._dialect.supports['VALUES ()']) {
      emptyQuery += ' VALUES ()';
    }

    if (this._dialect.supports.returnValues && options.returning) {
      if (this._dialect.supports.returnValues.returning) {
        valueQuery += ' RETURNING *';
        emptyQuery += ' RETURNING *';
      } else if (this._dialect.supports.returnValues.output) {
        outputFragment = ' OUTPUT INSERTED.*';

        if (modelAttributeMap && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
          const tmpColumns = this._buildTmpColumns(modelAttributeMap);
          const outputColumns = this._buildOutputColumns(modelAttributeMap);
          tmpTable = 'declare @tmp table (<%= columns %>); ';
          const replacement = { columns: tmpColumns };
          tmpTable = _.template(tmpTable, this._templateSettings)(replacement).trim();
          outputFragment = ' OUTPUT ' + outputColumns + ' into @tmp';
          const selectFromTmp = ';select * from @tmp';
          valueQuery += selectFromTmp;
          emptyQuery += selectFromTmp;
        }
      }
    }

    if (this._dialect.supports.EXCEPTION && options.exception) {
      valueQuery = this._buildExceptionQuery(table, valueQuery, options);
    }

    if (this._dialect.supports['ON DUPLICATE KEY'] && options.onDuplicate) {
      valueQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
      emptyQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
    }

    const identityWrapperRequired = this._needsIdentityWrapper(fields, modelAttributeMap);

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

    if (identityWrapperRequired && this._dialect.supports.autoIncrement.identityInsert) {
      query = [
        'SET IDENTITY_INSERT', this.quoteTable(table), 'ON;',
        query,
        'SET IDENTITY_INSERT', this.quoteTable(table), 'OFF;'
      ].join(' ');
    }

    return query;
  },

  _buildTmpColumns(modelAttributes) {
    let tmpColumns = '';
    for (const modelKey in modelAttributes) {
      const attribute = modelAttributes[modelKey];
      if (!(attribute.type instanceof DataTypes.VIRTUAL)) {
        if (tmpColumns.length > 0) {
          tmpColumns += ',';
        }
        tmpColumns += this.quoteIdentifier(attribute.field) + ' ' + attribute.type.toSql();
      }
    }
    return tmpColumns;
  },

  _buildOutputColumns(modelAttributes) {
    let outputColumns = '';
    for (const modelKey in modelAttributes) {
      const attribute = modelAttributes[modelKey];
      if (!(attribute.type instanceof DataTypes.VIRTUAL)) {
        if (outputColumns.length > 0) {
          outputColumns += ',';
        }
        outputColumns += 'INSERTED.' + this.quoteIdentifier(attribute.field);
      }
    }
    return outputColumns;
  },

  _needsIdentityWrapper(fields, modelAttributeMap) {
    for (const key in modelAttributeMap) {
      if (modelAttributeMap[key] && modelAttributeMap[key].autoIncrement === true) {
        return true;
      }
    }
    return false;
  },

  _buildExceptionQuery(table, valueQuery, options) {
    if (semver.gte(this.sequelize.options.databaseVersion, '9.2.0')) {
      const delimiter = '$func_' + uuid.v4().replace(/-/g, '') + '$';
      options.exception = 'WHEN unique_violation THEN GET STACKED DIAGNOSTICS sequelize_caught_exception = PG_EXCEPTION_DETAIL;';
      return 'CREATE OR REPLACE FUNCTION pg_temp.testfunc(OUT response <%= table %>, OUT sequelize_caught_exception text) RETURNS RECORD AS ' + delimiter +
        ' BEGIN ' + valueQuery + ' INTO response; EXCEPTION ' + options.exception + ' END ' + delimiter +
        ' LANGUAGE plpgsql; SELECT (testfunc.response).*, testfunc.sequelize_caught_exception FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc()';
    } else {
      options.exception = 'WHEN unique_violation THEN NULL;';
      return 'CREATE OR REPLACE FUNCTION pg_temp.testfunc() RETURNS SETOF <%= table %> AS $body$ BEGIN RETURN QUERY ' + valueQuery + '; EXCEPTION ' + options.exception + ' END; $body$ LANGUAGE plpgsql; SELECT * FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc();';
    }
  }