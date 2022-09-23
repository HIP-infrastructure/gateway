import {
	Controller,
	Get,
	Logger,
	Post,
	Body,
	Patch,
	Param,
	Delete,
	Request as Req,
	Response as Res,
} from '@nestjs/common'

@Controller()
export class AppController {
	private readonly logger = new Logger('AppController')

	@Get('/')
	getHello() {
		return 'OK'
	}

	@Get('public/:fileId')
	async serveAvatar(@Param('fileId') fileId, @Res() res): Promise<any> {
		res.sendFile(fileId, { root: 'public' })
	}
}
