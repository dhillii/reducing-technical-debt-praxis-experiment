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

/**
 * Creates a promise that can be resolved externally.
 */
function resolvablePromise<T>() {
  let _resolve!: (value: T) => void
  const promise: any = new Promise<T>(resolve => {
    _resolve = resolve
  })
  promise.resolve = _resolve
  return promise
}

/**
 * Determines whether the server is ready to serve requests.
 */
function isServerReady(
  serverEnabled: boolean,
  expressServer: express.Express | null,
  adminUIMiddlewareAdded: boolean
): boolean {
  return !serverEnabled || (expressServer !== null && adminUIMiddlewareAdded)
}

/**
 * Checks if a migration contains unexecutable steps.
 */
function hasUnexecutableSteps(migration: any): boolean {
  return migration.unexecutable && migration.unexecutable.length > 0
}

/**
 * Checks if a migration contains warnings.
 */
function hasWarnings(migration: any): boolean {
  return migration.warnings && migration.warnings.length > 0
}

/**
 * Determines whether the Prisma schema has changed.
 */
function prismaSchemaChanged(
  original: string | undefined,
  current: string | undefined
): boolean {
  return original !== undefined && current !== undefined && original !== current
}

/**
 * Determines whether the database configuration has changed.
 */
function dbConfigChanged(
  oldConfig: any,
  newConfig: any
): boolean {
  const oldLogging = JSON.stringify(oldConfig.db.enableLogging)
  const newLogging = JSON.stringify(newConfig.db.enableLogging)
  return oldLogging !== newLogging || oldConfig.db.url !== newConfig.db.url
}

/**
 * Determines whether a build result contains errors.
 */
function hasBuildErrors(buildResult: BuildResult): boolean {
  return buildResult.errors.length > 0
}

/**
 * Returns the effective host for logging.
 */
function getEasyHost(host: string | undefined): string {
  const defaultHosts = [undefined, '', '::', '0.0.0.0']
  return defaultHosts.includes(host) ? 'localhost' : (host as string)
}

/**
 * Handles the first esbuild build and registers the result.
 */
async function handleFirstBuild(
  esbuildContext: any,
  addBuildResult: (build: BuildResult) => void
) {
  try {
    const firstBuild = await esbuildContext.rebuild()
    addBuildResult(firstBuild)
  } catch {
    // esbuild already prints errors
  }
}

/**
 * Executes the migration flow, prompting the user when necessary.
 */
async function runMigration(
  migrationFn: (force: boolean) => Promise<any>,
  generatedPrismaSchema: string,
  confirmPromptFn: typeof confirmPrompt
) {
  const migration = await migrationFn(generatedPrismaSchema, false)

  if (hasUnexecutableSteps(migration)) {
    console.error(`${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`)
    for (const item of migration.unexecutable) {
      console.error(`  • ${item}`)
    }

    if (hasWarnings(migration)) {
      console.error(chalk.bold(`\n⚠️  Warnings:\n`))
      for (const warning of migration.warnings) {
        console.error(`  • ${warning}`)
      }
    }

    console.error('\nTo apply this migration, we need to reset the database')
    const shouldReset = await confirmPromptFn(
      `Do you want to continue? ${chalk.red('The database will be reset')}`,
      false
    )
    if (!shouldReset) {
      throw new ExitError(1, 'Database reset cancelled by user')
    }

    await migration.reset()
    return migrationFn(generatedPrismaSchema, false)
  }

  if (hasWarnings(migration)) {
    console.error(chalk.bold(`\n⚠️  Warnings:\n`))
    for (const warning of migration.warnings) {
      console.error(`  • ${warning}`)
    }

    const shouldContinue = await confirmPromptFn(
      `Do you want to continue? ${chalk.red('Some data will be lost')}`,
      false
    )
    if (!shouldContinue) {
      throw new ExitError(1, 'Database push cancelled by user')
    }

    return migrationFn(generatedPrismaSchema, true)
  }

  return migration
}

/**
 * Processes a single build result, handling schema changes and UI regeneration.
 */
