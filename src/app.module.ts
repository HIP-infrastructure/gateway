import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { FilesModule } from './files/files.module';
import { RemoteAppModule } from './remote-app/remote-app.module';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';


@Module({
  imports: [
    FilesModule,
    RemoteAppModule,
    ScheduleModule.forRoot(),
    // TypeOrmModule.forRoot({
    //   type: 'mongodb',
    //   host: process.env.HOSTNAME,
    //   port: 27017,
    //   database: 'test',
    //   entities: [],
    //   synchronize: true,
    // }),
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule { }