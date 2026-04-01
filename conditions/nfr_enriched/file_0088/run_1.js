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

// Handles unexecutable migration steps with user confirmation
async function handleUnexecutableMigrationSteps(
  migration_: any,
  m: any,
  generatedPrismaSchema: string
) {
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

// Handles migration warnings with user confirmation
async function handleMigrationWarnings(
  migration_: any,
  m: any,
  generatedPrismaSchema: string
) {
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

// Executes database schema migration with proper error handling
async function executeDatabaseMigration(
  paths: any,
  system: any,
  generatedPrismaSchema: string
) {
  const migration = await withMigrate(paths.schema.prisma, system, async m => {
    const migration_ = await m.schema(generatedPrismaSchema, false)

    if (migration_.unexecutable.length) {
      return handleUnexecutableMigrationSteps(migration_, m, generatedPrismaSchema)
    }

    if (migration_.warnings.length) {
      return handleMigrationWarnings(migration_, m, generatedPrismaSchema)
    }

    return migration_
  })

  return migration
}

// Initializes Prisma schema and database
async function initializePrismaAndDatabase(
  cwd: string,
  system: any,
  prisma: boolean,
  dbPush: boolean,
  log: (msg: string) => void
) {
  if (!prisma) return null

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

    const migration = await executeDatabaseMigration(paths, system, generatedPrismaSchema)

    if (migration.warnings.length === 0 && migration.executedSteps === 0) {
      log(`✨ Database unchanged`)
    } else {
      log(`✨ Database synchronized with Prisma schema`)
    }
  } else {
    log('⚠️ Skipping database schema push')
  }

  return paths
}

// Initializes Keystone system and returns configuration
async function initializeKeystoneSystem(
  cwd: string,
  configWithExtendHttp: KeystoneConfig,
  prisma: boolean,
  server: boolean,
  paths: any,
  log: (msg: string) => void
) {
  const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

  if (!prisma) {
    return { system }
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

// Initializes Admin UI if enabled
async function initializeAdminUI(
  system: any,
  ui: boolean,
  cwd: string,
  expressServer: express.Express,
  context: any,
  log: (msg: string) => void
) {
  if (system.config.ui?.isDisabled || !ui) {
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

// Validates configuration changes between builds
function validateConfigurationChanges(
  originalPrismaSchema: string,
  newSystem: any,
  system: any,
  prisma: boolean
): string | null {
  if (prisma) {
    if (!originalPrismaSchema) {
      throw new TypeError('Missing Prisma schema source')
    }

    const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
    if (originalPrismaSchema !== newPrismaSchema) {
      return '🔄 Your prisma schema has changed, please restart Keystone'
    }

    if (
      JSON.stringify(newSystem.config.db.enableLogging) !==
        JSON.stringify(system.config.db.enableLogging) ||
      newSystem.config.db.url !== system.config.db.url
    ) {
      return 'Your database configuration has changed, please restart Keystone'
    }
  }

  return null
}

// Updates GraphQL schema if changed
async function updateGraphQLSchemaIfChanged(
  newSystem: any,
  lastPrintedGraphQLSchema: string,
  cwd: string
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

// Updates Apollo server and Express server on rebuild
async function updateServers(
  newSystem: any,
  prismaClientModule: any,
  server: boolean,
  lastApolloServer: any,
  nextApp: any,
  cwd: string
): Promise<{ expressServer: express.Express; apolloServer: any }> {
  if (!server || !lastApolloServer) {
    return { expressServer: null as any, apolloServer: lastApolloServer }
  }

  const { context: newContext } = newSystem.getKeystone(prismaClientModule)
  const servers = await createExpressServer(newSystem.config, newContext)

  if (nextApp) {
    servers.expressServer.use(
      createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, nextApp)
    )
  }

  const prevApolloServer = lastApolloServer
  await prevApolloServer.stop()

  return servers
}

// Handles build result processing
async function processBuildResult(
  buildResult: BuildResult,
  cwd: string,
  system: any,
  originalPrismaSchema: string,
  prisma: boolean,
  server: boolean,
  prismaClientModule: any,
  lastApolloServer: any,
  nextApp: any,
  log: (msg: string) => void
): Promise<{
  lastPrintedGraphQLSchema: string
  lastApolloServer: any
  shouldStop: boolean
  stopMessage: string
}> {
  if (buildResult.errors.length) {
    return {
      lastPrintedGraphQLSchema: '',
      lastApolloServer,
      shouldStop: false,
      stopMessage: '',
    }
  }

  log('compiled successfully')

  try {
    const paths = system.getPaths(cwd)

    // wipe the require cache
    const resolved = require.resolve(paths.config)
    delete require.cache[resolved]

    const newConfigWithHttp = await importBuiltKeystoneConfiguration(cwd)
    const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

    const validationError = validateConfigurationChanges(
      originalPrismaSchema,
      newSystem,
      system,
      prisma
    )
    if (validationError) {
      return {
        lastPrintedGraphQLSchema: '',
        lastApolloServer,
        shouldStop: true,
        stopMessage: validationError,
      }
    }

    const lastPrintedGraphQLSchema = await updateGraphQLSchemaIfChanged(newSystem, '', cwd)
    await generateTypes(cwd, newSystem)
    await generateAdminUI(newSystem.config, newSystem.adminMeta, paths.admin, true)

    let updatedApolloServer = lastApolloServer
    if (prismaClientModule) {
      const servers = await updateServers(
        newSystem,
        prismaClientModule,
        server,
        lastApolloServer,
        nextApp,
        cwd
      )
      updatedApolloServer = servers.apolloServer
    }

    return {
      lastPrintedGraphQLSchema,
      lastApolloServer: updatedApolloServer,
      shouldStop: false,
      stopMessage: '',
    }
  } catch (err) {
    console.error(`Error loading your Keystone config`, err)
    return {
      lastPrintedGraphQLSchema: '',
      lastApolloServer,
      shouldStop: false,
      stopMessage: '',
    }
  }
}

// Resolves HTTP server listen options from configuration
function resolveHttpListenOptions(config: KeystoneConfig): ListenOptions {
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

// Creates dev status and fallback middleware
function createDevMiddleware(
  config: KeystoneConfig,
  isReady: () => boolean,
  expressServer: express.Express | null
) {
  return (req: any, res: any, next: any) => {
    if (req.path === '/__keystone/dev/status') {
      res.status(isReady() ? 200 : 501).end()
      return
    }

    if (expressServer && req.path !== '/__keystone/dev/status') {
      return expressServer(req, res, next)
    }

    const { pathname } = new URL(req.url, 'http://ks')
    if (expressServer && pathname === (config.graphql?.path ?? '/api/graphql')) {
      return expressServer(req, res, next)
    }

    res.sendFile(devLoadingHTMLFilepath)
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
    ...esbuild