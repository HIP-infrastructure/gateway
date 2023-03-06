import { HttpService } from '@nestjs/axios'
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { spawn } from 'child_process'
import { catchError, firstValueFrom } from 'rxjs'
import { CacheService } from 'src/cache/cache.service'
import { findFreePort } from 'src/common/utils/shared.utils'
import { Group, IamEbrainsService } from 'src/iam-ebrains/iam-ebrains.service'
import { CreateProjectDto } from './dto/create-project.dto'
import { v4 as uuidv4 } from 'uuid'
import { ToolsService } from 'src/tools/tools.service'
const { NodeSSH } = require('node-ssh')
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

export interface GhostFSAPI {
	mount: string
	url: string
	dockerId: string
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

function cacheKeyForGhostFSAPIUser(userId: string) {
	return `ghostfs-projects-fs-api:${userId}`
}

function cacheKeyLockForGhostFSAPIUser(userId: string) {
	return `lock-ghostfs--projects-fs-api:${userId}`
}

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

	private async sshConnect() {
		return new NodeSSH().connect({
			host: this.configService.get('collab.sshHost'),
			username: this.configService.get('collab.sshUsername'),
			privateKeyPath: this.configService.get('collab.sshPrivateKeyPath')
		})
	}

	private async createUserFolder(userId: string) {
		this.logger.debug(`createUserFolder: userId=${userId}`)
		const userFolder = `${this.configService.get('collab.path')}/../${userId}`

		const ssh = await this.sshConnect()
		await ssh.execCommand(`mkdir -p ${userFolder}/files`).then(result => {
			this.logger.debug(`STDOUT: ${result.stdout}, STDERR: ${result.stderr}`)
		})
		await ssh
			.execCommand(`sudo chown -R www-data: ${userFolder}`)
			.then(result => {
				this.logger.debug(`STDOUT: ${result.stdout}, STDERR: ${result.stderr}`)
			})
		return ssh.dispose()
	}

	private async invalidateProjectsCache(userId: string) {
		try {
			await this.deleteGhostFSAPI(userId)
		} catch (error) {
			this.logger.debug(error)
		}
		await this.cacheService.del(`${CACHE_ROOT_KEY}:all`)

		return this.cacheService.del(`${CACHE_ROOT_KEY}:${userId}`)
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
		try {
			const { title, description, adminId } = createProjectDto
			const projectName = `HIP-${title
				.replace(/[^a-zA-Z0-9]+/g, '-')
				.toLowerCase()}`

			// create group on iam-ebrains
			await this.iamService.createGroup(projectName, title, description)
			await this.iamService.addUserToGroup(
				adminId,
				'administrator',
				projectName
			)
			await this.iamService.addUserToGroup(adminId, 'member', projectName)
			await this.iamService.assignGroupToGroup(
				projectName,
				'member',
				PROJECTS_ROOT_GROUP
			)

			// create group folder on collab workspace
			const ssh = await this.sshConnect()
			const groupFolder = `${this.configService.get(
				'collab.path'
			)}/${projectName}`
			await ssh.execCommand(`mkdir -p ${groupFolder}`).then(result => {
				this.logger.debug(`STDOUT: ${result.stdout}, STDERR: ${result.stderr}`)
			})
			await ssh
				.execCommand(`sudo chown -R www-data: ${groupFolder}`)
				.then(result => {
					this.logger.debug(
						`STDOUT: ${result.stdout}, STDERR: ${result.stderr}`
					)
				})
			ssh.dispose()

			this.createFSAPI(adminId).then(({ mount }) => {
				setTimeout(() => {
					this.toolsService.createProjectDataset(mount, createProjectDto)
				}, 5 * 1000)
			})

			await this.createUserFolder(adminId)
			await this.cacheService.del(`${CACHE_ROOT_KEY}:all`)

			return this.cacheService.del(`${CACHE_ROOT_KEY}:${adminId}`)
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
		try {
			const groupList = await this.iamService.getGroupListsByRole(
				projectName,
				'member'
			)
			return this.iamService.deleteGroup(projectName).then(() => {
				const users = groupList.users.map(u => u.username)
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
			return Promise.all(users.map(uid => this.invalidateProjectsCache(uid)))
		} catch (error) {
			this.logger.error(error)
			throw new Error('Could not add user to project')
		}
	}

	public importBIDSSubject() {
		const sourceDatasetPath = ''
		const participantId = ''
		const targetPath = ''

		this.toolsService.importBIDSSubjectToProject(
			sourceDatasetPath,
			participantId,
			targetPath
		)
	}

	public importDocument() {
		const sourcePath = ''
		const targetPath = ''
		this.toolsService.importDocumentToProject(sourcePath, targetPath)
	}

	public async metadataTree(projectName: string, path: string, userId: string) {
		this.logger.debug(
			`metadataTree: name=${projectName}, path=${path} userId=${userId} `
		)

		try {
			const cacheKey = cacheKeyForGhostFSAPIUser(userId)
			const apiCache = await this.cacheService.get(cacheKey)
			const { url } = apiCache

			const apiUrl = `${url}/inspect/${projectName}`
			this.logger.debug(apiUrl)
			const { data } = await firstValueFrom(
				this.httpService.get(apiUrl).pipe(
					catchError(async (error: any): Promise<any> => {
						this.logger.error(error)
						throw new Error(error)
					})
				)
			)

			return data
		} catch (error) {
			this.logger.debug(`metadataTree: catch`)
			this.logger.error(error)
			throw new Error(error)
		}
	}

	private async deleteGhostFSAPI(userId: string) {
		this.logger.debug(`deleteGhostFSAPI: userId=${userId}`)
		const cacheKey = cacheKeyForGhostFSAPIUser(userId)
		const api = await this.cacheService.get(cacheKey)
		if (api) {
			const { url, mount, dockerId } = api
			this.logger.debug({ url, mount, dockerId })
			const dockerParams = ['stop', dockerId]
			await this.spawnable('docker', dockerParams)
		}

		return await this.cacheService.del(cacheKey)
	}

	public async createFSAPI(userId: string): Promise<GhostFSAPI> {
		this.logger.debug(`spawnGhostFSAPIForUser(${userId})`)

		const lockKey = cacheKeyLockForGhostFSAPIUser(userId)
		const lockValue = await this.cacheService.get(lockKey)
		const isSpawning = JSON.parse(lockValue)

		if (isSpawning) {
			this.deleteGhostFSAPI(userId)
		}

		await this.cacheService.set(lockKey, true)
		const projects = await this.findUserProjects(userId)
		const cacheKey = cacheKeyForGhostFSAPIUser(userId)
		await this.cacheService.del(cacheKey)

		const port = await findFreePort()
		const gf = JSON.stringify(
			projects.map(project => ({
				id: project.name,
				label: project.name,
				path: `__groupfolders/${project.name}`
			}))
		)

		// get auth token for GhostFS access
		try {
			const toParams = data =>
				Object.keys(data)
					.map(key => `${key}=${encodeURIComponent(data[key])}`)
					.join('&')

			const url = `${this.configService.get(
				'collab.authBackendUrl'
			)}/token?${toParams({
				hipuser: userId,
				gf
			})}`
			const config = {
				auth: {
					username: this.configService.get('collab.authBackendUsername'),
					password: this.configService.get('collab.authBackendPassword')
				}
			}

			const {
				data: { token }
			} = await firstValueFrom(
				this.httpService.get(url, config).pipe(
					catchError((error: any) => {
						this.logger.error(error)
						throw new HttpException(error.response.data, error.response.status)
					})
				)
			)

			const container_name = uuidv4()
			const localMountPoint = `${process.cwd()}/mnt/${container_name}`
			const dockerParams = [
				'run',
				'-d',
				'--mount',
				`type=bind,source=${localMountPoint},target=/home/${userId}/nextcloud,bind-propagation=rshared`,
				'-p',
				`127.0.0.1:${port}:3000`,
				'--device=/dev/fuse:/dev/fuse',
				'--cap-add=SYS_ADMIN',
				'--security-opt',
				'apparmor=unconfined',
				'--name',
				container_name,
				'--hostname',
				container_name,
				'--restart',
				'on-failure:5',
				'--env',
				`HIP_USER=${userId}`,
				'--env',
				`HIP_PASSWORD=${token}`,
				'--env',
				`NEXTCLOUD_DOMAIN=${this.configService.get('collab.authFSUrl')}`,
				'--env',
				`DOCKERFS_CERT=${this.configService.get('collab.authDockerFsCert')}`,
				'fs-api'
			]

			// create a mountpoint
			// as we can only unmount it with sudo, create a new one for each container
			const { code, message } = await this.spawnable('mkdir', [
				'-p',
				localMountPoint,
				'>/dev/null',
				'2>&1'
			])

			if (code === 0) {
				const { code, message } = await this.spawnable('docker', dockerParams)
				if (code === 0) {
					const ghostFSApi = {
						url: `http://127.0.0.1:${port}`,
						mount: localMountPoint,
						dockerId: message.substring(0, 5)
					}
					await this.cacheService.set(cacheKey, ghostFSApi)

					this.logger.debug(ghostFSApi)

					return Promise.resolve(ghostFSApi)
				} else {
					await this.cacheService.set(lockKey, false)
					throw new Error(message)
				}
			} else {
				await this.cacheService.set(lockKey, false)
				throw new Error(message)
			}
		} catch (error) {
			await this.cacheService.set(lockKey, false)
			this.logger.error(error)
			throw new Error(error)
		}
	}

	async delay(t, v) {
		return new Promise(resolve => setTimeout(resolve, t, v))
	}

	async refreshApi(userId: string) {
		this.logger.debug(`refreshApi: userId=${userId}`)
		return await this.cacheService.del(`fs-api-collab-${userId}`)
	}

	private spawnable = (
		command,
		args
	): Promise<{ code: number; message?: string }> => {
		try {
			const child = spawn(command, args)
			let message = ''

			return new Promise(resolve => {
				child.stdout.setEncoding('utf8')
				child.stdout.on('data', data => {
					message += data.toString()
				})

				child.stderr.setEncoding('utf8')
				child.stderr.on('data', data => {
					this.logger.debug({ data })
					// message += data.toString()
				})

				child.on('error', data => {
					this.logger.debug({ data })
					// message += data.toString()
				})

				child.on('close', code => {
					resolve({ code, message })
				})
			})
		} catch (error) {
			this.logger.error(error)
			throw new Error(error)
		}
	}
}
