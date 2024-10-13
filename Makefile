# https://www.gnu.org/software/make/manual/html_node/index.html
.PHONY: no_targets__ all list help help-ci
.DEFAULT_GOAL=help
no_targets__:
list: ## Show all the existing targets of this Makefile
	@sh -c "$(MAKE) -p no_targets__ 2>/dev/null | awk -F':' '/^[a-zA-Z0-9][^\$$#\/\\t=]*:([^=]|$$)/ {split(\$$1,A,/ /);for(i in A)print A[i]}' | grep -v '__\$$' | sort -u"

.PHONY: help
help: ## Show the targets and their description (this screen)
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'


# Ensure bash is used
SHELL=/bin/bash -o pipefail

# setting mandatory default values
MAKEFILE_DIR=$(dir $(realpath $(firstword $(MAKEFILE_LIST))))
JENKINS_WRNG=warnings-ng.jks
BUILD_DIR ?=$(MAKEFILE_DIR)/build
REPORT_DIR ?=$(MAKEFILE_DIR)/reports
RELEASE_DIR ?=$(MAKEFILE_DIR)/build
DOC_DIR ?=$(MAKEFILE_DIR)/build/docs

isRelease ?=false


clean: ## clean the build environment
	gradle clean || true
	gradle --stop || true
	@if [ -d .gradle ]; then rm -r .gradle ; fi
	@if [ -d "${BUILD_DIR}" ] && [ "${BUILD_DIR}" != "/" ]; then rm -r "${BUILD_DIR}" ; fi
	@if [ -d "${REPORT_DIR}" ] && [ "${REPORT_DIR}" != "/" ]; then rm -r "${REPORT_DIR}" ; fi
	@if [ -d "${RELEASE_DIR}" ] && [ "${RELEASE_DIR}" != "/" ]; then rm -r "${RELEASE_DIR}" ; fi


# For the Jenkins pipeline, a warnings-ng.jks file must be create with the name of the java class of the analysis module
# ref : https://github.com/jenkinsci/warnings-ng-plugin/tree/master/plugin/src/main/java/io/jenkins/plugins/analysis/warnings

#.PHONY: test
#test-mytest: ## test the module - syntax: make test REPORT_DIR=/path/to/analysis/logs
#	gradle mytest --warning-mode all --info -DreportDir=$(REPORT_DIR)/mytest
#	echo "MyTest" > $(REPORT_DIR)/$(JENKINS_WRNG)


test-static-pmd-cpd-duplicate: ## code duplicate tests - syntax: make test-static-pmd-cpd-duplicate REPORT_DIR=/path/to/analysis/logs
	/opt/pmd/pmd/bin/run.sh cpd --fail-on-violation false --minimum-tokens 100 --language groovy --format xml --dir $(MAKEFILE_DIR)/src/ > $(REPORT_DIR)/cpd.xml
	echo "Cpd" > $(REPORT_DIR)/$(JENKINS_WRNG)


test-static-codenarc: ## code analysis tests - syntax: make test-static-codenarc REPORT_DIR=/path/to/analysis/logs
	gradle check codenarcMain codenarcTest --warning-mode all --continue -DreportDir=$(REPORT_DIR) --quiet
	echo "CodeNarc" > $(REPORT_DIR)/$(JENKINS_WRNG)


# force build each time instead of checking the "build" directory
.PHONY: build
build: ## build the module - syntax: make build BUILD_DIR=/dir/build  IS_TAG=0|1
	@# notice : "gradle build" will execute all tasks, tests included, while "gradle assemble" will only create the binaries
	gradle assemble --warning-mode all --info -DbuildDir=$(BUILD_DIR) -DisRelease=$(IS_TAG)


docs: ## generate the java/groovy documentation - syntax: make doc BUILD_DIR=/dir/build
	gradle groovydoc  --info -DdocDir=$(DOC_DIR)
