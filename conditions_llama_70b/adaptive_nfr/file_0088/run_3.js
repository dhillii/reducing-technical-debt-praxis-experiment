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
 * Checks if the database configuration has changed.
 * @param system The current system configuration.
 * @param newSystem The new system configuration.
 * @returns True if the database configuration has changed, false otherwise.
 */
function hasDatabaseConfigChanged(system: any, newSystem: any): boolean {
  return (
    JSON.stringify(newSystem.config.db.enableLogging) !==
      JSON.stringify(system.config.db.enableLogging) ||
    newSystem.config.db.url !== system.config.db.url
  )
}

/**
 * Checks if the Prisma schema has changed.
 * @param originalPrismaSchema The original Prisma schema.
 * @param newPrismaSchema The new Prisma schema.
 * @returns True if the Prisma schema has changed, false otherwise.
 */
function hasPrismaSchemaChanged(originalPrismaSchema: string, newPrismaSchema: string): boolean {
  return originalPrismaSchema !== newPrismaSchema
}

/**
 * Handles the migration of the database schema.
 * @param paths The paths configuration.
 * @param system The system configuration.
 * @param generatedPrismaSchema The generated Prisma schema.
 * @returns The migration result.
 */
async function handleMigration(paths: any, system: any, generatedPrismaSchema: any) {
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

  return migration
}

/**
 * Initializes the Keystone system.
 * @param cwd The current working directory.
 * @param configWithExtendHttp The configuration with extend HTTP server.
 * @param prismaClientModule The Prisma client module.
 * @param context The context.
 * @param expressServer The Express server.
 * @param apolloServer The Apollo server.
 * @param prisma The Prisma configuration.
 * @param ui The UI configuration.
 * @param server The server configuration.
 * @param quiet Whether to quiet the output.
 * @returns The initialized system.
 */
async function initKeystone(
  cwd: string,
  configWithExtendHttp: any,
  prismaClientModule: any,
  context: any,
  expressServer: any,
  apolloServer: any,
  prisma: any,
  ui: any,
  server: any,
  quiet: any
) {
  const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

  if (prisma) {
    const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
    await generateTypes(cwd, system)
    await generatePrismaClient(cwd, system)

    const paths = system.getPaths(cwd)
    if (server) {
      const created = await createDatabase(
        system.config.db.url,
        path.dirname(paths.schema.prisma)
      )
      if (created) console.log(`✨ Database created`)

      const migration = await handleMigration(paths, system, generatedPrismaSchema)

      if (migration.warnings.length === 0 && migration.executedSteps === 0) {
        console.log(`✨ Database unchanged`)
      } else {
        console.log(`✨ Database synchronized with Prisma schema`)
      }
    } else {
      console.log('⚠️ Skipping database schema push')
    }

    const keystone = system.getKeystone(prismaClientModule)

    console.log('✨ Connecting to the database')
    await keystone.connect()

    if (server) {
      console.log('✨ Creating server')
      const { apolloServer: newApolloServer, expressServer: newExpressServer } =
        await createExpressServer(system.config, keystone.context)
      console.log(`✅ GraphQL API ready`)

      return {
        system,
        context: keystone.context,
        expressServer: newExpressServer,
        apolloServer: newApolloServer,
        prismaClientModule,
      }
    }

    return {
      system,
      context: keystone.context,
      prismaClientModule,
    }
  }

  return {
    system,
  }
}

/**
 * Handles the build result.
 * @param buildResult The build result.
 * @param system The system configuration.
 * @param context The context.
 * @param expressServer The Express server.
 * @param apolloServer The Apollo server.
 * @param prismaClientModule The Prisma client module.
 * @param nextApp The Next app.
 * @param lastPrintedGraphQLSchema The last printed GraphQL schema.
 * @param lastApolloServer The last Apollo server.
 * @returns The handled build result.
 */
