import { HttpService } from '@nestjs/axios'
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CacheService } from 'src/cache/cache.service'
import { Group, IamEbrainsService } from 'src/iam-ebrains/iam-ebrains.service'
import { CreateProjectDto } from './dto/create-project.dto'
import { ToolsService } from 'src/tools/tools.service'
import { ImportSubjectDto } from './dto/import-subject.dto'
import * as jetpack from 'fs-jetpack'

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
	members?: string[]
	admins?: string[]
}

// FIXME: CHECKIF GROUP EXISTS
// Holds all HIP projects as sub groups
const PROJECTS_ROOT_GROUP = 'HIP-Projects'
// Gives members access to administrate HIP projects
const PROJECTS_GROUP_ADMINS = 'HIP-Projects-admins'
const CACHE_ROOT_KEY = 'projects'

@Injectable()
export class ProjectsService {
	private readonly logger = new Logger(ProjectsService.name)

	constructor(
		private readonly iamService: IamEbrainsService,
		private readonly httpService: HttpService,
		private readonly cacheService: CacheService,
		private readonly configService: ConfigService,
		private readonly toolsService: ToolsService
	) {}

	private async invalidateProjectsCache(userId: string) {
		try {
			await this.cacheService.del(`${CACHE_ROOT_KEY}:all`)

			return this.cacheService.del(`${CACHE_ROOT_KEY}:${userId}`)
		} catch (error) {
			this.logger.debug(error)
		}
	}

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

	// TODO
	private async checkIfRootFolderExists() {}

	private async createAdminRoleGroup() {
		// this.cacheService.del(`${CACHE_ROOT_KEY}:${PROJECTS_GROUP_ADMINS}`)
		try {
			if (this.cacheService.get(`${CACHE_ROOT_KEY}:${PROJECTS_GROUP_ADMINS}`))
				return

			this.logger.debug(`createAdminRoleGroup`)
			await this.iamService.createGroup(
				PROJECTS_GROUP_ADMINS,
				PROJECTS_GROUP_ADMINS,
				'Gives members access to administrate HIP projects'
			)
			const admins = this.configService.get('iam.platformAdmins')
			await Promise.all(
				admins.map(adminId =>
					this.iamService.addUserToGroup(
						adminId,
						'administrator',
						PROJECTS_GROUP_ADMINS
					)
				)
			)
			this.cacheService.set(`${CACHE_ROOT_KEY}:${PROJECTS_GROUP_ADMINS}`, true)
		} catch (error) {
			this.logger.error(error)
			throw error
		}
	}

	public async hasProjectsAdminRole(userId) {
		try {
			await this.createAdminRoleGroup()
			const group = await this.iamService.getGroupListsByRole(
				PROJECTS_GROUP_ADMINS,
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

	async create(createProjectDto: CreateProjectDto) {
		this.logger.debug(
			`create createProjectDto=${JSON.stringify(createProjectDto)}`
		)

		try {
			const { title, description, adminId } = createProjectDto
			const projectName = `HIP-${title
				.replace(/[^a-zA-Z0-9]+/g, '-')
				.toLowerCase()}`

			// create group on iam-ebrains
			// await this.iamService.createGroup(projectName, title, description)
			// await this.iamService.addUserToGroup(adminId, 'member', projectName)
			// await this.iamService.addUserToGroup(
			// 	adminId,
			// 	'administrator',
			// 	projectName
			// )
			// await this.iamService.assignGroupToGroup(
			// 	projectName,
			// 	'member',
			// 	PROJECTS_ROOT_GROUP
			// )

			// create group folder on collab workspace
			const projectPath = `${this.configService.get(
				'collab.mountPoint'
			)}/__groupfolders/${projectName}`
			jetpack.dir(projectPath)

			await this.createUserFolder(adminId)
			return await this.toolsService.createProjectDataset(
				projectPath,
				createProjectDto
			)
		} catch (error) {
			this.logger.debug(error)
			throw error
		}
	}

	async findAll(): Promise<Project[]> {
		const cached = await this.cacheService.get(`${CACHE_ROOT_KEY}:all`)
		if (cached) {
			this.logger.debug(`${CACHE_ROOT_KEY}:all - cached`)
			return cached
		}
		try {
			const rootProject = await this.iamService.getGroup(PROJECTS_ROOT_GROUP)

			const groups = rootProject.members.groups
			this.cacheService.set(`${CACHE_ROOT_KEY}:all`, groups, 3600)

			return groups
		} catch (error) {
			throw new Error('Could not get projects')
		}
	}

	async findUserProjects(userId: string): Promise<Project[]> {
		const cached = await this.cacheService.get(`${CACHE_ROOT_KEY}:${userId}`)
		if (cached) {
			this.logger.debug(`${CACHE_ROOT_KEY}:${userId} - cached`)
			return cached
		}
		try {
			const projects = await this.findAll()
			const userGroups = await this.iamService.getUserGroups(userId)
			const userGroupNames = userGroups.map(g => g.name)

			const userProjects = projects
				.filter(p => userGroupNames.includes(p.name))
				.map(p => ({
					name: p.name,
					title: p.title,
					description: p.description,
					acceptMembershipRequest: p.acceptMembershipRequest
				}))

			this.cacheService.set(`${CACHE_ROOT_KEY}:${userId}`, userProjects, 3600)

			return userProjects
		} catch (error) {
			throw new Error('Could not get projects for user')
		}
	}

	async findOne(projectName: string): Promise<Project> {
		try {
			const group = await this.iamService.getGroup(projectName)

			return {
				name: group.name,
				title: group.title,
				description: group.description,
				acceptMembershipRequest: group.acceptMembershipRequest,
				members: group.members.users.map(u => u.username),
				admins: group.administrators.users.map(u => u.username)
			}
		} catch (error) {
			throw new Error('Could not get project')
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
			this.logger.debug(`groupList=${JSON.stringify(groupList)}`)
			return this.iamService.deleteGroup(projectName).then(() => {
				const users = groupList.users.map(u => u.username)
				this.logger.debug(`users=${JSON.stringify(users)}`)

				return Promise.all(
					[...users, adminId].map(uid => this.invalidateProjectsCache(uid))
				)
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
			const groupList = await this.iamService.getGroupListsByRole(
				projectName,
				'member'
			)
			const users = groupList.users.map(u => u.username)

			return users
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
			this.toolsService.importBIDSSubjectToProject(
				userId,
				importSubjectDto,
				projectPath
			)

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
