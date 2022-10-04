import {
	Body,
	Controller,
	Get,
	HttpStatus,
	Logger,
	Param,
	Post,
	Query,
	Put,
	Request as Req,
	Response as Res,
} from '@nestjs/common'
import { Request, Response } from 'express'
import { RemoteAppService } from './remote-app.service'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'

@Controller('remote-app')
export class RemoteAppController {
	constructor(
		private readonly remoteAppService: RemoteAppService,
		private readonly nextcloudService: NextcloudService) {}

	private readonly logger = new Logger('RemoteAppController')

	@Get('/containers/:userId')
	async getContainers(
		@Param('userId') userId: string,
		@Query('isAdmin') isAdmin: string, 
		@Req() req: Request
	) {
		await this.nextcloudService.validate(req)
		if (isAdmin === '1') {
			const { groups } = await this.nextcloudService.user(userId)
			if (groups.includes('admin')) {
				return this.remoteAppService.getAllContainers()
			} 
		}

		return this.remoteAppService.getContainers(userId)
	}

	@Post('/containers/:sessionId/start')
	async startSessionWithUserId(
		@Param('sessionId') sessionId: string,
		@Body('userId') userId: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		this.logger.debug('/startSessionWithUserId', sessionId)
		await this.nextcloudService.validate(req)

		const json = await this.remoteAppService.startSessionWithUserId(
			sessionId,
			userId
		)

		return res.status(HttpStatus.CREATED).json(json)
	}

	@Post('/containers/:sessionId/apps/:appId/start')
	async startApp(
		@Param('sessionId') sessionId: string,
		@Param('appId') appId: string,
		@Body('appName') appName: string,
		@Body('userId') userId: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		this.logger.debug('/startApp', sessionId)
		const { cookie, requesttoken } = req.headers
		await this.nextcloudService.validate(req)

		return await this.remoteAppService.startApp(
			sessionId,
			appId,
			appName,
			userId,
			cookie,
			requesttoken
		)
	}

	@Put('/containers/:sessionId/apps/:appId/stop')
	async stopApp(
		@Param('sessionId') sessionId: string,
		@Param('appId') appId: string,
		@Body('userId') userId: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		this.logger.debug('/stopApp', appId)
		await this.nextcloudService.validate(req)

		const json = await this.remoteAppService.stopAppInSession(sessionId, appId)

		return res.status(HttpStatus.CREATED).json(json)
	}

	@Put('/containers/:sessionId/remove')
	async removeAppsAndSession(
		@Param('sessionId') sessionId: string,
		@Body('userId') userId: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		await this.nextcloudService.validate(req)
		const json = this.remoteAppService.removeAppsAndSession(sessionId)

		return res.status(HttpStatus.OK).json(json)
	}

	@Put('/containers/:sessionId/pause')
	async pauseAppsAndSession(
		@Param('sessionId') sessionId: string,
		@Body('userId') userId: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		await this.nextcloudService.validate(req)
		const json = this.remoteAppService.pauseAppsAndSession(sessionId)

		return res.status(HttpStatus.OK).json(json)
	}

	@Put('/containers/:sessionId/resume')
	async resumeAppsAndSession(
		@Param('sessionId') sessionId: string,
		@Body('userId') userId: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		await this.nextcloudService.validate(req)
		const json = this.remoteAppService.resumeAppsAndSession(sessionId)

		return res.status(HttpStatus.OK).json(json)
	}

	@Get('/apps')
	availableApps() {
		return this.remoteAppService.availableApps()
	}

	// DEBUG methods
	@Get('/containers/fetch')
	pollRemoteState() {
		this.remoteAppService.pollRemoteState()
	}

	@Get('/containers/forceRemove/:sessionId')
	async forceRemove(@Param('sessionId') sessionId: string, @Req() req: Request) {
		await this.nextcloudService.validate(req)
		this.remoteAppService.forceRemove(sessionId)
	}
}
