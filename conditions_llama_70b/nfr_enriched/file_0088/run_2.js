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
 * Initialize the Keystone system.
 * @param cwd The current working directory.
 * @param config The Keystone configuration.
 * @param prismaClientModule The Prisma client module.
 * @returns The initialized Keystone system.
 */
async function initKeystoneSystem(
  cwd: string,
  config: KeystoneConfig,
  prismaClientModule: any
) {
  const system = createSystem(stripExtendHttpServer(config))
  const paths = system.getPaths(cwd)
  const keystone = system.getKeystone(prismaClientModule)

  await keystone.connect()
  return { system, keystone }
}

/**
 * Create the Express server.
 * @param config The Keystone configuration.
 * @param context The Keystone context.
 * @returns The created Express server.
 */
async function createExpressServerInstance(
  config: KeystoneConfig,
  context: any
) {
  const { apolloServer, expressServer } = await createExpressServer(
    config,
    context
  )
  return { apolloServer, expressServer }
}

/**
 * Generate the Admin UI code.
 * @param config The Keystone configuration.
 * @param adminMeta The Admin UI metadata.
 * @param adminPath The Admin UI path.
 * @param isUpdate Whether to update the Admin UI code.
 */
async function generateAdminUICode(
  config: KeystoneConfig,
  adminMeta: any,
  adminPath: string,
  isUpdate: boolean
) {
  await fsp.rm(adminPath, { recursive: true, force: true })
  await generateAdminUI(config, adminMeta, adminPath, isUpdate)
}

/**
 * Prepare the Admin UI.
 * @param config The Keystone configuration.
 * @param context The Keystone context.
 * @param nextApp The Next.js app.
 * @param expressServer The Express server.
 */
async function prepareAdminUI(
  config: KeystoneConfig,
  context: any,
  nextApp: any,
  expressServer: express.Express
) {
  expressServer.use(createAdminUIMiddlewareWithNextApp(config, context, nextApp))
}

/**
 * Handle the database schema push.
 * @param cwd The current working directory.
 * @param system The Keystone system.
 * @param prismaClientModule The Prisma client module.
 * @param dbPush Whether to push the database schema.
 */
async function handleDatabaseSchemaPush(
  cwd: string,
  system: any,
  prismaClientModule: any,
  dbPush: boolean
) {
  const paths = system.getPaths(cwd)
  if (dbPush) {
    const created = await createDatabase(
      system.config.db.url,
      path.dirname(paths.schema.prisma)
    )
    if (created) console.log(`✨ Database created`)

    const migration = await withMigrate(paths.schema.prisma, system, async m => {
      const generatedPrismaSchema = printPrismaSchema(system.config, system.lists)
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
}

/**
 * Initialize the Keystone system and create the Express server.
 * @param cwd The current working directory.
 * @param config The Keystone configuration.
 * @param prismaClientModule The Prisma client module.
 * @param dbPush Whether to push the database schema.
 * @returns The initialized Keystone system and the created Express server.
 */
async function initKeystone(
  cwd: string,
  config: KeystoneConfig,
  prismaClientModule: any,
  dbPush: boolean
) {
  const { system, keystone } = await initKeystoneSystem(cwd, config, prismaClientModule)
  await handleDatabaseSchemaPush(cwd, system, prismaClientModule, dbPush)
  const { apolloServer, expressServer } = await createExpressServerInstance(
    config,
    keystone.context
  )
  return { system, keystone, apolloServer, expressServer }
}

/**
 * Start the Keystone development server.
 * @param cwd The current working directory.
 * @param flags The command-line flags.
 * @returns A function to stop the server.
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

  async function initKeystone() {
    const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
    const { system, keystone, apolloServer, expressServer: newExpressServer } =
      await initKeystone(cwd, configWithExtendHttp, prismaClientModule, dbPush)

    if (configWithExtendHttp?.server?.extendHttpServer && httpServer && keystone.context) {
      configWithExtendHttp.server.extendHttpServer(httpServer, keystone.context)
    }

    prismaClient = keystone.context?.prisma
    if (newExpressServer) {
      expressServer = newExpressServer
    }

    let nextApp
    if (!system.config.ui?.isDisabled && ui) {
      if (!expressServer || !keystone.context) throw new TypeError('Error trying to prepare the Admin UI')

      log('✨ Generating Admin UI code')
      const paths = system.getPaths(cwd)
      await generateAdminUICode(system.config, system.adminMeta, paths.admin, false)

      log('✨ Preparing Admin UI')
      nextApp = next({ dev: true, dir: paths.admin })
      await nextApp.prepare()
      await prepareAdminUI(system.config, keystone.context, nextApp, expressServer)
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
      if (buildResult.errors.length) continue

      log('compiled successfully')
      try {
        const paths = system.getPaths(cwd)

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
        await generateAdminUICode(newSystem.config, newSystem.adminMeta, paths.admin, true)
        if (prismaClientModule) {
          if (server && lastApolloServer) {
            const { context: newContext } = newSystem.getKeystone(prismaClientModule)
            const servers = await createExpressServerInstance(newSystem.config, newContext)
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
}