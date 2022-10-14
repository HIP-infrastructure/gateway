import {
	Body,
	Controller,
	Get,
	HttpStatus,
	Patch,
	Post,
	Query,
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

	@Get('/bids/datasets')
	async getBids(@Req() req: Request, @Res() res: Response) {
		await this.nextcloudService.authenticate(req).then(async () => {
			const { cookie } = req.headers
			const ds = await this.toolsService.getBIDSDatasets({ cookie })

			return res.status(HttpStatus.OK).json(ds)
		})
	}

	@Post('/bids/datasets')
	async indexBIDSDatasets(@Query('owner') owner: string, @Req() req: Request) {
		const { cookie, requesttoken } = req.headers

		return this.toolsService.indexBIDSDatasets(owner, { cookie, requesttoken })
	}

	@UsePipes(ValidationPipe)
	@Post('/bids/datasets/search')
	async c(
		@Query('owner') owner: string,
		@Query('query') query: string,
		@Query('nb_of_results') nb_of_results: number
	) {
		const search_results = await this.toolsService.searchBidsDatasets(
			owner,
			query,
			nb_of_results
		)

		const found_datasets = search_results.hits.hits.map(dataset => ({
			// query metadata fields returned by elastic
			id: dataset._id,
			...dataset._source,
		}))

		if (found_datasets.length > 0) {
			return found_datasets
		} else {
			return null
		}
	}

	@UsePipes(ValidationPipe)
	@Post('/bids/dataset')
	async createDatabase(
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
