import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { NextcloudModule } from 'src/nextcloud/nextcloud.module'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'
import { UsersModule } from 'src/users/users.module'
import { FilesController } from './files.controller'
import { FilesService } from './files.service'

@Module({
	imports: [HttpModule, UsersModule, NextcloudModule],
	controllers: [FilesController],
	providers: [FilesService, NextcloudService],
	exports: [FilesModule],
})
export class FilesModule {}
