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
import { CreateBidsDatabaseDto } from './dto/create-bids-database.dto'
import { CreateSubjectDto } from './dto/create-subject.dto'
import { EditSubjectClinicalDto } from './dto/edit-subject-clinical.dto'
import { ToolsService } from './tools.service'

@Controller('tools')
export class ToolsController {
	constructor(private readonly toolsService: ToolsService) {}

	// @UsePipes(ValidationPipe)
	// @Get('/bids/database')
	// findOneDatabase(@Query() getBidsDatabaseDto: GetBidsDatabaseDto) {
	//     return this.toolsService.getBIDSDatabase(getBidsDatabaseDto)
	// }

	@Get('/bids/databases')
	async getBids(@Query('owner') owner: string, @Req() req: Request) {
		return this.toolsService.getBIDSDatabases(owner, req.headers)
	}

	@UsePipes(ValidationPipe)
	@Post('/bids/database')
	createDatabase(
		@Body() createBidsDatabaseDto: CreateBidsDatabaseDto,
		@Req() req: Request
	) {
		const { requesttoken, cookie } = req.headers

		return this.toolsService.createBidsDatabase(createBidsDatabaseDto, {
			requesttoken,
			cookie,
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
		const { requesttoken, cookie } = req.headers
		const bidsGetSubjectDto: BidsGetSubjectDto = {
			owner,
			path,
			sub
		}

		return this.toolsService.getSubject(bidsGetSubjectDto, {
			requesttoken,
			cookie,
		})
	}

	@UsePipes(ValidationPipe)
	@Post('/bids/subject')
	importSubject(
		@Body() createSubjectDto: CreateSubjectDto,
		@Req() req: Request
	) {
		const { requesttoken, cookie } = req.headers

		return this.toolsService.importSubject(createSubjectDto, {
			requesttoken,
			cookie,
		})
	}

	@UsePipes(ValidationPipe)
	@Patch('/bids/subject')
	editClinical(
		@Body() editSubjectClinicalDto: EditSubjectClinicalDto,
		@Req() req: Request
	) {
		const { requesttoken, cookie } = req.headers
		return this.toolsService.subEditClinical(editSubjectClinicalDto, {
			requesttoken,
			cookie,
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
		return this.toolsService.participants(req.headers, path, owner)
	}
}
