import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { ProjectsService } from 'src/projects/projects.service'
import { ToolsService } from 'src/tools/tools.service'

@Injectable()
export class WarmupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WarmupService.name)

  constructor(
    private readonly projectsService: ProjectsService,
    private readonly toolsService: ToolsService
  ) {
  }

  async onApplicationBootstrap() {
    this.logger.debug(`onApplicationBootstrap`)

    try {
      await this.projectsService.createProjectsGroup()
    } catch (error) {
      this.logger.error(error)
    }

    try {
      await this.projectsService.createProjectsAdminsGroup()
    } catch (error) {
      this.logger.error('409 IS OK, createProjectsAdminsGroup', error)
      this.logger.error('409 IS OK, createProjectsAdminsGroup', error)
    }

    try {
      const elasticSearchBidsDatasetsIndex = process.env.ELASTICSEARCH_BIDS_DATASETS_INDEX
      const elasticSearchBidsPublicDatasetsIndex = process.env.ELASTICSEARCH_PUBLIC_BIDS_DATASETS_INDEX

      await this.toolsService.createBIDSDatasetsIndex(elasticSearchBidsDatasetsIndex)
      await this.toolsService.createBIDSDatasetsIndex(elasticSearchBidsPublicDatasetsIndex)
    } catch (error) {
      this.logger.error(error) // eslint-disable-line no-console
    }
  }
}
