import { HttpService } from '@nestjs/axios'
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as jetpack from 'fs-jetpack'
import { CacheService } from 'src/cache/cache.service'
import { Group, IamEbrainsService } from 'src/iam-ebrains/iam-ebrains.service'
import { BIDSDataset, ToolsService } from 'src/tools/tools.service'
import { CreateProjectDto } from './dto/create-project.dto'
import { ImportDocumentDto } from './dto/import-document.dto'
import { ImportSubjectDto } from './dto/import-subject.dto'
const fsPromises = require('fs').promises
const userIdLib = require('userid')
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

const PROJECTS_GROUP = `HIP-Projects-${process.env.COLLAB_SUFFIX}` // Holds all HIP projects as sub groups
const PROJECTS_ADMINS_GROUP = 'HIP-Projects-admins' // Holds members allowed to create HIP projects
const CACHE_KEY_PROJECTS = 'projects'

@Injectable()
export class ProjectsService {
	private readonly logger = new Logger(ProjectsService.name)
	private dataUserId: number

	constructor(
		private readonly iamService: IamEbrainsService,
		private readonly httpService: HttpService,
		private readonly cacheService: CacheService,
		private readonly configService: ConfigService,
		private readonly toolsService: ToolsService
	) {
		const uid = this.configService.get<string>('instance.dataUser')
		const id = parseInt(userIdLib.uid(uid), 10)
		this.dataUserId = id
	}

	private async getProjectsCacheFor(userId: string): Promise<Project[]> {
		this.logger.debug(
			`getProjectsCacheFor(${userId})@${this.configService.get<string>(
				'instance.hostname'
			)}`
		)
		return this.cacheService.get(
			`${CACHE_KEY_PROJECTS}:${userId}@${this.configService.get<string>(
				'instance.hostname'
			)}`
		)
	}

	private async setProjectsCacheFor(userId: string, projects: Project[]) {
		this.logger.debug(`setProjectsCacheFor(${userId})`)
		return this.cacheService.set(
			`${CACHE_KEY_PROJECTS}:${userId}@${this.configService.get<string>(
				'instance.hostname'
			)}`,
			projects,
			60 * 60
		)
	}

	private async refreshProjectsCacheFor(userId: string): Promise<Project[]> {
		const projects = await this.findAll(userId, true)
		await this.setProjectsCacheFor(userId, projects)

		return projects
	}

	public async refreshProjectsCache(projectName: string) {
		const groupList = await this.iamService.getGroupListsByRole(
			projectName,
			'member'
		)
		const users = groupList.users.map(u => u.username)
		return Promise.all(users.map(u => this.refreshProjectsCacheFor(u)))
	}

	/* The `chown` function changes the ownership of a file or directory specified by the `path` parameter
to the user and group specified by `this.dataUserId`. This is used in the `createUserFolder`
function to change the ownership of the user's folder in the collab workspace to the data user. */
	private async chown(path: string) {
		this.logger.debug(`${path} ownership changed to ${this.dataUserId}`)
		return fsPromises.chown(path, this.dataUserId, this.dataUserId)
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
		await this.chown(userFolder)

		return jetpack.inspectTree(userFolder)
	}

	public async isProjectsAdmin(userId) {
		this.logger.debug(`isProjectsAdmin: userId=${userId}`)

		try {
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
			const fullgroups = await Promise.all(
				groups.map(g => this.iamService.getGroup(g.name))
			)
			const userGroups = await this.iamService.getUserGroups(userId)
			const projects = fullgroups.map(p => ({
				isMember: userGroups.map(g => g.name).includes(p.name),
				name: p.name,
				title: p.title,
				description: p.description,
				acceptMembershipRequest: p.acceptMembershipRequest,
				members: p.members.users.map(u => u.username),
				admins: p.administrators.users.map(u => u.username)
			}))

			this.setProjectsCacheFor(userId, projects)

			return projects
		} catch (error) {
			this.logger.error(error)
			throw error
		}
	}

