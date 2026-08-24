.map(v => '' + v); // convert to string
          return values.map(v => ({
            key: v,
            connection: () => {
              return {
                ..._.omit(filters, ['limit']), // we shouldn't carry limit to sub-field
                where: {
                  ...(filters.where || {}),
                  [fieldKey]: v,
                },
              };
            },
          }));
        });
    }
  };