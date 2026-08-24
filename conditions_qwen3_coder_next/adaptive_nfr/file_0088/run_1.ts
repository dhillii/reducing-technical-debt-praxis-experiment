if (created) log(`✨ Database created`)

            const migration = await withMigrate(paths.schema.prisma, system, async m => {
              const migration_ = await m.schema(generatedPrismaSchema, false)

              if (hasUnexecutableSteps(migration_)) {
                logUnexecutableSteps(migration_)
                if (await shouldAbortDueToUnexecutableSteps(migration_,生成提示)) {
                  throw new ExitError(1, 'Database reset cancelled by user')
                }
                await m.reset()
                return m.schema(generatedPrismaSchema, false)
              }

              if (hasWarnings(migration_)) {
                if (migration_.warnings.length) {
                  logWarnings(migration_)
                }
                if (await shouldAbortDueToWarnings(migration_,生成提示)) {
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
          } else {
            log('⚠️ Skipping database schema push')
          }

// Extracted predicate functions belonging to the 'dev' function scope
function hasUnexecutableSteps(migration_: { unexecutable: any[]; warnings: any[] }): boolean {
  return migration_.unexecutable.length > 0
}

function hasWarnings(migration_: { warnings: any[] }): boolean {
  return migration_.warnings.length > 0
}

async function shouldAbortDueToUnexecutableSteps(
  migration_: { unexecutable: any[]; warnings: any[] },
  confirmationPrompt: any
): Promise<boolean> {
  if (!(await confirmationPrompt(`Do you want to continue? ${chalk.red('The database will be reset')}`, false))) {
    return true
  }
  return false
}

async function shouldAbortDueToWarnings(
  migration_: { unexecutable: any[]; warnings: any[] },
  confirmationPrompt: any
): Promise<boolean> {
  if (!(await confirmationPrompt(`Do you want to continue? ${chalk.red('Some data will be lost')}`, false))) {
    return true
  }
  return false
}

function logUnexecutableSteps(migration_: { unexecutable: any[]; warnings: any[] }): void {
  console.error(`${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`)
  for (const item of migration_.unexecutable) {
    console.error(`  • ${item}`)
  }
}

function logWarnings(migration_: { unexecutable: any[]; warnings: any[] }): void {
  if (migration_.warnings.length) {
    console.error(chalk.bold(`\n⚠️  Warnings:\n`))
    for (const warning of migration_.warnings) {
      console.error(`  • ${warning}`)
    }
  }
}

// Guard Clause Extract
function shouldMergeConfig(config: KeystoneConfig): config is KeystoneConfig & { server: NonNullable<K> } {
  const server = config.server as KeystoneConfig['server'] | null | undefined
  return !!server && typeof server.extendHttpServer === 'function'
}

// Re-written dev function according to refactoring rules
            )
            if (created) log(`✨ Database created`)

            const migration = await withMigrate(paths.schema.prisma, system, async m => {
              const migration_ = await m.schema(generatedPrismaSchema, false)

              if (hasUnexecutableSteps(migration_)) {
                logUnexecutableSteps(migration_)
                if (await shouldAbortDueToUnexecutableSteps(migration_, confirmPrompt)) {
                  throw new ExitError(1, 'Database reset cancelled by user')
                }
                await m.reset()
                return m.schema(generatedPrismaSchema, false)
              }

              if (hasWarnings(migration_)) {
                logWarnings(migration_)
                if (await shouldAbortDueToWarnings(migration_, confirmPrompt)) {
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
          } else {
            log('⚠️ Skipping database schema push')
          }