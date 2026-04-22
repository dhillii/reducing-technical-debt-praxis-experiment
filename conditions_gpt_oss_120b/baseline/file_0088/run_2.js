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

async function generatePrismaArtifacts(
  cwd: string,
  system: ReturnType<typeof createSystem>,
  log: (msg: string) => void,
  dbPush: boolean,
  prisma: boolean
) {
  if (!prisma) return { prismaClientModule: undefined, keystone: undefined }

  log('✨ Generating GraphQL and Prisma schemas')
  const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
  await generateTypes(cwd, system)
  await generatePrismaClient(cwd, system)

  const paths = system.getPaths(cwd)

  if (dbPush) {
    const created = await createDatabase(system.config.db.url, path.dirname(paths.schema.prisma))
    if (created) log(`✨ Database created`)

    const migration = await withMigrate(paths.schema.prisma, system, async m => {
      const migration_ = await m.schema(generatedPrismaSchema, false)

      if (migration_.unexecutable.length) {
        console.error(`${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`)
        for (const item of migration_.unexecutable) console.error(`  • ${item}`)

        if (migration_.warnings.length) {
          console.error(chalk.bold(`\n⚠️  Warnings:\n`))
          for (const warning of migration_.warnings) console.error(`  • ${warning}`)
        }

        console.error('\nTo apply this migration, we need to reset the database')
        const proceed = await confirmPrompt(
          `Do you want to continue? ${chalk.red('The database will be reset')}`,
          false
        )
        if (!proceed) throw new ExitError(1, 'Database reset cancelled by user')
        await m.reset()
        return m.schema(generatedPrismaSchema, false)
      }

      if (migration_.warnings.length) {
        console.error(chalk.bold(`\n⚠️  Warnings:\n`))
        for (const warning of migration_.warnings) console.error(`  • ${warning}`)

        const proceed = await confirmPrompt(
          `Do you want to continue? ${chalk.red('Some data will be lost')}`,
          false
        )
        if (!proceed) throw new ExitError(1, 'Database push cancelled by user')
        return m.schema(generatedPrismaSchema, true)
      }

      return migration_
    })

    if (migration.warnings.length === 0 && migration.executedSteps === 0) {
      log(`✨ Database unchanged`)
    } else {
      log(`✨ Database synchronized with Prisma schema`)
    }
  } else {
    log('⚠️ Skipping database schema push')
  }

  const prismaClientModule = require(paths.prisma)
  const keystone = system.getKeystone(prismaClientModule)

  log('✨ Connecting to the database')
  await keystone.connect()

  return { prismaClientModule, keystone }
}

async function setupServerAndUI(
  cwd: string,
  system: ReturnType<typeof createSystem>,
  keystoneContext: any,
  ui: boolean,
  log: (msg: string) => void
) {
  const { apolloServer, expressServer } = await createExpressServer(
    system.config,
    keystoneContext
  )
  log(`✅ GraphQL API ready`)

  let nextApp: any = null
  if (!system.config.ui?.isDisabled && ui) {
    log('✨ Generating Admin UI code')
    const paths = system.getPaths(cwd)
    await fsp.rm(paths.admin, { recursive: true, force: true })
    await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

    log('✨ Preparing Admin UI')
    nextApp = next({ dev: true, dir: paths.admin })
    await nextApp.prepare()
    expressServer.use(
      createAdminUIMiddlewareWithNextApp(system.config, keystoneContext, nextApp)
    )
    log(`✅ Admin UI ready`)
  }

  return { apolloServer, expressServer, nextApp }
}

