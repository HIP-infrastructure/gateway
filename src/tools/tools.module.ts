import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';

@Module({
  imports: [HttpModule],
  controllers: [ToolsController],
  providers: [ToolsService]
})
export class ToolsModule {}
