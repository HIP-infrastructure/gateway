.DEFAULT_GOAL := help

include ../.env
export

#dep: @ Install all depencies defined in package.json
dep:
	npm install

#dep.init: @ Install all depencies for Ubuntu
dep.init:
	curl -sL https://deb.nodesource.com/setup_14.x | sudo -E bash -
	sudo apt-get install -y nodejs
	sudo npm i -g @nestjs/cli
	sudo npm install pm2@latest -g
	# pm2 startup systemd
	# pm2 save

#build: @ Builds the project
build: dep b.clean b.bundle

#b.clean: @ Removes all build artifacts
b.clean:
	sudo rm -rf dist release.tar.gz

#b.bundle: @ Builds the application as a JavaScript bundle
b.bundle:
	npm run build -- --NODE_ENV=production

#release: @ Release on GitHub, tag the application with package version 
release: build r.package
	./release.sh

#r.package: @ Packages the application as a tarball
r.package:
	tar -czvf release.tar.gz -C dist .

deploy: build
	cp ../.env .env
	sudo pm2 start dist/main.js --name hip-gateway --watch

deploy.stop:
	sudo pm2 stop hip-gateway

#deploy.dev: @ Deploys the application to the development environment
deploy.dev: dep
	cp ../.env .env
	# sudo -u www-data -E npm run start:dev	
	sudo npm run start:dev	

#help:	@ List available tasks on this project
help:
	@grep -E '[a-zA-Z\.\-]+:.*?@ .*$$' $(MAKEFILE_LIST)| tr -d '#'  | awk 'BEGIN {FS = ":.*?@ "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

