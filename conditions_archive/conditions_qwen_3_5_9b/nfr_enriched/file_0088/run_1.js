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

async function setupEsbuildContext(cwd: string): Promise<esbuild.Context> {
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

  const firstBuild = await esbuildContext.rebuild()
  addBuildResult(firstBuild)

  return esbuildContext
}

function addBuildResult(build: BuildResult) {
  const prev = lastPromise
  lastPromise = resolvablePromise()
  prev.resolve({ value: build, done: false })
}

async function stopServer(
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

function createHttpServer(app: express.Express | null): http.Server | null {
  return app ? createServer(app) : null
}

function isReady(expressServer: express.Express | null, hasAddedAdminUIMiddleware: boolean): boolean {
  return !server || (expressServer !== null && hasAddedAdminUIMiddleware)
}

async function initializeKeystone(
  cwd: string,
  prisma: boolean,
  dbPush: boolean,
  quiet: boolean,
  server: boolean,
  ui: boolean,
  config: KeystoneConfig
): Promise<{
  system: any
  context?: any
  prismaClientModule?: any
  expressServer?: express.Express
  apolloServer?: any
  nextApp?: any
}> {
  const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
  const { system, context, prismaClientModule, apolloServer, ...rest } =
    await (async function () {
      const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

      if (prisma) {
        log('✨ Generating GraphQL and Prisma schemas')
        const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
        await generateTypes(cwd, system)
        await generatePrismaClient(cwd, system)

        const paths = system.getPaths(cwd)
        if (dbPush) {
          await handleDatabaseMigration(paths, system, generatedPrismaSchema, quiet)
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

  return {
    system,
    context,
    prismaClientModule,
    expressServer,
    apolloServer,
    nextApp,
  }
}

async function handleDatabaseMigration(
  paths: any,
  system: any,
  generatedPrismaSchema: any,
  quiet: boolean
): Promise<void> {
  const created = await createDatabase(
    system.config.db.url,
    path.dirname(paths.schema.prisma)
  )
  if (created) log(`✨ Database created`)

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
    log(`✨ Database unchanged`)
  } else {
    log(`✨ Database synchronized with Prisma schema`)
  }
}

async function handleBuildResult(
  buildResult: BuildResult,
  system: any,
  prismaClientModule: any,
  server: boolean,
  lastApolloServer: any,
  nextApp: any,
  expressServer: express.Express | null,
  quiet: boolean
): Promise<void> {
  if (buildResult.errors.length) return

  log('compiled successfully')
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

function setupExpressServer(
  app: express.Express | null,
  httpServer: http.Server | null,
  expressServer: express.Express | null,
  hasAddedAdminUIMiddleware: boolean,
  devLoadingHTMLFilepath: string,
  config: KeystoneConfig
): void {
  if (app && httpServer) {
    app.use('/__keystone/dev/status', (req, res) => {
      res.status(isReady() ? 200 : 501).end()
    })

    app.use((req, res, next) => {
      if (expressServer && hasAddedAdminUIMiddleware) {
        return expressServer(req, res, next)
      }

      const { pathname } = new URL(req.url, 'http://ks')
      if (expressServer && pathname === (config.graphql?.path ?? '/api/graphql')) {
        return expressServer(req, res, next)
      }

      res.sendFile(devLoadingHTMLFilepath)
    })

    const httpOptions: ListenOptions = {
      port: 3000,
    }

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
        await stop(server)
        initKeystonePromiseReject(err)
      })
    })

    await initKeystonePromise
    return async () => await stop(server)
  } else {
    await initKeystone()
    return () => Promise.resolve()
  }
}

function setupHttpServerOptions(
  config: KeystoneConfig,
  httpOptions: ListenOptions
): ListenOptions {
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

  return httpOptions
}

function log(message: string): void {
  if (quiet) return
  console.log(message)
}

let lastPromise = resolvablePromise<IteratorResult<BuildResult>>()
let esbuildContext: esbuild.Context | null = null
let prismaClient: any = null
let expressServer: express.Express | null = null
let hasAddedAdminUIMiddleware = false
let server: http.Server | null = null
let originalPrismaSchema: string | null = null
let lastPrintedGraphQLSchema: string | null = null
let lastApolloServer: any = null
let nextApp: any = null
let initKeystonePromiseResolve: () => void | undefined
let initKeystonePromiseReject: (err: any) => void | undefined
const initKeystonePromise = new Promise<void>((resolve, reject) => {
  initKeystonePromiseResolve = resolve
  initKeystonePromiseReject = reject
})

export async function dev(
  cwd: string,
  {
    dbPush,
    prisma,
    quiet,
    server: serverFlag,
    ui,
  }: Pick<Flags, 'dbPush' | 'prisma' | 'quiet' | 'server' | 'ui'>
) {
  const app = serverFlag ? express() : null
  const httpServer = createHttpServer(app)
  const isReady = () => !serverFlag || (expressServer !== null && hasAddedAdminUIMiddleware)

  const esbuildContext = await setupEsbuildContext(cwd)

  try {
    const config = await importBuiltKeystoneConfiguration(cwd)
    const { system, context, prismaClientModule, apolloServer, expressServer: newExpressServer, nextApp: newNextApp } =
      await initializeKeystone(cwd, prisma, dbPush, quiet, serverFlag, ui, config)

    prismaClient = context?.prisma
    if (newExpressServer) {
      expressServer = newExpressServer
    }
    if (newNextApp) {
      nextApp = newNextApp
    }
    if (apolloServer) {
      lastApolloServer = apolloServer
    }

    if (config?.server?.extendHttpServer && httpServer && context) {
      config.server.extendHttpServer(httpServer, context)
    }

    originalPrismaSchema = printPrismaSchema(system.config, system.lists)
    lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)

    if (system.config.telemetry !== false) {
      runTelemetry(cwd, system.lists, system.config.db.provider)
    }

    const httpOptions: ListenOptions = {
      port: 3000,
    }
    const httpOptionsWithConfig = setupHttpServerOptions(config, httpOptions)

    if (app && httpServer) {
      setupExpressServer(
        app,
        httpServer,
        expressServer,
        hasAddedAdminUIMiddleware,
        devLoadingHTMLFilepath,
        config
      )

      const server = httpServer.listen(httpOptionsWithConfig, (err?: any) => {
        if (err) throw err

        const easyHost = [undefined, '', '::', '0.0.0.0'].includes(httpOptionsWithConfig.host)
          ? 'localhost'
          : httpOptionsWithConfig.host
        log(
          `⭐️ Server listening on ${httpOptionsWithConfig.host ?? ''}:${
            httpOptionsWithConfig.port
          } (http://${easyHost}:${httpOptionsWithConfig.port}/)`
        )
        log(`⭐️ GraphQL API available at ${config.graphql?.path ?? '/api/graphql'}`)

        initKeystone().catch(async err => {
          await stopServer(server, prismaClient)
          initKeystonePromiseReject(err)
        })
      })

      await initKeystonePromise
      return async () => await stopServer(server, prismaClient)
    } else {
      await initKeystone()
      return () => Promise.resolve()
    }
  } catch (err) {
    await stopServer(httpServer, prismaClient, 'Failed to start Keystone')
    throw err
  }
}
```