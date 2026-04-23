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
 * Generates the Admin UI code.
 * @param system The system configuration.
 * @param cwd The current working directory.
 * @param ui Whether to generate the Admin UI.
 */
async function generateAdminUICode(system: any, cwd: string, ui: boolean) {
  if (!system.config.ui?.isDisabled && ui) {
    const paths = system.getPaths(cwd)
    await fsp.rm(paths.admin, { recursive: true, force: true })
    await generateAdminUI(system.config, system.adminMeta, paths.admin, false)
  }
}

/**
 * Prepares the Admin UI.
 * @param system The system configuration.
 * @param context The context.
 * @param expressServer The Express server.
 * @param nextApp The Next.js app.
 */
async function prepareAdminUI(
  system: any,
  context: any,
  expressServer: express.Express | null,
  nextApp: any
) {
  if (nextApp) {
    expressServer.use(createAdminUIMiddlewareWithNextApp(system.config, context, nextApp))
  }
}

/**
 * Initializes Keystone.
 * @param cwd The current working directory.
 * @param configWithExtendHttp The configuration with extendHttpServer.
 * @param prisma Whether to generate the Prisma schema.
 * @param server Whether to create a server.
 * @param ui Whether to generate the Admin UI.
 * @param httpServer The HTTP server.
 * @param app The Express app.
 * @param expressServer The Express server.
 * @param hasAddedAdminUIMiddleware Whether the Admin UI middleware has been added.
 * @param initKeystonePromiseResolve The resolve function for the initKeystonePromise.
 */
async function initKeystone(
  cwd: string,
  configWithExtendHttp: KeystoneConfig,
  prisma: boolean,
  server: boolean,
  ui: boolean,
  httpServer: any,
  app: express.Application | null,
  expressServer: express.Express | null,
  hasAddedAdminUIMiddleware: boolean,
  initKeystonePromiseResolve: () => void
) {
  const { system, context, prismaClientModule, apolloServer, ...rest } = await (async function () {
    const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

    // Generate the Artifacts
    if (prisma) {
      const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
      await generateTypes(cwd, system)
      await generatePrismaClient(cwd, system)

      const paths = system.getPaths(cwd)
      if (configWithExtendHttp.server.dbPush) {
        const created = await createDatabase(
          system.config.db.url,
          path.dirname(paths.schema.prisma)
        )
        if (created) console.log(`✨ Database created`)

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
          console.log(`✨ Database unchanged`)
        } else {
          console.log(`✨ Database synchronized with Prisma schema`)
        }
      } else {
        console.log('⚠️ Skipping database schema push')
      }

      const prismaClientModule = require(system.getPaths(cwd).prisma)
      const keystone = system.getKeystone(prismaClientModule)

      console.log('✨ Connecting to the database')
      await keystone.connect()
      if (!server) {
        return {
          system,
          context: keystone.context,
          prismaClientModule,
        }
      }

      console.log('✨ Creating server')
      const { apolloServer, expressServer } = await createExpressServer(
        system.config,
        keystone.context
      )
      console.log(`✅ GraphQL API ready`)

      return {
        system,
        context: keystone.context,
        expressServer,
        apolloServer,
        prismaClientModule,
      }
    }
    return {
      system,
    }
  })()

  if (configWithExtendHttp?.server?.extendHttpServer && httpServer && context) {
    configWithExtendHttp.server.extendHttpServer(httpServer, context)
  }

  const prismaClient = context?.prisma
  if (rest.expressServer) {
    expressServer = rest.expressServer
  }

  let nextApp
  await generateAdminUICode(system, cwd, ui)
  if (!system.config.ui?.isDisabled && ui) {
    const paths = system.getPaths(cwd)
    nextApp = next({ dev: true, dir: paths.admin })
    await nextApp.prepare()
    await prepareAdminUI(system, context, expressServer, nextApp)
    console.log(`✅ Admin UI ready`)
  }

  hasAddedAdminUIMiddleware = true
  initKeystonePromiseResolve()

  const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
  let lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)
  let lastApolloServer = apolloServer ?? null

  if (system.config.telemetry !== false) {
    runTelemetry(cwd, system.lists, system.config.db.provider)
  }

  return {
    system,
    context,
    prismaClient,
    expressServer,
    apolloServer,
    lastPrintedGraphQLSchema,
    lastApolloServer,
  }
}

