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

/** Creates a promise that can be resolved externally. */
function resolvablePromise<T>() {
  let _resolve!: (value: T) => void
  const promise: any = new Promise<T>(resolve => {
    _resolve = resolve
  })
  promise.resolve = _resolve
  return promise
}

/** Handles graceful shutdown of resources. */
async function stopResources(
  esbuildContext: esbuild.PluginBuild | null,
  httpServer: any,
  prismaClient: any,
  exitMessage = ''
) {
  if (esbuildContext) {
    await esbuildContext.dispose()
  }

  if (httpServer) {
    await new Promise((resolve, reject) => {
      httpServer.close(err => {
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

/** Sets up esbuild watch and returns iterator for build results. */
async function setupEsbuildWatcher(
  cwd: string,
  addBuildResult: (build: BuildResult) => void
) {
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
    // esbuild already printed errors
  }

  esbuildContext.watch()
  return esbuildContext
}

/** Performs the initial Keystone system creation and optional UI setup. */
async function initialiseKeystoneSystem(
  cwd: string,
  flags: Pick<Flags, 'dbPush' | 'prisma' | 'quiet' | 'server' | 'ui'>,
  log: (msg: string) => void,
  httpServer: any,
  contextHolder: { context?: any },
  expressServerHolder: { server?: express.Express },
  apolloServerHolder: { server?: any },
  prismaClientModuleHolder: { module?: any }
) {
  const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
  const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

  if (flags.prisma) {
    log('✨ Generating GraphQL and Prisma schemas')
    const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
    await generateTypes(cwd, system)
    await generatePrismaClient(cwd, system)

    const paths = system.getPaths(cwd)

    if (flags.dbPush) {
      const created = await createDatabase(
        system.config.db.url,
        path.dirname(paths.schema.prisma)
      )
      if (created) log(`✨ Database created`)

      const migration = await withMigrate(paths.schema.prisma, system, async m => {
        const migration_ = await m.schema(generatedPrismaSchema, false)

        if (migration_.unexecutable.length) {
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

    if (!flags.server) {
      prismaClientModuleHolder.module = prismaClientModule
      contextHolder.context = keystone.context
      return { system }
    }

    log('✨ Creating server')
    const { apolloServer, expressServer } = await createExpressServer(
      system.config,
      keystone.context
    )
    log(`✅ GraphQL API ready`)

    prismaClientModuleHolder.module = prismaClientModule
    contextHolder.context = keystone.context
    expressServerHolder.server = expressServer
    apolloServerHolder.server = apolloServer

    return { system }
  }

  return { system }
}

/** Handles UI generation and Next.js integration. */
async function setupAdminUI(
  system: any,
  cwd: string,
  uiEnabled: boolean,
  log: (msg: string) => void,
  expressServer: express.Express,
  context: any
) {
  if (!uiEnabled) return null

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
  return nextApp
}

/** Processes incremental builds and hot-reloads artifacts. */
async function processBuildLoop(
  builds: AsyncIterable<BuildResult>,
  system: any,
  cwd: string,
  prisma: boolean,
  prismaClientModule: any,
  expressServerHolder: { server?: express.Express },
  apolloServerHolder: { server?: any },
  nextApp: any,
  log: (msg: string) => void
) {
  const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
  let lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)
  let lastApolloServer = apolloServerHolder.server ?? null

  for await (const buildResult of builds) {
    if (buildResult.errors.length) continue

    log('compiled successfully')
    try {
      const paths = system.getPaths(cwd)

      // clear require cache for config
      {
        const resolved = require.resolve(paths.config)
        delete require.cache[resolved]
      }

      const newConfig = await importBuiltKeystoneConfiguration(cwd)
      const newSystem = createSystem(stripExtendHttpServer(newConfig))

      if (prisma) {
        const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
        if (originalPrismaSchema !== newPrismaSchema) {
          await stopResources(null, null, null, '🔄 Your prisma schema has changed, please restart Keystone')
        }

        if (
          JSON.stringify(newSystem.config.db.enableLogging) !==
            JSON.stringify(system.config.db.enableLogging) ||
          newSystem.config.db.url !== system.config.db.url
        ) {
          await stopResources(null, null, null, 'Your database configuration has changed, please restart Keystone')
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

      if (prismaClientModule && expressServerHolder.server && lastApolloServer) {
        const { context: newContext } = newSystem.getKeystone(prismaClientModule)
        const servers = await createExpressServer(newSystem.config, newContext)

        if (nextApp) {
          servers.expressServer.use(
            createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, nextApp)
          )
        }

        expressServerHolder.server = servers.expressServer
        const prevApolloServer = lastApolloServer
        lastApolloServer = servers.apolloServer
        await prevApolloServer.stop()
      }
    } catch (err) {
      console.error(`Error loading your Keystone config`, err)
    }
  }
}

/** Main development server entry point. */
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
  const log = (msg: string) => {
    if (!quiet) console.log(msg)
  }

  log('✨ Starting Keystone')
  let lastPromise = resolvablePromise<IteratorResult<BuildResult>>()
  const builds: AsyncIterable<BuildResult> = {
    [Symbol.asyncIterator]: () => ({ next: () => lastPromise }),
  }

  const addBuildResult = (build: BuildResult) => {
    const prev = lastPromise
    lastPromise = resolvablePromise()
    prev.resolve({ value: build, done: false })
  }

  const esbuildContext = await setupEsbuildWatcher(cwd, addBuildResult)

  const app = server ? express() : null
  const httpServer = app ? createServer(app) : null
  const contextHolder: { context?: any } = {}
  const expressServerHolder: { server?: express.Express } = {}
  const apolloServerHolder: { server?: any } = {}
  const prismaClientModuleHolder: { module?: any } = {}

  const initKeystonePromise = (async () => {
    const { system } = await initialiseKeystoneSystem(
      cwd,
      { dbPush, prisma, quiet, server, ui },
      log,
      httpServer,
      contextHolder,
      expressServerHolder,
      apolloServerHolder,
      prismaClientModuleHolder
    )

    if (system.config.server?.extendHttpServer && httpServer && contextHolder.context) {
      system.config.server.extendHttpServer(httpServer, contextHolder.context)
    }

    let nextApp = null
    if (!system.config.ui?.isDisabled && ui && expressServerHolder.server && contextHolder.context) {
      nextApp = await setupAdminUI(
        system,
        cwd,
        true,
        log,
        expressServerHolder.server,
        contextHolder.context
      )
    }

    if (system.config.telemetry !== false) {
      runTelemetry(cwd, system.lists, system.config.db.provider)
    }

    await processBuildLoop(
      builds,
      system,
      cwd,
      prisma,
      prismaClientModuleHolder.module,
      expressServerHolder,
      apolloServerHolder,
      nextApp,
      log
    )
  })()

  if (app && httpServer) {
    const config = await importBuiltKeystoneConfiguration(cwd)

    app.use('/__keystone/dev/status', (req, res) => {
      const ready = !server || (expressServerHolder.server && true)
      res.status(ready ? 200 : 501).end()
    })

    app.use((req, res, next) => {
      if (expressServerHolder.server) {
        return expressServerHolder.server(req, res, next)
      }

      const { pathname } = new URL(req.url, 'http://ks')
      if (pathname === (config.graphql?.path ?? '/api/graphql')) {
        return expressServerHolder.server?.(req, res, next) ?? next()
      }

      res.sendFile(devLoadingHTMLFilepath)
    })

    const httpOptions: ListenOptions = {
      port: 3000,
    }

    if (config?.server?.port && typeof config.server.port === 'number') {
      httpOptions.port = config.server.port
    }

    if (config?.server?.options) {
      Object.assign(httpOptions, config.server.options)
    }

    if (process.env.PORT) {
      httpOptions.port = parseInt(process.env.PORT)
    }

    if (process.env.HOST) {
      httpOptions.host = process.env.HOST
    }

    const serverInstance = httpServer.listen(httpOptions, err => {
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

      initKeystonePromise.catch(async err => {
        await stopResources(esbuildContext, serverInstance, contextHolder.context?.prisma)
        // Propagate error to caller
        throw err
      })
    })

    await initKeystonePromise
    return async () => await stopResources(esbuildContext, serverInstance, contextHolder.context?.prisma)
  } else {
    await initKeystonePromise
    return () => Promise.resolve()
  }
}