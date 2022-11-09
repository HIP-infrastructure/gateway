import { firstValueFrom } from 'rxjs'

import { mappings } from '../mappings/datasets_mapping.json'

import { HttpService } from '@nestjs/axios'
import {
	BadRequestException,
	HttpException,
	HttpStatus,
	Injectable,
	InternalServerErrorException,
	Logger,
} from '@nestjs/common'
import { Client, RequestParams, ApiResponse } from '@elastic/elasticsearch'

import { GroupFolder, NextcloudService } from 'src/nextcloud/nextcloud.service'
import { BidsGetSubjectDto } from './dto/bids-get-subject.dto'
import { CreateBidsDatasetDto } from './dto/create-bids-dataset.dto'
import { CreateSubjectDto } from './dto/create-subject.dto'
import { EditSubjectClinicalDto } from './dto/edit-subject-clinical.dto'
import { BidsGetDatasetDto } from './dto/get-bids-dataset.dto'
// import { Dataset } from './entities/dataset.entity'

const userIdLib = require('userid')
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
	id?: string
	version?: number
	Name?: string
	BIDSVersion?: string
	License?: string
	Authors?: string[]
	Acknowledgements?: string
	HowToAcknowledge?: string
	Funding?: string[]
	ReferencesAndLinks?: string[]
	DatasetDOI?: string
	Path?: string
	Owner?: string
	Groups?: GroupFolder[]
	CreationDate?: Date
	LastModificationDate?: Date
}

const editScriptCmd = ['-v', `${process.env.BIDS_SCRIPTS}:/scripts`]

const isFulfilled = <T>(
	p: PromiseSettledResult<T>
): p is PromiseFulfilledResult<T> => p.status === 'fulfilled'

@Injectable()
export class ToolsService {
	private readonly logger = new Logger('ToolsService')
	private dataUser: string
	private dataUserId
	private elastic_client: Client
	private readonly es_index_datasets =
		process.env.ELASTICSEARCH_BIDS_DATASETS_INDEX

