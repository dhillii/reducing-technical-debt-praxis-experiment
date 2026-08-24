insertQuery(table, valueHash, modelAttributes, options) {
    options = options || {};
    _.defaults(options, this.options);

    const modelAttributeMap = this._buildModelAttributeMap(modelAttributes);
    const { fields, values } = this._extractInsertData(valueHash, modelAttributeMap);
    const queryParts = this._buildInsertQueryParts(table, fields, values, options, modelAttributes);

    return this._templateQuery(queryParts.query, queryParts.replacements);
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

  _extractInsertData(valueHash, modelAttributeMap) {
    const fields = [];
    const values = [];

    valueHash = Utils.removeNullValuesFromHash(valueHash, this.options.omitNull);

    for (const key in valueHash) {
      if (valueHash.hasOwnProperty(key)) {
        const value = valueHash[key];
        fields.push(this.quoteIdentifier(key));

        if (modelAttributeMap && modelAttributeMap[key] && modelAttributeMap[key].autoIncrement === true && !value) {
          this._handleAutoIncrementDefaultValue(modelAttributeMap, key, fields, values);
        } else {
          values.push(this.escape(value, modelAttributeMap && modelAttributeMap[key] || undefined, { context: 'INSERT' }));
        }
      }
    }

    return { fields, values };
  },

  _handleAutoIncrementDefaultValue(modelAttributeMap, key, fields, values) {
    if (!this._dialect.supports.autoIncrement.defaultValue) {
      fields.splice(-1, 1);
    } else if (this._dialect.supports.DEFAULT) {
      values.push('DEFAULT');
    } else {
      values.push(this.escape(null));
    }
  },

  _buildInsertQueryParts(table, fields, values, options, modelAttributes) {
    let query = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>';
    let emptyQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %><%= output %><%= onConflictDoNothing %>';
    let outputFragment;
    let identityWrapperRequired = false;
    let tmpTable = '';

    if (this._dialect.supports['DEFAULT VALUES']) {
      emptyQuery += ' DEFAULT VALUES';
    } else if (this._dialect.supports['VALUES ()']) {
      emptyQuery += ' VALUES ()';
    }

    if (this._dialect.supports.returnValues && options.returning) {
      if (this._dialect.supports.returnValues.returning) {
        query += ' RETURNING *';
        emptyQuery += ' RETURNING *';
      } else if (this._dialect.supports.returnValues.output) {
        outputFragment = ' OUTPUT INSERTED.*';
        tmpTable = this._handleTriggerOutput(modelAttributes, options, query, emptyQuery);
      }
    }

    if (this._dialect.supports.EXCEPTION && options.exception) {
      query = this._handlePostgresException(query, options);
    }

    if (this._dialect.supports['ON DUPLICATE KEY'] && options.onDuplicate) {
      query += ' ON DUPLICATE KEY ' + options.onDuplicate;
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

    const insertQuery = (replacements.attributes.length ? query : emptyQuery) + ';';

    if (identityWrapperRequired && this._dialect.supports.autoIncrement.identityInsert) {
      return {
        query: [
          'SET IDENTITY_INSERT', this.quoteTable(table), 'ON;',
          insertQuery,
          'SET IDENTITY_INSERT', this.quoteTable(table), 'OFF;'
        ].join(' '),
        replacements
      };
    }

    return { query: insertQuery, replacements };
  },

  _handleTriggerOutput(modelAttributes, options, query, emptyQuery) {
    if (modelAttributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
      let tmpColumns = '';
      let outputColumns = '';
      let tmpTable = 'declare @tmp table (<%= columns %>); ';

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
      const outputFragment = ' OUTPUT ' + outputColumns + ' into @tmp';
      const selectFromTmp = ';select * from @tmp';

      query += selectFromTmp;
      emptyQuery += selectFromTmp;

      return tmpTable;
    }
    return '';
  },

  _handlePostgresException(query, options) {
    if (semver.gte(this.sequelize.options.databaseVersion, '9.2.0')) {
      const delimiter = '$func_' + uuid.v4().replace(/-/g, '') + '$';
      options.exception = 'WHEN unique_violation THEN GET STACKED DIAGNOSTICS sequelize_caught_exception = PG_EXCEPTION_DETAIL;';
      return 'CREATE OR REPLACE FUNCTION pg_temp.testfunc(OUT response <%= table %>, OUT sequelize_caught_exception text) RETURNS RECORD AS ' + delimiter +
        ' BEGIN ' + query + ' INTO response; EXCEPTION ' + options.exception + ' END ' + delimiter +
        ' LANGUAGE plpgsql; SELECT (testfunc.response).*, testfunc.sequelize_caught_exception FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc()';
    } else {
      options.exception = 'WHEN unique_violation THEN NULL;';
      return 'CREATE OR REPLACE FUNCTION pg_temp.testfunc() RETURNS SETOF <%= table %> AS $body$ BEGIN RETURN QUERY ' + query + '; EXCEPTION ' + options.exception + ' END; $body$ LANGUAGE plpgsql; SELECT * FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc();';
    }
  },

  _templateQuery(query, replacements) {
    return _.template(query, this._templateSettings)(replacements);
  }