	async findOne(
		projectName: string,
		userId: string
	): Promise<Project & { dataset: BIDSDataset }> {
		try {
			const group = await this.iamService.getGroup(projectName)
			const dataset = await this.cacheService.get(
				`${CACHE_KEY_PROJECTS}:${projectName}:dataset`
			)

			return {
				name: group.name,
				title: group.title,
				description: group.description,
				acceptMembershipRequest: group.acceptMembershipRequest,
				members: group.members.users.map(u => u.username),
				admins: group.administrators.users.map(u => u.username),
				isMember: [...group.members.users, ...group.administrators.users]
					.map(g => g.username)
					.includes(userId),
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
			const { title, description, adminId } = createProjectDto

			// create group on iam-ebrains
			const { data: name } = await this.iamService.createGroup(
				title,
				title,
				description
			)
			await this.iamService.addUserToGroup(adminId, 'member', name)
			await this.iamService.addUserToGroup(adminId, 'administrator', name)
			await this.iamService.assignGroupToGroup(name, 'member', PROJECTS_GROUP)

			// create user folder on collab workspace if it doesn't exist
			try {
				await this.createUserFolder(adminId)
			} catch (error) {
				console.log(error)
			}

			// create group folder on collab workspace
			const projectPath = `${this.configService.get(
				'collab.mountPoint'
			)}/__groupfolders/${name}`
			jetpack.dir(projectPath)
			await this.chown(projectPath)

			// create project structure
			this.toolsService
				.createProjectDataset(projectPath, createProjectDto)
				.then(dataset => {
					this.logger.debug(`create dataset=${JSON.stringify(dataset)}`)

					// TODO: record dataset in a database
					this.cacheService.set(
						`${CACHE_KEY_PROJECTS}:${name}:dataset`,
						dataset
					)
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
			return this.iamService.deleteGroup(projectName).then(async () => {
				await this.refreshProjectsCacheFor(adminId)

				return this.findAll(adminId)
			})
		} catch (error) {
			this.logger.debug(error)
			throw error
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

			return this.findOne(projectName, userId)
		} catch (error) {
			this.logger.debug(error)
			throw error
		}
	}

	async removeUserFromProject(userId: string, projectName: string) {
		this.logger.debug(`removeUserFromProject(${userId}, ${projectName})`)

		try {
			await this.iamService.removeUserFromGroup(userId, 'member', projectName)
			await this.refreshProjectsCache(projectName)

			return this.findOne(projectName, userId)
		} catch (error) {
			this.logger.debug(error)
			throw error
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
			this.cacheService.set(
				`${CACHE_KEY_PROJECTS}:${projectName}:dataset`,
				dataset
			)

			return 'Success'
		} catch (error) {
			this.logger.debug(error)
			throw error
		}
	}

	public async importDocument(
		userId: string,
		importDocumentDto: ImportDocumentDto,
		projectName: string
	) {
		try {
			const projectPath = `${process.env.COLLAB_MOUNT}/__groupfolders/${projectName}`
			const targetFileNameBits = importDocumentDto.sourceFilePath.split('/')
			const targetFileName = targetFileNameBits[targetFileNameBits.length - 1]

			await this.toolsService.importDocumentToProject(
				userId,
				importDocumentDto.sourceFilePath,
				projectPath,
				`${importDocumentDto.targetDirPath}/${targetFileName}`
			)

			return 'Success'
		} catch (error) {
			this.logger.debug(error)
			throw error
		}
	}

	public async metadataTree(
		userId: string,
		projectName: string,
		path?: string
	) {
		this.logger.debug(
			`metadataTree: name=${projectName}, path=${path} userId=${userId} `
		)

		try {
			const projectPath = `${process.env.COLLAB_MOUNT}/__groupfolders/${projectName}`
			const rootPath = `${projectPath}/${path ? path : ''}`
			this.logger.debug(`rootPath=${rootPath}`)
			const content = jetpack.inspectTree(rootPath, {
				relativePath: true,
				times: true
			})
			this.logger.debug(`content=${JSON.stringify(content)}`)

			return content
		} catch (error) {
			this.logger.debug(error)
			throw error
		}
	}

	/* It creates a group called `HIP-Projects` and adds the platform admins to it. 
	This group is used to hold all HIP projects as sub groups. */
	public async createProjectsGroup() {
		this.logger.debug(`createProjectsGroup`)

		await this.iamService.createGroup(
			PROJECTS_GROUP,
			PROJECTS_GROUP,
			'Holds all HIP projects as sub groups'
		)
		const admins = this.configService.get('iam.platformAdmins')
		await Promise.all(
			admins.map(adminId =>
				this.iamService.addUserToGroup(adminId, 'administrator', PROJECTS_GROUP)
			)
		)
	}

	/* It creates a group called `HIP-Projects-admins` and adds the platform admins to it.
	 * This group is used to give users access to administrate HIP projects, i.e. create new projects,
	 * by adding them to the group `HIP-Projects-admins` as member.
	 */
	public async createAdminGroup() {
		this.logger.debug(`createAdminGroup`)
		try {
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
		} catch (error) {
			this.logger.error(error)
			throw error
		}
	}
}
