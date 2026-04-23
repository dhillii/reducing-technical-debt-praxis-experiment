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

// Handle unexecutable migration steps
async function handleUnexecutableSteps(
  migration_: any,
  m: any,
  generatedPrismaSchema: string
): Promise<any> {
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

// Handle migration warnings
async function handleMigrationWarnings(
  migration_: any,
  m: any,
  generatedPrismaSchema: string
): Promise<any> {
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

// Execute database migration with user prompts
async function executeDatabaseMigration(
  paths: any,
  system: any,
  generatedPrismaSchema: string
): Promise<any> {
  return withMigrate(paths.schema.prisma, system, async m => {
    const migration_ = await m.schema(generatedPrismaSchema, false)

    if (migration_.unexecutable.length) {
      return handleUnexecutableSteps(migration_, m, generatedPrismaSchema)
    }

    if (migration_.warnings.length) {
      return handleMigrationWarnings(migration_, m, generatedPrismaSchema)
    }

    return migration_
  })
}

// Initialize Prisma and database
async function initializePrismaAndDatabase(
  cwd: string,
  system: any,
  dbPush: boolean,
  log: (msg: string) => void
): Promise<{ prismaClientModule: any; keystone: any } | null> {
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

  const prismaClientModule = require(paths.prisma)
  const keystone = system.getKeystone(prismaClientModule)

  log('✨ Connecting to the database')
  await keystone.connect()

  return { prismaClientModule, keystone }
}

// Create express server if needed
async function createExpressServerIfNeeded(
  system: any,
  prismaClientModule: any,
  log: (msg: string) => void
): Promise<{ apolloServer: any; expressServer: any } | null> {
  log('✨ Creating server')
  const keystone = system.getKeystone(prismaClientModule)
  const { apolloServer, expressServer } = await createExpressServer(
    system.config,
    keystone.context
  )
  log(`✅ GraphQL API ready`)
  return { apolloServer, expressServer }
}

// Initialize admin UI
async function initializeAdminUI(
  system: any,
  context: any,
  expressServer: express.Express,
  cwd: string,
  log: (msg: string) => void
): Promise<any> {
  if (system.config.ui?.isDisabled) {
    return null
  }

  log('✨ Generating Admin UI code')
  const paths = system.getPaths(cwd)
  await fsp.rm(paths.admin, { recursive: true, force: true })
  await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

  log('✨ Preparing Admin UI')
  const nextApp = next({ dev: true, dir: paths.admin })
  await nextApp.prepare()
  expressServer.use(createAdminUIMiddlewareWithNextApp(system.config, context, nextApp))
  log(`✅ Admin UI ready`)

  return nextApp
}

// Handle build result processing
async function processBuildResult(
  buildResult: BuildResult,
  system: any,
  originalPrismaSchema: string,
  lastPrintedGraphQLSchema: string,
  lastApolloServer: any,
  cwd: string,
  prisma: boolean,
  server: boolean,
  prismaClientModule: any,
  expressServer: express.Express | null,
  nextApp: any,
  log: (msg: string) => void,
  stop: (httpServer: any, msg: string) => Promise<void>
): Promise<{
  lastPrintedGraphQLSchema: string
  lastApolloServer: any
  expressServer: express.Express | null
}> {
  if (buildResult.errors.length) {
    return { lastPrintedGraphQLSchema, lastApolloServer, expressServer }
  }

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
        await stop(null, '🔄 Your prisma schema has changed, please restart Keystone')
        return { lastPrintedGraphQLSchema, lastApolloServer, expressServer }
      }

      if (
        JSON.stringify(newSystem.config.db.enableLogging) !==
          JSON.stringify(system.config.db.enableLogging) ||
        newSystem.config.db.url !== system.config.db.url
      ) {
        await stop(null, 'Your database configuration has changed, please restart Keystone')
        return { lastPrintedGraphQLSchema, lastApolloServer, expressServer }
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

    if (prismaClientModule && server && lastApolloServer) {
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
  } catch (err) {
    console.error(`Error loading your Keystone config`, err)
  }

  return { lastPrintedGraphQLSchema, lastApolloServer, expressServer }
}

// Setup HTTP server middleware and listeners
function setupHttpServerMiddleware(
  app: express.Express,
  config: KeystoneConfig,
  isReady: () => boolean
): void {
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

// Resolve HTTP server options from config and environment
function resolveHttpOptions(config: KeystoneConfig): ListenOptions {
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

// Log server startup information
function logServerStartup(config: KeystoneConfig, httpOptions: ListenOptions, log: (msg: string) => void): void {
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
  let expressServer: express.Express | null = null
  let hasAddedAdminUIMiddleware = false
  const isReady = () => !server || (expressServer !== null && hasAddedAdminUIMiddleware)

  const initKeystone = async () => {
    const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
    let system: any
    let context: any
    let prismaClientModule: any
    let apolloServer: any

    const configWithoutExtendHttp = stripExtendHttpServer(configWithExtendHttp)
    system = createSystem(configWithoutExtendHttp)

    if (prisma) {
      const prismaResult = await initializePrismaAndDatabase(cwd, system, dbPush, log)
      if (!prismaResult) return

      prismaClientModule = prismaResult.prismaClientModule
      const keystone = prismaResult.keystone
      context = keystone.context

      if (server) {
        const serverResult = await createExpressServerIfNeeded(system, prismaClientModule, log)
        if (serverResult) {
          apolloServer = serverResult.apolloServer
          expressServer = serverResult.expressServer
        }
      }
    }

    if (configWithExtendHttp?.server?.extendHttpServer && httpServer && context) {
      configWithExtendHttp.server.extendHttpServer(httpServer, context)
    }

    prismaClient = context?.prisma

    let nextApp: any = null
    if (!system.config.ui?.isDisabled && ui && expressServer && context) {
      nextApp = await initializeAdminUI(system, context, expressServer, cwd, log)
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
      const result = await processBuildResult(
        buildResult,
        system,
        originalPrismaSchema,
        lastPrintedGraphQLSchema,
        lastApolloServer,
        cwd,
        prisma,
        server,
        prismaClientModule,
        expressServer,
        nextApp,
        log,
        stop
      )
      lastPrintedGraphQLSchema = result.lastPrintedGraphQLSchema
      lastApolloServer = result.lastApolloServer
      expressServer = result.expressServer
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

    setupHttpServerMiddleware(app, config, isReady)

    const httpOptions = resolveHttpOptions(config)

    const server = httpServer.listen(httpOptions, (err?: any) => {
      if (err) throw err

      logServerStartup(config, httpOptions, log)

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