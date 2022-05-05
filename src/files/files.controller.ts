import {
	Controller,
	Get, HttpStatus, Logger,
	Param, Request as Req,
	Response as Res,
	Query
} from '@nestjs/common'
import { Request, Response } from 'express'
import { FilesService } from './files.service'

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
}
