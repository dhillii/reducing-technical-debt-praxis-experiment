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

/** Creates a promise with an external resolve method. */
function resolvablePromise<T>() {
  let _resolve!: (value: T) => void
  const promise: any = new Promise<T>(resolve => {
    _resolve = resolve
  })
  promise.resolve = _resolve
  return promise
}

/** Simple logger that respects the quiet flag. */
function createLogger(quiet: boolean) {
  return (message: string) => {
    if (!quiet) console.log(message)
  }
}

/** Sets up esbuild watch and returns utilities for build handling. */
async function setupEsbuild(cwd: string) {
  const esbuildConfig = await getEsbuildConfig(cwd)
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

  let lastPromise = resolvablePromise<IteratorResult<BuildResult>>()
  const builds: AsyncIterable<BuildResult> = {
    [Symbol.asyncIterator]: () => ({ next: () => lastPromise }),
  }

  function addBuildResult(build: BuildResult) {
    const prev = lastPromise
    lastPromise = resolvablePromise()
    prev.resolve({ value: build, done: false })
  }

  try {
    const firstBuild = await esbuildContext.rebuild()
    addBuildResult(firstBuild)
  } catch {
    // esbuild already printed errors
  }

  esbuildContext.watch()
  return { esbuildContext, builds, addBuildResult }
}

/** Gracefully stops the dev server and related resources. */
async function stopDev(
  esbuildContext: esbuild.PluginBuild | esbuild.BuildContext,
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

/** Handles a single esbuild build result, updating schemas and UI as needed. */
async function handleBuildResult(
  buildResult: BuildResult,
  system: ReturnType<typeof createSystem>,
  cwd: string,
  prisma: boolean,
  prismaClientModule: any,
  originalPrismaSchema: string | undefined,
  lastPrintedGraphQLSchemaRef: { current: string },
  lastApolloServerRef: { current: any },
  expressServerRef: { current: express.Express | null },
  nextApp: any,
  log: (msg: string) => void
) {
  if (buildResult.errors.length) return

  log('compiled successfully')
  const paths = system.getPaths(cwd)

  // clear config cache
  {
    const resolved = require.resolve(paths.config)
    delete require.cache[resolved]
  }

  const newConfig = await importBuiltKeystoneConfiguration(cwd)
  const newSystem = createSystem(stripExtendHttpServer(newConfig))

  if (prisma) {
    if (!originalPrismaSchema) throw new TypeError('Missing Prisma schema source')
    const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
    if (originalPrismaSchema !== newPrismaSchema) {
      await stopDev(esbuild, null, null, '🔄 Your prisma schema has changed, please restart Keystone')
    }
    if (
      JSON.stringify(newSystem.config.db.enableLogging) !==
        JSON.stringify(system.config.db.enableLogging) ||
      newSystem.config.db.url !== system.config.db.url
    ) {
      await stopDev(esbuild, null, null, 'Your database configuration has changed, please restart Keystone')
    }
  }

  const newPrintedGraphQLSchema = printSchema(newSystem.graphql.schemas.public)
  if (newPrintedGraphQLSchema !== lastPrintedGraphQLSchemaRef.current) {
    await fsp.writeFile(
      paths.schema.graphql,
      getFormattedGraphQLSchema(newPrintedGraphQLSchema)
    )
    lastPrintedGraphQLSchemaRef.current = newPrintedGraphQLSchema
  }

  await generateTypes(cwd, newSystem)
  await generateAdminUI(newSystem.config, newSystem.adminMeta, paths.admin, true)

  if (prismaClientModule && expressServerRef.current && lastApolloServerRef.current) {
    const { context: newContext } = newSystem.getKeystone(prismaClientModule)
    const servers = await createExpressServer(newSystem.config, newContext)
    if (nextApp) {
      servers.expressServer.use(
        createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, nextApp)
      )
    }
    expressServerRef.current = servers.expressServer
    const prevApollo = lastApolloServerRef.current
    lastApolloServerRef.current = servers.apolloServer
    await prevApollo.stop()
  }
}

