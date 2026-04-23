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

/* ---------- Helper: ESBuild ---------- */
async function startEsbuild(cwd: string) {
  const esbuildConfig = await getEsbuildConfig(cwd)
  const addBuildResult = (build: BuildResult) => {
    const prev = lastPromise
    lastPromise = resolvablePromise()
    prev.resolve({ value: build, done: false })
  }

  let lastPromise = resolvablePromise<IteratorResult<BuildResult>>()
  const builds: AsyncIterable<BuildResult> = {
    [Symbol.asyncIterator]: () => ({ next: () => lastPromise }),
  }

  const esbuildContext = await esbuild.context({
    ...esbuildConfig,
    plugins: [
      ...(esbuildConfig.plugins ?? []),
      {
        name: 'esbuildWatchPlugin',
        setup(build: any) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
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
  return { esbuildContext, builds, addBuildResult }
}

/* ---------- Helper: Server Stop ---------- */
async function stopServer(
  esbuildContext: esbuild.PluginBuild['context'],
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

/* ---------- Helper: Init Keystone ---------- */
async function initKeystoneEnv(
  cwd: string,
  flags: Pick<Flags, 'dbPush' | 'prisma' | 'quiet' | 'ui'>,
  log: (msg: string) => void,
  httpServer: any,
  contextHolder: { context?: any },
  expressServerHolder: { server?: express.Express },
  nextAppHolder: { app?: any },
  prismaClientHolder: { client?: any },
  hasAddedAdminUIMiddlewareSetter: (v: boolean) => void,
  initKeystonePromiseResolve: () => void
) {
  const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
  const { system, prismaClientModule, apolloServer, ...rest } = await (async () => {
    const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

    if (flags.prisma) {
      log('✨ Generating GraphQL and Prisma schemas')
      const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
      await generateTypes(cwd, system)
      await generatePrismaClient(cwd, system)

      const paths = system.getPaths(cwd)
      if (flags.dbPush) {
        const created = await createDatabase(system.config.db.url, path.dirname(paths.schema.prisma))
        if (created) log('✨ Database created')

        const migration = await withMigrate(paths.schema.prisma, system, async m => {
          const migration_ = await m.schema(generatedPrismaSchema, false)

          if (migration_.unexecutable.length) {
            console.error(`${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`)
            for (const item of migration_.unexecutable) console.error(`  • ${item}`)

            if (migration_.warnings.length) {
              console.error(chalk.bold(`\n⚠️  Warnings:\n`))
              for (const warning of migration_.warnings) console.error(`  • ${warning}`)
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
            for (const warning of migration_.warnings) console.error(`  • ${warning}`)

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
          log('✨ Database unchanged')
        } else {
          log('✨ Database synchronized with Prisma schema')
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
      log('✅ GraphQL API ready')
      return {
        system,
        context: keystone.context,
        expressServer,
        apolloServer,
        prismaClientModule,
      }
    }

    return { system }
  })()

  if (configWithExtendHttp?.server?.extendHttpServer && httpServer && contextHolder.context) {
    configWithExtendHttp.server.extendHttpServer(httpServer, contextHolder.context)
  }

  prismaClientHolder.client = contextHolder.context?.prisma
  if (rest.expressServer) expressServerHolder.server = rest.expressServer

  if (!system.config.ui?.isDisabled && flags.ui) {
    if (!expressServerHolder.server || !contextHolder.context) {
      throw new TypeError('Error trying to prepare the Admin UI')
    }

    log('✨ Generating Admin UI code')
    const paths = system.getPaths(cwd)
    await fsp.rm(paths.admin, { recursive: true, force: true })
    await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

    log('✨ Preparing Admin UI')
    const nextApp = next({ dev: true, dir: paths.admin })
    await nextApp.prepare()
    expressServerHolder.server.use(
      createAdminUIMiddlewareWithNextApp(system.config, contextHolder.context, nextApp)
    )
    nextAppHolder.app = nextApp
    log('✅ Admin UI ready')
  }

  hasAddedAdminUIMiddlewareSetter(true)
  initKeystonePromiseResolve()
  return { system, apolloServer }
}

/* ---------- Helper: Process Builds ---------- */
async function processBuilds(
  builds: AsyncIterable<BuildResult>,
  system: any,
  cwd: string,
  flags: Pick<Flags, 'prisma'>,
  log: (msg: string) => void,
  stop: (msg: string) => Promise<void>,
  prismaClientModule: any,
  expressServerHolder: { server?: express.Express },
  nextAppHolder: { app?: any },
  apolloServerHolder: { server?: any }
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
      const resolved = require.resolve(paths.config)
      delete require.cache[resolved]

      const newConfig = await importBuiltKeystoneConfiguration(cwd)
      const newSystem = createSystem(stripExtendHttpServer(newConfig))

      if (flags.prisma) {
        if (!originalPrismaSchema) throw new TypeError('Missing Prisma schema source')
        const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
        if (originalPrismaSchema !== newPrismaSchema) {
          await stop('🔄 Your prisma schema has changed, please restart Keystone')
          return
        }
        if (
          JSON.stringify(newSystem.config.db.enableLogging) !==
            JSON.stringify(system.config.db.enableLogging) ||
          newSystem.config.db.url !== system.config.db.url
        ) {
          await stop('Your database configuration has changed, please restart Keystone')
          return
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

      if (prismaClientModule && flags.prisma) {
        if (expressServerHolder.server && lastApolloServer) {
          const { context: newContext } = newSystem.getKeystone(prismaClientModule)
          const servers = await createExpressServer(newSystem.config, newContext)

          if (nextAppHolder.app) {
            servers.expressServer.use(
              createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, nextAppHolder.app)
            )
          }

          expressServerHolder.server = servers.expressServer
          const prevApolloServer = lastApolloServer
          lastApolloServer = servers.apolloServer
          await prevApolloServer.stop()
        }
      }
    } catch (err) {
      console.error('Error loading your Keystone config', err)
    }
  }
}

/* ---------- Main Export ---------- */
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

  const { esbuildContext, builds } = await startEsbuild(cwd)

  const app = server ? express() : null
  const httpServer = app ? createServer(app) : null

  const contextHolder: { context?: any } = {}
  const expressServerHolder: { server?: express.Express } = {}
  const nextAppHolder: { app?: any } = {}
  const prismaClientHolder: { client?: any } = {}
  let hasAddedAdminUIMiddleware = false

  const isReady = () => !server || (expressServerHolder.server && hasAddedAdminUIMiddleware)

  const stop = async (msg = '') => {
    await stopServer(esbuildContext, httpServer, prismaClientHolder.client, msg)
  }

  let initKeystonePromiseResolve: () => void
  const initKeystonePromise = new Promise<void>(resolve => {
    initKeystonePromiseResolve = resolve
  })

  if (app && httpServer) {
    const config = await importBuiltKeystoneConfiguration(cwd)

    app.use('/__keystone/dev/status', (req, res) => {
      res.status(isReady() ? 200 : 501).end()
    })

    app.use((req, res, next) => {
      if (expressServerHolder.server && hasAddedAdminUIMiddleware) {
        return expressServerHolder.server(req, res, next)
      }

      const { pathname } = new URL(req.url, 'http://ks')
      if (
        expressServerHolder.server &&
        pathname === (config.graphql?.path ?? '/api/graphql')
      ) {
        return expressServerHolder.server(req, res, next)
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

    if (process.env.PORT) httpOptions.port = parseInt(process.env.PORT, 10)
    if (process.env.HOST) httpOptions.host = process.env.HOST

    const serverInstance = httpServer.listen(httpOptions, async err => {
      if (err) throw err

      const easyHost = [undefined, '', '::', '0.0.0.0'].includes(httpOptions.host)
        ? 'localhost'
        : httpOptions.host
      log(
        `⭐️ Server listening on ${httpOptions.host ?? ''}:${httpOptions.port} (http://${easyHost}:${httpOptions.port}/)`
      )
      log(`⭐️ GraphQL API available at ${config.graphql?.path ?? '/api/graphql'}`)

      try {
        const { system, apolloServer } = await initKeystoneEnv(
          cwd,
          { dbPush, prisma, quiet, ui },
          log,
          httpServer,
          contextHolder,
          expressServerHolder,
          nextAppHolder,
          prismaClientHolder,
          v => (hasAddedAdminUIMiddleware = v),
          initKeystonePromiseResolve!
        )
        if (system.config.telemetry !== false) {
          runTelemetry(cwd, system.lists, system.config.db.provider)
        }
        await processBuilds(
          builds,
          system,
          cwd,
          { prisma },
          log,
          stop,
          prismaClientHolder.client,
          expressServerHolder,
          nextAppHolder,
          { server: apolloServer }
        )
      } catch (err) {
        await stop()
        initKeystonePromiseReject(err)
      }
    })

    await initKeystonePromise
    return async () => await stop()
  } else {
    const { system } = await initKeystoneEnv(
      cwd,
      { dbPush, prisma, quiet, ui },
      log,
      null,
      contextHolder,
      expressServerHolder,
      nextAppHolder,
      prismaClientHolder,
      v => (hasAddedAdminUIMiddleware = v),
      initKeystonePromiseResolve!
    )
    if (system.config.telemetry !== false) {
      runTelemetry(cwd, system.lists, system.config.db.provider)
    }
    await processBuilds(
      builds,
      system,
      cwd,
      { prisma },
      log,
      stop,
      prismaClientHolder.client,
      expressServerHolder,
      nextAppHolder,
      { server: null }
    )
    return () => Promise.resolve()
  }
}