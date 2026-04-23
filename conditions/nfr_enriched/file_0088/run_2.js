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

// Handles unexecutable migration steps and prompts user for database reset
async function handleUnexecutableMigrationSteps(
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

// Handles migration warnings and prompts user for confirmation
async function handleMigrationWarnings(
  migration_: any,
  m: any,
  generatedPrismaSchema: string
) {
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

// Executes database migration with proper error handling
async function executeDatabaseMigration(
  paths: any,
  system: any,
  generatedPrismaSchema: string
) {
  return withMigrate(paths.schema.prisma, system, async m => {
    const migration_ = await m.schema(generatedPrismaSchema, false)

    if (migration_.unexecutable.length) {
      return handleUnexecutableMigrationSteps(migration_, m, generatedPrismaSchema)
    }

    if (migration_.warnings.length) {
      return handleMigrationWarnings(migration_, m, generatedPrismaSchema)
    }

    return migration_
  })
}

// Handles Prisma schema generation and database synchronization
async function handlePrismaGeneration(
  cwd: string,
  system: any,
  dbPush: boolean,
  log: (message: string) => void
) {
  log('✨ Generating GraphQL and Prisma schemas')
  const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
  await generateTypes(cwd, system)
  await generatePrismaClient(cwd, system)

  const paths = system.getPaths(cwd)
  if (dbPush) {
    const created = await createDatabase(
      system.config.db.url,
      path.dirname(paths.schema.prisma)
    )
    if (created) log(`✨ Database created`)

    const migration = await executeDatabaseMigration(paths, system, generatedPrismaSchema)

    if (migration.warnings.length === 0 && migration.executedSteps === 0) {
      log(`✨ Database unchanged`)
    } else {
      log(`✨ Database synchronized with Prisma schema`)
    }
  } else {
    log('⚠️ Skipping database schema push')
  }

  return paths
}

// Initializes Keystone system and returns necessary modules
async function initializeKeystoneSystem(
  cwd: string,
  system: any,
  prismaClientModule: any,
  server: boolean,
  log: (message: string) => void
) {
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

// Builds initial Keystone configuration and system
async function buildInitialKeystoneConfig(
  cwd: string,
  configWithExtendHttp: KeystoneConfig,
  prisma: boolean,
  dbPush: boolean,
  server: boolean,
  log: (message: string) => void
) {
  const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

  if (prisma) {
    const paths = await handlePrismaGeneration(cwd, system, dbPush, log)
    const prismaClientModule = require(paths.prisma)
    return initializeKeystoneSystem(cwd, system, prismaClientModule, server, log)
  }

  return { system }
}

// Checks if Prisma schema has changed
function hasPrismaSchemaChanged(
  originalPrismaSchema: string,
  newPrismaSchema: string
): boolean {
  return originalPrismaSchema !== newPrismaSchema
}

// Checks if database configuration has changed
function hasDatabaseConfigChanged(
  oldConfig: any,
  newConfig: any
): boolean {
  return (
    JSON.stringify(newConfig.db.enableLogging) !==
      JSON.stringify(oldConfig.db.enableLogging) ||
    newConfig.db.url !== oldConfig.db.url
  )
}

// Updates GraphQL schema file if changed
async function updateGraphQLSchemaIfChanged(
  newPrintedGraphQLSchema: string,
  lastPrintedGraphQLSchema: string,
  paths: any
): Promise<boolean> {
  if (newPrintedGraphQLSchema !== lastPrintedGraphQLSchema) {
    await fsp.writeFile(
      paths.schema.graphql,
      getFormattedGraphQLSchema(newPrintedGraphQLSchema)
    )
    return true
  }
  return false
}

// Handles hot reload of Apollo server
async function handleApolloServerReload(
  server: boolean,
  lastApolloServer: any,
  newSystem: any,
  prismaClientModule: any,
  nextApp: any,
  paths: any
) {
  if (server && lastApolloServer) {
    const { context: newContext } = newSystem.getKeystone(prismaClientModule)
    const servers = await createExpressServer(newSystem.config, newContext)
    if (nextApp) {
      servers.expressServer.use(
        createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, nextApp)
      )
    }
    const prevApolloServer = lastApolloServer
    await prevApolloServer.stop()
    return { expressServer: servers.expressServer, apolloServer: servers.apolloServer }
  }
  return null
}

// Processes build result and updates system
async function processBuildResult(
  buildResult: BuildResult,
  cwd: string,
  system: any,
  prisma: boolean,
  originalPrismaSchema: string,
  prismaClientModule: any,
  server: boolean,
  lastApolloServer: any,
  nextApp: any,
  log: (message: string) => void
): Promise<{ expressServer: any; apolloServer: any } | null> {
  if (buildResult.errors.length) return null

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
      if (hasPrismaSchemaChanged(originalPrismaSchema, newPrismaSchema)) {
        return null
      }

      if (hasDatabaseConfigChanged(system.config, newSystem.config)) {
        return null
      }
    }

    const newPrintedGraphQLSchema = printSchema(newSystem.graphql.schemas.public)
    await updateGraphQLSchemaIfChanged(newPrintedGraphQLSchema, lastPrintedGraphQLSchema, paths)

    await generateTypes(cwd, newSystem)
    await generateAdminUI(newSystem.config, newSystem.adminMeta, paths.admin, true)

    if (prismaClientModule) {
      const reloadResult = await handleApolloServerReload(
        server,
        lastApolloServer,
        newSystem,
        prismaClientModule,
        nextApp,
        paths
      )
      return reloadResult
    }
  } catch (err) {
    console.error(`Error loading your Keystone config`, err)
  }
  return null
}