/** Initializes Keystone, generates artifacts, and starts the GraphQL server. */
async function initKeystoneCore(
  cwd: string,
  flags: Pick<Flags, 'dbPush' | 'prisma' | 'ui'>,
  log: (msg: string) => void,
  httpServer: any,
  contextRef: { current: any },
  expressServerRef: { current: express.Express | null },
  hasAddedAdminUIMiddlewareRef: { current: boolean },
  initKeystoneResolve: () => void,
  prismaClientRef: { current: any }
) {
  const { dbPush, prisma, ui } = flags
  const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
  const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

  if (prisma) {
    log('✨ Generating GraphQL and Prisma schemas')
    const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
    await generateTypes(cwd, system)
    await generatePrismaClient(cwd, system)

    const paths = system.getPaths(cwd)
    if (dbPush) {
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
    if (!httpServer) {
      contextRef.current = keystone.context
      prismaClientRef.current = keystone.context?.prisma
      initKeystoneResolve()
      return { system }
    }

    log('✨ Creating server')
    const { apolloServer, expressServer } = await createExpressServer(
      system.config,
      keystone.context
    )
    log('✅ GraphQL API ready')
    contextRef.current = keystone.context
    prismaClientRef.current = keystone.context?.prisma
    expressServerRef.current = expressServer
    return { system, apolloServer }
  }

  // No Prisma path – just return system
  initKeystoneResolve()
  return { system }
}

/** Sets up the HTTP server and routes for dev mode. */
async function setupDevServer(
  cwd: string,
  flags: Pick<Flags, 'server' | 'ui'>,
  log: (msg: string) => void,
  expressServerRef: { current: express.Express | null },
  hasAddedAdminUIMiddlewareRef: { current: boolean },
  initKeystonePromise: Promise<void>,
  isReady: () => boolean
) {
  const { server, ui } = flags
  const app = server ? express() : null
  const httpServer = app ? createServer(app) : null

  if (!app || !httpServer) return { httpServer, stopFn: async () => {} }

  const config = await importBuiltKeystoneConfiguration(cwd)

  app.use('/__keystone/dev/status', (req, res) => {
    res.status(isReady() ? 200 : 501).end()
  })

  app.use((req, res, next) => {
    if (expressServerRef.current && hasAddedAdminUIMiddlewareRef.current) {
      return expressServerRef.current(req, res, next)
    }
    const { pathname } = new URL(req.url, 'http://ks')
    if (expressServerRef.current && pathname === (config.graphql?.path ?? '/api/graphql')) {
      return expressServerRef.current(req, res, next)
    }
    res.sendFile(devLoadingHTMLFilepath)
  })

  const httpOptions: ListenOptions = { port: 3000 }
  if (config?.server?.port && typeof config.server.port === 'number') httpOptions.port = config.server.port
  if (config?.server?.options) Object.assign(httpOptions, config.server.options)
  if (process.env.PORT) httpOptions.port = parseInt(process.env.PORT ?? '')
  if (process.env.HOST) httpOptions.host = process.env.HOST

  const serverInstance = httpServer.listen(httpOptions, err => {
    if (err) throw err
    const easyHost = [undefined, '', '::', '0.0.0.0'].includes(httpOptions.host) ? 'localhost' : httpOptions.host
    log(
      `⭐️ Server listening on ${httpOptions.host ?? ''}:${httpOptions.port} (http://${easyHost}:${httpOptions.port}/)`
    )
    log(`⭐️ GraphQL API available at ${config.graphql?.path ?? '/api/graphql'}`)
    initKeystonePromise.catch(async err => {
      await stopDev(esbuild, serverInstance, null)
    })
  })

  const stopFn = async () => {
    await stopDev(esbuild, serverInstance, null)
  }

  return { httpServer: serverInstance, stopFn }
}

/** Main dev entry point – orchestrates build, server, and Keystone initialization. */
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
  const log = createLogger(quiet)
  log('✨ Starting Keystone')

  const { esbuildContext, builds } = await setupEsbuild(cwd)

  const prismaClientRef = { current: null as any }
  const contextRef = { current: null as any }
  const expressServerRef = { current: null as express.Express | null }
  const hasAddedAdminUIMiddlewareRef = { current: false }
  const initKeystonePromiseResolve = () => {}
  const initKeystonePromise = new Promise<void>((resolve, reject) => {
    ;(initKeystonePromiseResolve as any) = resolve
  })

  const isReady = () => !server || (expressServerRef.current !== null && hasAddedAdminUIMiddlewareRef.current)

  // Initialize Keystone (may start server later)
  const initKeystone = async () => {
    const { system, apolloServer } = await initKeystoneCore(
      cwd,
      { dbPush, prisma, ui },
      log,
      null,
      contextRef,
      expressServerRef,
      hasAddedAdminUIMiddlewareRef,
      initKeystonePromiseResolve,
      prismaClientRef
    )
    if (system.config.ui?.isDisabled === false && ui && expressServerRef.current && contextRef.current) {
      log('✨ Generating Admin UI code')
      const paths = system.getPaths(cwd)
      await fsp.rm(paths.admin, { recursive: true, force: true })
      await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

      log('✨ Preparing Admin UI')
      const nextApp = next({ dev: true, dir: paths.admin })
      await nextApp.prepare()
      expressServerRef.current.use(
        createAdminUIMiddlewareWithNextApp(system.config, contextRef.current, nextApp)
      )
      log('✅ Admin UI ready')
    }
    hasAddedAdminUIMiddlewareRef.current = true
    initKeystonePromiseResolve()
    return { system, apolloServer }
  }

  // Start dev server if needed
  const { httpServer, stopFn } = await setupDevServer(
    cwd,
    { server, ui },
    log,
    expressServerRef,
    hasAddedAdminUIMiddlewareRef,
    initKeystonePromise,
    isReady
  )

  // Process build results
  const lastPrintedGraphQLSchemaRef = { current: '' }
  const lastApolloServerRef = { current: null as any }

  for await (const buildResult of builds) {
    const system = createSystem(stripExtendHttpServer(await importBuiltKeystoneConfiguration(cwd)))
    await handleBuildResult(
      buildResult,
      system,
      cwd,
      prisma,
      null,
      undefined,
      lastPrintedGraphQLSchemaRef,
      lastApolloServerRef,
      expressServerRef,
      null,
      log
    )
  }

  if (httpServer) {
    await initKeystonePromise
    return async () => await stopFn()
  } else {
    await initKeystone()
    return () => Promise.resolve()
  }
}