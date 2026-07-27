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

/** Log only when not in quiet mode */
function createLogger(quiet: boolean) {
  return (message: string) => {
    if (!quiet) console.log(message)
  }
}

/** Create the database if it does not exist */
async function maybeCreateDatabase(
  system: ReturnType<typeof createSystem>,
  paths: { schema: { prisma: string } },
  log: (msg: string) => void
) {
  const created = await createDatabase(system.config.db.url, path.dirname(paths.schema.prisma))
  if (created) log(`✨ Database created`)
  return created
}

/** Handle unexecutable migration steps */
async function handleUnexecutableSteps(
  migration_: { unexecutable: string[]; warnings: string[] },
  m: any,
  generatedPrismaSchema: string,
  log: (msg: string) => void
) {
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
  const proceed = await confirmPrompt(
    `Do you want to continue? ${chalk.red('The database will be reset')}`,
    false
  )
  if (!proceed) {
    throw new ExitError(1, 'Database reset cancelled by user')
  }

  await m.reset()
  return m.schema(generatedPrismaSchema, false)
}

/** Handle migration warnings */
async function handleMigrationWarnings(
  migration_: { warnings: string[] },
  m: any,
  generatedPrismaSchema: string,
  log: (msg: string) => void
) {
  console.error(chalk.bold(`\n⚠️  Warnings:\n`))
  for (const warning of migration_.warnings) {
    console.error(`  • ${warning}`)
  }

  const proceed = await confirmPrompt(
    `Do you want to continue? ${chalk.red('Some data will be lost')}`,
    false
  )
  if (!proceed) {
    throw new ExitError(1, 'Database push cancelled by user')
  }

  return m.schema(generatedPrismaSchema, true)
}

/** Run Prisma migration with proper handling of warnings and unexecutable steps */
async function runMigration(
  system: ReturnType<typeof createSystem>,
  paths: { schema: { prisma: string } },
  generatedPrismaSchema: string,
  log: (msg: string) => void
) {
  return await withMigrate(paths.schema.prisma, system, async m => {
    const migration_ = await m.schema(generatedPrismaSchema, false)

    if (migration_.unexecutable.length) {
      return await handleUnexecutableSteps(migration_, m, generatedPrismaSchema, log)
    }

    if (migration_.warnings.length) {
      return await handleMigrationWarnings(migration_, generatedPrismaSchema, log)
    }

    return migration_
  })
}

