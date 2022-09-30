import { RedisModule } from '@liaoliaots/nestjs-redis'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { AppController } from './app.controller'
import { FilesModule } from './files/files.module'
import { GroupsModule } from './groups/groups.module'
import { NextcloudModule } from './nextcloud/nextcloud.module'
import { RemoteAppModule } from './remote-app/remote-app.module'
import { ToolsModule } from './tools/tools.module'
import { UsersModule } from './users/users.module'

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
		UsersModule,
		GroupsModule,
		NextcloudModule
	],
	controllers: [AppController],
	providers: [],
})
export class AppModule { }

