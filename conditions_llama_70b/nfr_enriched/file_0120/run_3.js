/**
 * Returns an insert into command. Parameters: table name + hash of attribute-value-pairs.
 * @private
 */
insertQuery(table, valueHash, modelAttributes, options) {
  options = options || {};
  _.defaults(options, this.options);

  const queryGenerator = new InsertQueryGenerator(this, table, valueHash, modelAttributes, options);
  return queryGenerator.generateInsertQuery();
}

class InsertQueryGenerator {
  /**
   * @param {QueryGenerator} queryGenerator
   * @param {string} table
   * @param {object} valueHash
   * @param {object} modelAttributes
   * @param {object} options
   */
  constructor(queryGenerator, table, valueHash, modelAttributes, options) {
    this.queryGenerator = queryGenerator;
    this.table = table;
    this.valueHash = valueHash;
    this.modelAttributes = modelAttributes;
    this.options = options;
  }

  generateInsertQuery() {
    const insertQuery = this.getInsertQueryTemplate();
    const replacements = this.getReplacements();

    return _.template(insertQuery, this.queryGenerator._templateSettings)(replacements);
  }

  getInsertQueryTemplate() {
    if (this.options.exception) {
      return this.getExceptionInsertQueryTemplate();
    } else if (this.options.ignoreDuplicates) {
      return this.getIgnoreDuplicatesInsertQueryTemplate();
    } else {
      return this.getDefaultInsertQueryTemplate();
    }
  }

  getReplacements() {
    const fields = this.getFields();
    const values = this.getValues();
    const outputFragment = this.getOutputFragment();
    const tmpTable = this.getTmpTable();

    return {
      ignoreDuplicates: this.options.ignoreDuplicates ? this.queryGenerator._dialect.supports.IGNORE : '',
      onConflictDoNothing: this.options.ignoreDuplicates ? this.queryGenerator._dialect.supports.onConflictDoNothing : '',
      table: this.queryGenerator.quoteTable(this.table),
      attributes: fields.join(','),
      output: outputFragment,
      values: values.join(','),
      tmpTable
    };
  }

  getFields() {
    const fields = [];
    const modelAttributeMap = this.getModelAttributeMap();

    for (const key in this.valueHash) {
      if (this.valueHash.hasOwnProperty(key)) {
        const value = this.valueHash[key];
        fields.push(this.queryGenerator.quoteIdentifier(key));

        // SERIALS' can't be NULL in postgresql, use DEFAULT where supported
        if (modelAttributeMap && modelAttributeMap[key] && modelAttributeMap[key].autoIncrement === true && !value) {
          if (!this.queryGenerator._dialect.supports.autoIncrement.defaultValue) {
            fields.splice(-1, 1);
          } else if (this.queryGenerator._dialect.supports.DEFAULT) {
            fields.push('DEFAULT');
          } else {
            fields.push(this.queryGenerator.escape(null));
          }
        }
      }
    }

    return fields;
  }

  getValues() {
    const values = [];
    const modelAttributeMap = this.getModelAttributeMap();
    let identityWrapperRequired = false;

    for (const key in this.valueHash) {
      if (this.valueHash.hasOwnProperty(key)) {
        const value = this.valueHash[key];

        // SERIALS' can't be NULL in postgresql, use DEFAULT where supported
        if (modelAttributeMap && modelAttributeMap[key] && modelAttributeMap[key].autoIncrement === true && !value) {
          if (!this.queryGenerator._dialect.supports.autoIncrement.defaultValue) {
            continue;
          } else if (this.queryGenerator._dialect.supports.DEFAULT) {
            values.push('DEFAULT');
          } else {
            values.push(this.queryGenerator.escape(null));
          }
        } else {
          if (modelAttributeMap && modelAttributeMap[key] && modelAttributeMap[key].autoIncrement === true) {
            identityWrapperRequired = true;
          }

          values.push(this.queryGenerator.escape(value, modelAttributeMap && modelAttributeMap[key] || undefined, { context: 'INSERT' }));
        }
      }
    }

    return values;
  }

