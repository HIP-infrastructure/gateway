import {
	Body,
	Controller,
	Get, HttpStatus, Logger,
	Param,
	Post,
	Request as Req,
	Response as Res
} from '@nestjs/common'
import { Request, Response } from 'express'
import { BIDSDatabase, FilesService } from './files.service'

@Controller('files')
export class FilesController {
	constructor(private fileService: FilesService) { }

	private logger = new Logger('FilesService')

	@Get('/search/:term')
	async search(
		@Param('term') term: string,
		@Req() req: Request,
		@Res() res: Response
	) {
		const result = await this.fileService.search(req.headers, term)

		return res.status(HttpStatus.OK).json(result)
	}

	@Get('/folders')
	async getFiles(@Param() params) {
		const path = `/${params[0]}`
		this.logger.debug(path, 'getFiles')

		return this.fileService.getFiles(path)
	}

	@Get('/bids')
	async getBids(@Req() req: Request,
	) {
		return this.fileService.getBids(req.headers)
	}

	@Post('/bids/create/:path')
	async createBids(
		@Req() req: Request,
		@Param('path') path: string,
		@Body('data') data: BIDSDatabase
	) {
		return this.fileService.createBids(req.headers, path, data)
	}
}