async function handleBuildLoop(
  builds: AsyncIterable<BuildResult>,
  system: ReturnType<typeof createSystem>,
  cwd: string,
  prisma: boolean,
  prismaClientModule: any,
  originalPrismaSchema: string,
  log: (msg: string) => void,
  stop: (aHttpServer: any, exitMessage?: string) => Promise<void>,
  expressServerRef: { current: any },
  apolloServerRef: { current: any },
  nextApp: any
) {
  let lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)

  for await (const buildResult of builds) {
    if (buildResult.errors.length) continue
    log('compiled successfully')
    try {
      const paths = system.getPaths(cwd)

      const resolved = require.resolve(paths.config)
      delete require.cache[resolved]

      const newConfig = await importBuiltKeystoneConfiguration(cwd)
      const newSystem = createSystem(stripExtendHttpServer(newConfig))

      if (prisma) {
        const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
        if (originalPrismaSchema !== newPrismaSchema) {
          return stop(null, '🔄 Your prisma schema has changed, please restart Keystone')
        }
        if (
          JSON.stringify(newSystem.config.db.enableLogging) !==
            JSON.stringify(system.config.db.enableLogging) ||
          newSystem.config.db.url !== system.config.db.url
        ) {
          return stop(null, 'Your database configuration has changed, please restart Keystone')
        }
      }

      const newPrintedGraphQLSchema = printSchema(newSystem.graphql.schemas.public)
      if (newPrintedGraphQLSchema !== lastPrintedGraphQLSchema) {
        await fsp.writeFile(
          paths.schema.graphql,
          getFormattedGraphQLSchema(newPrintedGraphQLSchema)
        )
        lastPrintedGraphQLSchema = newPrintedGraphQLSchema
      }

      await generateTypes(cwd, newSystem)
      await generateAdminUI(newSystem.config, newSystem.adminMeta, paths.admin, true)

      if (prismaClientModule && apolloServerRef.current) {
        const { context: newContext } = newSystem.getKeystone(prismaClientModule)
        const servers = await createExpressServer(newSystem.config, newContext)
        if (nextApp) {
          servers.expressServer.use(
            createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, nextApp)
          )
        }
        expressServerRef.current = servers.expressServer
        const prevApollo = apolloServerRef.current
        apolloServerRef.current = servers.apolloServer
        await prevApollo.stop()
      }
    } catch (err) {
      console.error(`Error loading your Keystone config`, err)
    }
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
  const log = (msg: string) => {
    if (!quiet) console.log(msg)
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

  let lastPromise = resolvablePromise<IteratorResult<BuildResult>>()
  const builds: AsyncIterable<BuildResult> = {
    [Symbol.asyncIterator]: () => ({ next: () => lastPromise }),
  }

  function addBuildResult(build: BuildResult) {
    const prev = lastPromise
    lastPromise = resolvablePromise()
    prev.resolve({ value: build, done: false })
  }

  try {
    const firstBuild = await esbuildContext.rebuild()
    addBuildResult(firstBuild)
  } catch {
    // esbuild already printed errors
  }
  esbuildContext.watch()

  let prismaClient: any = null

  async function stop(aHttpServer: any, exitMessage: string = '') {
    await esbuildContext.dispose()
    if (aHttpServer) {
      await new Promise((resolve, reject) => {
        aHttpServer.close(err => (err ? reject(err) : resolve(null)))
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
  let expressServer: any = null
  let hasAddedAdminUIMiddleware = false
  const isReady = () => !server || (expressServer && hasAddedAdminUIMiddleware)

  const initKeystonePromise = new Promise<void>((resolve, reject) => {
    initKeystoneResolve = resolve
    initKeystoneReject = reject
  })
  let initKeystoneResolve: (() => void) | undefined
  let initKeystoneReject: ((err: any) => void) | undefined

  async function initKeystone() {
    const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
    const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

    const { prismaClientModule, keystone } = await generatePrismaArtifacts(
      cwd,
      system,
      log,
      dbPush,
      prisma
    )

    if (!keystone) {
      initKeystoneResolve?.()
      return
    }

    const { apolloServer, expressServer: srv, nextApp } = await setupServerAndUI(
      cwd,
      system,
      keystone.context,
      ui,
      log
    )
    expressServer = srv
    hasAddedAdminUIMiddleware = true
    initKeystoneResolve?.()

    if (configWithExtendHttp?.server?.extendHttpServer && httpServer) {
      configWithExtendHttp.server.extendHttpServer(httpServer, keystone.context)
    }
    prismaClient = keystone.context.prisma

    if (system.config.telemetry !== false) {
      runTelemetry(cwd, system.lists, system.config.db.provider)
    }

    const expressRef = { current: expressServer }
    const apolloRef = { current: apolloServer }

    await handleBuildLoop(
      builds,
      system,
      cwd,
      prisma,
      prismaClientModule,
      printPrismaSchema(system.config, system.lists),
      log,
      stop,
      expressRef,
      apolloRef,
      nextApp
    )
  }

  if (app && httpServer) {
    const config = await importBuiltKeystoneConfiguration(cwd)

    app.use('/__keystone/dev/status', (req, res) => {
      res.status(isReady() ? 200 : 501).end()
    })

    app.use((req, res, next) => {
      if (expressServer && hasAddedAdminUIMiddleware) return expressServer(req, res, next)

      const { pathname } = new URL(req.url, 'http://ks')
      if (expressServer && pathname === (config.graphql?.path ?? '/api/graphql')) {
        return expressServer(req, res, next)
      }

      res.sendFile(devLoadingHTMLFilepath)
    })

    const httpOptions: ListenOptions = { port: 3000 }
    if (config?.server?.port && typeof config.server.port === 'number') httpOptions.port = config.server.port
    if (config?.server?.options) Object.assign(httpOptions, config.server.options)
    if (process.env.PORT) httpOptions.port = parseInt(process.env.PORT)
    if (process.env.HOST) httpOptions.host = process.env.HOST

    const server = httpServer.listen(httpOptions, async err => {
      if (err) throw err

      const easyHost = [undefined, '', '::', '0.0.0.0'].includes(httpOptions.host) ? 'localhost' : httpOptions.host
      log(
        `⭐️ Server listening on ${httpOptions.host ?? ''}:${httpOptions.port} (http://${easyHost}:${httpOptions.port}/)`
      )
      log(`⭐️ GraphQL API available at ${config.graphql?.path ?? '/api/graphql'}`)

      try {
        await initKeystone()
      } catch (e) {
        await stop(server)
        initKeystoneReject?.(e)
      }
    })

    await initKeystonePromise
    return async () => await stop(server)
  }

  await initKeystone()
  return () => Promise.resolve()
}