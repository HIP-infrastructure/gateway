# Human Intracerebral EEG Platform - Gateway

## Overview
The HIP is a platform for processing and sharing Human intracerebral EEG data
[More...](https://www.humanbrainproject.eu/en/medicine/human-intracerebral-eeg-platform/)

This service is part of the HIP infrastructure and runs a gateway between all different services. It also communicate directly with the [HIP Frontend][].

The main frontend deployment service is [Nextcloud docker](https://github.com/HIP-infrastructure/nextcloud-docker).
While the backend service for remote apps is the [App in Browser](https://github.com/HIP-infrastructure/app-in-browser).


## Requirements
- node v18+

## Development - Getting Started

1. See [HIP Frontend][] for the initial setup
2. Once the above step completed, you can `cd gateway`
3. You changes will be reloaded immediately
4. You can interact with the stack through docker-compose on the upper level folder.
5. `docker compose logs -f gateway`

## Publishing. 

```console
docker build \
    -e REMOTE_APP_API=${REMOTE_APP_API} \
    -e REMOTE_APP_BASIC_AUTH=${REMOTE_APP_BASIC_AUTH} \
    -e PRIVATE_WEBDAV_URL=${PRIVATE_WEBDAV_URL} \
    .
```


## Acknowledgement

This project has received funding from the  European Union's Horizon Europe research and innovation program under grant agreement No 101147319 and from the Swiss State Secretariat for Education, Research and Innovation (SERI) under contract number 23.00638, as part of the Horizon Europe project “EBRAINS 2.0”.

This research was supported by the EBRAINS research infrastructure, funded from the European Union’s Horizon 2020 Framework Programme for Research and Innovation under the Specific Grant Agreement No. 945539 (Human Brain Project SGA3).

[HIP Frontend]: https://github.com/HIP-infrastructure/hip
