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
 * Create an async iterator that yields esbuild build results.
 * The iterator is driven by the esbuild watch plugin.
 */
function createBuildIterator(esbuildContext: esbuild.BuildContext) {
  let lastPromise = resolvablePromise<IteratorResult<BuildResult>>()

  const builds: AsyncIterable<BuildResult> = {
    [Symbol.asyncIterator]: () => ({
      next: () => lastPromise,
    }),
  }

  function addBuildResult(build: BuildResult) {
    const prev = lastPromise
    lastPromise = resolvablePromise()
    prev.resolve({ value: build, done: false })
  }

  esbuildContext.watch()
  return { builds, addBuildResult }
}

/**
 * Generate artifacts, Prisma client, and optionally push the database.
 */
async function generateArtifactsIfNeeded(
  cwd: string,
  system: any,
  prisma: boolean,
  dbPush: boolean,
  log: (msg: string) => void
) {
  if (!prisma) return {}

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

  if (!system.config.server) {
    return { system, context: keystone.context, prismaClientModule }
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

/**
 * Prepare the Admin UI and attach middleware to the express server.
 */
async function prepareAdminUI(
  system: any,
  cwd: string,
  ui: boolean,
  expressServer: express.Express,
  context: any,
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
 * Handle the build loop, updating artifacts and restarting the server as needed.
 */
async function handleBuildLoop(
  builds: AsyncIterable<BuildResult>,
  cwd: string,
  system: any,
  prisma: boolean,
  prismaClientModule: any,
  expressServer: express.Express | null,
  apolloServer: any,
  nextApp: any,
  ui: boolean,
  log: (msg: string) => void,
  stop: (server: any, exitMessage?: string) => Promise<void>
) {
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
        if (expressServer && lastApolloServer) {
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
    } catch (err) {
      console.error(`Error loading your Keystone config`, err)
    }
  }
}

/**
 * Main initialization of Keystone, including artifact generation, server creation, and admin UI setup.
 */
async function initKeystone(
  cwd: string,
  prisma: boolean,
  dbPush: boolean,
  ui: boolean,
  server: boolean,
  log: (msg: string) => void,
  quiet: boolean,
  builds: AsyncIterable<BuildResult>,
  stop: (server: any, exitMessage?: string) => Promise<void>
) {
  const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
  const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

  const {
    context,
    expressServer: initialExpressServer,
    apolloServer: initialApolloServer,
    prismaClientModule,
  } = await generateArtifactsIfNeeded(cwd, system, prisma, dbPush, log)

  let expressServer = initialExpressServer ?? null
  let apolloServer = initialApolloServer ?? null
  let nextApp: any = null

  if (server && expressServer && context) {
    // express server already created in generateArtifactsIfNeeded
  }

  nextApp = await prepareAdminUI(system, cwd, ui, expressServer!, context, log)

  const hasAddedAdminUIMiddleware = true
  const initKeystonePromiseResolve = () => {}

  const prismaClient = context?.prisma ?? null

  await handleBuildLoop(
    builds,
    cwd,
    system,
    prisma,
    prismaClientModule,
    expressServer,
    apolloServer,
    nextApp,
    ui,
    log,
    stop
  )
}

/**
 * Development server entry point.
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
  const isReady = () => !server || (expressServer !== null)

  const { builds, addBuildResult } = createBuildIterator(esbuildContext)

  try {
    const firstBuild = await esbuildContext.rebuild()
    addBuildResult(firstBuild)
  } catch (e) {
    // esbuild prints everything we want users to see
  }

  const initKeystonePromise = new Promise<void>(async (resolve, reject) => {
    try {
      await initKeystone(
        cwd,
        prisma,
        dbPush,
        ui,
        server,
        log,
        quiet,
        builds,
        stop
      )
      resolve()
    } catch (err) {
      reject(err)
    }
  })

  if (app && httpServer) {
    const config = await importBuiltKeystoneConfiguration(cwd)

    app.use('/__keystone/dev/status', (req, res) => {
      res.status(isReady() ? 200 : 501).end()
    })

    app.use((req, res, next) => {
      if (expressServer) {
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

    const serverInstance = httpServer.listen(httpOptions, (err?: any) => {
      if (err) throw err

      const easyHost = [undefined, '', '::', '0.0.0.0'].includes(httpOptions.host)
        ? 'localhost'
        : httpOptions.host
      log(
        `⭐️ Server listening on ${httpOptions.host ?? ''}:${httpOptions.port} (http://${easyHost}:${httpOptions.port}/)`
      )
      log(`⭐️ GraphQL API available at ${config.graphql?.path ?? '/api/graphql'}`)

      initKeystonePromise.catch(async err => {
        await stop(serverInstance)
        throw err
      })
    })

    await initKeystonePromise
    return async () => await stop(serverInstance)
  } else {
    await initKeystonePromise
    return () => Promise.resolve()
  }
}