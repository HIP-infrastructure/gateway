import {
	Controller,
	Get,
	HttpException,
	HttpStatus,
	Logger,
	Param,
	Request as Req
} from '@nestjs/common'
import { Request } from 'express'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'
import { ProjectsService } from 'src/projects/projects.service'

const NEXTCLOUD_HIP_SETTINGS = [
	'text workspace_enabled 0',
	'recommendations enabled false',
	'files show_hidden 1'
]

@Controller('users')
export class UsersController {
	private readonly logger = new Logger('UsersController')

	constructor(
		private readonly nextcloudService: NextcloudService,
		private readonly projectsService: ProjectsService
	) {}

	@Get()
	async findAll(@Req() req: Request) {
		return this.nextcloudService.authenticate(req).then(() => {
			return this.nextcloudService.users()
		})
	}

	@Get('/isLoggedIn')
	async isLoggedIn(@Req() req: Request) {
		return this.nextcloudService.authenticate(req)
	}

	@Get(':userId')
	async findOne(@Req() req: Request, @Param('userId') userId: string) {
		const validatedId = await this.nextcloudService.authUserIdFromRequest(req)
		if (userId !== validatedId) {
			throw new HttpException('User is not logged in', HttpStatus.UNAUTHORIZED)
		}

		const user = await this.nextcloudService.user(userId)
		const hasProjectsAdminRole = await this.projectsService.isProjectsAdmin(
			userId
		)

		return {
			...user,
			hasProjectsAdminRole
		}
	}

	@Get(':userid/scan-files')
	async scanFiles(@Param('userid') userid: string, @Req() req: Request) {
		const validatedId = await this.nextcloudService.authUserIdFromRequest(req)
		if (userid === validatedId) {
			return this.nextcloudService.scanUserFiles(userid)
		}
	}
}
