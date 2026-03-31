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

function stripExtendHttpServer(config: KeystoneConfig): KeystoneConfig {
  const { server, ...rest } = config
  const { extendHttpServer, ...restServer } = server
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

function createAsyncIterableBuilds() {
  let lastPromise = createResolvablePromise<IteratorResult<BuildResult>>()

  return {
    builds: {
      [Symbol.asyncIterator]: () => ({ next: () => lastPromise }),
    },
    addBuildResult: (build: BuildResult) => {
      const prev = lastPromise
      lastPromise = createResolvablePromise()
      prev.resolve({ value: build, done: false })
    },
  }
}

async function setupEsbuildContext(cwd: string) {
  const { builds, addBuildResult } = createAsyncIterableBuilds()
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
  return { esbuildContext, builds }
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

async function disconnectPrisma(prismaClient: any): Promise<void> {
  try {
    await prismaClient?.disconnect?.()
  } catch (err) {
    console.error('Error disconnecting from the database', err)
    throw err
  }
}

function createLogger(quiet: boolean) {
  return (message: string) => {
    if (!quiet) console.log(message)
  }
}

async function handleMigration(
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
}

async function initializePrismaAndServer(
  cwd: string,
  system: any,
  prisma: boolean,
  server: boolean,
  dbPush: boolean,
  log: (msg: string) => void
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
    const created = await createDatabase(system.config.db.url, path.dirname(paths.schema.prisma))
    if (created) log(`✨ Database created`)
    await handleMigration(paths, system, generatedPrismaSchema, log)
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
) {
  if (system.config.ui?.isDisabled) {
    return null
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

function createDevStatusMiddleware(
  isReady: () => boolean,
  expressServer: express.Express | null,
  config: KeystoneConfig
) {
  return (req: any, res: any, next: any) => {
    if (req.path === '/__keystone/dev/status') {
      return res.status(isReady() ? 200 : 501).end()
    }

    if (expressServer) {
      if (req.path === (config.graphql?.path ?? '/api/graphql')) {
        return expressServer(req, res, next)
      }
    }

    res.sendFile(devLoadingHTMLFilepath)
  }
}

async function handleBuildResult(
  buildResult: BuildResult,
  cwd: string,
  system: any,
  prisma: boolean,
  prismaClientModule: any,
  server: boolean,
  nextApp: any,
  state: {
    originalPrismaSchema: string
    lastPrintedGraphQLSchema: string
    lastApolloServer: any
    expressServer: express.Express | null
  },
  log: (msg: string) => void
) {
  if (buildResult.errors.length) return

  log('compiled successfully')

  try {
    const paths = system.getPaths(cwd)

    // wipe the require cache
    const resolved = require.resolve(paths.config)
    delete require.cache[resolved]

    const newConfigWithHttp = await importBuiltKeystoneConfiguration(cwd)
    const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

    if (prisma) {
      if (!state.originalPrismaSchema) throw new TypeError('Missing Prisma schema source')

      const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
      if (state.originalPrismaSchema !== newPrismaSchema) {
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
    if (newPrintedGraphQLSchema !== state.lastPrintedGraphQLSchema) {
      await fsp.writeFile(
        paths.schema.graphql,
        getFormattedGraphQLSchema(newPrintedGraphQLSchema)
      )
      state.lastPrintedGraphQLSchema = newPrintedGraphQLSchema
    }

    await generateTypes(cwd, newSystem)
    await generateAdminUI(newSystem.config, newSystem.adminMeta, paths.admin, true)

    if (prismaClientModule && server && state.lastApolloServer) {
      const { context: newContext } = newSystem.getKeystone(prismaClientModule)
      const servers = await createExpressServer(newSystem.config, newContext)
      if (nextApp) {
        servers.expressServer.use(
          createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, nextApp)
        )
      }
      state.expressServer = servers.expressServer
      const prevApolloServer = state.lastApolloServer
      state.lastApolloServer = servers.apolloServer
      await prevApolloServer.stop()
    }
  } catch (err) {
    if (err instanceof ExitError) throw err
    console.error(`Error loading your Keystone config`, err)
  }
}

export async function dev(
  cwd: string,
  { dbPush, prisma, quiet, server, ui }: Pick<Flags, 'dbPush' | 'prisma' | 'quiet' | 'server' | 'ui'>
) {
  const log = createLogger(quiet)

  log('✨ Starting Keystone')

  const { esbuildContext, builds } = await setupEsbuildContext(cwd)

  let prismaClient: any = null
  let expressServer: express.Express | null = null
  let hasAddedAdminUIMiddleware = false

  const isReady = () => !server || (expressServer !== null && hasAddedAdminUIMiddleware)

  async function stop(httpServer: any, exitMessage: string = '') {
    await esbuildContext.dispose()
    await closeHttpServer(httpServer)
    await disconnectPrisma(prismaClient)

    if (exitMessage) throw new ExitError(1, exitMessage)
  }

  const app = server ? express() : null
  const httpServer = app ? createServer(app) : null

  let initKeystonePromiseResolve: (() => void) | undefined
  let initKeystonePromiseReject: ((err: any) => void) | undefined
  const initKeystonePromise = new Promise<void>((resolve, reject) => {
    initKeystonePromiseResolve = resolve
    initKeystonePromiseReject = reject
  })

  const initKeystone = async () => {
    const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
    const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

    const result = await initializePrismaAndServer(cwd, system, prisma, !!server, dbPush, log)
    const { context, apolloServer, prismaClientModule } = result as any

    if (configWithExtendHttp?.server?.extendHttpServer && httpServer && context) {
      configWithExtendHttp.server.extendHttpServer(httpServer, context)
    }

    prismaClient = context?.prisma
    if (result.expressServer) {
      expressServer = result.expressServer
    }

    let nextApp: any = null
    if (!system.config.ui?.isDisabled && ui && expressServer && context) {
      nextApp = await setupAdminUI(system, context, expressServer, cwd, log)
    }

    hasAddedAdminUIMiddleware = true
    initKeystonePromiseResolve?.()

    const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
    const state = {
      originalPrismaSchema,
      lastPrintedGraphQLSchema