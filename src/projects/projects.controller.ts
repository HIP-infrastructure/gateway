import {
	Controller,
	Get,
	Post,
	Body,
	Param,
	Delete,
	Query,
	Request as Req,
	Logger,
	HttpException,
	HttpStatus
} from '@nestjs/common'
import { Request } from 'express'

import { Project, ProjectsService } from './projects.service'
import { CreateProjectDto } from './dto/create-project.dto'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'
import { ImportSubjectDto } from './dto/import-subject.dto'

@Controller('projects')
export class ProjectsController {
	private readonly logger = new Logger('ProjectsController')

	constructor(
		private readonly projectsService: ProjectsService,
		private readonly nextcloudService: NextcloudService
	) {}

	@Get()
	findAll(@Req() req: Request) {
		this.logger.debug(`findAll()`)
		return this.nextcloudService
			.authenticate(req)
			.then(() => this.projectsService.findAll())
	}

	@Get('forUser/:userId')
	findUserProjects(
		@Req() req: Request,
		@Param('userId') userId: string
	): Promise<Project[]> {
		this.logger.debug(`findUserProjects(${userId})`)
		return this.nextcloudService
			.authenticate(req)
			.then(() => this.projectsService.findUserProjects(userId))
	}

	@Get(':projectName')
	findOne(
		@Req() req: Request,
		@Param('projectName') projectName: string
	): Promise<Project> {
		this.logger.debug(`findOne(${projectName})`)
		return this.nextcloudService
			.authenticate(req)
			.then(() => this.projectsService.findOne(projectName))
	}

	// TODO: @Roles(Role.Admin)
	@Post()
	async create(
		@Req() req: Request,
		@Body() createProjectDto: CreateProjectDto
	) {
		this.logger.debug(`create(${JSON.stringify(createProjectDto)})`)
		const userId = await this.nextcloudService.authUserIdFromRequest(req)
		const isAdmin = await this.projectsService.hasProjectsAdminRole(userId)

		if (!isAdmin)
			throw new HttpException(
				`You must be an admin to create projects`,
				HttpStatus.FORBIDDEN
			)

		return this.projectsService.create(createProjectDto)
	}

	// @Patch(':id')
	// update(@Param('id') id: string, @Body() updateProjectDto: UpdateProjectDto) {
	// 	return this.projectsService.update(+id, updateProjectDto)
	// }

	@Delete(':projectName')
	remove(@Req() req: Request, @Param('projectName') projectName: string) {
		this.logger.debug(`remove(${projectName})`)
		return this.nextcloudService
			.authUserIdFromRequest(req)
			.then(userId =>
				this.projectsService.userIsProjectAdmin(projectName, userId)
			)
			.then(userId => this.projectsService.remove(projectName, userId))
	}

	@Post(':projectName/addUser/:username/')
	addUser(
		@Req() req: Request,
		@Param('projectName') projectName: string,
		@Param('username') username: string
	) {
		this.logger.debug(`addUser(${projectName}, ${username})`)
		return this.nextcloudService
			.authUserIdFromRequest(req)
			.then(userId =>
				this.projectsService.userIsProjectAdmin(projectName, userId)
			)
			.then(adminId =>
				this.projectsService.addUserToProject(username, projectName)
			)
	}

	@Post('/api')
	createFSAPI(@Req() req: Request) {
		return this.nextcloudService
			.authUserIdFromRequest(req)
			.then(async userId => {
				this.logger.debug(`createFSAPI(${userId})`)
				return await this.projectsService.createFSAPI(userId)
			})
	}

	@Post(':projectName/subject')
	importBIDSSubject(
		@Req() req: Request,
		@Param('projectName') projectName: string,
		@Body() importSubjectDto: ImportSubjectDto
	) {
		return this.nextcloudService
			.authUserIdFromRequest(req)
			.then(async userId => {
				return this.projectsService.importBIDSSubject(
					userId,
					importSubjectDto,
					projectName
				)
			})
	}

	@Post(':projectName/document')
	importDocument(@Req() req: Request) {
		return this.nextcloudService
			.authUserIdFromRequest(req)
			.then(async userId => {
				this.logger.debug(`importDocument(${userId})`)
				return this.projectsService.importDocument()
			})
	}

	@Get(':projectName/metadataTree')
	metadataTree(
		@Req() req: Request,
		@Param('projectName') projectName: string,
		@Query('path') path: string,
		@Query('refreshApi') refreshApi: boolean
	) {
		return this.nextcloudService.authUserIdFromRequest(req).then(userId => {
			this.logger.debug(`metadataTree(${projectName}, ${path}, ${userId})`)
			return this.projectsService.metadataTree(projectName, path, userId)
		})
	}
}
