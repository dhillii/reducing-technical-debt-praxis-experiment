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
 * Generates GraphQL and Prisma schemas, types, and Prisma client.
 * @param cwd Current working directory
 * @param system Keystone system instance
 * @param dbPush Flag to push database schema
 * @param log Logging function
 * @returns Generated Prisma schema and migration result
 */
async function generateArtifactsAndClient(
  cwd: string,
  system: any,
  dbPush: boolean,
  log: (msg: string) => void
) {
  log('✨ Generating GraphQL and Prisma schemas')
  const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
  await generateTypes(cwd, system)
  await generatePrismaClient(cwd, system)

  const paths = system.getPaths(cwd)
  if (!dbPush) {
    log('⚠️ Skipping database schema push')
    return { generatedPrismaSchema, migration: null }
  }

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

  return { generatedPrismaSchema, migration }
}

/**
 * Connects to the database and optionally creates the server.
 * @param system Keystone system instance
 * @param prismaClientModule Path to Prisma client module
 * @param server Express server flag
 * @param log Logging function
 * @returns Keystone instance and context
 */
async function connectAndCreateServer(
  system: any,
  prismaClientModule: any,
  server: boolean,
  log: (msg: string) => void
) {
  const prismaClientModuleResolved = require(prismaClientModule)
  const keystone = system.getKeystone(prismaClientModuleResolved)

  log('✨ Connecting to the database')
  await keystone.connect() // TODO: remove, replace with server.onStart

  if (!server) {
    return { keystone, context: keystone.context }
  }

  log('✨ Creating server')
  const { apolloServer, expressServer } = await createExpressServer(
    system.config,
    keystone.context
  )
  log(`✅ GraphQL API ready`)

  return { keystone, context: keystone.context, expressServer, apolloServer }
}

/**
 * Prepares the Admin UI if enabled.
 * @param system Keystone system instance
 * @param cwd Current working directory
 * @param expressServer Express server instance
 * @param context Keystone context
 * @param ui UI flag
 * @param log Logging function
 * @returns Next.js app instance
 */
async function prepareAdminUI(
  system: any,
  cwd: string,
  expressServer: express.Express,
  context: any,
  ui: boolean,
  log: (msg: string) => void
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
 * Handles a single build result during the dev loop.
 * @param buildResult Build result from esbuild
 * @param system Current Keystone system
 * @param cwd Current working directory
 * @param prisma Prisma flag
 * @param prismaClientModule Prisma client module path
 * @param server Express server flag
 * @param expressServer Express server instance
 * @param nextApp Next.js app instance
 * @param log Logging function
 * @param fsp File system promises
 * @param generateTypes Function to generate types
 * @param generateAdminUI Function to generate Admin UI
 * @param createExpressServer Function to create Express server
 * @param runTelemetry Function to run telemetry
 * @param stop Function to stop the dev server
 * @param originalPrismaSchema Original Prisma schema string
 * @param lastPrintedGraphQLSchema Last printed GraphQL schema string
 * @param lastApolloServer Last Apollo server instance
 */
async function processBuildResult(
  buildResult: BuildResult,
  system: any,
  cwd: string,
  prisma: boolean,
  prismaClientModule: any,
  server: boolean,
  expressServer: express.Express | null,
  nextApp: any,
  log: (msg: string) => void,
  fsp: typeof import('node:fs/promises'),
  generateTypes: typeof generateTypes,
  generateAdminUI: typeof generateAdminUI,
  createExpressServer: typeof createExpressServer,
  runTelemetry: typeof runTelemetry,
  stop: (aHttpServer: any, exitMessage?: string) => Promise<void>,
  originalPrismaSchema: string,
  lastPrintedGraphQLSchema: string,
  lastApolloServer: any
) {
  const paths = system.getPaths(cwd)

  // wipe the require cache
  const resolved = require.resolve(paths.config)
  delete require.cache[resolved]

  const newConfigWithHttp = await importBuiltKeystoneConfiguration(cwd)
  const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

  if (prisma) {
    if (!originalPrismaSchema) throw new TypeError('Missing Prisma schema source')

    const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
    if (originalPrismaSchema !== newPrismaSchema) {
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
  if (newPrintedGraphQLSchema !== lastPrintedGraphQLSchema) {
    await fsp.writeFile(
      paths.schema.graphql,
      getFormattedGraphQLSchema(newPrintedGraphQLSchema)
    )
    lastPrintedGraphQLSchema = newPrintedGraphQLSchema
  }

  await generateTypes(cwd, newSystem)
  await generateAdminUI(newSystem.config, newSystem.adminMeta, paths.admin, true)

  if (prismaClientModule) {
    if (server && lastApolloServer) {
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
          // TODO: no any
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

    //   WARNING: this is only actually required for tests
    // stop httpServer
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

    //   WARNING: this is only required for tests
    // stop Prisma
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

    let context: any
    let prismaClientModule: any
    let apolloServer: any

    if (prisma) {
      const { generatedPrismaSchema, migration } = await generateArtifactsAndClient(
        cwd,
        system,
        dbPush,
        log
      )

      const { keystone, context: keystoneContext, expressServer: es, apolloServer: ap } =
        await connectAndCreateServer(system, system.getPaths(cwd).prisma, server, log)

      context = keystoneContext
      prismaClientModule = system.getPaths(cwd).prisma
      apolloServer = ap

      if (!server) {
        return {
          system,
          context,
          prismaClientModule,
        }
      }

      expressServer = es
    }

    if (configWithExtendHttp?.server?.extendHttpServer && httpServer && context) {
      configWithExtendHttp.server.extendHttpServer(httpServer, context)
    }

    prismaClient = context?.prisma
    if (expressServer) {
      ;({ expressServer } = { expressServer })
    }

    const nextApp = await prepareAdminUI(
      system,
      cwd,
      expressServer,
      context,
      ui,
      log
    )

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
      try {
        await processBuildResult(
          buildResult,
          system,
          cwd,
          prisma,
          prismaClientModule,
          server,
          expressServer,
          nextApp,
          log,
          fsp,
          generateTypes,
          generateAdminUI,
          createExpressServer,
          runTelemetry,
          stop,
          originalPrismaSchema,
          lastPrintedGraphQLSchema,
          lastApolloServer
        )
      } catch (err) {
        console.error(`Error loading your Keystone config`, err)
      }
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

    const httpOptions: ListenOptions = {
      port: 3000,
    }

    if (config?.server && 'port' in config.server && typeof config.server?.port === 'number') {
      httpOptions.port = config.server.port
    }

    if (config?.server && 'options' in config.server && config.server.options) {
      Object.assign(httpOptions, config.server.options)
    }

    // preference env.PORT if supplied
    if ('PORT' in process.env) {
      httpOptions.port = parseInt(process.env.PORT ?? '')
    }

    // preference env.HOST if supplied
    if ('HOST' in process.env) {
      httpOptions.host = process.env.HOST ?? ''
    }

    const server = httpServer.listen(httpOptions, (err?: any) => {
      if (err) throw err

      const easyHost = [undefined, '', '::', '0.0.0.0'].includes(httpOptions.host)
        ? 'localhost'
        : httpOptions.host
      log(
        `⭐️ Server listening on ${httpOptions.host ?? ''}:${httpOptions.port} (http://${easyHost}:${httpOptions.port}/)`
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