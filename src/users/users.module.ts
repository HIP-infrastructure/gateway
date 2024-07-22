import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { CacheService } from 'src/cache/cache.service'
import { IamService } from 'src/iam/iam.service'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'
import { ProjectsService } from 'src/projects/projects.service'
import { ToolsModule } from 'src/tools/tools.module'
import { ToolsService } from 'src/tools/tools.service'
import { UsersController } from './users.controller'

@Module({
	imports: [HttpModule, ToolsModule],
	controllers: [UsersController],
	providers: [
		NextcloudService,
		ProjectsService,
		CacheService,
		IamService,
		ToolsService
	],
	exports: [UsersModule]
})
export class UsersModule {}
