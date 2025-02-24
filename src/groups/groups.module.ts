import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'
import { GroupsController } from './groups.controller'

@Module({
	imports: [HttpModule],
	controllers: [GroupsController],
	providers: [NextcloudService]
})
export class GroupsModule {}
