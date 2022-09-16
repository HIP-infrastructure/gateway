import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { UsersModule } from 'src/users/users.module'
import { UsersService } from 'src/users/users.service'
import { FilesController } from './files.controller'
import { FilesService } from './files.service'

@Module({
	imports: [HttpModule, UsersModule],
	controllers: [FilesController],
	providers: [FilesService, UsersService],
	exports: [FilesModule]
})
export class FilesModule {}
