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

interface BuildQueue {
  [Symbol.asyncIterator](): AsyncIterator<BuildResult>
}

function createBuildQueue(): BuildQueue & { add: (build: BuildResult) => void } {
  let lastPromise = resolvablePromise<IteratorResult<BuildResult>>()

  const queue: any = {
    [Symbol.asyncIterator]: () => ({ next: () => lastPromise }),
    add(build: BuildResult) {
      const prev = lastPromise
      lastPromise = resolvablePromise()
      prev.resolve({ value: build, done: false })
    },
  }

  return queue
}

interface DevState {
  prismaClient: any
  expressServer: express.Express | null
  hasAddedAdminUIMiddleware: boolean
  nextApp: any
}

function createDevState(): DevState {
  return {
    prismaClient: null,
    expressServer: null,
    hasAddedAdminUIMiddleware: false,
    nextApp: null,
  }
}

async function handleDatabaseMigration(
  paths: any,
  system: any,
  generatedPrismaSchema: string,
  log: (msg: string) => void
) {
  const migration = await withMigrate(paths.schema.prisma, system, async m => {
    const migration_ = await m.schema(generatedPrismaSchema, false)

    if (migration_.unexecutable.length) {
      console.error(`${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`)
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

    if (migration_.warnings.length) {
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

    return migration_
  })

  if (migration.warnings.length === 0 && migration.executedSteps === 0) {
    log(`✨ Database unchanged`)
  } else {
    log(`✨ Database synchronized with Prisma schema`)
  }

  return migration
}

async function initializePrismaAndServer(
  cwd: string,
  system: any,
  paths: any,
  dbPush: boolean,
  server: boolean,
  log: (msg: string) => void
) {
  const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
  await generateTypes(cwd, system)
  await generatePrismaClient(cwd, system)

  if (dbPush) {
    const created = await createDatabase(system.config.db.url, path.dirname(paths.schema.prisma))
    if (created) log(`✨ Database created`)
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
  cwd: string,
  paths: any,
  expressServer: express.Express,
  context: any,
  ui: boolean,
  log: (msg: string) => void
) {
  if (system.config.ui?.isDisabled || !ui) {
    return null
  }

  if (!expressServer || !context) {
    throw new TypeError('Error trying to prepare the Admin UI')
  }

  log('✨ Generating Admin UI code')
  await fsp.rm(paths.admin, { recursive: true, force: true })
  await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

  log('✨ Preparing Admin UI')
  const nextApp = next({ dev: true, dir: paths.admin })
  await nextApp.prepare()
  expressServer.use(createAdminUIMiddlewareWithNextApp(system.config, context, nextApp))
  log(`✅ Admin UI ready`)

  return nextApp
}

function resolveListenOptions(config: KeystoneConfig): ListenOptions {
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

  return httpOptions
}

function getDisplayHost(host: string | undefined): string {
  return [undefined, '', '::', '0.0.0.0'].includes(host) ? 'localhost' : host ?? ''
}

async function handleBuildResult(
  buildResult: BuildResult,
  cwd: string,
  system: any,
  state: DevState,
  prisma: boolean,
  server: boolean,
  log: (msg: string) => void
) {
  if (buildResult.errors.length) return

  log('compiled successfully')
  try {
    const paths = system.getPaths(cwd)

    // wipe the require cache
    {
      const resolved = require.resolve(paths.config)
      delete require.cache[resolved]
    }

    const newConfigWithHttp = await importBuiltKeystoneConfiguration(cwd)
    const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

    if (prisma) {
      const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
      if (!originalPrismaSchema) throw new TypeError('Missing Prisma schema source')

      const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
      if (originalPrismaSchema !== newPrismaSchema) {
        throw new ExitError(1, '🔄 Your prisma schema has changed, please restart Keystone')
      }

      if (
        JSON.stringify(newSystem.config.db.enableLogging) !==
          JSON.stringify(system.config.db.enableLogging) ||
        newSystem.config.db.url !== system.config.db.url
      ) {
        throw new ExitError(1, 'Your database configuration has changed, please restart Keystone')
      }
    }

    const newPrintedGraphQLSchema = printSchema(newSystem.graphql.schemas.public)
    const lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)

    if (newPrintedGraphQLSchema !== lastPrintedGraphQLSchema) {
      await fsp.writeFile(
        paths.schema.graphql,
        getFormattedGraphQLSchema(newPrintedGraphQLSchema)
      )
    }

    await generateTypes(cwd, newSystem)
    await generateAdminUI(newSystem.config, newSystem.adminMeta, paths.admin, true)

    if (state.prismaClient && server && state.expressServer) {
      const { context: newContext } = newSystem.getKeystone(state.prismaClient)
      const servers = await createExpressServer(newSystem.config, newContext)

      if (state.nextApp) {
        servers.expressServer.use(
          createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, state.nextApp)
        )
      }

      state.expressServer = servers.expressServer
      // Note: Apollo server cleanup would happen here
    }
  } catch (err) {
    if (err instanceof ExitError) throw err
    console.error(`Error loading your Keystone config`, err)
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

  const buildQueue = createBuildQueue()
  const devState = createDevState()

  const esbuildConfig = await getEsbuildConfig(cwd)
  const esbuildContext = await esbuild.context({
    ...esbuildConfig,
    plugins: [
      ...(esbuildConfig.plugins ?? []),
      {
        name: 'esbuildWatchPlugin',
        setup(build: any) {
          build.onEnd((result: BuildResult) => buildQueue.add(result))
        },
      },
    ],
  })

  try {
    const firstBuild = await esbuildContext.rebuild()
    buildQueue.add(firstBuild)
  } catch (e) {
    // esbuild prints everything we want users to see
  }

  esbuildContext.watch()

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
      await devState.prismaClient?.disconnect?.()
    } catch (err) {
      console.error('Error disconnecting from the database', err)
      throw err
    }

    if (exitMessage) throw new ExitError(1, exitMessage)
  }

  const app = server ? express() : null
  const httpServer = app ? createServer(app) : null
  const isReady = () => !server || (devState.expressServer !== null && devState.hasAddedAdminUIMiddleware)

  const initKeystone = async () => {
    const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
    const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

    let context: any = null
    let apolloServer: any = null
    let prismaClientModule: any = null

    if (prisma) {
      log('✨ Generating GraphQL and Prisma schemas')
      const paths = system.getPaths(cwd)
      const result = await initializePrismaAndServer(
        cwd,
        system,
        paths,
        dbPush,
        server,
        log
      )

      context = result.context
      prismaClientModule = result.prismaClientModule
      if ('apolloServer' in result) {
        apolloServer = result.apolloServer
      }
      if ('expressServer' in result) {
        devState.expressServer = result.expressServer
      }
    }

    if (configWithExtendHttp?.server?.extendHttpServer && httpServer && context) {
      configWithExtendHttp.server.extendHttpServer(httpServer, context)
    }

    devState.prismaClient = context?.prisma

    if (devState.expressServer && context) {
      devState.nextApp = await setupAdminUI(
        system,
        cwd,
        system.getPaths(cwd),
        devState.expressServer,
        context,
        ui,
        log
      )
    }

    devState.hasAddedAdminUIMiddleware = true

    if (system.config.telemetry !== false) {
      runTelemetry(cwd, system.lists, system.config.db.provider)
    }

    for await (const buildResult of buildQueue) {
      await handleBuildResult(buildResult, cwd, system, devState, prisma, server, log)
    }
  }

  let initKeystonePromiseResolve: (() => void) | undefined
  let initKeystonePromiseReject: ((err: any) => void) | undefined
  const initKeystonePromise = new Promise<void>((resolve, reject) => {
    initKeystonePromiseResolve = resolve
    initKeystonePromiseReject = reject
  })

  if (app && httpServer) {
    const config = await importBuil