	constructor(
		private readonly httpService: HttpService,
		private readonly nextcloudService: NextcloudService
	) {
		this.dataUser = process.env.DATA_USER
		const uid = parseInt(userIdLib.uid(this.dataUser), 10)

		if (uid) this.dataUserId = uid

		// create a new client to our elasticsearch node
		const es_opt = {
			node: `${process.env.ELASTICSEARCH_URL}`,
		}
		this.elastic_client = new Client(es_opt)
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

	public async getBIDSDatasetsIndexedContent(
		owner: string,
		{ cookie, requesttoken }
	) {
		try {
			const s = await this.search(cookie, PARTICIPANTS_FILE)
			const searchResults = s?.entries

			const bidsDatasetsPromises = searchResults.map(r => {
				const bidsGetDatasetDto = new BidsGetDatasetDto()
				bidsGetDatasetDto.owner = owner
				bidsGetDatasetDto.path = `${r.attributes.path
					.replace(PARTICIPANTS_FILE, '')
					.substring(1)}`
				return this.createDatasetIndexedContent(bidsGetDatasetDto)
			})

			const bidsDatasets = (await Promise.allSettled(bidsDatasetsPromises))
				.filter(isFulfilled)
				.map(p => p.value)

			return bidsDatasets
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	public async getBIDSDatasetsIndexedContentOnce(
		owner: string,
		{ cookie, requesttoken }
	) {
		try {
			const s = await this.search(cookie, PARTICIPANTS_FILE)
			const searchResults = s?.entries
			const bidsGetDatasetsDto = searchResults.map(r => {
				const path = `${r.attributes.path
					.replace(PARTICIPANTS_FILE, '')
					.substring(1)}`
				const bidsGetDatasetDto = new BidsGetDatasetDto()
				bidsGetDatasetDto.owner = owner
				bidsGetDatasetDto.path = path
				return bidsGetDatasetDto
			})

			const bidsDatasets = await this.getDatasetsIndexedContent(
				bidsGetDatasetsDto
			)
			this.logger.debug({ bidsDatasets })

			return bidsDatasets
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	public async genBIDSDatasetsIndexedContent(owner: string, paths: string[]) {
		try {
			const bidsGetDatasetsDto = paths.map(path => {
				const bidsGetDatasetDto = new BidsGetDatasetDto()
				bidsGetDatasetDto.owner = owner
				bidsGetDatasetDto.path = path
				return bidsGetDatasetDto
			})
			const bidsDatasets = await this.getDatasetsIndexedContent(
				bidsGetDatasetsDto
			)
			return bidsDatasets
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	public async indexBIDSDatasets(owner: string, { cookie, requesttoken }: any) {
		try {
			// get a list of dataset indexed content
			const bidsDatasets = await this.getBIDSDatasetsIndexedContentOnce(owner, {
				cookie,
				requesttoken,
			})

			// create index for datasets if not existing
			const exists = await this.elastic_client.indices.exists({
				index: this.es_index_datasets,
			})

			if (exists.body === false) {
				try {
					await this.elastic_client.indices.create({
						index: this.es_index_datasets,
						body: {
							mappings,
						},
					})
					this.logger.debug('New user index created')
				} catch (error) {
					this.logger.warn('Failed to create user index...')
					this.logger.warn(JSON.stringify(error))
				}
			}

			// format list of datasets to make elastic_client happy
			const body = bidsDatasets.flatMap((dataset: BIDSDataset) => [
				{
					index: {
						_index: this.es_index_datasets,
						_id: dataset.Name.replace(/\s/g, '').toLowerCase(),
					},
				},
				dataset,
			])

			// index the list of datasets
			const { body: bulkResponse } = await this.elastic_client.bulk({
				refresh: true,
				body,
			})
			if (bulkResponse.errors) {
				this.logger.error('Errors for (re)indexing datasets')
				this.logger.error(JSON.stringify(bulkResponse))
			}
			// count indexed data
			const { body: count } = await this.elastic_client.count({
				index: this.es_index_datasets,
			})
			this.logger.debug(count)

			return bidsDatasets
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	public async indexNewBIDSDatasetContents(
		owner: string,
		dataset_relpaths: string[]
	) {
		// generate content to index of each dataset not indexed
		const bidsDatasets = await this.genBIDSDatasetsIndexedContent(
			owner,
			dataset_relpaths
		)
		const owner_groups = await this.nextcloudService.groupFoldersForUserId(
			owner
		)
		for (var index in bidsDatasets) {
			bidsDatasets[index].Path = await this.filePath(
				dataset_relpaths[index],
				owner
			)
			bidsDatasets[index].Owner = owner
			bidsDatasets[index].Groups = owner_groups
			bidsDatasets[index].CreationDate = new Date()
			// TODO: use autogenerated dataset id
			bidsDatasets[index].id = bidsDatasets[index].Name.replace(
				/\s/g,
				''
			).toLowerCase()
			bidsDatasets[index].version = 1
		}

		// create body for elasticsearch bulk to index the datasets
		const body = bidsDatasets.flatMap((dataset: BIDSDataset) => [
			{
				index: {
					_index: this.es_index_datasets,
					_id: dataset.id,
				},
			},
			dataset,
		])
		// index the datasets
		const { body: bulkResponse } = await this.elastic_client.bulk({
			refresh: true,
			body,
		})
		if (bulkResponse.errors) {
			this.logger.error('Errors for (re)indexing datasets')
			this.logger.error(JSON.stringify(bulkResponse))
		}
		// count indexed data
		const { body: count } = await this.elastic_client.count({
			index: this.es_index_datasets,
		})
		this.logger.debug({ count })
		return bidsDatasets
	}

	public async refreshBIDSDatasetsIndex(
		owner: string,
		{ cookie, requesttoken }: any
	) {
		try {
			// 1. Get list of existing datasets and the list of indexed dataset ids
			// get list of BIDS datasets (folder name) present in the file system (accessible by user)
			const s = await this.search(cookie, PARTICIPANTS_FILE)
			const searchDatasetsResults = s?.entries
			const foundDatasets = searchDatasetsResults.map(r => {
				const path = `${r.attributes.path
					.replace('/' + PARTICIPANTS_FILE, '')
					.substring(1)}`
				return path
			})
			// TODO: use autogenerated dataset id
			const foundDatasetIDs = searchDatasetsResults.map(r => {
				const path = `${r.attributes.path
					.replace('/' + PARTICIPANTS_FILE, '')
					.substring(1)}`
				return path.replace(/\s/g, '').toLowerCase()
			})
			this.logger.debug({ foundDatasets })
			// get a list of dataset ids (<=> folder name) already indexed
			const searchIndexedResults = await this.searchBidsDatasets(owner)

			// 2. Handle indexing of datasets not already indexed
			let addedBidsDatasets: BIDSDataset[] = []
			if (foundDatasets.length > 0) {
				this.logger.debug(
					'Existing datasets found! Handle index addition if necessary...'
				)
				const foundIndexedDatasets = searchIndexedResults.map(
					dataset => dataset._id
				)
				this.logger.debug({ foundIndexedDatasets })
				// find all datasets that are not indexed yet
				const foundDatasetsNotIndexed = foundDatasets.map((val, index) => {
					if (!foundIndexedDatasets.includes(foundDatasetIDs[index])) return val
				})
				// filter null
				const filteredFoundDatasetsNotIndexed = foundDatasetsNotIndexed.flatMap(
					f => (f ? [f] : [])
				)
				// differentiate private datasets own by the user and datasets in user group folders
				let foundPrivateDatasetsNotIndexed = Object.assign(
					[],
					filteredFoundDatasetsNotIndexed
				)
				let foundGroupDatasetsNotIndexed: string[] = []
				foundPrivateDatasetsNotIndexed.forEach((item, index) => {
					if (item.includes('/')) {
						foundPrivateDatasetsNotIndexed.splice(index, 1)
						foundGroupDatasetsNotIndexed.push(item)
					}
				})
				this.logger.debug('Detected datasets in user group:', {
					foundGroupDatasetsNotIndexed,
				})
				// generate and index content of every dataset not indexed
				if (foundPrivateDatasetsNotIndexed.length > 0) {
					this.logger.warn('Add the following dataset to the index:')
					this.logger.debug({ foundPrivateDatasetsNotIndexed })
					addedBidsDatasets = await this.indexNewBIDSDatasetContents(
						owner,
						foundPrivateDatasetsNotIndexed
					)
				}
			} else {
				this.logger.debug('No existing dataset found!')
				return []
			}

			// 2. Delete any indexed dataset that does not exist anymore
			let deletedBidsDatasets: string[] = []
			// extract dataset absolute path
			const foundIndexedDatasetPaths = searchIndexedResults.map(
				dataset => dataset._source.Path
			)
			if (foundIndexedDatasetPaths.length > 0) {
				this.logger.debug(
					'Existing indexed datasets found! Handle index deletion if necessary...'
				)
				// find all datasets that are indexed but for which the path does not exist anymore
				const deletedBidsDatasetPaths = foundIndexedDatasetPaths.map(
					absPath => {
						if (!fs.existsSync(absPath)) return absPath
					}
				)
				// filter null
				const filteredDeletedBidsDatasetPaths = deletedBidsDatasetPaths.flatMap(
					f => (f ? [f] : [])
				)
				if (filteredDeletedBidsDatasetPaths.length > 0) {
					this.logger.debug(
						'Deleting index for the following unexisting paths:',
						{ filteredDeletedBidsDatasetPaths }
					)
					const deletedBidsDatasets = await this.deleteBIDSDatasets(
						owner,
						filteredDeletedBidsDatasetPaths
					)
				}
			}
			return { addedBidsDatasets, deletedBidsDatasets }
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	public async createBIDSDatasetsIndex() {
		try {
			// create index for datasets if not existing
			const exists = await this.elastic_client.indices.exists({
				index: this.es_index_datasets,
			})

			if (exists.body === false) {
				try {
					const create = await this.elastic_client.indices.create({
						index: this.es_index_datasets,
						body: {
							mappings,
						},
					})
					this.logger.debug(`New index ${this.es_index_datasets} created`)
					this.logger.debug(JSON.stringify(create.body, null, 2))
					return create.body
				} catch (error) {
					this.logger.warn(
						`Failed to create index ${this.es_index_datasets}...`
					)
					this.logger.warn(JSON.stringify(error))
				}
			} else {
				this.logger.warn(
					`SKIP: Index ${this.es_index_datasets} already exists...`
				)
				return exists.body
			}
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	public async deleteBIDSDatasetsIndex() {
		try {
			// delete index for datasets only if it exists
			const exists = await this.elastic_client.indices.exists({
				index: this.es_index_datasets,
			})

			if (exists.body === true) {
				try {
					const del = await this.elastic_client.indices.delete({
						index: this.es_index_datasets,
					})
					this.logger.debug(`Index ${this.es_index_datasets} deleted`)
					this.logger.debug(JSON.stringify(del.body, null, 2))
					return del.body
				} catch (error) {
					this.logger.warn(
						`Failed to create index ${this.es_index_datasets}...`
					)
					this.logger.warn(JSON.stringify(error))
				}
			} else {
				this.logger.warn(
					`SKIP: Index was not deleted because ${this.es_index_datasets} does not exist...`
				)
				return exists.body
			}
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	public async indexBIDSDataset(owner: string, path: string, id: string) {
		try {
			// get a list of dataset indexed content
			const bidsGetDatasetDto = new BidsGetDatasetDto()
			bidsGetDatasetDto.owner = owner
			bidsGetDatasetDto.path = path
			this.logger.debug({ bidsGetDatasetDto })

			const bidsDataset = await this.createDatasetIndexedContent(
				bidsGetDatasetDto
			)

			// find the dataset index to be deleted
			const datasetPathQuery = `Path:"${path}"`
			this.logger.debug(
				`Text query to search deleted dataset: ${datasetPathQuery}`
			)
			const searchResults = await this.searchBidsDatasets(
				owner,
				datasetPathQuery
			)
			this.logger.log({ searchResults })
			if (searchResults.length > 0) {
				const currentDataset = searchResults[0]
				this.logger.debug('Update a currently indexed dataset')
				this.logger.debug({ currentDataset })
				bidsDataset.Owner = currentDataset._source.Owner
				bidsDataset.Groups = currentDataset._source.Groups
				bidsDataset.CreationDate = currentDataset._source.CreationDate
				// TODO: Update modif date only if modification(s) occured
				bidsDataset.LastModificationDate = new Date()
				bidsDataset.id = currentDataset._source.id
				bidsDataset.version = currentDataset._source.version++
			} else {
				this.logger.debug('Create a new dataset')
				bidsDataset.Owner = owner
				bidsDataset.Groups = await this.nextcloudService.groupFoldersForUserId(
					owner
				)
				bidsDataset.CreationDate = new Date()
				bidsDataset.LastModificationDate = bidsDataset.CreationDate
				// Autogenerate dataset id
				bidsDataset.id = id ? id : await this.generateDatasetId(owner)
				bidsDataset.version = 1
			}
			bidsDataset.Path = path

			// create body to be passed to elasticsearch client bulk function
			const body = [
				{
					index: {
						_index: this.es_index_datasets,
						_id: bidsDataset.id,
					},
				},
				bidsDataset,
			]

			// call the bulk function to index the dataset
			const { body: bulkResponse } = await this.elastic_client.bulk({
				refresh: true,
				body,
			})

			if (bulkResponse.errors) {
				this.logger.error('Errors for (re)indexing datasets')
				this.logger.error(JSON.stringify(bulkResponse))
			}
			// count indexed data
			const { body: count } = await this.elastic_client.count({
				index: this.es_index_datasets,
			})
			this.logger.debug(count)

			return bidsDataset
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	public async deleteBIDSDataset(owner: string, path: string) {
		try {
			// find the dataset index to be deleted
			const datasetPathQuery = `Path:"${path}"`
			this.logger.debug(
				`Text query to search deleted dataset: ${datasetPathQuery}`
			)
			const searchResults = await this.searchBidsDatasets(
				owner,
				datasetPathQuery
			)
			if (searchResults.length > 0) {
				const dataset = searchResults[0]
				// delete the document with id related to the dataset
				const datasetID = {
					index: dataset._index,
					id: dataset._id,
				}
				const { body: deleteResponse } = await this.elastic_client.delete(
					datasetID
				)
				if (deleteResponse.errors) {
					this.logger.error(`Errors for deleting dataset ${dataset._id}!`)
					this.logger.error(JSON.stringify(deleteResponse))
				} else {
					this.logger.debug(`Dataset ${dataset._id} successfully deleted!`)
					this.logger.debug(JSON.stringify(deleteResponse))
				}

				return datasetID
			} else {
				throw new Error('No dataset found in elasticsearch to be deleted')
			}
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	public async deleteBIDSDatasets(owner: string, paths: string[]) {
		const deletedBidsDatasetsPromises = paths.map(path => {
			return this.deleteBIDSDataset(owner, path)
		})

		const deletedBidsDatasets = (
			await Promise.allSettled(deletedBidsDatasetsPromises)
		)
			.filter(isFulfilled)
			.map(p => p.value)
		return deletedBidsDatasets
	}

	public async searchBidsDatasets(
		owner: string = 'all',
		text_query: string = '*',
		page: number = 1,
		nb_of_results: number = 200
	) {
		try {
			// determine index to start based on pagination
			const index_from = (page - 1) * nb_of_results

			// define search query in JSON format expected by elasticsearch
			const query_params: RequestParams.Search = {
				index: `${this.es_index_datasets}`,
				body: {
					from: index_from,
					size: nb_of_results,
					query: {
						query_string: {
							query: text_query,
							allow_leading_wildcard: true,
							analyze_wildcard: true,
						},
					},
				},
			}

			// perform and return the search query
			const foundDatasets = await this.elastic_client
				.search(query_params)
				.then((result: ApiResponse) => {
					return result.body.hits.hits
				})
			// filter only private datasets own by the user
			if (owner !== 'all') {
				this.logger.debug('Filter private datasets owned by the owner')
				let foundPrivateDatasets = []
				foundDatasets.forEach(dataset => {
					if (dataset._id.includes(`${owner}_`)) {
						foundPrivateDatasets.push(dataset)
					}
				})
				return foundPrivateDatasets
			} else {
				this.logger.debug('Return all indexed datasets')
				return foundDatasets
			}
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	public async getDatasetsCount() {
		// define count query in JSON format expected by elasticsearch
		const count_params: RequestParams.Count = {
			index: `${this.es_index_datasets}`,
			body: {
				// you can count based on specific query or remove body at all
				query: { match_all: {} },
			},
		}

		// perform and return the search query
		return this.elastic_client
			.count(count_params)
			.then(res => {
				return res.body.count
			})
			.catch(err => {
				this.logger.error({ err })
			})
	}

	private createDatasetIdString(
		id: number,
		begin: string,
		size: number
	): string {
		var datasetId: string = id.toString()
		while (datasetId.length < size) datasetId = '0' + datasetId
		datasetId = begin + datasetId
		return datasetId
	}

	public async generateDatasetId(owner: string) {
		try {
			// get number of datasets indexed in elasticsearch
			var nbOfDatasets = await this.getDatasetsCount()
			// get a list of dataset ids (<=> folder name) already indexed
			const searchIndexedResults = await this.searchBidsDatasets('all')
			// extract ids of indexed datasets
			const datasetIDs = searchIndexedResults.map(dataset => dataset._id)
			// generate a first if using the # of indexed datasets + 1
			var datasetIdNum: number = nbOfDatasets + 1
			var datasetId: string = this.createDatasetIdString(
				datasetIdNum,
				`${owner}_ds`,
				6
			)
			// test if the first autogenerated dataset id exists
			// if not, it increments until it find a new id that
			// does not exist
			while (true) {
				this.logger.debug({ datasetId })
				if (!datasetIDs.includes(datasetId)) {
					this.logger.debug('Id does not exist yet and is returned!')
					break
				} else {
					this.logger.debug('Id does exist and being incremented...')
					datasetIdNum += 1
					datasetId = this.createDatasetIdString(datasetIdNum, `${owner}_ds`, 6)
				}
			}
			return datasetId
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	public async createBidsDataset(createBidsDatasetDto: CreateBidsDatasetDto) {
		const { owner, parent_path } = createBidsDatasetDto
		const uniquId = Math.round(Date.now() + Math.random())
		const tmpDir = `/tmp/${uniquId}`

		try {
			// Generate dataset's id and containing directory name
			const datasetID = await this.generateDatasetId(owner)
			createBidsDatasetDto.dataset_dirname = datasetID.split('_')[1]
			// Create the json to be passed with the request
			fs.mkdirSync(tmpDir, true)
			fs.writeFileSync(
				`${tmpDir}/dataset.create.json`,
				JSON.stringify(createBidsDatasetDto)
			)

			// Resolve absolute path of dataset's parent directory
			const dsParentPath = await this.filePath(parent_path, owner)

			const cmd1 = [
				'run',
				'-v',
				`${tmpDir}:/input`,
				'-v',
				`${dsParentPath}:/output`,
			]
			const cmd2 = [
				'bids-tools',
				this.dataUser,
				this.dataUserId,
				'--command=dataset.create',
				'--input_data=/input/dataset.create.json',
			]

			const command = [...cmd1, ...cmd2]
			this.logger.debug(command.join(' '))

			const { code, message } = await this.spawnable('docker', command)

			if (code === 0) {
				// Make the new dataset discovered by Nextcloud
				await this.nextcloudService.scanPath(owner, parent_path)
				// Index the dataset
				await this.indexBIDSDataset(
					owner,
					`${dsParentPath}${createBidsDatasetDto.dataset_dirname}`,
					datasetID
				)

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

			// const dbPath = await this.filePath(path, owner)

			const cmd1 = ['run', '-v', `${tmpDir}:/input`, '-v', `${path}:/output`]
			const cmd2 = [
				'bids-tools',
				this.dataUser,
				this.dataUserId,
				'--command=sub.get',
				'--input_data=/input/sub_get.json',
				'--output_file=/input/sub_info.json',
			]

			const command = [...cmd1, ...cmd2]
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
		const { owner, dataset_path } = createSubject
		const uniquId = Math.round(Date.now() + Math.random())
		const tmpDir = `/tmp/${uniquId}`

		try {
			// retrieve the index used for the dataset
			const datasetPathQuery = `Path:"${dataset_path}"`
			this.logger.debug(
				`Text query to retrieve dataset ID: ${datasetPathQuery}`
			)
			const searchResults = await this.searchBidsDatasets(
				owner,
				datasetPathQuery
			)
			const datasetID = searchResults[0].id

			// FIXME: replace by all settled
			const filePathes = createSubject.files.map(file =>
				this.filePath(file.path, owner)
			)
			const pathes = await Promise.all(filePathes)

			const nextCreateSubject = {
				...createSubject,
				files: createSubject.files.map((file, i) => ({
					...file,
					path: pathes[i],
				})),
			}

			fs.mkdirSync(tmpDir, true)
			fs.writeFileSync(
				`${tmpDir}/sub.import.json`,
				JSON.stringify(nextCreateSubject)
			)

			const volumes = nextCreateSubject.files.reduce(
				(p, file) => [...p, '-v', `${file.path}:${file.path}`],
				[]
			)

			const command = [
				'run',
				// '-v',
				// '/home/guspuhle/workdir/hip/frontend/bids-tools/scripts:/scripts',
				'-v',
				`${tmpDir}:/import-data`,
				...volumes,
				'-v',
				`${dataset_path}:/output`,
				'bids-tools',
				this.dataUser,
				this.dataUserId,
				'--command=sub.import',
				'--input_data=/import-data/sub.import.json',
			]

			this.logger.debug(command.join(' '))

			const { code, message } = await this.spawnable('docker', command)

			const errorMatching =
				/does not match/.test(message) ||
				// /does not exist/.test(message) ||  // Appears when success with "dataset_description.json does not exist"
				/not imported/.test(message)

			if (errorMatching) throw new BadRequestException(message)

			if (code === 0) {
				await this.nextcloudService.scanPath(owner, dataset_path)
				const datasetIndexedContent = await this.indexBIDSDataset(
					owner,
					dataset_path,
					datasetID
				)
				return nextCreateSubject
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

			const command = [...cmd1, ...cmd2]
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
			const userId = cookie.match(/nc_username=(.*;)/)[1].split(';')[0]
			const filePath = await this.filePath(path, userId)

			return new Promise((resolve, reject) => {
				fs.readFile(filePath, 'utf8', function (err, data) {
					if (err) {
						reject(err)
					}
					if (typeof data !== 'string') return { data: null }
					const cleaned = data.replace(/\\n/g, '').replace(/\\/g, '')
					resolve({ data: JSON.parse(cleaned) })
				})
			})
		} catch (e) {
			this.logger.error(e)
			return { error: e.message }
		}
	}

	/**
	 * It takes a path and a set of headers, and returns the JSON-formatted content summary of the
	 * BIDS dataset at that path, later used for dataset indexing.
	 * @param {BidsGetDatasetDto} bidsGetDatasetDto - object storing the owner and path to the dataset you want to get
	 * @param {any} headers - This is the headers that you need to pass to the webdav server.
	 * @returns The file content
	 */
	private async createDatasetIndexedContent(
		bidsGetDatasetDto: BidsGetDatasetDto
	): Promise<BIDSDataset> {
		const { owner, path } = bidsGetDatasetDto
		const uniquId = Math.round(Date.now() + Math.random())
		const tmpDir = `/tmp/${uniquId}`

		try {
			fs.mkdirSync(tmpDir, true)
			fs.writeFileSync(
				`${tmpDir}/dataset_get.json`,
				JSON.stringify(bidsGetDatasetDto)
			)

			// Create an empty output JSON file with correct ownership
			const output_file = `${tmpDir}/dataset_info.json`
			let empty_content = {}
			fs.writeFileSync(output_file, JSON.stringify(empty_content))

			fs.chown(output_file, this.dataUserId, this.dataUserId, err => {
				if (err) {
					throw err
				}
			})

			// Set paths and command to be run
			// const dsPath = await this.filePath(path, owner)

			const cmd1 = ['run', '-v', `${tmpDir}:/input`, '-v', `${path}:/output`]
			const cmd2 = [
				'bids-tools',
				this.dataUser,
				this.dataUserId,
				'--command=dataset.get',
				'--input_data=/input/dataset_get.json',
				'--output_file=/input/dataset_info.json',
			]

			const command =
				process.env.NODE_ENV === 'development'
					? [...cmd1, ...editScriptCmd, ...cmd2]
					: [...cmd1, ...cmd2]
			this.logger.debug(command.join(' '))

			// Run the bids-tool docker image with the defined command
			const { code, message } = await this.spawnable('docker', command)

			// Handle output and error(s)
			const errorMatching = /IndexError: Could not find the BIDS dataset./.test(
				message
			)
			if (errorMatching) throw new BadRequestException(message)

			if (code === 0) {
				// Extract resulting JSON content if the run succeeds
				const sub = fs.readFileSync(`${tmpDir}/dataset_info.json`, 'utf-8')
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

	/**
	 * It takes a path and a set of headers, and returns the JSON-formatted content summary of the
	 * BIDS dataset at that path, later used for dataset indexing.
	 * @param {BidsGetDatasetDto} bidsGetDatasetDto - object storing the owner and path to the dataset you want to get
	 * @returns The file content
	 */
	private async getDatasetsIndexedContent(
		bidsGetDatasetsDto: BidsGetDatasetDto[]
	): Promise<BIDSDataset[]> {
		const uniquId = Math.round(Date.now() + Math.random())
		const tmpDir = `/tmp/${uniquId}`

		try {
			// FIXME: replace by all settled
			const filePathes = bidsGetDatasetsDto.map(dataset => {
				return this.filePath(dataset.path, dataset.owner)
			})
			const pathes = await Promise.all(filePathes)

			const nextGetDatasets = {
				...bidsGetDatasetsDto,
				datasets: bidsGetDatasetsDto.map((dataset, i) => ({
					...dataset,
					path: pathes[i],
				})),
			}

			fs.mkdirSync(tmpDir, true)
			fs.writeFileSync(
				`${tmpDir}/datasets_get.json`,
				JSON.stringify(nextGetDatasets)
			)

			const volumes = nextGetDatasets.datasets.reduce(
				(p, dataset) => [...p, '-v', `${dataset.path}:${dataset.path}`],
				[]
			)

			// Create an empty output JSON file with correct ownership
			const output_file = `${tmpDir}/datasets_info.json`
			let empty_content = {}
			fs.writeFileSync(output_file, JSON.stringify(empty_content))

			fs.chown(output_file, this.dataUserId, this.dataUserId, err => {
				if (err) {
					throw err
				}
			})

			const cmd1 = ['run', '-v', `${tmpDir}:/input`, ...volumes]
			const cmd2 = [
				'bids-tools',
				this.dataUser,
				this.dataUserId,
				'--command=datasets.get',
				'--input_data=/input/datasets_get.json',
				'--output_file=/input/datasets_info.json',
			]

			const command =
				process.env.NODE_ENV === 'development'
					? [...cmd1, ...editScriptCmd, ...cmd2]
					: [...cmd1, ...cmd2]
			this.logger.debug(command.join(' '))

			// Run the bids-tool docker image with the defined command
			const { code, message } = await this.spawnable('docker', command)

			// Handle output and error(s)
			const errorMatching =
				/IndexError: Could not get the content of the BIDS datasets for indexing./.test(
					message
				)
			if (errorMatching) throw new BadRequestException(message)

			if (code === 0) {
				// Extract resulting JSON content if the run succeeds
				const sub = fs.readFileSync(`${tmpDir}/datasets_info.json`, 'utf-8')
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

	/**
	 * It takes a path and a set of headers, and returns the contents of the file at that path
	 * @param {string} path - the path to the file you want to get
	 * @param {any} headers - This is the headers that you need to pass to the webdav server.
	 * @returns The file content
	 */
	private async getFileContent(path: string, cookie: any): Promise<string> {
		try {
			const userId = cookie.match(/nc_username=(.*;)/)[1].split(';')[0]
			const filePath = await this.filePath(path, userId)

			return new Promise((resolve, reject) => {
				fs.readFile(filePath, 'utf8', function (err, data) {
					if (err) {
						reject(err)
					}
					resolve(data)
				})
			})
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status)
		}
	}

	/* A private method that is used to get the file path, either user based or for a group */
	private async filePath(path: string, userId: string) {
		try {
			const groupFolders = await this.nextcloudService.groupFoldersForUserId(
				userId
			)

			const rootPath = path.split('/')[0]
			const id = groupFolders.find(g => g.label === rootPath)?.id

			const nextPath = id
				? `${
						process.env.PRIVATE_FILESYSTEM
				  }/__groupfolders/${id}/${path.replace(`${rootPath}/`, '')}`
				: `${process.env.PRIVATE_FILESYSTEM}/${userId}/files/${path}`

			return nextPath
		} catch (error) {
			this.logger.error(error)
			throw new InternalServerErrorException(
				"Couldn't find a path for the file"
			)
		}
	}

	/* A private method that is used to read a JSON file and parse its content */
	private async readJsonFile(path: string) {
		return JSON.parse(fs.readFileSync(path))
		/*
		fs.readFile(path, 'utf8', (err, jsonString) => {
			if (err) {
				console.log('Error reading file from disk:', err)
				return
			}
			try {
				// this.logger.debug('Parsing JSON string:', jsonString)
				return JSON.parse(jsonString)
			} catch (err) {
				this.logger.error('Error parsing JSON string:', err)
				throw new Error(err)
			}
		})
		*/
	}
}
