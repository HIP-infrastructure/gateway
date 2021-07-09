import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

const globalPrefix = '/api/v1'

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.setGlobalPrefix(globalPrefix);
  app.enableCors();

  const options = new DocumentBuilder()
    .setTitle('API Gateway')
    .setDescription('Human Intracerebral EEG Platform')
    .setVersion('1.0')
    .addTag('gateway')
    .setBasePath(globalPrefix)
    .build();
  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('doc', app, document);

  await app.listen(4000);
}
bootstrap();
