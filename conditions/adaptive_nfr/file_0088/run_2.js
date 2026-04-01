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

/** Check if migration has unexecutable steps */
function hasMigrationUnexecutableSteps(migration_: any): boolean {
  return migration_.unexecutable.length > 0
}

/** Check if migration has warnings */
function hasMigrationWarnings(migration_: any): boolean {
  return migration_.warnings.length > 0
}

/** Log unexecutable migration steps */
function logUnexecutableSteps(unexecutable: string[]): void {
  console.error(`${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`)
  for (const item of unexecutable) {
    console.error(`  • ${item}`)
  }
}

/** Log migration warnings */
function logMigrationWarnings(warnings: string[]): void {
  console.error(chalk.bold(`\n⚠️  Warnings:\n`))
  for (const warning of warnings) {
    console.error(`  • ${warning}`)
  }
}

/** Handle unexecutable migration steps */
async function handleUnexecutableMigration(
  migration_: any,
  m: any,
  generatedPrismaSchema: string
): Promise<any> {
  logUnexecutableSteps(migration_.unexecutable)

  if (hasMigrationWarnings(migration_)) {
    logMigrationWarnings(migration_.warnings)
  }

  console.error('\nTo apply this migration, we need to reset the database')
  const shouldContinue = await confirmPrompt(
    `Do you want to continue? ${chalk.red('The database will be reset')}`,
    false
  )

  if (!shouldContinue) {
    throw new ExitError(1, 'Database reset cancelled by user')
  }

  await m.reset()
  return m.schema(generatedPrismaSchema, false)
}

/** Handle migration with warnings */
async function handleMigrationWithWarnings(
  migration_: any,
  m: any,
  generatedPrismaSchema: string
): Promise<any> {
  logMigrationWarnings(migration_.warnings)

  const shouldContinue = await confirmPrompt(
    `Do you want to continue? ${chalk.red('Some data will be lost')}`,
    false
  )

  if (!shouldContinue) {
    throw new ExitError(1, 'Database push cancelled by user')
  }

  return m.schema(generatedPrismaSchema, true)
}

/** Process schema migration */
async function processSchemaMigration(
  migration_: any,
  m: any,
  generatedPrismaSchema: string
): Promise<any> {
  if (hasMigrationUnexecutableSteps(migration_)) {
    return handleUnexecutableMigration(migration_, m, generatedPrismaSchema)
  }

  if (hasMigrationWarnings(migration_)) {
    return handleMigrationWithWarnings(migration_, m, generatedPrismaSchema)
  }

  return migration_
}

/** Check if database configuration changed */
function hasDbConfigChanged(newSystem: any, system: any): boolean {
  return (
    JSON.stringify(newSystem.config.db.enableLogging) !==
      JSON.stringify(system.config.db.enableLogging) ||
    newSystem.config.db.url !== system.config.db.url
  )
}

/** Check if Prisma schema changed */
function hasPrismaSchemaChanged(
  originalPrismaSchema: string,
  newPrismaSchema: string
): boolean {
  return originalPrismaSchema !== newPrismaSchema
}

/** Check if GraphQL schema changed */
function hasGraphQLSchemaChanged(
  newPrintedGraphQLSchema: string,
  lastPrintedGraphQLSchema: string
): boolean {
  return newPrintedGraphQLSchema !== lastPrintedGraphQLSchema
}

/** Extract port from config */
function extractPortFromConfig(config: any): number | undefined {
  if (config?.server && 'port' in config.server && typeof config.server?.port === 'number') {
    return config.server.port
  }
  return undefined
}

/** Extract server options from config */
function extractServerOptionsFromConfig(config: any): any {
  if (config?.server && 'options' in config.server && config.server.options) {
    return config.server.options
  }
  return {}
}

/** Build HTTP options from config and environment */
function buildHttpOptions(config: any): ListenOptions {
  const httpOptions: ListenOptions = {
    port: 3000,
  }

  const configPort = extractPortFromConfig(config)
  if (configPort !== undefined) {
    httpOptions.port = configPort
  }

  const serverOptions = extractServerOptionsFromConfig(config)
  Object.assign(httpOptions, serverOptions)

  if ('PORT' in process.env) {
    httpOptions.port = parseInt(process.env.PORT ?? '')
  }

  if ('HOST' in process.env) {
    httpOptions.host = process.env.HOST ?? ''
  }

  return httpOptions
}

/** Get display host for logging */
function getDisplayHost(host: string | undefined): string {
  return [undefined, '', '::', '0.0.0.0'].includes(host) ? 'localhost' : host ?? ''
}

/** Check if should handle request with express server */
function shouldUseExpressServer(
  expressServer: any,
  hasAddedAdminUIMiddleware: boolean
): boolean {
  return expressServer !== null && hasAddedAdminUIMiddleware
}

