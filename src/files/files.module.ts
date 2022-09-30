import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { UsersModule } from 'src/users/users.module'
import { FilesController } from './files.controller'
import { FilesService } from './files.service'

@Module({
	imports: [HttpModule, UsersModule],
	controllers: [FilesController],
	providers: [FilesService],
	exports: [FilesModule],
})
export class FilesModule {}
