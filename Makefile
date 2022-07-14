.DEFAULT_GOAL := help

#dep: @ Install all dependencies defined in package.json
dep:
	npm install

#dep.init: @ Install all dependencies for Ubuntu
dep.init:
	curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash -
	sudo apt-get install -y nodejs
	sudo npm i --location=global @nestjs/cli
	sudo npm i --location=global pm2@latest
	pm2 startup systemd
	pm2 save

#build: @ Builds the project
build: dep b.clean b.bundle

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

deploy: build
	# TODO: prevent the build if no .env
	cp ../.env .env
	sudo pm2 start dist/main.js --name hip-gateway --watch

deploy.stop:
	sudo pm2 stop hip-gateway

#deploy.dev: @ Deploys the application to the development environment
deploy.dev: dep
	# TODO: prevent the build if no .env
	cp ../.env .env
	sudo chown -R www-data: dist
	sudo -u www-data -E npm run start:dev	

deploy.dev.stop:
	# TODO: 

#help:	@ List available tasks on this project
help:
	@grep -E '[a-zA-Z\.\-]+:.*?@ .*$$' $(MAKEFILE_LIST)| tr -d '#'  | awk 'BEGIN {FS = ":.*?@ "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

