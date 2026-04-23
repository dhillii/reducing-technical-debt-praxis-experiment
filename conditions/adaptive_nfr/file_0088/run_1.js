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

/** Log migration unexecutable steps */
function logMigrationUnexecutableSteps(migration: any): void {
  console.error(`${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`)
  for (const item of migration.unexecutable) {
    console.error(`  • ${item}`)
  }
}

/** Log migration warnings */
function logMigrationWarnings(migration: any): void {
  console.error(chalk.bold(`\n⚠️  Warnings:\n`))
  for (const warning of migration.warnings) {
    console.error(`  • ${warning}`)
  }
}

/** Handle migration with unexecutable steps */
async function handleUnexecutableMigration(
  migration: any,
  m: any,
  generatedPrismaSchema: string
): Promise<any> {
  logMigrationUnexecutableSteps(migration)
  if (hasMigrationWarnings(migration)) {
    logMigrationWarnings(migration)
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

/** Handle migration with warnings only */
async function handleMigrationWithWarnings(
  migration: any,
  m: any,
  generatedPrismaSchema: string
): Promise<any> {
  logMigrationWarnings(migration)
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
  m: any,
  generatedPrismaSchema: string
): Promise<any> {
  if (hasMigrationUnexecutableSteps(migration)) {
    return handleUnexecutableMigration(migration, m, generatedPrismaSchema)
  }
  if (hasMigrationWarnings(migration)) {
    return handleMigrationWithWarnings(migration, m, generatedPrismaSchema)
  }
  return migration
}

/** Check if database configuration has changed */
function hasDatabaseConfigChanged(newSystem: any, system: any): boolean {
  return (
    JSON.stringify(newSystem.config.db.enableLogging) !==
      JSON.stringify(system.config.db.enableLogging) ||
    newSystem.config.db.url !== system.config.db.url
  )
}

/** Check if Prisma schema has changed */
function hasPrismaSchemaChanged(
  originalPrismaSchema: string,
  newPrismaSchema: string
): boolean {
  return originalPrismaSchema !== newPrismaSchema
}

/** Check if GraphQL schema has changed */
function hasGraphQLSchemaChanged(
  newPrintedGraphQLSchema: string,
  lastPrintedGraphQLSchema: string
): boolean {
  return newPrintedGraphQLSchema !== lastPrintedGraphQLSchema
}

/** Check if server config has port property */
function hasServerPort(config: any): boolean {
  return config?.server && 'port' in config.server && typeof config.server?.port === 'number'
}

/** Check if server config has options property */
function hasServerOptions(config: any): boolean {
  return config?.server && 'options' in config.server && config.server.options
}

/** Check if environment PORT is set */
function hasEnvPort(): boolean {
  return 'PORT' in process.env
}

/** Check if environment HOST is set */
function hasEnvHost(): boolean {
  return 'HOST' in process.env
}

/** Extract HTTP options from config */
function extractHttpOptions(config: any): ListenOptions {
  const httpOptions: ListenOptions = {
    port: 3000,
  }

  if (hasServerPort(config)) {
    httpOptions.port = config.server.port
  }

  if (hasServerOptions(config)) {
    Object.assign(httpOptions, config.server.options)
  }

  if (hasEnvPort()) {
    httpOptions.port = parseInt(process.env.PORT ?? '')
  }

  if (hasEnvHost()) {
    httpOptions.host = process.env.HOST ?? ''
  }

  return httpOptions
}

/** Get display host for logging */
function getDisplayHost(host: string | undefined): string {
  return [undefined, '', '::', '0.0.0.0'].includes(host) ? 'localhost' : host ?? ''
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
    const { system, context, prismaClientModule, apolloServer, ...rest } =
      await initKeystoneSystem(cwd, configWithExtendHttp, prisma, dbPush, log)

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
      await handleBuildResult(
        buildResult,
        cwd,
        system,
        prisma,
        originalPrismaSchema,
        lastPrintedGraphQLSchema,
        prismaClientModule,
        server,
        lastApolloServer,
        nextApp,
        expressServer,
        log,
        stop
      )
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

    const httpOptions = extractHttpOptions(config)

    const server = httpServer.listen(httpOptions, (err?: any) => {
      if (err) throw err

      const easyHost = getDisplayHost(httpOptions.host)
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

/** Initialize Keystone system and return configuration */
async function initKeystoneSystem(
  cwd: string,
  configWithExtendHttp: KeystoneConfig,
  prisma: boolean,
  dbPush: boolean,
  log: (message: string) => void
) {
  const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

  if (!prisma) {
    return { system }
  }

  log('✨ Generating GraphQL and Prisma schemas')
  const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
  await generateTypes(cwd, system)
  await generatePrismaClient(cwd, system)

  const paths = system.getPaths(cwd)
  if (dbPush) {
    await handleDatabasePush(cwd, system, paths, generatedPrismaSchema, log)
  } else {
    log('⚠️ Skipping database schema push')
  }

  const prismaClientModule = require(paths.prisma)
  const keystone = system.getKeystone(prismaClientModule)

  log('✨ Connecting to the database')
  await keystone.connect()

  return buildKeystoneResult(system, keystone, prismaClientModule)
}

/** Handle database push operation */
async function handleDatabasePush(
  cwd: string,
  system: any,
  paths: any,
  generatedPrismaSchema: string,
  log: (message: string) => void
) {
  const created = await createDatabase(system.config.db.url, path.dirname(paths.schema.prisma))
  if (created) log(`✨ Database created`)

  const migration = await withMigrate(paths.schema.prisma, system, async m => {
    const migration_ = await m.schema(generatedPrismaSchema, false)
    return processMigration(migration_, m, generatedPrismaSchema)
  })

  if (migration.warnings.length === 0 && migration.executedSteps === 0) {
    log(`✨ Database unchanged`)
  } else {
    log(`✨ Database synchronized with Prisma schema`)
  }
}

/** Build Keystone result object */
function buildKeystoneResult(system: any, keystone: any, prismaClientModule: any) {
  return {
    system,
    context: keystone.context,
    prismaClientModule,
  }
}

/** Handle build result and update system */
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
  expressServer: any,
  log: (message: string) => void,
  stop: (server: any, message: string) => Promise<void>
) {
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
        return stop(null, '🔄 Your prisma schema has changed, please restart Keystone')
      }

      if (hasDatabaseConfigChanged(newSystem, system)) {
        return stop(null, 'Your database configuration has changed, please restart Keystone')
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
      expressServer = servers.expressServer
      await lastApolloServer.stop()
    }
  } catch (err) {
    console.error(`Error loading your Keystone config`, err)
  }
}