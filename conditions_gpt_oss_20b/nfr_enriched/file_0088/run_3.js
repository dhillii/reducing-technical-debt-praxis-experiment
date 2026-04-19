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

/**
 * Create an esbuild context and return helpers for build handling.
 */
async function createEsbuildContext(
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
          build.onEnd(addBuildResult)
        },
      },
    ],
  })
  return esbuildContext
}

/**
 * Initialise the HTTP server for dev status and admin UI.
 */
function createHttpServer(
  app: express.Express | null,
  httpServer: any,
  config: KeystoneConfig,
  isReady: () => boolean,
  expressServer: express.Express | null,
  hasAddedAdminUIMiddleware: boolean
) {
  if (!app || !httpServer) return null

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

  return httpServer.listen(httpOptions, (err?: any) => {
    if (err) throw err
  })
}

/**
 * Generate artifacts, Prisma client and optionally start the server.
 */
async function generateArtifactsAndPrisma(
  cwd: string,
  system: any,
  prisma: boolean,
  dbPush: boolean,
  log: (msg: string) => void,
  server: boolean,
  ui: boolean,
  expressServer: express.Express | null,
  context: any,
  prismaClientModule: any,
  apolloServer: any,
  nextApp: any,
  hasAddedAdminUIMiddleware: boolean,
  nextAppRef: { value: any }
) {
  if (!prisma) return { system, context, prismaClientModule }

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
    return { system, context: keystone.context, prismaClientModule }
  }

  log('✨ Creating server')
  const { apolloServer, expressServer: newExpressServer } = await createExpressServer(
    system.config,
    keystone.context
  )
  log(`✅ GraphQL API ready`)

  return {
    system,
    context: keystone.context,
    expressServer: newExpressServer,
    apolloServer,
    prismaClientModule,
  }
}

/**
 * Setup Admin UI if enabled.
 */
async function setupAdminUI(
  system: any,
  cwd: string,
  context: any,
  ui: boolean,
  log: (msg: string) => void,
  expressServer: express.Express | null
) {
  if (!system.config.ui?.isDisabled && ui) {
    if (!expressServer || !context) throw new TypeError('Error trying to prepare the Admin UI')

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
  return null
}

/**
 * Handle a single build result.
 */
async function handleBuildResult(
  buildResult: BuildResult,
  system: any,
  cwd: string,
  prisma: boolean,
  prismaClientModule: any,
  expressServer: express.Express | null,
  nextApp: any,
  log: (msg: string) => void,
  stop: (server: any, msg?: string) => Promise<void>,
  dbPush: boolean,
  prismaClient: any,
  configWithExtendHttp: KeystoneConfig,
  server: boolean,
  ui: boolean
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
      if (!system.config.prisma) throw new TypeError('Missing Prisma schema source')

      const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
      if (system.config.prisma !== newPrismaSchema) {
        return stop(null, '🔄 Your prisma schema has changed, please restart Keystone')
      }

      if (
        JSON.stringify(newSystem.config.db.enableLogging) !==
          JSON.stringify(system.config.db.enableLogging) ||
        newSystem.config.db.url !== system.config.db.url
      ) {
        return stop(null, 'Your database configuration has changed, please restart Keystone')
      }
    }

    const newPrintedGraphQLSchema = printSchema(newSystem.graphql.schemas.public)
    if (newPrintedGraphQLSchema !== printSchema(system.graphql.schemas.public)) {
      await fsp.writeFile(
        paths.schema.graphql,
        getFormattedGraphQLSchema(newPrintedGraphQLSchema)
      )
    }

    await generateTypes(cwd, newSystem)
    await generateAdminUI(newSystem.config, newSystem.adminMeta, paths.admin, true)

    if (prismaClientModule) {
      if (server && expressServer) {
        const { context: newContext } = newSystem.getKeystone(prismaClientModule)
        const servers = await createExpressServer(newSystem.config, newContext)
        if (nextApp) {
          servers.expressServer.use(
            createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, nextApp)
          )
        }
        expressServer = servers.expressServer
        const prevApolloServer = servers.apolloServer
        await prevApolloServer.stop()
      }
    }
  } catch (err) {
    console.error(`Error loading your Keystone config`, err)
  }
}

/**
 * Main dev function.
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

  const esbuildContext = await createEsbuildContext(cwd, addBuildResult)

  try {
    const firstBuild = await esbuildContext.rebuild()
    addBuildResult(firstBuild)
  } catch {
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

  const initKeystonePromiseResolve: () => void = () => {}
  const initKeystonePromiseReject: (err: any) => void = () => {}
  const initKeystonePromise = new Promise<void>((resolve, reject) => {
    initKeystonePromiseResolve = resolve
    initKeystonePromiseReject = reject
  })

  async function initKeystone() {
    const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
    const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

    const {
      system: newSystem,
      context,
      prismaClientModule,
      apolloServer,
      expressServer: newExpressServer,
    } = await generateArtifactsAndPrisma(
      cwd,
      system,
      prisma,
      dbPush,
      log,
      server,
      ui,
      expressServer,
      context,
      prismaClientModule,
      apolloServer,
      null,
      hasAddedAdminUIMiddleware,
      { value: null }
    )

    if (configWithExtendHttp?.server?.extendHttpServer && httpServer && context) {
      configWithExtendHttp.server.extendHttpServer(httpServer, context)
    }

    prismaClient = context?.prisma
    if (newExpressServer) {
      expressServer = newExpressServer
    }

    const nextApp = await setupAdminUI(
      newSystem,
      cwd,
      context,
      ui,
      log,
      expressServer
    )

    hasAddedAdminUIMiddleware = true
    initKeystonePromiseResolve()

    const originalPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
    let lastPrintedGraphQLSchema = printSchema(newSystem.graphql.schemas.public)
    let lastApolloServer = apolloServer ?? null

    if (newSystem.config.telemetry !== false) {
      runTelemetry(cwd, newSystem.lists, newSystem.config.db.provider)
    }

    for await (const buildResult of builds) {
      await handleBuildResult(
        buildResult,
        newSystem,
        cwd,
        prisma,
        prismaClientModule,
        expressServer,
        nextApp,
        log,
        stop,
        dbPush,
        prismaClient,
        configWithExtendHttp,
        server,
        ui
      )
    }
  }

  if (app && httpServer) {
    const config = await importBuiltKeystoneConfiguration(cwd)

    const serverInstance = createHttpServer(
      app,
      httpServer,
      config,
      isReady,
      expressServer,
      hasAddedAdminUIMiddleware
    )

    serverInstance?.on('listening', () => {
      const easyHost = [undefined, '', '::', '0.0.0.0'].includes(serverInstance.address()?.address)
        ? 'localhost'
        : serverInstance.address()?.address
      log(
        `⭐️ Server listening on ${serverInstance.address()?.address ?? ''}:${
          serverInstance.address()?.port
        } (http://${easyHost}:${serverInstance.address()?.port}/)`
      )
      log(`⭐️ GraphQL API available at ${config.graphql?.path ?? '/api/graphql'}`)

      initKeystone().catch(async err => {
        await stop(serverInstance)
        initKeystonePromiseReject(err)
      })
    })

    await initKeystonePromise
    return async () => await stop(serverInstance)
  } else {
    await initKeystone()
    return () => Promise.resolve()
  }
}