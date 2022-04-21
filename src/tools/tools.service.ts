import { Injectable } from '@nestjs/common'
import { CreateBidsDatabaseDto } from './dto/create-bids-database.dto'
var Docker = require('dockerode')

@Injectable()
export class ToolsService {

    dbCreate =  {
        "owner": "${USER}",
        "database": "${DATABASE_NAME}",
        "DatasetDescJSON": {
            "Name": "My New BIDS db",
            "BIDSVersion": "1.4.0",
            "License": "n/a",
            "Authors": [
                "Tom",
                "Jerry"
            ],
            "Acknowledgements": "Overwrite test",
            "HowToAcknowledge": "n/a",
            "Funding": "Picsou",
            "ReferencesAndLinks": "n/a",
            "DatasetDOI": "n/a"
        }
    }


    getBIDSDatabase() {
        const docker = new Docker()
        // docker run -it --rm \
        // -v ${PROJET_TMP_FOLDER}:/input \
        // -v ${PROJET_TMP_FOLDER}:/output \
        // -v ${PROJECT_ROOT}/scripts:/scripts \
        // bids-converter  \
        // --command=db.create \
        // --input_data=/input/db_create.json
    }

    createBIDSDatabase(createBidsDatabaseDto: CreateBidsDatabaseDto) {


    }

    getSubject() { }
    importSubject() { }
    deleteSubject() { }

}
