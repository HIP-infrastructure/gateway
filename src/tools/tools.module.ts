import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { FilesModule } from 'src/files/files.module'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'
import { UsersModule } from 'src/users/users.module'
import { ToolsController } from './tools.controller'
import { ToolsService } from './tools.service'

@Module({
	imports: [HttpModule, UsersModule, FilesModule],
	controllers: [ToolsController],
	providers: [ToolsService, NextcloudService],
})
export class ToolsModule {}
