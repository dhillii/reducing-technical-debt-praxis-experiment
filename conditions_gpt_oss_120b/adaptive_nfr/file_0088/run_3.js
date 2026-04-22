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

/** Creates a resolvable promise used for build result streaming. */
function resolvablePromise<T>() {
  let _resolve!: (value: T) => void
  const promise: any = new Promise<T>(resolve => {
    _resolve = resolve
  })
  promise.resolve = _resolve
  return promise
}

/** Guard: returns true when the server should be considered ready. */
function isReady(server: boolean, expressServer: express.Express | null, hasAddedAdminUIMiddleware: boolean) {
  return !server || (expressServer !== null && hasAddedAdminUIMiddleware)
}

/** Guard: determines if a config object contains a numeric port. */
function hasNumericPort(config: any): config is { server: { port: number } } {
  return config?.server && typeof config.server.port === 'number'
}

/** Guard: determines if a config object contains server options. */
function hasServerOptions(config: any): config is { server: { options: object } } {
  return config?.server && typeof config.server.options === 'object' && config.server.options !== null
}

/** Starts esbuild in watch mode and returns an async iterable of build results. */
async function startEsbuildWatch(cwd: string) {
  const esbuildConfig = await getEsbuildConfig(cwd)
  const esbuildContext = await esbuild.context({
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
    // esbuild prints everything we want users to see
  }

  esbuildContext.watch()
  return { builds, esbuildContext }
}

/** Handles a single build result, performing hot-reload actions. */
async function handleBuildResult(
  buildResult: BuildResult,
  system: any,
  cwd: string,
  prisma: boolean,
  prismaClientModule: any,
  server: boolean,
  expressServer: express.Express | null,
  lastApolloServer: any,
  nextApp: any,
  log: (msg: string) => void,
  stop: (aHttpServer: any, exitMessage?: string) => Promise<void>
) {
  if (buildResult.errors.length) return

  log('compiled successfully')
  try {
    const paths = system.getPaths(cwd)

    // wipe the require cache
    {
      const resolved = require.resolve(paths.config)
      delete require.cache[resolved]
    }

    const newConfigWithHttp = await importBuiltKeystoneConfiguration(cwd)
    const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

    if (prisma) {
      const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
      if (!originalPrismaSchema) throw new TypeError('Missing Prisma schema source')
      const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
      if (originalPrismaSchema !== newPrismaSchema) {
        await stop(null, '🔄 Your prisma schema has changed, please restart Keystone')
        return
      }
      if (
        JSON.stringify(newSystem.config.db.enableLogging) !==
          JSON.stringify(system.config.db.enableLogging) ||
        newSystem.config.db.url !== system.config.db.url
      ) {
        await stop(null, 'Your database configuration has changed, please restart Keystone')
        return
      }
    }

    const newPrintedGraphQLSchema = printSchema(newSystem.graphql.schemas.public)
    const lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)
    if (newPrintedGraphQLSchema !== lastPrintedGraphQLSchema) {
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
      const prevApolloServer = lastApolloServer
      lastApolloServer = servers.apolloServer
      await prevApolloServer.stop()
    }
  } catch (err) {
    console.error(`Error loading your Keystone config`, err)
  }
}

