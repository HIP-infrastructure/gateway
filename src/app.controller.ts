import { Controller, Get, Logger } from '@nestjs/common';


@Controller()
export class AppController {

  private readonly logger = new Logger('AppController');

  @Get('/hello')
  getHello() {
    return { message: "hello" }
  }
}
