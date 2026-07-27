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
  constructor(queryGenerator, table, valueHash, modelAttributes, options) {
    this.queryGenerator = queryGenerator;
    this.table = table;
    this.valueHash = valueHash;
    this.modelAttributes = modelAttributes;
    this.options = options;
  }

  generateInsertQuery() {
    const modelAttributeMap = this.createModelAttributeMap();
    const fields = this.getFields();
    const values = this.getValues();
    const query = this.createQuery(fields, values);
    return query;
  }

  createModelAttributeMap() {
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

  getFields() {
    const fields = [];
    for (const key in this.valueHash) {
      if (this.valueHash.hasOwnProperty(key)) {
        fields.push(this.queryGenerator.quoteIdentifier(key));
      }
    }
    return fields;
  }

  getValues() {
    const values = [];
    for (const key in this.valueHash) {
      if (this.valueHash.hasOwnProperty(key)) {
        const value = this.valueHash[key];
        if (this.modelAttributes && this.modelAttributes[key] && this.modelAttributes[key].autoIncrement === true && !value) {
          if (!this.queryGenerator._dialect.supports.autoIncrement.defaultValue) {
            // do nothing
          } else if (this.queryGenerator._dialect.supports.DEFAULT) {
            values.push('DEFAULT');
          } else {
            values.push(this.queryGenerator.escape(null));
          }
        } else {
          values.push(this.queryGenerator.escape(value, this.modelAttributes && this.modelAttributes[key] || undefined, { context: 'INSERT' }));
        }
      }
    }
    return values;
  }

  createQuery(fields, values) {
    const outputFragment = this.getOutputFragment();
    const replacements = {
      ignoreDuplicates: this.options.ignoreDuplicates ? this.queryGenerator._dialect.supports.IGNORE : '',
      onConflictDoNothing: this.options.ignoreDuplicates ? this.queryGenerator._dialect.supports.onConflictDoNothing : '',
      table: this.queryGenerator.quoteTable(this.table),
      attributes: fields.join(','),
      output: outputFragment,
      values: values.join(','),
      tmpTable: ''
    };

    let query;
    if (fields.length > 0) {
      query = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>';
    } else {
      query = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %><%= output %><%= onConflictDoNothing %>';
    }

    if (this.queryGenerator._dialect.supports['DEFAULT VALUES']) {
      query += ' DEFAULT VALUES';
    } else if (this.queryGenerator._dialect.supports['VALUES ()']) {
      query += ' VALUES ()';
    }

    if (this.queryGenerator._dialect.supports.returnValues && this.options.returning) {
      if (this.queryGenerator._dialect.supports.returnValues.returning) {
        query += ' RETURNING *';
      } else if (this.queryGenerator._dialect.supports.returnValues.output) {
        outputFragment = ' OUTPUT INSERTED.*';
      }
    }

    if (this.queryGenerator._dialect.supports.EXCEPTION && this.options.exception) {
      // Mostly for internal use, so we expect the user to know what he's doing!
      // pg_temp functions are private per connection, so we never risk this function interfering with another one.
      if (semver.gte(this.queryGenerator.sequelize.options.databaseVersion, '9.2.0')) {
        // >= 9.2 - Use a UUID but prefix with 'func_' (numbers first not allowed)
        const delimiter = '$func_' + uuid.v4().replace(/-/g, '') + '$';

        this.options.exception = 'WHEN unique_violation THEN GET STACKED DIAGNOSTICS sequelize_caught_exception = PG_EXCEPTION_DETAIL;';
        query = 'CREATE OR REPLACE FUNCTION pg_temp.testfunc(OUT response <%= table %>, OUT sequelize_caught_exception text) RETURNS RECORD AS ' + delimiter +
          ' BEGIN ' + query + ' INTO response; EXCEPTION ' + this.options.exception + ' END ' + delimiter +
          ' LANGUAGE plpgsql; SELECT (testfunc.response).*, testfunc.sequelize_caught_exception FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc()';
      } else {
        this.options.exception = 'WHEN unique_violation THEN NULL;';
        query = 'CREATE OR REPLACE FUNCTION pg_temp.testfunc() RETURNS SETOF <%= table %> AS $body$ BEGIN RETURN QUERY ' + query + '; EXCEPTION ' + this.options.exception + ' END; $body$ LANGUAGE plpgsql; SELECT * FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc();';
      }
    }

    if (this.queryGenerator._dialect.supports['ON DUPLICATE KEY'] && this.options.onDuplicate) {
      query += ' ON DUPLICATE KEY ' + this.options.onDuplicate;
    }

    this.valueHash = Utils.removeNullValuesFromHash(this.valueHash, this.options.omitNull);
    return _.template(query, this.queryGenerator._templateSettings)(replacements);
  }

  getOutputFragment() {
    let outputFragment;
    if (this.queryGenerator._dialect.supports.returnValues && this.options.returning) {
      if (this.queryGenerator._dialect.supports.returnValues.returning) {
        outputFragment = ' RETURNING *';
      } else if (this.queryGenerator._dialect.supports.returnValues.output) {
        outputFragment = ' OUTPUT INSERTED.*';
      }
    }
    return outputFragment;
  }
}