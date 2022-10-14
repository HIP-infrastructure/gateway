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
	Delete,
	Request as Req,
	Response as Res,
	HttpException,
} from '@nestjs/common'
import { Request, Response } from 'express'
import { RemoteAppService } from './remote-app.service'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'

@Controller('remote-app')
export class RemoteAppController {
	constructor(
		private readonly remoteAppService: RemoteAppService,
		private readonly nextcloudService: NextcloudService
	) {}

	private readonly logger = new Logger('RemoteAppController')

	@Get('/apps')
	availableApps() {
		return this.remoteAppService.availableApps()
	}

	@Get('/containers')
	async getContainers(
		@Query('userId') userId: string,
		@Query('isAdmin') isAdmin: string,
		@Req() req: Request
	) {
		return this.nextcloudService.authenticate(req).then(async () => {
			if (isAdmin === '1') {
				const { groups } = await this.nextcloudService.user(userId)
				if (groups.includes('admin')) {
					return this.remoteAppService.getAllContainers()
				}
			}

			return this.remoteAppService.getContainers(userId)
		})
	}

	@Post('/containers')
	async createSession(
		@Body('userId') userId: string,
		@Body('sessionId') sessionId: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		this.logger.debug(`/startSessionWithUserId for ${userId}`)
		return this.nextcloudService.authenticate(req).then(() => {
			const c = this.remoteAppService.startSessionWithUserId(sessionId, userId)
			return res.status(HttpStatus.OK).json(c)
		})
	}

	@Post('/containers/:sessionId/apps')
	async createApp(
		@Param('sessionId') sessionId: string,
		@Body('appName') appName: string,
		@Body('appId') appId: string,
		@Body('userId') userId: string,
		@Req() req: Request
	) {
		this.logger.debug(`/createApp + ${appName} for ${userId}`)
		await this.nextcloudService.authenticate(req)

		return this.remoteAppService.startApp(sessionId, appId, appName, userId)
	}

	@Delete('/containers/:sessionId')
	async removeAppsAndSession(
		@Param('sessionId') sessionId: string,
		@Body('userId') userId: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		this.logger.debug(`/removeAppsAndSession at ${sessionId} for ${userId}`)
		return this.nextcloudService.authenticate(req).then(() => {
			const c = this.remoteAppService.removeAppsAndSession(sessionId, userId)
			return res.status(HttpStatus.OK).json(c)
		})
	}

	@Put('/containers/:sessionId')
	async pauseOrResumeAppsAndSession(
		@Param('sessionId') sessionId: string,
		@Body('userId') userId: string,
		@Body('cmd') cmd: string,
		@Req() req: Request
	) {
		this.logger.debug(`/pauseOrResumeAppsAndSession  ${cmd} for ${userId}`)
		return this.nextcloudService.authenticate(req).then(() => {
			if (cmd === 'pause') {
				return this.remoteAppService.pauseAppsAndSession(sessionId)
			} else if (cmd === 'resume') {
				return this.remoteAppService.resumeAppsAndSession(sessionId)
			}

			return HttpStatus.NOT_FOUND
		})
	}

	@Delete('/containers/:sessionId/apps/:appId')
	async stopApp(
		@Param('sessionId') sessionId: string,
		@Param('appId') appId: string,
		@Body('userId') userId: string,
		@Req() req: Request
	) {
		this.logger.debug(`/stopApp ${appId} for ${userId}`)
		return this.nextcloudService.authenticate(req).then(async () => {
			return await this.remoteAppService.stopAppInSession(sessionId, appId)
		})
	}

	@Delete('/containers/force/:sessionId')
	async forceRemove(
		@Param('sessionId') sessionId: string,
		@Req() req: Request
	) {
		this.logger.debug(`/forceRemove for ${sessionId}`)
		return this.nextcloudService.authenticate(req).then(async () => {
			return this.remoteAppService.forceRemove(sessionId)
		})
	}
}
