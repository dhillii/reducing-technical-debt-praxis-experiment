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

/**
 * Strip extendHttpServer from the Keystone configuration.
 * @param config Keystone configuration
 * @returns Keystone configuration with extendHttpServer stripped
 */
function stripExtendHttpServer(config: KeystoneConfig): KeystoneConfig {
  const { server, ...rest } = config
  const { extendHttpServer, ...restServer } = server
  return {
    ...rest,
    server: {
      ...restServer,
      extendHttpServer: () => {},
    },
  }
}

/**
 * Create a resolvable promise.
 * @returns A promise that can be resolved manually
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
 * Initialize the Keystone system.
 * @param cwd Current working directory
 * @param config Keystone configuration
 * @param prismaClientModule Prisma client module
 * @param context Keystone context
 * @param expressServer Express server
 * @param apolloServer Apollo server
 * @param nextApp Next.js app
 * @returns A promise that resolves when the system is initialized
 */
async function initKeystoneSystem(
  cwd: string,
  config: KeystoneConfig,
  prismaClientModule: any,
  context: any,
  expressServer: express.Express | null,
  apolloServer: any,
  nextApp: any
) {
  const system = createSystem(stripExtendHttpServer(config))
  const paths = system.getPaths(cwd)

  // Generate the Artifacts
  if (config.prisma) {
    const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
    await generateTypes(cwd, system)
    await generatePrismaClient(cwd, system)
  }

  // Connect to the database
  const keystone = system.getKeystone(prismaClientModule)
  await keystone.connect()

  // Create the server
  if (config.server) {
    const { apolloServer: newApolloServer, expressServer: newExpressServer } =
      await createExpressServer(config, context)
    expressServer = newExpressServer
    apolloServer = newApolloServer
  }

  // Generate the Admin UI code
  if (!config.ui?.isDisabled) {
    await fsp.rm(paths.admin, { recursive: true, force: true })
    await generateAdminUI(config, system.adminMeta, paths.admin, false)
  }

  // Prepare the Admin UI
  if (nextApp) {
    expressServer.use(createAdminUIMiddlewareWithNextApp(config, context, nextApp))
  }

  return { system, expressServer, apolloServer, nextApp }
}

/**
 * Handle a build result.
 * @param buildResult Build result
 * @param cwd Current working directory
 * @param system Keystone system
 * @param expressServer Express server
 * @param apolloServer Apollo server
 * @param nextApp Next.js app
 * @returns A promise that resolves when the build result is handled
 */
async function handleBuildResult(
  buildResult: BuildResult,
  cwd: string,
  system: any,
  expressServer: express.Express | null,
  apolloServer: any,
  nextApp: any
) {
  if (buildResult.errors.length) return

  const paths = system.getPaths(cwd)

  // Wipe the require cache
  const resolved = require.resolve(paths.config)
  delete require.cache[resolved]

  const newConfig = await importBuiltKeystoneConfiguration(cwd)
  const newSystem = createSystem(stripExtendHttpServer(newConfig))

  // Generate the Admin UI code
  if (!newConfig.ui?.isDisabled) {
    await generateAdminUI(newConfig, newSystem.adminMeta, paths.admin, true)
  }

  // Update the server
  if (expressServer && apolloServer) {
    const { context: newContext } = newSystem.getKeystone(require(paths.prisma))
    const servers = await createExpressServer(newSystem.config, newContext)
    expressServer = servers.expressServer
    apolloServer = servers.apolloServer
  }

  return { system: newSystem, expressServer, apolloServer, nextApp }
}

