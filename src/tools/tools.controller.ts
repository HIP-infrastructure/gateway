import {
	Body,
	Controller,
	Get,
	Patch,
	Post,
	Query,
	Request as Req,
	UsePipes,
	ValidationPipe,
} from '@nestjs/common'
import { Request } from 'express'
import { BidsGetSubjectDto } from './dto/bids-get-subject.dto'
import { CreateBidsDatasetDto } from './dto/create-bids-dataset.dto'
import { CreateSubjectDto } from './dto/create-subject.dto'
import { EditSubjectClinicalDto } from './dto/edit-subject-clinical.dto'
import { ToolsService } from './tools.service'

@Controller('tools')
export class ToolsController {
	constructor(private readonly toolsService: ToolsService) {}

	// @UsePipes(ValidationPipe)
	// @Get('/bids/database')
	// findOneDatabase(@Query() getBidsDatasetDto: GetBidsDatasetDto) {
	//     return this.toolsService.getBIDSDataset(getBidsDatasetDto)
	// }

	@Get('/bids/datasets')
	async getBids(@Req() req: Request) {
		const { cookie, requesttoken } = req.headers

		return this.toolsService.getBIDSDatasets({ cookie, requesttoken })
	}

	@Post('/bids/datasets')
	async indexBIDSDatasets(@Query('owner') owner: string, @Req() req: Request) {
		const { cookie, requesttoken } = req.headers

		return this.toolsService.indexBIDSDatasets(owner, { cookie, requesttoken })
	}

	@UsePipes(ValidationPipe)
	@Post('/bids/datasets/search')
	async searchBIDSDatasets(
		@Query('owner') owner: string,
		@Query('query') query: string
	) {
		const search_results = await this.toolsService.searchBidsDatasets(
			owner,
			query
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
	createDatabase(
		@Body() createBidsDatasetDto: CreateBidsDatasetDto,
		@Req() req: Request
	) {
		const { cookie, requesttoken } = req.headers

		return this.toolsService.createBidsDataset(createBidsDatasetDto, {
			cookie,
			requesttoken,
		})
	}

	// @Delete('/bids/database')
	// removeOneDatabase() { }

	@UsePipes(ValidationPipe)
	@Get('/bids/subject')
	getSubject(
		@Query('path') path: string,
		@Query('owner') owner: string,
		@Query('sub') sub: string,
		@Req() req: Request
	) {
		const { cookie, requesttoken } = req.headers
		const bidsGetSubjectDto: BidsGetSubjectDto = {
			owner,
			path,
			sub,
		}

		return this.toolsService.getSubject(bidsGetSubjectDto, {
			cookie,
			requesttoken,
		})
	}

	@UsePipes(ValidationPipe)
	@Post('/bids/subject')
	importSubject(
		@Body() createSubjectDto: CreateSubjectDto,
		@Req() req: Request
	) {
		const { cookie, requesttoken } = req.headers

		return this.toolsService.importSubject(createSubjectDto, {
			cookie,
			requesttoken,
		})
	}

	@UsePipes(ValidationPipe)
	@Patch('/bids/subject')
	editClinical(
		@Body() editSubjectClinicalDto: EditSubjectClinicalDto,
		@Req() req: Request
	) {
		const { cookie, requesttoken } = req.headers

		return this.toolsService.subEditClinical(editSubjectClinicalDto, {
			cookie,
			requesttoken,
		})
	}

	// @Delete('/bids/subject')
	// removeOneSubject() { }

	@UsePipes(ValidationPipe)
	@Get(`/bids/participants`)
	getParticipants(
		@Query('path') path: string,
		@Query('owner') owner: string,
		@Req() req: Request
	) {
		const { cookie, requesttoken } = req.headers

		return this.toolsService.participants(path, { cookie, requesttoken })
	}
}
