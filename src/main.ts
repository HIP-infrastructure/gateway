import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import * as cookieParser from 'cookie-parser'
import { NestExpressApplication } from '@nestjs/platform-express'
import { join } from 'path'
import { getLogLevels } from './common/utils/shared.utils'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { ValidationPipe } from '@nestjs/common'

const globalPrefix = '/api/v1'
const publicFolder = join(__dirname, '../public')

const DEFAULT_LEVEL = process.env.NODE_ENV === 'production' ? 1 : 4
const LOG_LEVEL = process.env.LOG_LEVEL
	? parseInt(process.env.LOG_LEVEL)
	: DEFAULT_LEVEL

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const config = new DocumentBuilder()
	.setTitle('HIP Gateway API')
	.setDescription('The HIP API description')
	.setVersion('1.0')
	.addTag('hip')
	.build()

async function bootstrap() {
	const app = await NestFactory.create<NestExpressApplication>(AppModule, {
		logger: getLogLevels(LOG_LEVEL)
	})
	app.enableShutdownHooks()
	app.setGlobalPrefix(globalPrefix)
	app.enableCors()
	app.use(cookieParser())
	app.useStaticAssets(publicFolder)
	app.useGlobalPipes(
		new ValidationPipe({
			transform: true
		})
	)

	const document = SwaggerModule.createDocument(app, config)
	SwaggerModule.setup('api', app, document)

	await app.listen(4000)
}
bootstrap()
