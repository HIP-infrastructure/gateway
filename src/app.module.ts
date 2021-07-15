import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { FilesModule } from './files/files.module';
import { RemoteAppModule } from './remote-app/remote-app.module';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from 'nestjs-redis';
@Module({
  imports: [
    FilesModule,
    RemoteAppModule,
    ScheduleModule.forRoot(),
    RedisModule.register({
      name: 'containers',
      url: 'redis://cache',
      port: 6379,
      db: 1,
    }),
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
