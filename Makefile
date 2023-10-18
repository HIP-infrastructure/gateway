.DEFAULT_GOAL := help

require:
	@echo "Checking the programs required for the build are installed..."
	@node --version >/dev/null 2>&1 || (echo "ERROR: node is required."; exit 1)
	@nest --version >/dev/null 2>&1 || (echo "ERROR: nest is required."; exit 1)


#build: @ Builds the project
build: require b.clean b.bundle

#b.clean: @ Removes all build artifacts
b.clean:
	rm -rf dist release.tar.gz

#b.bundle: @ Builds the application as a JavaScript bundle
b.bundle:
	sudo chown -R ${USER}:${USER} "/root/.npm"
	npm install
	npm run build

#release: @ Release on GitHub, tag the application with package version 
release: build r.package
	./release.sh

#r.package: @ Packages the application as a tarball
r.package:
	tar -czvf release.tar.gz -C dist .

#deploy.dev: @ Deploys the application to the development environment
deploy.dev: deploy.dev.stop
	# TODO: prevent the build if no .env
	cp ../.env .env
	sudo chmod 777 .
	sudo chown -R www-data: dist
	npm install
	sudo npm run start:dev

deploy.dev.stop:
	for pid in $(ps -fu root  | grep gateway | awk '{ print $2 }'); do sudo kill -9 $pid; done 

#help:	@ List available tasks on this project
help:
	@grep -E '[a-zA-Z\.\-]+:.*?@ .*$$' $(MAKEFILE_LIST)| tr -d '#'  | awk 'BEGIN {FS = ":.*?@ "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

