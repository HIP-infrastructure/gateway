import { firstValueFrom } from 'rxjs'

import { HttpService } from '@nestjs/axios'
import {
	BadRequestException,
	HttpException,
	HttpStatus,
	Injectable,
	InternalServerErrorException,
	Logger,
} from '@nestjs/common'

import { NextcloudService } from 'src/nextcloud/nextcloud.service'
import { BidsGetSubjectDto } from './dto/bids-get-subject.dto'
import { CreateBidsDatasetDto } from './dto/create-bids-dataset.dto'
import { CreateSubjectDto } from './dto/create-subject.dto'
import { EditSubjectClinicalDto } from './dto/edit-subject-clinical.dto'
const userid = require('userid')
const { spawn } = require('child_process')
const fs = require('fs')


type DataError = {
	data?: Record<string, string>
	error?: Record<string, string>
}

const NC_SEARCH_PATH = '/ocs/v2.php/search/providers/files/search'
const DATASET_DESCRIPTION = 'dataset_description.json'
const PARTICIPANTS_FILE = 'participants.tsv'

interface ISearch {
	name: string
	isPaginated: true
	entries: ISearchResult[]
}

interface ISearchResult {
	thumbnailUrl: string
	title: string
	subline: string
	resourceUrl: string
	icon: string
	rounded: boolean
	attributes: {
		fileId: string
		path: string
	}
}

interface Group {
	id: number
	mount_point: string
	groups: object
	quota: number
	size: number
	acl: boolean
	manage: object
}
export interface Participant {
	age?: string
	sex?: string
	[key: string]: string | number
}
export interface BIDSDataset {
	Name?: string
	BIDSVersion?: string
	License?: string
	Authors?: string[]
	Acknowledgements?: string
	HowToAcknowledge?: string
	Funding?: string[]
	ReferencesAndLinks?: string[]
	DatasetDOI?: string
}

const editScriptCmd = ['-v', `${process.env.BIDS_SCRIPTS}:/scripts`]

@Injectable()
export class ToolsService {
	private readonly logger = new Logger('ToolsService')
	private dataUser: string
	private dataUserId

	constructor(
		private readonly httpService: HttpService,
		private readonly nextcloudService: NextcloudService
	) {
		this.dataUser = process.env.DATA_USER
		const uid = parseInt(userid.uid(this.dataUser), 10)

		if (uid) this.dataUserId = uid
	}

	public async getBIDSDatasets({ cookie }) {
		try {
			const s = await this.search(cookie, PARTICIPANTS_FILE)
			const searchResults = s?.entries
			const participantPromises = searchResults.map(r =>
				this.participantsWithPath(r.attributes.path, cookie)
			)
			const results = await Promise.allSettled(participantPromises)
			const participantSearchFiltered = results
				.map((p, i) => ({ p, i })) // keep indexes
				.filter(item => item.p.status === 'fulfilled')
				.filter(
					item => !/derivatives/.test(searchResults[item.i].attributes.path)
				)
				.map(item => ({
					participants: (item.p as PromiseFulfilledResult<Participant[]>).value,
					searchResult: searchResults[item.i],
				}))
			const bidsDatasetsPromises = participantSearchFiltered.map(ps =>
				this.getDatasetContent(
					`${ps.searchResult.attributes.path.replace(
						PARTICIPANTS_FILE,
						''
					)}/${DATASET_DESCRIPTION}`,
					cookie
				)
			)
			const bidsDatasetsResults = await Promise.allSettled(bidsDatasetsPromises)
			const bidsDatasets: BIDSDataset[] = bidsDatasetsResults.reduce(
				(arr, item, i) => [
					...arr,
					item.status === 'fulfilled'
						? {
								...(item.value.data || item.value.error),
								id: participantSearchFiltered[
									i
								].searchResult.attributes.path.replace(PARTICIPANTS_FILE, ''),
								path: participantSearchFiltered[i].searchResult.attributes.path
									.replace(PARTICIPANTS_FILE, '')
									.substring(1),
								resourceUrl:
									participantSearchFiltered[i].searchResult.resourceUrl.split(
										'&'
									)[0],
								participants: participantSearchFiltered[i].participants,
						  }
						: {},
				],
				[]
			)

			return bidsDatasets
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	public async createBidsDataset(createBidsDatasetDto: CreateBidsDatasetDto) {
		const { owner, path } = createBidsDatasetDto
		const uniquId = Math.round(Date.now() + Math.random())
		const tmpDir = `/tmp/${uniquId}`

		this.logger.debug({ path })
		try {
			fs.mkdirSync(tmpDir, true)
			fs.writeFileSync(
				`${tmpDir}/db_create.json`,
				JSON.stringify(createBidsDatasetDto)
			)

			const dbPath = await this.filePath(path, owner)

			const cmd1 = ['run', '-v', `${tmpDir}:/input`, '-v', `${dbPath}:/output`]
			const cmd2 = [
				'bids-tools',
				this.dataUser,
				this.dataUserId,
				'--command=db.create',
				'--input_data=/input/db_create.json',
			]

			const command =
				process.env.NODE_ENV === 'development'
					? [...cmd1, ...editScriptCmd, ...cmd2]
					: [...cmd1, ...cmd2]
			this.logger.debug(command.join(' '))

			const { code, message } = await this.spawnable('docker', command)

			if (code === 0) {
				await this.nextcloudService.scanFiles(owner, path)
				return createBidsDatasetDto
			} else {
				throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR)
			}
		} catch (error) {
			this.logger.error(error)
			throw new HttpException(
				error.message,
				error.status || HttpStatus.INTERNAL_SERVER_ERROR
			)
		}
	}

	async getSubject(bidsGetSubjectDto: BidsGetSubjectDto) {
		const { owner, path } = bidsGetSubjectDto
		const uniquId = Math.round(Date.now() + Math.random())
		const tmpDir = `/tmp/${uniquId}`

		try {
			fs.mkdirSync(tmpDir, true)
			fs.writeFileSync(
				`${tmpDir}/sub_get.json`,
				JSON.stringify(bidsGetSubjectDto)
			)

			// Create an empty output JSON file with correct ownership
			const output_file = `${tmpDir}/sub_info.json`
			let empty_content = {}
			fs.writeFileSync(output_file, JSON.stringify(empty_content))

			fs.chown(output_file, this.dataUserId, this.dataUserId, err => {
				if (err) {
					throw err
				}
			})

			const dbPath = await this.filePath(path, owner)

			const cmd1 = ['run', '-v', `${tmpDir}:/input`, '-v', `${dbPath}:/output`]
			const cmd2 = [
				'bids-tools',
				this.dataUser,
				this.dataUserId,
				'--command=sub.get',
				'--input_data=/input/sub_get.json',
				'--output_file=/input/sub_info.json',
			]

			const command =
				process.env.NODE_ENV === 'development'
					? [...cmd1, ...editScriptCmd, ...cmd2]
					: [...cmd1, ...cmd2]
			this.logger.debug(command.join(' '))

			const { code, message } = await this.spawnable('docker', command)

			const errorMatching =
				/IndexError: Could not find the subject in the BIDS dataset./.test(
					message
				)

			if (errorMatching) throw new BadRequestException(message)

			if (code === 0) {
				const sub = fs.readFileSync(`${tmpDir}/sub_info.json`, 'utf-8')
				return JSON.parse(sub)
			} else {
				throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR)
			}
		} catch (error) {
			this.logger.error(error)
			throw new HttpException(
				error.message,
				error.status || HttpStatus.INTERNAL_SERVER_ERROR
			)
		}
	}

