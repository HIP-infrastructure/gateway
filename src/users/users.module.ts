import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { CacheService } from 'src/cache/cache.service'
import { IamEbrainsService } from 'src/iam-ebrains/iam-ebrains.service'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'
import { ProjectsService } from 'src/projects/projects.service'
import { UsersController } from './users.controller'

@Module({
	imports: [HttpModule],
	controllers: [UsersController],
	providers: [NextcloudService, ProjectsService, CacheService, IamEbrainsService],
	exports: [UsersModule],
})
export class UsersModule {}
