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

/* Predicate helpers */

function isQuiet(quiet: boolean): boolean {
  return quiet
}

function hasServerFlag(server: boolean): boolean {
  return server
}

function shouldGenerateArtifacts(prismaFlag: boolean): boolean {
  return prismaFlag
}

function isDbPushEnabled(dbPush: boolean): boolean {
  return dbPush
}

function hasUnexecutableSteps(migration: { unexecutable: any[] }): boolean {
  return migration.unexecutable.length > 0
}

function hasMigrationWarnings(migration: { warnings: any[] }): boolean {
  return migration.warnings.length > 0
}

function isPortNumber(value: any): value is number {
  return typeof value === 'number'
}

function hasPortOption(config: any): boolean {
  return config?.server && 'port' in config.server && isPortNumber(config.server.port)
}

function hasServerOptions(config: any): boolean {
  return config?.server && 'options' in config.server && !!config.server.options
}

/* Core logic helpers */

async function generateArtifactsIfNeeded(
  cwd: string,
  system: any,
  prismaFlag: boolean,
  log: (msg: string) => void
) {
  if (!shouldGenerateArtifacts(prismaFlag)) return
  log('✨ Generating GraphQL and Prisma schemas')
  const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
  await generateTypes(cwd, system)
  await generatePrismaClient(cwd, system)
  return generatedPrismaSchema
}

async function handleMigration(
  migrationFn: (schema: string, force: boolean) => Promise<any>,
  generatedPrismaSchema: string,
  dbPush: boolean,
  log: (msg: string) => void
) {
  if (!isDbPushEnabled(dbPush)) {
    log('⚠️ Skipping database schema push')
    return
  }

  const migration = await migrationFn(generatedPrismaSchema, false)

  if (hasUnexecutableSteps(migration)) {
    console.error(`${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`)
    for (const item of migration.unexecutable) {
      console.error(`  • ${item}`)
    }

    if (hasMigrationWarnings(migration)) {
      console.error(chalk.bold(`\n⚠️  Warnings:\n`))
      for (const warning of migration.warnings) {
        console.error(`  • ${warning}`)
      }
    }

    console.error('\nTo apply this migration, we need to reset the database')
    const confirmed = await confirmPrompt(
      `Do you want to continue? ${chalk.red('The database will be reset')}`,
      false
    )
    if (!confirmed) {
      throw new ExitError(1, 'Database reset cancelled by user')
    }

    await migration.reset()
    return migrationFn(generatedPrismaSchema, false)
  }

  if (hasMigrationWarnings(migration)) {
    console.error(chalk.bold(`\n⚠️  Warnings:\n`))
    for (const warning of migration.warnings) {
      console.error(`  • ${warning}`)
    }

    const confirmed = await confirmPrompt(
      `Do you want to continue? ${chalk.red('Some data will be lost')}`,
      false
    )
    if (!confirmed) {
      throw new ExitError(1, 'Database push cancelled by user')
    }

    return migrationFn(generatedPrismaSchema, true)
  }

  return migration
}

