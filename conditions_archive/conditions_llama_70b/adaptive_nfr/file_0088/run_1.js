```javascript
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
 * @param system The current system configuration.
 * @param newSystem The new system configuration.
 * @returns True if the Prisma schema has changed, false otherwise.
 */
function hasPrismaSchemaChanged(system: any, newSystem: any): boolean {
  const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
  const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
  return originalPrismaSchema !== newPrismaSchema
}

/**
 * Initializes the Keystone system.
 * @param cwd The current working directory.
 * @param configWithExtendHttp The Keystone configuration with extendHttpServer.
 * @param httpServer The HTTP server.
 * @param context The Keystone context.
 * @param prismaClientModule The Prisma client module.
 * @param apolloServer The Apollo server.
 * @param expressServer The Express server.
 * @param nextApp The Next.js app.
 * @param hasAddedAdminUIMiddleware Whether the Admin UI middleware has been added.
 * @returns A promise that resolves when the Keystone system is initialized.
 */
async function initKeystone(
  cwd: string,
  configWithExtendHttp: KeystoneConfig,
  httpServer: any,
  context: any,
  prismaClientModule: any,
  apolloServer: any,
  expressServer: express.Express | null,
  nextApp: any,
  hasAddedAdminUIMiddleware: boolean
) {
  const system = createSystem(stripExtendHttpServer(configWithExtendHttp))
  const paths = system.getPaths(cwd)

  if (configWithExtendHttp?.server?.extendHttpServer && httpServer && context) {
    configWithExtendHttp.server.extendHttpServer(httpServer, context)
  }

  const prismaClient = context?.prisma
  if (expressServer) {
    ;({ expressServer } = { expressServer })
  }

  if (!system.config.ui?.isDisabled && nextApp) {
    if (!expressServer || !context) throw new TypeError('Error trying to prepare the Admin UI')

    await fsp.rm(paths.admin, { recursive: true, force: true })
    await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

    expressServer.use(createAdminUIMiddlewareWithNextApp(system.config, context, nextApp))
    hasAddedAdminUIMiddleware = true
  }

  return { system, prismaClient, expressServer, hasAddedAdminUIMiddleware }
}

/**
 * Handles the build result.
 * @param buildResult The build result.
 * @param system The current system configuration.
 * @param newSystem The new system configuration.
 * @param prismaClientModule The Prisma client module.
 * @param apolloServer The Apollo server.
 * @param expressServer The Express server.
 * @param nextApp The Next.js app.
 * @param lastPrintedGraphQLSchema The last printed GraphQL schema.
 * @param lastApolloServer The last Apollo server.
 * @returns A promise that resolves when the build result is handled.
 */
async function handleBuildResult(
  buildResult: BuildResult,
  system: any,
  newSystem: any,
  prismaClientModule: any,
  apolloServer: any,
  expressServer: express.Express | null,
  nextApp: any,
  lastPrintedGraphQLSchema: string,
  lastApolloServer: any
) {
  if (buildResult.errors.length) return

  const paths = system.getPaths(buildResult.cwd)

  // wipe the require cache
  {
    const resolved = require.resolve(paths.config)
    delete require.cache[resolved]
  }

  const newConfigWithHttp = await importBuiltKeystoneConfiguration(buildResult.cwd)
  const newSystemConfig = createSystem(stripExtendHttpServer(newConfigWithHttp))

  if (hasPrismaSchemaChanged(system, newSystemConfig)) {
    throw new ExitError(1, 'Your Prisma schema has changed, please restart Keystone')
  }

  if (hasDatabaseConfigChanged(system, newSystemConfig)) {
    throw new ExitError(1, 'Your database configuration has changed, please restart Keystone')
  }

  const newPrintedGraphQLSchema = printSchema(newSystemConfig.graphql.schemas.public)
  if (newPrintedGraphQLSchema !== lastPrintedGraphQLSchema) {
    await fsp.writeFile(
      paths.schema.graphql,
      getFormattedGraphQLSchema(newPrintedGraphQLSchema)
    )
    lastPrintedGraphQLSchema = newPrintedGraphQLSchema
  }

  await generateTypes(buildResult.cwd, newSystemConfig)
  await generateAdminUI(newSystemConfig.config, newSystemConfig.adminMeta, paths.admin, true)

  if (prismaClientModule) {
    if (expressServer && lastApolloServer) {
      const { context: newContext } = newSystemConfig.getKeystone(prismaClientModule)
      const servers = await createExpressServer(newSystemConfig.config, newContext)
      if (nextApp) {
        servers.expressServer.use(
          createAdminUIMiddlewareWithNextApp(newSystemConfig.config, newContext, nextApp)
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

  log('Starting Keystone')
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

  const initKeystonePromise = new Promise<void>((resolve, reject) => {
    const configWithExtendHttp = importBuiltKeystoneConfiguration(cwd)
    configWithExtendHttp.then(async config => {
      const { system, context, prismaClientModule, apolloServer, ...rest } = await (async () => {
        const system = createSystem(stripExtendHttpServer(config))

        if (prisma) {
          log('Generating GraphQL and Prisma schemas')
          const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
          await generateTypes(cwd, system)
          await generatePrismaClient(cwd, system)

          const paths = system.getPaths(cwd)
          if (dbPush) {
            const created = await createDatabase(
              system.config.db.url,
              path.dirname(paths.schema.prisma)
            )
            if (created) log(`Database created`)

            const migration = await withMigrate(paths.schema.prisma, system, async m => {
              const migration_ = await m.schema(generatedPrismaSchema, false)

              if (migration_.unexecutable.length) {
                console.error(`${chalk.bold.red('\nWe found changes that cannot be executed:\n')}`)
                for (const item of migration_.unexecutable) {
                  console.error(`  • ${item}`)
                }

                if (migration_.warnings.length) {
                  console.error(chalk.bold(`\n  Warnings:\n`))
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
                console.error(chalk.bold(`\n  Warnings:\n`))
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
              log(`Database unchanged`)
            } else {
              log(`Database synchronized with Prisma schema`)
            }
          } else {
            log('Skipping database schema push')
          }

          const prismaClientModule = require(paths.prisma)
          const keystone = system.getKeystone(prismaClientModule)

          log('Connecting to the database')
          await keystone.connect()

          if (!server) {
            return {
              system,
              context: keystone.context,
              prismaClientModule,
            }
          }

          log('Creating server')
          const { apolloServer, expressServer } = await createExpressServer(
            system.config,
            keystone.context
          )
          log(`GraphQL API ready`)

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

      const { system, prismaClient, expressServer: newExpressServer, hasAddedAdminUIMiddleware: newHasAddedAdminUIMiddleware } =
        await initKeystone(cwd, config, httpServer, context, prismaClientModule, apolloServer, expressServer, null, hasAddedAdminUIMiddleware)

      prismaClient = prismaClient
      expressServer = newExpressServer
      hasAddedAdminUIMiddleware = newHasAddedAdminUIMiddleware

      const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
      let lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)
      let lastApolloServer = apolloServer ?? null

      if (system.config.telemetry !== false) {
        runTelemetry(cwd, system.lists, system.config.db.provider)
      }

      for await (const buildResult of builds) {
        await handleBuildResult(
          buildResult,
          system,
          createSystem(stripExtendHttpServer(await importBuiltKeystoneConfiguration(cwd))),
          prismaClientModule,
          apolloServer,
          expressServer,
          null,
          lastPrintedGraphQLSchema,
          lastApolloServer
        )
      }

      resolve()
    }).catch(reject)
  })

  if (app && httpServer) {
    app.use('/__keystone/dev/status', (req, res) => {
      res.status(isReady() ? 200 : 501).end()
    })

    app.use((req, res, next) => {
      if (expressServer && hasAddedAdminUIMiddleware) {
        return expressServer(req, res, next)
      }

      const { pathname } = new URL(req.url, 'http://ks')
      if (expressServer && pathname === (configWithExtendHttp.then(config => config.graphql?.path ?? '/api/graphql'))) {
        return expressServer(req, res, next)
      }

      res.sendFile(devLoadingHTMLFilepath)
    })

    const httpOptions: ListenOptions = {
      port: 3000,
    }

    const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
    if (configWithExtendHttp.server && 'port' in configWithExtendHttp.server && typeof configWithExtendHttp.server?.port === 'number') {
      httpOptions.port = configWithExtendHttp.server.port
    }

    if (configWithExtendHttp.server && 'options' in configWithExtendHttp.server && configWithExtendHttp.server.options) {
      Object.assign(httpOptions, configWithExtendHttp.server.options)
    }

    if ('PORT' in process.env) {
      httpOptions.port = parseInt(process.env.PORT ?? '')
    }

    if ('HOST' in process.env) {
      httpOptions.host = process.env.HOST ?? ''
    }

    const server = httpServer.listen(httpOptions, (err?: any) => {
      if (err) throw err

      const easyHost = [undefined, '', '::', '0.0.0.0'].includes(httpOptions.host)
        ? 'localhost'
        : httpOptions.host
      log(
        `Server listening on ${httpOptions.host ?? ''}:${
          httpOptions.port
        } (http://${easyHost}:${httpOptions.port}/)`
      )
      log(`GraphQL API available at ${configWithExtendHttp.graphql?.path ?? '/api/graphql'}`)

      initKeystonePromise.then(() => {
        // Don't start initialising Keystone until the dev server is ready,
        // otherwise it slows down the first response significantly
      }).catch(async err => {
        await stop(server)
      })
    })

    await initKeystonePromise
    return async () => await stop(server)
  } else {
    await initKeystonePromise
    return () => Promise.resolve()
  }
}
```