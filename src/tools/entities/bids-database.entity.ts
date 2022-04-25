export class BidsDatabase {
    id: string
    DatasetDescJSON:
        {
            owner: string,
            database: string,
            DatasetDescJSON: {
                Name: string,
                BIDSVersion: string
                License: string,
                Authors: string[],
                Acknowledgements: string,
                HowToAcknowledge: string,
                Funding: string,
                ReferencesAndLinks: string,
                DatasetDOI: string
            }
        }
}