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
import { ImportDocumentDto } from './dto/import-document.dto'

@Controller('projects')
export class ProjectsController {
	private readonly logger = new Logger('ProjectsController')

	constructor(
		private readonly projectsService: ProjectsService,
		private readonly nextcloudService: NextcloudService
	) { }

	@Get()
	async findAll(
		@Req() req: Request,
	) {
		this.logger.debug(`findAll()`)
		try {
			return await this.nextcloudService
				.authUserIdFromRequest(req)
				.then((userId) => this.projectsService.findAll(userId))
		} catch (error) {
			this.logger.error(error)
			throw new HttpException(
				`Error fetching projects: ${error}`,
				HttpStatus.INTERNAL_SERVER_ERROR
			)
		}
	}

	@Get('/users/:userId')
	async findProjectsForUser(
		@Req() req: Request,
		@Param('userId') userId: string) {
		this.logger.debug(`findProjectsForUser(${userId})`)
		try {
			return await this.nextcloudService
				.authUserIdFromRequest(req)
				.then((id) => this.projectsService.findProjectsForUser(id))
		} catch (error) {
			this.logger.error(error)
			throw new HttpException(
				`Error fetching projects: ${error}`,
				HttpStatus.INTERNAL_SERVER_ERROR
			)
		}
	}

	@Get(':projectName')
	findOne(
		@Req() req: Request,
		@Param('projectName') projectName: string
	): Promise<Project> {
		this.logger.debug(`findOne(${projectName})`)
		return this.nextcloudService
			.authUserIdFromRequest(req)
			.then((userId) => this.projectsService.findOne(projectName))
	}

	// TODO: @Roles(Role.Admin)
	@Post()
	async create(
		@Req() req: Request,
		@Body() createProjectDto: CreateProjectDto
	) {
		this.logger.debug(`create(${JSON.stringify(createProjectDto)})`)
		const userId = await this.nextcloudService.authUserIdFromRequest(req)
		const isAdmin = await this.projectsService.isProjectsAdmin(userId)

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
			// .then(userId =>
			// 	this.projectsService.userIsProjectAdmin(projectName, userId)
			// )
			.then(userId => this.projectsService.remove(projectName, userId))
	}

	@Post(':projectName/users/:userId')
	addUser(
		@Req() req: Request,
		@Param('projectName') projectName: string,
		@Param('userId') userId: string
	) {
		this.logger.debug(`addUser(${projectName}, ${userId})`)
		return this.nextcloudService
			.authUserIdFromRequest(req)
			// .then(userId =>
			// 	this.projectsService.userIsProjectAdmin(projectName, userId)
			// )
			.then(_ =>
				this.projectsService.addUserToProject(userId, projectName)
			)
	}

	@Delete(':projectName/users/:userId/')
	removeUser(
		@Req() req: Request,
		@Param('projectName') projectName: string,
		@Param('userId') userId: string
	) {
		this.logger.debug(`removeUser(${projectName}, ${userId})`)
		return this.nextcloudService
			.authUserIdFromRequest(req)
			// .then(userId =>
			// 	this.projectsService.userIsProjectAdmin(projectName, userId)
			// )
			.then(_ =>
				this.projectsService.removeUserFromProject(userId, projectName)
			)
	}

	// @Post('/api')
	// createFSAPI(@Req() req: Request) {
	// 	return this.nextcloudService
	// 		.authUserIdFromRequest(req)
	// 		.then(async userId => {
	// 			this.logger.debug(`createFSAPI(${userId})`)
	// 			return await this.projectsService.createFSAPI(userId)
	// 		})
	// }

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
	importDocument(@Req() req: Request, @Param('projectName') projectName: string,
		@Body() importDocumentDto: ImportDocumentDto) {
		return this.nextcloudService
			.authUserIdFromRequest(req)
			.then(async userId => {
				this.logger.debug(`importDocument(${userId})`)
				return this.projectsService.importDocument(
					userId,
					importDocumentDto,
					projectName
				)
			})
	}

	@Post(':projectName/documents')
	importMultipleDocuments(
		@Req() req: Request,
		@Param('projectName') projectName: string,
		@Body() importDocumentsDto: ImportDocumentDto[]
	) {
		return this.nextcloudService
			.authUserIdFromRequest(req)
			.then(async userId => {
				this.logger.debug(`importMultipleDocuments(${userId})`)
				const importPromises = importDocumentsDto.map(documentDto => 
					this.importDocument(req, projectName, documentDto)
				);
				return Promise.all(importPromises);
			});
	}

	@Get(':projectName/metadataTree')
	metadataTree(
		@Req() req: Request,
		@Param('projectName') projectName: string,
		@Query('path') path: string,
	) {
		return this.nextcloudService.authUserIdFromRequest(req).then(userId => {
			return this.projectsService.metadataTree(userId, projectName, path)
		})
	}
}
