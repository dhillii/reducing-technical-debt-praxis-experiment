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

/** Check if migration has unexecutable steps */
function hasMigrationUnexecutableSteps(migration: any): boolean {
  return migration.unexecutable.length > 0
}

/** Check if migration has warnings */
function hasMigrationWarnings(migration: any): boolean {
  return migration.warnings.length > 0
}

/** Check if database config has changed */
function hasDatabaseConfigChanged(newConfig: any, oldConfig: any): boolean {
  return (
    JSON.stringify(newConfig.db.enableLogging) !==
      JSON.stringify(oldConfig.db.enableLogging) ||
    newConfig.db.url !== oldConfig.db.url
  )
}

/** Check if GraphQL schema has changed */
function hasGraphQLSchemaChanged(newSchema: string, oldSchema: string): boolean {
  return newSchema !== oldSchema
}

/** Check if Prisma schema has changed */
function hasPrismaSchemaChanged(newSchema: string, oldSchema: string): boolean {
  return newSchema !== oldSchema
}

/** Check if server config has port property */
function hasServerPort(config: any): boolean {
  return config?.server && 'port' in config.server && typeof config.server?.port === 'number'
}

/** Check if server config has options property */
function hasServerOptions(config: any): boolean {
  return config?.server && 'options' in config.server && config.server.options
}

/** Check if PORT environment variable is set */
function hasPortEnv(): boolean {
  return 'PORT' in process.env
}

/** Check if HOST environment variable is set */
function hasHostEnv(): boolean {
  return 'HOST' in process.env
}

/** Check if UI should be disabled */
function isUIDisabled(systemConfig: any, uiFlag: boolean): boolean {
  return systemConfig.config.ui?.isDisabled || !uiFlag
}

/** Check if ready to serve requests */
function isServerReady(server: boolean, expressServer: any, hasAdminUI: boolean): boolean {
  return !server || (expressServer !== null && hasAdminUI)
}

/** Print unexecutable migration steps */
function printUnexecutableSteps(migration: any): void {
  console.error(
    `${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`
  )
  for (const item of migration.unexecutable) {
    console.error(`  • ${item}`)
  }
}

/** Print migration warnings */
function printMigrationWarnings(migration: any): void {
  console.error(chalk.bold(`\n⚠️  Warnings:\n`))
  for (const warning of migration.warnings) {
    console.error(`  • ${warning}`)
  }
}

/** Handle unexecutable migration steps */
async function handleUnexecutableMigration(migration: any, m: any): Promise<any> {
  printUnexecutableSteps(migration)

  if (hasMigrationWarnings(migration)) {
    printMigrationWarnings(migration)
  }

  console.error('\nTo apply this migration, we need to reset the database')
  const shouldContinue = await confirmPrompt(
    `Do you want to continue? ${chalk.red('The database will be reset')}`,
    false
  )

  if (!shouldContinue) {
    throw new ExitError(1, 'Database reset cancelled by user')
  }

  await m.reset()
  return m.schema(migration.generatedPrismaSchema, false)
}

/** Handle migration with warnings */
async function handleMigrationWarnings(migration: any, generatedPrismaSchema: string, m: any): Promise<any> {
  printMigrationWarnings(migration)

  const shouldContinue = await confirmPrompt(
    `Do you want to continue? ${chalk.red('Some data will be lost')}`,
    false
  )

  if (!shouldContinue) {
    throw new ExitError(1, 'Database push cancelled by user')
  }

  return m.schema(generatedPrismaSchema, true)
}

/** Process migration result */
async function processMigration(
  migration: any,
  generatedPrismaSchema: string,
  m: any,
  log: (msg: string) => void
): Promise<any> {
  if (hasMigrationUnexecutableSteps(migration)) {
    return handleUnexecutableMigration(migration, m)
  }

  if (hasMigrationWarnings(migration)) {
    return handleMigrationWarnings(migration, generatedPrismaSchema, m)
  }

  return migration
}

/** Log database sync status */
function logDatabaseSyncStatus(migration: any, log: (msg: string) => void): void {
  if (migration.warnings.length === 0 && migration.executedSteps === 0) {
    log(`✨ Database unchanged`)
  } else {
    log(`✨ Database synchronized with Prisma schema`)
  }
}

/** Apply database migrations */
async function applyDatabaseMigrations(
  paths: any,
  system: any,
  generatedPrismaSchema: string,
  log: (msg: string) => void
): Promise<void> {
  const migration = await withMigrate(paths.schema.prisma, system, async m => {
    const migration_ = await m.schema(generatedPrismaSchema, false)
    return processMigration(migration_, generatedPrismaSchema, m, log)
  })

  logDatabaseSyncStatus(migration, log)
}

