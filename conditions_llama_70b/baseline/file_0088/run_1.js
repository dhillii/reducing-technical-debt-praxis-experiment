// ...

const migration = await withMigrate(paths.schema.prisma, system, async m => {
  const migration_ = await m.schema(generatedPrismaSchema, false)

  if (migration_.unexecutable.length) {
    handleUnexecutableSteps(migration_, m, generatedPrismaSchema)
  } else if (migration_.warnings.length) {
    handleWarnings(migration_, m, generatedPrismaSchema)
  }

  return migration_
})

// ...

async function handleUnexecutableSteps(migration_, m, generatedPrismaSchema) {
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

async function handleWarnings(migration_, m, generatedPrismaSchema) {
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