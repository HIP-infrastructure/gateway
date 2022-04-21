import { Body, Controller, Delete, Get, Post } from '@nestjs/common'
import { CreateBidsDatabaseDto } from './dto/create-bids-database.dto'
import { ToolsService } from './tools.service'

@Controller('tools')
export class ToolsController {

    constructor(
        private readonly toolsService: ToolsService) { }

    // BIDS DATABASE
    @Get('/bids/database')
    findOneDatabase() {
        return this.toolsService.getBIDSDatabase()
    }

    @Post('/bids/database')
    createDatabase(@Body() createBidsDatabaseDto: CreateBidsDatabaseDto) {
        return this.toolsService.createBIDSDatabase(createBidsDatabaseDto)
    }

    @Delete('/bids/database')
    removeOneDatabase() { }

    // BIDS Subject
    @Get('/bids/subject')
    findOneSubject() { }

    @Post('/bids/database')
    createSubject() { }

    @Delete('/bids/database')
    removeOneSubject() { }


}
