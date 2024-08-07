import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { FilesModule } from 'src/files/files.module'
import { IamModule } from 'src/iam/iam.module'
import { IamService } from 'src/iam/iam.service'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'
import { ProjectsModule } from 'src/projects/projects.module'
import { ProjectsService } from 'src/projects/projects.service'
import { ToolsModule } from 'src/tools/tools.module'
import { ToolsService } from 'src/tools/tools.service'
import { UsersModule } from 'src/users/users.module'
import { CacheService } from '../cache/cache.service'
import { RemoteAppController } from './remote-app.controller'
import { RemoteAppService } from './remote-app.service'

@Module({
	imports: [
		IamModule,
		HttpModule,
		FilesModule,
		UsersModule,
		ProjectsModule,
		ToolsModule
	],
	controllers: [RemoteAppController],
	providers: [
		IamService,
		RemoteAppService,
		CacheService,
		NextcloudService,
		ProjectsService,
		ToolsService
	]
})
export class RemoteAppModule {}
