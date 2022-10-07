import { Controller, Get, Param, Request as Req } from '@nestjs/common'
import { Request } from 'express'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'

@Controller('groups')
export class GroupsController {
	constructor(private readonly nextcloudService: NextcloudService) {}

	@Get(':groupid/users')
	async findOne(@Param('groupid') groupid: string, @Req() req: Request): Promise<string[]> {
		return await this.nextcloudService.authenticate(req).then(() => {
			return this.nextcloudService.usersForGroup(groupid)
		})
	}
}