/** Check if should handle GraphQL path */
function shouldHandleGraphQLPath(
  expressServer: any,
  pathname: string,
  graphqlPath: string
): boolean {
  return expressServer !== null && pathname === graphqlPath
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

  const initKeystone = async () => {
    const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
    const { system, context, prismaClientModule, apolloServer, ...rest } =
      await (async function () {
        const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

        if (!prisma) {
          return { system }
        }

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
            return processSchemaMigration(migration_, m, generatedPrismaSchema)
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
      })()

    if (configWithExtendHttp?.server?.extendHttpServer && httpServer && context) {
      configWithExtendHttp.server.extendHttpServer(httpServer, context)
    }

    prismaClient = context?.prisma
    if (rest.expressServer) {
      ;({ expressServer } = rest)
    }

    let nextApp
    if (!system.config.ui?.isDisabled && ui) {
      if (!expressServer || !context) throw new TypeError('Error trying to prepare the Admin UI')

      log('✨ Generating Admin UI code')
      const paths = system.getPaths(cwd)
      await fsp.rm(paths.admin, { recursive: true, force: true })
      await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

      log('✨ Preparing Admin UI')
      nextApp = next({ dev: true, dir: paths.admin })
      await nextApp.prepare()
      expressServer.use(createAdminUIMiddlewareWithNextApp(system.config, context, nextApp))
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
      await handleBuildResult(
        cwd,
        system,
        originalPrismaSchema,
        lastPrintedGraphQLSchema,
        prismaClientModule,
        lastApolloServer,
        nextApp,
        expressServer,
        stop,
        log,
        prisma,
        server
      ).then(result => {
        if (result.shouldStop) {
          return stop(null, result.message)
        }
        lastPrintedGraphQLSchema = result.lastPrintedGraphQLSchema
        lastApolloServer = result.lastApolloServer
        expressServer = result.expressServer
      })
    }
  }

  // Serve the dev status page for the Admin UI
  let initKeystonePromiseResolve: () => void | undefined
  let initKeystonePromiseReject: (err: any) => void | undefined
  const initKeystonePromise = new Promise<void>((resolve, reject) => {
    initKeystonePromiseResolve = resolve
    initKeystonePromiseReject = reject
  })

  if (!app || !httpServer) {
    await initKeystone()
    return () => Promise.resolve()
  }

  const config = await importBuiltKeystoneConfiguration(cwd)

  app.use('/__keystone/dev/status', (req, res) => {
    res.status(isReady() ? 200 : 501).end()
  })

  app.use((req, res, next) => {
    if (shouldUseExpressServer(expressServer, hasAddedAdminUIMiddleware)) {
      return expressServer(req, res, next)
    }

    const { pathname } = new URL(req.url, 'http://ks')
    const graphqlPath = config.graphql?.path ?? '/api/graphql'
    if (shouldHandleGraphQLPath(expressServer, pathname, graphqlPath)) {
      return expressServer(req, res, next)
    }

    res.sendFile(devLoadingHTMLFilepath)
  })

  const httpOptions = buildHttpOptions(config)

  const server = httpServer.listen(httpOptions, (err?: any) => {
    if (err) throw err

    const easyHost = getDisplayHost(httpOptions.host)
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
}

/** Handle build result and update systems */
async function handleBuildResult(
  cwd: string,
  system: any,
  originalPrismaSchema: string,
  lastPrintedGraphQLSchema: string,
  prismaClientModule: any,
  lastApolloServer: any,
  nextApp: any,
  expressServer: any,
  stop: (server: any, message: string) => Promise<void>,
  log: (message: string) => void,
  prisma: boolean,
  server: boolean
): Promise<{
  shouldStop: boolean
  message: string
  lastPrintedGraphQLSchema: string
  lastApolloServer: any
  expressServer: any
}> {
  try {
    const paths = system.getPaths(cwd)

    const resolved = require.resolve(paths.config)
    delete require.cache[resolved]

    const newConfigWithHttp = await importBuiltKeystoneConfiguration(cwd)
    const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

    if (prisma) {
      if (!originalPrismaSchema) throw new TypeError('Missing Prisma schema source')

      const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
      if (hasPrismaSchemaChanged(originalPrismaSchema, newPrismaSchema)) {
        return {
          shouldStop: true,
          message: '🔄 Your prisma schema has changed, please restart Keystone',
          lastPrintedGraphQLSchema,
          lastApolloServer,
          expressServer,
        }
      }

      if (hasDbConfigChanged(newSystem, system)) {
        return {
          shouldStop: true,
          message: 'Your database configuration has changed, please restart Keystone',
          lastPrintedGraphQLSchema,
          lastApolloServer,
          expressServer,
        }
      }
    }

    const newPrintedGraphQLSchema = printSchema(newSystem.graphql.schemas.public)
    if (hasGraphQLSchemaChanged(newPrintedGraphQLSchema, lastPrintedGraphQLSchema)) {
      await fsp.writeFile(
        paths.schema.graphql,
        getFormattedGraphQLSchema(newPrintedGraphQLSchema)
      )
    }

    await generateTypes(cwd, newSystem)
    await generateAdminUI(newSystem.config, newSystem.adminMeta, paths.admin, true)

    let updatedApolloServer = lastApolloServer
    let updatedExpressServer = expressServer

    if (prismaClientModule && server && lastApolloServer) {
      const { context: newContext } = newSystem.getKeystone(prismaClientModule)
      const servers = await createExpressServer(newSystem.config, newContext)
      if (nextApp) {
        servers.expressServer.use(
          createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, nextApp)
        )
      }
      updatedExpressServer = servers.expressServer
      updatedApolloServer = servers.apolloServer
      await lastApolloServer.stop()
    }

    return {
      shouldStop: false,
      message: '',
      lastPrintedGraphQLSchema: newPrintedGraphQLSchema,
      lastApolloServer: updatedApolloServer,
      expressServer: updatedExpressServer,
    }
  } catch (err) {
    console.error(`Error loading your Keystone config`, err)
    return {
      shouldStop: false,
      message: '',
      lastPrintedGraphQLSchema,
      lastApolloServer,
      expressServer,
    }
  }
}
```