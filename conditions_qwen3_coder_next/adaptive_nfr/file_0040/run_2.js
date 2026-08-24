const date = ghostBookshelf.knex.raw('CURRENT_TIMESTAMP');

            const settingsDataToInsert = settingsToInsert.map((setting) => {
                const settingValues = {...setting, {
                    id: ObjectID().toHexString(),
                    created_at: date,
                    updated_at: date
                }};

                return _.pick(settingValues, columns);
            });