import { HttpService } from '@nestjs/axios'
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as jetpack from 'fs-jetpack'
import { CacheService } from 'src/cache/cache.service'
import { Group, IamEbrainsService } from 'src/iam-ebrains/iam-ebrains.service'
import { BIDSDataset, ToolsService } from 'src/tools/tools.service'
import { CreateProjectDto } from './dto/create-project.dto'
import { ImportSubjectDto } from './dto/import-subject.dto'

interface FileMetadata {
	name: string
	size: number
	fullPath: string
	created: string
	updated: string
	md5Hash: string
	contentType: string
	contentEncoding: string
}

export interface Project extends Group {
	isMember?: boolean
	members?: string[]
	admins?: string[]
}

const PROJECTS_GROUP = 'HIP-Projects' // Holds all HIP projects as sub groups
const PROJECTS_ADMINS_GROUP = 'HIP-Projects-admins' // Holds members allowed to create HIP projects
const CACHE_KEY_PROJECTS = 'projects'

@Injectable()
export class ProjectsService {
	private readonly logger = new Logger(ProjectsService.name)

	constructor(
		private readonly iamService: IamEbrainsService,
		private readonly httpService: HttpService,
		private readonly cacheService: CacheService,
		private readonly configService: ConfigService,
		private readonly toolsService: ToolsService
	) { }

	private async getProjectsCacheFor(userId: string): Promise<Project[]> {
		this.logger.debug(`getProjectsCacheFor(${userId})`)
		return this.cacheService.get(`${CACHE_KEY_PROJECTS}:${userId}`)
	}

	private async setProjectsCacheFor(userId: string, projects: Project[]) {
		this.logger.debug(`setProjectsCacheFor(${userId})`)
		return this.cacheService.set(`${CACHE_KEY_PROJECTS}:${userId}`, projects)
	}

	private async refreshProjectsCacheFor(userId: string): Promise<Project[]> {
		const projects = await this.findAll(userId, true)
		await this.setProjectsCacheFor(userId, projects)

		return projects
	}

	private async refreshProjectsCache(projectName: string) {
		const groupList = await this.iamService.getGroupListsByRole(
			projectName,
			'member'
		)
		const users = groupList.users.map(u => u.username)
		return Promise.all(users.map(u => this.refreshProjectsCacheFor(u)))
	}


	/* It creates a group called `HIP-Projects` and adds the platform admins to it. 
	This group is used to hold all HIP projects as sub groups. */
	private async createProjectsGroup() {
		this.logger.debug(`createProjectsGroup`)
		if (this.cacheService.get(`${CACHE_KEY_PROJECTS}:${PROJECTS_GROUP}`))
			return

		await this.iamService.createGroup(
			PROJECTS_GROUP,
			PROJECTS_GROUP,
			'Holds all HIP projects as sub groups'
		)
		const admins = this.configService.get('iam.platformAdmins')
		await Promise.all(
			admins.map(adminId =>
				this.iamService.addUserToGroup(
					adminId,
					'administrator',
					PROJECTS_GROUP
				)
			)
		)

		this.cacheService.set(`${CACHE_KEY_PROJECTS}:${PROJECTS_GROUP}`, true)
	}


	/* It creates a group called `HIP-Projects-admins` and adds the platform admins to it. 
	 * This group is used to give users access to administrate HIP projects, i.e. create new projects,
	 * by adding them to the group `HIP-Projects-admins` as member.
	*/
	private async createAdminGroup() {
		this.logger.debug(`createAdminGroup`)
		try {
			if (this.cacheService.get(`${CACHE_KEY_PROJECTS}:${PROJECTS_ADMINS_GROUP}`))
				return

			await this.iamService.createGroup(
				PROJECTS_ADMINS_GROUP,
				PROJECTS_ADMINS_GROUP,
				'Gives members access to administrate HIP projects'
			)
			const admins = this.configService.get('iam.platformAdmins')
			await Promise.all(
				admins.map(adminId =>
					this.iamService.addUserToGroup(
						adminId,
						'administrator',
						PROJECTS_ADMINS_GROUP
					)
				)
			)
			this.cacheService.set(`${CACHE_KEY_PROJECTS}:${PROJECTS_ADMINS_GROUP}`, true)
		} catch (error) {
			this.logger.error(error)
			throw error
		}
	}