	public async importSubject(createSubject: CreateSubjectDto) {
		const { owner, path } = createSubject
		const uniquId = Math.round(Date.now() + Math.random())
		const tmpDir = `/tmp/${uniquId}`

		try {
			fs.mkdirSync(tmpDir, true)
			fs.writeFileSync(
				`${tmpDir}/sub_import.json`,
				JSON.stringify(createSubject)
			)

			const dbPath = await this.filePath(path, owner)

			const cmd1 = [
				'run',
				'-v',
				`${tmpDir}:/import-data`,
				'-v',
				`${process.env.PRIVATE_FILESYSTEM}/${owner}/files:/input`,
				'-v',
				`${dbPath}:/output`,
			]

			const cmd2 = [
				'bids-tools',
				this.dataUser,
				this.dataUserId,
				'--command=sub.import',
				'--input_data=/import-data/sub_import.json',
			]

			const command =
				process.env.NODE_ENV === 'development'
					? [...cmd1, ...editScriptCmd, ...cmd2]
					: [...cmd1, ...cmd2]
			this.logger.debug(command.join(' '))

			const { code, message } = await this.spawnable('docker', command)

			const errorMatching =
				/does not match/.test(message) ||
				// /does not exist/.test(message) ||  // Appears when success with "dataset_description.json does not exist"
				/not imported/.test(message)

			if (errorMatching) throw new BadRequestException(message)

			if (code === 0) {
				await this.nextcloudService.scanFiles(owner, path)
				// To debug "Failed to fetch response error" obtained
				// while importing "ieeg"...
				const util = require('util')
				this.logger.debug(util.inspect(createSubject, { depth: null }))

				return createSubject
			} else {
				throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR)
			}
		} catch (err) {
			this.logger.error(err)
			throw new HttpException(
				err.message,
				err.status || HttpStatus.INTERNAL_SERVER_ERROR
			)
		}
	}

	private async bidsValidate(dbPath: string) {
		// docker run -ti --rm -v /path/to/data:/data:ro bids/validator /data
		const dockerParams = [
			'run',
			'-v',
			`${dbPath}:/output`,
			'bids/validator',
			'/data',
		]

		return this.spawnable('docker', dockerParams)
	}

	public async subEditClinical(editSubjectClinicalDto: EditSubjectClinicalDto) {
		let { owner, path } = editSubjectClinicalDto
		const uniquId = Math.round(Date.now() + Math.random())
		const tmpDir = `/tmp/${uniquId}`

		try {
			fs.mkdirSync(tmpDir, true)
			fs.writeFileSync(
				`${tmpDir}/sub_edit_clinical.json`,
				JSON.stringify(editSubjectClinicalDto)
			)

			const dbPath = await this.filePath(path, owner)

			const cmd1 = [
				'run',
				'-v',
				`${tmpDir}:/import-data`,
				'-v',
				`${process.env.PRIVATE_FILESYSTEM}/${owner}/files:/input`,
				'-v',
				`${dbPath}:/output`,
			]
			const cmd2 = [
				'bids-tools',
				this.dataUser,
				this.dataUserId,
				'--command=sub.edit.clinical',
				'--input_data=/import-data/sub_edit_clinical.json',
			]

			const command =
				process.env.NODE_ENV === 'development'
					? [...cmd1, ...editScriptCmd, ...cmd2]
					: [...cmd1, ...cmd2]
			this.logger.debug(command.join(' '))
			const { code, message } = await this.spawnable('docker', command)

			if (code === 0) {
				return editSubjectClinicalDto
			}

			throw new InternalServerErrorException(message)
		} catch (err) {
			this.logger.error(err)
			throw new HttpException(err.message, err.status)
		}
	}

	public deleteSubject() {}

	public async participants(path: string, { cookie }: any) {
		const nextPath = `${path}${PARTICIPANTS_FILE}`

		return this.participantsWithPath(nextPath, cookie)
	}

	public async search(cookie: any, term: string): Promise<ISearch> {
		try {
			const response = this.httpService.get(
				`${process.env.HOSTNAME_SCHEME}://${process.env.HOSTNAME}${NC_SEARCH_PATH}?term=${term}&cursor=0&limit=100`,
				{ headers: { cookie } }
			)

			return firstValueFrom(response).then(r => r.data.ocs.data)
		} catch (error) {
			this.logger.error(error)
			throw new InternalServerErrorException()
		}
	}

	private spawnable = (
		command,
		args
	): Promise<{ code: number; message?: string }> => {
		const child = spawn(command, args)
		let message = ''

		return new Promise(resolve => {
			child.stdout.setEncoding('utf8')
			child.stdout.on('data', data => {
				message += data.toString()
			})

			child.stderr.setEncoding('utf8')
			child.stderr.on('data', data => {
				message += data.toString()
			})

			child.on('error', data => {
				message += data.toString()
			})

			child.on('close', code => {
				resolve({ code, message })
			})
		})
	}

	private async participantsWithPath(path: string, cookie: any) {
		try {
			const tsv = await this.getFileContent(path, cookie)			
			const [tsvheaders, ...rows] = tsv
				.trim()
				.split('\n')
				.map(r => r.split('\t'))

			const participants: Participant[] = rows.reduce(
				(arr, row) => [
					...arr,
					row.reduce(
						(obj, item, i) =>
							Object.assign(obj, { [tsvheaders[i].trim()]: item }),
						{}
					),
				],
				[]
			)

			return participants
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status)
		}
	}

	private async getDatasetContent(
		path: string,
		cookie: any
	): Promise<DataError> {
		try {
			const userid = cookie.match(/nc_username=(.*;)/)[1].split(';')[0]
			const filePath = await this.filePath(path, userid)
			
			return new Promise((resolve, reject) => {
				fs.readFile(filePath, 'utf8', function (err, data) {
				if (err) {
					reject(err);
				}
					if (typeof data !== 'string') return { data: null }
					const cleaned = data.replace(/\\n/g, '').replace(/\\/g, '')
					resolve({ data: JSON.parse(cleaned) });
				});
			});	  
		} catch (e) {
			this.logger.error(e)
			return { error: e.message }
		}
	}

	/**
	 * It takes a path and a set of headers, and returns the contents of the file at that path
	 * @param {string} path - the path to the file you want to get
	 * @param {any} headers - This is the headers that you need to pass to the webdav server.
	 * @returns The file content
	 */
	private async getFileContent(path: string, cookie: any): Promise<string> {
		try {
			const userid = cookie.match(/nc_username=(.*;)/)[1].split(';')[0]
			const filePath = await this.filePath(path, userid)
			
			return new Promise((resolve, reject) => {
				fs.readFile(filePath, 'utf8', function (err, data) {
				if (err) {
					reject(err);
				}
					resolve(data);
				});
			});	  
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status)
		}
	}

	/* A private method that is used to get the file path, either user based or for a group */
	private async filePath(path: string, userid: string) {
		try {
			const groupFolders = await this.nextcloudService.groupFoldersForUserId(
				userid
			)

			const rootPath = path.split('/')[0]
			const id = groupFolders.find(g => g.label === rootPath)?.id

			const nextPath = id
				? `${
						process.env.PRIVATE_FILESYSTEM
				  }/__groupfolders/${id}/${path.replace(`${rootPath}/`, '')}`
				: `${process.env.PRIVATE_FILESYSTEM}/${userid}/files/${path}`

			return nextPath
		} catch (error) {
			this.logger.error(error)
			throw new InternalServerErrorException(
				"Couldn't find a path for the file"
			)
		}
	}
}
