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

  const stop = async (aHttpServer: any, exitMessage = '') => {
    await esbuildContext.dispose()
    if (aHttpServer) {
      await new Promise((resolve, reject) => {
        aHttpServer.close(err => {
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
    // esbuild prints everything we want users to see
  }
  esbuildContext.watch()

  const app = server ? express() : null
  const httpServer = app ? createServer(app) : null
  let expressServer: express.Express | null = null
  let hasAddedAdminUIMiddleware = false
  const isReady = () => !server || (expressServer !== null && hasAddedAdminUIMiddleware)

  let prismaClient: any = null
  let initKeystonePromiseResolve: () => void | undefined
  let initKeystonePromiseReject: (err: any) => void | undefined
  const initKeystonePromise = new Promise<void>((resolve, reject) => {
    initKeystonePromiseResolve = resolve
    initKeystonePromiseReject = reject
  })

  async function handleMigration(
    system: ReturnType<typeof createSystem>,
    generatedPrismaSchema: string,
    paths: ReturnType<typeof system.getPaths>
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

  async function generateArtifactsIfPrisma(system: ReturnType<typeof createSystem>) {
    log('✨ Generating GraphQL and Prisma schemas')
    const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
    await generateTypes(cwd, system)
    await generatePrismaClient(cwd, system)

    const paths = system.getPaths(cwd)
    if (dbPush) {
      const created = await createDatabase(system.config.db.url, path.dirname(paths.schema.prisma))
      if (created) log(`✨ Database created`)
      await handleMigration(system, generatedPrismaSchema, paths)
    } else {
      log('⚠️ Skipping database schema push')
    }
    return { generatedPrismaSchema, paths }
  }

  async function startServerIfNeeded(
    system: ReturnType<typeof createSystem>,
    prismaClientModule: any,
    context: any
  ) {
    if (!server) return { apolloServer: undefined, expressServer: undefined }
    log('✨ Creating server')
    const { apolloServer, expressServer } = await createExpressServer(system.config, context)
    log(`✅ GraphQL API ready`)
    return { apolloServer, expressServer }
  }

  async function prepareAdminUI(
    system: ReturnType<typeof createSystem>,
    context: any,
    nextApp: any
  ) {
    const paths = system.getPaths(cwd)
    await fsp.rm(paths.admin, { recursive: true, force: true })
    await generateAdminUI(system.config, system.adminMeta, paths.admin, false)
    log('✨ Preparing Admin UI')
    const nextInstance = next({ dev: true, dir: paths.admin })
    await nextInstance.prepare()
    expressServer?.use(
      createAdminUIMiddlewareWithNextApp(system.config, context, nextInstance)
    )
    log(`✅ Admin UI ready`)
    return nextInstance
  }

  async function initKeystone() {
    const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
    const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

    let apolloServer: any
    let prismaClientModule: any
    let generatedPrismaSchema: string | undefined

    if (prisma) {
      const artifacts = await generateArtifactsIfPrisma(system)
      generatedPrismaSchema = artifacts.generatedPrismaSchema
      prismaClientModule = require(artifacts.paths.prisma)
    }

    const keystone = system.getKeystone(prismaClientModule)
    log('✨ Connecting to the database')
    await keystone.connect()
    if (!server) {
      prismaClient = keystone.context.prisma
      return { system, context: keystone.context }
    }

    const serverResult = await startServerIfNeeded(system, prismaClientModule, keystone.context)
    apolloServer = serverResult.apolloServer
    expressServer = serverResult.expressServer

    if (!system.config.ui?.isDisabled && ui) {
      if (!expressServer || !keystone.context) throw new TypeError('Error trying to prepare the Admin UI')
      const nextApp = await prepareAdminUI(system, keystone.context, null)
      // store for later rebuilds
      ;(global as any)._nextApp = nextApp
    }

    hasAddedAdminUIMiddleware = true
    initKeystonePromiseResolve?.()

    const originalPrismaSchema = prisma ? printPrismaSchema(system.config, system.lists) : undefined
    let lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)
    let lastApolloServer = apolloServer ?? null

    if (system.config.telemetry !== false) {
      runTelemetry(cwd, system.lists, system.config.db.provider)
    }

    for await (const buildResult of builds) {
      if (buildResult.errors.length) continue
      log('compiled successfully')
      try {
        const paths = system.getPaths(cwd)

        // wipe the require cache
        const resolved = require.resolve(paths.config)
        delete require.cache[resolved]

        const newConfigWithHttp = await importBuiltKeystoneConfiguration(cwd)
        const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

        if (prisma) {
          if (!originalPrismaSchema) throw new TypeError('Missing Prisma schema source')
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

        if (prismaClientModule && server && lastApolloServer) {
          const { context: newContext } = newSystem.getKeystone(prismaClientModule)
          const servers = await createExpressServer(newSystem.config, newContext)
          const nextApp = (global as any)._nextApp
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
      } catch (err) {
        console.error(`Error loading your Keystone config`, err)
      }
    }
  }

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
    if (config?.server && typeof config.server?.port === 'number') {
      httpOptions.port = config.server.port
    }
    if (config?.server?.options) {
      Object.assign(httpOptions, config.server.options)
    }
    if (process.env.PORT) {
      httpOptions.port = parseInt(process.env.PORT)
    }
    if (process.env.HOST) {
      httpOptions.host = process.env.HOST
    }

    const server = httpServer.listen(httpOptions, async err => {
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

      try {
        await initKeystone()
      } catch (e) {
        await stop(server)
        initKeystonePromiseReject?.(e)
      }
    })

    await initKeystonePromise
    return async () => await stop(server)
  } else {
    await initKeystone()
    return () => Promise.resolve()
  }
}