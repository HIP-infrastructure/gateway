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
		this.nextcloudService.authenticate(req).then(async () => {
			this.toolsService.createBIDSDatasetsIndex()
		})
		return res.status(HttpStatus.OK).send()
	}

	@Get('/bids/datasets/delete_index')
	deleteBIDSDatasetsIndex(@Req() req: Request, @Res() res: Response) {
		this.nextcloudService.authenticate(req).then(async () => {
			this.toolsService.deleteBIDSDatasetsIndex()
		})
		return res.status(HttpStatus.OK).send()
	}

	@Get('/bids/dataset/index')
	indexBIDSDataset(
		@Query('owner') owner: string,
		@Query('path') path: string,
		@Query('id') id: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		this.nextcloudService.authenticate(req).then(async () => {
			this.toolsService.indexBIDSDataset(owner, path, id)
		})
		return res.status(HttpStatus.OK).send()
	}

	@Get('/bids/dataset/delete')
	deleteBIDSDataset(
		@Query('owner') owner: string,
		@Query('path') path: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		this.nextcloudService.authenticate(req).then(async () => {
			this.toolsService.deleteBIDSDataset(owner, path)
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
		this.nextcloudService.authenticate(req).then(async () => {
			const { cookie, requesttoken } = req.headers
			this.toolsService.refreshBIDSDatasetsIndex(owner, {
				cookie,
				requesttoken
			})
		})
		return res.status(HttpStatus.OK).send()
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
			const searchResults = await this.toolsService.searchBidsDatasets(
				searchQueryOpts
			)

			const foundDatasets = searchResults.map(dataset => ({
				// query metadata fields returned by elastic
				id: dataset._id,
				...dataset._source
			}))

			if (foundDatasets.length > 0) {
				return foundDatasets
			} else {
				return []
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
