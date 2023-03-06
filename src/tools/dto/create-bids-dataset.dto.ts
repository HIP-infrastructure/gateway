export class CreateBidsDatasetDto {
	readonly owner: string
	readonly parent_path: string
	dataset_dirname: string
	DatasetDescJSON: DatasetDescription
}

export class DatasetDescription {
	readonly Name: string
	readonly BIDSVersion: string
	readonly License: string
	readonly Authors: string[]
	readonly Acknowledgements: string
	readonly HowToAcknowledge: string
	readonly Funding: string
	readonly ReferencesAndLinks: string
	readonly DatasetDOI: string
}
