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

/**
 * Strip the extendHttpServer function from the Keystone configuration.
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
 * @returns Initialized Keystone system
 */
async function initKeystoneSystem(
  cwd: string,
  config: KeystoneConfig,
  prismaClientModule: any,
  context: any,
  expressServer: express.Express | null,
  apolloServer: any
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

  return { system, context, expressServer, apolloServer }
}

/**
 * Initialize the Admin UI.
 * @param system Keystone system
 * @param context Keystone context
 * @param expressServer Express server
 * @param nextApp Next.js app
 * @returns Initialized Admin UI
 */
async function initAdminUI(
  system: any,
  context: any,
  expressServer: express.Express | null,
  nextApp: any
) {
  const paths = system.getPaths(system.cwd)
  await fsp.rm(paths.admin, { recursive: true, force: true })
  await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

  nextApp = next({ dev: true, dir: paths.admin })
  await nextApp.prepare()
  expressServer.use(createAdminUIMiddlewareWithNextApp(system.config, context, nextApp))
  return nextApp
}

/**
 * Handle build results.
 * @param system Keystone system
 * @param context Keystone context
 * @param expressServer Express server
 * @param apolloServer Apollo server
 * @param nextApp Next.js app
 * @param buildResult Build result
 * @returns Handled build result
 */
async function handleBuildResult(
  system: any,
  context: any,
  expressServer: express.Express | null,
  apolloServer: any,
  nextApp: any,
  buildResult: BuildResult
) {
  if (buildResult.errors.length) return

  const paths = system.getPaths(system.cwd)
  const newConfigWithHttp = await importBuiltKeystoneConfiguration(system.cwd)
  const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

  // Check for Prisma schema changes
  if (system.config.prisma) {
    const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
    if (printPrismaSchema(system.config, system.lists) !== newPrismaSchema) {
      throw new ExitError(1, 'Your Prisma schema has changed, please restart Keystone')
    }
  }

  // Update the GraphQL schema
  const newPrintedGraphQLSchema = printSchema(newSystem.graphql.schemas.public)
  if (newPrintedGraphQLSchema !== printSchema(system.graphql.schemas.public)) {
    await fsp.writeFile(
      paths.schema.graphql,
      getFormattedGraphQLSchema(newPrintedGraphQLSchema)
    )
  }

  // Update the Admin UI
  await generateTypes(system.cwd, newSystem)
  await generateAdminUI(newSystem.config, newSystem.adminMeta, paths.admin, true)

  // Update the server
  if (system.config.server) {
    const { context: newContext } = newSystem.getKeystone(require(paths.prisma))
    const servers = await createExpressServer(newSystem.config, newContext)
    if (nextApp) {
      servers.expressServer.use(
        createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, nextApp)
      )
    }
    expressServer = servers.expressServer
    const prevApolloServer = apolloServer
    apolloServer = servers.apolloServer
    await prevApolloServer.stop()
  }
}

/**
 * Start the development server.
 * @param cwd Current working directory
 * @param flags Command-line flags
 * @returns Started development server
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

  log('Starting Keystone')
  const lastPromise = resolvablePromise<IteratorResult<BuildResult>>()

  const builds: AsyncIterable<BuildResult> = {
    [Symbol.asyncIterator]: () => ({ next: () => lastPromise }),
  }

  const esbuildConfig = await getEsbuildConfig(cwd)
  const esbuildContext = await esbuild.context({
    ...esbuildConfig,
    plugins: [
      ...(esbuildConfig.plugins ?? []),
      {
        name: 'esbuildWatchPlugin',
        setup(build: any) {
          build.onEnd((buildResult: BuildResult) => {
            const prev = lastPromise
            lastPromise = resolvablePromise()
            prev.resolve({ value: buildResult, done: false })
          })
        },
      },
    ],
  })

  try {
    const firstBuild = await esbuildContext.rebuild()
    const prev = lastPromise
    lastPromise = resolvablePromise()
    prev.resolve({ value: firstBuild, done: false })
  } catch (e) {
    // esbuild prints everything we want users to see
  }

  esbuildContext.watch()

  let prismaClient: any = null
  let expressServer: express.Express | null = null
  let apolloServer: any = null
  let nextApp: any = null
  let hasAddedAdminUIMiddleware = false

  async function stop(aHttpServer: any, exitMessage: string = '') {
    await esbuildContext.dispose()

    // Stop the HTTP server
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

    // Stop Prisma
    try {
      await prismaClient?.disconnect?.()
    } catch (err) {
      console.error('Error disconnecting from the database', err)
      throw err
    }

    if (exitMessage) throw new ExitError(1, exitMessage)
  }

  const initKeystonePromise = new Promise<void>((resolve, reject) => {
    (async () => {
      const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
      const { system, context, prismaClientModule, apolloServer: newApolloServer, expressServer: newExpressServer } =
        await initKeystoneSystem(cwd, configWithExtendHttp, require(configWithExtendHttp.paths.prisma), null, null, null)

      prismaClient = context?.prisma
      expressServer = newExpressServer
      apolloServer = newApolloServer

      if (configWithExtendHttp.server?.extendHttpServer && expressServer && context) {
        configWithExtendHttp.server.extendHttpServer(expressServer, context)
      }

      if (!system.config.ui?.isDisabled && ui) {
        nextApp = await initAdminUI(system, context, expressServer, nextApp)
      }

      hasAddedAdminUIMiddleware = true
      resolve()
    })().catch(async err => {
      await stop(null)
      reject(err)
    })
  })

  if (server) {
    const app = express()
    const httpServer = createServer(app)

    app.use('/__keystone/dev/status', (req, res) => {
      res.status(hasAddedAdminUIMiddleware ? 200 : 501).end()
    })

    app.use((req, res, next) => {
      if (expressServer && hasAddedAdminUIMiddleware) {
        return expressServer(req, res, next)
      }

      const { pathname } = new URL(req.url, 'http://ks')
      if (expressServer && pathname === (configWithExtendHttp.graphql?.path ?? '/api/graphql')) {
        return expressServer(req, res, next)
      }

      res.sendFile(devLoadingHTMLFilepath)
    })

    const httpOptions: ListenOptions = {
      port: 3000,
    }

    if (configWithExtendHttp.server && 'port' in configWithExtendHttp.server && typeof configWithExtendHttp.server.port === 'number') {
      httpOptions.port = configWithExtendHttp.server.port
    }

    if (configWithExtendHttp.server && 'options' in configWithExtendHttp.server && configWithExtendHttp.server.options) {
      Object.assign(httpOptions, configWithExtendHttp.server.options)
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
        `Server listening on ${httpOptions.host ?? ''}:${httpOptions.port} (http://${easyHost}:${httpOptions.port}/)`
      )
      log(`GraphQL API available at ${configWithExtendHttp.graphql?.path ?? '/api/graphql'}`)
    })

    await initKeystonePromise
    return async () => await stop(server)
  } else {
    await initKeystonePromise
    return () => Promise.resolve()
  }

  for await (const buildResult of builds) {
    await handleBuildResult(
      await importBuiltKeystoneConfiguration(cwd),
      prismaClient,
      expressServer,
      apolloServer,
      nextApp,
      buildResult
    )
  }
}
```