import { Injectable, Inject, Logger } from '@nestjs/common';
import { AuthType, createClient, FileStat, ResponseDataDetailed, WebDAVClient } from "webdav";


@Injectable()
export class FilesService {
    client: WebDAVClient;

    constructor() {
        this.client = createClient(`${process.env.COLLAB_WEBDAV_URL}/remote.php/dav/files/${process.env.COLLAB_COLLAB_WEBDAV_USERNAME}/`, {
            authType: AuthType.Password,
            username: process.env.COLLAB_WEBDAV_USERNAME,
            password: process.env.COLLAB_WEBDAV_PASSWORD
        });
    }
    private logger = new Logger('AppService');

    getFiles(path): Promise<FileStat[] | ResponseDataDetailed<FileStat[]>> {
        return this.client.getDirectoryContents(path)
    }
}
