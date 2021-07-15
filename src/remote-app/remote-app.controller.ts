import {
  Body,
  Controller,
  Get,
  Put,
  Logger,
  Param,
  Post,
  Request,
  Response,
  HttpStatus,
} from '@nestjs/common';
import { RemoteAppService } from './remote-app.service';

@Controller('remote-app')
export class RemoteAppController {
  constructor(private readonly remoteAppService: RemoteAppService) {}

  private readonly logger = new Logger('RemoteAppController');

  @Get('/containers/:uid')
  async getContainers(@Param('uid') uid, @Request() req, @Response() res) {
    // this.logger.log(JSON.stringify(req.cookies, null, 2), '/containers');

    if (uid !== req.cookies.nc_username) {
      return res.status(HttpStatus.FORBIDDEN).send();
    }

    const json = await this.remoteAppService.getContainers(uid);

    return res.status(HttpStatus.OK).json(json);
  }

  @Post('/containers/:id/start')
  async startSessionWithUserId(
    @Param('id') id,
    @Body('uid') uid,
    @Request() req,
    @Response() res,
  ) {
    this.logger.log('/startSessionWithUserId', id);

    if (uid !== req.cookies.nc_username) {
      return res.status(HttpStatus.FORBIDDEN).send();
    }

    const json = await this.remoteAppService.startSessionWithUserId(id, uid);

    return res.status(HttpStatus.CREATED).json(json);
  }

  @Post('/containers/:sid/apps/:aid/start')
  async startAppWithWebdav(
    @Param('sid') sid,
    @Param('aid') aid,
    @Body('app') app,
    @Body('uid') uid,
    @Body('password') password,
    @Request() req,
    @Response() res,
  ) {
    this.logger.log('/startAppWithWebdav', sid);

    // Basic check against nc cookie
    if (uid !== req.cookies.nc_username) {
      return res.status(HttpStatus.FORBIDDEN).send();
    }

    const json = await this.remoteAppService.startAppWithWebdav(
      sid,
      aid,
      app,
      password,
    );

    return res.status(HttpStatus.CREATED).json(json);
  }

  @Put('/containers/:id/destroy')
  async destroyAppsAndSession(
    @Param('id') id,
    @Body('uid') uid,
    @Request() req,
    @Response() res,
  ) {
    this.logger.log(id, '/destroyAppsAndSession');
    this.logger.log(JSON.stringify(req.cookies, null, 2), '/containers');
    this.logger.log(uid, '/containers');

    if (uid !== req.cookies.nc_username) {
      return res.status(HttpStatus.FORBIDDEN).send();
    }

    const json = this.remoteAppService.destroyAppsAndSession(id);

    return res.status(HttpStatus.OK).json(json);
  }
}
