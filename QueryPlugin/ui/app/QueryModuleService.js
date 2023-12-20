class QueryModuleService {
    constructor($http, $log) {
        this.$http = $http;
        this.$log = $log;
    }

    getConfiguration() {
        let PAGE_CONFIG_URL = PluginHelper.getPluginRestUrl('IDWQueryPlugin/configuration');
        return this.$http.get(PAGE_CONFIG_URL).then(
            // Success
            (response) => {
                this.$log.debug(response.data)
                return response.data;
            }
        );
    }

    enumerateDatabase(type, application) {
        let PAGE_CONFIG_URL = PluginHelper.getPluginRestUrl('IDWQueryPlugin/enumerate/database');
        let data = {
            type: type,
            application: (application || "")
        }

        return this.$http.post(PAGE_CONFIG_URL, data).then(
            // Success
            (response) => {
                this.$log.debug(response.data)
                return response.data;
            },
            (failure) => {
                this.$log.error(failure)
                return {}
            }
        );
    }

    enumerateTables(type, application) {
        let PAGE_CONFIG_URL = PluginHelper.getPluginRestUrl('IDWQueryPlugin/enumerate/tables');
        let data = {
            type: type,
            application: (application || "")
        }

        return this.$http.post(PAGE_CONFIG_URL, data).then(
            // Success
            (response) => {
                this.$log.debug(response.data)
                return response.data;
            }
        );
    }


    loadFilter(type, name) {
        if (name && type) {
            let PAGE_CONFIG_URL = PluginHelper.getPluginRestUrl('IDWQueryPlugin/filter/load');
            let config = {
                params: {
                    type: type,
                    name: name
                }
            }
            // TODO: Handle error output here
            return this.$http.get(PAGE_CONFIG_URL, config).then(
                // Success
                (response) => {
                    this.$log.debug(response.data)
                    return response.data;
                }
            );
        } else {
            throw "Name and type are required"
        }
    }

    loadFilterOptions(type) {
        if (type) {
            let PAGE_CONFIG_URL = PluginHelper.getPluginRestUrl('IDWQueryPlugin/filter/load');
            let config = {
                params: {
                    type: type,
                    options: true
                }
            }
            // TODO: Handle error output here
            return this.$http.get(PAGE_CONFIG_URL, config).then(
                // Success
                (response) => {
                    this.$log.debug(response.data)
                    return response.data;
                }
            );
        }
    }

    translateFilter(query, queryClass) {
        if (query && queryClass) {
            let PAGE_CONFIG_URL = PluginHelper.getPluginRestUrl('IDWQueryPlugin/filter/translate');
            let config = {
                params: {
                    queryClass: queryClass,
                    query: query
                }
            }
            // TODO: Handle error output here
            return this.$http.get(PAGE_CONFIG_URL, config).then(
                // Success
                (response) => {
                    this.$log.debug(response.data)
                    return response.data;
                }
            );
        }
    }

    translateHql(query) {
        if (query) {
            let PAGE_CONFIG_URL = PluginHelper.getPluginRestUrl('IDWQueryPlugin/hql/translate');
            let config = {
                params: {
                    query: query
                }
            }
            // TODO: Handle error output here
            return this.$http.get(PAGE_CONFIG_URL, config).then(
                // Success
                (response) => {
                    this.$log.debug(response.data)
                    return response.data;
                }
            );
        }
    }

    /**
     * Retrieves the history from the plugin service
     * @returns History data in obj["history"] or an error in obj["error"]
     */
    runQuery(query, type, limitResults, queryClass, application) {
        if (query) {
            let PAGE_CONFIG_URL = PluginHelper.getPluginRestUrl('IDWQueryPlugin/query?limit=' + limitResults);

            let data = {
                query: query,
                type: type,
                queryClass: queryClass,
                application: (application || "")
            }

            // TODO: Handle error output here
            return this.$http.post(PAGE_CONFIG_URL, data).then(
                // Success
                (response) => {
                    this.$log.debug(response.data)
                    return response.data;
                }
            );
        }
    }
}


/**
 * Services that handles functionality around the page configuration.
 */
queryModule.service('queryModuleService', ['$http', '$log', QueryModuleService])
