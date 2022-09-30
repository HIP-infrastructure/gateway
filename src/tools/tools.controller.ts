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
		const { cookie } = req.headers
		await this.nextcloudService.validate(req)
		return this.toolsService.getBIDSDatasets({ cookie })
	}

	@UsePipes(ValidationPipe)
	@Post('/bids/dataset')
	async createDatabase(
		@Body() createBidsDatasetDto: CreateBidsDatasetDto,
		@Req() req: Request
	) {
		await this.nextcloudService.validate(req)
		return this.toolsService.createBidsDataset(createBidsDatasetDto)
	}

	// @Delete('/bids/database')
	// removeOneDatabase() { }

	@UsePipes(ValidationPipe)
	@Get('/bids/subject')
	async getSubject(
		@Query('path') path: string,
		@Query('owner') owner: string,
		@Query('sub') sub: string,
		@Req() req: Request
	) {
		await this.nextcloudService.validate(req)
		const bidsGetSubjectDto: BidsGetSubjectDto = {
			owner,
			path,
			sub,
		}

		return this.toolsService.getSubject(bidsGetSubjectDto)
	}

	@UsePipes(ValidationPipe)
	@Post('/bids/subject')
	async importSubject(
		@Body() createSubjectDto: CreateSubjectDto,
		@Req() req: Request
	) {
		await this.nextcloudService.validate(req)
		return this.toolsService.importSubject(createSubjectDto)
	}

	@UsePipes(ValidationPipe)
	@Patch('/bids/subject')
	async editClinical(
		@Body() editSubjectClinicalDto: EditSubjectClinicalDto,
		@Req() req: Request
	) {
		await this.nextcloudService.validate(req)
		return this.toolsService.subEditClinical(editSubjectClinicalDto)
	}

	// @Delete('/bids/subject')
	// removeOneSubject() { }

	@UsePipes(ValidationPipe)
	@Get(`/bids/participants`)
	async getParticipants(
		@Query('path') path: string,
		@Query('owner') owner: string,
		@Req() req: Request
	) {
		const { cookie, requesttoken } = req.headers
		await this.nextcloudService.validate(req)
		return this.toolsService.participants(path, { cookie })
	}
}
