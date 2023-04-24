# Human Intracerebral EEG Platform - Gateway
## Overview
The HIP is a platform for processing and sharing Human intracerebral EEG data  
[More...](https://www.humanbrainproject.eu/en/medicine/human-intracerebral-eeg-platform/)

This service is part of the HIP infrastructure and runs a gateway between all different services. It also communicate directly with the [HIP Frontend](https://github.com/HIP-infrastructure/hip).  

The main frontend deployment service is [Nextcloud docker](https://github.com/HIP-infrastructure/nextcloud-docker).
While the backend service for remote apps is the [App in Browser](https://github.com/HIP-infrastructure/app-in-browser)


## Requirements
- npm 9.2.0
- node v16.16.0

## Development - Getting Started

1. See [HIP Frontend](https://github.com/HIP-infrastructure/hip) for the initial setup
2. Once the above step completed, you can `cd gateway`
3. You changes will be reloaded immediately
4. You can interact with the stack through docker-compose on the upper level folder. 
5. `docker-compose logs -f gateway`

## Publishing. 
`docker build 
    -e REMOTE_APP_API=${REMOTE_APP_API} \
    -e REMOTE_APP_BASIC_AUTH=${REMOTE_APP_BASIC_AUTH} \
    -e PRIVATE_WEBDAV_URL=${PRIVATE_WEBDAV_URL} \
    .`

