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

/** Creates a promise that can be resolved externally. */
function resolvablePromise<T>() {
  let _resolve!: (value: T) => void
  const promise: any = new Promise<T>(resolve => {
    _resolve = resolve
  })
  promise.resolve = _resolve
  return promise
}

/** Guard: returns true when quiet mode is enabled. */
function isQuiet(quiet: boolean): boolean {
  return quiet
}

/** Guard: returns true when the server flag is enabled. */
function isServerEnabled(server: boolean): boolean {
  return server
}

/** Guard: returns true when Prisma generation is requested. */
function isPrismaEnabled(prisma: boolean): boolean {
  return prisma
}

/** Guard: returns true when UI generation is requested. */
function isUiEnabled(ui: boolean): boolean {
  return ui
}

/** Guard: returns true when dbPush flag is set. */
function isDbPushEnabled(dbPush: boolean): boolean {
  return dbPush
}

/** Guard: returns true when telemetry is not disabled. */
function isTelemetryEnabled(telemetry: any): boolean {
  return telemetry !== false
}

/** Guard: returns true when a migration has unexecutable steps. */
function hasUnexecutableSteps(migration: any): boolean {
  return migration.unexecutable && migration.unexecutable.length > 0
}

/** Guard: returns true when a migration has warnings. */
function hasMigrationWarnings(migration: any): boolean {
  return migration.warnings && migration.warnings.length > 0
}

/** Guard: returns true when the config contains a valid numeric port. */
function hasValidPort(config: any): boolean {
  return config?.server && 'port' in config.server && typeof config.server.port === 'number'
}

/** Guard: returns true when the config contains server options. */
function hasServerOptions(config: any): boolean {
  return config?.server && 'options' in config.server && !!config.server.options
}

/** Logs a message unless quiet mode is active. */
function createLogger(quiet: boolean) {
  return (message: string) => {
    if (isQuiet(quiet)) return
    console.log(message)
  }
}

