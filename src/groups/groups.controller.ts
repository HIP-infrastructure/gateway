import { Controller, Get, Param } from '@nestjs/common'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'

@Controller('groups')
export class GroupsController {
  constructor(private readonly nextcloudService: NextcloudService) {}

  @Get(':groupid/users')
	async findOne(@Param('groupid') groupid: string) {		
		return this.nextcloudService.usersForGroup(groupid)
	}
}