/**
 * Start the development server.
 * @param cwd Current working directory
 * @param flags Command-line flags
 * @returns A promise that resolves when the server is started
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
    if (quiet) return
    console.log(message)
  }

  log('✨ Starting Keystone')

  const esbuildConfig = await getEsbuildConfig(cwd)
  const esbuildContext = await esbuild.context({
    ...esbuildConfig,
    plugins: [
      ...(esbuildConfig.plugins ?? []),
      {
        name: 'esbuildWatchPlugin',
        setup(build: any) {
          build.onEnd((buildResult: BuildResult) => {
            addBuildResult(buildResult)
          })
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
  let expressServer: express.Express | null = null
  let apolloServer: any = null
  let nextApp: any = null
  let system: any = null

  const initKeystonePromise = new Promise<void>((resolve, reject) => {
    initKeystonePromiseResolve = resolve
    initKeystonePromiseReject = reject
  })

  const addBuildResult = (buildResult: BuildResult) => {
    const prev = lastPromise
    lastPromise = resolvablePromise()
    prev.resolve({ value: buildResult, done: false })
  }

  let lastPromise = resolvablePromise<IteratorResult<BuildResult>>()
  const builds: AsyncIterable<BuildResult> = {
    [Symbol.asyncIterator]: () => ({ next: () => lastPromise }),
  }

  const stop = async (httpServer: any, exitMessage: string = '') => {
    await esbuildContext.dispose()

    // Stop the HTTP server
    if (httpServer) {
      await new Promise((resolve, reject) => {
        httpServer.close(async (err: any) => {
          if (err) {
            console.error('Error closing the server', err)
            return reject(err)
          }

          resolve(null)
        })
      })
    }

    // Stop Prisma
    try {
      await prismaClient?.disconnect?.()
    } catch (err) {
      console.error('Error disconnecting from the database', err)
      throw err
    }

    if (exitMessage) throw new ExitError(1, exitMessage)
  }

  if (server) {
    const app = express()
    const httpServer = createServer(app)

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

    if (config?.server && 'port' in config.server && typeof config.server?.port === 'number') {
      httpOptions.port = config.server.port
    }

    if (config?.server && 'options' in config.server && config.server.options) {
      Object.assign(httpOptions, config.server.options)
    }

    // Preference env.PORT if supplied
    if ('PORT' in process.env) {
      httpOptions.port = parseInt(process.env.PORT ?? '')
    }

    // Preference env.HOST if supplied
    if ('HOST' in process.env) {
      httpOptions.host = process.env.HOST ?? ''
    }

    const server = httpServer.listen(httpOptions, (err?: any) => {
      if (err) throw err

      const easyHost = [undefined, '', '::', '0.0.0.0'].includes(httpOptions.host)
        ? 'localhost'
        : httpOptions.host
      log(
        `⭐️ Server listening on ${httpOptions.host ?? ''}:${
          httpOptions.port
        } (http://${easyHost}:${httpOptions.port}/)`
      )
      log(`⭐️ GraphQL API available at ${config.graphql?.path ?? '/api/graphql'}`)

      // Don't start initialising Keystone until the dev server is ready,
      // otherwise it slows down the first response significantly
      initKeystone().catch(async err => {
        await stop(server)
        initKeystonePromiseReject(err)
      })
    })

    await initKeystonePromise
    return async () => await stop(server)
  } else {
    await initKeystone()
    return () => Promise.resolve()
  }

  async function initKeystone() {
    const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
    const { system: newSystem, expressServer: newExpressServer, apolloServer: newApolloServer, nextApp: newNextApp } =
      await initKeystoneSystem(cwd, configWithExtendHttp, require(configWithExtendHttp.getPaths(cwd).prisma), null, null, null, null)

    system = newSystem
    expressServer = newExpressServer
    apolloServer = newApolloServer
    nextApp = newNextApp

    prismaClient = system.getKeystone(require(configWithExtendHttp.getPaths(cwd).prisma)).context.prisma

    if (configWithExtendHttp.server?.extendHttpServer && httpServer && system.getKeystone(require(configWithExtendHttp.getPaths(cwd).prisma)).context) {
      configWithExtendHttp.server.extendHttpServer(httpServer, system.getKeystone(require(configWithExtendHttp.getPaths(cwd).prisma)).context)
    }

    hasAddedAdminUIMiddleware = true
    initKeystonePromiseResolve()

    for await (const buildResult of builds) {
      const { system: newSystem, expressServer: newExpressServer, apolloServer: newApolloServer, nextApp: newNextApp } =
        await handleBuildResult(buildResult, cwd, system, expressServer, apolloServer, nextApp)

      system = newSystem
      expressServer = newExpressServer
      apolloServer = newApolloServer
      nextApp = newNextApp
    }
  }

  let hasAddedAdminUIMiddleware = false
  let initKeystonePromiseResolve: () => void | undefined
  let initKeystonePromiseReject: (err: any) => void | undefined

  function isReady() {
    return !server || (expressServer !== null && hasAddedAdminUIMiddleware)
  }
}