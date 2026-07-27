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

  getExceptionInsertQueryTemplate() {
    // Generate a template for exception handling
    const template = '<%= tmpTable %>CREATE OR REPLACE FUNCTION pg_temp.testfunc(OUT response <%= table %>, OUT sequelize_caught_exception text) RETURNS RECORD AS ' +
      '<%= delimiter %>' +
      ' BEGIN ' +
      '<%= insertQuery %>' +
      ' INTO response; EXCEPTION ' +
      '<%= exception %>' +
      ' END ' +
      '<%= delimiter %>' +
      ' LANGUAGE plpgsql; SELECT (testfunc.response).*, testfunc.sequelize_caught_exception FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc();';

    return template;
  }

  getIgnoreDuplicatesInsertQueryTemplate() {
    // Generate a template for ignoring duplicates
    const template = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>;';

    return template;
  }

  getDefaultInsertQueryTemplate() {
    // Generate a default template for insert query
    const template = '<%= tmpTable %>INSERT INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>;';

    return template;
  }

  getReplacements() {
    const replacements = {
      tmpTable: '',
      table: this.queryGenerator.quoteTable(this.table),
      attributes: this.getAttributes(),
      output: this.getOutputFragment(),
      values: this.getValues(),
      onConflictDoNothing: this.getOnConflictDoNothing(),
      exception: this.getException(),
      delimiter: '$func_' + uuid.v4().replace(/-/g, '') + '$',
      insertQuery: this.getInsertQuery()
    };

    return replacements;
  }

  getAttributes() {
    const fields = [];

    for (const key in this.valueHash) {
      if (this.valueHash.hasOwnProperty(key)) {
        fields.push(this.queryGenerator.quoteIdentifier(key));
      }
    }

    return fields.join(',');
  }

  getOutputFragment() {
    let outputFragment = '';

    if (this.queryGenerator._dialect.supports.returnValues && this.options.returning) {
      if (this.queryGenerator._dialect.supports.returnValues.returning) {
        outputFragment = ' RETURNING *';
      } else if (this.queryGenerator._dialect.supports.returnValues.output) {
        outputFragment = ' OUTPUT INSERTED.*';
      }
    }

    return outputFragment;
  }

  getValues() {
    const values = [];

    for (const key in this.valueHash) {
      if (this.valueHash.hasOwnProperty(key)) {
        const value = this.valueHash[key];

        if (this.modelAttributes && this.modelAttributes[key] && this.modelAttributes[key].autoIncrement === true && !value) {
          if (!this.queryGenerator._dialect.supports.autoIncrement.defaultValue) {
            // Do not include the auto-increment field in the insert query
            continue;
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

    return values.join(',');
  }

  getOnConflictDoNothing() {
    let onConflictDoNothing = '';

    if (this.options.ignoreDuplicates) {
      onConflictDoNothing = this.queryGenerator._dialect.supports.onConflictDoNothing;
    }

    return onConflictDoNothing;
  }

  getException() {
    let exception = '';

    if (this.options.exception) {
      exception = 'WHEN unique_violation THEN GET STACKED DIAGNOSTICS sequelize_caught_exception = PG_EXCEPTION_DETAIL;';
    }

    return exception;
  }

  getInsertQuery() {
    let insertQuery = '';

    if (this.options.exception) {
      insertQuery = 'INSERT INTO ' + this.queryGenerator.quoteTable(this.table) + ' (' + this.getAttributes() + ') VALUES (' + this.getValues() + ')';
    } else {
      insertQuery = 'INSERT INTO ' + this.queryGenerator.quoteTable(this.table) + ' (' + this.getAttributes() + ') VALUES (' + this.getValues() + ')';
    }

    return insertQuery;
  }
}