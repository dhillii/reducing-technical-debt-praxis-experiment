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

async function createEsbuildContext(cwd: string) {
  const esbuildConfig = await getEsbuildConfig(cwd)
  let lastPromise = resolvablePromise<IteratorResult<BuildResult>>()

  const builds: AsyncIterable<BuildResult> = {
    [Symbol.asyncIterator]: () => ({ next: () => lastPromise }),
  }

  function addBuildResult(build: BuildResult) {
    const prev = lastPromise
    lastPromise = resolvablePromise()
    prev.resolve({ value: build, done: false })
  }

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
  } catch {}

  esbuildContext.watch()

  return { esbuildContext, builds }
}

async function stopServer(
  esbuildContext: esbuild.BuildContext,
  httpServer: any,
  prismaClient: any,
  exitMessage = ''
) {
  await esbuildContext.dispose()

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

async function initKeystone(
  cwd: string,
  flags: Pick<Flags, 'dbPush' | 'prisma' | 'quiet' | 'server' | 'ui'>,
  state: {
    prismaClient: any
    expressServer: express.Express | null
    hasAddedAdminUIMiddleware: boolean
    nextApp: any
    lastPrintedGraphQLSchema: string
    lastApolloServer: any
    originalPrismaSchema: string
  },
  log: (msg: string) => void,
  builds: AsyncIterable<BuildResult>,
  esbuildContext: esbuild.BuildContext,
  stopServer: (
    esbuildContext: esbuild.BuildContext,
    httpServer: any,
    prismaClient: any,
    exitMessage?: string
  ) => Promise<void>,
  initKeystonePromiseResolve: () => void
) {
  const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
  const { system, context, prismaClientModule, apolloServer, ...rest } =
    await (async function () {
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
              if (migration_.warnings.length) {
                console.error(chalk.bold(`\n⚠️  Warnings:\n`))
                for (const warning of migration_.warnings) {
                  console.error(`  • ${warning}`)
                }
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
      return {
        system,
      }
    })()

  if (configWithExtendHttp?.server?.extendHttpServer && state.expressServer && context) {
    configWithExtendHttp.server.extendHttpServer(state.expressServer, context)
  }

  state.prismaClient = context?.prisma
  if (rest.expressServer) {
    state.expressServer = rest.expressServer
  }

  let nextApp
  if (!system.config.ui?.isDisabled && flags.ui) {
    if (!state.expressServer || !context) throw new TypeError('Error trying to prepare the Admin UI')

    log('✨ Generating Admin UI code')
    const paths = system.getPaths(cwd)
    await fsp.rm(paths.admin, { recursive: true, force: true })
    await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

    log('✨ Preparing Admin UI')
    nextApp = next({ dev: true, dir: paths.admin })
    await nextApp.prepare()
    state.expressServer.use(
      createAdminUIMiddlewareWithNextApp(system.config, context, nextApp)
    )
    log(`✅ Admin UI ready`)
  }

  state.hasAddedAdminUIMiddleware = true
  initKeystonePromiseResolve()

  state.originalPrismaSchema = printPrismaSchema(system.config, system.lists)
  state.lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)
  state.lastApolloServer = apolloServer ?? null

  if (system.config.telemetry !== false) {
    runTelemetry(cwd, system.lists, system.config.db.provider)
  }

  for await (const buildResult of builds) {
    if (buildResult.errors.length) continue

    log('compiled successfully')
    try {
      const paths = system.getPaths(cwd)

      {
        const resolved = require.resolve(paths.config)
        delete require.cache[resolved]
      }

      const newConfigWithHttp = await importBuiltKeystoneConfiguration(cwd)
      const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

      if (flags.prisma) {
        if (!state.originalPrismaSchema) throw new TypeError('Missing Prisma schema source')

        const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
        if (state.originalPrismaSchema !== newPrismaSchema) {
          return stopServer(esbuildContext, null, null, '🔄 Your prisma schema has changed, please restart Keystone')
        }

        if (
          JSON.stringify(newSystem.config.db.enableLogging) !==
            JSON.stringify(system.config.db.enableLogging) ||
          newSystem.config.db.url !== system.config.db.url
        ) {
          return stopServer(esbuildContext, null, null, 'Your database configuration has changed, please restart Keystone')
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
      if (prismaClientModule) {
        if (flags.server && state.lastApolloServer) {
          const { context: newContext } = newSystem.getKeystone(prismaClientModule)
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

function setupExpressRoutes(
  app: express.Express,
  config: KeystoneConfig,
  state: {
    expressServer: express.Express | null
    hasAddedAdminUIMiddleware: boolean
  },
  devLoadingHTMLFilepath: string,
  log: (msg: string) => void,
  isReady: () => boolean
) {
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
}

async function startHttpServer(
  httpServer: any,
  config: KeystoneConfig,
  log: (msg: string) => void,
  initKeystonePromiseResolve: () => void,
  initKeystonePromiseReject: (err: any) => void,
  state: {
    prismaClient: any
    expressServer: express.Express | null
    hasAddedAdminUIMiddleware: boolean
    nextApp: any
    lastPrintedGraphQLSchema: string
    lastApolloServer: any
    originalPrismaSchema: string
  },
  esbuildContext: esbuild.BuildContext,
  stopServer: (
    esbuildContext: esbuild.BuildContext,
    httpServer: any,
    prismaClient: any,
    exitMessage?: string
  ) => Promise<void>,
  cwd: string,
  flags: Pick<Flags, 'dbPush' | 'prisma' | 'quiet' | 'server' | 'ui'>
) {
  const httpOptions: ListenOptions = { port: 3000 }

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

  const server = httpServer.listen(httpOptions, async (err?: any) => {
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
      flags,
      state,
      log,
      state.builds,
      esbuildContext,
      stopServer,
      initKeystonePromiseResolve
    ).catch(async err => {
      await stopServer(esbuildContext, httpServer, state.prismaClient)
      initKeystonePromiseReject(err)
    })
  })

  return async () => await stopServer(esbuildContext, httpServer, state.prismaClient)
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

  const { esbuildContext, builds } = await createEsbuildContext(cwd)

  const state = {
    prismaClient: null as any,
    expressServer: null as express.Express | null,
    hasAddedAdminUIMiddleware: false,
    nextApp: null as any,
    lastPrintedGraphQLSchema: '',
    lastApolloServer: null as any,
    originalPrismaSchema: '',
    builds,
  }

  const app = server ? express() : null
  const httpServer = app ? createServer(app) : null

  const isReady = () => !server || (state.expressServer !== null && state.hasAddedAdminUIMiddleware)

  if (app && httpServer) {
    const config = await importBuiltKeystoneConfiguration(cwd)

    setupExpressRoutes(app, config, state, devLoadingHTMLFilepath, log, isReady)

    const initKeystonePromiseResolve = () => {}
    const initKeystonePromiseReject = (err: any) => {}
    const initKeystonePromise = new Promise<void>((resolve, reject) => {
      initKeystonePromiseResolve = resolve
      initKeystonePromiseReject = reject
    })

    const stop = await startHttpServer(
      httpServer,
      config,
      log,
      initKeystonePromiseResolve,
      initKeystonePromiseReject,
      state,
      esbuildContext,
      stopServer,
      cwd,
      { dbPush, prisma, quiet, server, ui }
    )

    await initKeystonePromise
    return async () => await stop()
  } else {
    await initKeystone(
      cwd,
      { dbPush, prisma, quiet, server, ui },
      state,
      log,
      builds,
      esbuildContext,
      stopServer,
      () => {}
    )
    return () => Promise.resolve()
  }
}