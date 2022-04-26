import {
	Body,
	Controller,
	Get,
	Put,
	Logger,
	Param,
	Post,
	Request as Req,
	Response as Res,
	HttpStatus,
	ForbiddenException,
} from '@nestjs/common'
import { RemoteAppService } from './remote-app.service'
import { Request, Response } from 'express'

@Controller('remote-app')
export class RemoteAppController {
	constructor(
		private readonly remoteAppService: RemoteAppService,
		) { }

	private readonly logger = new Logger('RemoteAppController')

	@Get('/containers/:userId')
	getContainers(
		@Param('userId') userId: string,
		@Req() req: Request,
	) {
		if (userId !== req.cookies.nc_username) {
			throw new ForbiddenException(`User ${userId} is not allowed to perform that operation`)
		}

		// Admin endpoint to see every containers
		if (req.cookies.nc_username === process.env.HIP_ADMIN) {
			return this.remoteAppService.getAllContainers()
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
		this.logger.log('/startSessionWithUserId', sessionId)

		if (userId !== req.cookies.nc_username) {
			return res.status(HttpStatus.FORBIDDEN).send()
		}

		const json = await this.remoteAppService.startSessionWithUserId(sessionId, userId)

		return res.status(HttpStatus.CREATED).json(json)
	}

	@Post('/apps/:appName/start')
	async startNewSessionAndAppWithWebdav(
		@Param('appName') appName: string,
		@Body('userId') userId: string,
		@Body('password') password: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		this.logger.log('/startNewSessionAndAppWithWebdav', appName)

		// Basic check against nc cookie
		if (userId !== req.cookies.nc_username) {
			return res.status(HttpStatus.FORBIDDEN).send()
		}

		const json = await this.remoteAppService.startNewSessionAndAppWithWebdav(
			userId,
			appName,
			password
		)

		return res.status(HttpStatus.CREATED).json(json)
	}

	@Post('/containers/:sessionId/apps/:appId/start')
	async startAppWithWebdav(
		@Param('sessionId') sessionId: string,
		@Param('appId') appId: string,
		@Body('appName') appName: string,
		@Body('userId') userId: string,
		@Body('password') password: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		this.logger.log('/startAppWithWebdav', sessionId)

		// Basic check against nc cookie
		if (userId !== req.cookies.nc_username) {
			return res.status(HttpStatus.FORBIDDEN).send()
		}

		const json = await this.remoteAppService.startAppWithWebdav(
			sessionId,
			appId,
			appName,
			password
		)

		return res.status(HttpStatus.CREATED).json(json)
	}

	@Put('/containers/:sessionId/apps/:appId/stop')
	async stopApp(
		@Param('sessionId') sessionId: string,
		@Param('appId') appId: string,
		@Body('userId') userId: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		this.logger.log('/stopApp', appId)

		// Basic check against nc cookie
		if (userId !== req.cookies.nc_username) {
			return res.status(HttpStatus.FORBIDDEN).send()
		}

		const json = await this.remoteAppService.stopAppInSession(
			sessionId,
			appId
		)

		return res.status(HttpStatus.CREATED).json(json)
	}

	@Put('/containers/:sessionId/remove')
	async removeAppsAndSession(
		@Param('sessionId') sessionId: string,
		@Body('userId') userId: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		if (userId !== req.cookies.nc_username) {
			return res.status(HttpStatus.FORBIDDEN).send()
		}

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
		if (userId !== req.cookies.nc_username) {
			return res.status(HttpStatus.FORBIDDEN).send()
		}

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
		if (userId !== req.cookies.nc_username) {
			return res.status(HttpStatus.FORBIDDEN).send()
		}

		const json = this.remoteAppService.resumeAppsAndSession(sessionId)

		return res.status(HttpStatus.OK).json(json)
	}

	@Get('/apps')
	async availableApps(@Res() res: Response) {
		const json = await this.remoteAppService.availableApps()
		return res.status(HttpStatus.OK).json(json)
	}

	// DEBUG methods
	@Get('/containers/fetch')
	pollRemoteState() {
		this.remoteAppService.pollRemoteState()
	}

	@Get('/containers/forceRemove/:sessionId')
	async forceRemove(@Param('sessionId') sessionId: string) {
		this.remoteAppService.forceRemove(sessionId)
	}
}
