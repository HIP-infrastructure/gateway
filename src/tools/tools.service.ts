import { firstValueFrom } from 'rxjs'

import { mappings } from '../mappings/datasets_mapping.json'

import { HttpService } from '@nestjs/axios'
import {
	BadRequestException,
	HttpException,
	HttpStatus,
	Injectable,
	InternalServerErrorException,
	Logger
} from '@nestjs/common'
import { Client, RequestParams, ApiResponse } from '@elastic/elasticsearch'

import { GroupFolder, NextcloudService } from 'src/nextcloud/nextcloud.service'
import { BidsGetSubjectDto } from './dto/bids-get-subject.dto'
import { CreateBidsDatasetDto } from './dto/create-bids-dataset.dto'
import { CreateSubjectDto } from './dto/create-subject.dto'
import { EditSubjectClinicalDto } from './dto/edit-subject-clinical.dto'
import { BidsGetDatasetDto } from './dto/get-bids-dataset.dto'
import { CreateBidsDatasetParticipantsTsvDto } from './dto/create-bids-dataset-participants-tsv.dto'
import { SearchBidsDatasetsQueryOptsDto } from './dto/search-bids-datasets-quey-opts.dto'

const userIdLib = require('userid')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

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

// FIXME: this should be updated with the new BIDS tools architecture
const editScriptCmd = process.env.BIDS_SCRIPTS
	? ['-v', `${process.env.BIDS_SCRIPTS}:/scripts`]
	: undefined

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
			node: `${process.env.ELASTICSEARCH_URL}`
		}
		this.elastic_client = new Client(es_opt)
	}

	// public async getBIDSDatasets({ cookie }) {
	// 	try {
	// 		const s = await this.search(cookie, PARTICIPANTS_FILE)
	// 		const searchResults = s?.entries
	// 		const participantPromises = searchResults.map(r =>
	// 			this.participantsWithPath(r.attributes.path, cookie)
	// 		)
	// 		const results = await Promise.allSettled(participantPromises)
	// 		const participantSearchFiltered = results
	// 			.map((p, i) => ({ p, i })) // keep indexes
	// 			.filter(item => item.p.status === 'fulfilled')
	// 			.filter(
	// 				item => !/derivatives/.test(searchResults[item.i].attributes.path)
	// 			)
	// 			.map(item => ({
	// 				participants: (item.p as PromiseFulfilledResult<Participant[]>).value,
	// 				searchResult: searchResults[item.i],
	// 			}))
	// 		const bidsDatasetsPromises = participantSearchFiltered.map(ps =>
	// 			this.getDatasetContent(
	// 				`${ps.searchResult.attributes.path.replace(
	// 					PARTICIPANTS_FILE,
	// 					''
	// 				)}/${DATASET_DESCRIPTION}`,
	// 				cookie
	// 			)
	// 		)
	// 		const bidsDatasetsResults = await Promise.allSettled(bidsDatasetsPromises)
	// 		const bidsDatasets: BIDSDataset[] = bidsDatasetsResults.reduce(
	// 			(arr, item, i) => [
	// 				...arr,
	// 				item.status === 'fulfilled'
	// 					? {
	// 							...(item.value.data || item.value.error),
	// 							id: participantSearchFiltered[
	// 								i
	// 							].searchResult.attributes.path.replace(PARTICIPANTS_FILE, ''),
	// 							path: participantSearchFiltered[i].searchResult.attributes.path
	// 								.replace(PARTICIPANTS_FILE, '')
	// 								.substring(1),
	// 							resourceUrl:
	// 								participantSearchFiltered[i].searchResult.resourceUrl.split(
	// 									'&'
	// 								)[0],
	// 							participants: participantSearchFiltered[i].participants,
	// 					  }
	// 					: {},
	// 			],
	// 			[]
	// 		)

	// 		return bidsDatasets
	// 	} catch (e) {
	// 		this.logger.error(e)
	// 		throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
	// 	}
	// }

	/**
	 * Generate a list of BIDSDataset objects (JSON content indexed to elasticsearch) given a list of dataset paths
	 * @param owner user id
	 * @param paths list of dataset paths to generate JSON content indexed to elasticsearch
	 * @returns list of BIDSDataset objects (JSON content indexed to elasticsearch)
	 */
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

	/**
	 * Index a list of BIDSDataset JSON objects using elasticsearch bulk API
	 * @param bidsDatasets list of BIDSDataset JSON object to index
	 */
	public async sendElasticSearchDatasetsBulk(bidsDatasets: BIDSDataset[]) {
		// create body for elasticsearch bulk to index the datasets
		const body =
			Array.isArray(bidsDatasets) &&
			bidsDatasets.flatMap((dataset: BIDSDataset) => [
				{
					index: {
						_index: this.es_index_datasets,
						_id: dataset.id
					}
				},
				dataset
			])
		// index the datasets
		const { body: bulkResponse } = await this.elastic_client.bulk({
			refresh: true,
			body
		})
		if (bulkResponse.errors) {
			this.logger.error('Errors for (re)indexing datasets')
			for (let it of bulkResponse.items) {
				if (it.index.status === 400)
					this.logger.error(JSON.stringify(it.index, null, 4))
			}
		}
		// count indexed data
		const { body: count } = await this.elastic_client.count({
			index: this.es_index_datasets
		})
		this.logger.debug({ count })
	}

	/**
	 * Add new BIDS datasets in the user private space to the index
	 * @param owner user id
	 * @param datasetRelPaths list of relative paths of the datasets to index
	 * @returns list of BIDSDataset indexed
	 */
	public async addNewBIDSDatasetIndexedContents(
		owner: string,
		datasetRelPaths: string[]
	) {
		// generate content to index of each dataset not indexed
		const bidsDatasets = await this.genBIDSDatasetsIndexedContent(
			owner,
			datasetRelPaths
		)
		const ownerGroups = await this.nextcloudService.groupFoldersForUserId(owner)

		// Generate initial dataset ID
		let { datasetId, datasetIdNum } = await this.generateDatasetId(owner)
		for (let index in bidsDatasets) {
			bidsDatasets[index].Path = await this.filePath(
				datasetRelPaths[index],
				owner
			)
			bidsDatasets[index].Owner = owner
			bidsDatasets[index].Groups = ownerGroups
			bidsDatasets[index].CreationDate = new Date()
			// use autogenerated dataset id
			bidsDatasets[index].id = datasetId
			bidsDatasets[index].version = 1
			// generate id for next dataset
			datasetIdNum++
			;({ datasetId, datasetIdNum } = await this.generateDatasetId(
				owner,
				datasetIdNum
			))
		}
		// create and send elasticsearch bulk to index the datasets
		await this.sendElasticSearchDatasetsBulk(bidsDatasets)
		return bidsDatasets
	}

	/**
	 * Add new BIDS datasets in a group folder to the index
	 * @param owner user id
	 * @param datasetRelPaths list of relative paths of the datasets
	 * @param datasetIds list of dataset ids
	 * @returns list of BIDS dataset objects indexed
	 */
	public async addNewGroupBIDSDatasetIndexedContents(
		owner: string,
		datasetRelPaths: string[],
		datasetIds: string[]
	) {
		// generate content to index of each dataset not indexed
		const bidsDatasets = await this.genBIDSDatasetsIndexedContent(
			owner,
			datasetRelPaths
		)
		const ownerGroups = await this.nextcloudService.groupFoldersForUserId(owner)
		for (let index in bidsDatasets) {
			bidsDatasets[index].Path = await this.filePath(
				datasetRelPaths[index],
				owner
			)
			bidsDatasets[index].Owner = owner
			bidsDatasets[index].Groups = ownerGroups
			bidsDatasets[index].CreationDate = new Date()
			bidsDatasets[index].LastModificationDate =
				bidsDatasets[index].CreationDate
			bidsDatasets[index].id = datasetIds[index]
			bidsDatasets[index].version = 1
		}
		// create and send elasticsearch bulk to index the datasets
		await this.sendElasticSearchDatasetsBulk(bidsDatasets)
		return bidsDatasets
	}

	public async updateBIDSDatasetIndexedContents(
		owner: string,
		datasetRelPaths: string[],
		datasetIds: string[]
	) {
		// generate content to index of each dataset not indexed
		const bidsDatasets = await this.genBIDSDatasetsIndexedContent(
			owner,
			datasetRelPaths
		)

		for (let index in bidsDatasets) {
			bidsDatasets[index].Path = await this.filePath(
				datasetRelPaths[index],
				owner
			)
			bidsDatasets[index].LastModificationDate = new Date()
			bidsDatasets[index].id = datasetIds[index]
			bidsDatasets[index].version = 1
		}
		// create and send elasticsearch bulk to index the datasets
		await this.sendElasticSearchDatasetsBulk(bidsDatasets)
		return bidsDatasets
	}

	/**
	 * Split the list of paths and names  of datasets not indexed in private space and in a group folder
	 * @param filteredFoundDatasetsNotIndexed list of datasets not indexed
	 * @param filteredFoundDatasetNamesNotIndexed liss of dataset names not indexed
	 * @param groupFolders list of group folders
	 * @returns lists of dataset paths and names not indexed in private space and in a group folder
	 */
	public splitPrivateGroupDatasetsNotIndexed(
		filteredFoundDatasetsNotIndexed: string[],
		filteredFoundDatasetNamesNotIndexed: string[],
		groupFolders: GroupFolder[]
	) {
		let foundPrivateDatasetsNotIndexed: string[] = []
		let foundGroupDatasetsNotIndexed: string[] = []
		let foundPrivateDatasetNamesNotIndexed: string[] = []
		let foundGroupDatasetNamesNotIndexed: string[] = []
		for (let index in filteredFoundDatasetsNotIndexed) {
			// Update the lists of datasets found in private and group space
			let isContainedInGroupFolder = false
			for (let groupFolder of groupFolders) {
				if (
					filteredFoundDatasetsNotIndexed[index].includes(groupFolder.label)
				) {
					this.logger.log(
						`groupDatasetFound: ${filteredFoundDatasetsNotIndexed[index]}`
					)
					isContainedInGroupFolder = true
					break
				}
			}
			if (isContainedInGroupFolder) {
				foundGroupDatasetsNotIndexed.push(
					filteredFoundDatasetsNotIndexed[index]
				)
				foundGroupDatasetNamesNotIndexed.push(
					filteredFoundDatasetNamesNotIndexed[index]
				)
			} else {
				foundPrivateDatasetsNotIndexed.push(
					filteredFoundDatasetsNotIndexed[index]
				)
				foundPrivateDatasetNamesNotIndexed.push(
					filteredFoundDatasetNamesNotIndexed[index]
				)
			}
		}
		return {
			foundPrivateDatasetsNotIndexed,
			foundPrivateDatasetNamesNotIndexed,
			foundGroupDatasetsNotIndexed,
			foundGroupDatasetNamesNotIndexed
		}
	}

	/**
	 * Extracts all datasets that are not indexed yet and splits them into private and group datasets
	 * @param foundDatasets list of all datasets
	 * @param foundDatasetPaths list of all dataset paths
	 * @param foundDatasetIDs list of all dataset ids
	 * @param foundRenamedDatasetIDs list of all renamed dataset ids
	 * @param groupFolders list of all group folders
	 * @returns lists of all dataset paths and names that are in the private space and in a group folder
	 */
	public extractAndSplitPrivateGroupDatasetsNotIndexed(
		foundDatasets: any[],
		foundDatasetPaths: string[],
		foundDatasetIDs: string[],
		foundRenamedDatasetIDs: string[],
		groupFolders: GroupFolder[]
	) {
		// find all datasets that are not indexed yet
		const foundDatasetsNotIndexed = foundDatasetPaths.map((val, index) => {
			if (
				foundDatasetIDs[index] === null &&
				foundRenamedDatasetIDs[index] === null
			)
				return val
		})
		this.logger.debug({ foundDatasetsNotIndexed })
		// get content of dataset_description.json for all datasets that are not indexed yet
		const foundDatasetNamesNotIndexed = foundDatasets.map((val, index) => {
			if (
				foundDatasetIDs[index] === null &&
				foundRenamedDatasetIDs[index] === null
			) {
				this.logger.debug(JSON.stringify(foundDatasets[index], null, 4))
				return foundDatasets[index].Name
			}
		})
		// this.logger.debug({ foundDatasetNamesNotIndexed })
		// filter null
		const filteredFoundDatasetsNotIndexed = foundDatasetsNotIndexed.flatMap(f =>
			f ? [f] : []
		)
		const filteredFoundDatasetNamesNotIndexed =
			foundDatasetNamesNotIndexed.flatMap(f => (f ? [f] : []))

		// split private datasets own by the user and datasets in user group folders
		const {
			foundPrivateDatasetsNotIndexed,
			foundPrivateDatasetNamesNotIndexed,
			foundGroupDatasetsNotIndexed,
			foundGroupDatasetNamesNotIndexed
		} = this.splitPrivateGroupDatasetsNotIndexed(
			filteredFoundDatasetsNotIndexed,
			filteredFoundDatasetNamesNotIndexed,
			groupFolders
		)

		return {
			foundPrivateDatasetsNotIndexed,
			foundPrivateDatasetNamesNotIndexed,
			foundGroupDatasetsNotIndexed,
			foundGroupDatasetNamesNotIndexed
		}
	}

	/**
	 * Split private and group datasets that are duplicated
	 * @param foundDuplicatedDatasetPaths list of duplicated dataset paths
	 * @param groupFolders list of group folders
	 * @returns lists of duplicated private datasets own by the user and datasets in user group folders
	 */
	public extractAndSplitPrivateGroupDatasetsDuplicated(
		foundDuplicatedDatasetPaths: string[],
		groupFolders: GroupFolder[]
	) {
		// filter null from the list of duplicate path
		const filteredFoundDatasetsDuplicated = foundDuplicatedDatasetPaths.flatMap(
			f => (f ? [f] : [])
		)
		// differentiate private datasets own by the user and datasets in user group folders
		let foundPrivateDatasetsDuplicated: string[] = []
		let foundGroupDatasetsDuplicated: string[] = []
		for (let index in filteredFoundDatasetsDuplicated) {
			// Update the lists of datasets found in private and group space
			let isContainedInGroupFolder = false
			for (let groupFolder of groupFolders) {
				if (
					filteredFoundDatasetsDuplicated[index].includes(groupFolder.label)
				) {
					this.logger.log(
						`groupDatasetFound: ${filteredFoundDatasetsDuplicated[index]}`
					)
					isContainedInGroupFolder = true
					break
				}
			}
			if (isContainedInGroupFolder) {
				foundGroupDatasetsDuplicated.push(
					filteredFoundDatasetsDuplicated[index]
				)
			} else {
				foundPrivateDatasetsDuplicated.push(
					filteredFoundDatasetsDuplicated[index]
				)
			}
		}
		return { foundPrivateDatasetsDuplicated, foundGroupDatasetsDuplicated }
	}

	/**
	 * Split private and group datasets that have been renamed
	 * @param foundDatasetPaths list of dataset paths
	 * @param foundRenamedDatasetIDs list of dataset IDs that have been renamed
	 * @param groupFolders list of group folders
	 * @returns list of private and group datasets and ids that have been renamed
	 */
	public extractAndSplitPrivateGroupRenamedDatasets(
		foundDatasetPaths: string[],
		foundRenamedDatasetIDs: string[],
		groupFolders: GroupFolder[]
	) {
		// find all dataset paths which has changed
		const foundRenamedDatasets = foundDatasetPaths.map((val, index) => {
			if (foundRenamedDatasetIDs[index]) return val
		})
		this.logger.debug({ foundRenamedDatasets })
		// filter null in foundRenamedDatasets
		const filteredFoundRenamedDatasets = foundRenamedDatasets.flatMap(f =>
			f ? [f] : []
		)
		// filter null in foundRenamedDatasetIDs
		const filteredFoundRenamedDatasetIDs = foundRenamedDatasetIDs.flatMap(f =>
			f ? [f] : []
		)
		// differentiate private datasets own by the user and datasets in user group folders
		let foundPrivateRenamedDatasets = Object.assign(
			[],
			filteredFoundRenamedDatasets
		)
		let foundGroupRenamedDatasets: string[] = []
		let foundPrivateRenamedDatasetIDs = Object.assign(
			[],
			filteredFoundRenamedDatasetIDs
		)
		let foundGroupRenamedDatasetIDs: string[] = []
		foundPrivateRenamedDatasets.forEach((item, index) => {
			// Update the lists of datasets found in private and group spaces
			for (let groupFolder of groupFolders) {
				if (foundPrivateRenamedDatasets[index].includes(groupFolder.label)) {
					this.logger.log(
						`groupDatasetFound: ${foundPrivateRenamedDatasets[index]}`
					)
					foundPrivateRenamedDatasets.splice(index, 1)
					foundGroupRenamedDatasets.push(item)
					foundPrivateRenamedDatasetIDs.splice(index, 1)
					foundGroupRenamedDatasetIDs.push(item)
					break
				}
			}
		})
		return {
			foundPrivateRenamedDatasets,
			foundPrivateRenamedDatasetIDs,
			foundGroupRenamedDatasets,
			foundGroupRenamedDatasetIDs
		}
	}

	/**
	 * This function parses the results from the ToolService.search function
	 * @param owner user id
	 * @param searchDatasetsResults results from the ToolService.search function
	 * @returns  lists of dataset objects, paths, ids, and dataset ids which has been renamed
	 */
	public async parseSearchDatasetsResultsForRefresh(
		owner: string,
		searchDatasetsResults: any[]
	) {
		// get list of found dataset paths
		const foundDatasetPaths = searchDatasetsResults.map(r => {
			const path = `${r.attributes.path
				.replace('/' + PARTICIPANTS_FILE, '')
				.substring(1)}`
			return path
		})

		// extract dataset_description.json content for each dataset found
		let foundDatasets = []
		for (let index in foundDatasetPaths) {
			const dataset_desc_abspath = await this.filePath(
				foundDatasetPaths[index] + '/' + DATASET_DESCRIPTION,
				owner
			)
			const dataset = await this.readJsonFile(dataset_desc_abspath)
			foundDatasets.push(dataset)
		}

		// find IDs of datasets existing in the index
		let datasetPathsQuery: string[] = []
		for (const index in foundDatasetPaths) {
			const datasetPath = await this.filePath(foundDatasetPaths[index], owner)
			datasetPathsQuery.push(`Path:"${datasetPath}"`)
		}
		const searchResults = await this.multiSearchBidsDatasets(datasetPathsQuery)
		let foundDatasetIDs: string[] = []
		let foundDatasetPathsWithIDs: string[] = []
		for (let index in searchResults) {
			if (searchResults[index].length > 0) {
				foundDatasetIDs.push(searchResults[index][0].id)
				foundDatasetPathsWithIDs.push(searchResults[index][0]._source.Path)
			} else {
				foundDatasetIDs.push(null)
				foundDatasetPathsWithIDs.push(null)
			}
		}
		// for (const index in foundDatasetPaths) {
		// 	const datasetPath = await this.filePath(foundDatasetPaths[index], owner)
		// 	const datasetPathQuery = `Path:"${datasetPath}"`
		// 	/* this.logger.debug(
		// 		`Text query to search dataset in index: ${datasetPathQuery}`
		// 	) */
		// 	const datasetPathQueryOpts: SearchBidsDatasetsQueryOptsDto = {
		// 		owner,
		// 		textQuery: datasetPathQuery,
		// 		filterPaths: false,
		// 		ageRange: undefined,
		// 		participantsCountRange: undefined,
		// 		datatypes: undefined,
		// 		page: undefined,
		// 		nbOfResults: undefined,
		// 	}
		// 	const searchResults = await this.searchBidsDatasets(datasetPathQueryOpts)
		// 	searchResults.length > 0
		// 		? foundDatasetIDs.push(searchResults[0]._id)
		// 		: foundDatasetIDs.push(null)
		// 	searchResults.length > 0
		// 		? foundDatasetPathsWithIDs.push(searchResults[0]._source.Path)
		// 		: foundDatasetPathsWithIDs.push(null)
		// }

		// find IDs of datasets with name existing in the index in the case of
		// (1) a dataset with changed path and (2) a dataset copy
		let foundRenamedDatasetsQuery = foundDatasets.map(
			(d: BIDSDataset) => `"${d.Name}"`
		)
		const searchRenamedResults = await this.multiSearchBidsDatasets(
			foundRenamedDatasetsQuery
		)
		let foundRenamedDatasetIDs: string[] = []
		for (let index in searchRenamedResults) {
			if (searchRenamedResults[index].length > 0) {
				if (!foundDatasetIDs.includes(searchRenamedResults[index][0].id)) {
					foundRenamedDatasetIDs.push(searchRenamedResults[index][0].id)
				} else {
					foundRenamedDatasetIDs.push(null)
				}
			} else {
				foundRenamedDatasetIDs.push(null)
			}
		}

		// let foundDuplicatedDatasetPaths: string[] = []
		// for (const index in foundDatasets) {
		// 	let datasetPathQuery = `"${foundDatasets[index].Name}"`
		// 	/*
		// 	const dataset_desc = {
		// 		Name: foundDatasets[index].Name,
		// 		BIDSVersion: foundDatasets[index].BIDSVersion,
		// 		License: foundDatasets[index].License,
		// 		Authors: foundDatasets[index].Authors,
		// 		Acknowledgements: foundDatasets[index].Acknowledgements,
		// 		HowToAcknowledge: foundDatasets[index].HowToAcknowledge,
		// 		Funding: foundDatasets[index].Funding,
		// 		ReferencesAndLinks: foundDatasets[index].ReferencesAndLinks,
		// 		DatasetDOI: foundDatasets[index].DatasetDOI,
		// 	}
		// 	let datasetPathQuery: string = ''
		// 	for (
		// 		var keys = Object.keys(dataset_desc), i = 0, end = keys.length;
		// 		i < end;
		// 		i++
		// 	) {
		// 		var key = keys[i]
		// 		var value = dataset_desc[key] ? dataset_desc[key] : ''
		// 		i === end - 1
		// 			? (datasetPathQuery += `${key}:"${value}"`)
		// 			: (datasetPathQuery += `${key}:"${value}" AND `)
		// 	}
		// 	this.logger.debug(
		// 		`Text query to search dataset in index: ${datasetPathQuery}`
		// 	)
		// 	*/
		// 	const datasetPathQueryOpts: SearchBidsDatasetsQueryOptsDto = {
		// 		owner,
		// 		textQuery: datasetPathQuery,
		// 		filterPaths: false,
		// 		ageRange: undefined,
		// 		participantsCountRange: undefined,
		// 		datatypes: undefined,
		// 		page: undefined,
		// 		nbOfResults: undefined,
		// 	}
		// 	const searchResults = await this.searchBidsDatasets(datasetPathQueryOpts)
		// 	if (searchResults.length > 0) {
		// 		if (!foundDatasetIDs.includes(searchResults[0]._id)) {
		// 			foundRenamedDatasetIDs.push(searchResults[0]._id)
		// 			// foundDuplicatedDatasetPaths.push(null)
		// 		} else {
		// 			foundRenamedDatasetIDs.push(null)
		// 			/*
		// 			if (!foundDatasetPathsWithIDs.includes(searchResults[0]._Path)) {
		// 				foundDuplicatedDatasetPaths.push(searchResults[0]._Path)
		// 			} else {
		// 				foundDuplicatedDatasetPaths.push(null)
		// 			}
		// 			*/
		// 		}
		// 	} else {
		// 		foundRenamedDatasetIDs.push(null)
		// 		// foundDuplicatedDatasetPaths.push(null)
		// 	}
		// }
		return {
			foundDatasets,
			foundDatasetPaths,
			foundDatasetIDs,
			foundRenamedDatasetIDs
			// foundDuplicatedDatasetPaths,
		}
	}

	/**
	 * This function filters the list of dataset paths found in a group folder to know which one should be added to the index
	 * @param owner user id
	 * @param foundGroupDatasetsNotIndexed list of dataset paths found in the group folder and not indexed
	 * @param foundGroupDatasetNamesNotIndexed list of dataset names found in the group folder and not indexed
	 * @returns lists of dataset paths and ids owned by the user found in a group folder that should be be added to the index
	 */
	private async filterGroupDatasetsNotIndexed(
		owner: string,
		foundGroupDatasetsNotIndexed: string[],
		foundGroupDatasetNamesNotIndexed: string[]
	) {
		// get id of indexed dataset existing in the user private space
		// with same name
		const datasetNameQueries: string[] = foundGroupDatasetNamesNotIndexed.map(
			value => `Name:"${value}"`
		)
		const multiSearchResults = await this.multiSearchBidsDatasets(
			datasetNameQueries
		)
		let groupDatasetIDsToBeAdded: string[] = []
		let groupDatasetPathsToBeAdded: string[] = []
		for (let index in multiSearchResults) {
			// In case there is a result with a dataset owned by the user (e.g. <userID>_*)
			if (
				multiSearchResults[index].length > 0 &&
				multiSearchResults[index][0]._id.includes(owner)
			) {
				const datasetNum = multiSearchResults[index][0]._id.split('_')[1]
				const folderName = foundGroupDatasetsNotIndexed[index].split('/')[0]
				const groupDatasetId = folderName + '_' + datasetNum
				groupDatasetIDsToBeAdded.push(groupDatasetId)
				groupDatasetPathsToBeAdded.push(foundGroupDatasetsNotIndexed[index])
			}
		}
		return { groupDatasetIDsToBeAdded, groupDatasetPathsToBeAdded }
	}

	/**
	 * This function handles the datasets found in the file system but not indexed
	 * @param owner user id
	 * @param foundDatasets list of dataset objects found in the file system
	 * @param foundDatasetPaths list of dataset paths found in the file system
	 * @param foundDatasetIDs list of dataset ids found in the file system
	 * @param foundRenamedDatasetIDs list of dataset ids that has been found renamed
	 * @param groupFolders list of group folders
	 * @returns lists of BIDSDataset objects of datasets found in the private and group spaces and not indexed
	 */
	private async handleBidsDatasetsNotIndexed(
		owner: string,
		foundDatasets: any[],
		foundDatasetPaths: string[],
		foundDatasetIDs: string[],
		foundRenamedDatasetIDs: string[],
		groupFolders: GroupFolder[]
	) {
		let addedBidsDatasets: BIDSDataset[] = []
		let addedGroupBidsDatasets: BIDSDataset[] = []
		if (foundDatasetPaths.length > 0) {
			this.logger.debug('Handle indexing of datasets not already indexed...')
			// extract datasets that are not indexed and return separately the lists
			// of datasets contained in the user private space and the user group
			const {
				foundPrivateDatasetsNotIndexed,
				// foundPrivateDatasetNamesNotIndexed,
				foundGroupDatasetsNotIndexed,
				foundGroupDatasetNamesNotIndexed
			} = this.extractAndSplitPrivateGroupDatasetsNotIndexed(
				foundDatasets,
				foundDatasetPaths,
				foundDatasetIDs,
				foundRenamedDatasetIDs,
				groupFolders
			)
			// generate and index content of every private dataset not indexed
			if (foundPrivateDatasetsNotIndexed.length > 0) {
				this.logger.warn('Add the following private datasets to the index:')
				this.logger.debug({ foundPrivateDatasetsNotIndexed })
				addedBidsDatasets = await this.addNewBIDSDatasetIndexedContents(
					owner,
					foundPrivateDatasetsNotIndexed
				)
			}
			// generate and index content of every group dataset not indexed
			// for which a private dataset with the same same has already been indexed
			if (foundGroupDatasetsNotIndexed.length > 0) {
				this.logger.warn('Add the following group datasets to the index:')
				this.logger.debug({ foundGroupDatasetsNotIndexed })
				const { groupDatasetIDsToBeAdded, groupDatasetPathsToBeAdded } =
					await this.filterGroupDatasetsNotIndexed(
						owner,
						foundGroupDatasetsNotIndexed,
						foundGroupDatasetNamesNotIndexed
					)
				if (groupDatasetIDsToBeAdded.length > 0)
					addedGroupBidsDatasets =
						await this.addNewGroupBIDSDatasetIndexedContents(
							owner,
							groupDatasetPathsToBeAdded,
							groupDatasetIDsToBeAdded
						)
			}
		} else {
			this.logger.debug('No existing dataset found!')
		}
		return { addedBidsDatasets, addedGroupBidsDatasets }
	}

	/**
	 *
	 * @param owner user ID
	 * @param foundDatasetPaths list of dataset paths
	 * @param foundRenamedDatasetIDs list of dataset IDs that has been renamed
	 * @param groupFolders list of group folders
	 * @returns  lists of datasets that have been renamed in the private user space and a shared group folder
	 */
	private async handleBidsDatasetsRenamed(
		owner: string,
		foundDatasetPaths: string[],
		foundRenamedDatasetIDs: string[],
		groupFolders: GroupFolder[]
	) {
		let renamedBidsDatasets: BIDSDataset[] = []
		let renamedGroupBidsDatasets: BIDSDataset[] = []
		if (foundDatasetPaths.length > 0) {
			this.logger.debug(
				'Handle reindexing of datasets for which the path changed...'
			)
			// extract indexed datasets for which path has changed and return separately the lists
			// of dataset paths and IDs contained in the user private space and the user group
			const {
				foundPrivateRenamedDatasets,
				foundPrivateRenamedDatasetIDs,
				foundGroupRenamedDatasets,
				foundGroupRenamedDatasetIDs
			} = this.extractAndSplitPrivateGroupRenamedDatasets(
				foundDatasetPaths,
				foundRenamedDatasetIDs,
				groupFolders
			)
			// update indexed content of every private dataset for which path has changed
			if (foundPrivateRenamedDatasets.length > 0) {
				this.logger.warn('Update the following indexed private dataset path:')
				this.logger.warn({
					foundPrivateRenamedDatasets,
					foundPrivateRenamedDatasetIDs
				})
				renamedBidsDatasets = await this.updateBIDSDatasetIndexedContents(
					owner,
					foundPrivateRenamedDatasets,
					foundPrivateRenamedDatasetIDs
				)
			}
			// update indexed content of every dataset that has been moved to a group folder
			if (foundGroupRenamedDatasets.length > 0) {
				this.logger.warn('Update the following indexed group dataset path:')
				this.logger.warn({
					foundGroupRenamedDatasets,
					foundGroupRenamedDatasetIDs
				})
				/* renamedGroupBidsDatasets = await this.updateBIDSDatasetIndexedContents(
					owner,
					foundGroupRenamedDatasets,
					foundGroupRenamedDatasetIDs
				) */
			}
		} else {
			this.logger.debug('No existing dataset found!')
		}
		return { renamedBidsDatasets, renamedGroupBidsDatasets }
	}

	/**
	 * This function handles the deletion of BIDS datasets
	 * @param owner user ID
	 * @returns list of deleted BIDS datasets
	 */
	private async handleBidsDatasetsDeleted(owner: string) {
		let deletedBidsDatasets: { index: any; id: any }[] = []
		// rerun search for dataset with updated path
		const searchQueryOpts: SearchBidsDatasetsQueryOptsDto = {
			owner,
			textQuery: undefined,
			filterPaths: false,
			ageRange: undefined,
			participantsCountRange: undefined,
			datatypes: undefined,
			page: undefined,
			nbOfResults: undefined
		}
		const searchIndexedResults = await this.searchBidsDatasets(searchQueryOpts)
		// extract absolute path of each dataset
		const foundIndexedDatasetPaths = searchIndexedResults.map(
			dataset => dataset._source.Path
		)
		if (foundIndexedDatasetPaths.length > 0) {
			// find all datasets that are indexed but for which the path does not exist anymore
			const deletedBidsDatasetPaths = foundIndexedDatasetPaths.map(absPath => {
				if (!fs.existsSync(absPath)) return absPath
			})
			// filter null
			const filteredDeletedBidsDatasetPaths = deletedBidsDatasetPaths.flatMap(
				f => (f ? [f] : [])
			)
			if (filteredDeletedBidsDatasetPaths.length > 0) {
				this.logger.debug(
					'Deleting index for the following unexisting paths:',
					{ filteredDeletedBidsDatasetPaths }
				)
				deletedBidsDatasets = await this.deleteBIDSDatasets(
					owner,
					filteredDeletedBidsDatasetPaths
				)
			}
		}
		return deletedBidsDatasets
	}

	/**
	 * This function handles the indexing of new duplicated datasets.
	 * @param owner user ID
	 * @param foundDatasetPaths  list of absolute paths of the datasets found
	 * @param foundDuplicatedDatasetPaths  list of absolute paths of the duplicated datasets found
	 * @param groupFolders  list of group folders
	 * @returns  list of indexed dataset duplicates
	 */
	private async handleBidsDatasetDuplicates(
		owner: string,
		foundDatasetPaths: string[],
		foundDuplicatedDatasetPaths: string[],
		groupFolders: GroupFolder[]
	) {
		let duplicatedBidsDatasets: BIDSDataset[] = []
		if (foundDatasetPaths.length > 0) {
			this.logger.debug('Handle indexing of new duplicated datasets...')
			// extract datasets that are not indexed and return separately the lists
			// of datasets contained in the user private space and the user group
			const { foundPrivateDatasetsDuplicated, foundGroupDatasetsDuplicated } =
				this.extractAndSplitPrivateGroupDatasetsDuplicated(
					foundDuplicatedDatasetPaths,
					groupFolders
				)
			this.logger.debug('Detected new duplicated datasets in user group:', {
				foundGroupDatasetsDuplicated
			})
			// generate and index content of every new dataset copy
			if (foundPrivateDatasetsDuplicated.length > 0) {
				this.logger.warn(
					'Add the following new duplicated dataset to the index:'
				)
				this.logger.debug({ foundPrivateDatasetsDuplicated })
				duplicatedBidsDatasets = await this.addNewBIDSDatasetIndexedContents(
					owner,
					foundPrivateDatasetsDuplicated
				)
			}
		} else {
			this.logger.debug('No existing dataset found!')
		}
		return duplicatedBidsDatasets
	}

	/**
	 * This function is used to get the relative path of a dataset
	 * @param absPath absolute path of a dataset
	 * @returns relative path of a dataset
	 */
	public getRelativePath(absPath: string): string {
		return absPath
			?.replace(/mnt\/nextcloud-dp\/nextcloud\/data\/.*?\/files\//, '')
			.replace(
				/\/mnt\/nextcloud-dp\/nextcloud\/data\/__groupfolders\/.*?\//,
				'/groupfolder/'
			)
	}

	/**
	 * This function is used to refresh the indexing of BIDS datasets
	 * @param owner user id
	 * @param param1 cookie and requesttoken
	 * @returns Set of lists of added, renamed and deleted datasets
	 */
	public async refreshBIDSDatasetsIndex(
		owner: string,
		{ cookie, requesttoken }: any
	) {
		// TODO: Index shared datasets appearing in both private and group folders
		try {
			// make all the files are discovered by nextcloud
			await this.nextcloudService.scanUserFiles(owner)
			// 1. Get list of existing datasets and the list of indexed dataset ids
			// get list of BIDS datasets (folder name) present in the file system (accessible by user)
			const s = await this.search(cookie, PARTICIPANTS_FILE)
			const searchDatasetsResults = s?.entries

			// get the list of datasets already indexed in the root of the user private space
			// let searchIndexedResults = await this.searchBidsDatasets(owner)

			// extract lists of (1) all found dataset paths, (2) dataset IDs with corresponding path,
			// (3) dataset IDs with corresponding name but with changed path
			const {
				foundDatasets,
				foundDatasetPaths,
				foundDatasetIDs,
				foundRenamedDatasetIDs
				//				foundDuplicatedDatasetPaths,
			} = await this.parseSearchDatasetsResultsForRefresh(
				owner,
				searchDatasetsResults
			)

			// get list of group folders to later differentiate datasets contained in a group folder
			const groupFolders = await this.nextcloudService.groupFoldersForUserId(
				owner
			)

			// 2. handle indexing of datasets not already indexed
			const { addedBidsDatasets, addedGroupBidsDatasets } =
				await this.handleBidsDatasetsNotIndexed(
					owner,
					foundDatasets,
					foundDatasetPaths,
					foundDatasetIDs,
					foundRenamedDatasetIDs,
					groupFolders
				)

			// 3. handle indexing of dataset duplicates not indexed
			// const { duplicatedBidsDatasets } = handleBidsDatasetDuplicates(
			// 	owner,
			// 	foundDatasetPaths,
			// 	foundDuplicatedDatasetPaths,
			// 	groupFolders
			// )

			// 4. handle reindexing of datasets for which the path changed
			const { renamedBidsDatasets, renamedGroupBidsDatasets } =
				await this.handleBidsDatasetsRenamed(
					owner,
					foundDatasetPaths,
					foundRenamedDatasetIDs,
					groupFolders
				)

			// 5. delete any indexed dataset that does not exist anymore
			const deletedBIDSDatasets = await this.handleBidsDatasetsDeleted(owner)

			// 6. remove "Path" in dataset objects returned to the frontend
			if (addedBidsDatasets && addedBidsDatasets.length > 0) {
				addedBidsDatasets.forEach((ds: BIDSDataset, index: number) => {
					if (ds && ds.hasOwnProperty('Path')) {
						addedBidsDatasets[index].Path = this.getRelativePath(
							addedBidsDatasets[index].Path
						)
					}
				})
			}
			if (renamedBidsDatasets && renamedBidsDatasets.length > 0) {
				renamedBidsDatasets.forEach((ds: BIDSDataset, index: number) => {
					if (ds && ds.hasOwnProperty('Path')) {
						renamedBidsDatasets[index].Path = this.getRelativePath(
							renamedBidsDatasets[index].Path
						)
					}
				})
			}
			return { addedBidsDatasets, renamedBidsDatasets, deletedBIDSDatasets }
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	/**
	 * This function creates the index employed to store BIDS datasets using elasticsearch indices.create API
	 * @returns  {Promise<any>} Promise object represents the response of the elasticsearch indices.create API
	 */
	public async createBIDSDatasetsIndex() {
		try {
			// create index for datasets if not existing
			const exists = await this.elastic_client.indices.exists({
				index: this.es_index_datasets
			})

			if (exists.body === false) {
				try {
					const create = await this.elastic_client.indices.create({
						index: this.es_index_datasets,
						body: {
							mappings
						}
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

	/**
	 * This function deletes the index for datasets using the elasticsearch delete index API
	 * @returns  {Promise<any>} Promise object represents the body response from the elasticsearch indices.delete API
	 */
	public async deleteBIDSDatasetsIndex() {
		try {
			// delete index for datasets only if it exists
			const exists = await this.elastic_client.indices.exists({
				index: this.es_index_datasets
			})

			if (exists.body === true) {
				try {
					const del = await this.elastic_client.indices.delete({
						index: this.es_index_datasets
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

	/**
	 * This function indexes a BIDS dataset using the elasticsearch index API
	 * @param owner user owner of the dataset (user id)
	 * @param path relative path of the dataset
	 * @param id id of the dataset
	 * @returns {Promise<BIDSDataset>} Promise object represents the indexed BIDS dataset
	 */
	public async indexBIDSDataset(owner: string, path: string, id: string) {
		try {
			// get a list of dataset indexed content
			const bidsGetDatasetDto = new BidsGetDatasetDto()
			bidsGetDatasetDto.owner = owner
			bidsGetDatasetDto.path = path

			// get abosolute path of the dataset
			const dsPath = await this.filePath(path, owner)

			const bidsDataset = await this.createDatasetIndexedContent(
				bidsGetDatasetDto
			)

			// find if the dataset is already indexed
			const datasetPathQuery = `Path:"${dsPath}"`
			const datasetPathQueryOpts: SearchBidsDatasetsQueryOptsDto = {
				owner,
				textQuery: datasetPathQuery,
				filterPaths: false,
				ageRange: undefined,
				participantsCountRange: undefined,
				datatypes: undefined,
				page: undefined,
				nbOfResults: undefined
			}
			const searchResults = await this.searchBidsDatasets(datasetPathQueryOpts)
			if (searchResults.length > 0) {
				const currentDataset = searchResults[0]
				this.logger.debug('Update a currently indexed dataset')
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
				// autogenerate dataset id if needed
				if (id) {
					bidsDataset.id = id
				} else {
					const { datasetId } = await this.generateDatasetId(owner)
					bidsDataset.id = datasetId
				}
				bidsDataset.version = 1
			}
			bidsDataset.Path = await this.filePath(path, owner)

			// create and send elasticsearch bulk to index the dataset
			await this.sendElasticSearchDatasetsBulk([bidsDataset])

			bidsDataset.Path = this.getRelativePath(bidsDataset.Path)

			return bidsDataset
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	/**
	 * This function deletes a dataset from the index using elasticsearch delete API
	 * @param owner user id
	 * @param path relative path to the dataset
	 * @returns	deleted dataset
	 */
	public async deleteBIDSDataset(owner: string, path: string) {
		try {
			// get abosolute path of the dataset
			const dsPath = await this.filePath(path, owner)
			// find the dataset index to be deleted
			const datasetPathQuery = `Path:"${dsPath}"`
			const datasetPathQueryOpts: SearchBidsDatasetsQueryOptsDto = {
				owner,
				textQuery: datasetPathQuery,
				filterPaths: true,
				ageRange: undefined,
				participantsCountRange: undefined,
				datatypes: undefined,
				page: undefined,
				nbOfResults: undefined
			}
			const searchResults = await this.searchBidsDatasets(datasetPathQueryOpts)
			if (searchResults.length > 0) {
				const dataset = searchResults[0]
				// delete the document with id related to the dataset
				const datasetID = {
					index: dataset._index,
					id: dataset._id
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

	/**
	 * This function is used to delete multiple BIDS datasets using elasticsearch delete API
	 * @param owner user id
	 * @param paths paths of the datasets to be deleted
	 * @returns deleted datasets
	 */
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

	/**
	 * This function is used to filter the datasets found by elasticsearch and accessible by the user
	 * @param owner user id
	 * @param foundDatasets datasets found by elasticsearch
	 * @returns datasets accessible by the user
	 */
	private async filterBidsDatasetsAccessibleByUser(
		owner: string,
		foundDatasets: any[]
	) {
		// get user group folder names
		const ownerGroups = await this.nextcloudService.groupFoldersForUserId(owner)
		// filter only private datasets own by the user
		let foundAccessibleDatasets = []
		foundDatasets.forEach(dataset => {
			if (dataset._id.includes(`${owner}_`)) {
				foundAccessibleDatasets.push(dataset)
			} else {
				for (let ownerGroup of ownerGroups) {
					if (dataset._id.includes(`${ownerGroup.label}_`)) {
						foundAccessibleDatasets.push(dataset)
					}
				}
			}
		})
		return foundAccessibleDatasets
	}

	/**
	 * This function is used to search for datasets in elasticsearch
	 * @param param0	SearchBidsDatasetsQueryOptsDto
	 * @param param0.owner	owner of the dataset
	 * @param param0.textQuery	text query to search for
	 * @param param0.filterPaths	whether to filter the paths or not
	 * @param param0.ageRange	age range of the dataset
	 * @param param0.participantsCountRange	participants count range of the dataset
	 * @param param0.datatypes	datatypes of the dataset
	 * @param param0.page	page number
	 * @param param0.nbOfResults	number of results per page
	 * @returns  an array of datasets
	 */
	public async searchBidsDatasets({
		owner = 'all',
		textQuery = '*',
		filterPaths = false,
		ageRange = [0, 100],
		participantsCountRange = [0, 200],
		datatypes = ['*'],
		page = 1,
		nbOfResults = 200
	}: SearchBidsDatasetsQueryOptsDto) {
		try {
			// determine index to start based on pagination
			const indexFrom = (page - 1) * nbOfResults
			// define the elastic search query
			let queryObj: {} = {
				bool: {
					must: [
						{
							query_string: {
								query: textQuery,
								allow_leading_wildcard: true,
								analyze_wildcard: true
							}
						},
						{
							bool: {
								should: [
									{
										range: {
											AgeMin: { gte: ageRange[0] }
										}
									},
									{
										range: {
											AgeMax: { lte: ageRange[1] }
										}
									},
									{
										bool: {
											must_not: [
												{
													exists: {
														field: 'AgeMin'
													}
												},
												{
													exists: {
														field: 'AgeMax'
													}
												}
											]
										}
									}
								]
							}
						},
						{
							range: {
								ParticipantsCount: { gte: participantsCountRange[0] }
							}
						}
					]
				}
			}

			// add upper bound limit on ParticipantsCount only if it is less than 200
			if (participantsCountRange[1] < 200) {
				queryObj['bool']['must'].push({
					range: {
						ParticipantsCount: {
							lte: participantsCountRange[1]
						}
					}
				})
			}

			// add terms query only if a non empty list of datatypes is provided
			if (
				datatypes.length > 0 &&
				!datatypes.includes('*') &&
				!datatypes.includes('')
			) {
				queryObj['bool']['must'].push({
					terms: {
						DataTypes: datatypes
					}
				})
			}
			// define search query in JSON format expected by elasticsearch
			const query_params: RequestParams.Search = {
				index: `${this.es_index_datasets}`,
				body: {
					from: indexFrom,
					size: nbOfResults,
					query: queryObj
				}
			}
			// perform and return the search query
			const foundDatasets = await this.elastic_client
				.search(query_params)
				.then((result: ApiResponse) => {
					// remove "Path" in dataset objects returned to the frontend
					if (
						filterPaths &&
						result.body.hits.hits &&
						result.body.hits.hits.length > 0
					) {
						result.body.hits.hits.forEach((ds, index: number) => {
							if (ds && ds['_source'].hasOwnProperty('Path')) {
								result.body.hits.hits[index]['_source']['Path'] =
									this.getRelativePath(
										result.body.hits.hits[index]['_source']['Path']
									)
							}
						})
					}
					return result.body.hits.hits
				})

			if (owner !== 'all') {
				// filter only datasets accessible by the user
				return await this.filterBidsDatasetsAccessibleByUser(
					owner,
					foundDatasets
				)
			} else {
				return foundDatasets
			}
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	/**
	 * This function is used to search the bids datasets using the elasticsearch msearch API
	 * @param textQuery 		- array of query strings to search in the datasets
	 * @returns 				- array of datasets matching each search query of the array
	 */
	public async multiSearchBidsDatasets(textQuery: string[] = ['*']) {
		try {
			// create body of query for elasticsearch msearch to search the datasets
			const queryObj = textQuery.map((_value, index) => {
				return {
					query_string: {
						query: textQuery[index],
						allow_leading_wildcard: true,
						analyze_wildcard: true
					}
				}
			})
			const body =
				Array.isArray(queryObj) &&
				queryObj.flatMap(query => [
					{ index: `${this.es_index_datasets}` },
					{ query: query }
				])
			// define msearch query in JSON format expected by elasticsearch
			const query_params: RequestParams.Msearch = {
				index: `${this.es_index_datasets}`,
				body: body
			}
			// perform and return the msearch query
			return await this.elastic_client
				.msearch(query_params)
				.then((result: ApiResponse) => {
					return result.body.responses.map(response => {
						return response.hits.hits
					})
				})
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	/**
	 * This function is used to get the number of datasets indexed in elasticsearch
	 * @returns - number of datasets in the elasticsearch index
	 */
	public async getDatasetsCount() {
		// define count query in JSON format expected by elasticsearch
		const count_params: RequestParams.Count = {
			index: `${this.es_index_datasets}`,
			body: {
				// you can count based on specific query or remove body at all
				query: { match_all: {} }
			}
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

	/**
	 * Generate dataset id string given the dataset id number
	 * @param id dataset id number e.g. 000001
	 * @param begin prefix to use in the dataset id e.g. userID in userID_000001
	 * @param size number of digits to use in the dataset id e.g. 6 in userID_000001
	 * @returns dataset id e.g. userID_000001
	 */
	private createDatasetIdString(
		id: number,
		begin: string,
		size: number
	): string {
		let datasetId: string = id.toString()
		while (datasetId.length < size) datasetId = '0' + datasetId
		datasetId = begin + datasetId
		return datasetId
	}

	/**
	 * Generate dataset id and dataset id number that is not already used
	 * @param owner user id
	 * @param datasetIdNum dataset id number
	 * @returns final dataset id and dataset id number
	 */
	public async generateDatasetId(owner: string, datasetIdNum: number = null) {
		try {
			// get number of datasets indexed in elasticsearch
			const nbOfDatasets = await this.getDatasetsCount()

			let searchIndexedResults = []
			let datasetIDs = []
			if (nbOfDatasets > 0) {
				// get a list of dataset ids (<=> folder name) already indexed
				const searchAllQueryOpts: SearchBidsDatasetsQueryOptsDto = {
					owner: 'all',
					textQuery: undefined,
					filterPaths: false,
					ageRange: undefined,
					participantsCountRange: undefined,
					datatypes: undefined,
					page: undefined,
					nbOfResults: undefined
				}
				searchIndexedResults = await this.searchBidsDatasets(searchAllQueryOpts)
				// extract ids of indexed datasets
				datasetIDs = searchIndexedResults.map(dataset => dataset._id)
			}

			// generate a first if using either the provided initial value or
			// the # of indexed datasets + 1
			datasetIdNum = datasetIdNum ? datasetIdNum : nbOfDatasets + 1
			let datasetId: string = this.createDatasetIdString(
				datasetIdNum,
				`${owner}_ds`,
				6
			)

			// test if the first autogenerated dataset id exists
			// if not, it increments until it find a new id that
			// does not exist
			while (true) {
				this.logger.debug({ datasetId })
				if (datasetIDs.length === 0 || !datasetIDs.includes(datasetId)) {
					this.logger.debug('Id does not exist yet and is returned!')
					break
				} else {
					this.logger.debug('Id does exist and being incremented...')
					datasetIdNum += 1
					datasetId = this.createDatasetIdString(datasetIdNum, `${owner}_ds`, 6)
				}
			}
			return { datasetId, datasetIdNum }
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status || HttpStatus.BAD_REQUEST)
		}
	}

	/**
	 * Create a new BIDS dataset via the BIDS tools
	 * @param createBidsDatasetDto CreateBidsDatasetDto
	 * @returns CreateBidsDatasetDto
	 */
	public async createBidsDataset(createBidsDatasetDto: CreateBidsDatasetDto) {
		const { owner, parent_path } = createBidsDatasetDto
		const uniquId = Math.round(Date.now() + Math.random())
		const tmpDir = `/tmp/${uniquId}`

		try {
			// Generate dataset's id and containing directory name
			const { datasetId } = await this.generateDatasetId(owner)
			createBidsDatasetDto.dataset_dirname = datasetId.split('_')[1]
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
				`${dsParentPath}:/output`
			]
			const cmd2 = [
				'bids-tools',
				this.dataUser,
				this.dataUserId,
				'--command=dataset.create',
				'--input_data=/input/dataset.create.json'
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
					datasetId
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

	/**
	 * Get the subject's information such as the number of sessions, runs, etc. via the BIDS tools
	 * @param bidsGetSubjectDto BidsGetSubjectDto
	 * @returns Object that contains the subject's information such as the number of sessions, runs, etc.
	 */
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
				'--output_file=/input/sub_info.json'
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

	/**
	 * Import new files for a given subject in a BIDS dataset via the BIDS tools
	 * @param createSubject CreateSubjectDto
	 * @returns Object that contains all information about the file imports
	 */
	public async importSubject(createSubject: CreateSubjectDto) {
		const { owner, dataset_path } = createSubject
		const uniquId = Math.round(Date.now() + Math.random())
		const tmpDir = `/tmp/${uniquId}`
		// get absolute path of the dataset
		const dbPath = await this.filePath(dataset_path, owner)
		try {
			// retrieve the index used for the dataset
			const datasetPathQuery = `Path:"${dbPath}"`
			const datasetPathQueryOpts: SearchBidsDatasetsQueryOptsDto = {
				owner,
				textQuery: datasetPathQuery,
				filterPaths: false,
				ageRange: undefined,
				participantsCountRange: undefined,
				datatypes: undefined,
				page: undefined,
				nbOfResults: undefined
			}
			const searchResults = await this.searchBidsDatasets(datasetPathQueryOpts)
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
					path: pathes[i]
				}))
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
				'-v',
				`${tmpDir}:/import-data`,
				...volumes,
				'-v',
				`${dbPath}:/output`,
				// '-v',  // 2 lines can be uncommented to debug interaction with BIDS manager
				// '/home/stourbie/Softwares/bidsificator/bids_manager:/usr/local/lib/python3.8/dist-packages/bids_manager-0.3.2-py3.8.egg/bids_manager',
				'bids-tools',
				this.dataUser,
				this.dataUserId,
				'--command=sub.import',
				'--input_data=/import-data/sub.import.json'
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
				await this.indexBIDSDataset(owner, dataset_path, datasetID)
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

	/**
	 * Run the BIDS validator on a given BIDS dataset
	 * @param dbPath Absolute path to the BIDS dataset
	 * @returns True if the BIDS dataset is valid
	 */
	private async bidsValidate(dbPath: string) {
		// docker run -ti --rm -v /path/to/data:/data:ro bids/validator /data
		const dockerParams = [
			'run',
			'-v',
			`${dbPath}:/output`,
			'bids/validator',
			'/data'
		]

		return this.spawnable('docker', dockerParams)
	}

	/**
	 * Edit the clinical data of a given subject in a BIDS dataset (Row of the participants.tsv file)
	 * @param editSubjectClinicalDto  EditSubjectClinicalDto object
	 * @returns EditSubjectClinicalDto object
	 */
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
				`${dbPath}:/output`
			]
			const cmd2 = [
				'bids-tools',
				this.dataUser,
				this.dataUserId,
				'--command=sub.edit.clinical',
				'--input_data=/import-data/sub_edit_clinical.json'
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

	/**
	 * TODO: To be completed
	 * @param path
	 * @param param1
	 * @returns
	 */
	public async participants(path: string, { cookie }: any) {
		const nextPath = `${path}${PARTICIPANTS_FILE}`

		return this.participantsWithPath(nextPath, cookie)
	}

	/**
	 * Generate a list of Participant JSON objects from a participants.tsv file
	 * @param path path to the participants.tsv file
	 * @param cookie cookie
	 * @returns Participant[]
	 */
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
					)
				],
				[]
			)

			return participants
		} catch (e) {
			this.logger.error(e)
			throw new HttpException(e.message, e.status)
		}
	}

	/**
	 * A public method that is used to create / update participants.[tsv|json] files
	 * of a BIDS dataset.
	 * @param owner user id
	 * @param datasetPath path to the BIDS dataset
	 * @param createBidsDatasetParticipantsTsvDto CreateBidsDatasetParticipantsTsvDto object
	 * @returns CreateBidsDatasetParticipantsTsvDto object
	 * */
	public async writeBIDSDatasetParticipantsTSV(
		owner: string,
		datasetPath: string,
		createBidsDatasetParticipantsTsvDto: CreateBidsDatasetParticipantsTsvDto
	) {
		try {
			// convert array of Participant object to TSV formatted string by using the
			// map function without any framework
			let participantObjects = createBidsDatasetParticipantsTsvDto.Participants
			// extract the keys from the Participant objects and use them to create the header row
			const keys = new Set<string>()
			for (const participantObject of participantObjects) {
				for (const key of Object.keys(participantObject)) {
					keys.add(key)
				}
			}
			const headerRow = Array.from(keys)
			// create a write stream for the TSV file
			const absDatasetPath = await this.filePath(datasetPath.slice(1), owner)
			const tsvFilepath = path.join(absDatasetPath, PARTICIPANTS_FILE)
			const tsvStream = fs.createWriteStream(tsvFilepath)
			// write the header row to the stream
			tsvStream.write(`${headerRow.join('\t')}\n`)
			// loop through the array of Participant objects and write each row to the stream
			for (const participantObject of participantObjects) {
				const row = headerRow.map(key => participantObject[key] || 'n/a')
				tsvStream.write(`${row.join('\t')}\n`)
			}
			// Close the stream
			tsvStream.end()
			this.logger.debug(`${tsvFilepath} has been successfully written!`)
			// this.logger.debug({ participantsTSVString })
			this.logger.debug('(Re-)index dataset...')
			const bidsDataset = await this.indexBIDSDataset(
				owner,
				datasetPath,
				undefined
			)
			this.logger.debug(bidsDataset.id)
		} catch (error) {
			throw new Error(error)
		}
	}

	/**
	 * Search for a term in the Nextcloud instance.
	 * @param cookie cookie
	 * @param term search term
	 * @returns matched search results
	 */
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

	/**
	 * This method is used to run a command like docker run in a child process.
	 * @param command command to be executed
	 * @param args arguments to be passed to the command
	 * @returns Promise<{ code: number; message?: string }>
	 */
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
				//message += data.toString()
			})

			child.on('error', data => {
				message += data.toString()
			})

			child.on('close', code => {
				resolve({ code, message })
			})
		})
	}

	/**
	 * Retrieve the JSON content of a dataset
	 * @param path path to the dataset
	 * @param cookie cookie
	 * @returns Dataset JSON content
	 */
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
	 * @param {any} headers - this is the headers that you need to pass to the webdav server.
	 * @returns - the file content
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
			const dsPath = await this.filePath(path, owner)

			const cmd1 = ['run', '-v', `${tmpDir}:/input`, '-v', `${dsPath}:/output`]
			const cmd2 = [
				'bids-tools',
				this.dataUser,
				this.dataUserId,
				'--command=dataset.get',
				'--input_data=/input/dataset_get.json',
				'--output_file=/input/dataset_info.json'
			]

			const command =
				process.env.NODE_ENV === 'development' && editScriptCmd !== undefined
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
	 * @returns - the file content
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
					path: pathes[i]
				}))
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
				'--output_file=/input/datasets_info.json'
			]

			const command =
				process.env.NODE_ENV === 'development' && editScriptCmd !== undefined
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
	 * @param {any} headers - this is the headers that you need to pass to the webdav server.
	 * @returns - the file content
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

	/**
	 * A private method that is used to get the file path, either user based or for a group
	 * @param {string} path - the path to the file you want to get
	 * @param {string} userId - the user id
	 * */
	private async filePath(path: string, userId: string) {
		try {
			// Remove the first slash
			path = path.replace(/^\//, '')
			// Get the root path
			let rootPath = path.split('/')[0]
			// Get the id of the group folder
			const groupFolders = await this.nextcloudService.groupFoldersForUserId(
				userId
			)
			const id = groupFolders.find(g => g.label === rootPath)?.id
			rootPath = rootPath + '/'
			// Create the path depending on whether it's a group folder or not
			const nextPath = id
				? `${
						process.env.PRIVATE_FILESYSTEM
				  }/__groupfolders/${id}/${path.replace(rootPath, '')}`
				: `${process.env.PRIVATE_FILESYSTEM}/${userId}/files/${path}`

			return nextPath
		} catch (error) {
			this.logger.error(error)
			throw new InternalServerErrorException(
				"Couldn't find a path for the file"
			)
		}
	}

	/**
	 * A private method that is used to read a JSON file and parse its content
	 * @param {string} path - the path to the json file you want to read
	 * */
	private async readJsonFile(path: string) {
		return JSON.parse(fs.readFileSync(path))
	}
}