/** Initializes Keystone and returns runtime objects needed for the dev server. */
async function initKeystoneCore(
  cwd: string,
  prisma: boolean,
  dbPush: boolean,
  log: (msg: string) => void,
  stop: (aHttpServer: any, exitMessage?: string) => Promise<void>,
  ui: boolean,
  server: boolean,
  nextApp: any,
  expressServer: express.Express | null,
  hasAddedAdminUIMiddleware: boolean,
  initKeystonePromiseResolve: () => void | undefined
) {
  const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
  const { system, context, prismaClientModule, apolloServer, ...rest } = await (async () => {
    const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

    if (prisma) {
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

    return { system }
  })()

  if (configWithExtendHttp?.server?.extendHttpServer && httpServer && context) {
    configWithExtendHttp.server.extendHttpServer(httpServer, context)
  }

  if (!system.config.ui?.isDisabled && ui) {
    if (!expressServer || !context) throw new TypeError('Error trying to prepare the Admin UI')
    log('✨ Generating Admin UI code')
    const paths = system.getPaths(cwd)
    await fsp.rm(paths.admin, { recursive: true, force: true })
    await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

    log('✨ Preparing Admin UI')
    const nextAppInstance = next({ dev: true, dir: paths.admin })
    await nextAppInstance.prepare()
    expressServer.use(
      createAdminUIMiddlewareWithNextApp(system.config, context, nextAppInstance)
    )
    log(`✅ Admin UI ready`)
    nextApp = nextAppInstance
  }

  hasAddedAdminUIMiddleware = true
  initKeystonePromiseResolve?.()
  return {
    system,
    context,
    prismaClientModule,
    apolloServer,
    expressServer,
    nextApp,
  }
}

/** Configures the Express app and HTTP server, returning a promise that resolves when ready. */
async function configureServer(
  cwd: string,
  app: express.Express | null,
  httpServer: ReturnType<typeof createServer> | null,
  isReady: () => boolean,
  config: any,
  devLoadingHTMLFilepath: string,
  log: (msg: string) => void,
  stop: (aHttpServer: any, exitMessage?: string) => Promise<void>
) {
  if (!app || !httpServer) return { server: null }

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

  if (hasNumericPort(config)) {
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

  const server = httpServer.listen(httpOptions, async err => {
    if (err) throw err

    const easyHost = [undefined, '', '::', '0.0.0.0'].includes(httpOptions.host)
      ? 'localhost'
      : httpOptions.host
    log(
      `⭐️ Server listening on ${httpOptions.host ?? ''}:${httpOptions.port} (http://${easyHost}:${httpOptions.port}/)`
    )
    log(`⭐️ GraphQL API available at ${config.graphql?.path ?? '/api/graphql'}`)
  })

  return { server }
}

/** Main dev command implementation. */
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
  const { builds, esbuildContext } = await startEsbuildWatch(cwd)

  let prismaClient: any = null
  let expressServer: express.Express | null = null
  let hasAddedAdminUIMiddleware = false
  let nextApp: any = null
  let lastApolloServer: any = null

  async function stop(aHttpServer: any, exitMessage: string = '') {
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

  const app = server ? express() : null
  const httpServer = app ? createServer(app) : null

  const isReadyFn = () => isReady(server, expressServer, hasAddedAdminUIMiddleware)

  let initKeystonePromiseResolve: () => void | undefined
  let initKeystonePromiseReject: (err: any) => void | undefined
  const initKeystonePromise = new Promise<void>((resolve, reject) => {
    initKeystonePromiseResolve = resolve
    initKeystonePromiseReject = reject
  })

  async function initKeystone() {
    const {
      system,
      context,
      prismaClientModule,
      apolloServer,
      expressServer: newExpressServer,
      nextApp: newNextApp,
    } = await initKeystoneCore(
      cwd,
      prisma,
      dbPush,
      log,
      stop,
      ui,
      server,
      nextApp,
      expressServer,
      hasAddedAdminUIMiddleware,
      initKeystonePromiseResolve
    )
    prismaClient = context?.prisma
    if (newExpressServer) expressServer = newExpressServer
    if (apolloServer) lastApolloServer = apolloServer
    if (newNextApp) nextApp = newNextApp

    if (system.config.telemetry !== false) {
      runTelemetry(cwd, system.lists, system.config.db.provider)
    }

    for await (const buildResult of builds) {
      await handleBuildResult(
        buildResult,
        system,
        cwd,
        prisma,
        prismaClientModule,
        server,
        expressServer,
        lastApolloServer,
        nextApp,
        log,
        stop
      )
    }
  }

  if (app && httpServer) {
    const config = await importBuiltKeystoneConfiguration(cwd)

    const { server: devServer } = await configureServer(
      cwd,
      app,
      httpServer,
      isReadyFn,
      config,
      devLoadingHTMLFilepath,
      log,
      stop
    )

    if (devServer) {
      initKeystone().catch(async err => {
        await stop(devServer)
        initKeystonePromiseReject?.(err)
      })
    }

    await initKeystonePromise
    return async () => await stop(devServer)
  } else {
    await initKeystone()
    return () => Promise.resolve()
  }
}