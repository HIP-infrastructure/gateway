import { Controller, Get, Logger, Param, Request as Req } from '@nestjs/common'
import { Request } from 'express'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'

@Controller('users')
export class UsersController {
	private readonly logger = new Logger('UsersController')

	constructor(private readonly nextcloudService: NextcloudService) {}

	@Get(':userid')
	async findOne(@Param('userid') userid: string, @Req() req: Request) {
		await this.nextcloudService.validate(req)
		return this.nextcloudService.user(userid)
	}
}
