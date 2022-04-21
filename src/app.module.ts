import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { FilesModule } from './files/files.module'
import { RemoteAppModule } from './remote-app/remote-app.module'
import { ScheduleModule } from '@nestjs/schedule'
import { RedisModule } from 'nestjs-redis'
import { WorkflowsModule } from './workflows/workflows.module';
import { ToolsModule } from './tools/tools.module';
import { ConfigModule } from '@nestjs/config'
@Module({
	imports: [
		FilesModule,
		RemoteAppModule,
		ScheduleModule.forRoot(),
		RedisModule.register({
			name: 'containers',
			host: process.env.REDIS_HOST,
			db: 1,
		}),
		WorkflowsModule,
		ToolsModule,
		ConfigModule.forRoot()
	],
	controllers: [AppController],
	providers: [],
})
export class AppModule {}