async function handleBuildResult(
  buildResult: any,
  system: any,
  context: any,
  expressServer: any,
  apolloServer: any,
  prismaClientModule: any,
  nextApp: any,
  lastPrintedGraphQLSchema: any,
  lastApolloServer: any
) {
  if (buildResult.errors.length) return

  console.log('compiled successfully')
  try {
    const paths = system.getPaths(buildResult.cwd)

    // wipe the require cache
    {
      const resolved = require.resolve(paths.config)
      delete require.cache[resolved]
    }

    const newConfigWithHttp = await importBuiltKeystoneConfiguration(buildResult.cwd)
    const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

    if (hasPrismaSchemaChanged(printPrismaSchema(system.config, system.lists), printPrismaSchema(newSystem.config, newSystem.lists))) {
      return stop(null, '🔄 Your prisma schema has changed, please restart Keystone')
    }

    if (hasDatabaseConfigChanged(system, newSystem)) {
      return stop(null, 'Your database configuration has changed, please restart Keystone')
    }

    const newPrintedGraphQLSchema = printSchema(newSystem.graphql.schemas.public)
    if (newPrintedGraphQLSchema !== lastPrintedGraphQLSchema) {
      await fsp.writeFile(
        paths.schema.graphql,
        getFormattedGraphQLSchema(newPrintedGraphQLSchema)
      )
      lastPrintedGraphQLSchema = newPrintedGraphQLSchema
    }

    await generateTypes(buildResult.cwd, newSystem)
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

/**
 * Stops the server.
 * @param aHttpServer The HTTP server.
 * @param exitMessage The exit message.
 * @returns The stopped server.
 */
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

  //   WARNING: this is only actually required for tests
  // stop Prisma
  try {
    await prismaClient?.disconnect?.()
  } catch (err) {
    console.error('Error disconnecting from the database', err)
    throw err
  }

  if (exitMessage) throw new ExitError(1, exitMessage)
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
  let expressServer: express.Express | null = null
  let hasAddedAdminUIMiddleware = false
  let nextApp
  let lastPrintedGraphQLSchema
  let lastApolloServer

  const initKeystonePromise = new Promise<void>(async (resolve, reject) => {
    const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
    const { system, context, prismaClientModule, apolloServer } = await initKeystone(
      cwd,
      configWithExtendHttp,
      null,
      null,
      null,
      null,
      prisma,
      ui,
      server,
      quiet
    )

    if (configWithExtendHttp?.server?.extendHttpServer && httpServer && context) {
      configWithExtendHttp.server.extendHttpServer(httpServer, context)
    }

    prismaClient = context?.prisma
    if (expressServer) {
      ;({ expressServer } = { expressServer })
    }

    if (!system.config.ui?.isDisabled && ui) {
      if (!expressServer || !context) throw new TypeError('Error trying to prepare the Admin UI')

      log('✨ Generating Admin UI code')
      const paths = system.getPaths(cwd)
      await fsp.rm(paths.admin, { recursive: true, force: true })
      await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

      log('✨ Preparing Admin UI')
      nextApp = next({ dev: true, dir: paths.admin })
      await nextApp.prepare()
      expressServer.use(createAdminUIMiddlewareWithNextApp(system.config, context, nextApp))
      log(`✅ Admin UI ready`)
    }

    hasAddedAdminUIMiddleware = true
    resolve()

    const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
    lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)
    lastApolloServer = apolloServer ?? null

    if (system.config.telemetry !== false) {
      runTelemetry(cwd, system.lists, system.config.db.provider)
    }

    for await (const buildResult of builds) {
      await handleBuildResult(
        buildResult,
        system,
        context,
        expressServer,
        apolloServer,
        prismaClientModule,
        nextApp,
        lastPrintedGraphQLSchema,
        lastApolloServer
      )
    }
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
        `⭐️ Server listening on ${httpOptions.host ?? ''}:${
          httpOptions.port
        } (http://${easyHost}:${httpOptions.port}/)`
      )
      log(`⭐️ GraphQL API available at ${config.graphql?.path ?? '/api/graphql'}`)

      // Don't start initialising Keystone until the dev server is ready,
      // otherwise it slows down the first response significantly
      initKeystonePromise.catch(async err => {
        await stop(server)
        reject(err)
      })
    })

    await initKeystonePromise
    return async () => await stop(server)
  } else {
    await initKeystonePromise
    return () => Promise.resolve()
  }
}