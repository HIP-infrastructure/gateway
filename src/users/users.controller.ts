import { Controller, Get, Logger, Param, Request as Req } from '@nestjs/common'
import { Request } from 'express'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'

const NEXTCLOUD_HIP_SETTINGS = [
	'text workspace_enabled 0',
	'recommendations enabled false',
	'files show_hidden 1',
]

@Controller('users')
export class UsersController {
	private readonly logger = new Logger('UsersController')

	constructor(private readonly nextcloudService: NextcloudService) {}


	@Get('/isLoggedIn')
	async isLoggedIn(@Req() req: Request) {
		return this.nextcloudService.authenticate(req)
	}

	@Get(':userid')
	async findOne(@Param('userid') userid: string, @Req() req: Request) {
		return this.nextcloudService.authenticate(req).then(() => {
			return this.nextcloudService.user(userid)
		})
	}

	@Get(':userid/set-workspace')
	async settings(@Param('userid') userid: string, @Req() req: Request) {
		const validatedId = await this.nextcloudService.uid(req)
		if (userid === validatedId) {
			return Promise.all(
				NEXTCLOUD_HIP_SETTINGS.map((setting, i) => {
					return this.nextcloudService.userSettings(userid, setting)
				})
			)
		}
	}

	@Get(':userid/scan-files')
	async scanFiles(@Param('userid') userid: string, @Req() req: Request) {
		const validatedId = await this.nextcloudService.uid(req)
		if (userid === validatedId) {
			return this.nextcloudService.scanUserFiles(userid)
		}
	}
}
