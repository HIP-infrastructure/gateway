import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { IamService } from 'src/iam/iam.service';
import { NextcloudService } from 'src/nextcloud/nextcloud.service';
import { IamModule } from 'src/iam/iam.module';
import { NextcloudModule } from 'src/nextcloud/nextcloud.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule, IamModule, NextcloudModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, IamService, NextcloudService]
})
export class ProjectsModule {}
