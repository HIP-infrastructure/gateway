import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { FilesModule } from './files/files.module'
import { RemoteAppModule } from './remote-app/remote-app.module'
import { ScheduleModule } from '@nestjs/schedule'
import { ToolsModule } from './tools/tools.module'
import { ConfigModule } from '@nestjs/config'
import { RedisModule } from '@liaoliaots/nestjs-redis'
import { UsersModule } from './users/users.module';

@Module({
	imports: [
		FilesModule,
		RemoteAppModule,
		ScheduleModule.forRoot(),
		RedisModule.forRoot({
			config: {
				host: process.env.REDIS_HOST,
				name: 'containers',
				db: 1,
			}
		}),
		ToolsModule,
		ConfigModule.forRoot(),
		UsersModule
	],
	controllers: [AppController],
	providers: [],
})
export class AppModule { }

