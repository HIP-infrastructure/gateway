import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { GroupsService } from './groups.service'
import { GroupsController } from './groups.controller'

@Module({
	imports: [HttpModule],
	controllers: [GroupsController],
	providers: [GroupsService],
})
export class GroupsModule {}
