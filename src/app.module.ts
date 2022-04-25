import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { FilesModule } from './files/files.module'
import { RemoteAppModule } from './remote-app/remote-app.module'
import { ScheduleModule } from '@nestjs/schedule'
import { WorkflowsModule } from './workflows/workflows.module'
import { ToolsModule } from './tools/tools.module'
import { ConfigModule } from '@nestjs/config'
import { RedisModule } from '@liaoliaots/nestjs-redis'

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
		WorkflowsModule,
		ToolsModule,
		ConfigModule.forRoot()
	],
	controllers: [AppController],
	providers: [],
})
export class AppModule { }

