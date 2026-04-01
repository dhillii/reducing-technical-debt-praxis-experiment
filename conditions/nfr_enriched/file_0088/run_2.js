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

// Handles migration warnings and prompts user for confirmation
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

// Executes database schema migration with user prompts
async function executeDatabaseMigration(
  paths: any,
  system: any,
  generatedPrismaSchema: string,
  log: (msg: string) => void
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

  if (migration.warnings.length === 0 && migration.executedSteps === 0) {
    log(`✨ Database unchanged`)
  } else {
    log(`✨ Database synchronized with Prisma schema`)
  }
}

// Initializes Prisma artifacts and database
async function initializePrismaArtifacts(
  cwd: string,
  system: any,
  dbPush: boolean,
  log: (msg: string) => void
) {
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

    await executeDatabaseMigration(paths, system, generatedPrismaSchema, log)
  } else {
    log('⚠️ Skipping database schema push')
  }

  return paths
}

// Creates Keystone system and initializes server components
async function createKeystoneSystemAndServer(
  cwd: string,
  configWithExtendHttp: KeystoneConfig,
  prisma: boolean,
  server: boolean,
  log: (msg: string) => void,
  dbPush: boolean
) {
  const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

  if (prisma) {
    const paths = await initializePrismaArtifacts(cwd, system, dbPush, log)
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

  return { system }
}

// Validates configuration changes that require restart
function validateConfigurationChanges(
  originalPrismaSchema: string,
  newSystem: any,
  system: any,
  prisma: boolean
): string | null {
  if (prisma) {
    if (!originalPrismaSchema) throw new TypeError('Missing Prisma schema source')

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

// Updates GraphQL schema file if changed
async function updateGraphQLSchemaIfChanged(
  newPrintedGraphQLSchema: string,
  lastPrintedGraphQLSchema: string,
  paths: any
): Promise<boolean> {
  if (newPrintedGraphQLSchema !== lastPrintedGraphQLSchema) {
    await fsp.writeFile(
      paths.schema.graphql,
      getFormattedGraphQLSchema(newPrintedGraphQLSchema)
    )
    return true
  }
  return false
}

// Handles hot reload of Apollo server and express middleware
async function hotReloadApolloServer(
  server: boolean,
  lastApolloServer: any,
  newSystem: any,
  prismaClientModule: any,
  nextApp: any,
  config: any
): Promise<{ expressServer: any; apolloServer: any }> {
  if (server && lastApolloServer) {
    const { context: newContext } = newSystem.getKeystone(prismaClientModule)
    const servers = await createExpressServer(newSystem.config, newContext)
    if (nextApp) {
      servers.expressServer.use(
        createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, nextApp)
      )
    }
    await lastApolloServer.stop()
    return servers
  }
  return { expressServer: null, apolloServer: null }
}

// Resolves HTTP server listen options from config and environment
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

// Logs server startup information
function logServerStartup(httpOptions: ListenOptions, config: KeystoneConfig, log: (msg: string) => void) {
  const easyHost = [undefined, '', '::', '0.0.0.0'].includes(httpOptions.host)
    ? 'localhost'
    : httpOptions.host
  log(
    `⭐️ Server listening on ${httpOptions.host ?? ''}:${
      httpOptions.port
    } (http://${easyHost}:${httpOptions.port}/)`
  )
  log(`⭐️ GraphQL API available at ${config.graphql?.path ?? '/api/graphql'}`)
}

// Sets up dev status and fallback middleware
function setupDevMiddleware(
  app: express.Express,
  config: KeystoneConfig,
  isReady: () => boolean
) {
  app.use('/__keystone/dev/status', (req, res) => {
    res.status(isReady() ? 200 : 501).end()
  })

  app.use((req, res, next) => {
    const expressServer = (req as any).keystoneExpressServer
    const hasAddedAdminUIMiddleware = (req as any).keystoneHasAddedAdminUI

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
      await createKeystoneSystemAndServer(
        cwd,
        configWithExtendHttp,
        prisma,
        server,
        log,
        dbPush
      )

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
      expressServer.use(createAdminUIMiddlewareWithNextApp(system.config, context, next