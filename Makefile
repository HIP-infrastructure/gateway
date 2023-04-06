.DEFAULT_GOAL := help

#install: @ Install all dependencies defined in package.json
install:
	curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash -
	sudo apt-get install -y nodejs
	sudo npm i --location=global @nestjs/cli
	npm install

#build: @ Builds the project
build: install b.clean b.bundle

#b.clean: @ Removes all build artifacts
b.clean:
	rm -rf dist release.tar.gz

#b.bundle: @ Builds the application as a JavaScript bundle
b.bundle:
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
	for pid in $(ps -fu www-data  | grep gateway | awk '{ print $2 }'); do sudo kill -9 $pid; done 

#help:	@ List available tasks on this project
help:
	@grep -E '[a-zA-Z\.\-]+:.*?@ .*$$' $(MAKEFILE_LIST)| tr -d '#'  | awk 'BEGIN {FS = ":.*?@ "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

