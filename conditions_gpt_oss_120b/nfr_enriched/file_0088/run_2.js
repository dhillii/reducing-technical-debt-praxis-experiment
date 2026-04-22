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

/** Sets up esbuild watch and returns helpers for build handling. */
async function setupEsbuild(cwd: string) {
  const esbuildConfig = await getEsbuildConfig(cwd)

  const addBuildResult = (build: BuildResult) => {
    const prev = lastPromise
    lastPromise = resolvablePromise<IteratorResult<BuildResult>>()
    prev.resolve({ value: build, done: false })
  }

  let lastPromise = resolvablePromise<IteratorResult<BuildResult>>()
  const builds: AsyncIterable<BuildResult> = {
    [Symbol.asyncIterator]: () => ({ next: () => lastPromise }),
  }

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

  try {
    const firstBuild = await esbuildContext.rebuild()
    addBuildResult(firstBuild)
  } catch {
    // esbuild already printed errors
  }

  esbuildContext.watch()
  return { esbuildContext, builds, addBuildResult }
}

/** Gracefully stops the dev server and related resources. */
async function stopDev(
  esbuildContext: esbuild.PluginBuild | any,
  httpServer: any,
  prismaClient: any,
  exitMessage = ''
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

  if (exitMessage) throw new ExitError(1, exitMessage)
}

/** Holds mutable state shared between build iterations. */
interface WatchState {
  system: ReturnType<typeof createSystem>
  prismaClientModule: any
  apolloServer: any
  expressServer: express.Express | null
  nextApp: any
  originalPrismaSchema: string | null
  lastPrintedGraphQLSchema: string
  lastApolloServer: any
}

/** Processes a single esbuild build result. */
async function handleBuildResult(
  buildResult: BuildResult,
  cwd: string,
  prisma: boolean,
  state: WatchState,
  log: (msg: string) => void
) {
  if (buildResult.errors.length) return

  log('compiled successfully')
  try {
    const { system, prismaClientModule, apolloServer, expressServer, nextApp } = state
    const paths = system.getPaths(cwd)

    // clear config cache
    const resolved = require.resolve(paths.config)
    delete require.cache[resolved]

    const newConfig = await importBuiltKeystoneConfiguration(cwd)
    const newSystem = createSystem(stripExtendHttpServer(newConfig))

    if (prisma) {
      if (!state.originalPrismaSchema) throw new TypeError('Missing Prisma schema source')
      const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
      if (state.originalPrismaSchema !== newPrismaSchema) {
        await stopDev(null, null, null, '🔄 Your prisma schema has changed, please restart Keystone')
      }
      if (
        JSON.stringify(newSystem.config.db.enableLogging) !==
          JSON.stringify(system.config.db.enableLogging) ||
        newSystem.config.db.url !== system.config.db.url
      ) {
        await stopDev(null, null, null, 'Your database configuration has changed, please restart Keystone')
      }
    }

    const newPrintedGraphQLSchema = printSchema(newSystem.graphql.schemas.public)
    if (newPrintedGraphQLSchema !== state.lastPrintedGraphQLSchema) {
      await fsp.writeFile(
        paths.schema.graphql,
        getFormattedGraphQLSchema(newPrintedGraphQLSchema)
      )
      state.lastPrintedGraphQLSchema = newPrintedGraphQLSchema
    }

    await generateTypes(cwd, newSystem)
    await generateAdminUI(newSystem.config, newSystem.adminMeta, paths.admin, true)

    if (prismaClientModule) {
      if (state.expressServer && state.lastApolloServer) {
        const { context: newContext } = newSystem.getKeystone(prismaClientModule)
        const servers = await createExpressServer(newSystem.config, newContext)
        if (state.nextApp) {
          servers.expressServer.use(
            createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, state.nextApp)
          )
        }
        state.expressServer = servers.expressServer
        const prevApollo = state.lastApolloServer
        state.lastApolloServer = servers.apolloServer
        await prevApollo.stop()
      }
    }
  } catch (err) {
    console.error(`Error loading your Keystone config`, err)
  }
}

