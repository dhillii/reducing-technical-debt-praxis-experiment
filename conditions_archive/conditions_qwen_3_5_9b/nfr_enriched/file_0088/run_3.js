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

async function setupServer(
  app: express.Express | null,
  config: KeystoneConfig
): Promise<{ httpServer: any; expressServer: express.Express | null }> {
  const httpServer = app ? createServer(app) : null
  let expressServer: express.Express | null = null

  if (app) {
    const configWithHttp = await importBuiltKeystoneConfiguration(app)
    const { expressServer: es, ...rest } = await createExpressServer(
      configWithHttp,
      null
    )
    expressServer = es
  }

  return { httpServer, expressServer }
}

async function setupPrisma(
  cwd: string,
  system: any,
  prisma: boolean,
  dbPush: boolean
): Promise<{
  prismaClient: any
  keystone: any
  context: any
  apolloServer: any
  prismaClientModule: any
}> {
  if (prisma) {
    const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
    await generateTypes(cwd, system)
    await generatePrismaClient(cwd, system)

    const paths = system.getPaths(cwd)
    if (dbPush) {
      const created = await createDatabase(
        system.config.db.url,
        path.dirname(paths.schema.prisma)
      )
      if (created) console.log('✨ Database created')

      const migration = await withMigrate(paths.schema.prisma, system, async m => {
        const migration_ = await m.schema(generatedPrismaSchema, false)

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

      if (migration.warnings.length === 0 && migration.executedSteps === 0) {
        console.log('✨ Database unchanged')
      } else {
        console.log('✨ Database synchronized with Prisma schema')
      }
    } else {
      console.log('⚠️ Skipping database schema push')
    }

    const prismaClientModule = require(paths.prisma)
    const keystone = system.getKeystone(prismaClientModule)

    console.log('✨ Connecting to the database')
    await keystone.connect()

    const { apolloServer, expressServer } = await createExpressServer(
      system.config,
      keystone.context
    )

    return {
      prismaClient: keystone.context?.prisma,
      keystone,
      context: keystone.context,
      apolloServer,
      prismaClientModule,
    }
  }

  return {
    prismaClient: null,
    keystone: null,
    context: null,
    apolloServer: null,
    prismaClientModule: null,
  }
}

async function setupAdminUI(
  system: any,
  expressServer: express.Express | null,
  context: any,
  nextApp: any,
  ui: boolean
): Promise<void> {
  if (!system.config.ui?.isDisabled && ui) {
    if (!expressServer || !context) {
      throw new TypeError('Error trying to prepare the Admin UI')
    }

    console.log('✨ Generating Admin UI code')
    const paths = system.getPaths(cwd)
    await fsp.rm(paths.admin, { recursive: true, force: true })
    await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

    console.log('✨ Preparing Admin UI')
    nextApp = next({ dev: true, dir: paths.admin })
    await nextApp.prepare()
    expressServer.use(
      createAdminUIMiddlewareWithNextApp(system.config, context, nextApp)
    )
    console.log('✅ Admin UI ready')
  }
}

function checkSchemaChanges(
  originalPrismaSchema: string | null,
  newPrismaSchema: string | null,
  originalGraphQLSchema: string,
  newGraphQLSchema: string,
  prismaClientModule: any | null,
  lastApolloServer: any | null,
  newSystem: any,
  expressServer: express.Express | null,
  nextApp: any | null
): boolean {
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

  if (newGraphQLSchema !== originalGraphQLSchema) {
    return true
  }

  if (prismaClientModule && lastApolloServer && expressServer) {
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
    return true
  }

  return false
}

async function cleanup(
  esbuildContext: any,
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

async function handleBuildResult(
  cwd: string,
  system: any,
  prisma: boolean,
  originalPrismaSchema: string | null,
  originalGraphQLSchema: string,
  lastApolloServer: any | null,
  expressServer: express.Express | null,
  nextApp: any | null,
  prismaClientModule: any | null
): Promise<void> {
  if (system.config.telemetry !== false) {
    runTelemetry(cwd, system.lists, system.config.db.provider)
  }

  for await (const buildResult of builds) {
    if (buildResult.errors.length) continue

    console.log('compiled successfully')
    try {
      const paths = system.getPaths(cwd)

      const resolved = require.resolve(paths.config)
      delete require.cache[resolved]

      const newConfigWithHttp = await importBuiltKeystoneConfiguration(cwd)
      const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

      if (prisma) {
        if (!originalPrismaSchema) throw new TypeError('Missing Prisma schema source')

        const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
        if (originalPrismaSchema !== newPrismaSchema) {
          return cleanup(null, null, null, '🔄 Your prisma schema has changed, please restart Keystone')
        }

        if (
          JSON.stringify(newSystem.config.db.enableLogging) !==
            JSON.stringify(system.config.db.enableLogging) ||
          newSystem.config.db.url !== system.config.db.url
        ) {
          return cleanup(null, null, null, 'Your database configuration has changed, please restart Keystone')
        }
      }

      const newPrintedGraphQLSchema = printSchema(newSystem.graphql.schemas.public)
      if (newPrintedGraphQLSchema !== originalGraphQLSchema) {
        await fsp.writeFile(
          paths.schema.graphql,
          getFormattedGraphQLSchema(newPrintedGraphQLSchema)
        )
        originalGraphQLSchema = newPrintedGraphQLSchema
      }

      await generateTypes(cwd, newSystem)
      await generateAdminUI(newSystem.config, newSystem.adminMeta, paths.admin, true)
      if (prismaClientModule) {
        if (expressServer && lastApolloServer) {
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
  const esbuildContext = await esbuild.context({
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

  let prismaClient: any = null
  let httpServer: any = null
  let expressServer: express.Express | null = null
  let hasAddedAdminUIMiddleware = false
  let nextApp: any = null
  let lastApolloServer: any = null
  let originalPrismaSchema: string | null = null
  let originalGraphQLSchema: string = ''
  let prismaClientModule: any = null

  const isReady = () => !server || (expressServer !== null && hasAddedAdminUIMiddleware)

  const initKeystone = async () => {
    const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
    const { system, context, prismaClientModule: pm, apolloServer, ...rest } =
      await (async function () {
        const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

        if (prisma) {
          log('✨ Generating GraphQL and Prisma schemas')
          const result = await setupPrisma(cwd, system, prisma, dbPush)
          prismaClient = result.prismaClient
          prismaClientModule = result.prismaClientModule
          lastApolloServer = result.apolloServer
          originalPrismaSchema = printPrismaSchema(system.config, system.lists)
          originalGraphQLSchema = printSchema(system.graphql.schemas.public)

          if (!server) {
            return {
              system,
              context: result.context,
              prismaClientModule: result.prismaClientModule,
            }
          }

          log('✨ Creating server')
          const { apolloServer: as, expressServer: es } = await createExpressServer(
            system.config,
            result.context
          )
          log('✅ GraphQL API ready')

          return {
            system,
            context: result.context,
            expressServer: es,
            apolloServer: as,
            prismaClientModule: result.prismaClientModule,
          }
        }
        return {
          system,
        }
      })()

    if (configWithExtendHttp?.server?.extendHttpServer && httpServer && context) {
      configWithExtendHttp.server.extendHttpServer(httpServer, context)
    }

    if (rest.expressServer) {
      ;({ expressServer } = rest)
    }

    let nextApp: any = null
    if (!system.config.ui?.isDisabled && ui) {
      if (!expressServer || !context) throw new TypeError('Error trying to prepare the Admin UI')

      log('✨ Generating Admin UI code')
      const paths = system.getPaths(cwd)
      await fsp.rm(paths.admin, { recursive: true, force: true })
      await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

      log('✨ Preparing Admin UI')
      nextApp = next({ dev: true, dir: paths.admin })
      await nextApp.prepare()
      expressServer.use(
        createAdminUIMiddlewareWithNextApp(system.config, context, nextApp)
      )
      log('✅ Admin UI ready')
    }

    hasAddedAdminUIMiddleware = true
    initKeystonePromiseResolve()

    if (system.config.telemetry !== false) {
      runTelemetry(cwd, system.lists, system.config.db.provider)
    }
  }

  // Serve the dev status page for the Admin UI
  let initKeystonePromiseResolve: () => void | undefined
  let initKeystonePromiseReject: (err: any) => void | undefined
  const initKeystonePromise = new Promise<void>((resolve, reject) => {
    initKeystonePromiseResolve = resolve
    initKeystonePromiseReject = reject
  })

  if (server) {
    const app = express()
    const { httpServer, expressServer: es } = await setupServer(app, await importBuiltKeystoneConfiguration(cwd))
    httpServer = httpServer
    expressServer = es

    app.use('/__keystone/dev/status', (req, res) => {
      res.status(isReady() ? 200 : 501).end()
    })

    app.use((req, res, next) => {
      if (expressServer && hasAddedAdminUIMiddleware) {
        return expressServer(req, res, next)
      }

      const { pathname } = new URL(req.url, 'http://ks')
      if (expressServer && pathname === (await importBuiltKeystoneConfiguration(cwd)).graphql?.path ?? '/api/graphql') {
        return expressServer(req, res, next)
      }

      res.sendFile(devLoadingHTMLFilepath)
    })

    const httpOptions: ListenOptions = {
      port: 3000,
    }

    const config = await importBuiltKeystoneConfiguration(cwd)
    if (config?.server && 'port' in config.server && typeof config.server?.port === 'number') {
      httpOptions.port = config.server.port
    }

    if (config?.server && 'options' in config.server && config.server.options) {
      Object.assign(httpOptions, config.server.options)
    }

    if ('PORT' in process.env) {
      httpOptions.port = parseInt(process.env.PORT ?? '')
    }

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

      initKeystone().catch(async err => {
        await cleanup(esbuildContext, server, prismaClient)
        initKeystonePromiseReject(err)
      })
    })

    await initKeystonePromise
    return async () => await cleanup(esbuildContext, server, prismaClient)
  } else {
    await initKeystone()
    return () => Promise.resolve()
  }
}
```