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

/**
 * Creates a promise that can be resolved externally.
 */
function resolvablePromise<T>() {
  let _resolve!: (value: T) => void
  const promise: any = new Promise<T>(resolve => {
    _resolve = resolve
  })
  promise.resolve = _resolve
  return promise
}

/**
 * Guard: returns true when quiet mode is disabled.
 */
function shouldLog(quiet: boolean): boolean {
  return !quiet
}

/**
 * Guard: returns true when the server flag is enabled.
 */
function isServerEnabled(server: boolean): boolean {
  return server
}

/**
 * Guard: returns true when UI flag is enabled.
 */
function isUiEnabled(ui: boolean): boolean {
  return ui
}

/**
 * Guard: returns true when Prisma flag is enabled.
 */
function isPrismaEnabled(prisma: boolean): boolean {
  return prisma
}

/**
 * Guard: returns true when dbPush flag is enabled.
 */
function isDbPushEnabled(dbPush: boolean): boolean {
  return dbPush
}

/**
 * Determines if a custom port is defined in the Keystone config.
 */
function hasCustomPort(config: any): boolean {
  return config?.server && 'port' in config.server && typeof config.server.port === 'number'
}

/**
 * Determines if a custom host is defined in the Keystone config.
 */
function hasCustomHost(config: any): boolean {
  return config?.server && 'options' in config.server && !!config.server.options?.host
}

/**
 * Returns the effective listen options based on config and environment.
 */
function getListenOptions(config: any): ListenOptions {
  const options: ListenOptions = { port: 3000 }

  if (hasCustomPort(config)) {
    options.port = config.server.port
  }

  if (hasCustomHost(config)) {
    Object.assign(options, config.server.options)
  }

  if ('PORT' in process.env) {
    const parsed = parseInt(process.env.PORT ?? '')
    if (!Number.isNaN(parsed)) {
      options.port = parsed
    }
  }

  if ('HOST' in process.env) {
    options.host = process.env.HOST ?? ''
  }

  return options
}

/**
 * Returns a human‑readable host for logging.
 */
function getEasyHost(host: string | undefined): string {
  return [undefined, '', '::', '0.0.0.0'].includes(host ?? '') ? 'localhost' : (host ?? '')
}

/**
 * Handles graceful shutdown of the dev server and related resources.
 */
