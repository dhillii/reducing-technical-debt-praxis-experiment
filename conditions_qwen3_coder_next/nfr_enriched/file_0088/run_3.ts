const migration_ = await m.schema(generatedPrismaSchema, false)

            if (migration_.unexecutable.length) {
              await handleUnexecutableSteps(migration_, m, generatedPrismaSchema)
            } else if (migration_.warnings.length) {
              await handleWarnings(migration_, m, generatedPrismaSchema)
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

        const prismaClientModule = require(paths.prisma)
        const keystone = system.getKeystone(prismaClientModule)

        log('✨ Connecting to the database')
        await keystone.connect()
        if (!server) {
          return {
            system,
            context: keystone.context,
            prismaClientModule,
          }
        }

        log('✨ Creating server')
        const { apolloServer, expressServer } = await createExpressServer(
          system.config,
          keystone.context
        )
        log(`✅ GraphQL API ready`)

        return {
          system,
          context: keystone.context,
          expressServer,
          apolloServer,
          prismaClientModule,
        }
      })()

      if (configWithExtendHttp?.server?.extendHttpServer && httpServer && context) {
        configWithExtendHttp.server.extendHttpServer(httpServer, context)
      }

      prismaClient = context?.prisma
      if (rest.expressServer) {
        ;({ expressServer } = rest)
      }

      let nextApp
      if (!system.config.ui?.isDisabled && ui) {
        if (!expressServer || !context) throw new TypeError('Error trying to prepare the Admin UI')

        log('✨ Generating Admin UI code')
        const paths = system.getPaths(cwd)
        await fsp.rm(paths.admin, { recursive: true, force: true })
        await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

        log('✨ Preparing Admin UI')
        nextApp = next({ dev: true, dir: paths.admin })
        await nextApp.prepare()
        expressServer.use(createAdminUIMiddlewareWithNextApp(system.config, context, nextApp))
        log(`✅ Admin UI ready`)
      }

      hasAddedAdminUIMiddleware = true
      initKeystonePromiseResolve()

      const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
      let lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)
      let lastApolloServer = apolloServer ?? null

      if (system.config.telemetry !== false) {
        runTelemetry(cwd, system.lists, system.config.db.provider)
      }

      for await (const buildResult of builds) {
        if (buildResult.errors.length) continue

        log('compiled successfully')
        try {
          const paths = system.getPaths(cwd)

          {
            const resolved = require.resolve(paths.config)
            delete require.cache[resolved]
          }

          const newConfigWithHttp = await importBuiltKeystoneConfiguration(cwd)
          const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

          if (prisma) {
            if (!originalPrismaSchema) throw new TypeError('Missing Prisma schema source')

            const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
            if (originalPrismaSchema !== newPrismaSchema) {
              return stop(null, '🔄 Your prisma schema has changed, please restart Keystone')
            }

            if (
              JSON.stringify(newSystem.config.db.enableLogging) !==
                JSON.stringify(system.config.db.enableLogging) ||
              newSystem.config.db.url !== system.config.db.url
            ) {
              return stop(null, 'Your database configuration has changed, please restart Keystone')
            }
          }

          const newPrintedGraphQLSchema = printSchema(newSystem.graphql.schemas.public)
          if (newPrintedGraphQLSchema !== lastPrintedGraphQLSchema) {
            await fsp.writeFile(
              paths.schema.graphql,
              getFormattedGraphQLSchema(newPrintedGraphQLSchema)
            )
            lastPrintedGraphQLSchema = newPrintedGraphQLSchema
          }

          await generateTypes(cwd, newSystem)
          await generateAdminUI(newSystem.config, newSystem.adminMeta, paths.admin, true)
          if (prismaClientModule) {
            if (server && lastApolloServer) {
              const { context: newContext } = newSystem.getKeystone(prismaClientModule)
              const servers = await createExpressServer(newSystem.config, newContext)
              if (nextApp) {
                servers.expressServer.use(
                  createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, nextApp)
                )
              }
              expressServer = servers.expressServer
              const prevApolloServer = lastApolloServer
              lastApolloServer = servers.apolloServer
              await prevApolloServer.stop()
            }
          }
        } catch (err) {
          console.error(`Error loading your Keystone config`, err)
        }
      }
    }

    async function handleUnexecutableSteps(
      migration_: any,
      m: any,
      generatedPrismaSchema: string
    ) {
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

    async function handleWarnings(migration_: any, m: any, generatedPrismaSchema: string) {
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