	/* It creates a folder for the user in the collab workspace. */
	private async createUserFolder(userId: string) {
		this.logger.debug(`createUserFolder: userId=${userId}`)
		const userFolder = `${this.configService.get(
			'collab.mountPoint'
		)}/${userId}`

		jetpack
			.dir(userFolder, { empty: true })
			.dir(`${userFolder}/files`, { empty: true })
		const content = jetpack.inspectTree(userFolder)

		return content
	}

	public async isProjectsAdmin(userId) {
		try {
			await this.createAdminGroup()

			const group = await this.iamService.getGroupListsByRole(
				PROJECTS_ADMINS_GROUP,
				'member'
			)

			return group.users.map(u => u.username).includes(userId)


		} catch (error) {
			this.logger.error(error)
			throw error
		}
	}

	public async userIsProjectAdmin(projectName, userId) {
		try {
			const group = await this.iamService.getGroupListsByRole(
				projectName,
				'administrator'
			)
			const isAdmin = group.users.map(u => u.username).includes(userId)
			if (!isAdmin)
				throw new HttpException(
					`${userId} is not an admin.`,
					HttpStatus.FORBIDDEN
				)

			return userId
		} catch (error) {
			this.logger.error(error)
			throw error
		}
	}

	async findAll(userId: string, forceCache = false): Promise<Project[]> {
		this.logger.debug(`findAll: userId=${userId} forceCache=${forceCache}`)

		if (!forceCache) {
			const cached = await this.getProjectsCacheFor(userId)
			if (cached) {
				this.logger.debug(`- cached`)
				return cached
			}
		}

		try {
			const rootProject = await this.iamService.getGroup(PROJECTS_GROUP)
			const groups = rootProject.members.groups
			const userGroups = await this.iamService.getUserGroups(userId)
			const projects = groups
				.map(p => ({
					isMember: userGroups.map(g => g.name).includes(p.name),
					name: p.name,
					title: p.title,
					description: p.description,
					acceptMembershipRequest: p.acceptMembershipRequest
				}))

			this.setProjectsCacheFor(userId, projects)

			return projects
		} catch (error) {
			throw new Error('Could not get projects')
		}
	}

	async findOne(projectName: string): Promise<Project & { dataset: BIDSDataset }> {
		try {
			const group = await this.iamService.getGroup(projectName)
			const dataset = await this.cacheService.get(`${CACHE_KEY_PROJECTS}:${projectName}:dataset`)

			return {
				name: group.name,
				title: group.title,
				description: group.description,
				acceptMembershipRequest: group.acceptMembershipRequest,
				members: group.members.users.map(u => u.username),
				admins: group.administrators.users.map(u => u.username),
				dataset
			}
		} catch (error) {
			throw new Error('Could not get project')
		}
	}

	async create(createProjectDto: CreateProjectDto) {
		this.logger.debug(
			`create createProjectDto=${JSON.stringify(createProjectDto)}`
		)

		try {
			await this.createProjectsGroup()

			const { title, description, adminId } = createProjectDto
			const projectName = `HIP-${title
				.replace(/[^a-zA-Z0-9]+/g, '-')
				.toLowerCase()}`

			// create group on iam-ebrains
			await this.iamService.createGroup(projectName, title, description)
			await this.iamService.addUserToGroup(adminId, 'member', projectName)
			await this.iamService.addUserToGroup(
				adminId,
				'administrator',
				projectName
			)
			await this.iamService.assignGroupToGroup(
				projectName,
				'member',
				PROJECTS_GROUP
			)

			// create group folder on collab workspace
			const projectPath = `${this.configService.get(
				'collab.mountPoint'
			)}/__groupfolders/${projectName}`
			jetpack.dir(projectPath)

			// create user folder on collab workspace if it doen't exist
			await this.createUserFolder(adminId)

			// create project structure
			this.toolsService.createProjectDataset(
				projectPath,
				createProjectDto
			).then(dataset => {
				this.logger.debug(`create dataset=${JSON.stringify(dataset)}`)

				// TODO: record dataset in a database
				this.cacheService.set(`${CACHE_KEY_PROJECTS}:${projectName}:dataset`, dataset)
			})

			return this.refreshProjectsCacheFor(adminId)

		} catch (error) {
			this.logger.debug(error)
			throw error
		}
	}

