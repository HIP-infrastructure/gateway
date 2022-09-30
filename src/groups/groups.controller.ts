import { Controller, Get, Param, Request as Req } from '@nestjs/common'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'
import { Request } from 'express'

@Controller('groups')
export class GroupsController {
	constructor(private readonly nextcloudService: NextcloudService) {}

	@Get(':groupid/users')
	async findOne(@Param('groupid') groupid: string, @Req() req: Request) {
		await this.nextcloudService.validate(req)
		return this.nextcloudService.usersForGroup(groupid)
	}
}
