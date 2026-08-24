)
            if (created) log(`✨ Database created`)

            const migration = await withMigrate(paths.schema.prisma, system, async m => {
              const migration_ = await m.schema(generatedPrismaSchema, false)

              if (hasUnexecutableSteps(migration_)) {
                logUnexecutableSteps(migration_)
                logWarnings(migration_)
                if (await shouldAbortOnUnexecutable()) {
                  throw new ExitError(1, 'Database reset cancelled by user')
                }
                await m.reset()
                return m.schema(generatedPrismaSchema, false)
              }

              if (hasWarnings(migration_)) {
                logWarnings(migration_)
                if (await shouldAbortOnDataLoss()) {
                  throw new ExitError(1, 'Database push cancelled by user')
                }
                return m.schema(generatedPrismaSchema, true)
              }

              return migration_
            })

            if (migration.warnings.length === 0 && migration.executedSteps === 0) {
              log(`✨ Database unchanged`)
            } else {
              log(`✨ Database synchronized with Prisma schema`)
            }

            function hasUnexecutableSteps(migration_: any) {
              return migration_.unexecutable.length > 0
            }

            function hasWarnings(migration_: any) {
              return migration_.warnings.length > 0
            }

            async function shouldAbortOnUnexecutable() {
              return !(
                await confirmPrompt(
                  `Do you want to continue? ${chalk.red('The database will be reset')}`,
                  false
                )
              )
            }

            async function shouldAbortOnDataLoss() {
              return !(
                await confirmPrompt(
                  `Do you want to continue? ${chalk.red('Some data will be lost')}`,
                  false
                )
              )
            }

            function logUnexecutableSteps(migration_: any) {
              console.error(
                `${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`
              )
              for (const item of migration_.unexecutable) {
                console.error(`  • ${item}`)
              }
            }

            function logWarnings(migration_: any) {
              if (migration_.warnings.length) {
                console.error(chalk.bold(`\n⚠️  Warnings:\n`))
                for (const warning of migration_.warnings) {
                  console.error(`  • ${warning}`)
                }
              }
            }
          } else {
            log('⚠️ Skipping database schema push')
          }