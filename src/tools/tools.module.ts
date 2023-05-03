import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'
import { ToolsController } from './tools.controller'
import { ToolsService } from './tools.service'

@Module({
	imports: [HttpModule],
	controllers: [ToolsController],
	providers: [ToolsService, NextcloudService],
	exports: [ToolsService]
})
export class ToolsModule {}
