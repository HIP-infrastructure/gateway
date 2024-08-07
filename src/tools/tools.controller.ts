import { estypes } from '@elastic/elasticsearch'
import {
	Body,
	Controller,
	DefaultValuePipe,
	Get,
	HttpStatus,
	Patch,
	ParseArrayPipe,
	Post,
	Query,
	Logger,
	Request as Req,
	Response as Res,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { Request, Response } from 'express'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'
import { BidsGetSubjectDto } from './dto/bids-get-subject.dto'
import { CreateBidsDatasetParticipantsTsvDto } from './dto/create-bids-dataset-participants-tsv.dto'
import { CreateBidsDatasetDto } from './dto/create-bids-dataset.dto'
import { CreateSubjectDto } from './dto/create-subject.dto'
import { EditSubjectClinicalDto } from './dto/edit-subject-clinical.dto'
import { SearchBidsDatasetsQueryOptsDto } from './dto/search-bids-datasets-quey-opts.dto'
import { BIDSDataset, ToolsService } from './tools.service'

@Controller('tools')
export class ToolsController {
	constructor(
		private readonly toolsService: ToolsService,
		private readonly nextcloudService: NextcloudService
	) {}

	private logger = new Logger('ToolsController')

	@Get('/bids/dataset/index')
	indexBIDSDataset(
		@Query('owner') owner: string,
		@Query('path') path: string,
		@Query('id') id: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		return this.nextcloudService.authenticate(req).then(async () => {
			return this.toolsService.indexBIDSDataset(owner, path, id)
		})
	}

	@Get('/bids/dataset/delete')
	deleteBIDSDataset(
		@Query('owner') owner: string,
		@Query('path') path: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		return this.nextcloudService.authenticate(req).then(async () => {
			return this.toolsService.deleteBIDSDataset(owner, path)
		})
	}

	@UsePipes(ValidationPipe)
	@Get('/bids/datasets/refresh_index')
	async refreshDatasetsIndex(
		@Query('owner') owner: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		return this.nextcloudService.authenticate(req).then(async () => {
			const { cookie, requesttoken } = req.headers
			return this.toolsService.refreshBIDSDatasetsIndex(owner, {
				cookie,
				requesttoken
			})
		})
		// return res.status(HttpStatus.OK).send()
	}

	@UsePipes(ValidationPipe)
	@Get('/bids/datasets/search')
	async searchBidsDatasets(
		@Query('owner') owner: string,
		@Query('query') query: string,
		@Query('ageRange', new ParseArrayPipe({ items: Number, separator: ',' }))
		ageRange: number[],
		@Query(
			'participantsCountRange',
			new ParseArrayPipe({ items: Number, separator: ',' })
		)
		participantsCountRange: number[],
		@Query(
			'datatypes',
			new DefaultValuePipe(['*']),
			new ParseArrayPipe({ items: String, separator: ',', optional: true })
		)
		datatypes: string[],
		@Query('page') page: number,
		@Query('nbOfResults') nbOfResults: number,
		@Req() req: Request
	) {
		const searchQueryOpts: SearchBidsDatasetsQueryOptsDto = {
			owner,
			textQuery: query,
			filterPaths: true,
			ageRange,
			participantsCountRange,
			datatypes,
			page,
			nbOfResults
		}

		return await this.nextcloudService.authenticate(req).then(async () => {
			const { cookie, requesttoken } = req.headers
			// FIXME: See if this.refreshDatasetsIndex is needed as for now,
			//        it is run in parallel with another one and causes
			//		  double indexing
			/* this.toolsService.refreshBIDSDatasetsIndex(owner, {
				cookie,
				requesttoken,
			}) */
			const searchResults: {
				datasets: estypes.SearchHit<BIDSDataset>[]
				total: number | estypes.SearchTotalHits
			} = await this.toolsService.searchBidsDatasets(searchQueryOpts)

			const foundDatasets = searchResults.datasets.map(dataset => ({
				// query metadata fields returned by elastic
				id: dataset._id,
				...dataset._source
			}))

			if (foundDatasets.length > 0) {
				return {
					datasets: foundDatasets,
					total: searchResults.total
				}
			} else {
				return {
					datasets: [],
					total: 0
				}
			}
		})
	}

	@UsePipes(ValidationPipe)
	@Get('/bids/datasets/count')
	async getBidsDatasetsCount(@Req() req: Request) {
		return await this.nextcloudService.authenticate(req).then(async () => {
			return this.toolsService.getDatasetsCount()
		})
	}

	@UsePipes(ValidationPipe)
	@Get('/bids/datasets/publish')
	async publish(@Req() req: Request, @Query('path') path: string) {
		return await this.nextcloudService
			.authUserIdFromRequest(req)
			.then(async userId => {
				return await this.toolsService.publishDatasetToPublicSpace(userId, path)
			})
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
	@Get('/bids/dataset/generate_id')
	async generateDatasetId(@Query('owner') owner: string, @Req() req: Request) {
		return await this.nextcloudService.authenticate(req).then(() => {
			return this.toolsService.generateDatasetId(owner)
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
				sub
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

	@UsePipes(ValidationPipe)
	@Post('/bids/dataset/write_participants_tsv')
	async write(
		@Query('owner') owner: string,
		@Query('datasetPath') datasetPath: string,
		@Body()
		createBidsDatasetParticipantsTsvDto: CreateBidsDatasetParticipantsTsvDto,
		@Req() req: Request
	) {
		return await this.nextcloudService.authenticate(req).then(() => {
			return this.toolsService.writeBIDSDatasetParticipantsTSV(
				owner,
				datasetPath,
				createBidsDatasetParticipantsTsvDto
			)
		})
	}
}
