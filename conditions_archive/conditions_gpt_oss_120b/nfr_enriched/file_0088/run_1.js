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

/** Starts esbuild in watch mode and returns the async iterable of build results. */
async function startEsbuildWatch(
  cwd: string,
  addBuildResult: (build: BuildResult) => void
) {
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

  try {
    const firstBuild = await esbuildContext.rebuild()
    addBuildResult(firstBuild)
  } catch {
    // esbuild already printed errors
  }

  esbuildContext.watch()
  return esbuildContext
}

/** Gracefully stops the server, esbuild context and Prisma client. */
async function stopAll(
  esbuildContext: esbuild.PluginBuild | null,
  httpServer: any,
  prismaClient: any,
  exitMessage = ''
) {
  if (esbuildContext) {
    await esbuildContext.dispose()
  }

  if (httpServer) {
    await new Promise((resolve, reject) => {
      httpServer.close(err => (err ? reject(err) : resolve(null)))
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

/** Handles the initial Keystone bootstrap and returns runtime artefacts. */
async function bootstrapKeystone(
  cwd: string,
  flags: Pick<Flags, 'dbPush' | 'prisma' | 'quiet' | 'server' | 'ui'>,
  log: (msg: string) => void
) {
  const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
  const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

  if (flags.prisma) {
    log('✨ Generating GraphQL and Prisma schemas')
    const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
    await generateTypes(cwd, system)
    await generatePrismaClient(cwd, system)

    const paths = system.getPaths(cwd)

    if (flags.dbPush) {
      const created = await createDatabase(
        system.config.db.url,
        path.dirname(paths.schema.prisma)
      )
      if (created) log('✨ Database created')

      const migration = await withMigrate(paths.schema.prisma, system, async m => {
        const migration_ = await m.schema(generatedPrismaSchema, false)

        if (migration_.unexecutable.length) {
          console.error(`${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`)
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
        log('✨ Database unchanged')
      } else {
        log('✨ Database synchronized with Prisma schema')
      }
    } else {
      log('⚠️ Skipping database schema push')
    }

    const prismaClientModule = require(paths.prisma)
    const keystone = system.getKeystone(prismaClientModule)

    log('✨ Connecting to the database')
    await keystone.connect()

    if (!flags.server) {
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
    log('✅ GraphQL API ready')

    return {
      system,
      context: keystone.context,
      apolloServer,
      expressServer,
      prismaClientModule,
    }
  }

  return { system }
}

/** Prepares the Admin UI if required and returns the Next app instance. */
async function prepareAdminUI(
  system: ReturnType<typeof createSystem>,
  context: any,
  cwd: string,
  log: (msg: string) => void
) {
  const paths = system.getPaths(cwd)
  await fsp.rm(paths.admin, { recursive: true, force: true })
  await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

  log('✨ Preparing Admin UI')
  const nextApp = next({ dev: true, dir: paths.admin })
  await nextApp.prepare()
  return nextApp
}

/** Processes a single esbuild build result, handling schema changes and UI regeneration. */
async function processBuildResult(
  buildResult: BuildResult,
  system: ReturnType<typeof createSystem>,
  cwd: string,
  flags: Pick<Flags, 'prisma'>,
  originalPrismaSchema: string | undefined,
  lastPrintedGraphQLSchema: string,
  lastApolloServer: any,
  prismaClientModule: any,
  expressServer: any,
  nextApp: any,
  log: (msg: string) => void
) {
  if (buildResult.errors.length) return { lastPrintedGraphQLSchema, lastApolloServer }

  log('compiled successfully')
  const paths = system.getPaths(cwd)

  // clear config cache
  const resolved = require.resolve(paths.config)
  delete require.cache[resolved]

  const newConfig = await importBuiltKeystoneConfiguration(cwd)
  const newSystem = createSystem(stripExtendHttpServer(newConfig))

  if (flags.prisma) {
    if (!originalPrismaSchema) throw new TypeError('Missing Prisma schema source')
    const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
    if (originalPrismaSchema !== newPrismaSchema) {
      throw new ExitError(1, '🔄 Your prisma schema has changed, please restart Keystone')
    }
    if (
      JSON.stringify(newSystem.config.db.enableLogging) !==
        JSON.stringify(system.config.db.enableLogging) ||
      newSystem.config.db.url !== system.config.db.url
    ) {
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

  if (prismaClientModule && flags.server && lastApolloServer) {
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

/** Sets up the HTTP server and routes for dev status and UI. */
async function setupHttpServer(
  cwd: string,
  app: express.Express,
  httpServer: any,
  isReady: () => boolean,
  expressServer: any,
  hasAddedAdminUIMiddleware: boolean,
  log: (msg: string) => void
) {
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

  if (config?.server && typeof config.server?.port === 'number') {
    httpOptions.port = config.server.port
  }

  if (config?.server?.options) {
    Object.assign(httpOptions, config.server.options)
  }

  if (process.env.PORT) {
    httpOptions.port = parseInt(process.env.PORT, 10)
  }

  if (process.env.HOST) {
    httpOptions.host = process.env.HOST
  }

  const server = httpServer.listen(httpOptions, err => {
    if (err) throw err

    const easyHost = [undefined, '', '::', '0.0.0.0'].includes(httpOptions.host)
      ? 'localhost'
      : httpOptions.host
    log(
      `⭐️ Server listening on ${httpOptions.host ?? ''}:${httpOptions.port} (http://${easyHost}:${httpOptions.port}/)`
    )
    log(`⭐️ GraphQL API available at ${config.graphql?.path ?? '/api/graphql'}`)
  })

  return server
}

/** Main dev entry point – orchestrates build, server and Keystone lifecycle. */
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

  log('✨ Starting Keystone')

  // Build result handling
  let lastPromise = resolvablePromise<IteratorResult<BuildResult>>()
  const builds: AsyncIterable<BuildResult> = {
    [Symbol.asyncIterator]: () => ({ next: () => lastPromise }),
  }
  const addBuildResult = (build: BuildResult) => {
    const prev = lastPromise
    lastPromise = resolvablePromise()
    ;(prev as any).resolve({ value: build, done: false })
  }

  const esbuildContext = await startEsbuildWatch(cwd, addBuildResult)

  // Server setup
  const app = server ? express() : null
  const httpServer = app ? createServer(app) : null
  let expressServer: any = null
  let hasAddedAdminUIMiddleware = false
  const isReady = () => !server || (expressServer !== null && hasAddedAdminUIMiddleware)

  // Bootstrap Keystone
  const {
    system,
    context,
    prismaClientModule,
    apolloServer,
    expressServer: initialExpressServer,
  } = await bootstrapKeystone(cwd, { dbPush, prisma, quiet, server, ui }, log)

  if (initialExpressServer) {
    expressServer = initialExpressServer
  }

  // Admin UI preparation
  let nextApp: any = null
  if (!system.config.ui?.isDisabled && ui) {
    if (!expressServer || !context) throw new TypeError('Error trying to prepare the Admin UI')
    log('✨ Generating Admin UI code')
    nextApp = await prepareAdminUI(system, context, cwd, log)
    expressServer.use(
      createAdminUIMiddlewareWithNextApp(system.config, context, nextApp)
    )
    log('✅ Admin UI ready')
  }

  hasAddedAdminUIMiddleware = true

  // Telemetry
  if (system.config.telemetry !== false) {
    runTelemetry(cwd, system.lists, system.config.db.provider)
  }

  // Build result processing loop
  const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
  let lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)
  let lastApolloServer = apolloServer ?? null

  (async () => {
    for await (const buildResult of builds) {
      try {
        const result = await processBuildResult(
          buildResult,
          system,
          cwd,
          { prisma },
          originalPrismaSchema,
          lastPrintedGraphQLSchema,
          lastApolloServer,
          prismaClientModule,
          expressServer,
          nextApp,
          log
        )
        ;({
          lastPrintedGraphQLSchema,
          lastApolloServer,
          expressServer,
        } = result)
      } catch (err) {
        console.error(err instanceof ExitError ? err.message : err)
        // Stop everything on fatal error
        await stopAll(esbuildContext, httpServer, context?.prisma, err instanceof ExitError ? err.message : '')
        break
      }
    }
  })()

  // Resolve when Keystone is ready
  let initKeystoneResolve: () => void
  const initKeystonePromise = new Promise<void>(resolve => {
    initKeystoneResolve = resolve
  })
  initKeystoneResolve!()

  if (app && httpServer) {
    const server = await setupHttpServer(
      cwd,
      app,
      httpServer,
      isReady,
      expressServer,
      hasAddedAdminUIMiddleware,
      log
    )
    await initKeystonePromise
    return async () => {
      await stopAll(esbuildContext, server, context?.prisma)
    }
  } else {
    await initKeystonePromise
    return () => Promise.resolve()
  }
}