async function stopDevServer(
  esbuildContext: esbuild.PluginBuild,
  httpServer: any,
  prismaClient: any,
  exitMessage: string = ''
) {
  await esbuildContext.dispose()

  if (httpServer) {
    await new Promise((resolve, reject) => {
      httpServer.close(err => {
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

  if (exitMessage) {
    throw new ExitError(1, exitMessage)
  }
}

/**
 * Starts the esbuild watcher and returns the async iterable of build results.
 */
async function startEsbuildWatcher(cwd: string) {
  const esbuildConfig = await getEsbuildConfig(cwd)
  const esbuildContext = await esbuild.context({
    ...esbuildConfig,
    plugins: [
      ...(esbuildConfig.plugins ?? []),
      {
        name: 'esbuildWatchPlugin',
        setup(build: any) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          build.onEnd(addBuildResult)
        },
      },
    ],
  })

  let lastPromise = resolvablePromise<IteratorResult<BuildResult>>()
  const builds: AsyncIterable<BuildResult> = {
    [Symbol.asyncIterator]: () => ({ next: () => lastPromise }),
  }

  function addBuildResult(build: BuildResult) {
    const prev = lastPromise
    lastPromise = resolvablePromise()
    prev.resolve({ value: build, done: false })
  }

  try {
    const firstBuild = await esbuildContext.rebuild()
    addBuildResult(firstBuild)
  } catch {
    // esbuild already printed errors
  }

  esbuildContext.watch()
  return { builds, esbuildContext }
}

/**
 * Generates the Prisma schema and applies migrations if needed.
 */
async function handlePrismaMigration(
  cwd: string,
  system: any,
  generatedPrismaSchema: string,
  dbPush: boolean,
  log: (msg: string) => void
) {
  const paths = system.getPaths(cwd)

  if (!isDbPushEnabled(dbPush)) {
    log('⚠️ Skipping database schema push')
    return
  }

  const created = await createDatabase(system.config.db.url, path.dirname(paths.schema.prisma))
  if (created) {
    log(`✨ Database created`)
  }

  const migration = await withMigrate(paths.schema.prisma, system, async m => {
    const migrationResult = await m.schema(generatedPrismaSchema, false)

    if (migrationResult.unexecutable.length) {
      console.error(`${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`)
      for (const item of migrationResult.unexecutable) {
        console.error(`  • ${item}`)
      }

      if (migrationResult.warnings.length) {
        console.error(chalk.bold(`\n⚠️  Warnings:\n`))
        for (const warning of migrationResult.warnings) {
          console.error(`  • ${warning}`)
        }
      }

      console.error('\nTo apply this migration, we need to reset the database')
      const confirmed = await confirmPrompt(
        `Do you want to continue? ${chalk.red('The database will be reset')}`,
        false
      )
      if (!confirmed) {
        throw new ExitError(1, 'Database reset cancelled by user')
      }

      await m.reset()
      return m.schema(generatedPrismaSchema, false)
    }

    if (migrationResult.warnings.length) {
      console.error(chalk.bold(`\n⚠️  Warnings:\n`))
      for (const warning of migrationResult.warnings) {
        console.error(`  • ${warning}`)
      }

      const confirmed = await confirmPrompt(
        `Do you want to continue? ${chalk.red('Some data will be lost')}`,
        false
      )
      if (!confirmed) {
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
}

/**
 * Initializes Keystone, generates artifacts, and prepares the server.
 */
async function initKeystoneCore(
  cwd: string,
  flags: Pick<Flags, 'dbPush' | 'prisma' | 'quiet' | 'server' | 'ui'>,
  log: (msg: string) => void,
  httpServer: any,
  setReady: (ready: boolean) => void,
  setApolloServer: (server: any) => void,
  setExpressServer: (server: any) => void,
  setPrismaClient: (client: any) => void,
  setNextApp: (app: any) => void
) {
  const { dbPush, prisma, server, ui } = flags
  const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
  const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

  if (isPrismaEnabled(prisma)) {
    log('✨ Generating GraphQL and Prisma schemas')
    const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
    await generateTypes(cwd, system)
    await generatePrismaClient(cwd, system)

    await handlePrismaMigration(cwd, system, generatedPrismaSchema, dbPush, log)

    const paths = system.getPaths(cwd)
    const prismaClientModule = require(paths.prisma)
    const keystone = system.getKeystone(prismaClientModule)

    log('✨ Connecting to the database')
    await keystone.connect()

    if (!isServerEnabled(server)) {
      setPrismaClient(keystone.context.prisma)
      return { system, context: keystone.context, prismaClientModule }
    }

    log('✨ Creating server')
    const { apolloServer, expressServer } = await createExpressServer(
      system.config,
      keystone.context
    )
    log(`✅ GraphQL API ready`)

    setReady(true)
    setApolloServer(apolloServer)
    setExpressServer(expressServer)
    setPrismaClient(keystone.context.prisma)

    if (!system.config.ui?.isDisabled && isUiEnabled(ui)) {
      if (!expressServer) {
        throw new TypeError('Error trying to prepare the Admin UI')
      }

      log('✨ Generating Admin UI code')
      await fsp.rm(paths.admin, { recursive: true, force: true })
      await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

      log('✨ Preparing Admin UI')
      const nextApp = next({ dev: true, dir: paths.admin })
      await nextApp.prepare()
      expressServer.use(
        createAdminUIMiddlewareWithNextApp(system.config, keystone.context, nextApp)
      )
      log(`✅ Admin UI ready`)
      setNextApp(nextApp)
    }

    return { system, context: keystone.context, prismaClientModule }
  }

  // No Prisma path – only system is needed
  return { system }
}

/**
 * Processes build results and hot‑reloads the configuration.
 */
async function processBuilds(
  builds: AsyncIterable<BuildResult>,
  system: any,
  cwd: string,
  prisma: boolean,
  prismaClientModule: any,
  httpServer: any,
  expressServer: any,
  apolloServer: any,
  nextApp: any,
  log: (msg: string) => void,
  stop: (msg: string) => Promise<void>
) {
  const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
  let lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)
  let lastApolloServer = apolloServer ?? null

  for await (const buildResult of builds) {
    if (buildResult.errors.length) continue

    log('compiled successfully')
    try {
      const paths = system.getPaths(cwd)

      // wipe the require cache
      const resolved = require.resolve(paths.config)
      delete require.cache[resolved]

      const newConfig = await importBuiltKeystoneConfiguration(cwd)
      const newSystem = createSystem(stripExtendHttpServer(newConfig))

      if (prisma) {
        if (!originalPrismaSchema) {
          throw new TypeError('Missing Prisma schema source')
        }

        const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
        if (originalPrismaSchema !== newPrismaSchema) {
          await stop('🔄 Your prisma schema has changed, please restart Keystone')
          return
        }

        const dbConfigChanged =
          JSON.stringify(newSystem.config.db.enableLogging) !==
            JSON.stringify(system.config.db.enableLogging) ||
          newSystem.config.db.url !== system.config.db.url

        if (dbConfigChanged) {
          await stop('Your database configuration has changed, please restart Keystone')
          return
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

      if (prismaClientModule && httpServer && lastApolloServer) {
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

/**
 * Main development server entry point.
 */
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
  const log = (msg: string) => {
    if (shouldLog(quiet)) {
      console.log(msg)
    }
  }

  log('✨ Starting Keystone')

  const { builds, esbuildContext } = await startEsbuildWatcher(cwd)

  const app = server ? express() : null
  const httpServer = app ? createServer(app) : null

  let expressServer: express.Express | null = null
  let nextApp: any = null
  let prismaClient: any = null
  let apolloServer: any = null
  let ready = false

  const setReady = (value: boolean) => {
    ready = value
  }
  const isReady = () => !server || (expressServer !== null && ready)

  const setExpressServer = (srv: any) => {
    expressServer = srv
  }
  const setApolloServer = (srv: any) => {
    apolloServer = srv
  }
  const setPrismaClient = (client: any) => {
    prismaClient = client
  }
  const setNextApp = (app: any) => {
    nextApp = app
  }

  const initKeystonePromise = (async () => {
    const { system, context, prismaClientModule } = await initKeystoneCore(
      cwd,
      { dbPush, prisma, quiet, server, ui },
      log,
      httpServer,
      setReady,
      setApolloServer,
      setExpressServer,
      setPrismaClient,
      setNextApp
    )

    if (prismaClientModule && httpServer && apolloServer) {
      // No‑op placeholder – the hot‑reload loop will handle updates
    }

    if (system.config.telemetry !== false) {
      runTelemetry(cwd, system.lists, system.config.db.provider)
    }

    await processBuilds(
      builds,
      system,
      cwd,
      prisma,
      prismaClientModule,
      httpServer,
      expressServer,
      apolloServer,
      nextApp,
      log,
      async (msg: string) => {
        await stopDevServer(esbuildContext, httpServer, prismaClient, msg)
      }
    )
  })()

  if (app && httpServer) {
    const config = await importBuiltKeystoneConfiguration(cwd)

    app.use('/__keystone/dev/status', (req, res) => {
      res.status(isReady() ? 200 : 501).end()
    })

    app.use((req, res, next) => {
      if (expressServer && ready) {
        return expressServer(req, res, next)
      }

      const { pathname } = new URL(req.url, 'http://ks')
      if (expressServer && pathname === (config.graphql?.path ?? '/api/graphql')) {
        return expressServer(req, res, next)
      }

      res.sendFile(devLoadingHTMLFilepath)
    })

    const httpOptions = getListenOptions(config)

    const server = httpServer.listen(httpOptions, err => {
      if (err) throw err

      const easyHost = getEasyHost(httpOptions.host)
      log(
        `⭐️ Server listening on ${httpOptions.host ?? ''}:${
          httpOptions.port
        } (http://${easyHost}:${httpOptions.port}/)`
      )
      log(`⭐️ GraphQL API available at ${config.graphql?.path ?? '/api/graphql'}`)

      initKeystonePromise.catch(async err => {
        await stopDevServer(esbuildContext, httpServer, prismaClient, err.message)
      })
    })

    await initKeystonePromise
    return async () => await stopDevServer(esbuildContext, server, prismaClient)
  }

  await initKeystonePromise
  return () => Promise.resolve()
}