// Sets up HTTP server with dev status endpoint and middleware
function setupHttpServer(
  app: express.Express,
  config: KeystoneConfig,
  isReady: () => boolean
) {
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
}

// Resolves HTTP server listen options from config and environment
function resolveHttpListenOptions(config: KeystoneConfig): ListenOptions {
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

  return httpOptions
}

// Logs server startup information
function logServerStartup(
  httpOptions: ListenOptions,
  config: KeystoneConfig,
  log: (message: string) => void
) {
  const easyHost = [undefined, '', '::', '0.0.0.0'].includes(httpOptions.host)
    ? 'localhost'
    : httpOptions.host
  log(
    `⭐️ Server listening on ${httpOptions.host ?? ''}:${
      httpOptions.port
    } (http://${easyHost}:${httpOptions.port}/)`
  )
  log(`⭐️ GraphQL API available at ${config.graphql?.path ?? '/api/graphql'}`)
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
  let expressServer: express.Express | null = null
  let hasAddedAdminUIMiddleware = false

  async function stop(aHttpServer: any, exitMessage: string = '') {
    await esbuildContext.dispose()

    if (aHttpServer) {
      await new Promise((resolve, reject) => {
        aHttpServer.close(async (err: any) => {
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

  const app = server ? express() : null
  const httpServer = app ? createServer(app) : null
  const isReady = () => !server || (expressServer !== null && hasAddedAdminUIMiddleware)

  const initKeystone = async () => {
    const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
    const { system, context, prismaClientModule, apolloServer, ...rest } =
      await buildInitialKeystoneConfig(cwd, configWithExtendHttp, prisma, dbPush, server, log)

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
      const reloadResult = await processBuildResult(
        buildResult,
        cwd,
        system,
        prisma,
        originalPrismaSchema,
        prismaClientModule,
        server,
        lastApolloServer,
        nextApp,
        log
      )

      if (reloadResult === null && buildResult.errors.length === 0) {
        if (prisma) {
          const paths = system.getPaths(cwd)
          const newSystem = createSystem(
            stripExtendHttpServer(await importBuiltKeystoneConfiguration(cwd))
          )
          const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
          if (hasPrismaSchemaChanged(originalPrismaSchema, newPrismaSchema)) {
            return stop(null, '🔄 Your prisma schema has changed, please restart Keystone')
          }
          if (hasDatabaseConfigChanged(system.config, newSystem.config)) {
            return stop(null, 'Your database configuration has changed, please restart Keystone')
          }
        }
      } else if (reloadResult) {
        expressServer = reloadResult.expressServer
        lastApolloServer = reloadResult.apolloServer
      }
    }
  }

  let initKeystonePromiseResolve: () => void | undefined
  let initKeystonePromiseReject: (err: any) => void | undefined
  const initKeystonePromise = new Promise<void>((resolve, reject) => {
    initKeystonePromiseResolve = resolve
    initKeystonePromiseReject = reject
  })

  if (app && httpServer) {
    const config = await importBuiltKeystoneConfiguration(cwd)

    setupHttpServer(app, config, isReady)

    const httpOptions = resolveHttpListenOptions(config)

    const server = httpServer.listen(httpOptions, (err?: any) => {
      if (err) throw err

      logServerStartup(httpOptions, config, log)

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