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
	constructor(private readonly remoteAppService: RemoteAppService) { }

	private readonly logger = new Logger('RemoteAppController')

	@Get('/containers/:userId')
	async getContainers(
		@Param('userId') userId: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		// this.logger.log(JSON.stringify(req.cookies, null, 2), '/containers');

		if (userId !== req.cookies.nc_username) {
			return res.status(HttpStatus.FORBIDDEN).send()
		}

		// Admin endpoint to see every containers
		if (req.cookies.nc_username === process.env.HIP_ADMIN) {
			const json = await this.remoteAppService.getAllContainers()

			return res.status(HttpStatus.OK).json(json)
		}

		const json = await this.remoteAppService.getContainers(userId)

		return res.status(HttpStatus.OK).json(json)
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

	@Post('/apps/:appId/start')
	async startNewSessionAndAppWithWebdav(
		@Param('appId') appId: string,
		@Body('userId') userId: string,
		@Body('password') password: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		this.logger.log('/startNewSessionAndAppWithWebdav', appId)

		// Basic check against nc cookie
		if (userId !== req.cookies.nc_username) {
			return res.status(HttpStatus.FORBIDDEN).send()
		}

		const json = await this.remoteAppService.startNewSessionAndAppWithWebdav(
			userId,
			appId,
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
	availableApps() {
		const appItems = [
			{
				name: 'brainstorm',
				label: 'Brainstorm',
				description:
					'Brainstorm is a collaborative, open-source application dedicated to the analysis of brain recordings: MEG, EEG, fNIRS, ECoG, depth electrodes and multiunit electrophysiology.',
				url: 'https: //neuroimage.usc.edu/brainstorm/Introduction',
			},
			{
				name: 'anywave',
				label: 'AnyWave',
				description:
					'AnyWave is a software designed to easily open and view data recorded by EEG or MEG acquisition systems.',
				url: 'https://meg.univ-amu.fr/wiki/AnyWave',
			},
			{
				name: 'hibop',
				label: 'HiBoP',
				description:
					'HiBoP illustrates the possibility to render group-level activity dynamically at the cortical level, for several experimental conditions (columns) of the same cognitive paradigm.',
				url: '',
			},
			{
				name: 'localizer',
				label: 'Localizer',
				description:
					'',
				url: 'https://gin11-web.ujf-grenoble.fr/?page_id=228',
			},
			{
				name: 'mricrogl',
				label: 'MRIcroGL',
				description:
					'MRIcroGL is a cross-platform tool for viewing DICOM and NIfTI format images. It provides a drag-and-drop user interface as well as a scripting language.',
				url: 'https://github.com/rordenlab/MRIcroGL',
			},
			{
				name: 'fsl',
				label: 'FSL',
				description:
					'FSL is a comprehensive library of analysis tools for FMRI, MRI and DTI brain imaging data.',
				url: 'https://fsl.fmrib.ox.ac.uk/fsl/fslwiki/FSL',
			},
			{
				name: 'slicer',
				label: '3D Slicer',
				description:
					'Desktop software to solve advanced image computing challenges with a focus on clinical and biomedical applications.',
				url: 'https://www.slicer.org/',
			},
			{
				name: 'freesurfer',
				label: 'Freesurfer',
				description:
					'An open source software suite for processing and analyzing (human) brain MRI images.',
				url: 'https://surfer.nmr.mgh.harvard.edu/',
			},
		]

		return appItems
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