/** Initialise system, generate artifacts and optionally push schema */
async function initialiseSystemAndArtifacts(
  cwd: string,
  config: KeystoneConfig,
  flags: Pick<Flags, 'dbPush' | 'prisma' | 'quiet' | 'server' | 'ui'>,
  log: (msg: string) => void
) {
  const system = createSystem(stripExtendHttpServer(config))

  if (!flags.prisma) {
    return { system }
  }

  log('✨ Generating GraphQL and Prisma schemas')
  const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
  await generateTypes(cwd, system)
  await generatePrismaClient(cwd, system)

  const paths = system.getPaths(cwd)

  if (flags.dbPush) {
    await maybeCreateDatabase(system, paths, log)
    const migration = await runMigration(system, paths, generatedPrismaSchema, log)

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
  log(`✅ GraphQL API ready`)

  return {
    system,
    context: keystone.context,
    prismaClientModule,
    apolloServer,
    expressServer,
  }
}

/** Prepare Admin UI if enabled */
async function maybeSetupAdminUI(
  system: ReturnType<typeof createSystem>,
  context: any,
  expressServer: express.Express,
  uiFlag: boolean,
  log: (msg: string) => void,
  cwd: string
) {
  if (system.config.ui?.isDisabled || !uiFlag) return { nextApp: undefined }

  if (!expressServer || !context) throw new TypeError('Error trying to prepare the Admin UI')

  log('✨ Generating Admin UI code')
  const paths = system.getPaths(cwd)
  await fsp.rm(paths.admin, { recursive: true, force: true })
  await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

  log('✨ Preparing Admin UI')
  const nextApp = next({ dev: true, dir: paths.admin })
  await nextApp.prepare()
  expressServer.use(
    createAdminUIMiddlewareWithNextApp(system.config, context, nextApp)
  )
  log(`✅ Admin UI ready`)

  return { nextApp }
}

/** Process a single build result */
async function processBuildResult(
  buildResult: BuildResult,
  system: ReturnType<typeof createSystem>,
  cwd: string,
  prismaFlag: boolean,
  prismaClientModule: any,
  expressServerRef: { current: express.Express | null },
  nextApp: any,
  lastPrintedGraphQLSchemaRef: { current: string },
  lastApolloServerRef: { current: any },
  log: (msg: string) => void
) {
  if (buildResult.errors.length) return

  log('compiled successfully')
  const paths = system.getPaths(cwd)

  // wipe the require cache for the config file
  {
    const resolved = require.resolve(paths.config)
    delete require.cache[resolved]
  }

  const newConfig = await importBuiltKeystoneConfiguration(cwd)
  const newSystem = createSystem(stripExtendHttpServer(newConfig))

  if (prismaFlag) {
    const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
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
  if (newPrintedGraphQLSchema !== lastPrintedGraphQLSchemaRef.current) {
    await fsp.writeFile(
      paths.schema.graphql,
      getFormattedGraphQLSchema(newPrintedGraphQLSchema)
    )
    lastPrintedGraphQLSchemaRef.current = newPrintedGraphQLSchema
  }

  await generateTypes(cwd, newSystem)
  await generateAdminUI(newSystem.config, newSystem.adminMeta, paths.admin, true)

  if (prismaClientModule && expressServerRef.current && lastApolloServerRef.current) {
    const { context: newContext } = newSystem.getKeystone(prismaClientModule)
    const servers = await createExpressServer(newSystem.config, newContext)

    if (nextApp) {
      servers.expressServer.use(
        createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, nextApp)
      )
    }

    expressServerRef.current = servers.expressServer
    const prevApolloServer = lastApolloServerRef.current
    lastApolloServerRef.current = servers.apolloServer
    await prevApolloServer.stop()
  }
}

/** Main dev function */
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
  } catch {
    // esbuild prints everything we want users to see
  }

  esbuildContext.watch()

  let prismaClient: any = null

  async function stop(aHttpServer: any, exitMessage: string = '') {
    await esbuildContext.dispose()

    if (aHttpServer) {
      await new Promise((resolve, reject) => {
        aHttpServer.close((err: any) => {
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

  // ---------- Init Keystone ----------
  async function initKeystone() {
    const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)

    const {
      system,
      context,
      prismaClientModule,
      apolloServer,
      expressServer: createdExpressServer,
    } = await initialiseSystemAndArtifacts(cwd, configWithExtendHttp, { dbPush, prisma, quiet, server, ui }, log)

    if (configWithExtendHttp?.server?.extendHttpServer && httpServer && context) {
      configWithExtendHttp.server.extendHttpServer(httpServer, context)
    }

    prismaClient = context?.prisma
    if (createdExpressServer) {
      expressServer = createdExpressServer
    }

    const { nextApp } = await maybeSetupAdminUI(system, context, expressServer!, ui, log, cwd)

    hasAddedAdminUIMiddleware = true
    initKeystonePromiseResolve?.()

    const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
    let lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)
    let lastApolloServer = apolloServer ?? null

    if (system.config.telemetry !== false) {
      runTelemetry(cwd, system.lists, system.config.db.provider)
    }

    const expressServerRef = { current: expressServer }
    const lastPrintedGraphQLSchemaRef = { current: lastPrintedGraphQLSchema }
    const lastApolloServerRef = { current: lastApolloServer }

    for await (const buildResult of builds) {
      try {
        await processBuildResult(
          buildResult,
          system,
          cwd,
          prisma,
          prismaClientModule,
          expressServerRef,
          nextApp,
          lastPrintedGraphQLSchemaRef,
          lastApolloServerRef,
          log
        )
      } catch (err) {
        console.error(`Error loading your Keystone config`, err)
      }
    }
  }

  // ---------- Server setup ----------
  let initKeystonePromiseResolve: (() => void) | undefined
  let initKeystonePromiseReject: ((err: any) => void) | undefined
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
        await stop(server)
        initKeystonePromiseReject?.(err)
      })
    })

    await initKeystonePromise
    return async () => await stop(server)
  } else {
    await initKeystone()
    return () => Promise.resolve()
  }
}