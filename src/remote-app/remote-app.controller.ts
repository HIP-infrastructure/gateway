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

	private async auth(req: Request, userId: string) {
		return this.nextcloudService.validate(req).then(id => {
			if (id !== userId) {
				throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)
			}

			return true
		}).catch(error => {
			throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)
		})
	}

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
		await this.nextcloudService.validate(req)
		if (isAdmin === '1') {
			const { groups } = await this.nextcloudService.user(userId)
			if (groups.includes('admin')) {
				return this.remoteAppService.getAllContainers()
			}
		}

		return this.remoteAppService.getContainers(userId)
	}

	@Post('/containers')
	async createSession(
		@Body('userId') userId: string,
		@Body('sessionId') sessionId: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		this.logger.debug(`/startSessionWithUserId for ${userId}`)
		return this.auth(req, userId).then(() => {
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
		const { cookie, requesttoken } = req.headers
		await this.nextcloudService.validate(req)

		return this.remoteAppService.startApp(
			sessionId,
			appId,
			appName,
			userId,
			cookie,
			requesttoken
		)
	}

	@Delete('/containers/:sessionId')
	async removeAppsAndSession(
		@Param('sessionId') sessionId: string,
		@Body('userId') userId: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		this.logger.debug('/removeAppsAndSession', sessionId)
		return this.auth(req, userId).then(() => {
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
		await this.nextcloudService.validate(req)

		if (cmd === 'pause') {
			return this.remoteAppService.pauseAppsAndSession(sessionId)
		} else if (cmd === 'resume') {
			return this.remoteAppService.resumeAppsAndSession(sessionId)
		}

		return HttpStatus.NOT_FOUND
	}

	@Delete('/containers/:sessionId/apps/:appId')
	async stopApp(
		@Param('sessionId') sessionId: string,
		@Param('appId') appId: string,
		@Body('userId') userId: string,
		@Req() req: Request
	) {
		this.logger.debug('/stopApp', appId)
		await this.nextcloudService.validate(req)

		return await this.remoteAppService.stopAppInSession(sessionId, appId)
	}

	@Delete('/containers/force/:sessionId')
	async forceRemove(
		@Param('sessionId') sessionId: string,
		@Req() req: Request
	) {
		await this.nextcloudService.validate(req)
		return this.remoteAppService.forceRemove(sessionId)
	}
}
