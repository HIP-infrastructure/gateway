import { Controller, Get, Param } from '@nestjs/common'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'

@Controller('users')
export class UsersController {
	constructor(private readonly nextcloudService: NextcloudService) {}

	@Get(':userid')
	async findOne(@Param('userid') userid: string) {
		return this.nextcloudService.user(userid)
	}
}
