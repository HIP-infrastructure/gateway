import { Controller, Get, Logger, Param } from '@nestjs/common';
import { RemoteAppService } from './remote-app.service'

const sid = 'myserver';
const hipuser = 'hipuser';


@Controller('remote-app')
export class RemoteAppController {

    constructor(private readonly remoteAppService: RemoteAppService) {}

    private readonly logger = new Logger('RemoteAppController');

    @Get('/servers')
    async getServers() {
        this.logger.log('/servers')

        return this.remoteAppService.getServers()
    }

    @Get('/servers/:id/stop')
    async stopServer(@Param('id') id) {
        this.logger.log(id, '/stopServer')

        return this.remoteAppService.stopServer(id)
    }

    @Get('/servers/:id/restart')
    async restartServer(@Param('id') id) {
        this.logger.log('/restartServer')

        return this.remoteAppService.restartServer(id)
    }

    @Get('/servers/:id/destroy')
    async destroyServer(@Param('id') id) {
        this.logger.log(id, '/destroyServer')

        return this.remoteAppService.destroyServer(id)
    }


    @Get('/servers/:id/start')
    async startServer(@Param('id') id) {
        this.logger.log('/startServer', id)

        return this.remoteAppService.startServer(id)
    }

    @Get('/servers/:id/start/:login/:password')
    async startServerWithWebdavCredentials(@Param('id') id, @Param('login') login, @Param('password') password) {
        this.logger.log('/startServer', id)

        return this.remoteAppService.startServerWithWebdavCredentials(id, login, password)
    }

    @Get('/servers/:sid/apps/:aid/start/:app')
    async startApp(@Param('sid') sid, @Param('aid') aid, @Param('app') app) {
        this.logger.log('/startApp', sid)

        return this.remoteAppService.startApp(sid, aid, app)
    }

    //     return this.remoteAppService.serverStatus(params)
    // }
}
