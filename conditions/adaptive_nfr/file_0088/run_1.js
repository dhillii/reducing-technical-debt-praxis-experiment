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

/** Check if Prisma schema has changed between configurations */
function hasPrismaSchemaChanged(
  originalSchema: string,
  newSchema: string
): boolean {
  return originalSchema !== newSchema
}

/** Check if database configuration has changed */
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

/** Check if GraphQL schema has changed */
function hasGraphQLSchemaChanged(
  newSchema: string,
  lastSchema: string
): boolean {
  return newSchema !== lastSchema
}

/** Check if server port is configured in config */
function isPortConfigured(config: any): boolean {
  return config?.server && 'port' in config.server && typeof config.server?.port === 'number'
}

/** Check if server options are configured in config */
function areServerOptionsConfigured(config: any): boolean {
  return config?.server && 'options' in config.server && config.server.options
}

/** Check if host should be treated as localhost */
function shouldUseLocalhost(host: string | undefined): boolean {
  return [undefined, '', '::', '0.0.0.0'].includes(host)
}

/** Check if migration has unexecutable steps */
function hasMigrationUnexecutableSteps(migration: any): boolean {
  return migration.unexecutable.length > 0
}

/** Check if migration has warnings */
function hasMigrationWarnings(migration: any): boolean {
  return migration.warnings.length > 0
}

/** Check if database is unchanged after migration */
function isDatabaseUnchanged(migration: any): boolean {
  return migration.warnings.length === 0 && migration.executedSteps === 0
}

