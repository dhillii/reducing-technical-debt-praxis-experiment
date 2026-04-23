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
 * @private
 */
async function initKeystone(
  cwd: string,
  flags: Pick<Flags, 'dbPush' | 'prisma' | 'quiet' | 'server' | 'ui'>,
  state: {
    prismaClient: any
    expressServer: express.Express | null
    hasAddedAdminUIMiddleware: boolean
    lastPrintedGraphQLSchema: string | null
    lastApolloServer: any
    initKeystonePromiseResolve: () => void | undefined
    initKeystonePromiseReject: (err: any) => void | undefined
  },
  log: (msg: string) => void,
  app: express.Express | null,
  httpServer: any,
  server: boolean,
  ui: boolean,
  prisma: boolean,
  dbPush: boolean,
  quiet: boolean
) {
  const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
  const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

  // Generate Artifacts
  if (prisma) {
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
    if (!server) {
      state.prismaClient = keystone.context.prisma
      return
    }

    log('✨ Creating server')
    const { apolloServer, expressServer } = await createExpressServer(
      system.config,
      keystone.context
    )
    log(`✅ GraphQL API ready`)

    state.expressServer = expressServer
    state.lastApolloServer = apolloServer
    state.prismaClient = keystone.context.prisma
  }

  if (configWithExtendHttp?.server?.extendHttpServer && httpServer && state.expressServer) {
    configWithExtendHttp.server.extendHttpServer(httpServer, state.expressServer)
  }

  if (!system.config.ui?.isDisabled && ui) {
    if (!state.expressServer) throw new TypeError('Error trying to prepare the Admin UI')

    log('✨ Generating Admin UI code')
    const paths = system.getPaths(cwd)
    await fsp.rm(paths.admin, { recursive: true, force: true })
    await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

    log('✨ Preparing Admin UI')
    const nextApp = next({ dev: true, dir: paths.admin })
    await nextApp.prepare()
    state.expressServer.use(
      createAdminUIMiddlewareWithNextApp(system.config, state.expressServer, nextApp)
    )
    log(`✅ Admin UI ready`)
  }

  state.hasAddedAdminUIMiddleware = true
  state.initKeystonePromiseResolve?.()

  const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
  state.lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)

  if (system.config.telemetry !== false) {
    runTelemetry(cwd, system.lists, system.config.db.provider)
  }

  for await (const buildResult of state.builds) {
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
          return state.stop(null, '🔄 Your prisma schema has changed, please restart Keystone')
        }

        if (
          JSON.stringify(newSystem.config.db.enableLogging) !==
            JSON.stringify(system.config.db.enableLogging) ||
          newSystem.config.db.url !== system.config.db.url
        ) {
          return state.stop(null, 'Your database configuration has changed, please restart Keystone')
        }
      }

      const newPrintedGraphQLSchema = printSchema(newSystem.graphql.schemas.public)
      if (newPrintedGraphQLSchema !== state.lastPrintedGraphQLSchema) {
        await fsp.writeFile(
          paths.schema.graphql,
          getFormattedGraphQLSchema(newPrintedGraphQLSchema)
        )
        state.lastPrintedGraphQLSchema = newPrintedGraphQLSchema
      }

      await generateTypes(cwd, newSystem)
      await generateAdminUI(newSystem.config, newSystem.adminMeta, paths.admin, true)
      if (state.prismaClient) {
        if (server && state.lastApolloServer) {
          const { context: newContext } = newSystem.getKeystone(state.prismaClient)
          const servers = await createExpressServer(newSystem.config, newContext)
          if (nextApp) {
            servers.expressServer.use(
              createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, nextApp)
            )
          }
          state.expressServer = servers.expressServer
          const prevApolloServer = state.lastApolloServer
          state.lastApolloServer = servers.apolloServer
          await prevApolloServer.stop()
        }
      }
    } catch (err) {
      console.error(`Error loading your Keystone config`, err)
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
      await state.prismaClient?.disconnect?.()
    } catch (err) {
      console.error('Error disconnecting from the database', err)
      throw err
    }

    if (exitMessage) throw new ExitError(1, exitMessage)
  }

  const app = server ? express() : null
  const httpServer = app ? createServer(app) : null
  const state = {
    prismaClient: null,
    expressServer: null,
    hasAddedAdminUIMiddleware: false,
    lastPrintedGraphQLSchema: null,
    lastApolloServer: null,
    initKeystonePromiseResolve: null as (() => void) | null,
    initKeystonePromiseReject: null as ((err: any) => void) | null,
    builds,
  }

  const isReady = () => !server || (state.expressServer !== null && state.hasAddedAdminUIMiddleware)

  const initKeystonePromise = new Promise<void>((resolve, reject) => {
    state.initKeystonePromiseResolve = resolve
    state.initKeystonePromiseReject = reject
  })

  if (app && httpServer) {
    const config = await importBuiltKeystoneConfiguration(cwd)

    app.use('/__keystone/dev/status', (req, res) => {
      res.status(isReady() ? 200 : 501).end()
    })

    app.use((req, res, next) => {
      if (state.expressServer && state.hasAddedAdminUIMiddleware) {
        return state.expressServer(req, res, next)
      }

      const { pathname } = new URL(req.url, 'http://ks')
      if (state.expressServer && pathname === (config.graphql?.path ?? '/api/graphql')) {
        return state.expressServer(req, res, next)
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

      initKeystone(
        cwd,
        { dbPush, prisma, quiet, server, ui },
        state,
        log,
        app,
        httpServer,
        server,
        ui,
        prisma,
        dbPush,
        quiet
      ).catch(async err => {
        await stop(serverInstance)
        state.initKeystonePromiseReject?.(err)
      })
    })

    await initKeystonePromise
    return async () => await stop(serverInstance)
  } else {
    await initKeystone(
      cwd,
      { dbPush, prisma, quiet, server, ui },
      state,
      log,
      app,
      httpServer,
      server,
      ui,
      prisma,
      dbPush,
      quiet
    )
    return () => Promise.resolve()
  }
}