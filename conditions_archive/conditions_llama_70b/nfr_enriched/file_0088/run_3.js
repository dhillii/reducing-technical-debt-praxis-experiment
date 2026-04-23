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
  apolloServer: any | null
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
 * @param cwd Current working directory
 * @param config Keystone configuration
 * @param context Keystone context
 * @param expressServer Express server
 * @param nextApp Next.js app
 * @returns Initialized Admin UI
 */
async function initAdminUI(
  cwd: string,
  config: KeystoneConfig,
  context: any,
  expressServer: express.Express | null,
  nextApp: any | null
) {
  if (!config.ui?.isDisabled) {
    const paths = createSystem(stripExtendHttpServer(config)).getPaths(cwd)
    await fsp.rm(paths.admin, { recursive: true, force: true })
    await generateAdminUI(config, createSystem(stripExtendHttpServer(config)).adminMeta, paths.admin, false)

    nextApp = next({ dev: true, dir: paths.admin })
    await nextApp.prepare()
    expressServer.use(createAdminUIMiddlewareWithNextApp(config, context, nextApp))
  }
}

/**
 * Handle the build result.
 * @param cwd Current working directory
 * @param config Keystone configuration
 * @param system Keystone system
 * @param context Keystone context
 * @param expressServer Express server
 * @param apolloServer Apollo server
 * @param nextApp Next.js app
 * @param buildResult Build result
 */
async function handleBuildResult(
  cwd: string,
  config: KeystoneConfig,
  system: any,
  context: any,
  expressServer: express.Express | null,
  apolloServer: any | null,
  nextApp: any | null,
  buildResult: BuildResult
) {
  if (buildResult.errors.length) return

  const paths = system.getPaths(cwd)

  // wipe the require cache
  {
    const resolved = require.resolve(paths.config)
    delete require.cache[resolved]
  }

  const newConfigWithHttp = await importBuiltKeystoneConfiguration(cwd)
  const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

  if (config.prisma) {
    const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
    if (printPrismaSchema(system.config, system.lists) !== newPrismaSchema) {
      throw new ExitError(1, 'Your Prisma schema has changed, please restart Keystone')
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
  if (newPrintedGraphQLSchema !== printSchema(system.graphql.schemas.public)) {
    await fsp.writeFile(
      paths.schema.graphql,
      getFormattedGraphQLSchema(newPrintedGraphQLSchema)
    )
  }

  await generateTypes(cwd, newSystem)
  await generateAdminUI(newSystem.config, newSystem.adminMeta, paths.admin, true)

  if (config.server && apolloServer) {
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
 * @param flags Flags
 * @returns A function to stop the server
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
  let expressServer: express.Express | null = null
  let apolloServer: any | null = null
  let nextApp: any | null = null
  let system: any = null
  let context: any = null

  const initKeystone = async () => {
    const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
    const { system: newSystem, context: newContext, expressServer: newExpressServer, apolloServer: newApolloServer } =
      await initKeystoneSystem(cwd, configWithExtendHttp, require(configWithExtendHttp.prisma), null, null, null)

    system = newSystem
    context = newContext
    expressServer = newExpressServer
    apolloServer = newApolloServer

    if (configWithExtendHttp.server?.extendHttpServer && expressServer && context) {
      configWithExtendHttp.server.extendHttpServer(expressServer, context)
    }

    prismaClient = context?.prisma

    await initAdminUI(cwd, configWithExtendHttp, context, expressServer, nextApp)

    for await (const buildResult of builds) {
      await handleBuildResult(cwd, configWithExtendHttp, system, context, expressServer, apolloServer, nextApp, buildResult)
    }
  }

  const stop = async (httpServer: any, exitMessage: string = '') => {
    await esbuildContext.dispose()

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
      res.status(!!expressServer && !!nextApp ? 200 : 501).end()
    })

    app.use((req, res, next) => {
      if (expressServer && nextApp) {
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

    if ('PORT' in process.env) {
      httpOptions.port = parseInt(process.env.PORT ?? '')
    }

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

      initKeystone().catch(async err => {
        await stop(server)
        throw err
      })
    })

    await initKeystone()
    return async () => await stop(server)
  } else {
    await initKeystone()
    return () => Promise.resolve()
  }
}
```