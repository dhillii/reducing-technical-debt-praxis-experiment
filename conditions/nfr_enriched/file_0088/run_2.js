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

interface DevContext {
  system: any
  context: any
  prismaClientModule: any
  apolloServer: any
  expressServer: express.Express | null
}

interface BuildQueue {
  [Symbol.asyncIterator](): AsyncIterator<BuildResult>
}

interface ServerState {
  prismaClient: any
  expressServer: express.Express | null
  hasAddedAdminUIMiddleware: boolean
  nextApp: any
}

function stripExtendHttpServer(config: KeystoneConfig): KeystoneConfig {
  const { server, ...rest } = config
  if (!server) return config
  const { extendHttpServer, ...restServer } = server
  return {
    ...rest,
    server: restServer,
  }
}

function createResolvablePromise<T>() {
  let resolve!: (value: T) => void
  const promise: any = new Promise<T>(r => {
    resolve = r
  })
  promise.resolve = resolve
  return promise
}

function createBuildQueue(): { queue: BuildQueue; addResult: (build: BuildResult) => void } {
  let lastPromise = createResolvablePromise<IteratorResult<BuildResult>>()

  const queue: BuildQueue = {
    [Symbol.asyncIterator]: () => ({ next: () => lastPromise }),
  }

  const addResult = (build: BuildResult) => {
    const prev = lastPromise
    lastPromise = createResolvablePromise()
    prev.resolve({ value: build, done: false })
  }

  return { queue, addResult }
}

async function setupEsbuild(cwd: string, addBuildResult: (build: BuildResult) => void) {
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
  } catch {
    // esbuild prints everything we want users to see
  }

  esbuildContext.watch()
  return esbuildContext
}

async function closeHttpServer(httpServer: any): Promise<void> {
  if (!httpServer) return
  return new Promise((resolve, reject) => {
    httpServer.close((err: any) => {
      if (err) {
        console.error('Error closing the server', err)
        return reject(err)
      }
      resolve(undefined)
    })
  })
}

async function stopServer(
  esbuildContext: any,
  httpServer: any,
  prismaClient: any,
  exitMessage: string = ''
): Promise<void> {
  await esbuildContext.dispose()

  try {
    await closeHttpServer(httpServer)
  } catch (err) {
    console.error('Error closing HTTP server', err)
  }

  try {
    await prismaClient?.disconnect?.()
  } catch (err) {
    console.error('Error disconnecting from the database', err)
    throw err
  }

  if (exitMessage) throw new ExitError(1, exitMessage)
}

function createLogger(quiet: boolean) {
  return (message: string) => {
    if (!quiet) console.log(message)
  }
}

