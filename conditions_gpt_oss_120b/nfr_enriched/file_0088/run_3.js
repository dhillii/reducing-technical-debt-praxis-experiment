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

/** Logs a message unless quiet mode is enabled. */
function createLogger(quiet: boolean) {
  return (message: string) => {
    if (!quiet) console.log(message)
  }
}

/** Starts esbuild in watch mode and returns utilities for build handling. */
async function startEsbuildWatch(
  cwd: string,
  log: (msg: string) => void
) {
  const esbuildConfig = await getEsbuildConfig(cwd)

  let lastPromise = resolvablePromise<IteratorResult<BuildResult>>()
  const builds: AsyncIterable<BuildResult> = {
    [Symbol.asyncIterator]: () => ({ next: () => lastPromise }),
  }

  function addBuildResult(build: BuildResult) {
    const prev = lastPromise
    lastPromise = resolvablePromise()
    prev.resolve({ value: build, done: false })
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

/** Handles the initial Keystone bootstrap. */
async function bootstrapKeystone(
  cwd: string,
  flags: Pick<Flags, 'dbPush' | 'prisma' | 'quiet' | 'server' | 'ui'>,
  log: (msg: string) => void,
  httpServer: any,
  initKeystoneResolve: () => void
) {
  const { dbPush, prisma, server, ui } = flags
  const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
  const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

  // ---------- Artifact generation ----------
  if (prisma) {
    log('✨ Generating GraphQL and Prisma schemas')
    const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
    await generateTypes(cwd, system)
    await generatePrismaClient(cwd, system)

    const paths = system.getPaths(cwd)

    if (dbPush) {
      const created = await createDatabase(system.config.db.url, path.dirname(paths.schema.prisma))
      if (created) log('✨ Database created')

      const migration = await withMigrate(paths.schema.prisma, system, async m => {
        const migration_ = await m.schema(generatedPrismaSchema, false)

        if (migration_.unexecutable.length) {
          console.error(`${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`)
          for (const item of migration_.unexecutable) console.error(`  • ${item}`)

          if (migration_.warnings.length) {
            console.error(chalk.bold('\n⚠️  Warnings:\n'))
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
          console.error(chalk.bold('\n⚠️  Warnings:\n'))
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
        log('✨ Database unchanged')
      } else {
        log('✨ Database synchronized with Prisma schema')
      }
    } else {
      log('⚠️ Skipping database schema push')
    }

    const prismaClientModule = require(system.getPaths(cwd).prisma)
    const keystone = system.getKeystone(prismaClientModule)

    log('✨ Connecting to the database')
    await keystone.connect()

    if (!server) {
      return { system, context: keystone.context, prismaClientModule }
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

  // No Prisma path
  return { system }
}

/** Prepares the Admin UI if required. */
async function prepareAdminUI(
  system: any,
  context: any,
  uiEnabled: boolean,
  uiFlag: boolean,
  log: (msg: string) => void,
  cwd: string
) {
  if (!uiEnabled || !uiFlag) return null

  const paths = system.getPaths(cwd)
  await fsp.rm(paths.admin, { recursive: true, force: true })
  await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

  log('✨ Preparing Admin UI')
  const nextApp = next({ dev: true, dir: paths.admin })
  await nextApp.prepare()
  return nextApp
}

/** Watches build results and hot‑reloads Keystone when possible. */
async function watchBuilds(
  builds: AsyncIterable<BuildResult>,
  system: any,
  cwd: string,
  prisma: boolean,
  prismaClientModule: any,
  expressServerRef: { current: any },
  apolloServerRef: { current: any },
  nextApp: any,
  log: (msg: string) => void,
  stop: (msg: string) => Promise<void>
) {
  const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
  let lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)
  let lastApolloServer = apolloServerRef.current

  for await (const buildResult of builds) {
    if (buildResult.errors.length) continue

    log('compiled successfully')
    try {
      const paths = system.getPaths(cwd)

      // clear require cache for config
      const resolved = require.resolve(paths.config)
      delete require.cache[resolved]

      const newConfig = await importBuiltKeystoneConfiguration(cwd)
      const newSystem = createSystem(stripExtendHttpServer(newConfig))

      if (prisma) {
        if (!originalPrismaSchema) throw new TypeError('Missing Prisma schema source')
        const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
        if (originalPrismaSchema !== newPrismaSchema) {
          return stop('🔄 Your prisma schema has changed, please restart Keystone')
        }
        if (
          JSON.stringify(newSystem.config.db.enableLogging) !==
            JSON.stringify(system.config.db.enableLogging) ||
          newSystem.config.db.url !== system.config.db.url
        ) {
          return stop('Your database configuration has changed, please restart Keystone')
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

      if (prismaClientModule && expressServerRef.current && lastApolloServer) {
        const { context: newContext } = newSystem.getKeystone(prismaClientModule)
        const servers = await createExpressServer(newSystem.config, newContext)

        if (nextApp) {
          servers.expressServer.use(
            createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, nextApp)
          )
        }

        expressServerRef.current = servers.expressServer
        const prevApollo = lastApolloServer
        lastApolloServer = servers.apolloServer
        await prevApollo.stop()
      }
    } catch (err) {
      console.error('Error loading your Keystone config', err)
    }
  }
}

/** Configures the HTTP server and routing for dev mode. */
async function configureDevServer(
  app: express.Express,
  httpServer: any,
  cwd: string,
  isReady: () => boolean,
  expressServerRef: { current: any },
  hasAddedAdminUIMiddlewareRef: { current: boolean },
  log: (msg: string) => void
) {
  const config = await importBuiltKeystoneConfiguration(cwd)

  app.use('/__keystone/dev/status', (req, res) => {
    res.status(isReady() ? 200 : 501).end()
  })

  app.use((req, res, next) => {
    if (expressServerRef.current && hasAddedAdminUIMiddlewareRef.current) {
      return expressServerRef.current(req, res, next)
    }

    const { pathname } = new URL(req.url, 'http://ks')
    if (
      expressServerRef.current &&
      pathname === (config.graphql?.path ?? '/api/graphql')
    ) {
      return expressServerRef.current(req, res, next)
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

    const easyHost = [undefined, '', '::', '0.0.0.0'].includes(httpOptions.host)
      ? 'localhost'
      : httpOptions.host
    log(
      `⭐️ Server listening on ${httpOptions.host ?? ''}:${httpOptions.port} (http://${easyHost}:${httpOptions.port}/)`
    )
    log(`⭐️ GraphQL API available at ${config.graphql?.path ?? '/api/graphql'}`)
  })

  return { server, config }
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
  const log = createLogger(quiet)

  log('✨ Starting Keystone')

  const { esbuildContext, builds } = await startEsbuildWatch(cwd, log)

  const app = server ? express() : null
  const httpServer = app ? createServer(app) : null

  const expressServerRef = { current: null as any }
  const apolloServerRef = { current: null as any }
  const hasAddedAdminUIMiddlewareRef = { current: false }

  const isReady = () => !server || (expressServerRef.current && hasAddedAdminUIMiddlewareRef.current)

  let initKeystoneResolve!: () => void
  let initKeystoneReject!: (err: any) => void
  const initKeystonePromise = new Promise<void>((resolve, reject) => {
    initKeystoneResolve = resolve
    initKeystoneReject = reject
  })

  // ---------- Bootstrap Keystone ----------
  const bootstrap = async () => {
    try {
      const {
        system,
        context,
        prismaClientModule,
        apolloServer,
        expressServer,
      } = await bootstrapKeystone(cwd, { dbPush, prisma, quiet, server, ui }, log, httpServer, initKeystoneResolve)

      if (context) {
        if (configWithExtendHttp?.server?.extendHttpServer && httpServer) {
          configWithExtendHttp.server.extendHttpServer(httpServer, context)
        }
      }

      if (expressServer) expressServerRef.current = expressServer
      if (apolloServer) apolloServerRef.current = apolloServer

      const nextApp = await prepareAdminUI(system, context, !!system.config.ui?.isDisabled, ui, log, cwd)
      hasAddedAdminUIMiddlewareRef.current = true
      initKeystoneResolve()

      if (system.config.telemetry !== false) {
        runTelemetry(cwd, system.lists, system.config.db.provider)
      }

      await watchBuilds(
        builds,
        system,
        cwd,
        prisma,
        prismaClientModule,
        expressServerRef,
        apolloServerRef,
        nextApp,
        log,
        async (msg: string) => {
          await stopDev(esbuildContext, httpServer, context?.prisma, msg)
        }
      )
    } catch (err) {
      initKeystoneReject(err)
    }
  }

  // ---------- Server setup ----------
  if (app && httpServer) {
    const { server } = await configureDevServer(
      app,
      httpServer,
      cwd,
      isReady,
      expressServerRef,
      hasAddedAdminUIMiddlewareRef,
      log
    )

    // Delay Keystone init until server is listening
    server.on('listening', () => {
      bootstrap().catch(async err => {
        await stopDev(esbuildContext, server, null, '')
        initKeystoneReject(err)
      })
    })

    await initKeystonePromise
    return async () => await stopDev(esbuildContext, server, null)
  } else {
    await bootstrap()
    await initKeystonePromise
    return () => Promise.resolve()
  }
}