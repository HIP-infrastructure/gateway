import { Injectable, Inject, Logger } from '@nestjs/common';
import { AuthType, createClient, FileStat, ResponseDataDetailed, WebDAVClient } from "webdav";


@Injectable()
export class FilesService {
    client: WebDAVClient;

    constructor() {
        this.client = createClient(`${process.env.WEBDAV_URL}/remote.php/dav/files/${process.env.WEBDAV_USERNAME}/`, {
            authType: AuthType.Password,
            username: process.env.WEBDAV_USERNAME,
            password: process.env.WEBDAV_PASSWORD
        });
    }
    private logger = new Logger('AppService');

    getFiles(path): Promise<FileStat[] | ResponseDataDetailed<FileStat[]>> {
        return this.client.getDirectoryContents(path)
    }
}
