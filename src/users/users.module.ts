import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [HttpModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersModule]
})
export class UsersModule {}
