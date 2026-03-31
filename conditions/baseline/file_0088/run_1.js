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

function createAsyncIterableFromPromises<T>() {
  let lastPromise = createResolvablePromise<IteratorResult<T>>()

  return {
    builds: {
      [Symbol.asyncIterator]: () => ({ next: () => lastPromise }),
    },
    addResult: (result: T) => {
      const prev = lastPromise
      lastPromise = createResolvablePromise()
      prev.resolve({ value: result, done: false })
    },
  }
}

interface DevContext {
  prismaClient: any
  expressServer: express.Express | null
  hasAddedAdminUIMiddleware: boolean
  nextApp: any
}

class DevServer {
  private cwd: string
  private flags: Pick<Flags, 'dbPush' | 'prisma' | 'quiet' | 'server' | 'ui'>
  private app: express.Express | null
  private httpServer: any
  private esbuildContext: any
  private devContext: DevContext
  private log: (message: string) => void

  constructor(
    cwd: string,
    flags: Pick<Flags, 'dbPush' | 'prisma' | 'quiet' | 'server' | 'ui'>
  ) {
    this.cwd = cwd
    this.flags = flags
    this.app = flags.server ? express() : null
    this.httpServer = this.app ? createServer(this.app) : null
    this.devContext = {
      prismaClient: null,
      expressServer: null,
      hasAddedAdminUIMiddleware: false,
      nextApp: null,
    }
    this.log = (message: string) => {
      if (!flags.quiet) console.log(message)
    }
  }

  private async setupEsbuild() {
    const esbuildConfig = await getEsbuildConfig(this.cwd)
    const { builds, addResult } = createAsyncIterableFromPromises<BuildResult>()

    this.esbuildContext = await esbuild.context({
      ...esbuildConfig,
      plugins: [
        ...(esbuildConfig.plugins ?? []),
        {
          name: 'esbuildWatchPlugin',
          setup(build: any) {
            build.onEnd(addResult)
          },
        },
      ],
    })

    try {
      const firstBuild = await this.esbuildContext.rebuild()
      addResult(firstBuild)
    } catch (e) {
      // esbuild prints everything we want users to see
    }

    this.esbuildContext.watch()
    return builds
  }

  private async stop(httpServer: any, exitMessage: string = '') {
    await this.esbuildContext.dispose()

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
      await this.devContext.prismaClient?.disconnect?.()
    } catch (err) {
      console.error('Error disconnecting from the database', err)
      throw err
    }

