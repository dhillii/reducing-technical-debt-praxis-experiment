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
 * Handles the database schema push.
 * @param system The system configuration.
 * @param dbPush Whether to push the database schema.
 * @param prisma Whether Prisma is enabled.
 * @param cwd The current working directory.
 * @returns A promise that resolves when the database schema push is complete.
 */
async function handleDatabaseSchemaPush(
  system: any,
  dbPush: boolean,
  prisma: boolean,
  cwd: string
): Promise<void> {
  if (!prisma) return

  const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
  await generateTypes(cwd, system)
  await generatePrismaClient(cwd, system)

  const paths = system.getPaths(cwd)
  if (dbPush) {
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
}

/**
 * Initializes the Keystone system.
 * @param cwd The current working directory.
 * @param configWithExtendHttp The Keystone configuration with extendHttpServer.
 * @param prisma Whether Prisma is enabled.
 * @param server Whether the server is enabled.
 * @param ui Whether the UI is enabled.
 * @returns A promise that resolves when the Keystone system is initialized.
 */
async function initKeystone(
  cwd: string,
  configWithExtendHttp: KeystoneConfig,
  prisma: boolean,
  server: boolean,
  ui: boolean
): Promise<void> {
  const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

  await handleDatabaseSchemaPush(system, false, prisma, cwd)

  if (server) {
    const { apolloServer, expressServer } = await createExpressServer(
      system.config,
      system.getKeystone().context
    )
    console.log(`✅ GraphQL API ready`)

    if (ui) {
      const paths = system.getPaths(cwd)
      await fsp.rm(paths.admin, { recursive: true, force: true })
      await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

      const nextApp = next({ dev: true, dir: paths.admin })
      await nextApp.prepare()
      expressServer.use(createAdminUIMiddlewareWithNextApp(system.config, system.getKeystone().context, nextApp))
      console.log(`✅ Admin UI ready`)
    }
  }
}

/**
 * Handles the build result.
 * @param system The system configuration.
 * @param buildResult The build result.
 * @param cwd The current working directory.
 * @param prismaClientModule The Prisma client module.
 * @param expressServer The Express server.
 * @param lastApolloServer The last Apollo server.
 * @param lastPrintedGraphQLSchema The last printed GraphQL schema.
 * @returns A promise that resolves when the build result is handled.
 */
async function handleBuildResult(
  system: any,
  buildResult: BuildResult,
  cwd: string,
  prismaClientModule: any,
  expressServer: express.Express | null,
  lastApolloServer: any | null,
  lastPrintedGraphQLSchema: string
): Promise<void> {
  if (buildResult.errors.length) return

  console.log('compiled successfully')

  const newConfigWithHttp = await importBuiltKeystoneConfiguration(cwd)
  const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

  if (prisma) {
    if (!system.config.prisma) throw new TypeError('Missing Prisma schema source')

    const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
    if (hasPrismaSchemaChanged(printPrismaSchema(system.config, system.lists), newPrismaSchema)) {
      throw new ExitError(1, '🔄 Your prisma schema has changed, please restart Keystone')
    }

    if (hasDatabaseConfigChanged(system, newSystem)) {
      throw new ExitError(1, 'Your database configuration has changed, please restart Keystone')
    }
  }

  const newPrintedGraphQLSchema = printSchema(newSystem.graphql.schemas.public)
  if (newPrintedGraphQLSchema !== lastPrintedGraphQLSchema) {
    const paths = newSystem.getPaths(cwd)
    await fsp.writeFile(
      paths.schema.graphql,
      getFormattedGraphQLSchema(newPrintedGraphQLSchema)
    )
  }

  await generateTypes(cwd, newSystem)
  await generateAdminUI(newSystem.config, newSystem.adminMeta, newSystem.getPaths(cwd).admin, true)

  if (prismaClientModule) {
    if (expressServer && lastApolloServer) {
      const { context: newContext } = newSystem.getKeystone(prismaClientModule)
      const servers = await createExpressServer(newSystem.config, newContext)
      if (newSystem.config.ui?.isDisabled) {
        expressServer = servers.expressServer
      } else {
        const nextApp = next({ dev: true, dir: newSystem.getPaths(cwd).admin })
        await nextApp.prepare()
        expressServer.use(createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, nextApp))
      }
      const prevApolloServer = lastApolloServer
      lastApolloServer = servers.apolloServer
      await prevApolloServer.stop()
    }
  }
}

/**
 * Stops the server and Prisma client.
 * @param httpServer The HTTP server.
 * @param prismaClient The Prisma client.
 * @param exitMessage The exit message.
 * @returns A promise that resolves when the server and Prisma client are stopped.
 */
async function stop(
  httpServer: any,
  prismaClient: any,
  exitMessage: string = ''
): Promise<void> {
  await esbuildContext.dispose()

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
  let lastApolloServer: any | null = null
  let lastPrintedGraphQLSchema: string = ''

  const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
  const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

  await handleDatabaseSchemaPush(system, dbPush, prisma, cwd)

  if (server) {
    const { apolloServer, expressServer: expressServerResult } = await createExpressServer(
      system.config,
      system.getKeystone().context
    )
    expressServer = expressServerResult
    lastApolloServer = apolloServer
    console.log(`✅ GraphQL API ready`)

    if (ui) {
      const paths = system.getPaths(cwd)
      await fsp.rm(paths.admin, { recursive: true, force: true })
      await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

      const nextApp = next({ dev: true, dir: paths.admin })
      await nextApp.prepare()
      expressServer.use(createAdminUIMiddlewareWithNextApp(system.config, system.getKeystone().context, nextApp))
      console.log(`✅ Admin UI ready`)
    }
  }

  if (system.config.telemetry !== false) {
    runTelemetry(cwd, system.lists, system.config.db.provider)
  }

  for await (const buildResult of builds) {
    await handleBuildResult(
      system,
      buildResult,
      cwd,
      require(system.getPaths(cwd).prisma),
      expressServer,
      lastApolloServer,
      lastPrintedGraphQLSchema
    )
  }

  const app = server ? express() : null
  const httpServer = app ? createServer(app) : null

  if (app && httpServer) {
    app.use('/__keystone/dev/status', (req, res) => {
      res.status(expressServer !== null ? 200 : 501).end()
    })

    app.use((req, res, next) => {
      if (expressServer) {
        return expressServer(req, res, next)
      }

      const { pathname } = new URL(req.url, 'http://ks')
      if (expressServer && pathname === (configWithExtendHttp.graphql?.path ?? '/api/graphql')) {
        return expressServer(req, res, next)
      }

      res.sendFile(devLoadingHTMLFilepath)
    })

    const httpOptions: ListenOptions = {
      port: 3000,
    }

    if (configWithExtendHttp?.server && 'port' in configWithExtendHttp.server && typeof configWithExtendHttp.server?.port === 'number') {
      httpOptions.port = configWithExtendHttp.server.port
    }

    if (configWithExtendHttp?.server && 'options' in configWithExtendHttp.server && configWithExtendHttp.server.options) {
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
        `⭐️ Server listening on ${httpOptions.host ?? ''}:${
          httpOptions.port
        } (http://${easyHost}:${httpOptions.port}/)`
      )
      log(`⭐️ GraphQL API available at ${configWithExtendHttp.graphql?.path ?? '/api/graphql'}`)
    })

    return async () => await stop(server, prismaClient)
  } else {
    return () => Promise.resolve()
  }
}