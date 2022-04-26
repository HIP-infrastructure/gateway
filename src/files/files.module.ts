import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { FilesController } from './files.controller'
import { FilesService } from './files.service'

@Module({
	imports: [HttpModule],
	controllers: [FilesController],
	providers: [FilesService],
})
export class FilesModule {}
