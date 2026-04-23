```typescript
import fsp from 'node:fs/promises'
import { createServer } from 'node:http'
import type { ListenOptions } from 'node:net'
import path from 'node:path'

import { createDatabase } from '@prisma/internals'
import chalk from 'chalk'
import esbuild, { type BuildResult } from 'esbuild'
import express from 'express'
import { printSchema } from 'graphql'
import next from 'next'

import { generateAdminUI } from '../admin-ui/system'
import {
  generateArtifacts,
  generatePrismaClient,
  generateTypes,
  getFormattedGraphQLSchema,
} from '../artifacts'
import { printPrismaSchema } from '../lib/core/prisma-schema-printer'
import { createExpressServer } from '../lib/express'
import { createAdminUIMiddlewareWithNextApp } from '../lib/middleware'
import { withMigrate } from '../lib/migrations'
import { confirmPrompt } from '../lib/prompts'
import { createSystem } from '../lib/system'
import { runTelemetry } from '../lib/telemetry'
import { pkgDir } from '../pkg-dir'
import type { KeystoneConfig } from '../types'
import type { Flags } from './cli'
import { getEsbuildConfig } from './esbuild'
import { ExitError, importBuiltKeystoneConfiguration } from './utils'

async function noop() {}

const devLoadingHTMLFilepath = path.join(pkgDir, 'static', 'dev-loading.html')

function stripExtendHttpServer(config: KeystoneConfig): KeystoneConfig {
  const { server, ...rest } = config
  const { extendHttpServer, ...restServer } = server
  return {
    ...rest,
    server: {
      ...restServer,
      extendHttpServer: noop,
    },
  }
}

function resolvablePromise<T>() {
  let _resolve!: (value: T) => void
  const promise: any = new Promise<T>(resolve => {
    _resolve = resolve
  })
  promise.resolve = _resolve
  return promise
}

async function setupHttpServer(
  app: express.Express | null,
  config: KeystoneConfig
): Promise<{ httpServer: any; expressServer: express.Express | null; nextApp: any | null }> {
  const httpServer = app ? createServer(app) : null
  let expressServer: express.Express | null = null
  let nextApp: any = null

  if (app) {
    const configWithHttp = await importBuiltKeystoneConfiguration(app)
    const { expressServer: newExpressServer, apolloServer } = await createExpressServer(
      configWithHttp,
      null
    )
    expressServer = newExpressServer

    if (!configWithHttp.ui?.isDisabled) {
      const paths = configWithHttp.getPaths(app)
      await fsp.rm(paths.admin, { recursive: true, force: true })
      await generateAdminUI(configWithHttp, configWithHttp.adminMeta, paths.admin, false)

      nextApp = next({ dev: true, dir: paths.admin })
      await nextApp.prepare()
      expressServer.use(createAdminUIMiddlewareWithNextApp(configWithHttp, null, nextApp))
    }
  }

  return { httpServer, expressServer, nextApp }
}

async function setupPrismaClient(
  cwd: string,
  system: any,
  prismaClientModule: any,
  prisma: boolean
): Promise<{ prismaClient: any; keystone: any }> {
  const keystone = system.getKeystone(prismaClientModule)
  await keystone.connect()
  return { prismaClient: system.config.db.provider === 'postgresql' ? system.config.db : null, keystone }
}

async function handleDatabaseMigration(
  cwd: string,
  system: any,
  generatedPrismaSchema: any,
  dbPush: boolean,
  prisma: boolean
): Promise<void> {
  if (dbPush) {
    const paths = system.getPaths(cwd)
    const created = await createDatabase(
      system.config.db.url,
      path.dirname(paths.schema.prisma)
    )
    if (created) console.log('✨ Database created')

    const migration = await withMigrate(paths.schema.prisma, system, async m => {
      const migration_ = await m.schema(generatedPrismaSchema, false)

      if (migration_.unexecutable.length) {
        console.error(`${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`)
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

    if (migration.warnings.length === 0 && migration.executedSteps === 0) {
      console.log('✨ Database unchanged')
    } else {
      console.log('✨ Database synchronized with Prisma schema')
    }
  } else {
    console.log('⚠️ Skipping database schema push')
  }
}

async function setupAdminUI(
  system: any,
  cwd: string,
  expressServer: express.Express | null,
  context: any,
  nextApp: any | null,
  ui: boolean
): Promise<void> {
  if (!system.config.ui?.isDisabled && ui) {
    if (!expressServer || !context) throw new TypeError('Error trying to prepare the Admin UI')

    const paths = system.getPaths(cwd)
    await fsp.rm(paths.admin, { recursive: true, force: true })
    await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

    console.log('✨ Preparing Admin UI')
    nextApp = next({ dev: true, dir: paths.admin })
    await nextApp.prepare()
    expressServer.use(createAdminUIMiddlewareWithNextApp(system.config, context, nextApp))
    console.log('✅ Admin UI ready')
  }
}

async function handleHotReload(
  cwd: string,
  system: any,
  prismaClientModule: any,
  lastPrintedGraphQLSchema: string,
  originalPrismaSchema: string,
  lastApolloServer: any | null,
  expressServer: express.Express | null,
  nextApp: any | null,
  prisma: boolean
): Promise<void> {
  const newPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)
  if (newPrintedGraphQLSchema !== lastPrintedGraphQLSchema) {
    const paths = system.getPaths(cwd)
    await fsp.writeFile(
      paths.schema.graphql,
      getFormattedGraphQLSchema(newPrintedGraphQLSchema)
    )
    lastPrintedGraphQLSchema = newPrintedGraphQLSchema
  }

  await generateTypes(cwd, system)
  await setupAdminUI(system, cwd, expressServer, system.context, nextApp, true)

  if (prismaClientModule) {
    if (expressServer && lastApolloServer) {
      const { context: newContext } = system.getKeystone(prismaClientModule)
      const servers = await createExpressServer(system.config, newContext)
      if (nextApp) {
        servers.expressServer.use(
          createAdminUIMiddlewareWithNextApp(system.config, newContext, nextApp)
        )
      }
      expressServer = servers.expressServer
      const prevApolloServer = lastApolloServer
      lastApolloServer = servers.apolloServer
      await prevApolloServer.stop()
    }
  }
}

async function checkSchemaChanges(
  originalPrismaSchema: string,
  newSystem: any,
  system: any,
  prisma: boolean
): Promise<boolean> {
  if (!originalPrismaSchema) throw new TypeError('Missing Prisma schema source')

  const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
  if (originalPrismaSchema !== newPrismaSchema) {
    return true
  }

  if (
    JSON.stringify(newSystem.config.db.enableLogging) !==
      JSON.stringify(system.config.db.enableLogging) ||
    newSystem.config.db.url !== system.config.db.url
  ) {
    return true
  }

  return false
}

async function createStatusEndpoint(
  app: express.Express,
  hasAddedAdminUIMiddleware: boolean,
  expressServer: express.Express | null
): Promise<void> {
  app.use('/__keystone/dev/status', (req, res) => {
    res.status(true ? 200 : 501).end()
  })

  app.use((req, res, next) => {
    if (expressServer && hasAddedAdminUIMiddleware) {
      return expressServer(req, res, next)
    }

    const { pathname } = new URL(req.url, 'http://ks')
    if (expressServer && pathname === '/api/graphql') {
      return expressServer(req, res, next)
    }

    res.sendFile(devLoadingHTMLFilepath)
  })
}

async function cleanupResources(
  httpServer: any,
  prismaClient: any,
  exitMessage: string = ''
): Promise<void> {
  await esbuildContext.dispose()

  if (httpServer) {
    await new Promise((resolve, reject) => {
      httpServer.close(async (err: any) => {
        if (err) {
          console.error('Error closing the server', err)
          return reject(err)
        }

        resolve(null)
      })
    })
  }

  try {
    await prismaClient?.disconnect?.()
  } catch (err) {
    console.error('Error disconnecting from the database', err)
    throw err
  }

  if (exitMessage) throw new ExitError(1, exitMessage)
}

let esbuildContext: any = null

export async function dev(
  cwd: string,
  {
    dbPush,
    prisma,
    quiet,
    server,
    ui,
  }: Pick<Flags, 'dbPush' | 'prisma' | 'quiet' | 'server' | 'ui'>
) {
  function log(message: string) {
    if (quiet) return
    console.log(message)
  }

  log('✨ Starting Keystone')
  let lastPromise = resolvablePromise<IteratorResult<BuildResult>>()

  const builds: AsyncIterable<BuildResult> = {
    [Symbol.asyncIterator]: () => ({ next: () => lastPromise }),
  }

  function addBuildResult(build: BuildResult) {
    const prev = lastPromise
    lastPromise = resolvablePromise()
    prev.resolve({ value: build, done: false })
  }

  const esbuildConfig = await getEsbuildConfig(cwd)
  esbuildContext = await esbuild.context({
    ...esbuildConfig,
    plugins: [
      ...(esbuildConfig.plugins ?? []),
      {
        name: 'esbuildWatchPlugin',
        setup(build: any) {
          build.onEnd(addBuildResult)
        },
      },
    ],
  })

  try {
    const firstBuild = await esbuildContext.rebuild()
    addBuildResult(firstBuild)
  } catch (e) {
    // esbuild prints everything we want users to see
  }

  esbuildContext.watch()

  const app = server ? express() : null
  const { httpServer, expressServer, nextApp } = await setupHttpServer(app, {})
  let hasAddedAdminUIMiddleware = false
  const isReady = () => !server || (expressServer !== null && hasAddedAdminUIMiddleware)

  const initKeystone = async () => {
    const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
    const { system, context, prismaClientModule, apolloServer, ...rest } =
      await (async function () {
        const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

        // Generate the Artifacts
        if (prisma) {
          log('✨ Generating GraphQL and Prisma schemas')
          const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
          await generateTypes(cwd, system)
          await generatePrismaClient(cwd, system)

          await handleDatabaseMigration(cwd, system, generatedPrismaSchema, dbPush, prisma)

          const prismaClientModule = require(system.getPaths(cwd).prisma)
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
          log('✅ GraphQL API ready')

          return {
            system,
            context: keystone.context,
            expressServer,
            apolloServer,
            prismaClientModule,
          }
        }
        return {
          system,
        }
      })()

    if (configWithExtendHttp?.server?.extendHttpServer && httpServer && context) {
      configWithExtendHttp.server.extendHttpServer(httpServer, context)
    }

    prismaClient = context?.prisma
    if (rest.expressServer) {
      ;({ expressServer } = rest)
    }

    await setupAdminUI(system, cwd, expressServer, context, nextApp, ui)
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

        // wipe the require cache
        {
          const resolved = require.resolve(paths.config)
          delete require.cache[resolved]
        }

        const newConfigWithHttp = await importBuiltKeystoneConfiguration(cwd)
        const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

        if (prisma) {
          const hasChanges = await checkSchemaChanges(
            originalPrismaSchema,
            newSystem,
            system,
            prisma
          )
          if (hasChanges) {
            return cleanupResources(null, null, '🔄 Your prisma schema has changed, please restart Keystone')
          }
        }

        await handleHotReload(
          cwd,
          newSystem,
          prismaClientModule,
          lastPrintedGraphQLSchema,
          originalPrismaSchema,
          lastApolloServer,
          expressServer,
          nextApp,
          prisma
        )
      } catch (err) {
        console.error(`Error loading your Keystone config`, err)
      }
    }
  }

  // Serve the dev status page for the Admin UI
  let initKeystonePromiseResolve: () => void | undefined
  let initKeystonePromiseReject: (err: any) => void | undefined
  const initKeystonePromise = new Promise<void>((resolve, reject) => {
    initKeystonePromiseResolve = resolve
    initKeystonePromiseReject = reject
  })

  if (app && httpServer) {
    const config = await importBuiltKeystoneConfiguration(cwd)

    await createStatusEndpoint(app, hasAddedAdminUIMiddleware, expressServer)

    const httpOptions: ListenOptions = {
      port: 3000,
    }

    if (config?.server && 'port' in config.server && typeof config.server?.port === 'number') {
      httpOptions.port = config.server.port
    }

    if (config?.server && 'options' in config.server && config.server.options) {
      Object.assign(httpOptions, config.server.options)
    }

    // preference env.PORT if supplied
    if ('PORT' in process.env) {
      httpOptions.port = parseInt(process.env.PORT ?? '')
    }

    // preference env.HOST if supplied
    if ('HOST' in process.env) {
      httpOptions.host = process.env.HOST ?? ''
    }

    const server = httpServer.listen(httpOptions, (err?: any) => {
      if (err) throw err

      const easyHost = [undefined, '', '::', '0.0.0.0'].includes(httpOptions.host)
        ? 'localhost'
        : httpOptions.host
      log(
        `⭐️ Server listening on ${httpOptions.host ?? ''}:${
          httpOptions.port
        } (http://${easyHost}:${httpOptions.port}/)`
      )
      log(`⭐️ GraphQL API available at ${config.graphql?.path ?? '/api/graphql'}`)

      // Don't start initialising Keystone until the dev server is ready,
      // otherwise it slows down the first response significantly
      initKeystone().catch(async err => {
        await cleanupResources(server, null)
        initKeystonePromiseReject(err)
      })
    })

    await initKeystonePromise
    return async () => await cleanupResources(server, null)
  } else {
    await initKeystone()
    return () => Promise.resolve()
  }
}
```