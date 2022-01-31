import {
	Body,
	Controller,
	Get,
	Put,
	Logger,
	Param,
	Post,
	Request as Req,
	Response as Res,
	HttpStatus,
} from '@nestjs/common'
import { FilesService } from './files.service'
import { Request, Response } from 'express'

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
		// this.logger.log(JSON.stringify(req.cookies, null, 2), '/containers');
		this.logger.debug(`${term}`, 'search')

		// const token = req.headers['requesttoken'] as string

		const result = this.fileService.search(req.headers, term)
		const json = await result //.subscribe( (item: any) => item.ocs.data)
			// .then((data) => {
			// 	// console.log(data)

			// 	return data.data.ocs.data

			// 	// result.subscribe(function (item: any) {
			// 	// 	// console.log(item.ocs.data);

			// 	// 	return item.ocs.data
			// 	// },
			// 	// 	err => {
			// 	// 		console.log('error')
			// 	// 		console.log(err.response);
			// 	// 	})
			// })

		this.logger.debug(`${JSON.stringify(json)}`, 'json')
		return res.status(HttpStatus.OK).json(json)
	}

	@Get('/folders')
	async getFiles(@Param() params) {
		const path = `/${params[0]}`
		this.logger.debug(path, 'getFiles')

		return this.fileService.getFiles(path)
	}
}
