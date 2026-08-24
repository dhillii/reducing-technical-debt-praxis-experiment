)
            if (created) log(`✨ Database created`)

            const migration = await withMigrate(paths.schema.prisma, system, async m => {
              const migration_ = await m.schema(generatedPrismaSchema, false)

              if (hasUnexecutableSteps(migration_)) {
                await handleUnexecutableSteps(migration_, generatedPrismaSchema, m)
              }

              if (migration_.warnings.length) {
                await handleWarnings(migration_, generatedPrismaSchema, m)
              }

              return migration_
            })

            if (migration.warnings.length === 0 && migration.executedSteps === 0) {
              log(`✨ Database unchanged`)
            } else {
              log(`✨ Database synchronized with Prisma schema`)
            }
          } else {
            log('⚠️ Skipping database schema push')
          }
            )
            if (created) log(`✨ Database created`)

            const migration = await withMigrate(paths.schema.prisma, system, async m => {
              const migration_ = await m.schema(generatedPrismaSchema, false)

              if (hasUnexecutableSteps(migration_)) {
                await handleUnexecutableSteps(migration_, generatedPrismaSchema, m)
              }

              if (migration_.warnings.length) {
                await handleWarnings(migration_, generatedPrismaSchema, m)
              }

              return migration_
            })

            if (migration.warnings.length === 0 && migration.executedSteps === 0) {
              log(`✨ Database unchanged`)
            } else {
              log(`✨ Database synchronized with Prisma schema`)
            }
          } else {
            log('⚠️ Skipping database schema push')
          }