async function startServerIfNeeded(
  system: any,
  keystone: any,
  serverFlag: boolean,
  log: (msg: string) => void,
  cwd: string
) {
  if (!hasServerFlag(serverFlag)) {
    return {
      system,
      context: keystone.context,
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
  }
}

async function prepareAdminUI(
  system: any,
  context: any,
  uiFlag: boolean,
  log: (msg: string) => void,
  cwd: string
) {
  if (system.config.ui?.isDisabled) return null

  if (!uiFlag) return null

  if (!system.config.ui?.isDisabled && uiFlag) {
    if (!system.getPaths) {
      throw new TypeError('Error trying to prepare the Admin UI')
    }

    log('✨ Generating Admin UI code')
    const paths = system.getPaths(cwd)
    await fsp.rm(paths.admin, { recursive: true, force: true })
    await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

    log('✨ Preparing Admin UI')
    const nextApp = next({ dev: true, dir: paths.admin })
    await nextApp.prepare()
    return { nextApp, paths }
  }

  return null
}

/**
 * Main dev function.
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
  const log = (message: string) => {
    if (isQuiet(quiet)) return
    console.log(message)
  }

  log('✨ Starting Keystone')
  let lastPromise = resolvablePromise<IteratorResult<BuildResult>>()

  const builds: AsyncIterable<BuildResult> = {
    [Symbol.asyncIterator]: () => ({ next: () => lastPromise }),
  }

  const addBuildResult = (build: BuildResult) => {
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

  try {
    const firstBuild = await esbuildContext.rebuild()
    addBuildResult(firstBuild)
  } catch {
    // esbuild prints everything we want users to see
  }

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
  const isReady = () => !server || (expressServer !== null && hasAddedAdminUIMiddleware)

  async function initKeystone() {
    const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
    const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

    const generatedPrismaSchema = await generateArtifactsIfNeeded(cwd, system, prisma, log)

    if (prisma) {
      log('✨ Connecting to the database')
      const keystone = system.getKeystone(require(system.getPaths(cwd).prisma))
      await keystone.connect()

      const migrationResult = generatedPrismaSchema
        ? await handleMigration(
            async (schema, force) => {
              const paths = system.getPaths(cwd)
              const migration = await withMigrate(paths.schema.prisma, system, async m => {
                return m.schema(schema, force)
              })
              return migration
            },
            generatedPrismaSchema,
            dbPush,
            log
          )
        : null

      if (migrationResult && migrationResult.warnings.length === 0 && migrationResult.executedSteps === 0) {
        log(`✨ Database unchanged`)
      } else if (migrationResult) {
        log(`✨ Database synchronized with Prisma schema`)
      }

      const serverResult = await startServerIfNeeded(system, keystone, server, log, cwd)

      prismaClient = keystone.context?.prisma
      if (serverResult?.expressServer) {
        expressServer = serverResult.expressServer
      }

      const adminUI = await prepareAdminUI(system, keystone.context, ui, log, cwd)
      if (adminUI?.nextApp && expressServer) {
        expressServer.use(
          createAdminUIMiddlewareWithNextApp(system.config, keystone.context, adminUI.nextApp)
        )
        hasAddedAdminUIMiddleware = true
      }

      return {
        system,
        context: keystone.context,
        apolloServer: serverResult?.apolloServer ?? null,
        prismaClientModule: require(system.getPaths(cwd).prisma),
      }
    }

    return { system }
  }

  const initKeystonePromise = (async () => {
    const result = await initKeystone()
    if (configWithExtendHttp?.server?.extendHttpServer && httpServer && result.context) {
      configWithExtendHttp.server.extendHttpServer(httpServer, result.context)
    }
    prismaClient = result.context?.prisma

    if (system.config.telemetry !== false) {
      runTelemetry(cwd, system.lists, system.config.db.provider)
    }
  })()

  let initKeystonePromiseResolve: () => void | undefined
  let initKeystonePromiseReject: (err: any) => void | undefined
  const initKeystoneControl = new Promise<void>((resolve, reject) => {
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

    if (hasPortOption(config)) {
      httpOptions.port = config.server.port
    }

    if (hasServerOptions(config)) {
      Object.assign(httpOptions, config.server.options)
    }

    if ('PORT' in process.env) {
      httpOptions.port = parseInt(process.env.PORT ?? '')
    }

    if ('HOST' in process.env) {
      httpOptions.host = process.env.HOST ?? ''
    }

    const server = httpServer.listen(httpOptions, async (err?: any) => {
      if (err) throw err

      const easyHost = [undefined, '', '::', '0.0.0.0'].includes(httpOptions.host)
        ? 'localhost'
        : httpOptions.host
      log(
        `⭐️ Server listening on ${httpOptions.host ?? ''}:${httpOptions.port} (http://${easyHost}:${httpOptions.port}/)`
      )
      log(`⭐️ GraphQL API available at ${config.graphql?.path ?? '/api/graphql'}`)

      try {
        await initKeystone()
        initKeystonePromiseResolve?.()
      } catch (err) {
        await stop(server)
        initKeystonePromiseReject?.(err)
      }
    })

    await initKeystoneControl
    return async () => await stop(server)
  } else {
    await initKeystone()
    return () => Promise.resolve()
  }
}