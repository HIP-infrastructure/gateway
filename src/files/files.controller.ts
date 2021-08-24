import { Controller, Get, Logger, Param } from '@nestjs/common'
import { FilesService } from './files.service'

@Controller('files')
export class FilesController {
	constructor(private fileService: FilesService) {}

	private logger = new Logger('FilesService')

	@Get('/*')
	async getFiles(@Param() params) {
		const path = `/${params[0]}`
		this.logger.debug(path, 'getFiles')

		return this.fileService.getFiles(path)
	}
}
