import { NestFactory } from '@nestjs/core'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { AppModule } from './app.module'
import * as cookieParser from 'cookie-parser'
import { Transport } from '@nestjs/microservices';


const globalPrefix = '/api/v1'

async function bootstrap() {
	const app = await NestFactory.create(AppModule)
	app.connectMicroservice({
		transport: Transport.RMQ,
		options: {
			urls: [
				'amqp://guest:guest@hub:5672'
			],
			queue: 'tags',
			queueOptions: {
				durable: false
			},
		}
	});



	app.enableShutdownHooks()
	app.setGlobalPrefix(globalPrefix)
	app.enableCors()
	app.use(cookieParser())

	// const options = new DocumentBuilder()
	// 	.setTitle('API Gateway')
	// 	.setDescription('Human Intracerebral EEG Platform')
	// 	.setVersion('1.0')
	// 	.addTag('gateway')
	// 	.setBasePath(globalPrefix)
	// 	.build()
	// const document = SwaggerModule.createDocument(app, options)
	// SwaggerModule.setup('doc', app, document)

	// await app.startAllMicroservices();
	await app.listen(4000)


}
bootstrap()
