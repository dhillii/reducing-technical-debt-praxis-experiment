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

/** Log migration unexecutable steps */
function logMigrationUnexecutableSteps(migration_: any): void {
  console.error(`${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`)
  for (const item of migration_.unexecutable) {
    console.error(`  • ${item}`)
  }
}

/** Log migration warnings */
function logMigrationWarnings(migration_: any): void {
  console.error(chalk.bold(`\n⚠️  Warnings:\n`))
  for (const warning of migration_.warnings) {
    console.error(`  • ${warning}`)
  }
}

/** Handle migration with unexecutable steps */
async function handleUnexecutableMigration(
  migration_: any,
  m: any,
  generatedPrismaSchema: string
): Promise<any> {
  logMigrationUnexecutableSteps(migration_)

  if (hasMigrationWarnings(migration_)) {
    logMigrationWarnings(migration_)
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

/** Handle migration with warnings only */
async function handleMigrationWithWarnings(
  migration_: any,
  m: any,
  generatedPrismaSchema: string
): Promise<any> {
  logMigrationWarnings(migration_)

  const shouldContinue = await confirmPrompt(
    `Do you want to continue? ${chalk.red('Some data will be lost')}`,
    false
  )

  if (!shouldContinue) {
    throw new ExitError(1, 'Database push cancelled by user')
  }

  return m.schema(generatedPrismaSchema, true)
}

/** Process migration result and handle user confirmations */
async function processMigrationResult(
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

/** Check if database configuration has changed */
function hasDatabaseConfigChanged(newSystem: any, system: any): boolean {
  return (
    JSON.stringify(newSystem.config.db.enableLogging) !==
      JSON.stringify(system.config.db.enableLogging) ||
    newSystem.config.db.url !== system.config.db.url
  )
}

/** Check if Prisma schema has changed */
function hasPrismaSchemaChanged(
  originalPrismaSchema: string,
  newPrismaSchema: string
): boolean {
  return originalPrismaSchema !== newPrismaSchema
}

/** Check if GraphQL schema has changed */
function hasGraphQLSchemaChanged(
  newPrintedGraphQLSchema: string,
  lastPrintedGraphQLSchema: string
): boolean {
  return newPrintedGraphQLSchema !== lastPrintedGraphQLSchema
}

/** Check if server should update Apollo server */
function shouldUpdateApolloServer(server: boolean, lastApolloServer: any): boolean {
  return server && lastApolloServer !== null
}

/** Check if UI is enabled */
function isUIEnabled(system: any, ui: boolean): boolean {
  return !system.config.ui?.isDisabled && ui
}

/** Check if port is configured in server options */
function isPortInServerConfig(config: any): boolean {
  return config?.server && 'port' in config.server && typeof config.server?.port === 'number'
}

/** Check if server options are configured */
function hasServerOptions(config: any): boolean {
  return config?.server && 'options' in config.server && config.server.options
}

/** Check if PORT environment variable is set */
function isPortEnvSet(): boolean {
  return 'PORT' in process.env
}

/** Check if HOST environment variable is set */
function isHostEnvSet(): boolean {
  return 'HOST' in process.env
}

/** Check if host should be displayed as localhost */
function shouldDisplayAsLocalhost(host: string | undefined): boolean {
  return [undefined, '', '::', '0.0.0.0'].includes(host)
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
          await handleDatabasePush(
            system,
            paths,
            generatedPrismaSchema,
            log
          )
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
    if (isUIEnabled(system, ui)) {
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
      try {
        await handleBuildResult(
          cwd,
          system,
          originalPrismaSchema,
          lastPrintedGraphQLSchema,
          lastApolloServer,
          nextApp,
          prismaClientModule,
          prisma,
          server,
          log,
          stop
        )
      } catch (err) {
        console.error(`Error loading your Keystone config`, err)
      }
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

  if (isPortInServerConfig(config)) {
    httpOptions.port = config.server.port
  }

  if (hasServerOptions(config)) {
    Object.assign(httpOptions, config.server.options)
  }

  if (isPortEnvSet()) {
    httpOptions.port = parseInt(process.env.PORT ?? '')
  }

  if (isHostEnvSet()) {
    httpOptions.host = process.env.HOST ?? ''
  }

  const server = httpServer.listen(httpOptions, (err?: any) => {
    if (err) throw err

    const easyHost = shouldDisplayAsLocalhost(httpOptions.host)
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