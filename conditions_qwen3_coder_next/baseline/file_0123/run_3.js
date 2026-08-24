normalizedTableName = tableName.schema + '.' + tableName.tableName;
            }

            const dropForeignKey = foreignKey => {
              const sql = this.QueryGenerator.dropForeignKeyQuery(tableName, foreignKey);
              promises.push(this.sequelize.query(sql, options));
            };

            foreignKeys[normalizedTableName].forEach(dropForeignKey);