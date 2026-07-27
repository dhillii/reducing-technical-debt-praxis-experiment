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

// Extracted function to handle database creation and migration
async function handleDatabaseCreationAndMigration(
  system: any,
  dbPush: boolean,
  prisma: boolean,
  quiet: boolean,
  paths: any,
  generatedPrismaSchema: any
) {
  if (dbPush) {
    const created = await createDatabase(
      system.config.db.url,
      path.dirname(paths.schema.prisma)
    )
    if (created) {
      if (!quiet) console.log(`✨ Database created`)
    }

    const migration = await withMigrate(paths.schema.prisma, system, async m => {
      const migration_ = await m.schema(generatedPrismaSchema, false)

      if (migration_.unexecutable.length) {
        console.error(
          `${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`
        )
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
        if (migration_.warnings.length) {
          console.error(chalk.bold(`\n⚠️  Warnings:\n`))
          for (const warning of migration_.warnings) {
            console.error(`  • ${warning}`)
          }
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
      if (!quiet) console.log(`✨ Database unchanged`)
    } else {
      if (!quiet) console.log(`✨ Database synchronized with Prisma schema`)
    }
  } else {
    if (!quiet) console.log('⚠️ Skipping database schema push')
  }
}

// Extracted function to handle server creation
async function createServerAndStartListening(
  app: express.Application,
  httpServer: any,
  config: KeystoneConfig,
  initKeystonePromise: Promise<void>
) {
  const httpOptions: ListenOptions = {
    port: 3000,
  }

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

  const server = httpServer.listen(httpOptions, (err?: any) => {
    if (err) throw err

    const easyHost = [undefined, '', '::', '0.0.0.0'].includes(httpOptions.host)
      ? 'localhost'
      : httpOptions.host
    console.log(
      `⭐️ Server listening on ${httpOptions.host ?? ''}:${
        httpOptions.port
      } (http://${easyHost}:${httpOptions.port}/)`
    )
    console.log(`⭐️ GraphQL API available at ${config.graphql?.path ?? '/api/graphql'}`)

    initKeystone().catch(async err => {
      stop(server)
      initKeystonePromiseReject(err)
    })
  })

  return async () => await stop(server)
}

// Extracted function to handle Admin UI creation
async function createAdminUI(
  system: any,
  context: any,
  expressServer: express.Express,
  nextApp: any,
  paths: any
) {
  console.log('✨ Generating Admin UI code')
  await fsp.rm(paths.admin, { recursive: true, force: true })
  await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

  console.log('✨ Preparing Admin UI')
  nextApp = next({ dev: true, dir: paths.admin })
  await nextApp.prepare()
  expressServer.use(createAdminUIMiddlewareWithNextApp(system.config, context, nextApp))
  console.log(`✅ Admin UI ready`)
}

// Extracted function to handle build result processing
async function processBuildResult(
  buildResult: BuildResult,
  system: any,
  prismaClientModule: any,
  expressServer: express.Express,
  lastApolloServer: any,
  lastPrintedGraphQLSchema: string,
  paths: any
) {
  if (buildResult.errors.length) return

  console.log('compiled successfully')
  try {
    const newConfigWithHttp = await importBuiltKeystoneConfiguration(paths.cwd)
    const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

    if (system.config.prisma) {
      if (!system.originalPrismaSchema) throw new TypeError('Missing Prisma schema source')

      const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
      if (system.originalPrismaSchema !== newPrismaSchema) {
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

    await generateTypes(paths.cwd, newSystem)
    await generateAdminUI(newSystem.config, newSystem.adminMeta, paths.admin, true)
    if (prismaClientModule) {
      if (system.config.server && lastApolloServer) {
        const { context: newContext } = newSystem.getKeystone(prismaClientModule)
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
  } catch (err) {
    console.error(`Error loading your Keystone config`, err)
  }
}

// Extracted function to handle server stopping
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
  let expressServer: express.Express | null = null
  let hasAddedAdminUIMiddleware = false
  let nextApp: any = null

  const initKeystone = async () => {
    const configWithExtendHttp = await importBuiltKeystoneConfiguration(cwd)
    const system = createSystem(stripExtendHttpServer(configWithExtendHttp))
    const paths = system.getPaths(cwd)

    if (prisma) {
      log('✨ Generating GraphQL and Prisma schemas')
      const { prisma: generatedPrismaSchema } = await generateArtifacts(cwd, system)
      await generateTypes(cwd, system)
      await generatePrismaClient(cwd, system)

      await handleDatabaseCreationAndMigration(
        system,
        dbPush,
        prisma,
        quiet,
        paths,
        generatedPrismaSchema
      )
    }

    const keystone = system.getKeystone(require(paths.prisma))
    log('✨ Connecting to the database')
    await keystone.connect()

    if (server) {
      log('✨ Creating server')
      const { apolloServer, expressServer: expressServerResult } = await createExpressServer(
        system.config,
        keystone.context
      )
      expressServer = expressServerResult
      log(`✅ GraphQL API ready`)
    }

    if (configWithExtendHttp?.server?.extendHttpServer && httpServer && keystone.context) {
      configWithExtendHttp.server.extendHttpServer(httpServer, keystone.context)
    }

    prismaClient = keystone.context?.prisma

    if (!system.config.ui?.isDisabled && ui) {
      await createAdminUI(system, keystone.context, expressServer, nextApp, paths)
    }

    hasAddedAdminUIMiddleware = true

    if (system.config.telemetry !== false) {
      runTelemetry(cwd, system.lists, system.config.db.provider)
    }

    for await (const buildResult of builds) {
      await processBuildResult(
        buildResult,
        system,
        require(paths.prisma),
        expressServer,
        apolloServer,
        printSchema(system.graphql.schemas.public),
        paths
      )
    }
  }

  let initKeystonePromiseResolve: () => void | undefined
  let initKeystonePromiseReject: (err: any) => void | undefined
  const initKeystonePromise = new Promise<void>((resolve, reject) => {
    initKeystonePromiseResolve = resolve
    initKeystonePromiseReject = reject
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

    return createServerAndStartListening(app, httpServer, configWithExtendHttp, initKeystonePromise)
  } else {
    await initKeystone()
    return () => Promise.resolve()
  }
}