/** Initialize Prisma and create Keystone instance */
async function initializePrismaAndKeystone(
  cwd: string,
  system: any,
  prisma: boolean,
  dbPush: boolean,
  server: boolean,
  log: (msg: string) => void
): Promise<any> {
  if (!prisma) {
    return { system }
  }

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

    await applyDatabaseMigrations(paths, system, generatedPrismaSchema, log)
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

/** Setup Admin UI if enabled */
async function setupAdminUI(
  system: any,
  context: any,
  expressServer: any,
  cwd: string,
  ui: boolean,
  log: (msg: string) => void
): Promise<any> {
  if (isUIDisabled(system, ui)) {
    return null
  }

  if (!expressServer || !context) {
    throw new TypeError('Error trying to prepare the Admin UI')
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

/** Apply server configuration from config */
function applyServerConfig(httpOptions: ListenOptions, config: any): void {
  if (hasServerPort(config)) {
    httpOptions.port = config.server.port
  }

  if (hasServerOptions(config)) {
    Object.assign(httpOptions, config.server.options)
  }

  if (hasPortEnv()) {
    httpOptions.port = parseInt(process.env.PORT ?? '')
  }

  if (hasHostEnv()) {
    httpOptions.host = process.env.HOST ?? ''
  }
}

/** Get display host for logging */
function getDisplayHost(host: string | undefined): string {
  return [undefined, '', '::', '0.0.0.0'].includes(host) ? 'localhost' : host
}

/** Handle build result for schema changes */
async function handleBuildResult(
  buildResult: BuildResult,
  cwd: string,
  system: any,
  prisma: boolean,
  originalPrismaSchema: string,
  lastPrintedGraphQLSchema: string,
  prismaClientModule: any,
  server: boolean,
  lastApolloServer: any,
  nextApp: any,
  log: (msg: string) => void
): Promise<{ shouldStop: boolean; newState?: any }> {
  if (buildResult.errors.length) {
    return { shouldStop: false }
  }

  log('compiled successfully')

  try {
    const paths = system.getPaths(cwd)
    const resolved = require.resolve(paths.config)
    delete require.cache[resolved]

    const newConfigWithHttp = await importBuiltKeystoneConfiguration(cwd)
    const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

    if (prisma) {
      if (!originalPrismaSchema) {
        throw new TypeError('Missing Prisma schema source')
      }

      const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
      if (hasPrismaSchemaChanged(newPrismaSchema, originalPrismaSchema)) {
        return {
          shouldStop: true,
          newState: { message: '🔄 Your prisma schema has changed, please restart Keystone' }
        }
      }

      if (hasDatabaseConfigChanged(newSystem.config, system.config)) {
        return {
          shouldStop: true,
          newState: { message: 'Your database configuration has changed, please restart Keystone' }
        }
      }
    }

    const newPrintedGraphQLSchema = printSchema(newSystem.graphql.schemas.public)
    if (hasGraphQLSchemaChanged(newPrintedGraphQLSchema, lastPrintedGraphQLSchema)) {
      await fsp.writeFile(
        paths.schema.graphql,
        getFormattedGraphQLSchema(newPrintedGraphQLSchema)
      )
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

      const prevApolloServer = lastApolloServer
      await prevApolloServer.stop()

      return {
        shouldStop: false,
        newState: {
          expressServer: servers.expressServer,
          lastApolloServer: servers.apolloServer,
          lastPrintedGraphQLSchema: newPrintedGraphQLSchema,
          newSystem
        }
      }
    }

    return {
      shouldStop: false,
      newState: {
        lastPrintedGraphQLSchema: newPrintedGraphQLSchema,
        newSystem
      }
    }
  } catch (err) {
    console.error(`Error loading your Keystone config`, err)
    return { shouldStop: false }
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

  const initKeystone = async () => {
    const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
    const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

    const result = await initializePrismaAndKeystone(
      cwd,
      system,
      prisma,
      dbPush,
      server,
      log
    )

    const { context, prismaClientModule, apolloServer, ...rest } = result

    if (configWithExtendHttp?.server?.extendHttpServer && httpServer && context) {
      configWithExtendHttp.server.extendHttpServer(httpServer, context)
    }

    prismaClient = context?.prisma
    if (rest.expressServer) {
      ;({ expressServer } = rest)
    }

    let nextApp = null
    if (!isUIDisabled(system, ui)) {
      nextApp = await setupAdminUI(system, context, expressServer, cwd, ui, log)
    }

    hasAddedAdminUIMiddleware = true
    initKeystonePromiseResolve()

    const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
    let lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)
    let lastApolloServer = apolloServer ?? null
    let currentSystem = system

    if (system.config.telemetry !== false) {
      runTelemetry(cwd, system.lists, system.config.db.provider)
    }

    for await (const buildResult of builds) {
      const { shouldStop, newState } = await handleBuildResult(
        buildResult,
        cwd,
        currentSystem,
        prisma,
        originalPrismaSchema,
        lastPrintedGraphQLSchema,
        prismaClientModule,
        server,
        lastApolloServer,
        nextApp,
        log
      )

      if (shouldStop) {
        return stop(null, newState?.message ?? '')
      }

      if (newState) {
        if (newState.newSystem) currentSystem = newState.newSystem
        if (newState.lastPrintedGraphQLSchema) lastPrintedGraphQLSchema = newState.lastPrintedGraphQLSchema
        if (newState.lastApolloServer) lastApolloServer = newState.lastApolloServer
        if (newState.expressServer) expressServer = newState.expressServer
      }
    }
  }

  let initKeystonePromiseResolve: () => void | undefined
  let initKeystonePromiseReject: (err: any) => void | undefined
  const initKeystonePromise = new Promise<void>((resolve, reject) => {
    initKeystonePromiseResolve = resolve
    initKeystonePromiseReject = reject
  })

  if (!app || !httpServer) {
    await initKeystone()
    return () => Promise.resolve()
  }

  const config = await importBuiltKeystoneConfiguration(cwd)

  app.use('/__keystone/dev/status', (req, res) => {
    res.status(isServerReady(server, expressServer, hasAddedAdminUIMiddleware) ? 200 : 501).end()
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

  applyServerConfig(httpOptions, config)

  const httpServer_ = httpServer.listen(httpOptions, (err?: any) => {
    if (err) throw err

    const easyHost = getDisplayHost(httpOptions.host)
    log(
      `⭐️ Server listening on ${httpOptions.host ?? ''}:${
        httpOptions.port
      } (http://${easyHost}:${httpOptions.port}/)`
    )
    log(`⭐️ GraphQL API available at ${config.graphql?.path ?? '/api/graphql'}`)

    initKeystone().catch(async err => {
      await stop(httpServer_)
      initKeystonePromiseReject(err)
    })
  })

  await initKeystonePromise
  return async () => await stop(httpServer_)
}