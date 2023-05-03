import {
	Controller,
	Get,
	HttpStatus,
	Logger,
	Param,
	Request as Req,
	Response as Res,
	Query,
} from '@nestjs/common'
import { Request, Response } from 'express'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'
import { FilesService } from './files.service'
const fs = require('fs')
@Controller('files')
export class FilesController {
	constructor(
		private fileService: FilesService,
		private nextcloudService: NextcloudService
	) {}

	private logger = new Logger('FilesService')

	@Get('/')
	async path(@Query('path') queryPath: string, @Req() req: Request) {
		return this.nextcloudService.authUserIdFromRequest(req).then(async userId => {
			return await this.fileService.files(userId, queryPath)
		})
	}

	@Get('/content')
	async content(@Query('path') queryPath: string, @Req() req: Request) {
		return this.nextcloudService.authUserIdFromRequest(req).then(async userId => {
			return await this.fileService.content(userId, queryPath)
		})
	}

	@Get('/search/:term')
	async search(
		@Param('term') term: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		const { cookie, requesttoken } = req.headers
		const result = await this.fileService.search({ cookie, requesttoken }, term)

		return res.status(HttpStatus.OK).json(result)
	}
}