/** Handle unexecutable migration steps */
async function handleUnexecutableMigration(
  migration: any,
  m: any,
  generatedPrismaSchema: string
): Promise<any> {
  console.error(
    `${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`
  )
  for (const item of migration.unexecutable) {
    console.error(`  • ${item}`)
  }

  if (hasMigrationWarnings(migration)) {
    console.error(chalk.bold(`\n⚠️  Warnings:\n`))
    for (const warning of migration.warnings) {
      console.error(`  • ${warning}`)
    }
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
  return m.schema(generatedPrismaSchema, false)
}

/** Handle migration with warnings */
async function handleMigrationWarnings(
  migration: any,
  m: any,
  generatedPrismaSchema: string
): Promise<any> {
  console.error(chalk.bold(`\n⚠️  Warnings:\n`))
  for (const warning of migration.warnings) {
    console.error(`  • ${warning}`)
  }

  const shouldContinue = await confirmPrompt(
    `Do you want to continue? ${chalk.red('Some data will be lost')}`,
    false
  )

  if (!shouldContinue) {
    throw new ExitError(1, 'Database push cancelled by user')
  }

  return m.schema(generatedPrismaSchema, true)
}

/** Process database migration */
async function processDatabaseMigration(
  migration: any,
  m: any,
  generatedPrismaSchema: string
): Promise<any> {
  if (hasMigrationUnexecutableSteps(migration)) {
    return handleUnexecutableMigration(migration, m, generatedPrismaSchema)
  }

  if (hasMigrationWarnings(migration)) {
    return handleMigrationWarnings(migration, m, generatedPrismaSchema)
  }

  return migration
}

/** Apply database push with migrations */
async function applyDatabasePush(
  paths: any,
  system: any,
  generatedPrismaSchema: string
): Promise<any> {
  return withMigrate(paths.schema.prisma, system, async m => {
    const migration = await m.schema(generatedPrismaSchema, false)
    return processDatabaseMigration(migration, m, generatedPrismaSchema)
  })
}

/** Initialize Prisma and generate artifacts */
async function initializePrismaArtifacts(
  cwd: string,
  system: any,
  prisma: boolean,
  dbPush: boolean,
  log: (msg: string) => void
): Promise<{ prismaClientModule: any; keystone: any } | null> {
  if (!prisma) {
    return null
  }

  log('✨ Generating GraphQL and Prisma schemas')
  const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
  await generateTypes(cwd, system)
  await generatePrismaClient(cwd, system)

  const paths = system.getPaths(cwd)

  if (!dbPush) {
    log('⚠️ Skipping database schema push')
    const prismaClientModule = require(paths.prisma)
    const keystone = system.getKeystone(prismaClientModule)
    log('✨ Connecting to the database')
    await keystone.connect()
    return { prismaClientModule, keystone }
  }

  const created = await createDatabase(
    system.config.db.url,
    path.dirname(paths.schema.prisma)
  )
  if (created) log(`✨ Database created`)

  const migration = await applyDatabasePush(paths, system, generatedPrismaSchema)

  if (isDatabaseUnchanged(migration)) {
    log(`✨ Database unchanged`)
  } else {
    log(`✨ Database synchronized with Prisma schema`)
  }

  const prismaClientModule = require(paths.prisma)
  const keystone = system.getKeystone(prismaClientModule)

  log('✨ Connecting to the database')
  await keystone.connect()
  return { prismaClientModule, keystone }
}

/** Initialize express server if needed */
async function initializeExpressServer(
  system: any,
  keystone: any,
  server: boolean,
  log: (msg: string) => void
): Promise<{ apolloServer: any; expressServer: any } | null> {
  if (!server) {
    return null
  }

  log('✨ Creating server')
  const { apolloServer, expressServer } = await createExpressServer(
    system.config,
    keystone.context
  )
  log(`✅ GraphQL API ready`)

  return { apolloServer, expressServer }
}

/** Initialize admin UI if enabled */
async function initializeAdminUI(
  system: any,
  expressServer: any,
  context: any,
  cwd: string,
  ui: boolean,
  log: (msg: string) => void
): Promise<any> {
  if (system.config.ui?.isDisabled || !ui) {
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

/** Validate configuration changes don't require restart */
function validateConfigurationChanges(
  prisma: boolean,
  originalPrismaSchema: string,
  newSystem: any,
  system: any,
  newPrismaSchema: string
): void {
  if (!prisma) {
    return
  }

  if (!originalPrismaSchema) {
    throw new TypeError('Missing Prisma schema source')
  }

  if (hasPrismaSchemaChanged(originalPrismaSchema, newPrismaSchema)) {
    throw new ExitError(1, '🔄 Your prisma schema has changed, please restart Keystone')
  }

  if (hasDatabaseConfigChanged(system.config, newSystem.config)) {
    throw new ExitError(1, 'Your database configuration has changed, please restart Keystone')
  }
}

/** Update GraphQL schema file if changed */
async function updateGraphQLSchemaIfChanged(
  newPrintedGraphQLSchema: string,
  lastPrintedGraphQLSchema: string,
  paths: any
): Promise<boolean> {
  if (!hasGraphQLSchemaChanged(newPrintedGraphQLSchema, lastPrintedGraphQLSchema)) {
    return false
  }

  await fsp.writeFile(
    paths.schema.graphql,
    getFormattedGraphQLSchema(newPrintedGraphQLSchema)
  )
  return true
}

/** Update express and apollo servers if needed */
async function updateServersIfNeeded(
  server: boolean,
  lastApolloServer: any,
  newSystem: any,
  prismaClientModule: any,
  nextApp: any
): Promise<{ expressServer: any; apolloServer: any } | null> {
  if (!server || !lastApolloServer || !prismaClientModule) {
    return null
  }

  const { context: newContext } = newSystem.getKeystone(prismaClientModule)
  const servers = await createExpressServer(newSystem.config, newContext)

  if (nextApp) {
    servers.expressServer.use(
      createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, nextApp)
    )
  }

  await lastApolloServer.stop()

  return servers
}

/** Apply build result updates */
async function applyBuildUpdates(
  buildResult: BuildResult,
  cwd: string,
  system: any,
  prisma: boolean,
  server: boolean,
  originalPrismaSchema: string,
  log: (msg: string) => void,
  stop: (httpServer: any, msg: string) => Promise<void>,
  prismaClientModule: any,
  nextApp: any
): Promise<{
  newSystem: any
  newPrintedGraphQLSchema: string
  newExpressServer?: any
  newApolloServer?: any
}> {
  if (buildResult.errors.length) {
    throw new Error('Build has errors')
  }

  log('compiled successfully')

  const paths = system.getPaths(cwd)
  const resolved = require.resolve(paths.config)
  delete require.cache[resolved]

  const newConfigWithHttp = await importBuiltKeystoneConfiguration(cwd)
  const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))
  const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)

  validateConfigurationChanges(
    prisma,
    originalPrismaSchema,
    newSystem,
    system,
    newPrismaSchema
  )

  const newPrintedGraphQLSchema = printSchema(newSystem.graphql.schemas.public)
  await updateGraphQLSchemaIfChanged(newPrintedGraphQLSchema, '', paths)

  await generateTypes(cwd, newSystem)
  await generateAdminUI(newSystem.config, newSystem.adminMeta, paths.admin, true)

  const serverUpdates = await updateServersIfNeeded(
    server,
    null,
    newSystem,
    prismaClientModule,
    nextApp
  )

  return {
    newSystem,
    newPrintedGraphQLSchema,
    ...(serverUpdates && {
      newExpressServer: serverUpdates.expressServer,
      newApolloServer: serverUpdates.apolloServer,
    }),
  }
}

