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
} from '@nestjs/common'
import { RemoteAppService } from './remote-app.service'
import { Request, Response } from 'express'

@Controller('remote-app')
export class RemoteAppController {
	constructor(private readonly remoteAppService: RemoteAppService) {}

	private readonly logger = new Logger('RemoteAppController')

	@Get('/containers/:uid')
	async getContainers(
		@Param('uid') uid: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		// this.logger.log(JSON.stringify(req.cookies, null, 2), '/containers');

		if (uid !== req.cookies.nc_username) {
			return res.status(HttpStatus.FORBIDDEN).send()
		}

		const json = await this.remoteAppService.getContainers(uid)

		return res.status(HttpStatus.OK).json(json)
	}

	@Post('/containers/:id/start')
	async startSessionWithUserId(
		@Param('id') id: string,
		@Body('uid') uid: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		this.logger.log('/startSessionWithUserId', id)

		if (uid !== req.cookies.nc_username) {
			return res.status(HttpStatus.FORBIDDEN).send()
		}

		const json = await this.remoteAppService.startSessionWithUserId(id, uid)

		return res.status(HttpStatus.CREATED).json(json)
	}

	@Post('/apps/:app/start')
	async startNewSessionAndAppWithWebdav(
		@Param('app') app: string,
		@Body('uid') uid: string,
		@Body('password') password: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		this.logger.log('/startNewSessionAndAppWithWebdav', app)

		// Basic check against nc cookie
		if (uid !== req.cookies.nc_username) {
			return res.status(HttpStatus.FORBIDDEN).send()
		}

		const json = await this.remoteAppService.startNewSessionAndAppWithWebdav(
			uid,
			app,
			password
		)

		return res.status(HttpStatus.CREATED).json(json)
	}

	@Post('/containers/:sid/apps/:aid/start')
	async startAppWithWebdav(
		@Param('sid') sid: string,
		@Param('aid') aid: string,
		@Body('app') app: string,
		@Body('uid') uid: string,
		@Body('password') password: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		this.logger.log('/startAppWithWebdav', sid)

		// Basic check against nc cookie
		if (uid !== req.cookies.nc_username) {
			return res.status(HttpStatus.FORBIDDEN).send()
		}

		const json = await this.remoteAppService.startAppWithWebdav(
			sid,
			aid,
			app,
			password
		)

		return res.status(HttpStatus.CREATED).json(json)
	}

	@Put('/containers/:id/destroy')
	async destroyAppsAndSession(
		@Param('id') id: string,
		@Body('uid') uid: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		if (uid !== req.cookies.nc_username) {
			return res.status(HttpStatus.FORBIDDEN).send()
		}

		const json = this.remoteAppService.destroyAppsAndSession(id)

		return res.status(HttpStatus.OK).json(json)
	}

	@Get('/apps')
	availableApps() {
		return [
			{
				name: 'Brainstorm',
				description:
					'Brainstorm is a collaborative, open-source application dedicated to the analysis of brain recordings: MEG, EEG, fNIRS, ECoG, depth electrodes and multiunit electrophysiology.',
				status: 'running',
				url: 'https: //neuroimage.usc.edu/brainstorm/Introduction',
				icon: 'brainstorm__logo.png',
			},
			{
				name: 'IntrAnat',
				description:
					'A software to visualize electrodes implantation on image data and prepare database for group studies',
				status: 'running',
				url: 'https://gin11-web.ujf-grenoble.fr/?page_id=228',
				icon: 'intranat__logo.png',
			},
		]
	}

	// DEBUG methods
	@Get('/containers/fetch')
	pollRemoteState() {
		this.remoteAppService.pollRemoteState()
	}

	@Get('/containers/forceRemove/:id')
	async forceRemove(@Param('id') id: string) {
		this.remoteAppService.forceRemove(id)
	}
}
