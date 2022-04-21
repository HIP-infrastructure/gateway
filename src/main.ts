import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import * as cookieParser from 'cookie-parser'


const globalPrefix = '/api/v1'

async function bootstrap() {
	const app = await NestFactory.create(AppModule)
	app.enableShutdownHooks()
	app.setGlobalPrefix(globalPrefix)
	app.enableCors()
	app.use(cookieParser())

	await app.listen(4000)
}
bootstrap()
