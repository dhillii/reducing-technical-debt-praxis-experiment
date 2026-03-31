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

interface DevState {
  prismaClient: any
  expressServer: express.Express | null
  hasAddedAdminUIMiddleware: boolean
  nextApp: any
  lastPrintedGraphQLSchema: string
  lastApolloServer: any
}

interface InitKeystoneResult {
  system: any
  context?: any
  prismaClientModule?: any
  apolloServer?: any
  expressServer?: express.Express
}

class DevServer {
  private cwd: string
  private flags: Pick<Flags, 'dbPush' | 'prisma' | 'quiet' | 'server' | 'ui'>
  private log: (message: string) => void
  private app: express.Express | null
  private httpServer: any
  private esbuildContext: any
  private state: DevState
  private initKeystonePromise: Promise<void>
  private initKeystonePromiseResolve!: () => void
  private initKeystonePromiseReject!: (err: any) => void

  constructor(
    cwd: string,
    flags: Pick<Flags, 'dbPush' | 'prisma' | 'quiet' | 'server' | 'ui'>
  ) {
    this.cwd = cwd
    this.flags = flags
    this.log = (message: string) => {
      if (!flags.quiet) console.log(message)
    }
    this.app = flags.server ? express() : null
    this.httpServer = this.app ? createServer(this.app) : null
    this.state = {
      prismaClient: null,
      expressServer: null,
      hasAddedAdminUIMiddleware: false,
      nextApp: null,
      lastPrintedGraphQLSchema: '',
      lastApolloServer: null,
    }
    this.initKeystonePromise = new Promise<void>((resolve, reject) => {
      this.initKeystonePromiseResolve = resolve
      this.initKeystonePromiseReject = reject
    })
  }

  private isReady(): boolean {
    return (
      !this.flags.server ||
      (this.state.expressServer !== null && this.state.hasAddedAdminUIMiddleware)
    )
  }

  private async stop(aHttpServer: any, exitMessage: string = ''): Promise<void> {
    await this.esbuildContext.dispose()

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
      await this.state.prismaClient?.disconnect?.()
    } catch (err) {
      console.error('Error disconnecting from the database', err)
      throw err
    }

