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
 * Handles migration execution, including unexecutable steps and warnings.
 */
async function runMigration(
  migrateFn: (schema: string, force: boolean) => Promise<any>,
  generatedPrismaSchema: string,
  log: (msg: string) => void
) {
  const migration = await migrateFn(generatedPrismaSchema, false)

  if (migration.unexecutable.length) {
    console.error(`${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`)
    for (const item of migration.unexecutable) {
      console.error(`  • ${item}`)
    }

    if (migration.warnings.length) {
      console.error(chalk.bold(`\n⚠️  Warnings:\n`))
      for (const warning of migration.warnings) {
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

    await migrateFn.reset()
    return await migrateFn(generatedPrismaSchema, false)
  }

  if (migration.warnings.length) {
    console.error(chalk.bold(`\n⚠️  Warnings:\n`))
    for (const warning of migration.warnings) {
      console.error(`  • ${warning}`)
    }

    const proceed = await confirmPrompt(
      `Do you want to continue? ${chalk.red('Some data will be lost')}`,
      false
    )
    if (!proceed) {
      throw new ExitError(1, 'Database push cancelled by user')
    }

    return await migrateFn(generatedPrismaSchema, true)
  }

  return migration
}

/**
 * Creates the database if needed and runs migration.
 */
async function handleDatabasePush(
  dbPush: boolean,
  system: any,
  generatedPrismaSchema: string,
  paths: any,
  log: (msg: string) => void
) {
  if (!dbPush) {
    log('⚠️ Skipping database schema push')
    return null
  }

  const created = await createDatabase(system.config.db.url, path.dirname(paths.schema.prisma))
  if (created) log(`✨ Database created`)

  const migrationResult = await withMigrate(paths.schema.prisma, system, async m => {
    return runMigration(m.schema.bind(m), generatedPrismaSchema, log)
  })

  if (migrationResult.warnings.length === 0 && migrationResult.executedSteps === 0) {
    log(`✨ Database unchanged`)
  } else {
    log(`✨ Database synchronized with Prisma schema`)
  }

  return migrationResult
}

/**
 * Prepares the Admin UI if enabled.
 */
async function prepareAdminUI(
  system: any,
  context: any,
  uiEnabled: boolean,
  uiFlag: boolean,
  log: (msg: string) => void,
  cwd: string
) {
  if (!uiEnabled || !uiFlag) return null

  if (!system || !context) throw new TypeError('Error trying to prepare the Admin UI')

  log('✨ Generating Admin UI code')
  const paths = system.getPaths(cwd)
  await fsp.rm(paths.admin, { recursive: true, force: true })
  await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

  log('✨ Preparing Admin UI')
  const nextApp = next({ dev: true, dir: paths.admin })
  await nextApp.prepare()
  return { nextApp, paths }
}

/**
 * Processes a single build result from esbuild.
 */
async function processBuildResult(
  buildResult: BuildResult,
  system: any,
  cwd: string,
  prisma: boolean,
  originalPrismaSchema: string | null,
  prismaClientModule: any,
  server: boolean,
  lastApolloServer: any,
  nextApp: any,
  expressServer: any,
  log: (msg: string) => void
) {
  if (buildResult.errors.length) return { expressServer, lastApolloServer }

  log('compiled successfully')
  const paths = system.getPaths(cwd)

  // wipe the require cache
  {
    const resolved = require.resolve(paths.config)
    delete require.cache[resolved]
  }

  const newConfigWithHttp = await importBuiltKeystoneConfiguration(cwd)
  const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

  if (prisma) {
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
  if (newPrintedGraphQLSchema !== printSchema(system.graphql.schemas.public)) {
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

    const prevApolloServer = lastApolloServer
    await prevApolloServer.stop()
    return {
      expressServer: servers.expressServer,
      lastApolloServer: servers.apolloServer,
    }
  }

  return { expressServer, lastApolloServer }
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
  let expressServer: express.Express | null = null
  let hasAddedAdminUIMiddleware = false
  const isReady = () => !server || (expressServer !== null && hasAddedAdminUIMiddleware)

  const initKeystone = async () => {
    const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
    const { system, context, prismaClientModule, apolloServer, ...rest } = await (async () => {
      const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

      if (prisma) {
        log('✨ Generating GraphQL and Prisma schemas')
        const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
        await generateTypes(cwd, system)
        await generatePrismaClient(cwd, system)

        const paths = system.getPaths(cwd)
        await handleDatabasePush(dbPush, system, generatedPrismaSchema, paths, log)

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

    prismaClient = context?.prisma
    if (rest.expressServer) {
      ;({ expressServer } = rest)
    }

    const adminResult = await prepareAdminUI(
      system,
      context,
      !!system.config.ui?.isDisabled === false,
      ui,
      log,
      cwd
    )
    if (adminResult) {
      const { nextApp, paths } = adminResult
      expressServer!.use(
        createAdminUIMiddlewareWithNextApp(system.config, context!, nextApp)
      )
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
      try {
        const result = await processBuildResult(
          buildResult,
          system,
          cwd,
          prisma,
          originalPrismaSchema,
          prismaClientModule,
          server,
          lastApolloServer,
          adminResult?.nextApp,
          expressServer,
          log
        )
        expressServer = result.expressServer ?? expressServer
        lastApolloServer = result.lastApolloServer ?? lastApolloServer
        lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)
      } catch (err) {
        console.error(`Error loading your Keystone config`, err)
      }
    }
  }

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