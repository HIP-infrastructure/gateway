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

	@Get('public/:path/:fileId')
	async serveAvatar(@Param('fileId') fileId,@Param('path') path, @Res() res): Promise<any> {
		res.sendFile(fileId, { root: `public/${path}` })
	}
}