async function processBuildResult(
  buildResult: BuildResult,
  system: any,
  cwd: string,
  prisma: boolean,
  prismaClientModule: any,
  serverEnabled: boolean,
  nextApp: any,
  expressServerRef: { current: express.Express | null },
  apolloServerRef: { current: any },
  originalPrismaSchema: string | undefined,
  lastPrintedGraphQLSchemaRef: { current: string },
  lastApolloServerRef: { current: any }
) {
  if (hasBuildErrors(buildResult)) {
    return
  }

  const paths = system.getPaths(cwd)

  // Clear require cache for config
  const resolved = require.resolve(paths.config)
  delete require.cache[resolved]

  const newConfig = await importBuiltKeystoneConfiguration(cwd)
  const newSystem = createSystem(stripExtendHttpServer(newConfig))

  if (prisma) {
    if (!originalPrismaSchema) {
      throw new TypeError('Missing Prisma schema source')
    }

    const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
    if (prismaSchemaChanged(originalPrismaSchema, newPrismaSchema)) {
      throw new ExitError(1, '🔄 Your prisma schema has changed, please restart Keystone')
    }

    if (dbConfigChanged(system.config, newSystem.config)) {
      throw new ExitError(1, 'Your database configuration has changed, please restart Keystone')
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

  if (prismaClientModule && serverEnabled && lastApolloServerRef.current) {
    const { context: newContext } = newSystem.getKeystone(prismaClientModule)
    const servers = await createExpressServer(newSystem.config, newContext)

    if (nextApp) {
      servers.expressServer.use(
        createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, nextApp)
      )
    }

    expressServerRef.current = servers.expressServer
    const previousApollo = lastApolloServerRef.current
    lastApolloServerRef.current = servers.apolloServer
    await previousApollo.stop()
  }
}

/**
 * Main development server entry point.
 */
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
          // TODO: no any
          build.onEnd(addBuildResult)
        },
      },
    ],
  })

  await handleFirstBuild(esbuildContext, addBuildResult)
  esbuildContext.watch()

  let prismaClient: any = null

  async function stop(aHttpServer: any, exitMessage: string = '') {
    await esbuildContext.dispose()

    if (aHttpServer) {
      await new Promise((resolve, reject) => {
        aHttpServer.close((err: any) => {
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
  const isReady = () => isServerReady(!!server, expressServer, hasAddedAdminUIMiddleware)

  async function initKeystone() {
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
          if (created) log('✨ Database created')

          const migration = await withMigrate(paths.schema.prisma, system, async m => {
            return runMigration(m.schema.bind(m), generatedPrismaSchema, confirmPrompt)
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
        log('✅ GraphQL API ready')

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

    let nextApp: any
    if (!system.config.ui?.isDisabled && ui) {
      if (!expressServer || !context) {
        throw new TypeError('Error trying to prepare the Admin UI')
      }

      log('✨ Generating Admin UI code')
      const paths = system.getPaths(cwd)
      await fsp.rm(paths.admin, { recursive: true, force: true })
      await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

      log('✨ Preparing Admin UI')
      nextApp = next({ dev: true, dir: paths.admin })
      await nextApp.prepare()
      expressServer.use(
        createAdminUIMiddlewareWithNextApp(system.config, context, nextApp)
      )
      log('✅ Admin UI ready')
    }

    hasAddedAdminUIMiddleware = true
    initKeystonePromiseResolve()

    const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
    const lastPrintedGraphQLSchemaRef = { current: printSchema(system.graphql.schemas.public) }
    const lastApolloServerRef = { current: apolloServer ?? null }
    const expressServerRef = { current: expressServer }

    if (system.config.telemetry !== false) {
      runTelemetry(cwd, system.lists, system.config.db.provider)
    }

    for await (const buildResult of builds) {
      await processBuildResult(
        buildResult,
        system,
        cwd,
        prisma,
        prismaClientModule,
        !!server,
        nextApp,
        expressServerRef,
        apolloServer,
        originalPrismaSchema,
        lastPrintedGraphQLSchemaRef,
        lastApolloServerRef
      )
    }
  }

  let initKeystonePromiseResolve: () => void | undefined
  let initKeystonePromiseReject: (err: any) => void | undefined
  const initKeystonePromise = new Promise<void>((resolve, reject) => {
    initKeystonePromiseResolve = resolve
    initKeystonePromiseReject = reject
  })

  if (app && httpServer) {
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

    const server = httpServer.listen(httpOptions, err => {
      if (err) throw err

      const easyHost = getEasyHost(httpOptions.host)
      log(
        `⭐️ Server listening on ${httpOptions.host ?? ''}:${httpOptions.port} (http://${easyHost}:${httpOptions.port}/)`
      )
      log(`⭐️ GraphQL API available at ${config.graphql?.path ?? '/api/graphql'}`)

      initKeystone().catch(async err => {
        await stop(server)
        initKeystonePromiseReject?.(err)
      })
    })

    await initKeystonePromise
    return async () => await stop(server)
  } else {
    await initKeystone()
    return () => Promise.resolve()
  }
}