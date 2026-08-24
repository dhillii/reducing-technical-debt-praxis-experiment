const migration = await withMigrate(paths.schema.prisma, system, async m => {
              // what does force on migrate.engine.schemaPush mean?
              // - true: ignore warnings, but unexecutable steps will block
              // - false: warnings or unexecutable steps will block
              const migration_ = await m.schema(generatedPrismaSchema, false)

              // if there are unexecutable steps, we need to reset the database [or the user can use migrations]
              if (migration_.unexecutable.length) {
                console.error(
                  `${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`
                )
                for (const item of migration_.unexecutable) {
                  console.error(`  • ${item}`)
                }

                if (migration_.warnings.length) {
                  console.error(chalk.bold(`\n⚠️  Warnings:\n`))
                  for (const warning of migration_.warnings) {
                    console.error(`  • ${warning}`)
                  }
                }

                console.error('\nTo apply this migration, we need to reset the database')
                if (
                  !(await confirmPrompt(
                    `Do you want to continue? ${chalk.red('The database will be reset')}`,
                    false
                  ))
                ) {
                  throw new ExitError(1, 'Database reset cancelled by user')
                }

                await m.reset()
                return m.schema(generatedPrismaSchema, false)
              }

              if (migration_.warnings.length) {
                console.error(chalk.bold(`\n⚠️  Warnings:\n`))
                for (const warning of migration_.warnings) {
                  console.error(`  • ${warning}`)
                }

                if (
                  !(await confirmPrompt(
                    `Do you want to continue? ${chalk.red('Some data will be lost')}`,
                    false
                  ))
                ) {
                  throw new ExitError(1, 'Database push cancelled by user')
                }

                return m.schema(generatedPrismaSchema, true)
              }

              return migration_
            })