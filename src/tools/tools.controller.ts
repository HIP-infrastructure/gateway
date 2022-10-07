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
	async getBids(@Req() req: Request) {
		await this.nextcloudService.authenticate(req).then(() => {
			const { cookie } = req.headers
			return this.toolsService.getBIDSDatasets({ cookie })
		})
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
			const { cookie, requesttoken } = req.headers
			return this.toolsService.participants(path, { cookie })
		})
	}
}
