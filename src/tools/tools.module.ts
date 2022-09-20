import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common';
import { FilesModule } from 'src/files/files.module'
import { FilesService } from 'src/files/files.service'
import { UsersModule } from 'src/users/users.module'
import { UsersService } from 'src/users/users.service'
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';

@Module({
  imports: [HttpModule, UsersModule, FilesModule],
  controllers: [ToolsController],
  providers: [ToolsService, UsersService, FilesService]
})
export class ToolsModule {}
