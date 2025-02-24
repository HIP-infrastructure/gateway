export class BidsDataset {
	id: string
	owner: string
	dataset: string
	DatasetDescJSON: {
		Name: string
		BIDSVersion: string
		License: string
		Authors: string[]
		Acknowledgements: string
		HowToAcknowledge: string
		Funding: string
		ReferencesAndLinks: string
		DatasetDOI: string
	}
}