	// update(projectName: number, updateProjectDto: UpdateProjectDto) {
	// 	return `This action updates a #${projectName} project`
	// }

	async remove(projectName: string, adminId: string) {
		this.logger.debug(`remove(${projectName}, ${adminId})`)
		try {
			const groupList = await this.iamService.getGroupListsByRole(
				projectName,
				'member'
			)

			return this.iamService.deleteGroup(projectName).then(async () => {
				await this.refreshProjectsCache(projectName)

				return this.findAll(adminId)
			})
		} catch (error) {
			this.logger.error(error)
			throw new Error('Could not delete project')
		}
	}

	async addUserToProject(userId: string, projectName: string) {
		this.logger.debug(`addUserToProject(${userId}, ${projectName})`)
		try {
			await this.createUserFolder(userId)
		} catch (error) {
			this.logger.debug('userFolder exists')
		}
		try {
			await this.iamService.addUserToGroup(userId, 'member', projectName)
			await this.refreshProjectsCache(projectName)

			return this.findOne(projectName)
		} catch (error) {
			this.logger.error(error)
			throw new Error('Could not add user to project')
		}
	}

	async removeUserFromProject(userId: string, projectName: string) {
		this.logger.debug(`removeUserFromProject(${userId}, ${projectName})`)

		try {
			await this.iamService.removeUserFromGroup(userId, 'member', projectName)
			await this.refreshProjectsCache(projectName)

			return this.findOne(projectName)
		} catch (error) {
			this.logger.error(error)
			throw new Error('Could not add user to project')
		}
	}

	public async importBIDSSubject(
		userId: string,
		importSubjectDto: ImportSubjectDto,
		projectName: string
	) {
		this.logger.debug(
			`importBIDSSubject(${userId}, ${JSON.stringify(
				importSubjectDto
			)} ${projectName})`
		)
		try {
			const projectPath = `${this.configService.get(
				'collab.mountPoint'
			)}/__groupfolders/${projectName}`
			const dataset = await this.toolsService.importBIDSSubjectToProject(
				userId,
				importSubjectDto,
				projectPath
			)
			this.cacheService.set(`${CACHE_KEY_PROJECTS}:${projectName}:dataset`, dataset)

			return 'Success'
		} catch (error) {
			this.logger.error(error)
			throw new Error('Could not import BIDS subject')
		}
	}

	public importDocument() {
		const sourceDocumentAbsPath = ''
		const targetProjectAbsPath = ''
		const targetDocumentRelPath = ''
		// this.toolsService.importDocumentToProject(
		// 	sourceDocumentAbsPath,
		// 	targetProjectAbsPath,
		// 	targetDocumentRelPath
		// )
	}

	public async metadataTree(
		userId: string,
		projectName: string,
		path: string = '/'
	) {
		this.logger.debug(
			`metadataTree: name=${projectName}, path=${path} userId=${userId} `
		)

		try {
			const projectPath = `${process.env.COLLAB_MOUNT}/__groupfolders/${projectName}`
			const rootPath = `${projectPath}/${path}`
			const content = jetpack.inspectTree(rootPath, { relativePath: true })

			return content
		} catch (error) {
			this.logger.error(error)
			throw new Error(error)
		}
	}
}
