insertQuery(table, valueHash, modelAttributes, options) {
    options = options || {};
    _.defaults(options, this.options);

    const modelAttributeMap = this._buildModelAttributeMap(modelAttributes);
    const { fields, values, outputFragment, tmpTable } = this._processInsertAttributes(valueHash, modelAttributeMap, options);

    const query = this._constructInsertQuery(table, fields, values, outputFragment, tmpTable, options, modelAttributes);

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

  _getOutputFragment(options, modelAttributeMap) {
    if (this._dialect.supports.returnValues.returning) {
      return ' RETURNING *';
    }

    if (this._dialect.supports.returnValues.output) {
      if (modelAttributeMap && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
        return this._getMssqlOutputFragment(modelAttributeMap);
      }
      return ' OUTPUT INSERTED.*';
    }
  },

  _getMssqlOutputFragment(modelAttributeMap) {
    let tmpColumns = '';
    let outputColumns = '';
    let tmpTable = 'declare @tmp table (<%= columns %>); ';

    for (const modelKey in modelAttributeMap) {
      const attribute = modelAttributeMap[modelKey];
      if (!(attribute.type instanceof DataTypes.VIRTUAL)) {
        tmpColumns += (tmpColumns ? ',' : '') + this.quoteIdentifier(attribute.field) + ' ' + attribute.type.toSql();
        outputColumns += (outputColumns ? ',' : '') + 'INSERTED.' + this.quoteIdentifier(attribute.field);
      }
    }

    tmpTable = _.template(tmpTable, this._templateSettings)({ columns: tmpColumns }).trim();
    this._mssqlSelectFromTmp = ';select * from @tmp';
    return ' OUTPUT ' + outputColumns + ' into @tmp';
  },

  _getTmpTable(options, modelAttributeMap) {
    if (this._dialect.supports.returnValues.output && modelAttributeMap && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
      return this._mssqlSelectFromTmp || '';
    }
    return '';
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

  _constructInsertQuery(table, fields, values, outputFragment, tmpTable, options, modelAttributes) {
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
      } else if (this._dialect.supports.returnValues.output && tmpTable) {
        valueQuery += this._mssqlSelectFromTmp;
        emptyQuery += this._mssqlSelectFromTmp;
      }
    }

    if (this._dialect.supports.EXCEPTION && options.exception) {
      valueQuery = this._getPostgresExceptionQuery(table, valueQuery, options);
    }

    if (this._dialect.supports['ON DUPLICATE KEY'] && options.onDuplicate) {
      valueQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
      emptyQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
    }

    const identityWrapperRequired = this._needsIdentityWrapper(fields, modelAttributes, valueHash);

    let query = (fields.length ? valueQuery : emptyQuery) + ';';

    if (identityWrapperRequired && this._dialect.supports.autoIncrement.identityInsert) {
      query = [
        'SET IDENTITY_INSERT', this.quoteTable(table), 'ON;',
        query,
        'SET IDENTITY_INSERT', this.quoteTable(table), 'OFF;'
      ].join(' ');
    }

    return query;
  },

  _getPostgresExceptionQuery(table, valueQuery, options) {
    if (semver.gte(this.sequelize.options.databaseVersion, '9.2.0')) {
      const delimiter = '$func_' + uuid.v4().replace(/-/g, '') + '$';
      return 'CREATE OR REPLACE FUNCTION pg_temp.testfunc(OUT response <%= table %>, OUT sequelize_caught_exception text) RETURNS RECORD AS ' + delimiter +
        ' BEGIN ' + valueQuery + ' INTO response; EXCEPTION ' + options.exception + ' END ' + delimiter +
        ' LANGUAGE plpgsql; SELECT (testfunc.response).*, testfunc.sequelize_caught_exception FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc()';
    }
    return 'CREATE OR REPLACE FUNCTION pg_temp.testfunc() RETURNS SETOF <%= table %> AS $body$ BEGIN RETURN QUERY ' + valueQuery + '; EXCEPTION ' + options.exception + ' END; $body$ LANGUAGE plpgsql; SELECT * FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc();';
  },

  _needsIdentityWrapper(fields, modelAttributes, valueHash) {
    if (!modelAttributes || !this._dialect.supports.autoIncrement.identityInsert) {
      return false;
    }

    for (const key in valueHash) {
      if (valueHash.hasOwnProperty(key) && modelAttributes[key] && modelAttributes[key].autoIncrement === true) {
        return true;
      }
    }
    return false;
  }