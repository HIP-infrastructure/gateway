import { Injectable } from '@nestjs/common'
import { CreateBidsDatabaseDto } from './dto/create-bids-database.dto'

@Injectable()
export class ToolsService {

    getBIDSDatabase() {
        const dbCreate = {
            "owner": "www-data",
            "database": "MY-AMAZING-DB",
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


        const { spawn } = require('child_process')
        const fs = require('fs')

        try {
            fs.writeFileSync('/home/manuel/db_create.json', JSON.stringify(dbCreate))
        } catch (err) {
            console.error(err)
        }


        const child = spawn('docker',
            [
                'run',
                '-v',
                '/home/manuel:/input',
                '-v',
                '/mnt/nextcloud-dp/nextcloud/data/guspuhle/files:/output',
                '-v',
                '/home/manuel/workdir/bids-converter/scripts:/scripts',
                'bids-converter',
                '--command=db.create',
                '--input_data=/input/db_create.json'
            ])

        child.stdout.on('data', (data) => {
            console.log(`child stdout:\n${data}`)
        })

        child.stderr.on('data', (data) => {
            console.error(`child stderr:\n${data}`)
        })

        child.on('error', error => {
            console.log('error', error)
        })

        child.on('close', code => {
            console.log('closed with code', code)
        })


        // docker-compose -f nextcloud-docker/docker-compose.yml exec --user www-data app php occ files:scan --all

    }
    createBIDSDatabase(createBidsDatabaseDto: CreateBidsDatabaseDto) { }
    getSubject() { }
    importSubject() { }
    deleteSubject() { }

}
