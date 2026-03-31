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

interface DevState {
  prismaClient: any
  expressServer: express.Express | null
  hasAddedAdminUIMiddleware: boolean
  nextApp: any
  lastPrintedGraphQLSchema: string
  lastApolloServer: any
  originalPrismaSchema: string
}

interface BuildIterator {
  [Symbol.asyncIterator](): AsyncIterator<BuildResult>
}

function stripExtendHttpServer(config: KeystoneConfig): KeystoneConfig {
  const { server, ...rest } = config
  const { extendHttpServer, ...restServer } = server || {}
  return {
    ...rest,
    server: {
      ...restServer,
      extendHttpServer: async () => {},
    },
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

function createBuildIterator() {
  let lastPromise = createResolvablePromise<IteratorResult<BuildResult>>()

  const iterator: BuildIterator = {
    [Symbol.asyncIterator]: () => ({ next: () => lastPromise }),
  }

  const addBuildResult = (build: BuildResult) => {
    const prev = lastPromise
    lastPromise = createResolvablePromise()
    prev.resolve({ value: build, done: false })
  }

  return { iterator, addBuildResult }
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
  state: DevState,
  exitMessage: string = ''
): Promise<void> {
  await esbuildContext.dispose()
  await closeHttpServer(httpServer)

  try {
    await state.prismaClient?.disconnect?.()
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
  config: KeystoneConfig,
  dbPush: boolean,
  prisma: boolean,
  log: (msg: string) => void,
  server: boolean
) {
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

async function setupAdminUI(
  system: any,
  context: any,
  expressServer: express.Express,
  cwd: string,
  log: (msg: string) => void
): Promise<any> {
  if (system.config.ui?.isDisabled) return null

  if (!expressServer || !context) {
    throw new TypeError('Error trying to prepare the Admin UI')
  }

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

function getListenOptions(config: KeystoneConfig): ListenOptions {
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

function logServerReady(options: ListenOptions, config: KeystoneConfig, log: (msg: string) => void): void {
  const easyHost = [undefined, '', '::', '0.0.0.0'].includes(options.host)
    ? 'localhost'
    : options.host
  log(
    `⭐️ Server listening on ${options.host ?? ''}:${options.port} (http://${easyHost}:${options.port}/)`
  )
  log(`⭐️ GraphQL API available at ${config.graphql?.path ?? '/api/graphql'}`)
}

async function handleBuildUpdate(
  buildResult: BuildResult,
  cwd: string,
  system: any,
  state: DevState,
  config: KeystoneConfig,
  prisma: boolean,
  server: boolean,
  log: (msg: string) => void,
  stopFn: (msg: string) => Promise<void>
): Promise<void> {
  if (buildResult.errors.length) return

  log('compiled successfully')

  try {
    const paths = system.getPaths(cwd)
    const resolved = require.resolve(paths.config)
    delete require.cache[resolved]

    const newConfigWithHttp = await importBuiltKeystoneConfiguration(cwd)
    const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

    if (prisma) {
      if (!state.originalPrismaSchema) throw new TypeError('Missing Prisma schema source')

      const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
      if (state.originalPrismaSchema !== newPrismaSchema) {
        return stopFn('🔄 Your prisma schema has changed, please restart Keystone')
      }

      if (
        JSON.stringify(newSystem.config.db.enableLogging) !==
          JSON.stringify(system.config.db.enableLogging) ||
        newSystem.config.db.url !== system.config.db.url
      ) {
        return stopFn('Your database configuration has changed, please restart Keystone')
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

    if (state.prismaClient && server && state.lastApolloServer) {
      const { context: newContext } = newSystem.getKeystone(state.prismaClient)
      const servers = await createExpressServer(newSystem.config, newContext)
      if (state.nextApp) {
        servers.expressServer.use(
          createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, state.nextApp)
        )
      }
      state.expressServer = servers.expressServer
      const prevApolloServer = state.lastApolloServer
      state.lastApolloServer = servers.apolloServer
      await prevApolloServer.stop()
    }
  } catch (err) {
    console.error(`Error loading your Keystone config`, err)
  }
}

export async function dev(
  cwd: string,
  { dbPush, prisma, quiet, server, ui }: Pick<Flags, 'dbPush' | 'prisma' | 'quiet' | 'server' | 'ui'>
) {
  const log = createLogger(quiet)
  log('✨ Starting Keystone')

  const { iterator: builds, addBuildResult } = createBuildIterator()
  const esbuildContext = await setupEsbuild(cwd, addBuildResult)

  const state: DevState = {
    prismaClient: null,
    expressServer: null,
    hasAddedAdminUIMiddleware: false,
    nextApp: null,
    lastPrintedGraphQLSchema: '',
    lastApolloServer: null,
    originalPrismaSchema: '',
  }

  const app = server ? express() : null
  const httpServer = app ? createServer(app) : null
  const isReady = () => !server || (state.expressServer !== null && state.hasAddedAdminUIMiddleware)

  let initKeystonePromiseResolve: (() => void) | undefined
  let initKeystonePromiseReject: ((err: any) => void) | undefined
  const initKeystonePromise = new Promise<void>((resolve, reject) => {
    initKeystonePromiseResolve = resolve
    initKeystonePromiseReject = reject
  })

  const stopFn = async (exitMessage: string = '') => {
    await stopServer(esbuildContext, httpServer, state, exitMessage)
  }

  const initKeystone = async () => {
    const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
    const strippedConfig = stripExtendHttpServer(configWithExtendHttp)
    const system = createSystem(strippedConfig)

    const result = await initializePrismaAndServer(
      cwd,
      system,
      configWithExtendHttp,
      dbPush,
      prisma,
      log,
      server
    )

    const {