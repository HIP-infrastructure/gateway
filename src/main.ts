import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import * as cookieParser from 'cookie-parser'
import { NestExpressApplication } from '@nestjs/platform-express'
import { join } from 'path';
import { getLogLevels } from './common/utils/shared.utils'

const globalPrefix = '/api/v1'
const publicFolder = join(__dirname, '../public')

const DEFAULT_LEVEL = process.env.NODE_ENV === 'production' ? 1 : 4
const LOG_LEVEL = process.env.LOG_LEVEL
  ? parseInt(process.env.LOG_LEVEL)
  : DEFAULT_LEVEL

async function bootstrap() {
	const app = await NestFactory.create<NestExpressApplication>(AppModule, {
		logger: getLogLevels(LOG_LEVEL),
	})
	app.enableShutdownHooks()
	app.setGlobalPrefix(globalPrefix)
	app.enableCors()
	app.use(cookieParser())
	app.useStaticAssets(publicFolder)

	await app.listen(4000)
}
bootstrap()
