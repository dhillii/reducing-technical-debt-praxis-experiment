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

function isPrismaConfigChanged(
  system: any,
  newSystem: any,
  prismaClientModule: any
): boolean {
  const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
  const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
  if (originalPrismaSchema !== newPrismaSchema) {
    return true
  }
  if (
    JSON.stringify(newSystem.config.db.enableLogging) !==
      JSON.stringify(system.config.db.enableLogging) ||
    newSystem.config.db.url !== system.config.db.url
  ) {
    return true
  }
  return false
}

function isGraphQLSchemaChanged(
  system: any,
  newSystem: any,
  lastPrintedGraphQLSchema: string
): boolean {
  const newPrintedGraphQLSchema = printSchema(newSystem.graphql.schemas.public)
  if (newPrintedGraphQLSchema !== lastPrintedGraphQLSchema) {
    return true
  }
  return false
}

async function initKeystone(
  cwd: string,
  configWithExtendHttp: KeystoneConfig,
  server: boolean,
  httpServer: any,
  expressServer: express.Express | null,
  prisma: boolean,
  ui: boolean,
  quiet: boolean
) {
  const { system, context, prismaClientModule, apolloServer, ...rest } =
    await createSystemAndContext(cwd, configWithExtendHttp, prisma, server)

  if (configWithExtendHttp?.server?.extendHttpServer && httpServer && context) {
    configWithExtendHttp.server.extendHttpServer(httpServer, context)
  }

  let prismaClient = context?.prisma
  if (rest.expressServer) {
    expressServer = rest.expressServer
  }

  let nextApp
  if (!system.config.ui?.isDisabled && ui) {
    if (!expressServer || !context) throw new TypeError('Error trying to prepare the Admin UI')

    await generateAdminUIAndPrepareNextApp(system, context, expressServer, nextApp)
  }

  const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
  let lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)
  let lastApolloServer = apolloServer ?? null

  if (system.config.telemetry !== false) {
    runTelemetry(cwd, system.lists, system.config.db.provider)
  }

  return {
    system,
    context,
    prismaClientModule,
    expressServer,
    apolloServer,
    lastPrintedGraphQLSchema,
    lastApolloServer,
    nextApp,
  }
}

async function createSystemAndContext(
  cwd: string,
  configWithExtendHttp: KeystoneConfig,
  prisma: boolean,
  server: boolean
) {
  const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

  if (prisma) {
    await generateArtifactsAndTypes(cwd, system)
  }

  if (server) {
    const { apolloServer, expressServer } = await createExpressServer(
      system.config,
      system.getKeystone().context
    )
    return {
      system,
      context: system.getKeystone().context,
      expressServer,
      apolloServer,
    }
  }

  return {
    system,
    context: system.getKeystone().context,
  }
}

async function generateArtifactsAndTypes(cwd: string, system: any) {
  const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
  await generateTypes(cwd, system)
  await generatePrismaClient(cwd, system)
}

async function generateAdminUIAndPrepareNextApp(
  system: any,
  context: any,
  expressServer: express.Express | null,
  nextApp: any
) {
  const paths = system.getPaths()
  await fsp.rm(paths.admin, { recursive: true, force: true })
  await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

  nextApp = next({ dev: true, dir: paths.admin })
  await nextApp.prepare()
  expressServer.use(createAdminUIMiddlewareWithNextApp(system.config, context, nextApp))
}

async function handleBuildResult(
  buildResult: BuildResult,
  system: any,
  context: any,
  prismaClientModule: any,
  expressServer: express.Express | null,
  lastPrintedGraphQLSchema: string,
  lastApolloServer: any,
  nextApp: any
) {
  if (buildResult.errors.length) return

  const paths = system.getPaths()
  const newConfigWithHttp = await importBuiltKeystoneConfiguration(paths.cwd)
  const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

  if (isPrismaConfigChanged(system, newSystem, prismaClientModule)) {
    throw new ExitError(1, 'Your Prisma schema or database configuration has changed, please restart Keystone')
  }

  if (isGraphQLSchemaChanged(system, newSystem, lastPrintedGraphQLSchema)) {
    await fsp.writeFile(
      paths.schema.graphql,
      getFormattedGraphQLSchema(printSchema(newSystem.graphql.schemas.public))
    )
    lastPrintedGraphQLSchema = printSchema(newSystem.graphql.schemas.public)
  }

  await generateTypes(paths.cwd, newSystem)
  await generateAdminUI(newSystem.config, newSystem.adminMeta, paths.admin, true)

  if (prismaClientModule) {
    const newContext = newSystem.getKeystone(prismaClientModule).context
    const servers = await createExpressServer(newSystem.config, newContext)
    if (nextApp) {
      servers.expressServer.use(
        createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, nextApp)
      )
    }
    expressServer = servers.expressServer
    const prevApolloServer = lastApolloServer
    lastApolloServer = servers.apolloServer
    await prevApolloServer.stop()
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

  const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
  const {
    system,
    context,
    prismaClientModule,
    expressServer: newExpressServer,
    apolloServer,
    lastPrintedGraphQLSchema,
    lastApolloServer,
    nextApp,
  } = await initKeystone(
    cwd,
    configWithExtendHttp,
    server,
    httpServer,
    expressServer,
    prisma,
    ui,
    quiet
  )

  expressServer = newExpressServer
  prismaClient = context?.prisma

  for await (const buildResult of builds) {
    await handleBuildResult(
      buildResult,
      system,
      context,
      prismaClientModule,
      expressServer,
      lastPrintedGraphQLSchema,
      lastApolloServer,
      nextApp
    )
  }

  if (app && httpServer) {
    app.use('/__keystone/dev/status', (req, res) => {
      res.status(isReady() ? 200 : 501).end()
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

    if (configWithExtendHttp?.server && 'port' in configWithExtendHttp.server && typeof configWithExtendHttp.server?.port === 'number') {
      httpOptions.port = configWithExtendHttp.server.port
    }

    if (configWithExtendHttp?.server && 'options' in configWithExtendHttp.server && configWithExtendHttp.server.options) {
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
        `⭐️ Server listening on ${httpOptions.host ?? ''}:${
          httpOptions.port
        } (http://${easyHost}:${httpOptions.port}/)`
      )
      log(`⭐️ GraphQL API available at ${configWithExtendHttp.graphql?.path ?? '/api/graphql'}`)
    })

    return async () => await stop(server)
  } else {
    return () => Promise.resolve()
  }
}