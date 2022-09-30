import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { GroupsController } from './groups.controller'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'

@Module({
	imports: [HttpModule],
	controllers: [GroupsController],
	providers: [NextcloudService],
})
export class GroupsModule {}