    if (exitMessage) throw new ExitError(1, exitMessage)
  }

  private isReady() {
    return (
      !this.flags.server ||
      (this.devContext.expressServer !== null && this.devContext.hasAddedAdminUIMiddleware)
    )
  }

  private async handleMigration(
    m: any,
    generatedPrismaSchema: string
  ): Promise<any> {
    const migration = await m.schema(generatedPrismaSchema, false)

    if (migration.unexecutable.length) {
      console.error(
        `${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`
      )
      for (const item of migration.unexecutable) {
        console.error(`  • ${item}`)
      }

      if (migration.warnings.length) {
        console.error(chalk.bold(`\n⚠️  Warnings:\n`))
        for (const warning of migration.warnings) {
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

    if (migration.warnings.length) {
      console.error(chalk.bold(`\n⚠️  Warnings:\n`))
      for (const warning of migration.warnings) {
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

    return migration
  }

  private async initializePrisma(system: any, paths: any) {
    if (!this.flags.prisma) return null

    this.log('✨ Generating GraphQL and Prisma schemas')
    const { prisma: generatedPrismaSchema } = await generateArtifacts(this.cwd, system)
    await generateTypes(this.cwd, system)
    await generatePrismaClient(this.cwd, system)

    if (this.flags.dbPush) {
      const created = await createDatabase(
        system.config.db.url,
        path.dirname(paths.schema.prisma)
      )
      if (created) this.log(`✨ Database created`)

      const migration = await withMigrate(paths.schema.prisma, system, m =>
        this.handleMigration(m, generatedPrismaSchema)
      )

      if (migration.warnings.length === 0 && migration.executedSteps === 0) {
        this.log(`✨ Database unchanged`)
      } else {
        this.log(`✨ Database synchronized with Prisma schema`)
      }
    } else {
      this.log('⚠️ Skipping database schema push')
    }

    const prismaClientModule = require(paths.prisma)
    const keystone = system.getKeystone(prismaClientModule)

    this.log('✨ Connecting to the database')
    await keystone.connect()

    return { prismaClientModule, keystone }
  }

  private async initializeServer(system: any, context: any) {
    if (!this.flags.server) return null

    this.log('✨ Creating server')
    const { apolloServer, expressServer } = await createExpressServer(
      system.config,
      context
    )
    this.log(`✅ GraphQL API ready`)

    return { apolloServer, expressServer }
  }

  private async setupAdminUI(system: any, context: any, expressServer: express.Express) {
    if (system.config.ui?.isDisabled || !this.flags.ui) return null

    if (!expressServer || !context) {
      throw new TypeError('Error trying to prepare the Admin UI')
    }

    this.log('✨ Generating Admin UI code')
    const paths = system.getPaths(this.cwd)
    await fsp.rm(paths.admin, { recursive: true, force: true })
    await generateAdminUI(system.config, system.adminMeta, paths.admin, false)

    this.log('✨ Preparing Admin UI')
    const nextApp = next({ dev: true, dir: paths.admin })
    await nextApp.prepare()
    expressServer.use(createAdminUIMiddlewareWithNextApp(system.config, context, nextApp))
    this.log(`✅ Admin UI ready`)

    return nextApp
  }

  private async initKeystone(
    initKeystonePromiseResolve: () => void,
    initKeystonePromiseReject: (err: any) => void,
    builds: AsyncIterable<BuildResult>
  ) {
    try {
      const configWithExtendHttp = await importBuiltKeystoneConfiguration(this.cwd)
      const system = createSystem(stripExtendHttpServer(configWithExtendHttp))

      let prismaClientModule: any = null
      let keystone: any = null
      let apolloServer: any = null
      let context: any = null

      const prismaResult = await this.initializePrisma(system, system.getPaths(this.cwd))
      if (prismaResult) {
        prismaClientModule = prismaResult.prismaClientModule
        keystone = prismaResult.keystone
        context = keystone.context
        this.devContext.prismaClient = context.prisma
      }

      if (!this.flags.server) {
        initKeystonePromiseResolve()
        return
      }

      const serverResult = await this.initializeServer(system, context)
      if (serverResult) {
        apolloServer = serverResult.apolloServer
        this.devContext.expressServer = serverResult.expressServer
      }

      if (configWithExtendHttp?.server?.extendHttpServer && this.httpServer && context) {
        configWithExtendHttp.server.extendHttpServer(this.httpServer, context)
      }

      const nextApp = await this.setupAdminUI(system, context, this.devContext.expressServer!)
      if (nextApp) {
        this.devContext.nextApp = nextApp
      }

      this.devContext.hasAddedAdminUIMiddleware = true
      initKeystonePromiseResolve()

      const originalPrismaSchema = printPrismaSchema(system.config, system.lists)
      let lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)
      let lastApolloServer = apolloServer ?? null

      if (system.config.telemetry !== false) {
        runTelemetry(this.cwd, system.lists, system.config.db.provider)
      }

      await this.watchForChanges(
        builds,
        system,
        originalPrismaSchema,
        lastPrintedGraphQLSchema,
        lastApolloServer,
        prismaClientModule
      )
    } catch (err) {
      initKeystonePromiseReject(err)
    }
  }

  private async watchForChanges(
    builds: AsyncIterable<BuildResult>,
    system: any,
    originalPrismaSchema: string,
    lastPrintedGraphQLSchema: string,
    lastApolloServer: any,
    prismaClientModule: any
  ) {
    for await (const buildResult of builds) {
      if (buildResult.errors.length) continue

      this.log('compiled successfully')
      try {
        const paths = system.getPaths(this.cwd)

        const resolved = require.resolve(paths.config)
        delete require.cache[resolved]

        const newConfigWithHttp = await importBuiltKeystoneConfiguration(this.cwd)
        const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

        if (this.flags.prisma) {
          if (!originalPrismaSchema) throw new TypeError('Missing Prisma schema source')

          const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
          if (originalPrismaSchema !== newPrismaSchema) {
            return this.stop(null, '🔄 Your prisma schema has changed, please restart Keystone')
          }

          if (
            JSON.stringify(newSystem.config.db.enableLogging) !==
              JSON.stringify(system.config.db.enableLogging) ||
            newSystem.config.db.url !== system.config.db.url
          ) {
            return this.stop(null, 'Your database configuration has changed, please restart Keystone')
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

        await generateTypes(this.cwd, newSystem)
        await generateAdminUI(newSystem.config, newSystem.adminMeta, paths.admin, true)

        if (prismaClientModule && this.flags.server && lastApolloServer) {
          const { context: newContext } = newSystem.getKeystone(prismaClientModule)
          const servers = await createExpressServer(newSystem.config, newContext)
          if (this.devContext.nextApp) {
            servers.expressServer.use(
              createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, this.devContext.nextApp)
            )
          }
          this.devContext.expressServer = servers.expressServer
          const prevApolloServer = lastApolloServer
          lastApolloServer = servers.apolloServer
          await prevApolloServer.stop()
        }
      } catch (err) {
        console.error(`Error loading your Keystone config`, err)
      }
    }
  }

  private setupDevStatusEndpoint(config: KeystoneConfig) {
    if (!this.app) return

    this.app.use('/__keystone/dev/status', (req, res) => {
      res.status(this.isReady() ? 200 : 501).end()
    })

    this.app.use((req, res, next) => {
      if (this.devContext.expressServer && this.devContext.hasAddedAdminUIMiddleware) {
        return this.devContext.expressServer(req