import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import * as cookieParser from 'cookie-parser'
import { NestExpressApplication } from '@nestjs/platform-express'
import { join } from 'path';


const globalPrefix = '/api/v1'

async function bootstrap() {
	const app = await NestFactory.create<NestExpressApplication>(AppModule)
	app.enableShutdownHooks()
	app.setGlobalPrefix(globalPrefix)
	app.enableCors()
	app.use(cookieParser())
	app.useStaticAssets(join(__dirname, '/../public'));

	await app.listen(4000)
}
bootstrap()