/** Configure HTTP server options from config */
function configureHttpOptions(config: any): ListenOptions {
  const httpOptions: ListenOptions = {
    port: 3000,
  }

  if (isPortConfigured(config)) {
    httpOptions.port = config.server.port
  }

  if (areServerOptionsConfigured(config)) {
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

/** Get display host for logging */
function getDisplayHost(host: string | undefined): string {
  return shouldUseLocalhost(host) ? 'localhost' : host ?? ''
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
    const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

    const prismaResult = await initializePrismaArtifacts(
      cwd,
      system,
      prisma,
      dbPush,
      log
    )

    if (!prismaResult) {
      return { system }
    }

    const { prismaClientModule, keystone } = prismaResult
    const context = keystone.context

    const serverResult = await initializeExpressServer(
      system,
      keystone,
      server,
      log
    )

    if (serverResult) {
      expressServer = serverResult.expressServer
    }

    if (configWithExtendHttp?.server?.extendHttpServer && httpServer && context) {
      configWithExtendHttp.server.extendHttpServer(httpServer, context)
    }

    prismaClient = context?.prisma

    let nextApp: any = null
    if (!system.config.ui?.isDisabled && ui) {
      nextApp = await initializeAdminUI(
        system,
        expressServer,
        context,
        cwd,
        ui,
        log
      )
    }

    hasAddedAdminUIMiddleware = true
    initKeystonePromiseResolve()

    const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
    let lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)
    let lastApolloServer = serverResult?.apolloServer ?? null

    if (system.config.telemetry !== false) {
      runTelemetry(cwd, system.lists, system.config.db.provider)
    }

    for await (const buildResult of builds) {
      if (buildResult.errors.length) continue

      try {
        const paths = system.getPaths(cwd)
        const resolved = require.resolve(paths.config)
        delete require.cache[resolved]

        const newConfigWithHttp = await importBuiltKeystoneConfiguration(cwd)
        const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))
        const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)

        validateConfigurationChanges(
          prisma,
          originalPrismaSchema,
          newSystem,
          system,
          newPrismaSchema
        )

        const newPrintedGraphQLSchema = printSchema(newSystem.graphql.schemas.public)
        const schemaChanged = await updateGraphQLSchemaIfChanged(
          newPrintedGraphQLSchema,
          lastPrintedGraphQLSchema,
          paths
        )

        if (schemaChanged) {
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

  const httpOptions = configureHttpOptions(config)
  const easyHost = getDisplayHost(httpOptions.host)

  const server = httpServer.listen(httpOptions, (err?: any) => {
    if (err) throw err

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
}
```