/**
 * Handles the build result.
 * @param buildResult The build result.
 * @param system The system configuration.
 * @param cwd The current working directory.
 * @param prisma Whether to generate the Prisma schema.
 * @param expressServer The Express server.
 * @param lastApolloServer The last Apollo server.
 * @param lastPrintedGraphQLSchema The last printed GraphQL schema.
 * @param prismaClientModule The Prisma client module.
 */
async function handleBuildResult(
  buildResult: BuildResult,
  system: any,
  cwd: string,
  prisma: boolean,
  expressServer: express.Express | null,
  lastApolloServer: any,
  lastPrintedGraphQLSchema: string,
  prismaClientModule: any
) {
  if (buildResult.errors.length) return

  console.log('compiled successfully')
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
      if (hasPrismaSchemaChanged(system.config.prisma, newPrismaSchema)) {
        throw new ExitError(1, '🔄 Your prisma schema has changed, please restart Keystone')
      }
      if (hasDatabaseConfigChanged(system, newSystem)) {
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
    await generateAdminUICode(newSystem, cwd, true)
    if (prismaClientModule) {
      if (expressServer && lastApolloServer) {
        const { context: newContext } = newSystem.getKeystone(prismaClientModule)
        const servers = await createExpressServer(newSystem.config, newContext)
        if (next) {
          servers.expressServer.use(
            createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, next)
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
 * @param httpServer The HTTP server.
 * @param exitMessage The exit message.
 */
async function stop(httpServer: any, exitMessage: string = '') {
  await esbuildContext.dispose()

  // stop httpServer
  if (httpServer) {
    await new Promise((resolve, reject) => {
      httpServer.close(async (err: any) => {
        if (err) {
          console.error('Error closing the server', err)
          return reject(err)
        }

        resolve(null)
      })
    })
  }

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
  let initKeystonePromiseResolve: () => void | undefined
  let initKeystonePromiseReject: (err: any) => void | undefined
  const initKeystonePromise = new Promise<void>((resolve, reject) => {
    initKeystonePromiseResolve = resolve
    initKeystonePromiseReject = reject
  })

  if (server) {
    const app = express()
    const httpServer = createServer(app)

    app.use('/__keystone/dev/status', (req, res) => {
      res.status(hasAddedAdminUIMiddleware ? 200 : 501).end()
    })

    app.use((req, res, next) => {
      if (expressServer && hasAddedAdminUIMiddleware) {
        return expressServer(req, res, next)
      }

      const { pathname } = new URL(req.url, 'http://ks')
      if (expressServer && pathname === (esbuildConfig.graphql?.path ?? '/api/graphql')) {
        return expressServer(req, res, next)
      }

      res.sendFile(devLoadingHTMLFilepath)
    })

    const httpOptions: ListenOptions = {
      port: 3000,
    }

    if (esbuildConfig.server && 'port' in esbuildConfig.server && typeof esbuildConfig.server?.port === 'number') {
      httpOptions.port = esbuildConfig.server.port
    }

    if (esbuildConfig.server && 'options' in esbuildConfig.server && esbuildConfig.server.options) {
      Object.assign(httpOptions, esbuildConfig.server.options)
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
      log(`⭐️ GraphQL API available at ${esbuildConfig.graphql?.path ?? '/api/graphql'}`)

      // Don't start initialising Keystone until the dev server is ready,
      // otherwise it slows down the first response significantly
      initKeystone(
        cwd,
        esbuildConfig,
        prisma,
        server,
        ui,
        httpServer,
        app,
        expressServer,
        hasAddedAdminUIMiddleware,
        initKeystonePromiseResolve
      ).catch(async err => {
        await stop(server)
        initKeystonePromiseReject(err)
      })
    })

    await initKeystonePromise
    return async () => await stop(server)
  } else {
    await initKeystone(
      cwd,
      esbuildConfig,
      prisma,
      server,
      ui,
      null,
      null,
      expressServer,
      hasAddedAdminUIMiddleware,
      initKeystonePromiseResolve
    )
    return () => Promise.resolve()
  }
}