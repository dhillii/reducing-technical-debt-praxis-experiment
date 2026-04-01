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

// Handles unexecutable migration steps and prompts user for database reset
async function handleUnexecutableMigrationSteps(
  migration_: any,
  m: any,
  generatedPrismaSchema: string
): Promise<any> {
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

// Handles migration warnings and prompts user for confirmation
async function handleMigrationWarnings(
  migration_: any,
  m: any,
  generatedPrismaSchema: string
): Promise<any> {
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

// Executes database schema migration with user prompts
async function executeDatabaseMigration(
  paths: any,
  system: any,
  generatedPrismaSchema: string,
  log: (msg: string) => void
): Promise<any> {
  return withMigrate(paths.schema.prisma, system, async m => {
    const migration_ = await m.schema(generatedPrismaSchema, false)

    if (migration_.unexecutable.length) {
      return handleUnexecutableMigrationSteps(migration_, m, generatedPrismaSchema)
    }

    if (migration_.warnings.length) {
      return handleMigrationWarnings(migration_, m, generatedPrismaSchema)
    }

    return migration_
  })
}

// Initializes Prisma schema and database
async function initializePrismaAndDatabase(
  cwd: string,
  system: any,
  dbPush: boolean,
  log: (msg: string) => void
): Promise<{ prismaClientModule: any; keystone: any } | null> {
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

    const migration = await executeDatabaseMigration(
      paths,
      system,
      generatedPrismaSchema,
      log
    )

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

  return { prismaClientModule, keystone }
}

// Creates express server and returns apollo server
async function createServerIfNeeded(
  system: any,
  prismaClientModule: any,
  log: (msg: string) => void
): Promise<{ apolloServer: any; expressServer: any } | null> {
  log('✨ Creating server')
  const keystone = system.getKeystone(prismaClientModule)
  const { apolloServer, expressServer } = await createExpressServer(
    system.config,
    keystone.context
  )
  log(`✅ GraphQL API ready`)
  return { apolloServer, expressServer }
}

// Initializes Admin UI if enabled
async function initializeAdminUI(
  system: any,
  cwd: string,
  expressServer: any,
  context: any,
  log: (msg: string) => void
): Promise<any> {
  if (system.config.ui?.isDisabled) {
    return null
  }

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

// Checks if Prisma schema has changed
function hasPrismaSchemaChanged(
  originalSchema: string,
  newSystem: any
): boolean {
  const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
  return originalSchema !== newPrismaSchema
}

// Checks if database configuration has changed
function hasDatabaseConfigChanged(system: any, newSystem: any): boolean {
  return (
    JSON.stringify(newSystem.config.db.enableLogging) !==
      JSON.stringify(system.config.db.enableLogging) ||
    newSystem.config.db.url !== system.config.db.url
  )
}

// Updates GraphQL schema file if changed
async function updateGraphQLSchemaIfChanged(
  cwd: string,
  newSystem: any,
  lastPrintedGraphQLSchema: string
): Promise<string> {
  const paths = newSystem.getPaths(cwd)
  const newPrintedGraphQLSchema = printSchema(newSystem.graphql.schemas.public)

  if (newPrintedGraphQLSchema !== lastPrintedGraphQLSchema) {
    await fsp.writeFile(
      paths.schema.graphql,
      getFormattedGraphQLSchema(newPrintedGraphQLSchema)
    )
    return newPrintedGraphQLSchema
  }

  return lastPrintedGraphQLSchema
}

// Handles build result and updates system state
async function handleBuildResult(
  buildResult: BuildResult,
  cwd: string,
  system: any,
  newSystem: any,
  prisma: boolean,
  originalPrismaSchema: string,
  lastPrintedGraphQLSchema: string,
  prismaClientModule: any,
  server: boolean,
  lastApolloServer: any,
  nextApp: any,
  log: (msg: string) => void,
  stop: (httpServer: any, msg: string) => Promise<void>
): Promise<{ lastPrintedGraphQLSchema: string; lastApolloServer: any; expressServer: any }> {
  if (buildResult.errors.length) {
    return { lastPrintedGraphQLSchema, lastApolloServer, expressServer: null }
  }

  log('compiled successfully')

  try {
    const paths = newSystem.getPaths(cwd)

    // wipe the require cache
    const resolved = require.resolve(paths.config)
    delete require.cache[resolved]

    const newConfigWithHttp = await importBuiltKeystoneConfiguration(cwd)
    const freshSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

    if (prisma) {
      if (!originalPrismaSchema) throw new TypeError('Missing Prisma schema source')

      if (hasPrismaSchemaChanged(originalPrismaSchema, freshSystem)) {
        await stop(null, '🔄 Your prisma schema has changed, please restart Keystone')
      }

      if (hasDatabaseConfigChanged(system, freshSystem)) {
        await stop(null, 'Your database configuration has changed, please restart Keystone')
      }
    }

    const updatedGraphQLSchema = await updateGraphQLSchemaIfChanged(
      cwd,
      freshSystem,
      lastPrintedGraphQLSchema
    )

    await generateTypes(cwd, freshSystem)
    await generateAdminUI(freshSystem.config, freshSystem.adminMeta, paths.admin, true)

    let updatedApolloServer = lastApolloServer
    let updatedExpressServer: any = null

    if (prismaClientModule && server && lastApolloServer) {
      const { context: newContext } = freshSystem.getKeystone(prismaClientModule)
      const servers = await createExpressServer(freshSystem.config, newContext)
      if (nextApp) {
        servers.expressServer.use(
          createAdminUIMiddlewareWithNextApp(freshSystem.config, newContext, nextApp)
        )
      }
      updatedExpressServer = servers.expressServer
      const prevApolloServer = lastApolloServer
      updatedApolloServer = servers.apolloServer
      await prevApolloServer.stop()
    }

    return {
      lastPrintedGraphQLSchema: updatedGraphQLSchema,
      lastApolloServer: updatedApolloServer,
      expressServer: updatedExpressServer,
    }
  } catch (err) {
    console.error(`Error loading your Keystone config`, err)
    return { lastPrintedGraphQLSchema, lastApolloServer, expressServer: null }
  }
}

// Configures HTTP server options from config and environment
function configureHttpOptions(config: any): ListenOptions {
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

  return httpOptions
}

// Sets up dev status and fallback middleware
function setupDevMiddleware(
  app: express.Express,
  config: any,
  isReady: () => boolean,
  expressServer: any,
  hasAddedAdminUIMiddleware: boolean
): void {
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
            console.error('