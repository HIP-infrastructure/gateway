import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { IamEbrainsService } from 'src/iam-ebrains/iam-ebrains.service';
import { NextcloudService } from 'src/nextcloud/nextcloud.service';
import { IamEbrainsModule } from 'src/iam-ebrains/iam-ebrains.module';
import { NextcloudModule } from 'src/nextcloud/nextcloud.module';
import { HttpModule } from '@nestjs/axios';
import { CacheService } from 'src/cache/cache.service';

@Module({
  imports: [HttpModule, IamEbrainsModule, NextcloudModule],
  controllers: [ProjectsController],
  providers: [CacheService, ProjectsService, IamEbrainsService, NextcloudService]
})
export class ProjectsModule {}