  getOutputFragment() {
    let outputFragment;

    if (this.queryGenerator._dialect.supports.returnValues && this.options.returning) {
      if (this.queryGenerator._dialect.supports.returnValues.returning) {
        outputFragment = ' RETURNING *';
      } else if (this.queryGenerator._dialect.supports.returnValues.output) {
        outputFragment = ' OUTPUT INSERTED.*';

        //To capture output rows when there is a trigger on MSSQL DB
        if (this.modelAttributes && this.options.hasTrigger && this.queryGenerator._dialect.supports.tmpTableTrigger) {
          const tmpColumns = this.getTmpColumns();
          const outputColumns = this.getOutputColumns();

          const replacement = {
            columns: tmpColumns
          };

          const tmpTable = _.template('declare @tmp table (<%= columns %>); ', this.queryGenerator._templateSettings)(replacement).trim();
          outputFragment = ' OUTPUT ' + outputColumns + ' into @tmp';
          const selectFromTmp = ';select * from @tmp';

          outputFragment += selectFromTmp;
        }
      }
    }

    return outputFragment;
  }

  getTmpTable() {
    let tmpTable = '';

    //To capture output rows when there is a trigger on MSSQL DB
    if (this.modelAttributes && this.options.hasTrigger && this.queryGenerator._dialect.supports.tmpTableTrigger) {
      const tmpColumns = this.getTmpColumns();

      const replacement = {
        columns: tmpColumns
      };

      tmpTable = _.template('declare @tmp table (<%= columns %>); ', this.queryGenerator._templateSettings)(replacement).trim();
    }

    return tmpTable;
  }

  getModelAttributeMap() {
    const modelAttributeMap = {};

    if (this.modelAttributes) {
      _.each(this.modelAttributes, (attribute, key) => {
        modelAttributeMap[key] = attribute;
        if (attribute.field) {
          modelAttributeMap[attribute.field] = attribute;
        }
      });
    }

    return modelAttributeMap;
  }

  getTmpColumns() {
    let tmpColumns = '';
    let outputColumns = '';

    for (const modelKey in this.modelAttributes) {
      const attribute = this.modelAttributes[modelKey];
      if (!(attribute.type instanceof DataTypes.VIRTUAL)) {
        if (tmpColumns.length > 0) {
          tmpColumns += ',';
          outputColumns += ',';
        }

        tmpColumns += this.queryGenerator.quoteIdentifier(attribute.field) + ' ' + attribute.type.toSql();
        outputColumns += 'INSERTED.' + this.queryGenerator.quoteIdentifier(attribute.field);
      }
    }

    return tmpColumns;
  }

  getOutputColumns() {
    let outputColumns = '';

    for (const modelKey in this.modelAttributes) {
      const attribute = this.modelAttributes[modelKey];
      if (!(attribute.type instanceof DataTypes.VIRTUAL)) {
        if (outputColumns.length > 0) {
          outputColumns += ',';
        }

        outputColumns += 'INSERTED.' + this.queryGenerator.quoteIdentifier(attribute.field);
      }
    }

    return outputColumns;
  }

  getExceptionInsertQueryTemplate() {
    const delimiter = '$func_' + uuid.v4().replace(/-/g, '') + '$';

    if (semver.gte(this.queryGenerator.sequelize.options.databaseVersion, '9.2.0')) {
      // >= 9.2 - Use a UUID but prefix with 'func_' (numbers first not allowed)
      return 'CREATE OR REPLACE FUNCTION pg_temp.testfunc(OUT response <%= table %>, OUT sequelize_caught_exception text) RETURNS RECORD AS ' + delimiter +
        ' BEGIN ' + '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>' + ' INTO response; EXCEPTION ' + this.options.exception + ' END ' + delimiter +
        ' LANGUAGE plpgsql; SELECT (testfunc.response).*, testfunc.sequelize_caught_exception FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc()';
    } else {
      return 'CREATE OR REPLACE FUNCTION pg_temp.testfunc() RETURNS SETOF <%= table %> AS $body$ BEGIN RETURN QUERY ' + '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %><%= output %><%= onConflictDoNothing %>' + '; EXCEPTION ' + this.options.exception + ' END; $body$ LANGUAGE plpgsql; SELECT * FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc();';
    }
  }

  getIgnoreDuplicatesInsertQueryTemplate() {
    return '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>';
  }

  getDefaultInsertQueryTemplate() {
    return '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>';
  }
}