/** Stops the dev server and cleans up resources. */
async function stopServer(
  aHttpServer: any,
  esbuildContext: any,
  prismaClient: any,
  exitMessage: string = ''
) {
  await esbuildContext.dispose()

  if (aHttpServer) {
    await new Promise((resolve, reject) => {
      aHttpServer.close(err => {
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

/** Creates the esbuild context with a watch plugin. */
async function createEsbuildContext(esbuildConfig: any) {
  return esbuild.context({
    ...esbuildConfig,
    plugins: [
      ...(esbuildConfig.plugins ?? []),
      {
        name: 'esbuildWatchPlugin',
        setup(build: any) {
          // TODO: no any
          build.onEnd(addBuildResult)
        },
      },
    ],
  })
}

/** Adds a build result to the async iterator. */
let lastPromise: any
function addBuildResult(build: BuildResult) {
  const prev = lastPromise
  lastPromise = resolvablePromise()
  prev.resolve({ value: build, done: false })
}

/** Handles the first esbuild build, swallowing errors. */
async function handleFirstBuild(esbuildContext: any) {
  try {
    const firstBuild = await esbuildContext.rebuild()
    addBuildResult(firstBuild)
  } catch {
    // esbuild prints everything we want users to see
  }
}

/** Generates Prisma artifacts when required. */
async function generatePrismaArtifacts(
  cwd: string,
  system: any,
  log: (msg: string) => void,
  prisma: boolean
) {
  if (!isPrismaEnabled(prisma)) return
  log('✨ Generating GraphQL and Prisma schemas')
  const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
  await generateTypes(cwd, system)
  await generatePrismaClient(cwd, system)
  return generatedPrismaSchema
}

/** Performs database migration when dbPush is enabled. */
async function runMigrationIfNeeded(
  dbPush: boolean,
  prisma: boolean,
  system: any,
  generatedPrismaSchema: any,
  log: (msg: string) => void,
  cwd: string
) {
  if (!isDbPushEnabled(dbPush) || !isPrismaEnabled(prisma)) return

  const paths = system.getPaths(cwd)
  const created = await createDatabase(system.config.db.url, path.dirname(paths.schema.prisma))
  if (created) log(`✨ Database created`)

  const migration = await withMigrate(paths.schema.prisma, system, async m => {
    const migrationResult = await m.schema(generatedPrismaSchema, false)

    if (hasUnexecutableSteps(migrationResult)) {
      console.error(`${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`)
      for (const item of migrationResult.unexecutable) {
        console.error(`  • ${item}`)
      }

      if (hasMigrationWarnings(migrationResult)) {
        console.error(chalk.bold(`\n⚠️  Warnings:\n`))
        for (const warning of migrationResult.warnings) {
          console.error(`  • ${warning}`)
        }
      }

      console.error('\nTo apply this migration, we need to reset the database')
      const confirm = await confirmPrompt(
        `Do you want to continue? ${chalk.red('The database will be reset')}`,
        false
      )
      if (!confirm) {
        throw new ExitError(1, 'Database reset cancelled by user')
      }

      await m.reset()
      return m.schema(generatedPrismaSchema, false)
    }

    if (hasMigrationWarnings(migrationResult)) {
      console.error(chalk.bold(`\n⚠️  Warnings:\n`))
      for (const warning of migrationResult.warnings) {
        console.error(`  • ${warning}`)
      }

      const confirm = await confirmPrompt(
        `Do you want to continue? ${chalk.red('Some data will be lost')}`,
        false
      )
      if (!confirm) {
        throw new ExitError(1, 'Database push cancelled by user')
      }

      return m.schema(generatedPrismaSchema, true)
    }

    return migrationResult
  })

  if (migration.warnings.length === 0 && migration.executedSteps === 0) {
    log(`✨ Database unchanged`)
  } else {
    log(`✨ Database synchronized with Prisma schema`)
  }

  return migration
}

/** Connects Keystone and optionally creates the Express server. */
async function connectKeystoneAndCreateServer(
  system: any,
  prismaClientModule: any,
  cwd: string,
  serverFlag: boolean,
  log: (msg: string) => void
) {
  const paths = system.getPaths(cwd)
  const keystone = system.getKeystone(prismaClientModule)

  log('✨ Connecting to the database')
  await keystone.connect()

  if (!serverFlag) {
    return {
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
    context: keystone.context,
    apolloServer,
    expressServer,
    prismaClientModule,
  }
}

/** Prepares the Admin UI when enabled. */
async function prepareAdminUI(
  system: any,
  context: any,
  uiFlag: boolean,
  log: (msg: string) => void,
  cwd: string
) {
  if (!uiFlag) return null

  if (!system.config.ui?.isDisabled) {
    log('✨ Generating Admin UI code')
    const paths = system.getPaths(cwd)
    await fsp.rm(paths.admin, { recursive: true, force: true })
    await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

    log('✨ Preparing Admin UI')
    const nextApp = next({ dev: true, dir: paths.admin })
    await nextApp.prepare()
    return { nextApp, paths }
  }

  return null
}

/** Handles hot-reload build results. */
async function handleBuildResult(
  buildResult: BuildResult,
  system: any,
  lastPrintedGraphQLSchema: any,
  lastApolloServer: any,
  prismaClientModule: any,
  expressServer: any,
  nextApp: any,
  cwd: string,
  log: (msg: string) => void,
  prisma: boolean,
  originalPrismaSchema: string
) {
  if (buildResult.errors.length) return { lastPrintedGraphQLSchema, lastApolloServer, expressServer }

  log('compiled successfully')
  const paths = system.getPaths(cwd)

  // wipe the require cache
  const resolved = require.resolve(paths.config)
  delete require.cache[resolved]

  const newConfig = await importBuiltKeystoneConfiguration(cwd)
  const newSystem = createSystem(stripExtendHttpServer(newConfig))

  if (isPrismaEnabled(prisma)) {
    if (!originalPrismaSchema) throw new TypeError('Missing Prisma schema source')
    const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
    if (originalPrismaSchema !== newPrismaSchema) {
      throw new ExitError(1, '🔄 Your prisma schema has changed, please restart Keystone')
    }

    const dbConfigChanged =
      JSON.stringify(newSystem.config.db.enableLogging) !==
        JSON.stringify(system.config.db.enableLogging) ||
      newSystem.config.db.url !== system.config.db.url

    if (dbConfigChanged) {
      throw new ExitError(1, 'Your database configuration has changed, please restart Keystone')
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

  if (prismaClientModule && isServerEnabled(!!expressServer) && lastApolloServer) {
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

  return { lastPrintedGraphQLSchema, lastApolloServer, expressServer }
}

/** Main dev function. */
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
  const log = createLogger(quiet)

  log('✨ Starting Keystone')
  lastPromise = resolvablePromise<IteratorResult<BuildResult>>()

  const builds: AsyncIterable<BuildResult> = {
    [Symbol.asyncIterator]: () => ({ next: () => lastPromise }),
  }

  const esbuildConfig = await getEsbuildConfig(cwd)
  const esbuildContext = await createEsbuildContext(esbuildConfig)

  await handleFirstBuild(esbuildContext)

  esbuildContext.watch()

  let prismaClient: any = null

  const app = isServerEnabled(server) ? express() : null
  const httpServer = app ? createServer(app) : null
  let expressServer: express.Express | null = null
  let hasAddedAdminUIMiddleware = false
  const isReady = () => !server || (expressServer !== null && hasAddedAdminUIMiddleware)

  /** Initializes Keystone and related services. */
  async function initKeystone() {
    const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
    const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

    const generatedPrismaSchema = await generatePrismaArtifacts(cwd, system, log, prisma)

    if (generatedPrismaSchema) {
      await runMigrationIfNeeded(dbPush, prisma, system, generatedPrismaSchema, log, cwd)
    }

    let keystoneResult: any = {}
    if (generatedPrismaSchema) {
      const paths = system.getPaths(cwd)
      const prismaClientModule = require(paths.prisma)
      keystoneResult = await connectKeystoneAndCreateServer(
        system,
        prismaClientModule,
        cwd,
        server,
        log
      )
    } else {
      keystoneResult = { system }
    }

    if (configWithExtendHttp?.server?.extendHttpServer && httpServer && keystoneResult.context) {
      configWithExtendHttp.server.extendHttpServer(httpServer, keystoneResult.context)
    }

    prismaClient = keystoneResult.context?.prisma
    if (keystoneResult.expressServer) {
      ;({ expressServer } = keystoneResult)
    }

    const adminUI = await prepareAdminUI(system, keystoneResult.context, ui, log, cwd)
    if (adminUI) {
      const { nextApp, paths } = adminUI
      expressServer!.use(
        createAdminUIMiddlewareWithNextApp(system.config, keystoneResult.context, nextApp)
      )
      log(`✅ Admin UI ready`)
    }

    hasAddedAdminUIMiddleware = true
    initKeystonePromiseResolve()
    const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
    let lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)
    let lastApolloServer = keystoneResult.apolloServer ?? null

    if (isTelemetryEnabled(system.config.telemetry)) {
      runTelemetry(cwd, system.lists, system.config.db.provider)
    }

    for await (const buildResult of builds) {
      try {
        const result = await handleBuildResult(
          buildResult,
          system,
          lastPrintedGraphQLSchema,
          lastApolloServer,
          keystoneResult.prismaClientModule,
          expressServer,
          adminUI?.nextApp ?? null,
          cwd,
          log,
          prisma,
          originalPrismaSchema
        )
        ;({ lastPrintedGraphQLSchema, lastApolloServer, expressServer } = result)
      } catch (err) {
        console.error(`Error loading your Keystone config`, err)
      }
    }
  }

  // Promise handling for initKeystone
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

    const httpOptions: ListenOptions = { port: 3000 }

    if (hasValidPort(config)) {
      httpOptions.port = config.server.port
    }

    if (hasServerOptions(config)) {
      Object.assign(httpOptions, config.server.options)
    }

    if ('PORT' in process.env) {
      httpOptions.port = parseInt(process.env.PORT ?? '')
    }

    if ('HOST' in process.env) {
      httpOptions.host = process.env.HOST ?? ''
    }

    const server = httpServer.listen(httpOptions, err => {
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
        await stopServer(server, esbuildContext, prismaClient)
        initKeystonePromiseReject?.(err)
      })
    })

    await initKeystonePromise
    return async () => await stopServer(server, esbuildContext, prismaClient)
  } else {
    await initKeystone()
    return () => Promise.resolve()
  }
}