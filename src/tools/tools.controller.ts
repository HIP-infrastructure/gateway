import {
	Body,
	Controller,
	Get,
	HttpStatus,
	Patch,
	Post,
	Query,
	Logger,
	Request as Req,
	Response as Res,
	UsePipes,
	ValidationPipe,
} from '@nestjs/common'
import { Request, Response } from 'express'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'
import { BidsGetSubjectDto } from './dto/bids-get-subject.dto'
import { CreateBidsDatasetDto } from './dto/create-bids-dataset.dto'
import { CreateSubjectDto } from './dto/create-subject.dto'
import { EditSubjectClinicalDto } from './dto/edit-subject-clinical.dto'
import { ToolsService } from './tools.service'

@Controller('tools')
export class ToolsController {
	constructor(
		private readonly toolsService: ToolsService,
		private readonly nextcloudService: NextcloudService
	) {}

	private logger = new Logger('ToolsController')

	@Get('/bids/datasets/create_index')
	createBIDSDatasetsIndex(@Req() req: Request, @Res() res: Response) {
		// this.nextcloudService.authenticate(req).then(async () => {
		// 	this.toolsService.createBIDSDatasetsIndex()
		// })

		const { cookie, requesttoken } = req.headers
		this.toolsService.createBIDSDatasetsIndex()

		return res.status(HttpStatus.OK).send()
	}

	@Get('/bids/dataset/index')
	indexBIDSDataset(
		@Query('owner') owner: string,
		@Query('path') path: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		// this.nextcloudService.authenticate(req).then(async () => {
		// 	const { cookie, requesttoken } = req.headers
		// 	this.toolsService.indexBIDSDataset(owner, path, {
		// 		cookie,
		// 		requesttoken,
		// 	})
		// })

		const { cookie, requesttoken } = req.headers
		this.toolsService.indexBIDSDataset(owner, path)

		return res.status(HttpStatus.OK).send()
	}

	@Get('/bids/dataset/delete')
	deleteBIDSDataset(
		@Query('owner') owner: string,
		@Query('path') path: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		// this.nextcloudService.authenticate(req).then(async () => {
		//	this.toolsService.deleteBIDSDataset(owner, path)
		//})

		this.toolsService.deleteBIDSDataset(owner, path)

		return res.status(HttpStatus.OK).send()
	}

	@Get('/bids/datasets/index')
	indexBIDSDatasets(
		@Query('owner') owner: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		this.nextcloudService.authenticate(req).then(async () => {
			const { cookie, requesttoken } = req.headers
			this.toolsService.indexBIDSDatasets(owner, {
				cookie,
				requesttoken,
			})
		})

		return res.status(HttpStatus.OK).send()
	}

	@UsePipes(ValidationPipe)
	@Get('/bids/datasets/refresh_index')
	async refreshDatasetsIndex(
		@Query('owner') owner: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		// this.nextcloudService.authenticate(req).then(async () => {
		// 	const { cookie, requesttoken } = req.headers
		// 	this.toolsService.refreshBIDSDatasetsIndex(owner, {
		// 		cookie,
		// 		requesttoken,
		// 	})
		// })

		const { cookie, requesttoken } = req.headers
		this.toolsService.refreshBIDSDatasetsIndex(owner, {
			cookie,
			requesttoken,
		})
	}

	@UsePipes(ValidationPipe)
	@Get('/bids/datasets/search')
	async searchBidsDatasets(
		@Query('owner') owner: string,
		@Query('query') query: string,
		@Query('page') page: number,
		@Query('nbOfResults') nbOfResults: number
	) {
		const searchResults = await this.toolsService.searchBidsDatasets(
			owner,
			query,
			page,
			nbOfResults
		)

		const foundDatasets = searchResults.hits.hits.map(dataset => ({
			// query metadata fields returned by elastic
			id: dataset._id,
			...dataset._source,
		}))

		if (foundDatasets.length > 0) {
			return foundDatasets
		} else {
			return []
		}
	}

	@UsePipes(ValidationPipe)
	@Post('/bids/dataset')
	async createDataset(
		@Body() createBidsDatasetDto: CreateBidsDatasetDto,
		@Req() req: Request
	) {
		return await this.nextcloudService.authenticate(req).then(() => {
			return this.toolsService.createBidsDataset(createBidsDatasetDto)
		})
	}

	@UsePipes(ValidationPipe)
	@Get('/bids/subject')
	async getSubject(
		@Query('path') path: string,
		@Query('owner') owner: string,
		@Query('sub') sub: string,
		@Req() req: Request
	) {
		return await this.nextcloudService.authenticate(req).then(() => {
			const bidsGetSubjectDto: BidsGetSubjectDto = {
				owner,
				path,
				sub,
			}

			return this.toolsService.getSubject(bidsGetSubjectDto)
		})
	}

	@UsePipes(ValidationPipe)
	@Post('/bids/subject')
	async importSubject(
		@Body() createSubjectDto: CreateSubjectDto,
		@Req() req: Request
	) {
		return await this.nextcloudService.authenticate(req).then(() => {
			return this.toolsService.importSubject(createSubjectDto)
		})
	}

	@UsePipes(ValidationPipe)
	@Patch('/bids/subject')
	async editClinical(
		@Body() editSubjectClinicalDto: EditSubjectClinicalDto,
		@Req() req: Request
	) {
		return await this.nextcloudService.authenticate(req).then(() => {
			return this.toolsService.subEditClinical(editSubjectClinicalDto)
		})
	}

	@UsePipes(ValidationPipe)
	@Get(`/bids/participants`)
	async getParticipants(
		@Query('path') path: string,
		@Query('owner') owner: string,
		@Req() req: Request
	) {
		return await this.nextcloudService.authenticate(req).then(() => {
			const { cookie } = req.headers
			return this.toolsService.participants(path, { cookie })
		})
	}
}