    if (exitMessage) throw new ExitError(1, exitMessage)
  }

  private async setupEsbuild(): Promise<AsyncIterable<BuildResult>> {
    let lastPromise = resolvablePromise<IteratorResult<BuildResult>>()

    const builds: AsyncIterable<BuildResult> = {
      [Symbol.asyncIterator]: () => ({ next: () => lastPromise }),
    }

    const addBuildResult = (build: BuildResult) => {
      const prev = lastPromise
      lastPromise = resolvablePromise()
      prev.resolve({ value: build, done: false })
    }

    const esbuildConfig = await getEsbuildConfig(this.cwd)
    this.esbuildContext = await esbuild.context({
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
      const firstBuild = await this.esbuildContext.rebuild()
      addBuildResult(firstBuild)
    } catch (e) {
      // esbuild prints everything we want users to see
    }

    this.esbuildContext.watch()
    return builds
  }

  private async handlePrismaDbPush(
    system: any,
    generatedPrismaSchema: string,
    paths: any
  ): Promise<void> {
    const created = await createDatabase(system.config.db.url, path.dirname(paths.schema.prisma))
    if (created) this.log(`✨ Database created`)

    const migration = await withMigrate(paths.schema.prisma, system, async m => {
      const migration_ = await m.schema(generatedPrismaSchema, false)

      if (migration_.unexecutable.length) {
        this.printMigrationErrors(migration_.unexecutable, migration_.warnings)
        this.log('\nTo apply this migration, we need to reset the database')

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
      this.log(`✨ Database unchanged`)
    } else {
      this.log(`✨ Database synchronized with Prisma schema`)
    }
  }

  private printMigrationErrors(unexecutable: string[], warnings: string[]): void {
    console.error(`${chalk.bold.red('\n⚠️ We found changes that cannot be executed:\n')}`)
    for (const item of unexecutable) {
      console.error(`  • ${item}`)
    }

    if (warnings.length) {
      console.error(chalk.bold(`\n⚠️  Warnings:\n`))
      for (const warning of warnings) {
        console.error(`  • ${warning}`)
      }
    }
  }

  private async initializePrismaAndServer(
    system: any,
    configWithExtendHttp: KeystoneConfig
  ): Promise<InitKeystoneResult> {
    const paths = system.getPaths(this.cwd)

    if (this.flags.prisma) {
      this.log('✨ Generating GraphQL and Prisma schemas')
      const { prisma: generatedPrismaSchema } = await generateArtifacts(this.cwd, system)
      await generateTypes(this.cwd, system)
      await generatePrismaClient(this.cwd, system)

      if (this.flags.dbPush) {
        await this.handlePrismaDbPush(system, generatedPrismaSchema, paths)
      } else {
        this.log('⚠️ Skipping database schema push')
      }
    }

    const prismaClientModule = this.flags.prisma ? require(paths.prisma) : null
    const keystone = system.getKeystone(prismaClientModule)

    this.log('✨ Connecting to the database')
    await keystone.connect()

    if (!this.flags.server) {
      return {
        system,
        context: keystone.context,
        prismaClientModule,
      }
    }

    this.log('✨ Creating server')
    const { apolloServer, expressServer } = await createExpressServer(
      system.config,
      keystone.context
    )
    this.log(`✅ GraphQL API ready`)

    return {
      system,
      context: keystone.context,
      expressServer,
      apolloServer,
      prismaClientModule,
    }
  }

  private async setupAdminUI(
    system: any,
    context: any,
    expressServer: express.Express
  ): Promise<any> {
    if (system.config.ui?.isDisabled || !this.flags.ui) {
      return null
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

  private async handleConfigChange(
    system: any,
    newSystem: any,
    originalPrismaSchema: string
  ): Promise<boolean> {
    if (this.flags.prisma) {
      if (!originalPrismaSchema) throw new TypeError('Missing Prisma schema source')

      const newPrismaSchema = printPrismaSchema(newSystem.config, newSystem.lists)
      if (originalPrismaSchema !== newPrismaSchema) {
        await this.stop(null, '🔄 Your prisma schema has changed, please restart Keystone')
        return false
      }

      if (
        JSON.stringify(newSystem.config.db.enableLogging) !==
          JSON.stringify(system.config.db.enableLogging) ||
        newSystem.config.db.url !== system.config.db.url
      ) {
        await this.stop(null, 'Your database configuration has changed, please restart Keystone')
        return false
      }
    }

    return true
  }

  private async updateGraphQLSchema(
    newSystem: any,
    lastPrintedGraphQLSchema: string
  ): Promise<string> {
    const paths = newSystem.getPaths(this.cwd)
    const newPrintedGraphQLSchema = printSchema(newSystem.graphql.schemas.public)

    if (newPrintedGraphQLSchema !== lastPrintedGraphQLSchema) {
      await fsp.writeFile(
        paths.schema.graphql,
        getFormattedGraphQLSchema(newPrintedGraphQLSchema)
      )
      return newPrintedGraphQLSchema
    }

    return lastPrintedGraphQLSchema
  }

  private async watchBuilds(
    builds: AsyncIterable<BuildResult>,
    system: any,
    context: any,
    originalPrismaSchema: string
  ): Promise<void> {
    this.state.lastPrintedGraphQLSchema = printSchema(system.graphql.schemas.public)

    for await (const buildResult of builds) {
      if (buildResult.errors.length) continue

      this.log('compiled successfully')
      try {
        const paths = system.getPaths(this.cwd)

        const resolved = require.resolve(paths.config)
        delete require.cache[resolved]

        const newConfigWithHttp = await importBuiltKeystoneConfiguration(this.cwd)
        const newSystem = createSystem(stripExtendHttpServer(newConfigWithHttp))

        if (!(await this.handleConfigChange(system, newSystem, originalPrismaSchema))) {
          return
        }

        this.state.lastPrintedGraphQLSchema = await this.updateGraphQLSchema(
          newSystem,
          this.state.lastPrintedGraphQLSchema
        )

        await generateTypes(this.cwd, newSystem)
        await generateAdminUI(newSystem.config, newSystem.adminMeta, paths.admin, true)

        if (this.state.expressServer && this.state.lastApolloServer) {
          const { context: newContext } = newSystem.getKeystone(require(paths.prisma))
          const servers = await createExpressServer(newSystem.config, newContext)

          if (this.state.nextApp) {
            servers.expressServer.use(
              createAdminUIMiddlewareWithNextApp(newSystem.config, newContext, this.state.nextApp)
            )
          }

          this.state.expressServer = servers.expressServer
          const prevApolloServer = this.state.lastApolloServer
          this.state.lastApolloServer = servers.apolloServer
          await prevApolloServer.stop()
        }
      } catch (err) {
        console.error(`Error loading your Keystone config`, err)
      }
    }
  }

  private setupDevStatusEndpoint(config: KeystoneConfig): void {
    if (!this.app) return

    this.app.use('/__keystone/dev/status', (req, res) => {
      res.status(this.isReady() ? 200 : 501).end()
    })

    this.app.use((req, res, next) => {
      if (this.state.expressServer && this.state.hasAddedAdminUIMiddleware) {
        return this.state.expressServer(req, res, next)
      }

      const { pathname } = new URL(req.url, 'http://ks')
      if (this.state.expressServer && pathname === (config.graphql?.path ?? '/api/graphql')) {
        return this.state.expressServer(req, res, next)
      }

      res.sendFile(devLoadingHTMLFilepath)
    })
  }

  private getListenOptions(config: KeystoneConfig): ListenOptions {
    const httpOptions: ListenOptions = { port: 3000 }

    if (config