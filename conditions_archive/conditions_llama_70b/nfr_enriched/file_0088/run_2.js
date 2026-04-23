```typescript
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

const devLoadingHTMLFilepath = path.join(pkgDir, 'static', 'dev-loading.html')

/**
 * Strip extendHttpServer from the Keystone configuration.
 * @param config Keystone configuration
 * @returns Keystone configuration with extendHttpServer stripped
 */
function stripExtendHttpServer(config: KeystoneConfig): KeystoneConfig {
  const { server, ...rest } = config
  const { extendHttpServer, ...restServer } = server
  return {
    ...rest,
    server: {
      ...restServer,
      extendHttpServer: () => {},
    },
  }
}

/**
 * Create a resolvable promise.
 * @returns A promise that can be resolved manually
 */
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
 * @param cwd Current working directory
 * @param config Keystone configuration
 * @param prisma Prisma configuration
 * @param quiet Whether to suppress logging
 * @param server Server configuration
 * @param ui UI configuration
 * @returns A promise that resolves when the system is initialized
 */
async function initKeystoneSystem(
  cwd: string,
  config: KeystoneConfig,
  prisma: any,
  quiet: boolean,
  server: any,
  ui: any
) {
  const system = createSystem(stripExtendHttpServer(config))
  const paths = system.getPaths(cwd)

  // Generate the Artifacts
  if (prisma) {
    const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
    await generateTypes(cwd, system)
    await generatePrismaClient(cwd, system)

    const created = await createDatabase(
      system.config.db.url,
      path.dirname(paths.schema.prisma)
    )
    if (created) {
      if (!quiet) console.log(`✨ Database created`)
    }

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
      if (!quiet) console.log(`✨ Database unchanged`)
    } else {
      if (!quiet) console.log(`✨ Database synchronized with Prisma schema`)
    }
  }

  return system
}

/**
 * Create the Express server.
 * @param system Keystone system
 * @param context Keystone context
 * @returns A promise that resolves with the Express server
 */
async function createExpressServerInstance(
  system: any,
  context: any
) {
  const { apolloServer, expressServer } = await createExpressServer(
    system.config,
    context
  )
  return { apolloServer, expressServer }
}

/**
 * Initialize the Admin UI.
 * @param system Keystone system
 * @param context Keystone context
 * @param ui UI configuration
 * @param nextApp Next.js app
 * @returns A promise that resolves when the Admin UI is initialized
 */
async function initAdminUI(
  system: any,
  context: any,
  ui: any,
  nextApp: any
) {
  const paths = system.getPaths('')
  await fsp.rm(paths.admin, { recursive: true, force: true })
  await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

  nextApp = next({ dev: true, dir: paths.admin })
  await nextApp.prepare()
  return nextApp
}

/**
 * Start the Keystone development server.
 * @param cwd Current working directory
 * @param flags Command-line flags
 * @returns A promise that resolves with a function to stop the server
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
  const log = (message: string) => {
    if (quiet) return
    console.log(message)
  }

  log('✨ Starting Keystone')
  const lastPromise = resolvablePromise<IteratorResult<BuildResult>>()

  const builds: AsyncIterable<BuildResult> = {
    [Symbol.asyncIterator]: () => ({ next: () => lastPromise }),
  }

  const addBuildResult = (build: BuildResult) => {
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
  const stop = async (aHttpServer: any, exitMessage: string = '') => {
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

  const initKeystone = async () => {
    const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
    const system = await initKeystoneSystem(cwd, configWithExtendHttp, prisma, quiet, server, ui)

    if (configWithExtendHttp?.server?.extendHttpServer && httpServer) {
      configWithExtendHttp.server.extendHttpServer(httpServer, system.context)
    }

    prismaClient = system.context?.prisma
    if (server) {
      const { apolloServer, expressServer: newExpressServer } = await createExpressServerInstance(
        system,
        system.context
      )
      expressServer = newExpressServer
    }

    let nextApp
    if (!system.config.ui?.isDisabled && ui) {
      nextApp = await initAdminUI(system, system.context, ui, nextApp)
      if (expressServer) {
        expressServer.use(createAdminUIMiddlewareWithNextApp(system.config, system.context, nextApp))
      }
    }

    hasAddedAdminUIMiddleware = true

    const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
    let lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)
    let lastApolloServer = null

    if (system.config.telemetry !== false) {
      runTelemetry(cwd, system.lists, system.config.db.provider)
    }

    for await (const buildResult of builds) {
      if (buildResult.errors.length) continue

      log('compiled successfully')
      try {
        const paths = system.getPaths(cwd)

        const newConfigWithHttp = await importBuiltKeystoneConfiguration(cwd)
        const newSystem = await initKeystoneSystem(cwd, newConfigWithHttp, prisma, quiet, server, ui)

        if (prisma) {
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
        if (prismaClient) {
          if (server && lastApolloServer) {
            const { context: newContext } = newSystem.getKeystone(prismaClient)
            const servers = await createExpressServerInstance(newSystem, newContext)
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
        throw err
      })
    })

    return async () => await stop(server)
  } else {
    await initKeystone()
    return () => Promise.resolve()
  }
}
```