/** Initializes Keystone, generates artifacts, and starts the server if needed. */
async function initKeystoneEnv(
  cwd: string,
  opts: {
    prisma: boolean
    dbPush: boolean
    ui: boolean
    server: boolean
    httpServer: any
    log: (msg: string) => void
  },
  resolveReady: () => void
) {
  const { prisma, dbPush, ui, server, httpServer, log } = opts
  const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)

  const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

  // Generate artifacts when Prisma is enabled
  if (prisma) {
    log('✨ Generating GraphQL and Prisma schemas')
    const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
    await generateTypes(cwd, system)
    await generatePrismaClient(cwd, system)

    const paths = system.getPaths(cwd)
    if (dbPush) {
      const created = await createDatabase(system.config.db.url, path.dirname(paths.schema.prisma))
      if (created) log(`✨ Database created`)

      const migration = await withMigrate(paths.schema.prisma, system, async m => {
        const migration_ = await m.schema(generatedPrismaSchema, false)

        if (migration_.unexecutable.length) {
          console.error(`${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`)
          for (const item of migration_.unexecutable) console.error(`  • ${item}`)

          if (migration_.warnings.length) {
            console.error(chalk.bold(`\n⚠️  Warnings:\n`))
            for (const warning of migration_.warnings) console.error(`  • ${warning}`)
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
          for (const warning of migration_.warnings) console.error(`  • ${warning}`)

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
        apolloServer: null,
        expressServer: null,
        nextApp: null,
        originalPrismaSchema: printPrismaSchema(system.config, system.lists),
        lastPrintedGraphQLSchema: printSchema(system.graphql.schemas.public),
        lastApolloServer: null,
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
      prismaClientModule,
      apolloServer,
      expressServer,
      nextApp: null,
      originalPrismaSchema: printPrismaSchema(system.config, system.lists),
      lastPrintedGraphQLSchema: printSchema(system.graphql.schemas.public),
      lastApolloServer: apolloServer,
    }
  }

  // No Prisma path – just return system
  return {
    system,
    context: null,
    prismaClientModule: null,
    apolloServer: null,
    expressServer: null,
    nextApp: null,
    originalPrismaSchema: null,
    lastPrintedGraphQLSchema: printSchema(system.graphql.schemas.public),
    lastApolloServer: null,
  }
}

/** Sets up the HTTP server and routes for dev mode. */
async function setupHttpServer(
  cwd: string,
  app: express.Express,
  httpServer: any,
  getReady: () => boolean,
  config: KeystoneConfig,
  log: (msg: string) => void
) {
  app.use('/__keystone/dev/status', (req, res) => {
    res.status(getReady() ? 200 : 501).end()
  })

  app.use((req, res, next) => {
    if (config?.server?.extendHttpServer) {
      // placeholder – actual extend logic runs elsewhere
    }
    const { pathname } = new URL(req.url, 'http://ks')
    if (pathname === (config.graphql?.path ?? '/api/graphql')) {
      return (config as any).expressServer?.(req, res, next)
    }
    res.sendFile(devLoadingHTMLFilepath)
  })

  const httpOptions: ListenOptions = { port: 3000 }

  if (config?.server?.port && typeof config.server.port === 'number') {
    httpOptions.port = config.server.port
  }

  if (config?.server?.options) {
    Object.assign(httpOptions, config.server.options)
  }

  if (process.env.PORT) httpOptions.port = parseInt(process.env.PORT, 10)
  if (process.env.HOST) httpOptions.host = process.env.HOST

  const server = httpServer.listen(httpOptions, err => {
    if (err) throw err

    const easyHost = [undefined, '', '::', '0.0.0.0'].includes(httpOptions.host as any)
      ? 'localhost'
      : (httpOptions.host as string)

    log(
      `⭐️ Server listening on ${httpOptions.host ?? ''}:${
        httpOptions.port
      } (http://${easyHost}:${httpOptions.port}/)`
    )
    log(`⭐️ GraphQL API available at ${config.graphql?.path ?? '/api/graphql'}`)
  })

  return server
}

/** Main dev entry point – orchestrates build, server, and Keystone lifecycle. */
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
    if (!quiet) console.log(msg)
  }

  const { esbuildContext, builds } = await setupEsbuild(cwd)

  const app = server ? express() : null
  const httpServer = app ? createServer(app) : null

  let hasAddedAdminUIMiddleware = false
  const isReady = () => !server || (expressServer !== null && hasAddedAdminUIMiddleware)

  let expressServer: express.Express | null = null
  let initKeystoneResolve: () => void = () => {}

  const initPromise = new Promise<void>((resolve, reject) => {
    initKeystoneResolve = resolve
  })

  // Initialise Keystone (artifacts, DB, server, UI)
  const {
    system,
    context,
    prismaClientModule,
    apolloServer,
    nextApp,
    originalPrismaSchema,
    lastPrintedGraphQLSchema,
    lastApolloServer,
  } = await initKeystoneEnv(
    cwd,
    {
      prisma,
      dbPush,
      ui,
      server,
      httpServer,
      log,
    },
    () => {
      hasAddedAdminUIMiddleware = true
      initKeystoneResolve()
    }
  )

  // Attach admin UI if requested
  if (!system.config.ui?.isDisabled && ui && expressServer && context) {
    log('✨ Generating Admin UI code')
    const paths = system.getPaths(cwd)
    await fsp.rm(paths.admin, { recursive: true, force: true })
    await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

    log('✨ Preparing Admin UI')
    const nextInstance = next({ dev: true, dir: paths.admin })
    await nextInstance.prepare()
    expressServer.use(
      createAdminUIMiddlewareWithNextApp(system.config, context, nextInstance)
    )
    log(`✅ Admin UI ready`)
  }

  // Resolve ready promise after initialisation
  hasAddedAdminUIMiddleware = true
  initKeystoneResolve()

  // Telemetry
  if (system.config.telemetry !== false) {
    runTelemetry(cwd, system.lists, system.config.db.provider)
  }

  // Watch for rebuilds
  const watchState: WatchState = {
    system,
    prismaClientModule,
    apolloServer,
    expressServer,
    nextApp,
    originalPrismaSchema,
    lastPrintedGraphQLSchema,
    lastApolloServer,
  }

  ;(async () => {
    for await (const buildResult of builds) {
      await handleBuildResult(buildResult, cwd, prisma, watchState, log)
    }
  })().catch(err => console.error(err))

  // If we have an HTTP server, start it and wait for init promise
  if (app && httpServer) {
    const config = await importBuiltKeystoneConfiguration(cwd)

    const server = await setupHttpServer(cwd, app, httpServer, isReady, config, log)

    await initPromise
    return async () => await stopDev(esbuildContext, server, context?.prisma)
  }

  // No HTTP server – just wait for init and return a noop stopper
  await initPromise
  return () => Promise.resolve()
}