async function handleDatabaseMigration(
  paths: any,
  system: any,
  generatedPrismaSchema: string,
  log: (msg: string) => void
): Promise<void> {
  const created = await createDatabase(system.config.db.url, path.dirname(paths.schema.prisma))
  if (created) log(`✨ Database created`)

  const migration = await withMigrate(paths.schema.prisma, system, async m => {
    const migration_ = await m.schema(generatedPrismaSchema, false)

    if (migration_.unexecutable.length) {
      printMigrationErrors(migration_.unexecutable, migration_.warnings)
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
      printMigrationWarnings(migration_.warnings)
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
}

function printMigrationErrors(errors: string[], warnings: string[]): void {
  console.error(`${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`)
  for (const item of errors) {
    console.error(`  • ${item}`)
  }
  printMigrationWarnings(warnings)
  console.error('\nTo apply this migration, we need to reset the database')
}

function printMigrationWarnings(warnings: string[]): void {
  if (warnings.length) {
    console.error(chalk.bold(`\n⚠️  Warnings:\n`))
    for (const warning of warnings) {
      console.error(`  • ${warning}`)
    }
  }
}

async function initializePrismaAndServer(
  cwd: string,
  system: any,
  prisma: boolean,
  dbPush: boolean,
  server: boolean,
  log: (msg: string) => void
): Promise<Partial<DevContext>> {
  if (!prisma) {
    return { system }
  }

  log('✨ Generating GraphQL and Prisma schemas')
  const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
  await generateTypes(cwd, system)
  await generatePrismaClient(cwd, system)

  const paths = system.getPaths(cwd)

  if (dbPush) {
    await handleDatabaseMigration(paths, system, generatedPrismaSchema, log)
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
}

function getHttpOptions(config: KeystoneConfig): ListenOptions {
  const options: ListenOptions = { port: 3000 }

  if (config?.server && 'port' in config.server && typeof config.server?.port === 'number') {
    options.port = config.server.port
  }

  if (config?.server && 'options' in config.server && config.server.options) {
    Object.assign(options, config.server.options)
  }

  if ('PORT' in process.env) {
    options.port = parseInt(process.env.PORT ?? '')
  }

  if ('HOST' in process.env) {
    options.host = process.env.HOST ?? ''
  }

  return options
}

function getDisplayHost(host: string | undefined): string {
  return [undefined, '', '::', '0.0.0.0'].includes(host) ? 'localhost' : host ?? 'localhost'
}

function setupDevStatusEndpoint(
  app: express.Express,
  isReady: () => boolean,
  expressServer: express.Express | null,
  config: KeystoneConfig
): void {
  app.use('/__keystone/dev/status', (req, res) => {
    res.status(isReady() ? 200 : 501).end()
  })

  app.use((req, res, next) => {
    if (expressServer) {
      return expressServer(req, res, next)
    }

    const { pathname } = new URL(req.url, 'http://ks')
    if (pathname === (config.graphql?.path ?? '/api/graphql')) {
      return expressServer?.(req, res, next)
    }

    res.sendFile(devLoadingHTMLFilepath)
  })
}

async function initializeAdminUI(
  system: any,
  expressServer: express.Express,
  context: any,
  cwd: string,
  log: (msg: string) => void
): Promise<any> {
  if (system.config.ui?.isDisabled) return null

  log('✨ Generating Admin UI code')
  const paths = system.getPaths(cwd)
  await fsp.rm(paths.admin, { recursive: true, force: true })
  await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

  log('✨ Preparing Admin UI')
  const nextApp = next({ dev: true, dir: paths.admin })
  await nextApp.prepare()
  expressServer.use(createAdminUIMiddlewareWithNextApp(system.config, context, nextApp))
  log(`✅ Admin UI ready`)

  return nextApp
}

async function handleBuildUpdate(
  buildResult: BuildResult,
  cwd: string,
  system: any,
  prisma: boolean,
  prismaClientModule: any,
  server: boolean,
  nextApp: any,
  state: { lastApolloServer: any; lastPrintedGraphQLSchema: string },
  log: (msg: string) => void
): Promise<{ shouldStop: boolean; message?: string; newSystem?: any }> {
  if (buildResult.errors.length) {
    return { shouldStop: false }
  }

  log('compiled successfully')

  try {
    const paths = system.getPaths(cwd)
    const resolved = require.resolve(paths.config)
    delete require.cache[resolved]

    const newConfigWithHttp = await importBuiltKeystoneConfiguration(cwd)
    const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

    if (prisma) {
      const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
      const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)

      if (originalPrismaSchema !== newPrismaSchema) {
        return {
          shouldStop: true,
          message: '🔄 Your prisma schema has changed, please restart Keystone',
        }
      }

      if (
        JSON.stringify(newSystem.config.db.enableLogging) !==
          JSON.stringify(system.config.db.enableLogging) ||
        newSystem.config.db.url !== system.config.db.url
      ) {
        return {
          shouldStop: true,
          message: 'Your database configuration has changed, please restart Keystone',
        }
      }
    }

    const newPrintedGraphQLSchema = printSchema(newSystem.graphql.schemas.public)
    if (newPrintedGraphQLSchema !== state.lastPrintedGraphQLSchema) {
      const paths = newSystem.getPaths(cwd)
      await fsp.writeFile(
        paths.schema.graphql,
        getFormattedGraphQLSchema(newPrintedGraphQLSchema)
      )
      state.lastPrintedGraphQLSchema = newPrintedGraphQLSchema
    }

    await generateTypes(cwd, newSystem)
    const paths2 = newSystem.getPaths(cwd)
    await generateAdminUI(newSystem.config, newSystem.adminMeta, paths2.admin, true)

    if (prismaClientModule && server && state.lastApolloServer) {
      const { context: newContext } = newSystem.getKeystone(prismaClientModule)
      const servers = await createExpressServer(newSystem.config, newContext)
      if (nextApp) {
        servers.expressServer.use(
          createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, nextApp)
        )
      }
      const prevApolloServer = state.lastApolloServer
      state.lastApolloServer = servers.apolloServer
      await prevApolloServer.stop()
    }

    return { shouldStop: false, newSystem }
  } catch (err) {
    console.error(`Error loading your Keystone config`, err)
    return { shouldStop: false }
  }
}

export async function dev(
  cwd: string,
  { dbPush, prisma, quiet, server, ui }: Pick<Flags, 'dbPush' | 'prisma' | 'quiet' | 'server' | 'ui'>
) {
  const log = createLogger(quiet)
  log('✨ Starting Keystone')

  const { queue: builds, addResult: addBuildResult } = createBuildQueue()
  const esbuildContext = await setupEsbuild(cwd, addBuildResult)

  const serverState: ServerState = {
    prismaClient: null,
    expressServer: null,
    hasAddedAdminUIMiddleware: false,
    nextApp: null,
  }

  const isReady = () => !server || (serverState.expressServer !== null && serverState.hasAddedAdminUIMiddleware)

  let initKeystonePromiseResolve: (() => void) | undefined
  let initKeystonePromiseReject: ((err: any) => void) | undefined
  const initKeystonePromise = new Promise<void>((resolve, reject) => {
    initKeystonePromiseResolve = resolve
    initKeystonePromiseReject = reject
  })

  const app = server